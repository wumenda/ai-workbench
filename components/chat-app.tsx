"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Menu, Settings2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiFetch, apiJson, UnauthorizedError } from "@/lib/client";
import type {
  Attachment,
  Conversation,
  GeneratedImage,
  Message,
  Provider,
} from "@/lib/types";
import { Composer } from "./composer";
import { DocumentsDialog } from "./documents-dialog";
import { MessageBubble } from "./message-bubble";
import { SessionSettings } from "./session-settings";
import { SettingsDialog } from "./settings-dialog";
import { Sidebar } from "./sidebar";
import { ThemeToggle } from "./theme-toggle";

export function ChatApp() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [activeConv, setActiveConv] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [streamingMedia, setStreamingMedia] = useState<GeneratedImage[]>([]);
  const [pendingImages, setPendingImages] = useState<
    { url: string; name: string }[]
  >([]);
  const [error, setError] = useState<string | null>(null);
  const [needPassword, setNeedPassword] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sessionSettingsOpen, setSessionSettingsOpen] = useState(false);
  const [documentsOpen, setDocumentsOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [booting, setBooting] = useState(true);

  const [newConvProviderId, setNewConvProviderId] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const bufRef = useRef("");
  const rafRef = useRef<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeIdRef = useRef<number | null>(null);
  const streamingRef = useRef(false);
  const persistedRef = useRef(false);
  const mediaRef = useRef<GeneratedImage[]>([]);

  const refreshConversations = useCallback(async () => {
    const cs = await apiJson<Conversation[]>("/api/conversations");
    setConversations(cs);
    setActiveConv((prev) =>
      prev ? (cs.find((c) => c.id === prev.id) ?? prev) : prev
    );
  }, []);

  const loadProviders = useCallback(async () => {
    const ps = await apiJson<Provider[]>("/api/providers");
    setProviders(ps);
    return ps;
  }, []);

  const selectConversation = useCallback(async (id: number) => {
    if (streamingRef.current) return;
    try {
      const data = await apiJson<{ conversation: Conversation; messages: Message[] }>(
        `/api/conversations/${id}`
      );
      setActiveId(id);
      activeIdRef.current = id;
      setActiveConv(data.conversation);
      setMessages(data.messages);
      setPendingImages([]);
      setError(null);
      setSidebarOpen(false);
    } catch (e) {
      if (!(e instanceof UnauthorizedError)) setError((e as Error).message);
    }
  }, []);

  const loadInitial = useCallback(async () => {
    setBooting(true);
    setError(null);
    try {
      const [ps, cs] = await Promise.all([
        loadProviders(),
        apiJson<Conversation[]>("/api/conversations").then((c) => {
          setConversations(c);
          return c;
        }),
      ]);
      if (cs.length > 0) {
        const data = await apiJson<{
          conversation: Conversation;
          messages: Message[];
        }>(`/api/conversations/${cs[0].id}`);
        setActiveId(cs[0].id);
        activeIdRef.current = cs[0].id;
        setActiveConv(data.conversation);
        setMessages(data.messages);
      }
      if (ps.length > 0) setNewConvProviderId(String(ps[0].id));
    } catch (e) {
      if (e instanceof UnauthorizedError) setNeedPassword(true);
      else setError((e as Error).message);
    } finally {
      setBooting(false);
    }
  }, [loadProviders]);

  useEffect(() => {
    loadInitial();
  }, [loadInitial]);

  // 流式渲染 rAF 节流：每帧最多刷新一次
  const pushDelta = useCallback((delta: string) => {
    bufRef.current += delta;
    if (rafRef.current == null) {
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        setStreamingText(bufRef.current);
      });
    }
  }, []);

  const ensureConversation = useCallback(async (): Promise<number> => {
    const convId = activeIdRef.current;
    if (convId) return convId;
    const conv = await apiJson<Conversation>("/api/conversations", {
      method: "POST",
      body: JSON.stringify({
        providerId: newConvProviderId ? Number(newConvProviderId) : null,
      }),
    });
    setActiveId(conv.id);
    activeIdRef.current = conv.id;
    setActiveConv(conv);
    setConversations((prev) => [conv, ...prev]);
    return conv.id;
  }, [newConvProviderId]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (streamingRef.current) return;
    if (!text && pendingImages.length === 0) return;

    // 斜杠命令：/image 直接生图（不经过模型）
    if (text.startsWith("/image ")) {
      const prompt = text.slice(7).trim();
      if (prompt) {
        setInput("");
        await sendImageCommand(prompt);
      }
      return;
    }

    setError(null);
    const attachments: Attachment[] = pendingImages.map((img) => ({
      type: "image" as const,
      url: img.url,
      name: img.name,
    }));

    try {
      const convId = await ensureConversation();

      const userMsg = await apiJson<Message>(
        `/api/conversations/${convId}/messages`,
        {
          method: "POST",
          body: JSON.stringify({
            role: "user",
            content: text,
            ...(attachments.length > 0 ? { attachments } : {}),
          }),
        }
      );
      setMessages((prev) => [...prev, userMsg]);
      setInput("");
      setPendingImages([]);

      streamingRef.current = true;
      persistedRef.current = false;
      mediaRef.current = [];
      setStreaming(true);
      bufRef.current = "";
      setStreamingText("");
      setStreamingMedia([]);

      const ac = new AbortController();
      abortRef.current = ac;
      const res = await apiFetch("/api/chat", {
        method: "POST",
        body: JSON.stringify({ conversationId: convId }),
        signal: ac.signal,
      });
      if (res.status === 401) {
        setNeedPassword(true);
        throw new UnauthorizedError();
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `请求失败（HTTP ${res.status}）`);
      }

      const reader = res.body!.getReader();
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
          if (!t.startsWith("data:")) continue;
          const data = t.slice(5).trim();
          if (!data || data === "[DONE]") continue;
          let j: Record<string, unknown>;
          try {
            j = JSON.parse(data);
          } catch {
            continue;
          }
          // 自定义事件：生图结果 / 错误
          if (j.workbench_event === "media") {
            const urls = j.urls as GeneratedImage[];
            mediaRef.current = [...mediaRef.current, ...urls];
            setStreamingMedia([...mediaRef.current]);
            continue;
          }
          if (j.workbench_event === "error") {
            setError(String(j.error));
            continue;
          }
          const delta =
            (j.choices as
              | { delta?: { content?: string } }[]
              | undefined)?.[0]?.delta?.content;
          if (delta) pushDelta(delta);
        }
      }

      // 正常完成 → 持久化完整回复（含工具生成的图片）
      const full = bufRef.current;
      const media = mediaRef.current;
      if (full.trim() || media.length > 0) {
        const m = await apiJson<Message>(
          `/api/conversations/${convId}/messages`,
          {
            method: "POST",
            body: JSON.stringify({
              role: "assistant",
              content: full || "（图片已生成）",
              ...(media.length > 0
                ? {
                    attachments: media.map((im) => ({
                      type: "image",
                      url: im.url,
                      name: im.name,
                      prompt: im.prompt,
                      size: im.size,
                    })),
                  }
                : {}),
            }),
          }
        );
        persistedRef.current = true;
        setMessages((prev) => [...prev, m]);
      }
    } catch (e) {
      if (e instanceof UnauthorizedError) {
        setNeedPassword(true);
      } else if ((e as Error).name !== "AbortError") {
        setError((e as Error).message);
      }
      // 中断/出错：把已生成的部分持久化
      const partial = bufRef.current;
      const media = mediaRef.current;
      const convId = activeIdRef.current;
      if ((partial.trim() || media.length > 0) && convId && !persistedRef.current) {
        try {
          const m = await apiJson<Message>(
            `/api/conversations/${convId}/messages`,
            {
              method: "POST",
              body: JSON.stringify({
                role: "assistant",
                content: partial || "（已中断，图片如下）",
                ...(media.length > 0
                  ? {
                      attachments: media.map((im) => ({
                        type: "image",
                        url: im.url,
                        name: im.name,
                        prompt: im.prompt,
                        size: im.size,
                      })),
                    }
                  : {}),
              }),
            }
          );
          setMessages((prev) => [...prev, m]);
        } catch {
          // 忽略
        }
      }
    } finally {
      streamingRef.current = false;
      setStreaming(false);
      setStreamingText("");
      setStreamingMedia([]);
      abortRef.current = null;
      bufRef.current = "";
      mediaRef.current = [];
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      refreshConversations().catch(() => {});
    }
  }, [input, pendingImages, newConvProviderId, pushDelta, ensureConversation, refreshConversations]);

  // /image 命令：用户消息 + 生图 + assistant 消息（带图片附件）
  const sendImageCommand = useCallback(
    async (prompt: string) => {
      if (streamingRef.current) return;
      setError(null);
      try {
        const convId = await ensureConversation();
        const userMsg = await apiJson<Message>(
          `/api/conversations/${convId}/messages`,
          {
            method: "POST",
            body: JSON.stringify({ role: "user", content: `/image ${prompt}` }),
          }
        );
        setMessages((prev) => [...prev, userMsg]);

        streamingRef.current = true;
        setStreaming(true);
        bufRef.current = "";
        setStreamingText("");
        setStreamingMedia([]);

        const res = await apiFetch("/api/image", {
          method: "POST",
          body: JSON.stringify({ prompt }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `生图失败（HTTP ${res.status}）`);
        }
        const { images } = (await res.json()) as { images: GeneratedImage[] };
        const content =
          images.map((im) => `![${prompt}](${im.url})`).join("\n\n") ||
          "（未生成图片）";
        const m = await apiJson<Message>(`/api/conversations/${convId}/messages`, {
          method: "POST",
          body: JSON.stringify({
            role: "assistant",
            content,
            attachments: images.map((im) => ({
              type: "image",
              url: im.url,
              name: im.name,
              prompt: im.prompt,
              size: im.size,
            })),
          }),
        });
        setMessages((prev) => [...prev, m]);
      } catch (e) {
        if (e instanceof UnauthorizedError) setNeedPassword(true);
        else setError((e as Error).message);
      } finally {
        streamingRef.current = false;
        setStreaming(false);
        setStreamingText("");
        setStreamingMedia([]);
        refreshConversations().catch(() => {});
      }
    },
    [ensureConversation, refreshConversations]
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const newConversation = useCallback(() => {
    if (streamingRef.current) return;
    setActiveId(null);
    activeIdRef.current = null;
    setActiveConv(null);
    setMessages([]);
    setPendingImages([]);
    setError(null);
    setSidebarOpen(false);
  }, []);

  const deleteConversation = useCallback(
    async (id: number) => {
      if (streamingRef.current) return;
      try {
        await apiJson(`/api/conversations/${id}`, { method: "DELETE" });
        const rest = conversations.filter((c) => c.id !== id);
        setConversations(rest);
        if (id === activeIdRef.current) {
          activeIdRef.current = null;
          setActiveId(null);
          setActiveConv(null);
          setMessages([]);
          if (rest.length > 0) await selectConversation(rest[0].id);
        }
      } catch (e) {
        if (!(e instanceof UnauthorizedError)) setError((e as Error).message);
      }
    },
    [conversations, selectConversation]
  );

  const changeProvider = useCallback(
    async (providerIdStr: string) => {
      const pid = Number(providerIdStr);
      setNewConvProviderId(providerIdStr);
      if (!activeConv) return;
      try {
        const updated = await apiJson<Conversation>(
          `/api/conversations/${activeConv.id}`,
          { method: "PATCH", body: JSON.stringify({ providerId: pid }) }
        );
        setActiveConv(updated);
        setConversations((prev) =>
          prev.map((c) => (c.id === updated.id ? updated : c))
        );
      } catch (e) {
        if (!(e instanceof UnauthorizedError)) setError((e as Error).message);
      }
    },
    [activeConv]
  );

  const toggleRetrieval = useCallback(
    async (v: boolean) => {
      if (!activeConv) return;
      try {
        const updated = await apiJson<Conversation>(
          `/api/conversations/${activeConv.id}`,
          { method: "PATCH", body: JSON.stringify({ retrievalEnabled: v }) }
        );
        setActiveConv(updated);
        setConversations((prev) =>
          prev.map((c) => (c.id === updated.id ? updated : c))
        );
      } catch (e) {
        if (!(e instanceof UnauthorizedError)) setError((e as Error).message);
      }
    },
    [activeConv]
  );

  // 图片上传：先传 /api/media，拿 URL 后加入待发列表
  const addImages = useCallback(async (files: File[]) => {
    for (const file of files) {
      if (!file.type.startsWith("image/")) continue;
      try {
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch("/api/media", { method: "POST", body: fd });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `上传失败 HTTP ${res.status}`);
        }
        const j = (await res.json()) as { url: string; name: string };
        setPendingImages((prev) => [...prev, j]);
      } catch (e) {
        setError((e as Error).message);
      }
    }
  }, []);

  // 自动滚动到底部
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, streamingText, streamingMedia.length]);

  const selectedProviderId =
    activeConv?.providerId?.toString() ??
    newConvProviderId ??
    (providers[0] ? String(providers[0].id) : "");

  const hasSttProvider = providers.some((p) => p.endpoints.includes("audio"));

  const submitPassword = () => {
    if (!passwordInput.trim()) return;
    sessionStorage.setItem("access_password", passwordInput.trim());
    setPasswordInput("");
    setNeedPassword(false);
    loadInitial();
  };

  return (
    <div className="flex h-screen gap-2 overflow-hidden p-2">
      {/* 桌面侧边栏：浮动玻璃栏 */}
      <Sidebar
        className="hidden md:flex"
        conversations={conversations}
        activeId={activeId}
        onSelect={selectConversation}
        onNew={newConversation}
        onDelete={deleteConversation}
        onOpenSettings={() => setSettingsOpen(true)}
      />
      {/* 移动端抽屉 */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-xs"
            onClick={() => setSidebarOpen(false)}
          />
          <Sidebar
            className="absolute inset-y-2 left-2 w-64 rounded-2xl"
            conversations={conversations}
            activeId={activeId}
            onSelect={selectConversation}
            onNew={newConversation}
            onDelete={deleteConversation}
            onOpenSettings={() => {
              setSidebarOpen(false);
              setSettingsOpen(true);
            }}
            onClose={() => setSidebarOpen(false)}
          />
        </div>
      )}

      <main className="flex min-w-0 flex-1 flex-col gap-2">
        {/* 顶栏：浮动玻璃栏 */}
        <header className="glass-panel flex h-12 items-center gap-2 rounded-2xl px-3">
          <Button
            size="icon"
            variant="ghost"
            className="md:hidden"
            onClick={() => setSidebarOpen(true)}
            aria-label="菜单"
          >
            <Menu className="size-4" />
          </Button>
          <span className="brand-text hidden shrink-0 text-sm sm:inline">AI 工作台</span>
          <h1 className="min-w-0 flex-1 truncate text-sm font-medium">
            {activeConv?.title ?? "新对话"}
          </h1>
          <Select
            value={selectedProviderId || undefined}
            onValueChange={changeProvider}
            disabled={providers.length === 0}
          >
            <SelectTrigger className="h-8 w-[170px] text-xs md:w-[210px]">
              <SelectValue
                placeholder={providers.length === 0 ? "未配置服务商" : "选择服务商"}
              />
            </SelectTrigger>
            <SelectContent>
              {providers.map((p) => (
                <SelectItem key={p.id} value={String(p.id)}>
                  {p.name} · {p.model}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="icon"
            variant="ghost"
            disabled={!activeConv}
            onClick={() => setSessionSettingsOpen(true)}
            aria-label="会话设置"
          >
            <Settings2 className="size-4" />
          </Button>
          <ThemeToggle />
        </header>

        {/* 消息区 */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          <div className="mx-auto flex max-w-3xl flex-col gap-4 px-3 py-6 md:px-4">
            {booting ? (
              <p className="py-16 text-center text-sm text-muted-foreground">
                加载中…
              </p>
            ) : messages.length === 0 && !streaming ? (
              <div className="flex flex-col items-center gap-4 py-20 text-center">
                <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/10">
                  <Sparkles className="size-7 text-primary" />
                </div>
                <div>
                  <p className="text-lg font-medium">开始新的对话</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {providers.length === 0
                      ? "先在设置中添加一个 AI 服务商（BYOK），即可开始聊天"
                      : "聊天 · 画图（/image）· 图片理解 · 语音 · 文档检索"}
                  </p>
                </div>
                {providers.length === 0 && (
                  <Button onClick={() => setSettingsOpen(true)}>打开设置</Button>
                )}
              </div>
            ) : (
              <>
                {messages.map((m) => (
                  <MessageBubble
                    key={m.id}
                    role={m.role}
                    content={m.content}
                    attachments={m.attachments}
                    onRegenerate={sendImageCommand}
                  />
                ))}
                {streaming && (
                  <MessageBubble
                    role="assistant"
                    content={streamingText}
                    streaming
                    attachments={
                      streamingMedia.length > 0
                        ? streamingMedia.map((im) => ({
                            type: "image" as const,
                            url: im.url,
                            name: im.name,
                            prompt: im.prompt,
                            size: im.size,
                          }))
                        : null
                    }
                  />
                )}
              </>
            )}
          </div>
        </div>

        {/* 错误横幅 */}
        {error && (
          <div className="mx-auto w-full max-w-3xl px-3 md:px-4">
            <div className="flex items-center justify-between gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <span className="min-w-0 flex-1 truncate">{error}</span>
              <button onClick={() => setError(null)} aria-label="关闭">
                ✕
              </button>
            </div>
          </div>
        )}

        <Composer
          value={input}
          onChange={setInput}
          onSend={send}
          onStop={stop}
          streaming={streaming}
          disabled={booting || providers.length === 0}
          pendingImages={pendingImages}
          onAddImages={addImages}
          onRemoveImage={(idx) =>
            setPendingImages((prev) => prev.filter((_, i) => i !== idx))
          }
          onOpenDocuments={() => setDocumentsOpen(true)}
          hasSttProvider={hasSttProvider}
          onError={(msg) => msg && setError(msg)}
          retrievalEnabled={activeConv?.retrievalEnabled ?? false}
        />
      </main>

      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        providers={providers}
        onChanged={() => {
          loadProviders().catch(() => {});
        }}
      />
      {activeConv && (
        <SessionSettings
          conversation={activeConv}
          open={sessionSettingsOpen}
          onOpenChange={setSessionSettingsOpen}
          onSaved={(c) => {
            setActiveConv(c);
            setConversations((prev) => prev.map((x) => (x.id === c.id ? c : x)));
          }}
        />
      )}
      <DocumentsDialog
        open={documentsOpen}
        onOpenChange={setDocumentsOpen}
        retrievalEnabled={activeConv?.retrievalEnabled ?? false}
        onToggleRetrieval={toggleRetrieval}
      />

      {/* 访问密码门 */}
      <Dialog open={needPassword} onOpenChange={() => {}}>
        <DialogContent className="sm:max-w-sm [&>button]:hidden">
          <DialogHeader>
            <DialogTitle>需要访问密码</DialogTitle>
            <DialogDescription>
              该服务已开启访问保护（ACCESS_PASSWORD）
            </DialogDescription>
          </DialogHeader>
          <Input
            type="password"
            value={passwordInput}
            onChange={(e) => setPasswordInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submitPassword()}
            placeholder="访问密码"
            autoFocus
          />
          <DialogFooter>
            <Button onClick={submitPassword}>进入</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
