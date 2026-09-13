import { getDb } from "@/lib/db";
import { checkAuth } from "@/lib/auth";
import { rowToProvider } from "@/lib/serialize";

export const runtime = "nodejs";

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = checkAuth(req);
  if (denied) return denied;
  const { id } = await params;
  const body = await req.json();
  const db = getDb();
  const existing = db
    .prepare("SELECT * FROM providers WHERE id = ?")
    .get(Number(id)) as import("@/lib/serialize").ProviderRow | undefined;
  if (!existing) {
    return Response.json({ error: "provider 不存在" }, { status: 404 });
  }

  const name = body.name ?? existing.name;
  const baseUrl = body.baseUrl ?? existing.base_url;
  const apiKey = body.apiKey ?? existing.api_key;
  const model = body.model ?? existing.model;
  const endpoints = body.endpoints ?? JSON.parse(existing.endpoints);

  db.prepare(
    "UPDATE providers SET name = ?, base_url = ?, api_key = ?, model = ?, endpoints = ? WHERE id = ?"
  ).run(
    String(name),
    String(baseUrl),
    String(apiKey),
    String(model),
    JSON.stringify(endpoints),
    Number(id)
  );

  const row = db
    .prepare("SELECT * FROM providers WHERE id = ?")
    .get(Number(id)) as import("@/lib/serialize").ProviderRow;
  return Response.json(rowToProvider(row));
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = checkAuth(req);
  if (denied) return denied;
  const { id } = await params;
  const db = getDb();
  // 引用该 provider 的会话解除绑定
  db.prepare("UPDATE conversations SET provider_id = NULL WHERE provider_id = ?").run(
    Number(id)
  );
  db.prepare("DELETE FROM providers WHERE id = ?").run(Number(id));
  return Response.json({ ok: true });
}
