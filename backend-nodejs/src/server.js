#!/usr/bin/env node

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const JsonStorage = require('./utils/jsonStorage');
const FileHandler = require('./utils/fileHandler');

// 导入路由模块
const creativeRouter = require('./routes/creative');
const historyRouter = require('./routes/history');
const filesRouter = require('./routes/files');
const settingsRouter = require('./routes/settings');
const desktopRouter = require('./routes/desktop');
const imageOpsRouter = require('./routes/imageOps');
const canvasRouter = require('./routes/canvas');
const aiRouter = require('./routes/ai');

const app = express();

// Debug NDJSON（会话 126315）：写入项目根，供 Cursor 读取；需本地 Node 后端与 Vite /api 代理同时可用
const DEBUG_SESSION_LOG_PATH = path.join(path.resolve(__dirname, '..', '..'), 'debug-126315.log');

// ============== 中间件配置 ==============
app.use(cors()); // CORS支持
app.use(express.json({ limit: '50mb' })); // 解析JSON请求体，支持大图片
app.use(express.urlencoded({ extended: true, limit: '50mb' })); // 解析URL编码请求体

// 自定义日志中间件
app.use((req, res, next) => {
  const timestamp = new Date().toLocaleTimeString('zh-CN', { hour12: false });
  console.log(`[${timestamp}] ${req.method} ${req.path}`);
  next();
});

// ============== 初始化目录和数据文件 ==============
function initializeApp() {
  console.log('=' .repeat(50));
  console.log('🐧 企鹅艾洛魔法世界 - Node.js后端服务');
  console.log('=' .repeat(50));
  console.log();
  
  // 创建必要的目录
  FileHandler.ensureDir(config.INPUT_DIR);
  FileHandler.ensureDir(config.OUTPUT_DIR);
  FileHandler.ensureDir(config.THUMBNAILS_DIR);
  FileHandler.ensureDir(config.DATA_DIR);
  FileHandler.ensureDir(config.CREATIVE_IMAGES_DIR);
  
  // 初始化数据文件
  JsonStorage.init(config.CREATIVE_IDEAS_FILE, []);
  JsonStorage.init(config.HISTORY_FILE, []);
  JsonStorage.init(config.SETTINGS_FILE, { theme: 'dark' });
  JsonStorage.init(config.DESKTOP_ITEMS_FILE, []);
  
  console.log();
}

// ============== 静态文件服务 ==============
// 托管前端构建产物
if (require('fs').existsSync(config.DIST_DIR)) {
  app.use(express.static(config.DIST_DIR));
  console.log(`✓ 前端静态资源: ${config.DIST_DIR}`);
}

// 托管文件资源
app.use('/files/output', express.static(config.OUTPUT_DIR));
app.use('/files/input', express.static(config.INPUT_DIR));
app.use('/files/thumbnails', express.static(config.THUMBNAILS_DIR));
app.use('/files/creative', express.static(config.CREATIVE_IMAGES_DIR));
app.use('/files/creative_images', express.static(config.CREATIVE_IMAGES_DIR)); // 兼容旧路径
app.use('/files/canvas_images', express.static(path.join(config.BASE_DIR, 'canvas_images'))); // 画布图片

// 确保目录存在并输出调试信息
console.log('📁 静态文件托管配置:');
console.log(`   - Output: ${config.OUTPUT_DIR}`);
console.log(`   - Input: ${config.INPUT_DIR}`);
console.log(`   - Thumbnails: ${config.THUMBNAILS_DIR}`);
console.log(`   - Creative Images: ${config.CREATIVE_IMAGES_DIR}`);

// ============== API路由 ==============
app.use('/api/creative-ideas', creativeRouter);
app.use('/api/history', historyRouter);
app.use('/api/files', filesRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/desktop', desktopRouter);
app.use('/api/image-ops', imageOpsRouter);
app.use('/api/canvas', canvasRouter);
app.use('/api/ai', aiRouter);

app.post('/api/debug-session-log', (req, res) => {
  try {
    if (req.body && typeof req.body === 'object') {
      fs.appendFileSync(DEBUG_SESSION_LOG_PATH, `${JSON.stringify(req.body)}\n`, 'utf8');
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('debug-session-log:', err.message);
    res.status(500).json({ ok: false });
  }
});

// 服务状态检查
app.get('/api/status', (req, res) => {
  res.json({
    success: true,
    data: {
      status: 'running',
      version: '1.0.0',
      mode: 'local',
      backend: 'Node.js',
      input_dir: config.INPUT_DIR,
      output_dir: config.OUTPUT_DIR,
    }
  });
});

// ============== 前端路由回退 ==============
// 所有未匹配的路由返回index.html（支持前端路由）
app.get('*', (req, res) => {
  const indexPath = path.join(config.DIST_DIR, 'index.html');
  if (require('fs').existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).json({ 
      success: false, 
      error: '前端资源未找到，请先运行 npm run build 构建前端' 
    });
  }
});

// ============== 错误处理 ==============
app.use((err, req, res, next) => {
  console.error('服务器错误:', err.message);
  res.status(500).json({
    success: false,
    error: '服务器内部错误',
    message: err.message
  });
});

// ============== 启动服务器 ==============
function startServer() {
  initializeApp();
  
  const server = app.listen(config.PORT, config.HOST, () => {
    console.log('🚀 服务器启动成功!');
    console.log(`   地址: http://${config.HOST}:${config.PORT}`);
    console.log(`   环境: ${config.NODE_ENV}`);
    console.log(`   输入目录: ${config.INPUT_DIR}`);
    console.log(`   输出目录: ${config.OUTPUT_DIR}`);
    console.log(`   数据目录: ${config.DATA_DIR}`);
    console.log();
    console.log('按 Ctrl+C 停止服务器...');
    console.log('-'.repeat(50));
  });

  // 优雅关闭
  process.on('SIGINT', () => {
    console.log('\n\n🛑 正在停止服务器...');
    server.close(() => {
      console.log('服务器已停止');
      process.exit(0);
    });
  });

  process.on('SIGTERM', () => {
    console.log('\n\n🛑 正在停止服务器...');
    server.close(() => {
      console.log('服务器已停止');
      process.exit(0);
    });
  });
}

// 启动应用
if (require.main === module) {
  startServer();
}

// ============== 全局错误处理 ==============
// 捕获未处理的异常，防止进程崩溃
process.on('uncaughtException', (err) => {
  console.error('\n⚠️ 未捕获的异常:', err.message);
  console.error('堆栈:', err.stack);
  // 不退出进程，继续运行
});

// 捕获未处理的Promise rejection
process.on('unhandledRejection', (reason, promise) => {
  console.error('\n⚠️ 未处理的Promise rejection:');
  console.error('原因:', reason);
  // 不退出进程，继续运行
});

module.exports = app;
