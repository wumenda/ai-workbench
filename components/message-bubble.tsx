"use client";

import { useRef, useState } from "react";
import { FileText, Loader2, RefreshCw, Square, Volume2 } from "lucide-react";
import { Markdown } from "./markdown";
import { apiFetch } from "@/lib/client";
import type { Attachment } from "@/lib/types";
import { cn } from "@/lib/utils";

export function MessageBubble({
  role,
  content,
  attachments,
  streaming = false,
  onRegenerate,
}: {
  role: "user" | "assistant" | "system";
  content: string;
  attachments?: Attachment[] | null;
  streaming?: boolean;
  onRegenerate?: (prompt: string) => void;
}) {
  const isUser = role === "user";
  const [speaking, setSpeaking] = useState(false);
  const [speakErr, setSpeakErr] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const userImages = (attachments ?? []).filter((a) => a.type === "image");
  const docs = (attachments ?? []).filter((a) => a.type === "document");
  const genImages = isUser ? [] : (attachments ?? []).filter((a) => a.type === "image");

  const toggleSpeak = async () => {
    if (speaking) {
      audioRef.current?.pause();
      audioRef.current = null;
      setSpeaking(false);
      return;
    }
    setSpeakErr(null);
    try {
      const res = await apiFetch("/api/audio/speech", {
        method: "POST",
        body: JSON.stringify({ text: content }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const audio = new Audio(URL.createObjectURL(blob));
      audioRef.current = audio;
      audio.onended = () => {
        setSpeaking(false);
        audioRef.current = null;
      };
      setSpeaking(true);
      await audio.play();
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        setSpeakErr((e as Error).message);
        setSpeaking(false);
      }
    }
  };

  return (
    <div
      className={cn(
        "flex w-full animate-in fade-in slide-in-from-bottom-2 duration-300",
        isUser ? "justify-end" : "justify-start"
      )}
    >
      <div
        className={cn(
          "group/msg",
          isUser
            ? "max-w-[85%] rounded-2xl rounded-br-md bg-gradient-to-b from-[#3b9bff] to-primary px-4 py-2.5 text-[15px] leading-7 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_4px_14px_rgba(0,122,255,0.3)] dark:from-[#2a90ff]"
            : "glass-panel w-full max-w-full rounded-2xl rounded-bl-md px-4 py-2.5"
        )}
      >
        {isUser && (
          <>
            {userImages.length > 0 && (
              <div className="mb-2 flex flex-wrap justify-end gap-2">
                {userImages.map((a, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={i}
                    src={a.url}
                    alt={a.name ?? "图片"}
                    className="max-h-40 rounded-lg border border-white/20 object-cover"
                  />
                ))}
              </div>
            )}
            {content && <p className="whitespace-pre-wrap break-words">{content}</p>}
          </>
        )}
        {!isUser && (
          <>
            <Markdown content={content} streaming={streaming} />
            {streaming && <span className="animate-pulse">▍</span>}
            {genImages.length > 0 && (
              <div className="mt-3 flex flex-col gap-3">
                {genImages.map((a, i) => (
                  <figure key={i} className="overflow-hidden rounded-xl border">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={a.url}
                      alt={a.prompt ?? "生成图片"}
                      className="max-h-96 w-full object-contain bg-black/5"
                    />
                    <figcaption>
                      <details className="px-3 py-2 text-xs text-muted-foreground">
                        <summary className="cursor-pointer select-none">
                          参数{a.size ? ` · ${a.size}` : ""}
                        </summary>
                        <p className="mt-1 break-words">{a.prompt}</p>
                        {onRegenerate && a.prompt && (
                          <button
                            onClick={() => onRegenerate(a.prompt!)}
                            className="mt-1.5 flex items-center gap-1 text-primary hover:underline"
                          >
                            <RefreshCw className="size-3" />
                            用相同参数重新生成
                          </button>
                        )}
                      </details>
                    </figcaption>
                  </figure>
                ))}
              </div>
            )}
            {docs.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {docs.map((d, i) => (
                  <span
                    key={i}
                    className="flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs text-muted-foreground"
                  >
                    <FileText className="size-3" />
                    {d.name ?? d.url}
                  </span>
                ))}
              </div>
            )}
          </>
        )}
      </div>
      {/* 语音播放（assistant 且非流式） */}
      {!isUser && !streaming && content.trim() && (
        <div className="ml-1 flex flex-col items-center self-end pb-2">
          <button
            onClick={toggleSpeak}
            title={speakErr ?? (speaking ? "停止播放" : "朗读这条回复")}
            className={cn(
              "rounded-md p-1.5 text-muted-foreground transition-opacity hover:bg-muted hover:text-foreground",
              speaking
                ? "opacity-100 text-primary"
                : "opacity-0 group-hover/msg:opacity-100",
              speakErr && "text-destructive"
            )}
          >
            {speaking ? (
              <Square className="size-3.5" />
            ) : speakErr ? (
              <Loader2 className="size-3.5" />
            ) : (
              <Volume2 className="size-3.5" />
            )}
          </button>
        </div>
      )}
    </div>
  );
}
