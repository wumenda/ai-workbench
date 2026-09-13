"use client";

import { useEffect, useState } from "react";
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
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { apiJson } from "@/lib/client";
import type { Conversation } from "@/lib/types";

export function SessionSettings({
  conversation,
  open,
  onOpenChange,
  onSaved,
}: {
  conversation: Conversation;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: (c: Conversation) => void;
}) {
  const [systemPrompt, setSystemPrompt] = useState("");
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 打开时从会话重置表单
  useEffect(() => {
    if (open) {
      setSystemPrompt(conversation.systemPrompt);
      setTemperature(conversation.temperature);
      setMaxTokens(conversation.maxTokens?.toString() ?? "");
      setError(null);
    }
  }, [open, conversation]);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const updated = await apiJson<Conversation>(
        `/api/conversations/${conversation.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            systemPrompt,
            temperature,
            maxTokens: maxTokens.trim() ? Number(maxTokens) : null,
          }),
        }
      );
      onSaved(updated);
      onOpenChange(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>会话设置</DialogTitle>
          <DialogDescription>
            仅对当前对话生效：系统提示词与采样参数
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <Label>System Prompt</Label>
            <Textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder="你是一个乐于助人的助手…"
              rows={4}
            />
          </div>
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <Label>Temperature（随机性）</Label>
              <span className="font-mono text-sm text-muted-foreground">
                {temperature.toFixed(1)}
              </span>
            </div>
            <Slider
              value={[temperature]}
              onValueChange={([v]) => setTemperature(v)}
              min={0}
              max={2}
              step={0.1}
            />
            <p className="text-xs text-muted-foreground">
              低 = 稳定保守，高 = 发散创意
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <Label>max_tokens（留空使用模型默认）</Label>
            <Input
              type="number"
              min={1}
              value={maxTokens}
              onChange={(e) => setMaxTokens(e.target.value)}
              placeholder="4096"
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "保存中…" : "保存"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
