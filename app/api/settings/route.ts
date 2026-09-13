import { getDb } from "@/lib/db";
import { checkAuth } from "@/lib/auth";
import { getSettings, saveSettings } from "@/lib/settings";
import type { AppSettings } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const denied = checkAuth(req);
  if (denied) return denied;
  return Response.json(getSettings(getDb()));
}

export async function PUT(req: Request) {
  const denied = checkAuth(req);
  if (denied) return denied;
  const patch = (await req.json()) as Partial<AppSettings>;
  return Response.json(saveSettings(getDb(), patch));
}
