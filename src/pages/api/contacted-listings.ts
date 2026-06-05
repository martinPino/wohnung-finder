import type { NextApiRequest, NextApiResponse } from "next";
import * as fs from "fs";
import * as path from "path";
import type { ContactedListing } from "@/types";

const CONTACTED_FILE = path.join(process.cwd(), "contacted.json");

export default function handler(
  req: NextApiRequest,
  res: NextApiResponse<ContactedListing[]>
) {
  if (req.method !== "GET") {
    res.status(405).end();
    return;
  }
  try {
    if (!fs.existsSync(CONTACTED_FILE)) {
      return res.status(200).json([]);
    }
    const raw = JSON.parse(fs.readFileSync(CONTACTED_FILE, "utf-8"));
    // Handle old flat string-array format
    if (Array.isArray(raw) && raw.length > 0 && typeof raw[0] === "string") {
      return res.status(200).json(
        (raw as string[]).map(id => ({ id, url: "", title: id, sentAt: "" }))
      );
    }
    return res.status(200).json((raw as ContactedListing[]).slice().reverse()); // newest first
  } catch {
    return res.status(200).json([]);
  }
}
