import { getDb } from "@/lib/db";
import { checkAuth } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { readMediaDataUrl } from "@/lib/media";
import { embedTexts, generateImage } from "@/lib/ai";
import { searchChunks } from "@/lib/rag";
import { parseAttachments, type ConversationRow, type MessageRow, type ProviderRow } from "@/lib/serialize";
import type { GeneratedImage } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

// 流式对话代理：
// - vision：用户消息图片附件 → data URL
// - function calling：generate_image 工具 + agent loop（最多 3 轮）
// - RAG：会话开启检索时注入相关文档片段
// - SSE：delta 原样透传；自定义 workbench_event（media/error）事件
// API Key 只存在于服务端。

const IMAGE_TOOL = {
  type: "function",
  function: {
    name: "generate_image",
    description:
      "根据文字描述生成图像。当用户想要画图、生成图片、插画、设计、Logo、示意图等时调用。生成后请在回复中用 markdown 图片语法展示。",
    parameters: {
      type: "object",
      properties: {
        prompt: { type: "string", description: "图像内容的详细描述" },
        size: {
          type: "string",
          enum: ["1024x1024", "1792x1024", "1024x1792"],
          description: "图像尺寸；用户未明确要求横版/竖版时不传",
        },
        n: { type: "integer", minimum: 1, maximum: 4, description: "生成张数，默认 1" },
      },
      required: ["prompt"],
    },
  },
};

interface ToolCallAgg {
  id: string;
  name: string;
  arguments: string;
}

function aggregateToolCalls(
  acc: Map<number, ToolCallAgg>,
  deltas: { index?: number; id?: string; function?: { name?: string; arguments?: string } }[]
) {
  for (const d of deltas) {
    const idx = d.index ?? 0;
    const cur = acc.get(idx) ?? { id: "", name: "", arguments: "" };
    if (d.id) cur.id = d.id;
    if (d.function?.name) cur.name += d.function.name;
    if (d.function?.arguments) cur.arguments += d.function.arguments;
    acc.set(idx, cur);
  }
}

async function* sseData(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      const t = line.trim();
      if (t.startsWith("data:")) yield t.slice(5).trim();
    }
  }
}

export async function POST(req: Request) {
  const denied = checkAuth(req);
  if (denied) return denied;

  const { conversationId } = await req.json();
  if (!conversationId) {
    return Response.json({ error: "缺少 conversationId" }, { status: 400 });
  }

  const db = getDb();
  const conv = db
    .prepare("SELECT * FROM conversations WHERE id = ?")
    .get(Number(conversationId)) as ConversationRow | undefined;
  if (!conv) {
    return Response.json({ error: "会话不存在" }, { status: 404 });
  }

  const providerId =
    conv.provider_id ??
    (db.prepare("SELECT id FROM providers ORDER BY id LIMIT 1").get() as { id: number } | undefined)?.id;
  if (!providerId) {
    return Response.json({ error: "尚未配置 Provider，请先在设置中添加" }, { status: 400 });
  }
  const provider = db
    .prepare("SELECT * FROM providers WHERE id = ?")
    .get(providerId) as ProviderRow | undefined;
  if (!provider) {
    return Response.json({ error: "Provider 不存在" }, { status: 400 });
  }

  const settings = getSettings(db);
  const rows = db
    .prepare("SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at, id")
    .all(conv.id) as never as MessageRow[];

  // ---- 构建上行消息 ----
  type OutMsg = Record<string, unknown>;
  const outbound: OutMsg[] = [];

  if (conv.system_prompt.trim()) {
    outbound.push({ role: "system", content: conv.system_prompt.trim() });
  }

  // RAG：会话开启检索 → 最近一条用户消息向量化 → 注入片段
  if (conv.retrieval_enabled === 1) {
    const lastUser = [...rows].reverse().find((r) => r.role === "user");
    if (lastUser?.content.trim()) {
      try {
        const [vec] = await embedTexts([lastUser.content.slice(0, 2000)]);
        const hits = searchChunks(db, vec, 5);
        if (hits.length > 0) {
          const ctx = hits
            .map(
              (h) =>
                `【${h.docName} · 片段${h.idx + 1} · 相关度 ${h.score.toFixed(2)}】\n${h.content}`
            )
            .join("\n\n");
          outbound.push({
            role: "system",
            content: `以下是知识库中与用户问题相关的资料片段：\n\n${ctx}\n\n请优先依据资料回答；资料不足时可结合通用知识并注明。`,
          });
        }
      } catch {
        // 检索失败不阻塞对话
      }
    }
  }

  // 消息历史（图片附件 → data URL）
  for (const r of rows) {
    if (r.role === "system") continue;
    const atts = parseAttachments(r.attachments);
    const images = (atts ?? []).filter((a) => a.type === "image");
    if (r.role === "user" && images.length > 0) {
      const contentParts: Record<string, unknown>[] = [
        { type: "text", text: r.content || "请看这些图片" },
      ];
      for (const img of images) {
        const dataUrl = img.url.startsWith("data:")
          ? img.url
          : await readMediaDataUrl(img.url);
        if (dataUrl) {
          contentParts.push({ type: "image_url", image_url: { url: dataUrl } });
        }
      }
      outbound.push({ role: "user", content: contentParts });
    } else {
      outbound.push({ role: r.role, content: r.content });
    }
  }

  const payload: Record<string, unknown> = {
    model: provider.model,
    messages: outbound,
    stream: true,
  };
  if (conv.temperature != null) payload.temperature = conv.temperature;
  if (conv.max_tokens != null) payload.max_tokens = conv.max_tokens;

  // 图像工具：存在可用的图像 Provider 时才注入
  const imageProviderAvailable =
    settings.imageProviderId != null ||
    (db
      .prepare("SELECT id FROM providers WHERE endpoints LIKE '%image%' LIMIT 1")
      .get() as { id: number } | undefined) != null;
  if (imageProviderAvailable) payload.tools = [IMAGE_TOOL];

  const baseUrl = provider.base_url.replace(/\/+$/, "");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(provider.api_key ? { Authorization: `Bearer ${provider.api_key}` } : {}),
  };

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));

      let messagesForUpstream = outbound;
      try {
        for (let round = 0; round < 3; round++) {
          const upstream = await fetch(`${baseUrl}/chat/completions`, {
            method: "POST",
            headers,
            body: JSON.stringify(payload),
            signal: req.signal,
          });

          if (!upstream.ok || !upstream.body) {
            const text = await upstream.text().catch(() => "");
            send({
              workbench_event: "error",
              error: `${provider.name} 返回 ${upstream.status}: ${text.slice(0, 300)}`,
            });
            break;
          }

          const toolCalls = new Map<number, ToolCallAgg>();
          let finishReason: string | null = null;
          let assistantContent = "";

          for await (const data of sseData(upstream.body)) {
            if (data === "[DONE]") break;
            let j: {
              choices?: {
                delta?: {
                  content?: string | null;
                  tool_calls?: Parameters<typeof aggregateToolCalls>[1];
                };
                finish_reason?: string | null;
              }[];
            };
            try {
              j = JSON.parse(data);
            } catch {
              continue;
            }
            const ch = j.choices?.[0];
            if (!ch) continue;
            if (ch.delta?.content) {
              assistantContent += ch.delta.content;
              send(j); // 原样转发给客户端
            }
            if (ch.delta?.tool_calls) aggregateToolCalls(toolCalls, ch.delta.tool_calls);
            if (ch.finish_reason) finishReason = ch.finish_reason;
          }

          if (finishReason !== "tool_calls" || toolCalls.size === 0) break;

          // 追加 assistant 工具调用消息
          const calls = [...toolCalls.entries()]
            .sort((a, b) => a[0] - b[0])
            .map(([, v]) => v);
          messagesForUpstream.push({
            role: "assistant",
            content: assistantContent || null,
            tool_calls: calls.map((c) => ({
              id: c.id || `call_${Math.random().toString(36).slice(2)}`,
              type: "function",
              function: { name: c.name, arguments: c.arguments || "{}" },
            })),
          });

          // 执行工具
          for (const c of calls) {
            if (c.name === "generate_image") {
              let args: { prompt?: string; size?: string; n?: number } = {};
              try {
                args = JSON.parse(c.arguments || "{}");
              } catch {
                // 参数解析失败
              }
              if (!args.prompt) {
                send({ role: "tool_result_hint", error: "generate_image 缺少 prompt" });
                messagesForUpstream.push({
                  role: "tool",
                  tool_call_id: c.id,
                  content: "调用失败：缺少 prompt 参数",
                });
                continue;
              }
              const result = await generateImage({
                prompt: args.prompt,
                size: args.size,
                n: args.n,
              });
              if (result.error || result.images.length === 0) {
                send({ workbench_event: "error", error: result.error ?? "图像生成失败" });
                messagesForUpstream.push({
                  role: "tool",
                  tool_call_id: c.id,
                  content: `图像生成失败：${result.error ?? "未知错误"}`,
                });
              } else {
                send({ workbench_event: "media", urls: result.images });
                const listText = result.images
                  .map((im: GeneratedImage) => `![${args.prompt}](${im.url})`)
                  .join("\n");
                messagesForUpstream.push({
                  role: "tool",
                  tool_call_id: c.id,
                  content: `图像生成成功，共 ${result.images.length} 张：\n${listText}\n请在回复中用以上 markdown 图片语法展示图片。`,
                });
              }
            } else {
              messagesForUpstream.push({
                role: "tool",
                tool_call_id: c.id,
                content: `未知工具：${c.name}`,
              });
            }
          }
          // 继续下一轮，让模型基于工具结果回复
        }
      } catch (e) {
        if ((e as Error).name !== "AbortError") {
          try {
            send({ workbench_event: "error", error: (e as Error).message });
          } catch {
            // 流已关闭
          }
        }
      } finally {
        try {
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        } catch {
          // 已关闭
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
