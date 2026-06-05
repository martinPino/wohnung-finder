import type { NextApiRequest, NextApiResponse } from "next";
import type { ScheduleStatus } from "@/types";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ScheduleStatus | { error: string }>
) {
  const { getScheduleStatus, updateSchedule, runNow } = await import("@/lib/scheduler");

  if (req.method === "GET") {
    return res.status(200).json(getScheduleStatus());
  }

  if (req.method === "POST") {
    const { enabled, intervalMinutes, runImmediately, appConfig } = req.body as {
      enabled: boolean;
      intervalMinutes: number;
      runImmediately?: boolean;
      appConfig?: unknown;
    };

    if (typeof enabled !== "boolean" || typeof intervalMinutes !== "number" || intervalMinutes < 1) {
      return res.status(400).json({ error: "enabled (bool) and intervalMinutes (>0) required" });
    }

    // Save the AppConfig to disk so the cron job can use it
    if (appConfig) {
      const fs = await import("fs");
      const path = await import("path");
      const configPath = path.join(process.cwd(), "automation-config.json");
      fs.writeFileSync(configPath, JSON.stringify(appConfig, null, 2));
    }

    const status = updateSchedule({ enabled, intervalMinutes });

    if (runImmediately) {
      runNow();
    }

    return res.status(200).json(status);
  }

  return res.status(405).json({ error: "Method not allowed" });
}
