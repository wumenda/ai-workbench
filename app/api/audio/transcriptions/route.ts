import { getDb } from "@/lib/db";
import { checkAuth } from "@/lib/auth";
import { getSettings, resolveProvider } from "@/lib/settings";

export const runtime = "nodejs";
export const maxDuration = 300;

// 语音识别：multipart form-data { audio: Blob }
// Provider 优先 settings.sttProviderId，其次第一个声明 audio 端点的
export async function POST(req: Request) {
  const denied = checkAuth(req);
  if (denied) return denied;

  const db = getDb();
  const settings = getSettings(db);
  const provider = resolveProvider(db, settings, "audio");
  if (!provider) {
    return Response.json(
      { error: "未配置支持语音的服务商（设置中添加并勾选“语音”端点）" },
      { status: 400 }
    );
  }
  const model = settings.sttModel || "whisper-1";

  const form = await req.formData();
  const audio = form.get("audio");
  if (!(audio instanceof File)) {
    return Response.json({ error: "缺少音频" }, { status: 400 });
  }

  const upstream = new FormData();
  upstream.append("file", audio, audio.name || "recording.webm");
  upstream.append("model", model);

  let res: Response;
  try {
    res = await fetch(`${provider.base_url.replace(/\/+$/, "")}/audio/transcriptions`, {
      method: "POST",
      headers: provider.api_key ? { Authorization: `Bearer ${provider.api_key}` } : {},
      body: upstream,
      signal: req.signal,
    });
  } catch (e) {
    return Response.json(
      { error: `无法连接语音服务: ${(e as Error).message}` },
      { status: 502 }
    );
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return Response.json(
      { error: `语音识别接口返回 ${res.status}: ${text.slice(0, 200)}` },
      { status: 502 }
    );
  }
  const j = (await res.json()) as { text?: string };
  return Response.json({ text: j.text ?? "" });
}
