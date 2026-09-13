import { getDb } from "@/lib/db";
import { checkAuth } from "@/lib/auth";

export const runtime = "nodejs";

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = checkAuth(req);
  if (denied) return denied;
  const { id } = await params;
  const db = getDb();
  db.prepare("DELETE FROM chunks WHERE doc_id = ?").run(Number(id));
  db.prepare("DELETE FROM documents WHERE id = ?").run(Number(id));
  return Response.json({ ok: true });
}
