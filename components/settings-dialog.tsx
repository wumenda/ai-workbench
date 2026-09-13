"use client";

import { useEffect, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { apiJson } from "@/lib/client";
import { PROVIDER_PRESETS } from "@/lib/presets";
import type { AppSettings, Provider } from "@/lib/types";

interface FormState {
  presetId: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  chat: boolean;
  image: boolean;
  audio: boolean;
  embedding: boolean;
}

const defaultForm: FormState = {
  presetId: "openrouter",
  name: "",
  baseUrl: "",
  apiKey: "",
  model: "",
  chat: true,
  image: false,
  audio: false,
  embedding: false,
};

function formFromPreset(presetId: string): FormState {
  const p = PROVIDER_PRESETS.find((x) => x.id === presetId);
  if (!p) return { ...defaultForm, presetId };
  return {
    presetId: p.id,
    name: p.id === "custom" ? "" : p.name,
    baseUrl: p.baseUrl,
    apiKey: "",
    model: p.model,
    chat: p.endpoints.includes("chat"),
    image: p.endpoints.includes("image"),
    audio: p.endpoints.includes("audio"),
    embedding: p.endpoints.includes("embedding"),
  };
}

// 能力服务：每类能力可独立指定 Provider（留空 = 自动选择第一个支持的）与模型
const CAPABILITIES: {
  key: "image" | "stt" | "tts" | "embedding";
  label: string;
  desc: string;
  providerKey: keyof AppSettings;
  modelKey: keyof AppSettings;
  defaultModel: string;
}[] = [
  {
    key: "image",
    label: "图像生成",
    desc: "画图工具与 /image 命令",
    providerKey: "imageProviderId",
    modelKey: "imageModel",
    defaultModel: "",
  },
  {
    key: "stt",
    label: "语音识别（STT）",
    desc: "录音转文字，如 whisper-1",
    providerKey: "sttProviderId",
    modelKey: "sttModel",
    defaultModel: "whisper-1",
  },
  {
    key: "tts",
    label: "语音合成（TTS）",
    desc: "回复朗读，如 tts-1",
    providerKey: "ttsProviderId",
    modelKey: "ttsModel",
    defaultModel: "tts-1",
  },
  {
    key: "embedding",
    label: "向量化",
    desc: "文档检索，如 text-embedding-3-small",
    providerKey: "embeddingProviderId",
    modelKey: "embeddingModel",
    defaultModel: "",
  },
];

export function SettingsDialog({
  open,
  onOpenChange,
  providers,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  providers: Provider[];
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState<Provider | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [settingsSaving, setSettingsSaving] = useState(false);

  // 打开时加载能力设置
  useEffect(() => {
    if (open) {
      apiJson<AppSettings>("/api/settings")
        .then(setSettings)
        .catch(() => {});
    }
  }, [open]);

  const startCreate = () => {
    setEditing(null);
    setForm(formFromPreset("openrouter"));
    setError(null);
  };

  const startEdit = (p: Provider) => {
    setEditing(p);
    setForm({
      presetId: "custom",
      name: p.name,
      baseUrl: p.baseUrl,
      apiKey: p.apiKey,
      model: p.model,
      chat: p.endpoints.includes("chat"),
      image: p.endpoints.includes("image"),
      audio: p.endpoints.includes("audio"),
      embedding: p.endpoints.includes("embedding"),
    });
    setError(null);
  };

  const save = async () => {
    if (!form) return;
    if (!form.name.trim() || !form.baseUrl.trim() || !form.model.trim()) {
      setError("名称、Base URL、模型均为必填");
      return;
    }
    setSaving(true);
    setError(null);
    const endpoints = [
      form.chat && "chat",
      form.image && "image",
      form.audio && "audio",
      form.embedding && "embedding",
    ].filter(Boolean) as string[];
    const payload = {
      name: form.name.trim(),
      baseUrl: form.baseUrl.trim(),
      apiKey: form.apiKey.trim(),
      model: form.model.trim(),
      endpoints,
    };
    try {
      if (editing) {
        await apiJson(`/api/providers/${editing.id}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
      } else {
        await apiJson("/api/providers", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }
      setForm(null);
      setEditing(null);
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (p: Provider) => {
    try {
      await apiJson(`/api/providers/${p.id}`, { method: "DELETE" });
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const saveCapability = async () => {
    if (!settings) return;
    setSettingsSaving(true);
    setError(null);
    try {
      const saved = await apiJson<AppSettings>("/api/settings", {
        method: "PUT",
        body: JSON.stringify(settings),
      });
      setSettings(saved);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSettingsSaving(false);
    }
  };

  const preset = form ? PROVIDER_PRESETS.find((x) => x.id === form.presetId) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>设置</DialogTitle>
          <DialogDescription>
            配置 AI 服务商（BYOK）：任何 OpenAI 兼容端点均可接入
          </DialogDescription>
        </DialogHeader>

        {form === null ? (
          <div className="flex flex-col gap-2">
            {providers.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                尚未配置服务商，先添加一个
              </p>
            )}
            {providers.map((p) => (
              <div
                key={p.id}
                className="flex items-center gap-3 rounded-lg border p-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {p.name}
                    <span className="ml-2 text-xs text-muted-foreground">
                      {p.endpoints.join(" / ")}
                    </span>
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {p.model} · {p.baseUrl}
                  </p>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => startEdit(p)}
                  aria-label="编辑"
                >
                  <Pencil className="size-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => remove(p)}
                  aria-label="删除"
                >
                  <Trash2 className="size-4 text-muted-foreground hover:text-destructive" />
                </Button>
              </div>
            ))}
            <Button onClick={startCreate} className="mt-1">
              <Plus className="size-4" />
              添加服务商
            </Button>

            {settings && (
              <>
                <Separator className="my-3" />
                <p className="text-sm font-medium">能力服务</p>
                <p className="text-xs text-muted-foreground">
                  各能力可独立指定服务商与模型；留空则自动使用第一个支持的服务商
                </p>
                <div className="flex flex-col gap-3">
                  {CAPABILITIES.map((cap) => {
                    const providerValue = settings[cap.providerKey];
                    const modelValue = settings[cap.modelKey] as string;
                    return (
                      <div
                        key={cap.key}
                        className="flex flex-col gap-2 rounded-lg border p-3"
                      >
                        <div>
                          <p className="text-sm font-medium">{cap.label}</p>
                          <p className="text-xs text-muted-foreground">{cap.desc}</p>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <Select
                            value={providerValue ? String(providerValue) : "auto"}
                            onValueChange={(v) =>
                              setSettings({
                                ...settings,
                                [cap.providerKey]:
                                  v === "auto" ? null : Number(v),
                              })
                            }
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="auto">自动选择</SelectItem>
                              {providers.map((p) => (
                                <SelectItem key={p.id} value={String(p.id)}>
                                  {p.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Input
                            value={modelValue}
                            onChange={(e) =>
                              setSettings({
                                ...settings,
                                [cap.modelKey]: e.target.value,
                              })
                            }
                            placeholder={
                              cap.defaultModel || "跟随服务商默认模型"
                            }
                            className="h-8 text-xs"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={saveCapability}
                  disabled={settingsSaving}
                  className="self-end"
                >
                  {settingsSaving ? "保存中…" : "保存能力设置"}
                </Button>
              </>
            )}

            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label>从预设开始</Label>
              <Select
                value={form.presetId}
                onValueChange={(v) =>
                  setForm((f) => ({ ...(f ?? form), ...formFromPreset(v) }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROVIDER_PRESETS.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {preset?.hint && (
                <p className="text-xs text-muted-foreground">{preset.hint}</p>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <Label>名称</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="如：DeepSeek 官方"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Base URL</Label>
              <Input
                value={form.baseUrl}
                onChange={(e) => setForm({ ...form, baseUrl: e.target.value })}
                placeholder="https://api.example.com/v1"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>API Key {preset?.keyOptional && "（可留空）"}</Label>
              <Input
                type="password"
                value={form.apiKey}
                onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
                placeholder="sk-..."
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>模型</Label>
              <Input
                value={form.model}
                onChange={(e) => setForm({ ...form, model: e.target.value })}
                placeholder="deepseek-chat"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>支持的端点</Label>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    ["chat", "对话"],
                    ["image", "图像"],
                    ["audio", "语音"],
                    ["embedding", "向量"],
                  ] as const
                ).map(([key, label]) => (
                  <label
                    key={key}
                    className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm"
                  >
                    {label}
                    <Switch
                      checked={form[key]}
                      onCheckedChange={(v) => setForm({ ...form, [key]: v })}
                    />
                  </label>
                ))}
              </div>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <DialogFooter>
              <Button variant="outline" onClick={() => setForm(null)}>
                取消
              </Button>
              <Button onClick={save} disabled={saving}>
                {saving ? "保存中…" : "保存"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
