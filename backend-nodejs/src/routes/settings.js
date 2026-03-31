const express = require('express');
const config = require('../config');
const JsonStorage = require('../utils/jsonStorage');

const router = express.Router();

/** 浅合并顶层字段；thirdPartyConfig / comfyuiConfig 做对象合并，避免覆盖丢密钥 */
function mergeSettings(prev, patch) {
  const out = { ...(prev && typeof prev === 'object' ? prev : {}) };
  if (!patch || typeof patch !== 'object') return out;
  for (const k of Object.keys(patch)) {
    if (k === 'thirdPartyConfig' && patch.thirdPartyConfig && typeof patch.thirdPartyConfig === 'object') {
      out.thirdPartyConfig = { ...(prev.thirdPartyConfig || {}), ...patch.thirdPartyConfig };
    } else if (k === 'comfyuiConfig' && patch.comfyuiConfig && typeof patch.comfyuiConfig === 'object') {
      out.comfyuiConfig = { ...(prev.comfyuiConfig || {}), ...patch.comfyuiConfig };
    } else {
      out[k] = patch[k];
    }
  }
  return out;
}

// 获取设置（本地 data/settings.json）
router.get('/', (req, res) => {
  const settings = JsonStorage.load(config.SETTINGS_FILE, { theme: 'dark' });
  res.json({ success: true, data: settings });
});

// 合并保存设置（勿整文件覆盖，便于单独更新 geminiApiKey 等）
router.post('/', (req, res) => {
  const prev = JsonStorage.load(config.SETTINGS_FILE, { theme: 'dark' });
  const next = mergeSettings(prev, req.body);
  JsonStorage.save(config.SETTINGS_FILE, next);
  res.json({ success: true, data: next });
});

module.exports = router;
