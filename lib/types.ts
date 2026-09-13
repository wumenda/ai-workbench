// 共享类型：前后端统一使用 camelCase

export interface Provider {
  id: number;
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  /** 支持的端点：chat / image / audio / embedding */
  endpoints: string[];
  createdAt: number;
}

export interface Conversation {
  id: number;
  title: string;
  providerId: number | null;
  systemPrompt: string;
  temperature: number;
  maxTokens: number | null;
  retrievalEnabled: boolean;
  createdAt: number;
  updatedAt: number;
}

export type MessageRole = "user" | "assistant" | "system";

export interface Attachment {
  type: "image" | "document";
  url: string;
  name?: string;
  /** 生图参数（用于展示与重新生成） */
  prompt?: string;
  size?: string;
}

export interface Message {
  id: number;
  conversationId: number;
  role: MessageRole;
  content: string;
  attachments?: Attachment[] | null;
  createdAt: number;
}

/** 能力级设置：图像/语音/向量可独立指定 Provider 与模型 */
export interface AppSettings {
  imageProviderId: number | null;
  imageModel: string;
  sttProviderId: number | null;
  sttModel: string;
  ttsProviderId: number | null;
  ttsModel: string;
  ttsVoice: string;
  embeddingProviderId: number | null;
  embeddingModel: string;
}

export interface DocumentInfo {
  id: number;
  name: string;
  size: number;
  chunkCount: number;
  createdAt: number;
}

/** 生图结果（本地媒体或远端引用） */
export interface GeneratedImage {
  url: string;
  name: string;
  prompt: string;
  size?: string;
}
