import React, { useState, useEffect } from 'react';
import { ThirdPartyApiConfig, getApiConfig, saveApiConfig, checkBalance } from '../../services/pebblingGeminiService';
import { getAiConfig } from '../../services/api/ai';
import { SoraConfig, getSoraConfig, saveSoraConfig } from '../../services/soraService';
import { Icons } from './Icons';

interface ComfyuiConfig {
  enabled: boolean;
  baseUrl: string;
}

interface ApiSettingsProps {
  isOpen: boolean;
  onClose: () => void;
}

const ApiSettings: React.FC<ApiSettingsProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<'gemini' | 'sora' | 'comfyui'>('gemini');
  
  const [config, setConfig] = useState<ThirdPartyApiConfig>({
    enabled: true,
    baseUrl: 'https://ai.t8star.cn',
    apiKey: '',
    model: 'nano-banana-2',
    chatModel: 'gemini-2.5-pro'
  });
  
  const [soraConfig, setSoraConfig] = useState<SoraConfig>({
    apiKey: '',
    baseUrl: 'https://api.openai.com'
  });

  const [comfyuiConfig, setComfyuiConfig] = useState<ComfyuiConfig>({
    enabled: true,
    baseUrl: 'http://127.0.0.1:8188'
  });
  
  const [showApiKey, setShowApiKey] = useState(false);
  const [showSoraKey, setShowSoraKey] = useState(false);
  const [balance, setBalance] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle');
  const [comfyuiStatus, setComfyuiStatus] = useState<string>('');

  useEffect(() => {
    if (!isOpen) return;
    void (async () => {
      try {
        const r = await getAiConfig();
        if (r.success && r.data) {
          setConfig({ ...getApiConfig(), ...(r.data as Partial<ThirdPartyApiConfig>) });
        } else {
          setConfig(getApiConfig());
        }
      } catch {
        setConfig(getApiConfig());
      }
      const savedSoraConfig = getSoraConfig();
      setSoraConfig(savedSoraConfig);
      
      // 加载 ComfyUI 配置
      try {
        const resp = await fetch('/api/ai/comfyui/config');
        const json = await resp.json();
        if (json.success && json.data) {
          setComfyuiConfig({
            enabled: json.data.enabled !== false,
            baseUrl: json.data.baseUrl || 'http://127.0.0.1:8188'
          });
        }
      } catch {
        // 使用默认配置
      }
      
      setSaveStatus('idle');
      setBalance(null);
      setComfyuiStatus('');
    })();
  }, [isOpen]);

  const handleSave = async () => {
    try {
      saveApiConfig(config);
      saveSoraConfig(soraConfig);
      // 保存 ComfyUI 配置
      await fetch('/api/ai/comfyui/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(comfyuiConfig)
      });
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (e) {
      setSaveStatus('error');
    }
  };

  const handleCheckBalance = async () => {
    setIsLoading(true);
    saveApiConfig(config);
    const result = await checkBalance();
    setBalance(result || '无法查询余额');
    setIsLoading(false);
  };

  const handleTestConnection = async () => {
    setIsLoading(true);
    try {
      saveApiConfig(config);
      const response = await fetch(`${config.baseUrl}/v1/models`, {
        headers: {
          'Authorization': `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json'
        }
      });
      if (response.ok) {
        setBalance('连接成功 ✓');
      } else {
        setBalance(`连接失败: ${response.status}`);
      }
    } catch (e) {
      setBalance('连接失败: 网络错误');
    }
    setIsLoading(false);
  };

  const handleTestComfyui = async () => {
    setIsLoading(true);
    setComfyuiStatus('');
    try {
      // 先保存配置
      await fetch('/api/ai/comfyui/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(comfyuiConfig)
      });
      
      const resp = await fetch('/api/ai/comfyui/test', { method: 'POST' });
      const json = await resp.json();
      
      if (json.success && json.connected) {
        if (json.workflowExists) {
          setComfyuiStatus('✓ 连接成功，工作流已就绪');
        } else {
          setComfyuiStatus('✓ 连接成功，但工作流文件不存在');
        }
      } else {
        setComfyuiStatus(`✗ 连接失败: ${json.error || '未知错误'}`);
      }
    } catch (e) {
      setComfyuiStatus(`✗ 测试失败: ${e instanceof Error ? e.message : '网络错误'}`);
    }
    setIsLoading(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center">
      <div className="bg-[#1a1a24] border border-white/10 rounded-2xl w-full max-w-md mx-4 shadow-2xl">
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
              <Icons.Settings className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">API 设置</h2>
              <p className="text-xs text-white/50">配置 AI 服务接口</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-white/10 flex items-center justify-center transition-colors">
            <Icons.Close className="w-5 h-5 text-white/60" />
          </button>
        </div>
        
        {/* Tab 切换 */}
        <div className="flex border-b border-white/10">
          <button 
            onClick={() => setActiveTab('gemini')}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${activeTab === 'gemini' ? 'text-blue-400 border-b-2 border-blue-400' : 'text-white/50 hover:text-white/70'}`}
          >
            T8star / Gemini
          </button>
          <button 
            onClick={() => setActiveTab('sora')}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${activeTab === 'sora' ? 'text-purple-400 border-b-2 border-purple-400' : 'text-white/50 hover:text-white/70'}`}
          >
            Sora 视频
          </button>
          <button 
            onClick={() => setActiveTab('comfyui')}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${activeTab === 'comfyui' ? 'text-green-400 border-b-2 border-green-400' : 'text-white/50 hover:text-white/70'}`}
          >
            ComfyUI
          </button>
        </div>

        <div className="p-4 space-y-4">
          {activeTab === 'gemini' ? (
            /* Gemini/T8star 配置 */
            <>
              <div>
                <label className="block text-sm text-white/70 mb-2">API Key</label>
                <div className="relative">
                  <input
                    type={showApiKey ? 'text' : 'password'}
                    value={config.apiKey}
                    onChange={(e) => setConfig({ ...config, apiKey: e.target.value })}
                    placeholder="sk-xxxxxxxxxxxxxxxx"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-blue-500/50 pr-12"
                  />
                  <button onClick={() => setShowApiKey(!showApiKey)} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70 text-xs">
                    {showApiKey ? '隐藏' : '显示'}
                  </button>
                </div>
                <p className="mt-1 text-xs text-white/40">
                  获取 API Key: <a href="https://ai.t8star.cn/register?aff=64350e39653" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">ai.t8star.cn</a>
                </p>
              </div>
              <div>
                <label className="block text-sm text-white/70 mb-2">API 地址</label>
                <input
                  type="text"
                  value={config.baseUrl}
                  onChange={(e) => setConfig({ ...config, baseUrl: e.target.value })}
                  placeholder="https://ai.t8star.cn"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-blue-500/50"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-white/70 mb-2">图像模型</label>
                  <select value={config.model} onChange={(e) => setConfig({ ...config, model: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500/50 appearance-none cursor-pointer">
                    <option value="nano-banana-2">nano-banana-2</option>
                    <option value="gpt-image-1">gpt-image-1</option>
                    <option value="dall-e-3">dall-e-3</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-white/70 mb-2">文本模型</label>
                  <select value={config.chatModel} onChange={(e) => setConfig({ ...config, chatModel: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500/50 appearance-none cursor-pointer">
                    <option value="gemini-2.5-pro">gemini-2.5-pro</option>
                    <option value="gemini-2.5-flash">gemini-2.5-flash</option>
                    <option value="gpt-4o">gpt-4o</option>
                    <option value="claude-sonnet-4-20250514">claude-sonnet-4</option>
                  </select>
                </div>
              </div>
              {balance && (
                <div className="bg-white/5 border border-white/10 rounded-xl px-4 py-3">
                  <p className="text-sm text-white/80">{balance}</p>
                </div>
              )}
              <div className="flex gap-2">
                <button onClick={handleTestConnection} disabled={isLoading || !config.apiKey} className="flex-1 px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white/70 hover:bg-white/10 hover:text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm">
                  {isLoading ? '测试中...' : '测试连接'}
                </button>
                <button onClick={handleCheckBalance} disabled={isLoading || !config.apiKey} className="flex-1 px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white/70 hover:bg-white/10 hover:text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm">
                  {isLoading ? '查询中...' : '查询余额'}
                </button>
              </div>
            </>
          ) : activeTab === 'sora' ? (
            /* Sora 配置 */
            <>
              <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl px-4 py-3 mb-2">
                <p className="text-xs text-yellow-300">ℹ️ Sora 视频生成需要 OpenAI API 访问权限，也可以使用第三方代理服务</p>
              </div>
              <div>
                <label className="block text-sm text-white/70 mb-2">Sora API Key</label>
                <div className="relative">
                  <input
                    type={showSoraKey ? 'text' : 'password'}
                    value={soraConfig.apiKey}
                    onChange={(e) => setSoraConfig({ ...soraConfig, apiKey: e.target.value })}
                    placeholder="sk-xxxxxxxxxxxxxxxx"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-purple-500/50 pr-12"
                  />
                  <button onClick={() => setShowSoraKey(!showSoraKey)} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70 text-xs">
                    {showSoraKey ? '隐藏' : '显示'}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm text-white/70 mb-2">Sora API 地址</label>
                <input
                  type="text"
                  value={soraConfig.baseUrl}
                  onChange={(e) => setSoraConfig({ ...soraConfig, baseUrl: e.target.value })}
                  placeholder="https://api.openai.com"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-purple-500/50"
                />
                <p className="mt-1 text-xs text-white/40">支持第三方代理地址，如 T8star 等</p>
              </div>
            </>
          ) : (
            /* ComfyUI 配置 */
            <>
              <div className="bg-green-500/10 border border-green-500/30 rounded-xl px-4 py-3 mb-2">
                <p className="text-xs text-green-300">ℹ️ ComfyUI 是开源的图像生成工具，需要本地运行 ComfyUI 服务</p>
              </div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm text-white/70">启用 ComfyUI</label>
                <button
                  onClick={() => setComfyuiConfig({ ...comfyuiConfig, enabled: !comfyuiConfig.enabled })}
                  className={`w-12 h-6 rounded-full transition-colors ${comfyuiConfig.enabled ? 'bg-green-500' : 'bg-white/20'}`}
                >
                  <div className={`w-5 h-5 rounded-full bg-white shadow transform transition-transform ${comfyuiConfig.enabled ? 'translate-x-6' : 'translate-x-0.5'}`} />
                </button>
              </div>
              <div>
                <label className="block text-sm text-white/70 mb-2">ComfyUI 地址</label>
                <input
                  type="text"
                  value={comfyuiConfig.baseUrl}
                  onChange={(e) => setComfyuiConfig({ ...comfyuiConfig, baseUrl: e.target.value })}
                  placeholder="http://127.0.0.1:8188"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-green-500/50"
                />
                <p className="mt-1 text-xs text-white/40">默认地址为 http://127.0.0.1:8188</p>
              </div>
              {comfyuiStatus && (
                <div className={`rounded-xl px-4 py-3 ${comfyuiStatus.includes('✓') ? 'bg-green-500/10 border border-green-500/30' : 'bg-red-500/10 border border-red-500/30'}`}>
                  <p className={`text-sm ${comfyuiStatus.includes('✓') ? 'text-green-300' : 'text-red-300'}`}>{comfyuiStatus}</p>
                </div>
              )}
              <button 
                onClick={handleTestComfyui} 
                disabled={isLoading || !comfyuiConfig.baseUrl} 
                className="w-full px-4 py-2.5 rounded-xl bg-green-500/20 border border-green-500/30 text-green-300 hover:bg-green-500/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm"
              >
                {isLoading ? '测试中...' : '测试连接'}
              </button>
              <div className="bg-white/5 border border-white/10 rounded-xl px-4 py-3">
                <p className="text-xs text-white/50 mb-2">使用说明：</p>
                <ol className="text-xs text-white/40 space-y-1 list-decimal list-inside">
                  <li>下载并安装 ComfyUI</li>
                  <li>启动 ComfyUI 服务（默认端口 8188）</li>
                  <li>确保工作流文件存在：data/comfyui_default_workflow.json</li>
                  <li>点击"测试连接"验证配置</li>
                </ol>
              </div>
            </>
          )}
        </div>
        <div className="p-4 border-t border-white/10 flex justify-end gap-3">
          <button onClick={onClose} className="px-5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white/70 hover:bg-white/10 hover:text-white transition-all">
            取消
          </button>
          <button onClick={handleSave} className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-500 to-purple-600 text-white font-medium hover:opacity-90 transition-all">
            {saveStatus === 'saved' ? '已保存 ✓' : saveStatus === 'error' ? '保存失败' : '保存配置'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ApiSettings;
