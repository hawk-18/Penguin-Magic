// API 基础配置和请求封装
// 默认使用相对路径 `/api`（本地开发时由 Vite 代理到 Node 后端）。
// 部署静态前端时设置环境变量 VITE_API_BASE 为后端根地址（无尾斜杠），例如 https://api.example.com

function trimTrailingSlash(s: string): string {
  return s.replace(/\/$/, '');
}

const envOrigin =
  typeof import.meta.env.VITE_API_BASE === 'string' ? import.meta.env.VITE_API_BASE.trim() : '';
/** 后端 HTTP 根地址；未配置时为空字符串，表示与当前页面同源 */
export const API_ORIGIN = envOrigin ? trimTrailingSlash(envOrigin) : '';

/** 与后端 `app.use('/api', …)` 一致；未设置 VITE_API_BASE 时为 `/api` */
export const API_BASE = API_ORIGIN ? `${API_ORIGIN}/api` : '/api';

/**
 * 将后端返回的相对路径（如 `/api/output/a.png`、`/files/input/x.png`）转为可请求的 URL。
 * 未设置 VITE_API_BASE 时保持相对路径。
 */
export function resolveBackendUrl(path: string): string {
  if (!path) return path;
  if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('//')) {
    return path;
  }
  if (path.startsWith('data:') || path.startsWith('blob:')) {
    return path;
  }
  if (API_ORIGIN) {
    const p = path.startsWith('/') ? path : `/${path}`;
    return `${API_ORIGIN}${p}`;
  }
  return path.startsWith('/') ? path : `/${path}`;
}

/**
 * 统一 API 响应类型
 * 成功时返回 { success: true, data: T }
 * 失败时返回 { success: false, error: string, message?: string }
 */
export type ApiResponse<T> = 
  | { success: true; data: T; message?: string }
  | { success: false; data?: undefined; error: string; message?: string };

/**
 * API 错误类型
 */
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly errorCode?: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * 通用请求方法
 * 处理 HTTP 错误和业务错误
 */
async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  try {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
    });

    // 处理 HTTP 错误状态码
    if (!response.ok) {
      // 尝试解析错误响应
      try {
        const errorData = await response.json();
        return {
          success: false,
          error: errorData.error || `HTTP ${response.status}: ${response.statusText}`,
          message: errorData.message,
        };
      } catch {
        return {
          success: false,
          error: `HTTP ${response.status}: ${response.statusText}`,
        };
      }
    }

    const data = await response.json();
    return data;
  } catch (error) {
    // 网络错误或请求失败
    const errorMessage = error instanceof Error 
      ? error.message 
      : '网络请求失败';
    
    return {
      success: false,
      error: errorMessage,
    };
  }
}

// GET 请求
export const get = <T>(endpoint: string): Promise<ApiResponse<T>> => 
  request<T>(endpoint, { method: 'GET' });

// POST 请求
export const post = <T>(endpoint: string, body?: unknown): Promise<ApiResponse<T>> =>
  request<T>(endpoint, {
    method: 'POST',
    body: body ? JSON.stringify(body) : undefined,
  });

// PUT 请求
export const put = <T>(endpoint: string, body?: unknown): Promise<ApiResponse<T>> =>
  request<T>(endpoint, {
    method: 'PUT',
    body: body ? JSON.stringify(body) : undefined,
  });

// DELETE 请求
export const del = <T>(endpoint: string): Promise<ApiResponse<T>> => 
  request<T>(endpoint, { method: 'DELETE' });

// 文件上传 - 保存到本地 output 目录
export const saveOutputImage = async (imageData: string, filename?: string): Promise<{ success: boolean; data?: any; error?: string }> => {
  return post('/files/save-output', { imageData, filename });
};

// 文件上传 - 保存到本地 input 目录  
export const saveInputImage = async (imageData: string, filename?: string): Promise<{ success: boolean; data?: any; error?: string }> => {
  return post('/files/save-input', { imageData, filename });
};

// 获取服务器状态
export const getServerStatus = async () => {
  return get<{
    status: string;
    version: string;
    mode: string;
    input_dir: string;
    output_dir: string;
  }>('/status');
};
