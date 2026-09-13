// SQLite 行（snake_case）→ 前端对象（camelCase）

import type { Attachment, Conversation, DocumentInfo, Message, Provider } from "./types";

export interface ProviderRow {
  id: number;
  name: string;
  base_url: string;
  api_key: string;
  model: string;
  endpoints: string;
  created_at: number;
}

export interface ConversationRow {
  id: number;
  title: string;
  provider_id: number | null;
  system_prompt: string;
  temperature: number;
  max_tokens: number | null;
  retrieval_enabled: number;
  created_at: number;
  updated_at: number;
}

export interface MessageRow {
  id: number;
  conversation_id: number;
  role: string;
  content: string;
  attachments: string | null;
  created_at: number;
}

export function rowToProvider(r: ProviderRow): Provider {
  let endpoints: string[] = ["chat"];
  try {
    const parsed = JSON.parse(r.endpoints);
    if (Array.isArray(parsed) && parsed.length > 0) endpoints = parsed;
  } catch {
    // 保持默认
  }
  return {
    id: r.id,
    name: r.name,
    baseUrl: r.base_url,
    apiKey: r.api_key,
    model: r.model,
    endpoints,
    createdAt: r.created_at,
  };
}

export function rowToConversation(r: ConversationRow): Conversation {
  return {
    id: r.id,
    title: r.title,
    providerId: r.provider_id,
    systemPrompt: r.system_prompt,
    temperature: r.temperature,
    maxTokens: r.max_tokens,
    retrievalEnabled: r.retrieval_enabled === 1,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function parseAttachments(json: string | null): Attachment[] | null {
  if (!json) return null;
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function rowToMessage(r: MessageRow): Message {
  return {
    id: r.id,
    conversationId: r.conversation_id,
    role: r.role as Message["role"],
    content: r.content,
    attachments: parseAttachments(r.attachments),
    createdAt: r.created_at,
  };
}

export function rowToDocument(r: {
  id: number;
  name: string;
  size: number;
  chunk_count: number;
  created_at: number;
}): DocumentInfo {
  return {
    id: r.id,
    name: r.name,
    size: r.size,
    chunkCount: r.chunk_count,
    createdAt: r.created_at,
  };
}
