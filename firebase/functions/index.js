/**
 * Cloud Functions backend for ImmoScout Automation licensing.
 *
 * Three HTTP functions, all on Cloud Functions for Firebase v2 (onRequest):
 *
 *   1. paddleWebhook   - Paddle Billing -> Firestore. Verifies the webhook
 *                        signature with the official SDK (paddle.webhooks.unmarshal
 *                        over the RAW body), then upserts licenses/{machineId}.
 *   2. createCheckout  - Creates a Paddle transaction with the correct price_id
 *                        and custom_data:{ machineId }, returns { url } to open
 *                        in the system browser from the Electron app.
 *   3. customerPortal  - Looks up customerId from licenses/{machineId}, mints a
 *                        Paddle customer-portal session, returns { url } (cancel
 *                        deep link when a subscription exists, otherwise overview).
 *
 * Source of truth for entitlement is ALWAYS the signature-verified webhook, never
 * a browser redirect. The desktop app only ever READS licenses/{machineId} via the
 * public Firebase web config + Firestore security rules (see ../firestore.rules).
 *
 * Secrets / params (see ../README or the bottom of this file for CLI setup):
 *   PADDLE_API_KEY        (secret)  - server-side Paddle API key (pdl_...). NEVER shipped.
 *   PADDLE_WEBHOOK_SECRET (secret)  - per-notification-destination signing secret (ntfset...).
 *   PADDLE_ENV            (string)  - "sandbox" | "production". Selects the Paddle environment.
 *   PRICE_MONTHLY         (string)  - Paddle price id for the recurring monthly plan (pri_...).
 *   PRICE_LIFETIME        (string)  - Paddle price id for the one-time lifetime plan (pri_...).
 */

'use strict';

const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret, defineString } = require('firebase-functions/params');
const logger = require('firebase-functions/logger');

const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

const { Paddle, Environment, EventName } = require('@paddle/paddle-node-sdk');

// ---------------------------------------------------------------------------
// Admin SDK / Firestore. initializeApp() with no args uses Application Default
// Credentials inside Functions and BYPASSES all security rules (server SDK).
// ---------------------------------------------------------------------------
initializeApp();
const db = getFirestore();

// ---------------------------------------------------------------------------
// Secrets (Google Cloud Secret Manager) and string params (.env).
// Values are read ONLY at runtime via .value() inside a handler — never at the
// module top level / config time (that would throw during deploy analysis).
// ---------------------------------------------------------------------------
const PADDLE_API_KEY = defineSecret('PADDLE_API_KEY');
const PADDLE_WEBHOOK_SECRET = defineSecret('PADDLE_WEBHOOK_SECRET');

const PADDLE_ENV = defineString('PADDLE_ENV', { default: 'sandbox' });
const PRICE_MONTHLY = defineString('PRICE_MONTHLY');
const PRICE_LIFETIME = defineString('PRICE_LIFETIME');

// Bind the secrets each function needs. Binding is per-function: a secret not
// listed here is `undefined` at runtime even if it exists in Secret Manager.
const WEBHOOK_SECRETS = [PADDLE_WEBHOOK_SECRET, PADDLE_API_KEY];
const API_SECRETS = [PADDLE_API_KEY];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Map the PADDLE_ENV param to the SDK Environment enum.
 * @returns {Environment}
 */
function resolvePaddleEnvironment() {
  return PADDLE_ENV.value() === 'production'
    ? Environment.production
    : Environment.sandbox;
}

/**
 * Build a Paddle client for the current environment using the secret API key.
 * Created per-invocation because .value() is only valid at runtime.
 * @returns {Paddle}
 */
function buildPaddleClient() {
  return new Paddle(PADDLE_API_KEY.value(), {
    environment: resolvePaddleEnvironment(),
  });
}

/**
 * Minimal permissive CORS for the two callable-style HTTP endpoints, which are
 * invoked from the Electron main process (Node http). We answer preflight and
 * echo a wildcard origin; these endpoints carry no cookies/credentials.
 * @returns {boolean} true if the request was a preflight and has been answered.
 */
function applyCors(req, res) {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return true;
  }
  return false;
}

/**
 * Read a request body field from either parsed JSON (req.body) or the query
 * string. Firebase auto-parses JSON for onRequest, so req.body is an object.
 */
function readField(req, key) {
  if (req.body && typeof req.body === 'object' && req.body[key] != null) {
    return req.body[key];
  }
  if (req.query && req.query[key] != null) {
    return req.query[key];
  }
  return undefined;
}

/**
 * The desktop app derives machineId as a lowercase SHA-256 hex string
 * (getStableMachineId in electron/licensing/identity.ts). Enforce that exact
 * shape before using it as a Firestore document id: a value containing '/'
 * would be parsed as a collection/doc PATH, ids matching /^__.*__$/ are
 * reserved and throw, etc. Reject anything that is not 64 hex chars.
 * @param {unknown} m
 * @returns {boolean}
 */
function isValidMachineId(m) {
  return typeof m === 'string' && /^[a-f0-9]{64}$/.test(m);
}

/**
 * Decide which plan a transaction/subscription is for by matching the price ids
 * present in the event against our configured price constants.
 *
 * @param {string[]} priceIds - price ids found on the event's line items.
 * @returns {"monthly"|"lifetime"|"unknown"}
 */
function derivePlanType(priceIds) {
  const monthly = PRICE_MONTHLY.value();
  const lifetime = PRICE_LIFETIME.value();
  if (lifetime && priceIds.includes(lifetime)) return 'lifetime';
  if (monthly && priceIds.includes(monthly)) return 'monthly';
  return 'unknown';
}

/**
 * Collect the price ids referenced by an event's data entity. Works for both
 * transaction entities (data.items[].price.id) and subscription entities
 * (data.items[].price.id). Defensive against missing/renamed fields.
 *
 * @param {any} data - the unmarshalled event entity (camelCased by the SDK).
 * @returns {string[]}
 */
function collectPriceIds(data) {
  const items = Array.isArray(data?.items) ? data.items : [];
  return items
    .map((item) => item?.price?.id || item?.priceId || null)
    .filter(Boolean);
}

/**
 * Normalize a Paddle event/entity into the TWO entitlement states the desktop
 * reader understands (electron/licensing/license.ts normalizeStatus): 'active'
 * | 'expired'. Local expiry is additionally enforced client-side via expiresAt,
 * so "active until period end even after a scheduled cancel" works correctly.
 *
 *   transaction.completed                  -> active (one-time/lifetime or
 *                                             first subscription payment)
 *   subscription.* with status in
 *     [active, trialing, past_due]         -> active (still entitled / grace)
 *   subscription.canceled / paused / other -> expired
 *
 * @param {string} eventType
 * @param {any} data
 * @returns {"active"|"expired"}
 */
function deriveEntitlement(eventType, data) {
  if (eventType === EventName.TransactionCompleted) return 'active';
  if (eventType === EventName.SubscriptionCanceled) return 'expired';
  const s = data?.status; // active | trialing | past_due | paused | canceled
  if (s === 'active' || s === 'trialing' || s === 'past_due') return 'active';
  return 'expired';
}

/**
 * Build the Firestore license document for a Paddle event. CANONICAL shape
 * (must match electron/licensing/firebase.ts LicenseDoc):
 *
 *   licenseStatus: "active" | "expired"
 *   planType:      "monthly" | "lifetime"   (from the configured price ids)
 *   expiresAt:     ISO string for monthly (current period end); null for
 *                  lifetime; OMITTED when unknown so a later partial event
 *                  cannot clobber a previously-correct value.
 *   customerId, customerEmail, subscriptionId, lastEvent, updatedAt
 *
 * @param {string} eventType - the SDK EventName value.
 * @param {any} data         - the unmarshalled event entity (camelCased).
 * @returns {object} fields to merge into licenses/{machineId}.
 */
function buildLicenseFields(eventType, data) {
  const priceIds = collectPriceIds(data);
  const planType = derivePlanType(priceIds);
  if (planType === 'unknown') {
    logger.warn('Could not map price ids to a plan — check PRICE_MONTHLY/PRICE_LIFETIME', {
      eventType,
      priceIds,
    });
  }

  const licenseStatus = deriveEntitlement(eventType, data);

  // customerId is present on both transaction and subscription entities.
  const customerId = data?.customerId || data?.customer_id || null;

  // customerEmail: transactions usually embed it; subscription events rarely do
  // (resolved via a customers.get() fallback in the webhook handler).
  const customerEmail =
    data?.customer?.email || data?.billingDetails?.email || null;

  // subscriptionId: data.id on subscription entities; data.subscriptionId on a
  // transaction that belongs to a subscription.
  const subscriptionId =
    eventType === EventName.SubscriptionCreated ||
    eventType === EventName.SubscriptionUpdated ||
    eventType === EventName.SubscriptionCanceled
      ? data?.id || null
      : data?.subscriptionId || data?.subscription_id || null;

  const fields = {
    licenseStatus,
    planType,
    customerId,
    subscriptionId,
    lastEvent: eventType,
    updatedAt: FieldValue.serverTimestamp(),
  };

  // expiresAt as an ISO string (matches the desktop reader, which runs
  // Date.parse on it). Lifetime => null (never expires). For monthly we only
  // write it when we actually parsed a valid current-period end, so an event
  // missing the field never overwrites a good value with null.
  if (planType === 'lifetime') {
    fields.expiresAt = null;
  } else {
    const periodEnd =
      data?.currentBillingPeriod?.endsAt ||
      data?.current_billing_period?.ends_at ||
      null;
    if (periodEnd) {
      const parsed = Date.parse(periodEnd);
      if (!Number.isNaN(parsed)) fields.expiresAt = new Date(parsed).toISOString();
    }
  }

  // Only write email when we actually have one, so a later event without it
  // does not clobber a previously stored address.
  if (customerEmail) fields.customerEmail = customerEmail;

  return fields;
}

// ===========================================================================
// 1) paddleWebhook — Paddle Billing -> Firestore
// ===========================================================================
exports.paddleWebhook = onRequest(
  { secrets: WEBHOOK_SECRETS, cors: false },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).send('Method Not Allowed');
      return;
    }

    const signature = req.get('paddle-signature') || '';

    // CRITICAL: use the RAW body. firebase-functions v2 exposes the unparsed
    // bytes as req.rawBody (Buffer). Never JSON.parse + re-stringify — any
    // whitespace/ordering change breaks the HMAC signature comparison.
    const rawBody =
      req.rawBody instanceof Buffer
        ? req.rawBody.toString('utf8')
        : typeof req.rawBody === 'string'
          ? req.rawBody
          : '';

    if (!signature || !rawBody) {
      res.status(400).send('Missing signature or body');
      return;
    }

    // The webhooks API only needs the API key for client construction; the
    // signature is verified against the per-destination webhook secret.
    const paddle = buildPaddleClient();
    const webhookSecret = PADDLE_WEBHOOK_SECRET.value();

    let event;
    try {
      // unmarshal verifies HMAC signature + replay timestamp AND parses the
      // event. It is async and throws on any verification failure.
      event = await paddle.webhooks.unmarshal(rawBody, webhookSecret, signature);
    } catch (err) {
      logger.error('Paddle webhook verification failed', err);
      res.status(400).send('Invalid signature');
      return;
    }

    try {
      const eventType = event.eventType;
      const data = event.data || {};

      // Fulfill on a completed transaction (one-time/lifetime + first sub
      // payment) and on ANY subscription lifecycle event (created/updated/
      // canceled/past_due/paused/resumed) — deriveEntitlement maps each to
      // active/expired.
      const handled =
        eventType === EventName.TransactionCompleted ||
        String(eventType).startsWith('subscription.');

      if (!handled) {
        logger.info('Unhandled Paddle event ignored', { eventType });
        // Ack with 200 so Paddle does not retry events we intentionally skip.
        res.status(200).send('ignored');
        return;
      }

      // machineId is the join key we set at checkout via custom_data.
      // SDK exposes it camelCased as data.customData; raw JSON is custom_data.
      const customData = data.customData || data.custom_data || {};
      const machineId = customData.machineId;

      // Validate the shape before using it as a Firestore doc id (a '/' would
      // be parsed as a path, '__x__' is reserved, etc.). Ack 200 so Paddle
      // does not retry a permanently-unprocessable event.
      if (!isValidMachineId(machineId)) {
        logger.warn('Paddle event with missing/invalid custom_data.machineId', {
          eventType,
          id: data.id,
        });
        res.status(200).send('invalid machineId');
        return;
      }

      const fields = buildLicenseFields(eventType, data);

      // customerEmail fallback: subscription events rarely embed the email, so
      // fetch it from the Paddle customer when we have a customerId but no email
      // (requires the API key to have customer read scope). Best-effort.
      if (!fields.customerEmail && fields.customerId) {
        try {
          const customer = await paddle.customers.get(fields.customerId);
          if (customer?.email) fields.customerEmail = customer.email;
        } catch (e) {
          logger.warn('customers.get failed (email left unset)', {
            customerId: fields.customerId,
            error: e instanceof Error ? e.message : String(e),
          });
        }
      }

      // Idempotent upsert keyed by machineId. merge:true so retries / later
      // events (e.g. subscription.updated after subscription.created) layer
      // cleanly without dropping existing fields.
      await db
        .collection('licenses')
        .doc(machineId)
        .set(fields, { merge: true });

      logger.info('License upserted', {
        machineId,
        eventType,
        licenseStatus: fields.licenseStatus,
        planType: fields.planType,
      });

      // 200 fast so Paddle does not retry this delivery.
      res.status(200).send('ok');
    } catch (err) {
      logger.error('Failed to process Paddle webhook', err);
      // 500 lets Paddle retry; our write is idempotent so retries are safe.
      res.status(500).send('processing error');
    }
  },
);

// ===========================================================================
// 2) createCheckout — create a Paddle transaction, return the checkout URL
// ===========================================================================
//
// Request (POST JSON): { "machineId": "<sha256 hash>", "plan": "monthly"|"lifetime" }
// Response:            { "url": "<paddle checkout url>", "transactionId": "txn_..." }
//
// The transaction carries custom_data:{ machineId } server-side, so the
// machineId that reaches the webhook is authoritative and cannot be tampered
// with from the client.
exports.createCheckout = onRequest(
  { secrets: API_SECRETS, cors: false },
  async (req, res) => {
    if (applyCors(req, res)) return;
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method Not Allowed' });
      return;
    }

    const machineId = readField(req, 'machineId');
    const plan = readField(req, 'plan') || 'monthly';

    if (!isValidMachineId(machineId)) {
      res.status(400).json({ error: 'invalid machineId' });
      return;
    }

    const priceId =
      plan === 'lifetime' ? PRICE_LIFETIME.value() : PRICE_MONTHLY.value();

    if (!priceId) {
      logger.error('Price id not configured for plan', { plan });
      res.status(500).json({ error: 'price not configured' });
      return;
    }

    try {
      const paddle = buildPaddleClient();

      const txn = await paddle.transactions.create({
        items: [{ priceId, quantity: 1 }],
        // custom_data must be a JSON object with at least one key. This is the
        // authoritative machineId binding that propagates to the webhook.
        customData: { machineId },
      });

      // txn.checkout.url === <default payment link>?_ptxn=<txn.id>. It is null
      // unless a Default payment link is configured and (for live) the domain
      // is approved.
      const url = txn.checkout?.url;
      if (!url) {
        logger.error('checkout.url is null', { transactionId: txn.id });
        res.status(500).json({
          error:
            'checkout.url is null: configure a Default payment link in Paddle ' +
            '(Checkout > Checkout settings) and verify the domain.',
        });
        return;
      }

      res.status(200).json({ url, transactionId: txn.id });
    } catch (err) {
      logger.error('Failed to create checkout transaction', err);
      res.status(500).json({ error: 'failed to create checkout' });
    }
  },
);

// ===========================================================================
// 3) customerPortal — mint a Paddle customer-portal session for a machineId
// ===========================================================================
//
// Request (POST JSON): { "machineId": "<sha256 hash>" }
// Response:            { "url": "<cancel deep link or portal overview>" }
//
// Looks up the customerId (and subscriptionId, if any) stored on
// licenses/{machineId} by the webhook, then creates a fresh portal session.
// Portal URLs carry a short-lived token and MUST NOT be cached — minted per call.
exports.customerPortal = onRequest(
  { secrets: API_SECRETS, cors: false },
  async (req, res) => {
    if (applyCors(req, res)) return;
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method Not Allowed' });
      return;
    }

    const machineId = readField(req, 'machineId');
    if (!isValidMachineId(machineId)) {
      res.status(400).json({ error: 'invalid machineId' });
      return;
    }

    try {
      const snap = await db.collection('licenses').doc(machineId).get();
      if (!snap.exists) {
        res.status(404).json({ error: 'no license for this machine' });
        return;
      }

      const license = snap.data() || {};
      const customerId = license.customerId;
      if (!customerId) {
        res.status(404).json({ error: 'no customer on file' });
        return;
      }

      // Pass the subscription id (when present) so the session returns a
      // per-subscription cancel deep link. Lifetime purchases have none, so we
      // fall back to the portal overview URL below.
      const subscriptionIds = license.subscriptionId
        ? [license.subscriptionId]
        : [];

      const paddle = buildPaddleClient();

      // SDK signature: create(customerId: string, subscriptionIds: string[]).
      const session = await paddle.customerPortalSessions.create(
        customerId,
        subscriptionIds,
      );

      // Prefer the cancel deep link (German "Kündigungsbutton" / easy-cancel),
      // fall back to the portal overview when there is no subscription.
      const sub = session.urls?.subscriptions?.[0];
      const url =
        sub?.cancelSubscription ||
        sub?.cancel_subscription ||
        session.urls?.general?.overview ||
        null;

      if (!url) {
        logger.error('portal session returned no url', { customerId });
        res.status(500).json({ error: 'no portal url returned' });
        return;
      }

      // Never cache this URL — it carries a temporary auth token.
      res.status(200).json({ url });
    } catch (err) {
      logger.error('Failed to create customer portal session', err);
      res.status(500).json({ error: 'failed to create portal session' });
    }
  },
);

// ---------------------------------------------------------------------------
// One-time devops setup (run from firebase/ with the Firebase CLI):
//
//   firebase functions:secrets:set PADDLE_API_KEY
//   firebase functions:secrets:set PADDLE_WEBHOOK_SECRET
//
//   # String params live in functions/.env (committed without secrets) e.g.:
//   #   PADDLE_ENV=sandbox
//   #   PRICE_MONTHLY=pri_<<monthly_price_id>>
//   #   PRICE_LIFETIME=pri_<<lifetime_price_id>>
//
//   firebase deploy --only functions
// ---------------------------------------------------------------------------
