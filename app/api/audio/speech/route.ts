import { getDb } from "@/lib/db";
import { checkAuth } from "@/lib/auth";
import { getSettings, resolveProvider } from "@/lib/settings";

export const runtime = "nodejs";
export const maxDuration = 300;

// 语音合成：POST { text } → audio/mpeg 流透传
export async function POST(req: Request) {
  const denied = checkAuth(req);
  if (denied) return denied;

  const { text } = await req.json();
  if (!text || !String(text).trim()) {
    return Response.json({ error: "缺少文本" }, { status: 400 });
  }

  const db = getDb();
  const settings = getSettings(db);
  const provider = resolveProvider(db, settings, "audio");
  if (!provider) {
    return Response.json(
      { error: "未配置支持语音的服务商" },
      { status: 400 }
    );
  }
  const model = settings.ttsModel || "tts-1";
  const voice = settings.ttsVoice || "alloy";

  let upstream: Response;
  try {
    upstream = await fetch(`${provider.base_url.replace(/\/+$/, "")}/audio/speech`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(provider.api_key ? { Authorization: `Bearer ${provider.api_key}` } : {}),
      },
      body: JSON.stringify({ model, input: String(text).slice(0, 4000), voice }),
      signal: req.signal,
    });
  } catch (e) {
    return Response.json(
      { error: `无法连接语音服务: ${(e as Error).message}` },
      { status: 502 }
    );
  }
  if (!upstream.ok || !upstream.body) {
    const errText = await upstream.text().catch(() => "");
    return Response.json(
      { error: `语音合成接口返回 ${upstream.status}: ${errText.slice(0, 200)}` },
      { status: 502 }
    );
  }
  return new Response(upstream.body, {
    headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-cache" },
  });
}
