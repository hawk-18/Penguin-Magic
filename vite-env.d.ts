/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 后端根地址（无尾斜杠），如 https://api.example.com；不设则与页面同源 /api */
  readonly VITE_API_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
