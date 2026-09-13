import { getDb } from "./db";
import { getSettings, resolveProvider } from "./settings";
import { saveMedia } from "./media";
import { vecToBlob } from "./rag";
import type { GeneratedImage } from "./types";

function authHeaders(apiKey: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
  };
}

// 文生图：走 settings 指定的图像 Provider（或第一个声明 image 端点的）
export async function generateImage(args: {
  prompt: string;
  size?: string;
  n?: number;
  seed?: number;
}): Promise<{ images: GeneratedImage[]; error?: string }> {
  const db = getDb();
  const settings = getSettings(db);
  const provider = resolveProvider(db, settings, "image");
  if (!provider) {
    return { images: [], error: "未配置支持图像生成的服务商（在设置中添加并勾选“图像”端点）" };
  }
  const model = settings.imageModel || provider.model;
  const body: Record<string, unknown> = {
    model,
    prompt: args.prompt,
    n: Math.min(Math.max(args.n ?? 1, 1), 4),
  };
  if (args.size && args.size !== "auto") body.size = args.size;
  if (args.seed != null) body.seed = args.seed;

  let res: Response;
  try {
    res = await fetch(`${provider.base_url.replace(/\/+$/, "")}/images/generations`, {
      method: "POST",
      headers: authHeaders(provider.api_key),
      body: JSON.stringify(body),
    });
  } catch (e) {
    return { images: [], error: `无法连接图像服务: ${(e as Error).message}` };
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { images: [], error: `图像接口返回 ${res.status}: ${text.slice(0, 200)}` };
  }
  const j = (await res.json()) as {
    data?: { b64_json?: string; url?: string }[];
  };
  const images: GeneratedImage[] = [];
  for (const d of j.data ?? []) {
    if (d.b64_json) {
      const saved = await saveMedia(Buffer.from(d.b64_json, "base64"), ".png");
      images.push({ url: saved.url, name: saved.name, prompt: args.prompt, size: args.size });
    } else if (d.url) {
      // 尝试下载到本地持久化，失败则引用远端
      try {
        const r2 = await fetch(d.url);
        if (r2.ok) {
          const buf = Buffer.from(await r2.arrayBuffer());
          const saved = await saveMedia(buf, ".png");
          images.push({ url: saved.url, name: saved.name, prompt: args.prompt, size: args.size });
          continue;
        }
      } catch {
        // 落入远端引用
      }
      images.push({ url: d.url, name: d.url, prompt: args.prompt, size: args.size });
    }
  }
  if (images.length === 0) return { images: [], error: "图像接口未返回数据" };
  return { images };
}

// 向量化：走 settings 指定的 embedding Provider
export async function embedTexts(texts: string[]): Promise<number[][]> {
  const db = getDb();
  const settings = getSettings(db);
  const provider = resolveProvider(db, settings, "embedding");
  if (!provider) throw new Error("未配置支持向量的服务商");
  const model = settings.embeddingModel || provider.model;
  const res = await fetch(`${provider.base_url.replace(/\/+$/, "")}/embeddings`, {
    method: "POST",
    headers: authHeaders(provider.api_key),
    body: JSON.stringify({ model, input: texts }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`向量接口返回 ${res.status}: ${text.slice(0, 200)}`);
  }
  const j = (await res.json()) as {
    data?: { embedding: number[]; index: number }[];
  };
  return (j.data ?? [])
    .sort((a, b) => a.index - b.index)
    .map((d) => d.embedding);
}

export function storeVectors(db: import("better-sqlite3").Database, docId: number, chunks: string[], vectors: number[][]) {
  const stmt = db.prepare(
    "INSERT INTO chunks (doc_id, idx, content, embedding) VALUES (?, ?, ?, ?)"
  );
  chunks.forEach((content, i) => {
    stmt.run(docId, i, content, vectors[i] ? vecToBlob(vectors[i]) : null);
  });
}
