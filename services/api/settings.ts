// 与本地 data/settings.json 同步（经 Node 后端 /api/settings）
import { get, post } from './index';

export type AppSettings = {
  theme?: string;
  geminiApiKey?: string;
  thirdPartyConfig?: Record<string, unknown>;
  comfyuiConfig?: Record<string, unknown>;
  [key: string]: unknown;
};

export const getSettings = async (): Promise<{ success: boolean; data?: AppSettings; error?: string }> => {
  return get<AppSettings>('/settings');
};

/** 合并写入 settings.json（不会整文件覆盖） */
export const patchSettings = async (
  patch: Partial<AppSettings>
): Promise<{ success: boolean; data?: AppSettings; error?: string }> => {
  return post<AppSettings>('/settings', patch);
};
