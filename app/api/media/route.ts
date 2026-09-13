import { checkAuth } from "@/lib/auth";
import { saveMedia } from "@/lib/media";

export const runtime = "nodejs";

const MAX_SIZE = 20 * 1024 * 1024; // 20MB

// 上传媒体（图片输入 / 语音片段）：multipart form-data
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
  const ext = (file.name.match(/\.[a-zA-Z0-9]+$/) ?? [".bin"])[0].toLowerCase();
  const buf = Buffer.from(await file.arrayBuffer());
  const saved = await saveMedia(buf, ext);
  return Response.json({ url: saved.url, name: file.name });
}
