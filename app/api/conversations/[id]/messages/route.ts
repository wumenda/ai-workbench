import { getDb } from "@/lib/db";
import { checkAuth } from "@/lib/auth";
import {
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
  const rows = getDb()
    .prepare(
      "SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at, id"
    )
    .all(Number(id)) as never as MessageRow[];
  return Response.json(rows.map(rowToMessage));
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = checkAuth(req);
  if (denied) return denied;
  const { id } = await params;
  const body = await req.json();
  const { role, content } = body;
  if (!role || !content || !["user", "assistant", "system"].includes(role)) {
    return Response.json({ error: "role/content 无效" }, { status: 400 });
  }
  const db = getDb();
  const conv = db
    .prepare("SELECT * FROM conversations WHERE id = ?")
    .get(Number(id)) as ConversationRow | undefined;
  if (!conv) {
    return Response.json({ error: "会话不存在" }, { status: 404 });
  }

  const now = Date.now();
  const attachments = Array.isArray(body.attachments)
    ? JSON.stringify(body.attachments)
    : null;
  const result = db
    .prepare(
      "INSERT INTO messages (conversation_id, role, content, attachments, created_at) VALUES (?, ?, ?, ?, ?)"
    )
    .run(
      Number(id),
      String(role),
      String(content),
      attachments,
      now
    );

  // 首条用户消息自动生成会话标题
  let title = conv.title;
  if (conv.title === "新对话" && role === "user") {
    const text = String(content).replace(/\s+/g, " ").trim();
    if (text) title = text.slice(0, 30) + (text.length > 30 ? "…" : "");
  }
  db.prepare("UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?").run(
    title,
    now,
    Number(id)
  );

  const row = db
    .prepare("SELECT * FROM messages WHERE id = ?")
    .get(result.lastInsertRowid) as MessageRow;
  return Response.json(rowToMessage(row), { status: 201 });
}
