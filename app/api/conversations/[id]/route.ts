import { getDb } from "@/lib/db";
import { checkAuth } from "@/lib/auth";
import {
  rowToConversation,
  rowToMessage,
  type ConversationRow,
  type MessageRow,
} from "@/lib/serialize";

export const runtime = "nodejs";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = checkAuth(req);
  if (denied) return denied;
  const { id } = await params;
  const db = getDb();
  const conv = db
    .prepare("SELECT * FROM conversations WHERE id = ?")
    .get(Number(id)) as ConversationRow | undefined;
  if (!conv) {
    return Response.json({ error: "会话不存在" }, { status: 404 });
  }
  const messages = db
    .prepare(
      "SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at, id"
    )
    .all(Number(id)) as never as MessageRow[];
  return Response.json({
    conversation: rowToConversation(conv),
    messages: messages.map(rowToMessage),
  });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = checkAuth(req);
  if (denied) return denied;
  const { id } = await params;
  const body = await req.json();
  const db = getDb();
  const existing = db
    .prepare("SELECT * FROM conversations WHERE id = ?")
    .get(Number(id)) as ConversationRow | undefined;
  if (!existing) {
    return Response.json({ error: "会话不存在" }, { status: 404 });
  }

  const title = body.title ?? existing.title;
  const providerId =
    body.providerId === undefined ? existing.provider_id : body.providerId;
  const systemPrompt =
    body.systemPrompt === undefined ? existing.system_prompt : body.systemPrompt;
  const temperature =
    body.temperature === undefined ? existing.temperature : body.temperature;
  const maxTokens =
    body.maxTokens === undefined ? existing.max_tokens : body.maxTokens;
  const retrievalEnabled =
    body.retrievalEnabled === undefined
      ? existing.retrieval_enabled
      : body.retrievalEnabled
        ? 1
        : 0;
  const now = Date.now();

  db.prepare(
    "UPDATE conversations SET title = ?, provider_id = ?, system_prompt = ?, temperature = ?, max_tokens = ?, retrieval_enabled = ?, updated_at = ? WHERE id = ?"
  ).run(
    String(title),
    providerId,
    String(systemPrompt),
    Number(temperature),
    maxTokens === null || maxTokens === undefined ? null : Number(maxTokens),
    retrievalEnabled,
    now,
    Number(id)
  );

  const row = db
    .prepare("SELECT * FROM conversations WHERE id = ?")
    .get(Number(id)) as ConversationRow;
  return Response.json(rowToConversation(row));
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = checkAuth(req);
  if (denied) return denied;
  const { id } = await params;
  const db = getDb();
  db.prepare("DELETE FROM messages WHERE conversation_id = ?").run(Number(id));
  db.prepare("DELETE FROM conversations WHERE id = ?").run(Number(id));
  return Response.json({ ok: true });
}
