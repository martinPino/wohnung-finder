import type { NextApiRequest, NextApiResponse } from "next";
import type { RunAutomationRequest, RunAutomationResponse } from "@/types";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<RunAutomationResponse>
) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, message: "Method not allowed" });
  }

  const { config, launchChrome } = req.body as RunAutomationRequest & {
    launchChrome?: boolean;
  };

  // Onboarding "open Chrome to log in" step: launch/focus the debugging Chrome
  // (with the saved profile) and bring up the login page — no search is performed.
  if (launchChrome) {
    try {
      const { openLoginWindow } = await import("../../automation/immoscout");
      await openLoginWindow();
      return res.status(200).json({
        ok: true,
        message: "Chrome opened. Log in to ImmoScout24, then start the automation.",
      });
    } catch (err) {
      return res.status(500).json({
        ok: false,
        message: `Could not open Chrome: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  if (!config?.filters?.location) {
    return res.status(400).json({ ok: false, message: "Missing location in filters" });
  }

  try {
    const { runAutomation } = await import("../../automation/immoscout");
    const result = await runAutomation(config, false);

    return res.status(200).json({
      ok: true,
      message: `Done. Found ${result.listingsFound} listing(s), sent ${result.requestsSent} request(s).`,
      requestsSent: result.requestsSent,
    });
  } catch (err) {
    console.error("[run-automation] Error:", err);
    return res.status(500).json({
      ok: false,
      message: `Automation error: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
}
