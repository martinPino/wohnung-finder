import type { NextApiRequest, NextApiResponse } from "next";
import type { RunAutomationRequest, RunAutomationResponse } from "@/types";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<RunAutomationResponse>
) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, message: "Method not allowed" });
  }

  const { config } = req.body as RunAutomationRequest;

  if (!config?.filters?.location) {
    return res.status(400).json({ ok: false, message: "Missing location in filters" });
  }

  try {
    const { runAutomation } = await import("../../automation/immoscout");
    const result = await runAutomation(config, false);

    return res.status(200).json({
      ok: true,
      message: `Done. Found ${result.listingsFound} listing(s), sent ${result.requestsSent} request(s).`,
    });
  } catch (err) {
    console.error("[run-automation] Error:", err);
    return res.status(500).json({
      ok: false,
      message: `Automation error: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
}
