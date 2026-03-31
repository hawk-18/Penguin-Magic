// AI 代理相关 API - 通过后端调用 AI 服务
import { del, get, post, put } from './index';
import { ThirdPartyApiConfig, NanoBananaRequest, NanoBananaResponse, OpenAIChatRequest, OpenAIChatResponse } from '../../types';

export interface AiChatSession {
  id: string;
  title: string;
  messages: Array<{
    id: string;
    role: 'system' | 'user' | 'assistant';
    content: string;
    images?: string[];
    timestamp: number;
  }>;
  createdAt: number;
  updatedAt: number;
  isPinned: boolean;
}

// 获取 API 配置
export const getAiConfig = async (): Promise<{ success: boolean; data?: Partial<ThirdPartyApiConfig>; error?: string }> => {
  return get<Partial<ThirdPartyApiConfig>>('/ai/config');
};

// 设置 API 配置
export const setAiConfig = async (config: Partial<ThirdPartyApiConfig>): Promise<{ success: boolean; data?: Partial<ThirdPartyApiConfig>; error?: string }> => {
  return post<Partial<ThirdPartyApiConfig>>('/ai/config', config);
};

// 图像生成
export const generateImage = async (request: NanoBananaRequest): Promise<{ success: boolean; data?: NanoBananaResponse; error?: string }> => {
  return post<NanoBananaResponse>('/ai/generate-image', request);
};

// 非流式聊天（用于直接返回内容）
export const chatCompletionSync = async (
  request: OpenAIChatRequest
): Promise<{ success: boolean; data?: { content: string }; error?: string }> => {
  return post<{ content: string }>('/ai/chat/sync', request);
};

/**
 * 非流式聊天：走 `/ai/chat/sync`，返回 OpenAI 兼容结构（便于沿用 choices[0].message.content）。
 * 流式请直接使用 fetch('/api/ai/chat') 读 SSE（见 ChatPage.streamChatCompletion）。
 */
export const chatCompletion = async (
  request: OpenAIChatRequest
): Promise<{ success: boolean; data?: OpenAIChatResponse; error?: string }> => {
  if (request.stream) {
    return {
      success: false,
      error: 'chatCompletion 仅支持非流式；流式请使用 fetch 读取 /api/ai/chat',
    };
  }
  const r = await chatCompletionSync(request);
  if (!r.success || r.data == null) {
    return { success: false, error: r.error || '请求失败' };
  }
  const content = typeof r.data.content === 'string' ? r.data.content : '';
  const data: OpenAIChatResponse = {
    id: 'chatcmpl-local',
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    choices: [
      {
        index: 0,
        message: { role: 'assistant', content },
        finish_reason: 'stop',
      },
    ],
  };
  return { success: true, data };
};

/** 方舟 contents/generations/tasks：文生视频 / 图生视频（有 referenceMediaUrls 时后端默认用 videoModelI2v） */
export const generateVideoTask = async (body: {
  prompt: string;
  options?: Record<string, unknown>;
  referenceMediaUrls?: string[];
  /** 覆盖 settings 中的 videoModel / videoModelI2v */
  model?: string;
}): Promise<{ success: boolean; data?: any; error?: string }> => {
  return post<any>('/ai/generate-video', body);
};

// 查询方舟生成任务状态
export const getVideoTask = async (
  taskId: string
): Promise<{ success: boolean; data?: any; error?: string }> => {
  return get<any>(`/ai/video-task/${taskId}`);
};

// ========== 会话（历史对话） ==========
export const getChatSessions = async (): Promise<{ success: boolean; data?: AiChatSession[]; error?: string }> => {
  return get<AiChatSession[]>('/ai/sessions');
};

export const createChatSession = async (
  title?: string
): Promise<{ success: boolean; data?: AiChatSession; error?: string }> => {
  return post<AiChatSession>('/ai/sessions', { title });
};

export const updateChatSession = async (
  id: string,
  patch: Partial<Pick<AiChatSession, 'title' | 'isPinned'>>
): Promise<{ success: boolean; data?: AiChatSession; error?: string }> => {
  return put<AiChatSession>(`/ai/sessions/${id}`, patch);
};

export const deleteChatSession = async (
  id: string
): Promise<{ success: boolean; message?: string; error?: string }> => {
  return del<any>(`/ai/sessions/${id}`);
};

export const addChatMessage = async (
  sessionId: string,
  body: { role: 'user' | 'assistant'; content: string; images?: string[] }
): Promise<{ success: boolean; data?: any; error?: string }> => {
  return post<any>(`/ai/sessions/${sessionId}/messages`, body);
};

// 测试 API 连接
export const testConnection = async (baseUrl: string, apiKey: string): Promise<{ success: boolean; data?: any; error?: string; message?: string }> => {
  return post('/ai/test-connection', { baseUrl, apiKey });
};

// 通用代理请求
export const proxyRequest = async (
  endpoint: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'POST',
  data?: any,
  config?: Partial<ThirdPartyApiConfig>
): Promise<{ success: boolean; data?: any; error?: string }> => {
  return post('/ai/proxy', { endpoint, method, data, config });
};

// 图片分析（通过后端的 AI 聊天接口）
export const analyzeImage = async (
  imageBase64: string,
  systemInstruction: string,
  userMessage: string,
  model: string = 'gemini-2.5-pro'
): Promise<{ success: boolean; data?: string; error?: string }> => {
  const request: OpenAIChatRequest = {
    model,
    messages: [
      { role: 'system', content: systemInstruction },
      {
        role: 'user',
        content: [
          { type: 'text', text: userMessage },
          { type: 'image_url', image_url: { url: imageBase64 } },
        ],
      },
    ],
    max_tokens: 4096,
    temperature: 0.7,
  };

  const result = await chatCompletion(request);

  if (result.success && result.data?.choices?.[0]?.message?.content) {
    return {
      success: true,
      data: result.data.choices[0].message.content,
    };
  }

  return {
    success: false,
    error: result.error || '分析失败',
  };
};
