"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, ImagePlus, Library, Mic, Square, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch } from "@/lib/client";
import { cn } from "@/lib/utils";

export function Composer({
  value,
  onChange,
  onSend,
  onStop,
  streaming,
  disabled,
  pendingImages,
  onAddImages,
  onRemoveImage,
  onOpenDocuments,
  hasSttProvider,
  onError,
  retrievalEnabled,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onStop: () => void;
  streaming: boolean;
  disabled?: boolean;
  pendingImages: { url: string; name: string }[];
  onAddImages: (files: File[]) => void;
  onRemoveImage: (idx: number) => void;
  onOpenDocuments: () => void;
  hasSttProvider: boolean;
  onError: (msg: string) => void;
  retrievalEnabled: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  // 自适应高度
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [value]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (!streaming && (value.trim() || pendingImages.length > 0)) onSend();
    }
  };

  // ---- 语音输入：Provider STT 优先，浏览器 Web Speech 兜底 ----
  const startRecording = async () => {
    onError("");
    if (!hasSttProvider) {
      // 浏览器 Web Speech 兜底（Chrome/Edge）
      const SR =
        (window as unknown as Record<string, unknown>).webkitSpeechRecognition ??
        (window as unknown as Record<string, unknown>).SpeechRecognition;
      if (!SR) {
        onError("当前浏览器不支持语音识别，请在设置中配置支持语音的服务商");
        return;
      }
      try {
        const rec = new (SR as new () => {
          lang: string;
          interimResults: boolean;
          continuous: boolean;
          onresult: (e: { results: { [k: number]: { [k: number]: { transcript: string } } } }) => void;
          onerror: (e: { error: string }) => void;
          onend: () => void;
          start: () => void;
          stop: () => void;
        })();
        rec.lang = navigator.language.startsWith("zh") ? "zh-CN" : navigator.language;
        rec.interimResults = false;
        rec.continuous = false;
        rec.onresult = (e) => {
          const t = e.results?.[0]?.[0]?.transcript;
          if (t) onChange((value ? `${value} ` : "") + t);
        };
        rec.onerror = (e) => onError(`语音识别失败: ${e.error}`);
        rec.onend = () => setRecording(false);
        rec.start();
        setRecording(true);
      } catch (e) {
        onError(`语音识别启动失败: ${(e as Error).message}`);
      }
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, {
          type: rec.mimeType || "audio/webm",
        });
        await transcribe(blob);
      };
      rec.start();
      recorderRef.current = rec;
      setRecording(true);
    } catch (e) {
      onError(`无法访问麦克风: ${(e as Error).message}`);
    }
  };

  const stopRecording = () => {
    if (recorderRef.current) {
      recorderRef.current.stop();
      recorderRef.current = null;
    } else {
      setRecording(false);
    }
  };

  const transcribe = async (blob: Blob) => {
    setTranscribing(true);
    try {
      const fd = new FormData();
      fd.append("audio", blob, "recording.webm");
      const res = await apiFetch("/api/audio/transcriptions", {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      const j = (await res.json()) as { text?: string };
      if (j.text) onChange((value ? `${value} ` : "") + j.text);
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setTranscribing(false);
    }
  };

  const canSend = !streaming && (value.trim().length > 0 || pendingImages.length > 0);

  return (
    <div className="px-2 pb-2">
      <div className="glass-panel mx-auto max-w-3xl rounded-2xl p-2">
        {(pendingImages.length > 0 || recording || transcribing) && (
          <div className="mb-2 flex flex-wrap items-center gap-2">
            {pendingImages.map((img, i) => (
              <span
                key={img.url}
                className="relative inline-block overflow-hidden rounded-lg border"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img.url} alt={img.name} className="size-16 object-cover" />
                <button
                  onClick={() => onRemoveImage(i)}
                  className="absolute right-0.5 top-0.5 rounded-full bg-black/60 p-0.5 text-white"
                  aria-label="移除图片"
                >
                  <X className="size-3" />
                </button>
              </span>
            ))}
            {transcribing && (
              <span className="text-xs text-muted-foreground">语音识别中…</span>
            )}
            {recording && !transcribing && (
              <span className="flex items-center gap-1.5 text-xs text-destructive">
                <span className="size-2 animate-pulse rounded-full bg-destructive" />
                录音中，点击麦克风停止
              </span>
            )}
          </div>
        )}
        <div className="flex items-end gap-2">
          <div className="flex flex-col gap-1 pb-1">
            <div className="flex gap-0.5">
              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  onAddImages(Array.from(e.target.files ?? []));
                  e.target.value = "";
                }}
              />
              <Button
                size="icon"
                variant="ghost"
                className="size-8"
                onClick={() => imageInputRef.current?.click()}
                disabled={streaming}
                title="添加图片（视觉理解）"
              >
                <ImagePlus className="size-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className={cn("size-8", retrievalEnabled && "text-primary")}
                onClick={onOpenDocuments}
                disabled={streaming}
                title={retrievalEnabled ? "文档库（本会话已开启检索）" : "文档库"}
              >
                <Library className="size-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className={cn("size-8", recording && "text-destructive")}
                onClick={recording ? stopRecording : startRecording}
                disabled={streaming || transcribing}
                title={
                  hasSttProvider
                    ? recording
                      ? "停止录音并识别"
                      : "按住说话（录音识别）"
                    : "浏览器语音识别"
                }
              >
                <Mic className="size-4" />
              </Button>
            </div>
          </div>
          <Textarea
            ref={ref}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入消息，Enter 发送，Shift+Enter 换行；输入 /image 可直接生图"
            rows={1}
            disabled={disabled && !streaming}
            className="max-h-[200px] min-h-[44px] flex-1 resize-none rounded-xl"
          />
          {streaming ? (
            <Button
              onClick={onStop}
              size="icon"
              variant="destructive"
              className="size-11 rounded-xl"
              aria-label="停止生成"
            >
              <Square className="size-4" />
            </Button>
          ) : (
            <Button
              onClick={onSend}
              size="icon"
              disabled={disabled || !canSend}
              className="size-11 rounded-xl"
              aria-label="发送"
            >
              <ArrowUp className="size-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
