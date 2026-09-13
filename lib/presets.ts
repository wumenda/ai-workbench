// 内置 Provider 预设模板。
// 用户选择预设后自动填充 base_url / 默认 model，再填自己的 API Key 即可。
// endpoints 声明该服务商支持哪些端点，不支持的在前端置灰（M2/M3 使用）。

export interface ProviderPreset {
  id: string;
  name: string;
  baseUrl: string;
  model: string;
  endpoints: string[];
  /** 是否允许留空 API Key（本地服务） */
  keyOptional?: boolean;
  hint?: string;
}

export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: "openrouter",
    name: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    model: "openai/gpt-4o-mini",
    endpoints: ["chat", "image", "audio", "embedding"],
    hint: "一个 Key 通 400+ 模型，推荐入门",
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    baseUrl: "https://api.deepseek.com/v1",
    model: "deepseek-chat",
    endpoints: ["chat"],
  },
  {
    id: "zhipu",
    name: "智谱 GLM",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    model: "glm-4.6",
    endpoints: ["chat", "image", "embedding"],
  },
  {
    id: "ollama",
    name: "Ollama 本地",
    baseUrl: "http://localhost:11434/v1",
    model: "qwen3:8b",
    endpoints: ["chat", "embedding"],
    keyOptional: true,
    hint: "本地运行，无需 API Key",
  },
  {
    id: "openai",
    name: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
    endpoints: ["chat", "image", "audio", "embedding"],
  },
  {
    id: "custom",
    name: "自定义（OpenAI 兼容）",
    baseUrl: "",
    model: "",
    endpoints: ["chat"],
    hint: "任何 OpenAI 兼容端点：vLLM / LM Studio / 各家官方 API",
  },
];
