const fs = require('fs');
const path = require('path');
const express = require('express');
const config = require('../config');
const JsonStorage = require('../utils/jsonStorage');

const router = express.Router();

const CHAT_SESSIONS_FILE = config.DATA_DIR + '/chat_sessions.json';

function getAiConfig() {
  const settings = JsonStorage.load(config.SETTINGS_FILE, {});
  return settings.thirdPartyConfig || {
    enabled: true,
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    apiKey: '',
    /** 文生图默认：Seedream 4（与方舟 images/generations 文档一致） */
    model: 'doubao-seedream-4-0-250828',
    /** 图生图默认模型（有 image 参考且请求未指定 model 时使用） */
    imageModelI2i: 'doubao-seedream-4-0-250828',
    chatModel: 'doubao-1-5-lite-32k-250115',
    /** 文生视频（content 仅 text）；lite 模型易触发账号体验额度上限，默认与 pro 对齐 */
    videoModel: 'doubao-seedance-1-5-pro-251215',
    /** 图生视频：content 含 image_url，与官方示例一致 */
    videoModelI2v: 'doubao-seedance-1-5-pro-251215',
  };
}

function getComfyConfig() {
  const settings = JsonStorage.load(config.SETTINGS_FILE, {});
  const defaults = {
    // 默认开启：只要配置了 baseUrl + workflow 即可用（避免用户忘记把 enabled 设为 true）
    enabled: true,
    baseUrl: 'http://127.0.0.1:8188',
    defaultWorkflow: null,
  };
  const raw = settings.comfyuiConfig;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ...defaults };
  }
  const merged = { ...defaults, ...raw };
  // 避免 settings 里写了空 comfyuiConfig: {} 或 baseUrl 被存成 "" 导致「选了 ComfyUI 完全无反应」
  if (!merged.baseUrl || !String(merged.baseUrl).trim()) {
    merged.baseUrl = defaults.baseUrl;
  }
  return merged;
}

/** 从 data/comfyui_default_workflow.json 加载内置 API 工作流（含 {{prompt}} 占位符） */
function loadComfyWorkflowFromDisk() {
  try {
    const filePath = path.join(config.DATA_DIR, 'comfyui_default_workflow.json');
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    console.warn('[ComfyUI] 读取 comfyui_default_workflow.json 失败:', e?.message || e);
    return null;
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** 方舟 images/generations：image 可为单张 URL 字符串或多张 url/base64 数组 */
function normalizeArkImageInput(image) {
  if (image == null) return undefined;
  if (typeof image === 'string') {
    const s = image.trim();
    return s ? s : undefined;
  }
  if (Array.isArray(image) && image.length > 0) {
    const cleaned = image
      .map((x) => (typeof x === 'string' ? x.trim() : ''))
      .filter(Boolean);
    return cleaned.length ? cleaned : undefined;
  }
  return undefined;
}

/** 是否为图生视频可用的参考地址（与画布节点、方舟 image_url 约定对齐；相对路径需对公网可访问方舟才能拉取） */
function isVideoReferenceUrl(raw) {
  if (typeof raw !== 'string') return false;
  const x = raw.trim();
  if (!x) return false;
  return (
    x.startsWith('data:image') ||
    /^https?:\/\//i.test(x) ||
    x.startsWith('//') ||
    x.startsWith('/files/') ||
    x.startsWith('/api/')
  );
}

function hasImageReferenceForVideo(referenceMediaUrls) {
  if (!Array.isArray(referenceMediaUrls)) return false;
  return referenceMediaUrls.some((u) => isVideoReferenceUrl(u));
}

/**
 * doubao-seedance-1-5-pro：方舟 contents 任务里 --duration 仅支持离散秒数。
 * 图生视频（有参考图）通常为 5、8；文生视频常见为 4、5、8、10、12。
 * 前端若传 2–10 连续整数会触发 InvalidParameter（如 6、7、9）。
 */
function snapArkSeedance15ProDuration(rawDuration, hasImageRef) {
  const n = Math.round(Number(rawDuration));
  const base = Number.isFinite(n) ? n : 5;
  const i2v = [5, 8];
  const t2v = [4, 5, 8, 10, 12];
  const allowed = hasImageRef ? i2v : t2v;
  let best = allowed[0];
  let bestDist = Infinity;
  for (const x of allowed) {
    const d = Math.abs(x - base);
    if (d < bestDist) {
      bestDist = d;
      best = x;
    }
  }
  return best;
}

function normalizeVideoTaskOptions(options, videoModel, referenceMediaUrls) {
  const out = { ...(options && typeof options === 'object' ? options : {}) };
  if (out.duration == null || out.duration === '') return out;
  const model = String(videoModel || '');
  if (/seedance-1-5-pro/i.test(model)) {
    out.duration = snapArkSeedance15ProDuration(
      out.duration,
      hasImageReferenceForVideo(referenceMediaUrls)
    );
  }
  return out;
}

/** 方舟无法访问用户本机的 /files 或 127.0.0.1，会报 content[n].image_url 无效；先在后端读文件或本机 fetch 再转 data URL */
const VIDEO_REF_MIME_BY_EXT = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

/** URL 路径分段常为 encodeURIComponent（如 canvas 名「画布 1」→ %E7%94%BB%E5%B8%83%201），磁盘目录为解码后的真实名 */
function decodeUriPathSegment(segment) {
  if (segment == null || segment === '') return segment;
  try {
    return decodeURIComponent(String(segment).replace(/\+/g, ' '));
  } catch {
    return segment;
  }
}

function mapFilesPathnameToAbsoluteImagePath(pathname) {
  const pathnameOnly = String(pathname || '').split('?')[0];
  const parts = pathnameOnly.split('/').filter(Boolean);
  if (parts[0] !== 'files') return null;
  const bucket = parts[1];
  const relParts = parts.slice(2).map(decodeUriPathSegment);
  const map = {
    output: config.OUTPUT_DIR,
    input: config.INPUT_DIR,
    thumbnails: config.THUMBNAILS_DIR,
    creative: config.CREATIVE_IMAGES_DIR,
    creative_images: config.CREATIVE_IMAGES_DIR,
    canvas_images: path.join(config.BASE_DIR, 'canvas_images'),
  };
  const baseDir = map[bucket];
  if (!baseDir || relParts.length === 0) return null;
  const abs = path.resolve(path.join(baseDir, ...relParts));
  const baseResolved = path.resolve(baseDir);
  if (!abs.startsWith(baseResolved)) return null;
  try {
    if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) return null;
  } catch {
    return null;
  }
  return abs;
}

function filePathToImageDataUrl(absPath) {
  const ext = path.extname(absPath).toLowerCase();
  const mime = VIDEO_REF_MIME_BY_EXT[ext] || 'image/png';
  const b64 = fs.readFileSync(absPath).toString('base64');
  return `data:${mime};base64,${b64}`;
}

async function resolveSingleVideoRefUrlForArk(raw) {
  if (typeof raw !== 'string') return null;
  const u = raw.trim();
  if (!u) return null;
  if (u.startsWith('data:image')) return u;
  if (u.startsWith('data:video')) return u;

  if (u.startsWith('/files/')) {
    const abs = mapFilesPathnameToAbsoluteImagePath(u);
    if (!abs) {
      throw new Error(`参考图路径无效或文件不存在：${u}`);
    }
    return filePathToImageDataUrl(abs);
  }

  if (/^https?:\/\//i.test(u)) {
    let parsed;
    try {
      parsed = new URL(u);
    } catch {
      return u;
    }
    const host = parsed.hostname;
    const isLocal =
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '[::1]' ||
      host === '::1';
    if (isLocal) {
      const pathname = parsed.pathname || '';
      if (pathname.startsWith('/files/')) {
        const abs = mapFilesPathnameToAbsoluteImagePath(pathname);
        if (abs) return filePathToImageDataUrl(abs);
      }
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 60000);
      try {
        const res = await fetch(u, { signal: ctrl.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const buf = Buffer.from(await res.arrayBuffer());
        const ct = (res.headers.get('content-type') || 'image/png').split(';')[0].trim();
        if (!ct.startsWith('image/')) {
          throw new Error(`期望图片响应，实际 Content-Type: ${ct}`);
        }
        return `data:${ct};base64,${buf.toString('base64')}`;
      } catch (e) {
        const msg = e && e.name === 'AbortError' ? '请求超时' : e.message || String(e);
        throw new Error(`无法读取本机参考图（方舟不能访问内网地址，需经本机代拉取）：${msg}`);
      } finally {
        clearTimeout(timer);
      }
    }
    return u;
  }

  if (u.startsWith('/api/')) {
    throw new Error(`参考图不能使用相对 /api 路径，请使用 /files/... 或公网 https URL：${u}`);
  }

  return u;
}

async function resolveVideoReferenceUrlsForArk(referenceMediaUrls) {
  if (!Array.isArray(referenceMediaUrls)) return [];
  const out = [];
  for (const raw of referenceMediaUrls) {
    const one = await resolveSingleVideoRefUrlForArk(raw);
    if (one) out.push(one);
  }
  return out;
}

const SEEDREAM_4_DEFAULT = 'doubao-seedream-4-0-250828';

/** 方舟 Seedream 4：size 用 1K/2K/4K，不用 WxH */
function mapSeedreamDiscreteSize(imageQuality) {
  const q = String(imageQuality || '2k').toLowerCase();
  if (q === '1k') return '1K';
  if (q === '4k') return '4K';
  return '2K';
}

function isSeedream4FamilyModel(modelId) {
  if (!modelId || typeof modelId !== 'string') return false;
  return /seedream-4/i.test(modelId) || /250828/.test(modelId);
}

/** 误将 Seedance 等视频模型配成文生图 model 时，images/generations 会报 InvalidParameter */
function isVideoOnlyArkModel(modelId) {
  if (!modelId || typeof modelId !== 'string') return false;
  return /seedance/i.test(modelId) || /-t2v-|-i2v-/i.test(modelId);
}

/**
 * 选择 images/generations 的 model；纠正配置错误（视频模型当文生图用）
 */
function pickDoubaoImageModel(aiConfig, reqModel, hasImageRef) {
  let m = reqModel;
  if (!m) {
    m = hasImageRef ? aiConfig.imageModelI2i || aiConfig.model : aiConfig.model;
  }
  if (!m || isVideoOnlyArkModel(m)) {
    return aiConfig.imageModelI2i || SEEDREAM_4_DEFAULT;
  }
  if (/seedream-3-0-t2i/i.test(m)) {
    return aiConfig.imageModelI2i || SEEDREAM_4_DEFAULT;
  }
  return m;
}

/**
 * 组装 POST .../images/generations 请求体（文生图 + 图生图）
 * Seedream 4：size 为 1K/2K/4K，sequential + max_images，非流式 JSON（stream=false）便于代理解析
 */
function buildDoubaoImagesGenerationsBody(reqBody, aiConfig) {
  const {
    prompt,
    model,
    response_format = 'url',
    size,
    guidance_scale,
    watermark = true,
    sequential_image_generation,
    stream,
    imageQuality,
    aspectRatio,
    generationCount,
    max_images,
  } = reqBody || {};

  const normalizedImage = normalizeArkImageInput(reqBody?.image);
  const hasImageRef = normalizedImage !== undefined;
  const isMultiRef =
    Array.isArray(normalizedImage) && normalizedImage.length >= 2;

  const imageModel = pickDoubaoImageModel(aiConfig, model, hasImageRef);
  const useSeedream4 = isSeedream4FamilyModel(imageModel);

  const maxImages = Math.min(15, Math.max(1, Number(generationCount ?? max_images ?? 1) || 1));
  const ar = String(aspectRatio || 'auto');
  const iq = String(imageQuality || '2k').toLowerCase();

  let finalPrompt = String(prompt || '').trim();
  if (useSeedream4) {
    const arLabel = ar === 'auto' ? '默认（约 1:1）' : ar;
    finalPrompt = `【画幅比例：${arLabel}；画质档位：${iq}；本次生成张数：${maxImages}】\n${finalPrompt}`;
  }

  const requestBody = {
    model: imageModel,
    prompt: finalPrompt,
    response_format,
    watermark,
  };

  if (normalizedImage !== undefined) {
    requestBody.image = normalizedImage;
  }

  if (useSeedream4) {
    requestBody.size = mapSeedreamDiscreteSize(iq);
    /** 代理层解析 JSON 响应；方舟多参考图示例虽含 stream:true，此处保持 false */
    requestBody.stream = false;
    /** 多参考图或一次生成多张时，与方舟 images/generations 文档一致 */
    if (maxImages > 1 || isMultiRef) {
      requestBody.sequential_image_generation = 'auto';
      requestBody.sequential_image_generation_options = { max_images: maxImages };
    }
  } else {
    requestBody.size = size || '1024x1024';
    if (guidance_scale !== undefined && guidance_scale !== null) {
      requestBody.guidance_scale = guidance_scale;
    } else if (!hasImageRef) {
      requestBody.guidance_scale = 3;
    }
    if (sequential_image_generation != null) {
      requestBody.sequential_image_generation = sequential_image_generation;
    }
    if (stream != null) {
      requestBody.stream = stream;
    }
  }

  return requestBody;
}

function pickDoubaoVideoModel(aiConfig, reqBody, referenceMediaUrls) {
  if (reqBody?.model) return reqBody.model;
  if (hasImageReferenceForVideo(referenceMediaUrls)) {
    return (
      aiConfig.videoModelI2v ||
      aiConfig.videoModel ||
      'doubao-seedance-1-5-pro-251215'
    );
  }
  return aiConfig.videoModel || 'doubao-seedance-1-5-pro-251215';
}

/**
 * 火山方舟：若 baseUrl 仅含根域名（无 /api/v3），补全路径。
 * 否则会请求 .../images/generations 而非 .../api/v3/images/generations，上游返回 HTTP 404。
 */
function normalizeArkApiBaseUrl(raw) {
  const b = String(raw || '').trim().replace(/\/$/, '');
  if (!b) return b;
  if (/^https:\/\/ark\.[^/]+\.volces\.com$/i.test(b)) {
    return `${b}/api/v3`;
  }
  return b;
}

/**
 * 解析 OpenAI 兼容的 Chat Completions URL。
 * 支持：方舟 https://.../api/v3、OpenAI https://api.openai.com/v1、已写全路径 .../chat/completions
 */
function resolveChatCompletionsUrl(baseUrl) {
  const b = normalizeArkApiBaseUrl(baseUrl).replace(/\/$/, '');
  if (!b) return '/chat/completions';
  if (/\/chat\/completions$/i.test(b)) return b;
  if (/\/v1$/i.test(b) || /\/api\/v3$/i.test(b)) return `${b}/chat/completions`;
  if (/api\.openai\.com$/i.test(b) && !/\/v1/i.test(b)) return `${b}/v1/chat/completions`;
  return `${b}/chat/completions`;
}

/** 组装上游 chat/completions 请求体（透传常用 OpenAI 兼容字段） */
function buildUpstreamChatPayload(body, chatModel, stream) {
  const {
    messages,
    max_tokens,
    max_completion_tokens,
    temperature,
    top_p,
    frequency_penalty,
    presence_penalty,
    stop,
    response_format,
  } = body || {};
  const payload = {
    model: chatModel,
    messages,
    stream,
  };
  if (max_tokens != null) payload.max_tokens = max_tokens;
  if (max_completion_tokens != null) payload.max_completion_tokens = max_completion_tokens;
  if (temperature != null) payload.temperature = temperature;
  if (top_p != null) payload.top_p = top_p;
  if (frequency_penalty != null) payload.frequency_penalty = frequency_penalty;
  if (presence_penalty != null) payload.presence_penalty = presence_penalty;
  if (stop != null) payload.stop = stop;
  if (response_format != null) payload.response_format = response_format;
  return payload;
}

/**
 * 方舟「查询视频生成任务」响应中，视频 URL 可能在顶层 video_url，也可能在 content（对象或数组）里。
 * 与官方文档一致：https://www.volcengine.com/docs/82379/1521309
 */
function extractVideoUrlFromArkTask(body) {
  if (!body || typeof body !== 'object') return null;
  const direct = [body.video_url, body.videoUrl, body.output, body.url];
  for (const v of direct) {
    if (typeof v === 'string' && /^https?:\/\//i.test(v.trim())) return v.trim();
  }
  const c = body.content;
  if (c && typeof c === 'object') {
    if (Array.isArray(c)) {
      for (const block of c) {
        if (!block || typeof block !== 'object') continue;
        const u = block.video_url || block.videoUrl || block.url;
        if (typeof u === 'string' && /^https?:\/\//i.test(u.trim())) return u.trim();
      }
    } else {
      const u = c.video_url || c.videoUrl || c.url;
      if (typeof u === 'string' && /^https?:\/\//i.test(u.trim())) return u.trim();
    }
  }
  return null;
}

/** 从 ComfyUI history 单条记录中取出第一张输出图 */
function extractFirstImageFromHistoryEntry(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const outputs = entry.outputs;
  if (!outputs || typeof outputs !== 'object') return null;
  for (const nodeId of Object.keys(outputs)) {
    const out = outputs[nodeId];
    if (out && Array.isArray(out.images) && out.images.length) {
      const img = out.images[0];
      return {
        filename: img.filename,
        subfolder: img.subfolder != null ? String(img.subfolder) : '',
        type: img.type || 'output',
      };
    }
  }
  return null;
}

/** 将 /history* 返回体规范为单条 history entry（兼容直接返回 entry、按 prompt_id 为键、或 history_v2 数组） */
function normalizeComfyHistoryPayload(hist, promptId) {
  if (!hist || typeof hist !== 'object') return null;
  if (Array.isArray(hist)) {
    const pid = String(promptId);
    const found = hist.find(
      (item) =>
        item &&
        typeof item === 'object' &&
        (String(item.prompt_id) === pid ||
          String(item.promptId) === pid ||
          String(item.id) === pid)
    );
    return found || null;
  }
  let entry = hist[promptId];
  if (!entry && typeof hist === 'object') {
    const keys = Object.keys(hist);
    if (keys.length === 1) entry = hist[keys[0]];
  }
  if (!entry) entry = hist;
  return entry && typeof entry === 'object' ? entry : null;
}

/**
 * 拉取某次 prompt 的 history 条目：先试 /history/{id}、/history_v2/{id}，再回退整表 GET /history
 */
async function fetchComfyHistoryEntry(baseUrlClean, promptId) {
  const id = encodeURIComponent(promptId);
  const tryUrls = [
    `${baseUrlClean}/history/${id}`,
    `${baseUrlClean}/history_v2/${id}`,
  ];
  for (const url of tryUrls) {
    try {
      const r = await fetch(url);
      if (!r.ok) continue;
      const hist = await r.json();
      const entry = normalizeComfyHistoryPayload(hist, promptId);
      if (entry) return entry;
    } catch (e) {
      // 试下一路径
    }
  }
  try {
    const r = await fetch(`${baseUrlClean}/history`);
    if (!r.ok) return null;
    const hist = await r.json();
    if (!hist || typeof hist !== 'object') return null;
    const pid = String(promptId);
    if (hist[promptId]) return hist[promptId];
    if (hist[pid]) return hist[pid];
    return normalizeComfyHistoryPayload(hist, promptId);
  } catch (e) {
    return null;
  }
}

/**
 * 轮询 ComfyUI history，直到出现带 images 的输出或超时
 */
async function pollComfyImageUrl(baseUrl, promptId, {
  maxAttempts = 120,
  intervalMs = 1000,
} = {}) {
  const clean = String(baseUrl).replace(/\/$/, '');
  for (let i = 0; i < maxAttempts; i++) {
    if (i > 0) await sleep(intervalMs);
    try {
      const entry = await fetchComfyHistoryEntry(clean, promptId);
      const img = extractFirstImageFromHistoryEntry(entry);
      if (img && img.filename) {
        const q = new URLSearchParams({
          filename: img.filename,
          subfolder: img.subfolder,
          type: img.type || 'output',
        });
        return `${clean}/view?${q.toString()}`;
      }
    } catch (e) {
      // 继续轮询
    }
  }
  return null;
}

function applyInsecureTlsIfEnabled() {
  const insecure =
    process.env.INSECURE_SKIP_TLS_VERIFY === 'true' ||
    process.env.INSECURE_SKIP_TLS_VERIFY === '1';
  if (!insecure) return;

  // 仅用于本地/受限网络环境排障：跳过 TLS 校验
  // 注意：会影响该 Node 进程内所有 HTTPS 请求
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

applyInsecureTlsIfEnabled();

function saveAiConfig(aiConfig) {
  const settings = JsonStorage.load(config.SETTINGS_FILE, {});
  settings.thirdPartyConfig = aiConfig;
  JsonStorage.save(config.SETTINGS_FILE, settings);
  return aiConfig;
}

function getSessions() {
  JsonStorage.init(CHAT_SESSIONS_FILE, []);
  return JsonStorage.load(CHAT_SESSIONS_FILE, []);
}

function saveSessions(sessions) {
  JsonStorage.save(CHAT_SESSIONS_FILE, sessions);
}

/** 标题是否为未命名/默认「新对话」 */
function isDefaultChatTitle(title) {
  const t = (title || '').trim();
  return t === '' || t === '新对话';
}

/**
 * 持久化前整理会话：去掉多余空「新对话」、修正标题仍为「新对话」但已有消息的记录
 * 空草稿仅保留 updatedAt 最新的一条，避免历史里堆叠无标题会话
 */
function pruneSessionsForStorage(sessions) {
  if (!Array.isArray(sessions)) return [];
  const msgsOf = (s) => (Array.isArray(s.messages) ? s.messages : []);

  const normal = [];
  const emptyNewDrafts = [];

  for (const s of sessions) {
    const msgs = msgsOf(s);
    if (isDefaultChatTitle(s.title) && msgs.length === 0) {
      emptyNewDrafts.push(s);
      continue;
    }
    if (isDefaultChatTitle(s.title) && msgs.length > 0) {
      const firstUser = msgs.find((m) => m.role === 'user');
      const raw = firstUser && firstUser.content != null ? String(firstUser.content).trim() : '';
      const newTitle =
        raw.length > 0 ? raw.slice(0, 30) + (raw.length > 30 ? '...' : '') : '对话';
      normal.push({ ...s, title: newTitle });
      continue;
    }
    normal.push(s);
  }

  if (emptyNewDrafts.length === 0) {
    return normal;
  }
  emptyNewDrafts.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  return [...normal, emptyNewDrafts[0]];
}

router.get('/config', (req, res) => {
  const aiConfig = getAiConfig();
  res.json({ success: true, data: aiConfig });
});

router.post('/config', (req, res) => {
  const aiConfig = getAiConfig();
  const newConfig = { ...aiConfig, ...req.body };
  saveAiConfig(newConfig);
  res.json({ success: true, data: newConfig });
});

// ComfyUI 配置（本地开源）
router.get('/comfyui/config', (req, res) => {
  const comfy = getComfyConfig();
  res.json({ success: true, data: comfy });
});

router.post('/comfyui/config', (req, res) => {
  const settings = JsonStorage.load(config.SETTINGS_FILE, {});
  const prev = getComfyConfig();
  const next = { ...prev, ...req.body };
  if (!next.baseUrl || !String(next.baseUrl).trim()) {
    next.baseUrl = 'http://127.0.0.1:8188';
  }
  settings.comfyuiConfig = next;
  JsonStorage.save(config.SETTINGS_FILE, settings);
  res.json({ success: true, data: next });
});

// ComfyUI 连接测试
router.post('/comfyui/test', async (req, res) => {
  const comfy = getComfyConfig();
  const baseUrl = String(comfy.baseUrl || 'http://127.0.0.1:8188').replace(/\/$/, '');
  
  try {
    // 测试 ComfyUI 是否可访问
    const response = await fetch(`${baseUrl}/system_stats`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    
    if (!response.ok) {
      return res.json({ 
        success: false, 
        error: `ComfyUI 返回 HTTP ${response.status}`,
        connected: false 
      });
    }
    
    const data = await response.json();
    
    // 检查工作流文件是否存在
    const workflowExists = fs.existsSync(path.join(config.DATA_DIR, 'comfyui_default_workflow.json'));
    
    res.json({ 
      success: true, 
      connected: true,
      systemStats: data,
      workflowExists,
      baseUrl,
    });
  } catch (error) {
    res.json({ 
      success: false, 
      error: error.message || '无法连接到 ComfyUI',
      connected: false,
      baseUrl,
    });
  }
});

router.post('/test-connection', async (req, res) => {
  const { baseUrl, apiKey } = req.body;
  
  if (!baseUrl || !apiKey) {
    return res.json({ success: false, error: '缺少baseUrl或apiKey' });
  }

  try {
    const url = resolveChatCompletionsUrl(baseUrl);
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'doubao-1-5-lite-32k-250115',
        messages: [{ role: 'user', content: 'hello' }],
        max_tokens: 10
      })
    });

    if (response.ok) {
      res.json({ success: true, message: '连接成功' });
    } else {
      const error = await response.text();
      res.json({ success: false, error: `HTTP ${response.status}: ${error}` });
    }
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

router.post('/chat', async (req, res) => {
  const aiConfig = getAiConfig();
  
  if (!aiConfig.enabled || !aiConfig.apiKey) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.write(`data: ${JSON.stringify({ error: '请先配置豆包API' })}\n\n`);
    res.end();
    return;
  }

  const { messages, model } = req.body;
  const chatModel = model || aiConfig.chatModel || 'doubao-1-5-lite-32k-250115';
  const chatUrl = resolveChatCompletionsUrl(aiConfig.baseUrl);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  if (typeof res.flushHeaders === 'function') {
    res.flushHeaders();
  }

  try {
    const response = await fetch(chatUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${aiConfig.apiKey}`
      },
      body: JSON.stringify(buildUpstreamChatPayload(req.body, chatModel, true))
    });

    if (!response.ok) {
      const errorText = await response.text();
      res.write(`data: ${JSON.stringify({ error: `HTTP ${response.status}: ${errorText}` })}\n\n`);
      res.end();
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('data: ')) {
          const data = trimmed.slice(6);
          if (data === '[DONE]') {
            res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
          } else {
            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices?.[0]?.delta?.content || '';
              if (content) {
                res.write(`data: ${JSON.stringify({ content })}\n\n`);
              }
            } catch (e) {
              // 忽略解析错误
            }
          }
        }
      }
    }

    if (buffer) {
      const trimmed = buffer.trim();
      if (trimmed.startsWith('data: ')) {
        const data = trimmed.slice(6);
        if (data !== '[DONE]') {
          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content || '';
            if (content) {
              res.write(`data: ${JSON.stringify({ content })}\n\n`);
            }
          } catch (e) {}
        }
      }
    }

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
  } catch (error) {
    res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
  } finally {
    res.end();
  }
});

router.post('/chat/sync', async (req, res) => {
  const aiConfig = getAiConfig();
  
  if (!aiConfig.enabled || !aiConfig.apiKey) {
    return res.json({ success: false, error: '请先配置豆包API' });
  }

  const { messages, model } = req.body;
  const chatModel = model || aiConfig.chatModel || 'doubao-1-5-lite-32k-250115';
  const chatUrl = resolveChatCompletionsUrl(aiConfig.baseUrl);

  try {
    const response = await fetch(chatUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${aiConfig.apiKey}`
      },
      body: JSON.stringify(buildUpstreamChatPayload(req.body, chatModel, false))
    });

    if (!response.ok) {
      const errorText = await response.text();
      return res.json({ success: false, error: `HTTP ${response.status}: ${errorText}` });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    res.json({ success: true, data: { content } });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

router.post('/generate-image', async (req, res) => {
  const aiConfig = getAiConfig();

  if (!aiConfig.enabled || !aiConfig.apiKey) {
    return res.json({ success: false, error: '请先配置豆包API' });
  }

  if (!req.body?.prompt || !String(req.body.prompt).trim()) {
    return res.json({ success: false, error: '缺少 prompt' });
  }

  const baseUrl = normalizeArkApiBaseUrl(aiConfig.baseUrl).replace(/\/$/, '');
  const requestBody = buildDoubaoImagesGenerationsBody(req.body, aiConfig);

  try {
    const response = await fetch(`${baseUrl}/images/generations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${aiConfig.apiKey}`
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      return res.json({ success: false, error: `HTTP ${response.status}: ${errorText}` });
    }

    const data = await response.json();
    return res.json({ success: true, data });
  } catch (error) {
    return res.json({ success: false, error: error.message });
  }
});

/**
 * 组装方舟「创建视频生成任务」的 content 数组。
 * 对应：POST {baseUrl}/contents/generations/tasks
 * body: { model, content: [ { type:'text', text:'... --resolution 1080p --duration 5 ...' }, { type:'image_url', image_url:{ url } }, ... ] }
 * 参考图必须走 image_url，勿把 base64 写进 text，以免触发敏感内容校验。
 */
function buildVideoTaskContent(prompt, options = {}, referenceMediaUrls) {
  const textLine =
    String(prompt || '') +
    (options.ratio ? ` --ratio ${options.ratio}` : '') +
    (options.resolution ? ` --resolution ${options.resolution}` : '') +
    (options.duration ? ` --duration ${options.duration}` : '') +
    (options.cameraFixed !== undefined ? ` --camerafixed ${options.cameraFixed}` : '') +
    (options.watermark !== undefined ? ` --watermark ${options.watermark}` : '');

  const content = [{ type: 'text', text: textLine }];

  if (Array.isArray(referenceMediaUrls)) {
    for (const raw of referenceMediaUrls) {
      if (typeof raw !== 'string' || !raw.trim()) continue;
      const url = raw.trim();
      if (isVideoReferenceUrl(url)) {
        content.push({ type: 'image_url', image_url: { url } });
      } else if (url.startsWith('data:video')) {
        content.push({ type: 'video_url', video_url: { url } });
      }
    }
  }
  return content;
}

/** 方舟图生视频/文生视频：创建任务 POST /api/v3/contents/generations/tasks；轮询 GET .../tasks/{id}（见 /video-task/:taskId） */
router.post('/generate-video', async (req, res) => {
  const aiConfig = getAiConfig();
  
  if (!aiConfig.enabled || !aiConfig.apiKey) {
    return res.json({ success: false, error: '请先配置豆包API' });
  }

  const { prompt, options = {}, referenceMediaUrls } = req.body;
  const videoModel = pickDoubaoVideoModel(aiConfig, req.body, referenceMediaUrls);
  const baseUrl = normalizeArkApiBaseUrl(aiConfig.baseUrl).replace(/\/$/, '');
  const videoOptions = normalizeVideoTaskOptions(options, videoModel, referenceMediaUrls);

  let resolvedRefs = [];
  try {
    resolvedRefs = await resolveVideoReferenceUrlsForArk(referenceMediaUrls);
  } catch (e) {
    return res.json({ success: false, error: String(e?.message || e) });
  }
  const content = buildVideoTaskContent(prompt, videoOptions, resolvedRefs);

  try {
    const response = await fetch(`${baseUrl}/contents/generations/tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${aiConfig.apiKey}`
      },
      body: JSON.stringify({
        model: videoModel,
        content: content
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      return res.json({ success: false, error: `HTTP ${response.status}: ${errorText}` });
    }

    const data = await response.json();
    res.json({ success: true, data: data });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

// ========== 统一生成入口：豆包 / ComfyUI 分流 ==========
// body:
// {
//   base: "doubao" | "comfyui",
//   task: "image" | "video",
//   prompt: string,
//   model?: string,  // 覆盖默认；图生视频有参考图时未传则用 videoModelI2v
//   image?: string | string[],  // 图生图：单 URL 或多张参考
//   sequential_image_generation?: string,
//   stream?: boolean,
//   size?: "1024x1024" | "2K" | ...,
//   guidance_scale?: number,
//   watermark?: boolean,
//   referenceMediaUrls?: string[],  // 图生视频等
//   options?: { ratio?: string; resolution?: string; duration?: number; cameraFixed?: boolean; watermark?: boolean },
//   comfy?: { workflow?: any }
// }
// ComfyUI 侧仅接文生图工作流；视频与 Comfy 出图失败时由后端静默走豆包（前端不区分）。

async function generateDoubaoVideoResponse(req, res) {
  const aiConfig = getAiConfig();
  if (!aiConfig.enabled || !aiConfig.apiKey) {
    return res.json({ success: false, error: '请先配置豆包API' });
  }
  const prompt = String(req.body?.prompt || '').trim();
  const baseUrl = normalizeArkApiBaseUrl(aiConfig.baseUrl).replace(/\/$/, '');
  const { options = {}, referenceMediaUrls } = req.body || {};
  const videoModel = pickDoubaoVideoModel(aiConfig, req.body, referenceMediaUrls);
  const videoOptions = normalizeVideoTaskOptions(options, videoModel, referenceMediaUrls);
  let resolvedRefs = [];
  try {
    resolvedRefs = await resolveVideoReferenceUrlsForArk(referenceMediaUrls);
  } catch (e) {
    return res.json({ success: false, error: String(e?.message || e) });
  }
  const content = buildVideoTaskContent(prompt, videoOptions, resolvedRefs);
  try {
    const response = await fetch(`${baseUrl}/contents/generations/tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${aiConfig.apiKey}`,
      },
      body: JSON.stringify({ model: videoModel, content }),
    });
    if (!response.ok) {
      const errorText = await response.text();
      return res.json({ success: false, error: `HTTP ${response.status}: ${errorText}` });
    }
    const data = await response.json();
    return res.json({ success: true, data });
  } catch (e) {
    return res.json({ success: false, error: String(e?.message || e) });
  }
}

async function generateDoubaoImageResponse(req, res) {
  const aiConfig = getAiConfig();
  if (!aiConfig.enabled || !aiConfig.apiKey) {
    return res.json({ success: false, error: '请先配置豆包API' });
  }
  const imageBody = buildDoubaoImagesGenerationsBody(req.body, aiConfig);
  const baseUrl = normalizeArkApiBaseUrl(aiConfig.baseUrl).replace(/\/$/, '');
  try {
    const response = await fetch(`${baseUrl}/images/generations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${aiConfig.apiKey}`,
      },
      body: JSON.stringify(imageBody),
    });
    if (!response.ok) {
      const errorText = await response.text();
      return res.json({ success: false, error: `HTTP ${response.status}: ${errorText}` });
    }
    const data = await response.json();
    return res.json({ success: true, data });
  } catch (e) {
    return res.json({ success: false, error: String(e?.message || e) });
  }
}

/** ComfyUI 仅文生图；成功返回与 /generate 成功时相同的 data 形状 */
async function tryComfyUIImageGeneration(req) {
  const prompt = String(req.body?.prompt || '').trim();
  const comfy = getComfyConfig();
  if (!comfy.baseUrl) {
    return {
      success: false,
      error:
        'ComfyUI 未配置 baseUrl。请在设置中配置 comfyuiConfig.baseUrl（例如 http://127.0.0.1:8188）。',
    };
  }
  if (comfy.enabled === false) {
    return { success: false, error: 'ComfyUI 已在设置中关闭（comfyuiConfig.enabled=false）。' };
  }
  const baseUrl = String(comfy.baseUrl).replace(/\/$/, '');
  let workflow = req.body?.comfy?.workflow || comfy.defaultWorkflow;
  if (!workflow) {
    workflow = loadComfyWorkflowFromDisk();
  }
  if (!workflow) {
    return {
      success: false,
      error:
        '缺少 ComfyUI workflow。可将 API 格式工作流放入 data/comfyui_default_workflow.json（项目已提供示例），或在 settings.json 的 comfyuiConfig.defaultWorkflow 中配置；正向上需包含 {{prompt}} 占位符。',
    };
  }
  const workflowStr = JSON.stringify(workflow);
  const workflowPatched = JSON.parse(workflowStr.replace(/\{\{prompt\}\}/g, prompt));
  try {
    const response = await fetch(`${baseUrl}/prompt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: workflowPatched, client_id: 'penguin-magic' }),
    });
    const errorText = await response.text();
    if (!response.ok) {
      return { success: false, error: `ComfyUI HTTP ${response.status}: ${errorText}` };
    }
    let data;
    try {
      data = JSON.parse(errorText);
    } catch (parseErr) {
      return { success: false, error: `ComfyUI 返回非 JSON: ${errorText.slice(0, 500)}` };
    }
    if (data.node_errors && Object.keys(data.node_errors).length) {
      return {
        success: false,
        error: `ComfyUI 工作流校验失败: ${JSON.stringify(data.node_errors)}`,
      };
    }
    const promptId = data.prompt_id || data.promptId;
    if (!promptId) {
      return {
        success: false,
        error: 'ComfyUI 已响应但未返回 prompt_id，无法拉取生成结果。请检查 ComfyUI 版本与 /prompt 接口。',
      };
    }
    const imageUrl = await pollComfyImageUrl(baseUrl, promptId);
    if (!imageUrl) {
      return {
        success: false,
        error: `ComfyUI 任务已提交（prompt_id=${promptId}），但在约 120s 内未从 /history 取到输出图片。请确认工作流含 Save Image 节点、checkpoint 文件名与本地一致、ComfyUI 已启动并可访问 ${baseUrl}。`,
      };
    }
    return {
      success: true,
      data: {
        data: [{ url: imageUrl }],
        comfy: { prompt_id: promptId },
      },
    };
  } catch (e) {
    return { success: false, error: String(e?.message || e) };
  }
}

router.post('/generate', async (req, res) => {
  const { base = 'doubao', task = 'image' } = req.body || {};
  const prompt = String(req.body?.prompt || '').trim();
  if (!prompt) return res.json({ success: false, error: '缺少 prompt' });

  if (base === 'doubao') {
    if (task === 'video') return generateDoubaoVideoResponse(req, res);
    return generateDoubaoImageResponse(req, res);
  }

  if (base === 'comfyui') {
    const aiConfig = getAiConfig();
    if (task === 'video') {
      if (!aiConfig.enabled || !aiConfig.apiKey) {
        return res.json({
          success: false,
          error: '当前未配置豆包 API，无法完成视频生成。',
        });
      }
      return generateDoubaoVideoResponse(req, res);
    }

    const comfyResult = await tryComfyUIImageGeneration(req);
    if (comfyResult.success) {
      return res.json({ success: true, data: comfyResult.data });
    }
    if (aiConfig.enabled && aiConfig.apiKey) {
      console.warn('[generate] ComfyUI 出图失败，静默回退豆包:', comfyResult.error);
      return generateDoubaoImageResponse(req, res);
    }
    return res.json({ success: false, error: comfyResult.error });
  }

  return res.json({ success: false, error: `未知 base: ${base}` });
});

/** 方舟：查询视频生成任务 GET /api/v3/contents/generations/tasks/{id} */
router.get('/video-task/:taskId', async (req, res) => {
  const aiConfig = getAiConfig();
  
  if (!aiConfig.enabled || !aiConfig.apiKey) {
    return res.json({ success: false, error: '请先配置豆包API' });
  }

  const rawId = String(req.params.taskId || '').trim();
  if (!rawId) {
    return res.json({ success: false, error: '缺少任务 id' });
  }
  const taskId = encodeURIComponent(rawId);
  const baseUrl = normalizeArkApiBaseUrl(aiConfig.baseUrl).replace(/\/$/, '');

  try {
    const response = await fetch(`${baseUrl}/contents/generations/tasks/${taskId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${aiConfig.apiKey}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      return res.json({ success: false, error: `HTTP ${response.status}: ${errorText}` });
    }

    const data = await response.json();
    const extracted = extractVideoUrlFromArkTask(data);
    if (extracted && !data.video_url) {
      data.video_url = extracted;
    }
    res.json({ success: true, data: data });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

router.get('/sessions', (req, res) => {
  const raw = getSessions();
  const pruned = pruneSessionsForStorage(raw);
  if (JSON.stringify(pruned) !== JSON.stringify(raw)) {
    saveSessions(pruned);
  }
  const sorted = pruned.sort((a, b) => {
    if (a.isPinned !== b.isPinned) return b.isPinned ? 1 : -1;
    return b.updatedAt - a.updatedAt;
  });
  res.json({ success: true, data: sorted });
});

router.post('/sessions', (req, res) => {
  const sessions = getSessions();
  const newSession = {
    id: Date.now().toString(),
    title: req.body.title || '新对话',
    messages: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    isPinned: false
  };
  sessions.push(newSession);
  saveSessions(sessions);
  res.json({ success: true, data: newSession });
});

router.get('/sessions/:id', (req, res) => {
  const sessions = getSessions();
  const session = sessions.find(s => s.id === req.params.id);
  if (session) {
    res.json({ success: true, data: session });
  } else {
    res.status(404).json({ success: false, error: '会话不存在' });
  }
});

router.put('/sessions/:id', (req, res) => {
  const sessions = getSessions();
  const index = sessions.findIndex(s => s.id === req.params.id);
  if (index !== -1) {
    sessions[index] = { ...sessions[index], ...req.body, updatedAt: Date.now() };
    saveSessions(sessions);
    res.json({ success: true, data: sessions[index] });
  } else {
    res.status(404).json({ success: false, error: '会话不存在' });
  }
});

router.delete('/sessions/:id', (req, res) => {
  const sessions = getSessions();
  const filtered = sessions.filter(s => s.id !== req.params.id);
  if (filtered.length < sessions.length) {
    saveSessions(filtered);
    res.json({ success: true, message: '删除成功' });
  } else {
    res.status(404).json({ success: false, error: '会话不存在' });
  }
});

router.post('/sessions/:id/messages', (req, res) => {
  const sessions = getSessions();
  const index = sessions.findIndex(s => s.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ success: false, error: '会话不存在' });
  }

  const { role, content, images } = req.body;
  const message = {
    id: Date.now().toString(),
    role,
    content,
    images,
    timestamp: Date.now()
  };

  sessions[index].messages.push(message);
  sessions[index].updatedAt = Date.now();
  
  if (sessions[index].messages.length === 1 && role === 'user') {
    sessions[index].title = content.slice(0, 30) + (content.length > 30 ? '...' : '');
  }
  
  saveSessions(sessions);
  res.json({ success: true, data: message });
});

module.exports = router;
