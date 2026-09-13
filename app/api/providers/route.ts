import { getDb } from "@/lib/db";
import { checkAuth } from "@/lib/auth";
import { rowToProvider } from "@/lib/serialize";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const denied = checkAuth(req);
  if (denied) return denied;
  const rows = getDb()
    .prepare("SELECT * FROM providers ORDER BY id")
    .all() as never as import("@/lib/serialize").ProviderRow[];
  return Response.json(rows.map(rowToProvider));
}

export async function POST(req: Request) {
  const denied = checkAuth(req);
  if (denied) return denied;
  const body = await req.json();
  const { name, baseUrl, apiKey = "", model, endpoints = ["chat"] } = body;
  if (!name || !baseUrl || !model) {
    return Response.json(
      { error: "name、baseUrl、model 均为必填" },
      { status: 400 }
    );
  }
  const result = getDb()
    .prepare(
      "INSERT INTO providers (name, base_url, api_key, model, endpoints, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    )
    .run(
      String(name),
      String(baseUrl),
      String(apiKey),
      String(model),
      JSON.stringify(endpoints),
      Date.now()
    );
  const row = getDb()
    .prepare("SELECT * FROM providers WHERE id = ?")
    .get(result.lastInsertRowid) as import("@/lib/serialize").ProviderRow;
  return Response.json(rowToProvider(row), { status: 201 });
}
