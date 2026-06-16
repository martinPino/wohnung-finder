# Licensing (Paddle Billing + Firebase) — Guía de configuración

Sistema de licencias **sin login**, ligado a la máquina (`machineId`), con:

- **Electron** genera un `machineId` estable y persistente.
- **Paddle Billing** cobra (9 €/mes o 29 € lifetime) — el checkout se abre en el
  navegador del sistema con el `machineId` en `custom_data`.
- **Firebase Cloud Functions** recibe el webhook de Paddle (firma verificada) y
  escribe `licenses/{machineId}` en Firestore.
- **Electron** lee esa licencia al arrancar (SDK cliente, solo lectura) y permite
  **modo offline hasta 7 días**.
- **Customer Portal de Paddle** para cancelar (botón en la app).

```
Compra ──▶ navegador (Paddle checkout, custom_data.machineId)
                         │  pago OK
                         ▼
        Paddle ──webhook──▶ Cloud Function (verifica firma)
                                     │ escribe (admin SDK)
                                     ▼
                         Firestore  licenses/{machineId}
                                     ▲ lee (cliente, read-only)
        Electron (arranque) ─────────┘ ──▶ activa / bloquea / offline 7d
```

---

## 1. Estructura de archivos creada

```
electron/
  preload.ts                 # contextBridge -> window.license
  main.ts                    # (parcheado) preload + registerLicenseIpc + verify
  licensing/
    types.ts                 # tipos locales (LicenseState…)
    config.ts                # config pública: Firebase web, URLs Functions, price ids, OFFLINE_GRACE_DAYS=7
    identity.ts              # machineId = SHA-256(node-machine-id + salt), fallback UUID en electron-store
    firebase.ts              # SDK CLIENTE: lee licenses/{machineId} (solo lectura)
    license.ts               # verifyLicense(): online + grace offline 7d + guard de reloj
    paddle.ts                # buy(plan) / openPortal() -> Cloud Functions -> shell.openExternal
    ipc.ts                   # handlers ipcMain + broadcast license:changed
src/
  types/license.d.ts         # tipado global de window.license
  hooks/useLicense.ts        # hook renderer (no-op en web/dev sin bridge)
  components/LicenseGate.tsx # paywall + ManageSubscriptionLink (gestionar/cancelar)
  pages/_app.tsx             # (parcheado) envuelve la app con <LicenseGate>
  pages/index.tsx            # (parcheado) <ManageSubscriptionLink/> en el header
firebase/
  firebase.json
  firestore.rules            # licenses: lectura por id, ESCRITURA denegada a clientes
  functions/
    package.json
    index.js                 # paddleWebhook + createCheckout + customerPortal
    .env.example
```

---

## 2. Dependencias

### App Electron (ya instaladas en la raíz)
`electron-store@8.2.0` · `node-machine-id` · `firebase` (SDK cliente)

> `electron-store` se fija en **8.2.0** a propósito: la v9+ es solo-ESM y rompe
> bajo el `dist-electron` (CommonJS).

### Backend (Cloud Functions) — instalar:
```bash
cd firebase/functions
npm install            # @paddle/paddle-node-sdk, firebase-admin, firebase-functions
```

---

## 3. Firebase

1. Crea un proyecto en https://console.firebase.google.com y **habilita Firestore**.
2. Project settings ▸ *Your apps* ▸ Web app → copia el **firebaseConfig público**.
3. Pégalo en [`electron/licensing/config.ts`](electron/licensing/config.ts) (reemplaza los `<<…>>`
   en `firebaseConfig` y `functionsBaseUrl`). **No son secretos** — pueden ir en el build.
4. Despliega reglas y funciones:
   ```bash
   cd firebase
   firebase login
   firebase use <tu-project-id>
   firebase deploy --only firestore:rules,functions
   ```
   La URL del webhook será algo como
   `https://<region>-<project-id>.cloudfunctions.net/paddleWebhook`.

---

## 4. Paddle Billing

1. **Catalog ▸ Products/Prices**: crea el precio mensual y el lifetime → copia sus
   `pri_…` (incluyen IVA, mercado Alemania).
2. **Checkout ▸ Checkout settings**: configura un **Default payment link** y
   **aprueba el dominio** (necesario para que `transaction.checkout.url` no sea null).
3. **Developer Tools ▸ Authentication**: crea una **API key** (con permiso de
   lectura de *customers* para el fallback de email).
4. **Developer Tools ▸ Notifications**: crea un *destination* apuntando a la URL
   `…/paddleWebhook`, suscrito a `transaction.completed`, `subscription.created`,
   `subscription.updated`, `subscription.canceled` → copia el **signing secret**.
5. Client-side token (opcional, solo si usas la página hosted con Paddle.js).

---

## 5. Secretos y parámetros del backend

```bash
cd firebase
# Secretos reales (Secret Manager — NO se commitean):
firebase functions:secrets:set PADDLE_API_KEY
firebase functions:secrets:set PADDLE_WEBHOOK_SECRET

# Parámetros no-secretos en functions/.env (copiar de .env.example):
#   PADDLE_ENV=sandbox        # o production
#   PRICE_MONTHLY=pri_xxx
#   PRICE_LIFETIME=pri_yyy

firebase deploy --only functions
```

> `PADDLE_ENV` debe coincidir con el entorno de la API key y de los price ids
> (sandbox vs production). `firebase/functions/.env` está en `.gitignore`.

---

## 6. Cómo está cableado (ya hecho)

- `electron/main.ts`: `preload`, `registerLicenseIpc()` y `verifyLicenseOnStartup()`.
- `_app.tsx`: la app va envuelta en `<LicenseGate>` (paywall en la app de escritorio).
- `index.tsx`: `<ManageSubscriptionLink/>` en el header para suscriptores activos.

### Modo desarrollo / antes de configurar (fail-open)
`verifyLicense()` devuelve **activo** cuando:
- `firebaseConfig.apiKey` sigue con el placeholder `<<…>>` (no provisionado), o
- `LICENSE_DEV_BYPASS=1`.

Así `npm run electron:dev` y los builds previos a la configuración **no quedan
bloqueados**. En **web** (`npm run dev`, sin bridge) el gate deja pasar siempre.
La protección se activa sola en cuanto pegas la config real de Firebase.

---

## 7. Documento Firestore (forma canónica)

`licenses/{machineId}`:
```jsonc
{
  "licenseStatus": "active" | "expired",
  "planType":      "monthly" | "lifetime",
  "expiresAt":     "2026-07-15T10:00:00.000Z" | null,  // ISO; null para lifetime
  "customerId":    "ctm_...",
  "customerEmail": "user@example.com",
  "subscriptionId":"sub_..." | null,
  "updatedAt":     <serverTimestamp>
}
```
El webhook escribe estos nombres exactos; el lector de Electron
([`firebase.ts`](electron/licensing/firebase.ts)) los lee igual.

---

## 8. Prueba end-to-end (sandbox)

1. `PADDLE_ENV=sandbox`, price ids de sandbox, API key/secret de sandbox.
2. Pon la config real de Firebase en `config.ts` (desactiva el fail-open).
3. `npm run electron:dev` → aparece el paywall.
4. "Monatlich/Lifetime kaufen" → checkout en el navegador → paga con
   [tarjeta de prueba de Paddle](https://developer.paddle.com/concepts/payment-methods/credit-debit-card).
5. El webhook escribe `licenses/{machineId}` → pulsa **"Lizenz wiederherstellen"**
   (o reinicia) → la app se desbloquea.
6. Suscriptores mensuales: **"Abo verwalten/kündigen"** abre el Customer Portal.

---

## 9. Seguridad — notas de la revisión

**Bien resuelto:** firma del webhook verificada sobre el `rawBody`; el `firebase-admin`
**nunca** viaja en la app (solo el SDK cliente público + reglas read-only); las reglas
bloquean toda escritura de clientes; `machineId` se valida (`^[a-f0-9]{64}$`) antes de
usarse como id de documento; guard de retroceso de reloj en el grace offline.

**Riesgo residual (inherente a licenciamiento client-side):** el caché local
(`electron-store`) es editable; un usuario técnico puede saltarse el grace offline.
Mitigaciones aplicadas: ventana corta (7 días) + re-verificación online + guard de
reloj. La única defensa total sería verificar entitlement server-side en cada acción,
fuera del alcance de una app offline-tolerante de 9 €/mes.

**Hardening opcional (no crítico):** rate-limit por IP en `createCheckout`/`customerPortal`;
mover `customerEmail` a `licenses_private/{machineId}` que la app no lee (el doc público
es legible por id → PII).
