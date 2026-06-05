import type { NextApiRequest, NextApiResponse } from "next";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();

  const { requestCancellation } = await import("@/lib/cancellation");
  await requestCancellation(); // closes the active page immediately

  return res.status(200).json({ ok: true, message: "Stop requested — tab closed." });
}
