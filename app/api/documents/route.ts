import { getDb } from "@/lib/db";
import { checkAuth } from "@/lib/auth";
import { embedTexts, storeVectors } from "@/lib/ai";
import { chunkText } from "@/lib/rag";
import { rowToDocument } from "@/lib/serialize";
import { getSettings } from "@/lib/settings";

export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_CHUNKS = 300;
const MAX_SIZE = 20 * 1024 * 1024;

// 文档上传 → 解析 → 分块 → 向量化 → 入库
// multipart form-data: { file: PDF/TXT/MD }
export async function POST(req: Request) {
  const denied = checkAuth(req);
  if (denied) return denied;

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "缺少文件" }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return Response.json({ error: "文件超过 20MB 限制" }, { status: 413 });
  }
  const name = file.name.toLowerCase();
  let text = "";
  try {
    if (name.endsWith(".pdf")) {
      const { extractText, getDocumentProxy } = await import("unpdf");
      const buf = new Uint8Array(await file.arrayBuffer());
      const pdf = await getDocumentProxy(buf);
      const { text: pages } = await extractText(pdf, { mergePages: true });
      text = pages;
    } else if (name.endsWith(".txt") || name.endsWith(".md")) {
      text = Buffer.from(await file.arrayBuffer()).toString("utf-8");
    } else {
      return Response.json(
        { error: "仅支持 PDF / TXT / MD 文件" },
        { status: 400 }
      );
    }
  } catch (e) {
    return Response.json(
      { error: `文档解析失败: ${(e as Error).message}` },
      { status: 422 }
    );
  }

  const chunks = chunkText(text).slice(0, MAX_CHUNKS);
  if (chunks.length === 0) {
    return Response.json({ error: "文档内容为空" }, { status: 422 });
  }

  let vectors: number[][];
  try {
    vectors = await embedTexts(chunks);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
  if (vectors.length !== chunks.length) {
    return Response.json(
      { error: `向量数量与分块不一致（${vectors.length}/${chunks.length}）` },
      { status: 502 }
    );
  }

  const db = getDb();
  const result = db
    .prepare(
      "INSERT INTO documents (name, size, chunk_count, created_at) VALUES (?, ?, ?, ?)"
    )
    .run(file.name, file.size, chunks.length, Date.now());
  storeVectors(db, Number(result.lastInsertRowid), chunks, vectors);

  const row = db
    .prepare("SELECT * FROM documents WHERE id = ?")
    .get(result.lastInsertRowid) as {
    id: number;
    name: string;
    size: number;
    chunk_count: number;
    created_at: number;
  };
  return Response.json(rowToDocument(row), { status: 201 });
}

export async function GET(req: Request) {
  const denied = checkAuth(req);
  if (denied) return denied;
  const rows = getDb()
    .prepare("SELECT * FROM documents ORDER BY created_at DESC")
    .all() as {
    id: number;
    name: string;
    size: number;
    chunk_count: number;
    created_at: number;
  }[];
  return Response.json(rows.map(rowToDocument));
}
