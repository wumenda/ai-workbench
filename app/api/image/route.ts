import { checkAuth } from "@/lib/auth";
import { generateImage } from "@/lib/ai";

export const runtime = "nodejs";
export const maxDuration = 300;

// 非流式生图：/image 斜杠命令与"重新生成"走这里
export async function POST(req: Request) {
  const denied = checkAuth(req);
  if (denied) return denied;
  const body = await req.json();
  const prompt = String(body.prompt ?? "").trim();
  if (!prompt) {
    return Response.json({ error: "缺少 prompt" }, { status: 400 });
  }
  const result = await generateImage({
    prompt,
    size: body.size ? String(body.size) : undefined,
    n: body.n ? Number(body.n) : 1,
    seed: body.seed != null ? Number(body.seed) : undefined,
  });
  if (result.error || result.images.length === 0) {
    return Response.json(
      { error: result.error ?? "图像生成失败" },
      { status: 502 }
    );
  }
  return Response.json({ images: result.images });
}
