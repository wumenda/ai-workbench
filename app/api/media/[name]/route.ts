import fs from "node:fs/promises";
import { mediaFilePath } from "@/lib/media";

export const runtime = "nodejs";

const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".pdf": "application/pdf",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".webm": "audio/webm",
  ".ogg": "audio/ogg",
};

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  const { name } = await params;
  try {
    const buf = await fs.readFile(mediaFilePath(decodeURIComponent(name)));
    const ext = (name.match(/\.[a-zA-Z0-9]+$/) ?? [".bin"])[0].toLowerCase();
    const mime = MIME[ext] ?? "application/octet-stream";
    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": mime,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return Response.json({ error: "文件不存在" }, { status: 404 });
  }
}
