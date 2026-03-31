import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import { readFileSync } from 'fs';
import tailwindcss from '@tailwindcss/vite';

// 从 package.json 读取版本号
const packageJson = JSON.parse(readFileSync('./package.json', 'utf-8'));
const APP_VERSION = packageJson.version;

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      plugins: [tailwindcss()],
      base: './', // 使用相对路径，适用于 Electron
      server: {
        port: 5176,
        strictPort: true,
        proxy: {
          // 本地 Node.js 后端代理（ComfyUI 轮询可能 >60s，需拉长超时避免代理断开导致前端「无反应」）
          '/api': {
            target: 'http://127.0.0.1:8765',
            changeOrigin: true,
            timeout: 180000,
            proxyTimeout: 180000,
            // 避免压缩/缓冲导致开发环境下 SSE 整段到达前端
            configure: (proxy) => {
              proxy.on('proxyReq', (proxyReq, req) => {
                const u = req.url || '';
                if (u.includes('/ai/chat') && !u.includes('/chat/sync')) {
                  proxyReq.setHeader('Accept-Encoding', 'identity');
                }
              });
            },
          },
          // 本地文件服务
          '/files': {
            target: 'http://127.0.0.1:8765',
            changeOrigin: true,
            timeout: 180000,
            proxyTimeout: 180000,
          },
          '/input': {
            target: 'http://127.0.0.1:8765',
            changeOrigin: true,
          },
          '/output': {
            target: 'http://127.0.0.1:8765',
            changeOrigin: true,
          },
        },
      },
      build: {
        // Electron 渲染进程构建配置
        outDir: 'dist',
        assetsDir: 'assets',
        rollupOptions: {
          output: {
            manualChunks: undefined,
          },
        },
      },
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        '__APP_VERSION__': JSON.stringify(APP_VERSION)
      },
      resolve: {
        alias: {
          '@': path.resolve('.'),
        }
      }
    };
});