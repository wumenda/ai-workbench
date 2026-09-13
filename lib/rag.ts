import type { Database } from "better-sqlite3";

// 简单文本分块：按段落聚合到目标长度，带重叠
export function chunkText(text: string, target = 800, overlap = 100): string[] {
  const clean = text.replace(/\r\n/g, "\n").trim();
  if (!clean) return [];
  const paragraphs = clean.split(/\n{2,}/);
  const chunks: string[] = [];
  let cur = "";
  for (const p of paragraphs) {
    if ((cur + "\n\n" + p).length <= target) {
      cur = cur ? `${cur}\n\n${p}` : p;
    } else {
      if (cur) chunks.push(cur);
      if (p.length <= target) {
        cur = p;
      } else {
        // 超长段落硬切
        let start = 0;
        while (start < p.length) {
          const end = Math.min(start + target, p.length);
          chunks.push(p.slice(start, end));
          if (end >= p.length) break;
          start = end - overlap;
        }
        cur = "";
      }
    }
  }
  if (cur) chunks.push(cur);
  return chunks.filter((c) => c.trim().length > 0);
}

// Float32 向量 ↔ Buffer（SQLite BLOB）
export function vecToBlob(vec: number[]): Buffer {
  const f32 = new Float32Array(vec);
  return Buffer.from(f32.buffer);
}

export function blobToVec(blob: Buffer): number[] {
  const f32 = new Float32Array(
    blob.buffer.slice(blob.byteOffset, blob.byteOffset + blob.byteLength)
  );
  return Array.from(f32);
}

export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export interface RetrievedChunk {
  docId: number;
  docName: string;
  idx: number;
  content: string;
  score: number;
}

// 暴力余弦检索（万级 chunk 以内毫秒级）
export function searchChunks(
  db: Database,
  queryVec: number[],
  topK = 5,
  minScore = 0.25
): RetrievedChunk[] {
  const rows = db
    .prepare(
      `SELECT c.id, c.doc_id, c.idx, c.content, c.embedding, d.name AS doc_name
       FROM chunks c JOIN documents d ON d.id = c.doc_id
       WHERE c.embedding IS NOT NULL`
    )
    .all() as {
    id: number;
    doc_id: number;
    idx: number;
    content: string;
    embedding: Buffer;
    doc_name: string;
  }[];
  const scored = rows
    .map((r) => ({
      docId: r.doc_id,
      docName: r.doc_name,
      idx: r.idx,
      content: r.content,
      score: cosine(queryVec, blobToVec(r.embedding)),
    }))
    .filter((r) => r.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
  return scored;
}
