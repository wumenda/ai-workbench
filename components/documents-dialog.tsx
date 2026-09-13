"use client";

import { useEffect, useRef, useState } from "react";
import { FileText, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { apiJson } from "@/lib/client";
import type { DocumentInfo } from "@/lib/types";

export function DocumentsDialog({
  open,
  onOpenChange,
  retrievalEnabled,
  onToggleRetrieval,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  retrievalEnabled: boolean;
  onToggleRetrieval: (v: boolean) => void;
}) {
  const [docs, setDocs] = useState<DocumentInfo[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    try {
      setDocs(await apiJson<DocumentInfo[]>("/api/documents"));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  useEffect(() => {
    if (open) {
      setError(null);
      load();
    }
  }, [open]);

  const upload = async (file: File) => {
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/documents", { method: "POST", body: fd });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const remove = async (id: number) => {
    try {
      await apiJson(`/api/documents/${id}`, { method: "DELETE" });
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>文档库（RAG）</DialogTitle>
          <DialogDescription>
            上传 PDF / TXT / MD，开启检索后对话自动引用相关内容
          </DialogDescription>
        </DialogHeader>

        <label className="flex items-center justify-between rounded-lg border px-3 py-2.5">
          <div>
            <p className="text-sm font-medium">本会话检索增强</p>
            <p className="text-xs text-muted-foreground">
              {retrievalEnabled
                ? "开启中：发送消息时自动检索文档片段"
                : "关闭中：对话不引用文档"}
            </p>
          </div>
          <Switch
            checked={retrievalEnabled}
            onCheckedChange={(v) => onToggleRetrieval(v)}
          />
        </label>

        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.txt,.md"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) upload(f);
            e.target.value = "";
          }}
        />
        <Button onClick={() => fileInputRef.current?.click()} disabled={uploading}>
          <Upload className="size-4" />
          {uploading ? "解析并向量化中…" : "上传文档"}
        </Button>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex flex-col gap-2">
          {docs.length === 0 && (
            <p className="py-4 text-center text-sm text-muted-foreground">
              还没有文档
            </p>
          )}
          {docs.map((d) => (
            <div key={d.id} className="flex items-center gap-3 rounded-lg border p-3">
              <FileText className="size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{d.name}</p>
                <p className="text-xs text-muted-foreground">
                  {d.chunkCount} 个片段 · {(d.size / 1024).toFixed(0)} KB
                </p>
              </div>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => remove(d.id)}
                aria-label="删除文档"
              >
                <Trash2 className="size-4 text-muted-foreground hover:text-destructive" />
              </Button>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
