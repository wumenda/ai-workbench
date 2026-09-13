import { getDb } from "@/lib/db";
import { checkAuth } from "@/lib/auth";
import { rowToConversation } from "@/lib/serialize";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const denied = checkAuth(req);
  if (denied) return denied;
  const rows = getDb()
    .prepare("SELECT * FROM conversations ORDER BY updated_at DESC")
    .all() as never as import("@/lib/serialize").ConversationRow[];
  return Response.json(rows.map(rowToConversation));
}

export async function POST(req: Request) {
  const denied = checkAuth(req);
  if (denied) return denied;
  const body = await req.json().catch(() => ({}));
  const now = Date.now();
  const result = getDb()
    .prepare(
      "INSERT INTO conversations (title, provider_id, created_at, updated_at) VALUES ('新对话', ?, ?, ?)"
    )
    .run(body?.providerId ?? null, now, now);
  const row = getDb()
    .prepare("SELECT * FROM conversations WHERE id = ?")
    .get(result.lastInsertRowid) as import("@/lib/serialize").ConversationRow;
  return Response.json(rowToConversation(row), { status: 201 });
}
