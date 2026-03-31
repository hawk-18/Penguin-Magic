import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import {
  ArrowRight,
  ArrowUp,
  BarChart3,
  Bot,
  Brain,
  Check,
  ChevronUp,
  Code2,
  Copy,
  Grid3x3,
  Image as ImageIcon,
  Languages,
  MoreHorizontal,
  MessageCircle,
  MessageSquare,
  Maximize2,
  Mic,
  Paperclip,
  PenSquare,
  Presentation,
  Plus,
  RotateCcw,
  Share2,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  Video as VideoIcon,
  Volume2,
  Zap,
  Pin,
  FileText,
  X,
} from 'lucide-react';
import JSZip from 'jszip';
import { useTheme } from '../../contexts/ThemeContext';
import {
  addChatMessage,
  chatCompletionSync,
  createChatSession,
  deleteChatSession,
  generateImage,
  generateVideoTask,
  getChatSessions,
  getVideoTask,
  type AiChatSession,
  updateChatSession,
} from '../../services/api/ai';

type SkillKey = 'image' | 'code' | 'video' | 'write' | 'translate' | 'analysis' | 'chat';
type ChatMessageKind = 'text' | 'image' | 'video';
type InputMode = 'write' | 'code' | 'ppt' | 'translate' | 'analysis' | 'image' | 'video' | null;

/** 翻译模式：目标语言（上拉栏选择） */
type TranslateTargetId = 'en' | 'zh-Hans' | 'zh-Hant';

const TRANSLATE_TARGET_OPTIONS: { id: TranslateTargetId; label: string }[] = [
  { id: 'en', label: 'English' },
  { id: 'zh-Hans', label: '中文（简体）' },
  { id: 'zh-Hant', label: '中文（繁体）' },
];

function translateSystemPromptFor(target: TranslateTargetId): string {
  switch (target) {
    case 'en':
      return '你是翻译助手。将用户给出的内容翻译为英文。保留原意，语气自然；必要时用一两句英文说明语境或专有名词。';
    case 'zh-Hant':
      return '你是翻译助手。将用户给出的内容翻译为繁体中文（台湾、香港常用字形）。保留原意，必要时给出简短的语境说明。';
    default:
      return '你是翻译助手。将用户内容翻译为简体中文。保留原意，必要时给出简短的语境说明。';
  }
}

/** 图像/视频生成：画面比例（视频走 --ratio；图像映射为 images/generations 的 size） */
type MediaAspectKey = '1:1' | '3:4' | '4:3' | '9:16' | '16:9' | '21:9';

const MEDIA_ASPECT_OPTIONS: { value: MediaAspectKey; label: string }[] = [
  { value: '1:1', label: '1:1' },
  { value: '3:4', label: '3:4' },
  { value: '4:3', label: '4:3' },
  { value: '9:16', label: '9:16' },
  { value: '16:9', label: '16:9' },
  { value: '21:9', label: '21:9' },
];

/** 聊天输入：textarea 内边距与占位层 inset 必须一致；单行最小高度 = padTop + 行高 + padBottom */
const CHAT_INPUT_LINE_HEIGHT_PX = 22;
const CHAT_INPUT_PAD_TOP = 12;
const CHAT_INPUT_PAD_BOTTOM = 4;
const CHAT_INPUT_MIN_HEIGHT = CHAT_INPUT_PAD_TOP + CHAT_INPUT_LINE_HEIGHT_PX + CHAT_INPUT_PAD_BOTTOM;

/** 「/」快捷指令：模式与搜索关键字 */
type SlashPickMode = InputMode | 'chat';

const SLASH_MENU_ROWS: {
  mode: SlashPickMode;
  label: string;
  hint: string;
  keywords: string;
}[] = [
  { mode: 'image', label: '图像生成', hint: '按描述生成图片', keywords: '图像 图片 生图 image' },
  { mode: 'video', label: '视频生成', hint: '按描述生成视频', keywords: '视频 video 短片' },
  { mode: 'code', label: '编程', hint: '代码编辑与解答', keywords: '代码 编程 code' },
  { mode: 'write', label: '帮我写作', hint: '文章、文案等', keywords: '写作 作文 write' },
  { mode: 'translate', label: '翻译', hint: '多语言互译', keywords: '翻译 translate 英文' },
  { mode: 'analysis', label: '数据分析', hint: '解读数据与图表', keywords: '数据 分析 统计' },
  { mode: 'ppt', label: 'PPT 生成', hint: '幻灯片配图与大纲', keywords: 'ppt 幻灯片 演示' },
  { mode: 'chat', label: '普通对话', hint: '默认聊天', keywords: '对话 聊天 chat' },
];

function isSlashCommandOpen(value: string): boolean {
  return /(?:^|[\s\n])\/[^/]*$/.test(value);
}

function getSlashFilterQuery(value: string): string {
  const m = value.match(/(?:^|[\s\n])\/([^/]*)$/);
  return m ? m[1].trim().toLowerCase() : '';
}

/** 去掉当前输入中激活的 `/…` 片段（用于选中快捷功能后） */
function stripSlashCommand(value: string): string {
  const idx = value.lastIndexOf('/');
  if (idx < 0) return value;
  if (idx > 0 && !/[\s\n]/.test(value[idx - 1]!)) return value;
  return value.slice(0, idx).replace(/\s+$/, '');
}

function filterSlashMenuRows(query: string) {
  if (!query) return SLASH_MENU_ROWS;
  return SLASH_MENU_ROWS.filter(
    (row) =>
      row.label.toLowerCase().includes(query) ||
      row.hint.toLowerCase().includes(query) ||
      row.keywords.toLowerCase().includes(query)
  );
}

/** 跟进问题：短文本或生成失败时的兜底 */
function fallbackQuickQuestionsFor(assistantText: string): string[] {
  const t = (assistantText || '').trim();
  const lower = t.toLowerCase();
  const hasGreeting = /你好|您好|很高兴|hi|hello/.test(t) || /hi|hello/.test(lower);
  const hasAi = /人工智能|ai|大模型|llm|machine learning|深度学习/i.test(t);
  const hasTraining = /训练|training|pretrain|微调|finetune|fine-tune|rlhf|对齐/i.test(t);

  if (hasGreeting) {
    return ['你知道哪些关于人工智能的知识？', '你是如何被训练的？'];
  }
  if (hasTraining) {
    return ['用通俗例子解释一下训练流程', '训练与微调有什么区别？'];
  }
  if (hasAi) {
    return ['给我 3 个实际应用例子', 'AI 的局限性有哪些？'];
  }
  return ['帮我把要点总结成 3 条', '给我一个可执行的下一步建议'];
}

function parseFollowUpLines(raw: string): string[] {
  const lines = raw
    .split(/\r?\n/)
    .map((l) =>
      l
        .replace(/^[\d]+[.)、]\s*/, '')
        .replace(/^[-*•]\s*/, '')
        .replace(/^["'「『]/, '')
        .replace(/["'」』]$/, '')
        .trim()
    )
    .filter(Boolean);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const l of lines) {
    if (l.length > 80) continue;
    if (seen.has(l)) continue;
    seen.add(l);
    out.push(l);
    if (out.length >= 2) break;
  }
  return out;
}

function SlashMenuRowIcon(props: { mode: SlashPickMode; className?: string }) {
  const c = props.className || 'w-4 h-4 shrink-0 opacity-90';
  switch (props.mode) {
    case 'image':
      return <ImageIcon className={c} />;
    case 'video':
      return <VideoIcon className={c} />;
    case 'code':
      return <Code2 className={c} />;
    case 'write':
      return <PenSquare className={c} />;
    case 'translate':
      return <Languages className={c} />;
    case 'analysis':
      return <BarChart3 className={c} />;
    case 'ppt':
      return <Presentation className={c} />;
    case 'chat':
      return <MessageSquare className={c} />;
    default:
      return <MessageCircle className={c} />;
  }
}

function mediaAspectToImageSize(key: MediaAspectKey): string {
  const map: Record<MediaAspectKey, string> = {
    '1:1': '1024x1024',
    '3:4': '768x1024',
    '4:3': '1024x768',
    '9:16': '720x1280',
    '16:9': '1280x720',
    '21:9': '1920x823',
  };
  return map[key];
}

function mediaAspectToCssAspectRatio(key: MediaAspectKey): string {
  const map: Record<MediaAspectKey, string> = {
    '1:1': '1 / 1',
    '3:4': '3 / 4',
    '4:3': '4 / 3',
    '9:16': '9 / 16',
    '16:9': '16 / 9',
    '21:9': '21 / 9',
  };
  return map[key];
}

/** 方舟任务状态 → 对话区展示用短文案 */
function formatVideoTaskStatus(status: string | undefined): string {
  if (status == null || status === '') return '';
  const u = String(status).trim().toUpperCase();
  if (u === 'QUEUED' || u === 'PENDING' || u === 'WAITING') return '排队中';
  if (u === 'RUNNING' || u === 'PROCESSING' || u === 'IN_PROGRESS') return '正在渲染';
  if (u === 'SUBMITTED') return '已提交';
  if (u === 'INIT' || u === 'INITIALIZING') return '初始化中';
  return `任务状态：${String(status)}`;
}

function MediaGeneratingPlaceholder(props: {
  kind: 'image' | 'video';
  isDark: boolean;
  aspect: MediaAspectKey;
  label: string;
  statusDetail?: string;
  progress?: number;
}) {
  const subColor = props.isDark ? 'rgba(255,255,255,0.75)' : 'rgba(15,23,42,0.65)';
  const ratio = mediaAspectToCssAspectRatio(props.aspect);
  const hasNumericProgress = typeof props.progress === 'number' && Number.isFinite(props.progress);
  return (
    <div className="space-y-3 w-full max-w-lg">
      <div
        className="relative w-full rounded-xl overflow-hidden border flex items-center justify-center min-h-[120px]"
        style={{
          aspectRatio: ratio,
          borderColor: props.isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)',
          background: props.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)',
        }}
      >
        <div
          className={`absolute inset-0 animate-pulse ${props.isDark ? 'bg-white/[0.07]' : 'bg-black/[0.06]'}`}
          aria-hidden
        />
        <div className="relative z-10 flex flex-col items-center gap-2 py-6">
          {props.kind === 'image' ? (
            <ImageIcon className="w-10 h-10 opacity-35" style={{ color: subColor }} aria-hidden />
          ) : (
            <VideoIcon className="w-10 h-10 opacity-35" style={{ color: subColor }} aria-hidden />
          )}
          <span className="text-xs opacity-60" style={{ color: subColor }}>
            {props.kind === 'image' ? '图片生成中' : '视频生成中'}
          </span>
        </div>
      </div>
      <div className="text-sm" style={{ color: subColor }}>
        {props.label}
      </div>
      {props.kind === 'video' ? (
        <>
          <div
            className={`h-2 w-full rounded-full overflow-hidden ${props.isDark ? 'bg-white/10' : 'bg-black/10'}`}
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={hasNumericProgress ? Math.round(props.progress!) : undefined}
          >
            {hasNumericProgress ? (
              <div
                className="h-full bg-blue-500 transition-[width] duration-300 rounded-full"
                style={{ width: `${Math.max(0, Math.min(100, props.progress!))}%` }}
              />
            ) : (
              <div className="h-full w-[36%] rounded-full bg-blue-500 animate-pulse" style={{ animationDuration: '1.1s' }} />
            )}
          </div>
          {props.statusDetail ? (
            <div className="text-xs opacity-70" style={{ color: subColor }}>
              {props.statusDetail}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

/** PPT 模式：仅拼入图片生成 API 的 prompt，用户气泡仍展示原始输入 */
const PPT_SLIDE_IMAGE_PROMPT_PREFIX =
  '请生成一张适合作为演示文稿（PPT）幻灯片使用的配图：风格专业、版式清晰、适合投影与大屏展示；可有简洁标题区与内容留白，避免密集小号文字。请根据以下主题与要求生成：\n\n';

type RunSkillOptions = { pptImage?: boolean };

type UiMessage = {
  id: string;
  role: 'user' | 'assistant';
  kind: ChatMessageKind;
  content?: string;
  imageUrl?: string;
  videoUrl?: string;
  isLoading?: boolean;
  error?: string;
  progress?: number;
  statusText?: string;
  /** 代码编辑模式下的助手回复：深色代码区与专用操作条 */
  textVariant?: 'code';
};

/** 输入框内上传/引用的图片、视频或文档（含预览与发给模型的引用串） */
type ChatInputAttachment = {
  id: string;
  kind: 'image' | 'video' | 'document';
  /** 输入框缩略图：data URL、blob URL、http(s)；文档可为空串 */
  previewUrl: string;
  /** 拼进用户提示的引用（data URL / 链接 / docb64:…；大体积视频可能仅为文字说明） */
  apiRef: string;
  /** 文档附件时的文件名（展示用） */
  fileName?: string;
  /** 文档正文前几字，用于缩略图预览（与图片缩略图同级） */
  textPreview?: string;
};

const MAX_VIDEO_EMBED_BYTES = 4 * 1024 * 1024;
/** 单份文档提取后写入会话/上下文的上限，避免超大 Word 撑爆请求 */
const MAX_DOC_TEXT_CHARS = 200_000;
const DOCATT_PREFIX = 'docb64:';

function utf8ToBase64(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin);
}

function base64ToUtf8(b64: string): string {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function serializeDocAttachmentRef(fileName: string, text: string): string {
  const capped = text.slice(0, MAX_DOC_TEXT_CHARS);
  const payload = JSON.stringify({ n: fileName, t: capped });
  return `${DOCATT_PREFIX}${utf8ToBase64(payload)}`;
}

function tryParseDocAttachmentRef(raw: string): { name: string; text: string } | null {
  const s = raw.trim();
  if (!s.startsWith(DOCATT_PREFIX)) return null;
  try {
    const o = JSON.parse(base64ToUtf8(s.slice(DOCATT_PREFIX.length))) as { n?: string; t?: string };
    return { name: String(o.n || ''), text: String(o.t || '') };
  } catch {
    return null;
  }
}

async function readFileAsTextUtf8(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file, 'UTF-8');
  });
}

async function extractPlainTextFromDocx(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(buf);
  const entry = zip.file('word/document.xml');
  if (!entry) throw new Error('docx 中缺少 word/document.xml');
  const xml = await entry.async('string');
  const withBreaks = xml.replace(/<w:p\b[^>]*>/gi, '\n').replace(/<w:tab\b[^>]*\/>/gi, '\t');
  const stripped = withBreaks.replace(/<[^>]+>/g, ' ');
  return stripped
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#[xX]([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&(lt|gt|amp|quot);/g, (_, e) => ({ lt: '<', gt: '>', amp: '&', quot: '"' } as Record<string, string>)[e] || '')
    .replace(/\s+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function isLegacyDoc(file: File): boolean {
  const n = file.name.toLowerCase();
  return n.endsWith('.doc') && !n.endsWith('.docx');
}

function isTxtFile(file: File): boolean {
  const n = file.name.toLowerCase();
  return n.endsWith('.txt') || file.type === 'text/plain';
}

function isDocxFile(file: File): boolean {
  const n = file.name.toLowerCase();
  return (
    n.endsWith('.docx') ||
    file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  );
}

function guessMediaKindFromUrl(url: string): 'image' | 'video' {
  const lower = url.toLowerCase();
  if (/\.(mp4|webm|mov|m4v)(\?|#|$)/.test(lower)) return 'video';
  return 'image';
}

/** 从正文截取用于缩略图展示的短文本 */
function makeDocumentTextPreview(fullText: string, maxChars = 120): string {
  const t = fullText.replace(/\r\n/g, '\n').replace(/\s+/g, ' ').trim();
  if (!t) return '';
  return t.length <= maxChars ? t : `${t.slice(0, maxChars)}…`;
}

function documentKindLabel(fileName: string): string {
  const n = fileName.toLowerCase();
  if (n.endsWith('.docx')) return 'DOCX';
  if (n.endsWith('.txt')) return 'TXT';
  if (n.endsWith('.doc')) return 'DOC';
  return 'FILE';
}

/** 文档附件：仿纸张 + 正文微缩预览（与图片缩略图同尺寸槽位） */
function DocumentAttachmentThumbnail(props: {
  fileName: string;
  textPreview: string;
  isDark: boolean;
  /** 参考弹层内更小格子 */
  compact?: boolean;
}) {
  const { fileName, textPreview, isDark, compact } = props;
  const badge = documentKindLabel(fileName);
  const preview = textPreview.trim() || '· · ·';
  return (
    <div
      className="w-full h-full flex flex-col overflow-hidden rounded-[inherit] select-none"
      title={fileName}
      style={{
        background: isDark
          ? 'linear-gradient(165deg, rgba(51,65,85,0.5) 0%, rgba(15,23,42,0.92) 50%, rgba(15,23,42,0.98) 100%)'
          : 'linear-gradient(165deg, #ffffff 0%, #f8fafc 42%, #e2e8f0 100%)',
        boxShadow: isDark ? 'inset 0 1px 0 rgba(255,255,255,0.05)' : 'inset 0 1px 0 rgba(255,255,255,0.95)',
      }}
    >
      <div
        className={`flex items-center justify-between shrink-0 ${compact ? 'px-0.5 pt-0.5' : 'px-1 pt-0.5'}`}
        style={{
          borderBottom: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(15,23,42,0.08)'}`,
        }}
      >
        <span
          className={`font-semibold tracking-wide ${compact ? 'text-[6px]' : 'text-[7px]'}`}
          style={{ color: isDark ? '#94a3b8' : '#64748b' }}
        >
          {badge}
        </span>
        <FileText className={compact ? 'w-2 h-2 opacity-45' : 'w-2.5 h-2.5 opacity-45'} aria-hidden />
      </div>
      <div className={`flex-1 min-h-0 overflow-hidden ${compact ? 'px-0.5 pt-0.5' : 'px-1 pt-0.5'}`}>
        <p
          className={`break-all opacity-90 ${compact ? 'text-[5px] leading-[1.25]' : 'text-[6px] leading-[1.3]'}`}
          style={{
            color: isDark ? 'rgba(226,232,240,0.85)' : 'rgba(30,41,59,0.9)',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
            display: '-webkit-box',
            WebkitBoxOrient: 'vertical',
            WebkitLineClamp: compact ? 2 : 3,
            overflow: 'hidden',
          }}
        >
          {preview}
        </p>
      </div>
      <div
        className={`shrink-0 truncate font-medium ${compact ? 'px-0.5 pb-0.5 text-[5px]' : 'px-1 pb-0.5 text-[6px]'}`}
        style={{ color: isDark ? 'rgba(248,250,252,0.92)' : '#0f172a' }}
      >
        {fileName}
      </div>
    </div>
  );
}

/** 用户消息里「参考附件」区块：对话区只展示正文 + 缩略图，不展示原始链接/base64 */
type ParsedUserRef =
  | { kind: 'image'; src: string }
  | { kind: 'video'; src: string }
  | { kind: 'local-video'; name: string }
  | { kind: 'document'; name: string; preview?: string };

function parseUserMessageWithAttachments(content: string): { body: string; refs: ParsedUserRef[] } {
  const markers = ['\n\n参考附件：\n', '\n\n参考图：\n'] as const;
  let splitAt = -1;
  let markerLen = 0;
  for (const m of markers) {
    const i = content.indexOf(m);
    if (i !== -1) {
      splitAt = i;
      markerLen = m.length;
      break;
    }
  }
  if (splitAt === -1) {
    return { body: content, refs: [] };
  }
  const body = content.slice(0, splitAt).trimEnd();
  const block = content.slice(splitAt + markerLen);
  const refs: ParsedUserRef[] = [];
  for (const line of block.split('\n')) {
    const raw = line.replace(/^\s*-\s*/, '').trim();
    if (!raw) continue;
    const docParsed = tryParseDocAttachmentRef(raw);
    if (docParsed) {
      refs.push({
        kind: 'document',
        name: docParsed.name || '文档',
        preview: makeDocumentTextPreview(docParsed.text),
      });
      continue;
    }
    const local = /^\[本地视频:([^\]]+)\]$/.exec(raw);
    if (local) {
      refs.push({ kind: 'local-video', name: local[1].trim() || '视频' });
      continue;
    }
    if (raw.startsWith('data:image')) {
      refs.push({ kind: 'image', src: raw });
      continue;
    }
    if (raw.startsWith('data:video')) {
      refs.push({ kind: 'video', src: raw });
      continue;
    }
    if (/^https?:\/\//i.test(raw)) {
      const k = guessMediaKindFromUrl(raw);
      refs.push(k === 'video' ? { kind: 'video', src: raw } : { kind: 'image', src: raw });
    }
  }
  return { body, refs };
}

function UserBubbleText(props: { content: string; isDark: boolean }) {
  const { body, refs } = parseUserMessageWithAttachments(props.content);
  const textColor = props.isDark ? 'rgba(255,255,255,0.92)' : '#0f172a';
  if (refs.length === 0) {
    return (
      <div className="text-sm leading-6" style={{ color: textColor }}>
        {renderMarkdownLite(props.content)}
      </div>
    );
  }
  return (
    <>
      {body ? (
        <div className="text-sm leading-6" style={{ color: textColor }}>
          {renderMarkdownLite(body)}
        </div>
      ) : null}
      <div className="mt-2 flex flex-wrap gap-2 justify-end">
        {refs.map((r, idx) => (
          <div
            key={idx}
            className="relative flex-shrink-0 w-14 h-14 rounded-xl overflow-hidden"
            style={{
              border: `1px solid ${props.isDark ? 'rgba(255,255,255,0.12)' : 'rgba(15,23,42,0.10)'}`,
              background: props.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
            }}
          >
            {r.kind === 'image' ? (
              <img src={r.src} alt="" className="w-full h-full object-cover" />
            ) : r.kind === 'video' ? (
              <video src={r.src} className="w-full h-full object-cover" muted playsInline preload="metadata" />
            ) : r.kind === 'document' ? (
              <DocumentAttachmentThumbnail
                fileName={r.name}
                textPreview={r.preview || ''}
                isDark={props.isDark}
              />
            ) : (
              <div
                className="w-full h-full flex flex-col items-center justify-center gap-0.5 px-1"
                title={r.name}
                style={{ color: textColor }}
              >
                <VideoIcon className="w-5 h-5 opacity-80" />
                <span className="text-[9px] leading-tight text-center truncate w-full opacity-90">{r.name}</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/** 落库时标记为视频消息，刷新后仍能识别为 video（不仅依赖 URL 是否含 .mp4） */
const VIDEO_MSG_PREFIX = '__PM_VIDEO__:';

function uid() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/** 短时记忆：最多携带的「轮」数（user+assistant 各算半轮，这里指 user 条数上限） */
const SHORT_TERM_MEMORY_MAX_USER_TURNS = 12;
/** 单条消息写入上下文时的最大字符数（含清洗后） */
const SHORT_TERM_MEMORY_MAX_CHARS = 8000;

/** 去掉 base64/过长链接，减轻上下文体积与上游报错风险 */
function sanitizeMemoryContent(raw: string): string {
  let s = String(raw || '').replace(/\r\n/g, '\n');
  const lines = s.split('\n');
  s = lines
    .map((line) => {
      const trimmed = line.trim();
      const dashM = /^\-\s*(.+)$/.exec(trimmed);
      const docCandidate = dashM ? dashM[1]!.trim() : trimmed;
      if (docCandidate.startsWith(DOCATT_PREFIX)) {
        const parsedDoc = tryParseDocAttachmentRef(docCandidate);
        if (parsedDoc) {
          return `[文档：${parsedDoc.name || '未命名'}]\n${parsedDoc.text}`;
        }
      }
      if (trimmed.startsWith('data:image/') || trimmed.startsWith('data:video/')) {
        return line.replace(trimmed, '[附件：已省略大体积数据]');
      }
      if (/^https?:\/\//i.test(trimmed) && trimmed.length > 400) {
        return line.replace(trimmed, `${trimmed.slice(0, 240)}…[链接已截断]`);
      }
      return line;
    })
    .join('\n');
  if (s.length > SHORT_TERM_MEMORY_MAX_CHARS) {
    s = `${s.slice(0, SHORT_TERM_MEMORY_MAX_CHARS)}\n…（本条已截断）`;
  }
  return s;
}

/**
 * 将当前会话 UI 消息转为 chat/completions 的 user/assistant 列表（不含 system、不含本轮尚未追加的用户句）。
 * 用于短时记忆：写作/编程/翻译/分析/闲聊等走大模型时带上文；仅保留**最近**若干轮用户发言起的片段。
 */
function uiMessagesToMemoryPayload(list: UiMessage[]): Array<{ role: 'user' | 'assistant'; content: string }> {
  const out: Array<{ role: 'user' | 'assistant'; content: string }> = [];

  for (const m of list) {
    if (m.role === 'user') {
      const c = sanitizeMemoryContent(m.content || '');
      if (!c.trim()) continue;
      out.push({ role: 'user', content: c });
      continue;
    }

    if (m.role !== 'assistant') continue;

    if (m.kind === 'text') {
      if (m.isLoading && !(m.content || '').trim()) continue;
      const c = sanitizeMemoryContent(m.content || '');
      if (c.trim()) {
        out.push({ role: 'assistant', content: c });
        continue;
      }
      if (m.error && String(m.error).trim()) {
        out.push({ role: 'assistant', content: sanitizeMemoryContent(`（系统提示）${m.error}`) });
      }
      continue;
    }

    if (m.kind === 'image') {
      if (m.isLoading) continue;
      if (m.imageUrl) {
        out.push({
          role: 'assistant',
          content: sanitizeMemoryContent(`（助手已生成图片，结果链接：${m.imageUrl}）`),
        });
      }
      continue;
    }

    if (m.kind === 'video') {
      if (m.isLoading) continue;
      if (m.videoUrl) {
        out.push({
          role: 'assistant',
          content: sanitizeMemoryContent(`（助手已生成视频，结果链接：${m.videoUrl}）`),
        });
      }
    }
  }

  let userCount = 0;
  let start = 0;
  for (let i = out.length - 1; i >= 0; i--) {
    if (out[i].role === 'user') {
      userCount += 1;
      if (userCount >= SHORT_TERM_MEMORY_MAX_USER_TURNS) {
        start = i;
        break;
      }
    }
  }
  return out.slice(start);
}

/** 从方舟「查询视频任务」响应中解析视频地址（字段名因版本可能不同） */
function extractVideoOutputUrlFromTask(t: any): string | null {
  const tryOne = (x: any): string | null => {
    if (!x || typeof x !== 'object') return null;
    const candidates: unknown[] = [
      x.output,
      x.video_url,
      x.videoUrl,
      x.result_url,
      x.resultUrl,
      x.url,
      x.result && typeof x.result === 'object' ? (x.result as { url?: string; video_url?: string; output?: string }).url : undefined,
      x.result && typeof x.result === 'object'
        ? (x.result as { url?: string; video_url?: string; output?: string }).video_url
        : undefined,
      x.result && typeof x.result === 'object'
        ? (x.result as { url?: string; video_url?: string; output?: string }).output
        : undefined,
    ];
    for (const v of candidates) {
      if (typeof v === 'string') {
        const s = v.trim();
        if (/^https?:\/\//i.test(s)) return s;
      }
    }
    const contents = x.content;
    if (contents && typeof contents === 'object' && !Array.isArray(contents)) {
      const c = contents as { video_url?: string; videoUrl?: string; url?: string };
      const u = c.video_url || c.videoUrl || c.url;
      if (typeof u === 'string' && /^https?:\/\//i.test(u.trim())) return u.trim();
    }
    if (Array.isArray(contents)) {
      for (const block of contents) {
        if (!block || typeof block !== 'object') continue;
        const u =
          (block as { video_url?: string; videoUrl?: string; url?: string; output?: string }).video_url ||
          (block as { video_url?: string; videoUrl?: string; url?: string; output?: string }).videoUrl ||
          (block as { video_url?: string; videoUrl?: string; url?: string; output?: string }).url ||
          (block as { video_url?: string; videoUrl?: string; url?: string; output?: string }).output;
        if (typeof u === 'string' && /^https?:\/\//i.test(u.trim())) return u.trim();
      }
    }
    return null;
  };

  return tryOne(t) || tryOne(t?.data);
}

/** API 返回的 error / fail_reason 常为嵌套对象，直接 String(x) 会得到 [object Object] */
function formatErrorForUser(err: unknown): string {
  if (err == null) return '未知错误';
  if (typeof err === 'string') {
    const s = err.trim();
    return s || '未知错误';
  }
  if (err instanceof Error) {
    const m = err.message.trim();
    return m || '未知错误';
  }
  if (typeof err === 'object') {
    const o = err as Record<string, unknown>;
    const candidates = [o.message, o.msg, o.reason, o.detail, o.fail_reason, o.failReason, o.error];
    for (const c of candidates) {
      if (typeof c === 'string' && c.trim()) return c.trim();
      if (c != null && typeof c === 'object') {
        const inner = formatErrorForUser(c);
        if (inner !== '未知错误') return inner;
      }
    }
    try {
      return JSON.stringify(err);
    } catch {
      return '未知错误';
    }
  }
  return String(err);
}

/**
 * 用户未点「图像 / 视频 / PPT」快捷键时，根据正文直连对应生成接口
 *（默认聊天、写作、编程、翻译等模式下同样生效）
 */
function inferMediaIntentFromUserText(text: string): { skill: 'image' | 'video'; pptImage: boolean } | null {
  const t = text.trim();
  if (!t) return null;

  /** 「生成」与「视频」之间可夹描述，如：生成一只猫的视频、帮我生成山水画风格的视频 */
  const videoFlexible = /生成[\s\S]{1,240}?视频/;
  /** 同上：生成 xxx 图片 / 图像 */
  const imageFlexible = /生成[\s\S]{1,240}?(?:图片|图像)/;

  const videoRe =
    /视频生成|生成视频|文生视频|图生视频|制作视频|做个视频|来段视频|生成一段视频|短视频生成|生成短片|动画视频|动效视频|帮我生成视频|帮忙生成视频|想生成视频|生成个视频|出一段视频|来段片子|给我(?:做|来|生成)?(?:个|一段)?视频|来(?:个|一段)视频/i;
  const pptRe =
    /PPT生成|ppt生成|生成PPT|生成ppt|幻灯片生成|生成幻灯片|演示文稿|演示稿|幻灯配图|做PPT|做个ppt|帮我做ppt|ppt配图/i;
  const imageRe =
    /图像生成|图片生成|生图|文生图|作图|画图|画一张|生成图片|生成一幅|帮我画图|出一张图|帮我生成图片|让生成图片|给我一张图|来张图|出张图|生成张图|给我(?:画|做|来|生成)?(?:张|一幅|一张)?图/i;

  if (videoFlexible.test(t) || videoRe.test(t)) return { skill: 'video', pptImage: false };
  if (pptRe.test(t)) return { skill: 'image', pptImage: true };
  if (imageFlexible.test(t) || imageRe.test(t)) return { skill: 'image', pptImage: false };
  return null;
}

function ChatVideoPlayer(props: { src: string; isDark: boolean }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div
        className="rounded-xl border px-3 py-2.5 text-sm space-y-2"
        style={{
          background: props.isDark ? '#000000' : 'rgba(255,255,255,0.98)',
          borderColor: props.isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.06)',
          color: props.isDark ? 'rgba(255,255,255,0.85)' : '#0f172a',
        }}
      >
        <div>无法在此页面内嵌播放该视频（常见于跨域或链接已过期）。</div>
        <a
          href={props.src}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-blue-500 hover:underline font-medium"
        >
          在新窗口打开视频
        </a>
      </div>
    );
  }
  return (
    <video
      controls
      playsInline
      preload="metadata"
      src={props.src}
      className="w-full max-w-full rounded-xl border"
      style={{
        backgroundColor: props.isDark ? '#000000' : undefined,
        borderColor: props.isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.06)',
      }}
      onError={() => setFailed(true)}
    />
  );
}

/** 解析行内 `**加粗**`（Markdown），代码块外正文使用 */
function formatInlineBold(text: string): React.ReactNode {
  if (!text.includes('**')) return text;
  const nodes: React.ReactNode[] = [];
  const re = /\*\*([\s\S]*?)\*\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    nodes.push(
      <strong key={`b${k++}`} className="font-semibold">
        {m[1]}
      </strong>
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes.length ? <>{nodes}</> : text;
}

function renderMarkdownLite(content: string) {
  const parts = content.split(/```/g);
  if (parts.length <= 1) {
    const paras = content.split(/\n{2,}/g).map((p) => p.trimEnd());
    return (
      <div className="text-sm leading-6 break-words space-y-1">
        {paras.map((p, idx) => (
          <div key={idx} className="whitespace-pre-wrap">
            {formatInlineBold(p)}
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {parts.map((part, i) => {
        const isCode = i % 2 === 1;
        if (!isCode) {
          const paras = part.split(/\n{2,}/g).map((p) => p.trimEnd());
          return (
            <div key={i} className="text-sm leading-6 break-words space-y-1">
              {paras.map((p, idx) => (
                <div key={idx} className="whitespace-pre-wrap">
                  {formatInlineBold(p)}
                </div>
              ))}
            </div>
          );
        }
        const codeBody = part.replace(/^\w+\n/, '');
        return (
          <pre key={i} className="bg-black/25 border border-white/10 rounded-xl p-3 overflow-x-auto whitespace-pre">
            <code className="text-xs">{codeBody}</code>
          </pre>
        );
      })}
    </div>
  );
}

const CODE_KEYWORD_RE =
  /\b(const|let|var|function|return|if|else|for|while|class|import|export|from|default|async|await|try|catch|finally|throw|new|typeof|instanceof|void|delete|in|of|break|continue|switch|case|do|interface|type|extends|implements|enum|public|private|protected|static|readonly|abstract|namespace|declare|def|elif|pass|lambda|with|yield|global|nonlocal|True|False|None|and|or|not|is|print|self|super)\b/g;

function highlightCodeLine(line: string): React.ReactNode {
  const ci = line.indexOf('//');
  if (ci !== -1) {
    return (
      <>
        {colorizeCodeNoComment(line.slice(0, ci))}
        <span style={{ color: '#9ca3af' }}>{line.slice(ci)}</span>
      </>
    );
  }
  return colorizeCodeNoComment(line);
}

function colorizeCodeStringsAndKeywords(s: string, keyBase: number): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let last = 0;
  let k = keyBase;
  const strRe = /'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"/g;
  let m: RegExpExecArray | null;
  while ((m = strRe.exec(s)) !== null) {
    if (m.index > last) out.push(...colorizeKeywordsOnly(s.slice(last, m.index), k));
    k += 50;
    out.push(
      <span key={`st${k++}`} style={{ color: '#86efac' }}>
        {m[0]}
      </span>
    );
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push(...colorizeKeywordsOnly(s.slice(last), k));
  return out.length ? out : colorizeKeywordsOnly(s, keyBase);
}

function colorizeKeywordsOnly(s: string, keyBase: number): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let last = 0;
  let k = keyBase;
  const re = new RegExp(CODE_KEYWORD_RE.source, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    if (m.index > last) {
      out.push(
        <span key={`t${k++}`} style={{ color: '#e5e7eb' }}>
          {s.slice(last, m.index)}
        </span>
      );
    }
    out.push(
      <span key={`kw${k++}`} style={{ color: '#7dd3fc' }}>
        {m[0]}
      </span>
    );
    last = m.index + m[0].length;
  }
  if (last < s.length) {
    out.push(
      <span key={`t${k++}`} style={{ color: '#e5e7eb' }}>
        {s.slice(last)}
      </span>
    );
  }
  return out;
}

function colorizeCodeNoComment(s: string): React.ReactNode {
  const nodes = colorizeCodeStringsAndKeywords(s, 0);
  return nodes.length ? <>{nodes}</> : <span style={{ color: '#e5e7eb' }}>{s}</span>;
}

function highlightCodeBlockBody(code: string): React.ReactNode {
  const lines = code.split('\n');
  return lines.map((line, i) => (
    <React.Fragment key={i}>
      {i > 0 ? '\n' : null}
      {highlightCodeLine(line)}
    </React.Fragment>
  ));
}

function parseFenceFirstLine(part: string): { lang: string; body: string } {
  const nl = part.indexOf('\n');
  if (nl === -1) return { lang: 'code', body: part };
  const first = part.slice(0, nl).trim();
  const rest = part.slice(nl + 1);
  if (/^[a-zA-Z0-9+#.\-]{1,32}$/.test(first)) {
    return { lang: first, body: rest };
  }
  return { lang: 'code', body: part };
}

/** 代码模式：黑色代码区、白字 + 简易高亮；每块带复制 */
function renderMarkdownCodeMode(
  content: string,
  isDark: boolean,
  opts?: { onCopyBlock?: (text: string) => void }
): React.ReactNode {
  const proseColor = isDark ? 'rgba(255,255,255,0.88)' : 'rgba(15,23,42,0.88)';
  const parts = content.split(/```/g);
  if (parts.length <= 1) {
    const paras = content.split(/\n{2,}/g).map((p) => p.trimEnd());
    return (
      <div className="text-sm leading-6 break-words space-y-2" style={{ color: proseColor }}>
        {paras.map((p, idx) => (
          <div key={idx} className="whitespace-pre-wrap">
            {formatInlineBold(p)}
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {parts.map((part, i) => {
        const isCode = i % 2 === 1;
        if (!isCode) {
          const paras = part.split(/\n{2,}/g).map((p) => p.trimEnd());
          return (
            <div key={i} className="text-sm leading-6 break-words space-y-1" style={{ color: proseColor }}>
              {paras.map((p, idx) => (
                <div key={idx} className="whitespace-pre-wrap">
                  {formatInlineBold(p)}
                </div>
              ))}
            </div>
          );
        }
        const { lang, body } = parseFenceFirstLine(part);
        const trimmed = body.replace(/\n$/, '');
        return (
          <div
            key={i}
            className="rounded-xl overflow-hidden border border-white/10"
            style={{ background: '#000000' }}
          >
            <div
              className="flex items-center justify-between gap-2 px-3 py-2 border-b border-white/10"
              style={{ background: '#0a0a0a' }}
            >
              <span className="text-[11px] font-mono uppercase tracking-wide" style={{ color: '#9ca3af' }}>
                {lang}
              </span>
              <button
                type="button"
                className="text-[11px] px-2 py-1 rounded-md transition hover:bg-white/10"
                style={{ color: '#e5e7eb' }}
                onClick={() => opts?.onCopyBlock?.(trimmed)}
              >
                复制
              </button>
            </div>
            <pre
              className="p-3 overflow-x-auto text-[13px] leading-relaxed whitespace-pre font-mono"
              style={{ color: '#e5e7eb', margin: 0 }}
            >
              <code>{highlightCodeBlockBody(trimmed)}</code>
            </pre>
          </div>
        );
      })}
    </div>
  );
}

function sessionToUiMessages(session: AiChatSession | null): UiMessage[] {
  if (!session) return [];
  return (session.messages || [])
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => {
      const content = m.content || '';
      if (content.startsWith(VIDEO_MSG_PREFIX)) {
        const videoUrl = content.slice(VIDEO_MSG_PREFIX.length).trim();
        return {
          id: m.id,
          role: m.role as 'user' | 'assistant',
          kind: 'video' as const,
          content: undefined,
          videoUrl,
        };
      }
      const lower = content.toLowerCase();
      const isVideo =
        lower.includes('.mp4') || lower.includes('.webm') || lower.includes('.mov') || lower.includes('.m4v');
      const isImage = lower.startsWith('http') && (lower.includes('.png') || lower.includes('.jpg') || lower.includes('.jpeg') || lower.includes('.webp'));

      const isText = !isVideo && !isImage;
      const textVariant =
        m.role === 'assistant' && isText && /```/.test(content) ? ('code' as const) : undefined;

      return {
        id: m.id,
        role: m.role as 'user' | 'assistant',
        kind: isVideo ? 'video' : isImage ? 'image' : 'text',
        content: isVideo || isImage ? undefined : content,
        videoUrl: isVideo ? content : undefined,
        imageUrl: isImage ? content : undefined,
        textVariant,
      };
    });
}

export function ChatPage(props: { onExitToDesktop?: () => void }) {
  const { theme, themeName } = useTheme();
  const isDark = themeName !== 'light';
  const speechRef = useRef<SpeechSynthesisUtterance | null>(null);
  const [feedbackOpenForId, setFeedbackOpenForId] = useState<string | null>(null);
  const [feedbackType, setFeedbackType] = useState<'like' | 'dislike' | null>(null);
  const [feedbackSelected, setFeedbackSelected] = useState<Record<string, string[]>>({});
  const [moreOpenForId, setMoreOpenForId] = useState<string | null>(null);
  const [quickMode, setQuickMode] = useState<'fast' | 'think'>('fast');
  const [quickMenuOpen, setQuickMenuOpen] = useState(false);
  const quickMenuPanelRef = useRef<HTMLDivElement | null>(null);
  const [quickMenuPos, setQuickMenuPos] = useState<{ left: number; top: number } | null>(null);
  const [aspectRatioMenuOpen, setAspectRatioMenuOpen] = useState(false);
  const aspectRatioMenuPanelRef = useRef<HTMLDivElement | null>(null);
  const aspectRatioTriggerRef = useRef<HTMLButtonElement | null>(null);
  const [aspectRatioMenuPos, setAspectRatioMenuPos] = useState<{ left: number; top: number } | null>(null);
  const [translateTargetLang, setTranslateTargetLang] = useState<TranslateTargetId>('zh-Hans');
  const [translateLangMenuOpen, setTranslateLangMenuOpen] = useState(false);
  const translateLangMenuPanelRef = useRef<HTMLDivElement | null>(null);
  const translateLangTriggerRef = useRef<HTMLButtonElement | null>(null);
  const [translateLangMenuPos, setTranslateLangMenuPos] = useState<{ left: number; top: number } | null>(null);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const moreMenuPanelRef = useRef<HTMLDivElement | null>(null);
  const [moreMenuPos, setMoreMenuPos] = useState<{ left: number; top: number } | null>(null);

  const [sessions, setSessions] = useState<AiChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [uiMessages, setUiMessages] = useState<UiMessage[]>([]);
  const [input, setInput] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [inputMode, setInputMode] = useState<InputMode>(null);
  const [mediaAspectKey, setMediaAspectKey] = useState<MediaAspectKey>('16:9');
  const [isRefOpen, setIsRefOpen] = useState(false);
  const [refLinkDraft, setRefLinkDraft] = useState('');
  /** 历史会话行：三点菜单（相对置顶按钮悬停出现） */
  const [sessionSidebarMenuId, setSessionSidebarMenuId] = useState<string | null>(null);
  const sessionSidebarMenuWrapRef = useRef<HTMLDivElement | null>(null);
  const [renameSessionModal, setRenameSessionModal] = useState<{ id: string; draft: string } | null>(null);
  const [inputAttachments, setInputAttachments] = useState<ChatInputAttachment[]>([]);
  const inputAttachmentsRef = useRef<ChatInputAttachment[]>([]);
  inputAttachmentsRef.current = inputAttachments;
  const [isInputFocused, setIsInputFocused] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const chatTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const slashMenuPanelRef = useRef<HTMLDivElement | null>(null);
  const [codeFullscreen, setCodeFullscreen] = useState<{ content: string } | null>(null);
  const [slashMenuPos, setSlashMenuPos] = useState<{ left: number; top: number } | null>(null);
  const [slashMenuIndex, setSlashMenuIndex] = useState(0);

  const slashMenuVisible =
    isSlashCommandOpen(input) && !isBusy && !!activeSessionId;

  const slashRowsToShow = useMemo(() => {
    if (!slashMenuVisible) return [];
    const q = getSlashFilterQuery(input);
    const f = filterSlashMenuRows(q);
    if (f.length > 0) return f;
    return q ? [] : SLASH_MENU_ROWS;
  }, [input, slashMenuVisible]);

  useLayoutEffect(() => {
    if (!slashMenuVisible || !chatTextareaRef.current) {
      if (!slashMenuVisible) setSlashMenuPos(null);
      return;
    }
    const rect = chatTextareaRef.current.getBoundingClientRect();
    setSlashMenuPos({ left: rect.left, top: rect.top - 8 });
  }, [input, slashMenuVisible]);

  useEffect(() => {
    if (!slashMenuVisible) return;
    setSlashMenuIndex((i) => Math.min(i, Math.max(0, slashRowsToShow.length - 1)));
  }, [slashMenuVisible, slashRowsToShow.length]);

  useEffect(() => {
    if (!slashMenuVisible) return;
    const onDoc = (e: MouseEvent) => {
      const panel = slashMenuPanelRef.current;
      const ta = chatTextareaRef.current;
      const t = e.target;
      if (t instanceof Node && panel?.contains(t)) return;
      if (t instanceof Node && ta?.contains(t)) return;
      setInput((v) => stripSlashCommand(v));
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [slashMenuVisible]);

  const [followUpQuestionsByMsgId, setFollowUpQuestionsByMsgId] = useState<Record<string, string[]>>({});
  const [followUpLoadingByMsgId, setFollowUpLoadingByMsgId] = useState<Record<string, boolean>>({});
  const followUpFetchedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    for (const m of uiMessages) {
      if (m.role !== 'assistant' || m.kind !== 'text' || !m.content?.trim() || m.isLoading) continue;
      if (m.textVariant === 'code') continue;
      if (followUpFetchedRef.current.has(m.id)) continue;

      const text = m.content.trim();
      followUpFetchedRef.current.add(m.id);

      if (text.length < 12) {
        setFollowUpQuestionsByMsgId((prev) => ({
          ...prev,
          [m.id]: fallbackQuickQuestionsFor(text),
        }));
        continue;
      }

      setFollowUpLoadingByMsgId((prev) => ({ ...prev, [m.id]: true }));
      void (async () => {
        const body = text.slice(0, 12000);
        try {
          const resp = await chatCompletionSync({
            model: 'doubao-1-5-lite-32k-250115',
            messages: [
              {
                role: 'system',
                content:
                  '你是对话助手。根据下面「助手已回复给用户的内容」，推测用户接下来最可能追问的 2 个中文问题。要求：' +
                  '每条不超过 45 字；只输出两行，每行恰好一个问题；不要编号、不要引号、不要前缀、不要解释；' +
                  '两个问题角度尽量不同；每次输出应自然变化、不要套模板。',
              },
              {
                role: 'user',
                content: `助手回复如下：\n\n${body}`,
              },
            ],
            max_tokens: 220,
            temperature: 0.88,
          });
          const raw = resp.success && resp.data?.content ? String(resp.data.content) : '';
          let two = parseFollowUpLines(raw);
          if (two.length < 2) {
            const fb = fallbackQuickQuestionsFor(text);
            two = [...two, ...fb].filter((q, i, a) => a.indexOf(q) === i).slice(0, 2);
          }
          setFollowUpQuestionsByMsgId((prev) => ({ ...prev, [m.id]: two }));
        } catch {
          setFollowUpQuestionsByMsgId((prev) => ({
            ...prev,
            [m.id]: fallbackQuickQuestionsFor(text),
          }));
        } finally {
          setFollowUpLoadingByMsgId((prev) => {
            const next = { ...prev };
            delete next[m.id];
            return next;
          });
        }
      })();
    }
  }, [uiMessages]);

  useEffect(() => {
    return () => {
      inputAttachmentsRef.current.forEach((a) => {
        if (a.previewUrl.startsWith('blob:')) URL.revokeObjectURL(a.previewUrl);
      });
    };
  }, []);

  const clearInputAttachments = () => {
    setInputAttachments((prev) => {
      prev.forEach((a) => {
        if (a.previewUrl.startsWith('blob:')) URL.revokeObjectURL(a.previewUrl);
      });
      return [];
    });
  };

  const removeInputAttachment = (id: string) => {
    setInputAttachments((prev) => {
      const found = prev.find((x) => x.id === id);
      if (found?.previewUrl.startsWith('blob:')) URL.revokeObjectURL(found.previewUrl);
      return prev.filter((x) => x.id !== id);
    });
  };

  const activeSession = useMemo(
    () => sessions.find((s) => s.id === activeSessionId) || null,
    [sessions, activeSessionId]
  );

  const isEmptyState = (activeSession?.messages?.length || 0) === 0;

  const endRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [uiMessages]);

  useEffect(() => {
    if (!quickMenuOpen) return;
    const onDocDown = (e: MouseEvent) => {
      const el = quickMenuPanelRef.current;
      if (!el) return;
      if (e.target instanceof Node && el.contains(e.target)) return;
      setQuickMenuOpen(false);
    };
    document.addEventListener('mousedown', onDocDown);
    return () => document.removeEventListener('mousedown', onDocDown);
  }, [quickMenuOpen]);

  useEffect(() => {
    if (inputMode !== 'image' && inputMode !== 'video') {
      setAspectRatioMenuOpen(false);
    }
  }, [inputMode]);

  useEffect(() => {
    if (inputMode !== 'translate') {
      setTranslateLangMenuOpen(false);
    }
  }, [inputMode]);

  useEffect(() => {
    if (!translateLangMenuOpen) return;
    const onDocDown = (e: MouseEvent) => {
      const panel = translateLangMenuPanelRef.current;
      const trig = translateLangTriggerRef.current;
      const t = e.target;
      if (t instanceof Node) {
        if (panel?.contains(t)) return;
        if (trig?.contains(t)) return;
      }
      setTranslateLangMenuOpen(false);
    };
    document.addEventListener('mousedown', onDocDown);
    return () => document.removeEventListener('mousedown', onDocDown);
  }, [translateLangMenuOpen]);

  /** 进入翻译快捷模式时自动弹出目标语言上拉栏 */
  useLayoutEffect(() => {
    if (inputMode !== 'translate') return;
    const el = translateLangTriggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setTranslateLangMenuPos({ left: rect.left, top: rect.top - 8 });
    setTranslateLangMenuOpen(true);
  }, [inputMode]);

  useEffect(() => {
    if (!aspectRatioMenuOpen) return;
    const onDocDown = (e: MouseEvent) => {
      const panel = aspectRatioMenuPanelRef.current;
      const trig = aspectRatioTriggerRef.current;
      const t = e.target;
      if (t instanceof Node) {
        if (panel?.contains(t)) return;
        if (trig?.contains(t)) return;
      }
      setAspectRatioMenuOpen(false);
    };
    document.addEventListener('mousedown', onDocDown);
    return () => document.removeEventListener('mousedown', onDocDown);
  }, [aspectRatioMenuOpen]);

  useEffect(() => {
    if (!moreMenuOpen) return;
    const onDocDown = (e: MouseEvent) => {
      const el = moreMenuPanelRef.current;
      if (!el) return;
      if (e.target instanceof Node && el.contains(e.target)) return;
      setMoreMenuOpen(false);
    };
    document.addEventListener('mousedown', onDocDown);
    return () => document.removeEventListener('mousedown', onDocDown);
  }, [moreMenuOpen]);

  const activeAssistSystemPrompt = useMemo(() => {
    return {
      chat: '你是人工智能助手。回答简洁、准确、可执行。必要时给出步骤或示例。',
      chat_think:
        '你是人工智能助手。请先用更深入的思考与拆解（分步骤、列出关键假设与可能分支），再给出结论与可执行建议。回答仍要清晰、准确。',
      analysis:
        '你是数据分析助手。请先澄清数据口径与假设，再给出结构化分析、结论与可执行建议。必要时用表格/要点输出。',
      code: '你是资深编程助手。请根据用户需求给出可运行的代码优先，使用清晰的结构。可以使用 ```代码块```。',
      write: '你是优秀写作助手。请用中文创作，语言生动有画面，按用户要求的体裁与长度输出。',
    } as const;
  }, []);

  async function refreshSessions(selectId?: string) {
    const resp = await getChatSessions();
    if (resp.success && resp.data) {
      const list = resp.data;
      setSessions(list);
      const nextId = selectId || activeSessionId || (list[0]?.id ?? null);
      setActiveSessionId(nextId);
      const nextSession = list.find((s) => s.id === nextId) || null;
      setUiMessages(sessionToUiMessages(nextSession));
      return;
    }
    // 没取到就保持 UI，不抛异常，避免白屏
  }

  useEffect(() => {
    void (async () => {
      const resp = await getChatSessions();
      if (resp.success && resp.data && resp.data.length > 0) {
        setSessions(resp.data);
        const first = resp.data[0];
        setActiveSessionId(first.id);
        setUiMessages(sessionToUiMessages(first));
        return;
      }
      // 没有会话则创建一个
      const created = await createChatSession('新对话');
      if (created.success && created.data) {
        await refreshSessions(created.data.id);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function streamChatCompletion(opts: {
    systemPrompt: string;
    userText: string;
    /** 短时记忆：不含 system、不含本轮 user（由 userText 单独追加） */
    memoryMessages?: Array<{ role: 'user' | 'assistant'; content: string }>;
    onContent: (chunk: string, fullText: string) => void;
  }): Promise<string> {
    const memory = opts.memoryMessages ?? [];
    const response = await fetch('/api/ai/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'doubao-1-5-lite-32k-250115',
        messages: [
          { role: 'system', content: opts.systemPrompt },
          ...memory,
          { role: 'user', content: opts.userText },
        ],
      }),
    });

    if (!response.ok || !response.body) {
      const text = await response.text().catch(() => '');
      throw new Error(text || `流式请求失败 (${response.status})`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullText = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line.startsWith('data:')) continue;
        const dataText = line.slice(5).trim();
        if (!dataText) continue;

        try {
          const payload = JSON.parse(dataText) as { content?: string; error?: string; done?: boolean };
          if (payload.error) {
            throw new Error(payload.error);
          }
          if (payload.content) {
            fullText += payload.content;
            opts.onContent(payload.content, fullText);
          }
          if (payload.done) {
            return fullText;
          }
        } catch (e) {
          if (e instanceof Error) throw e;
        }
      }
    }

    return fullText;
  }

  async function handleNewSession() {
    if (isBusy) return;
    const created = await createChatSession('新对话');
    if (created.success && created.data) {
      await refreshSessions(created.data.id);
    }
  }

  async function handleTogglePin(session: AiChatSession) {
    const next = !session.isPinned;
    await updateChatSession(session.id, { isPinned: next });
    await refreshSessions(session.id);
  }

  async function handleDeleteSession(session: AiChatSession) {
    if (isBusy) return;
    await deleteChatSession(session.id);
    const remaining = sessions.filter((s) => s.id !== session.id);
    const nextId = remaining[0]?.id ?? null;
    await refreshSessions(nextId || undefined);
  }

  async function handleRenameSessionSubmit() {
    if (!renameSessionModal) return;
    const title = renameSessionModal.draft.trim();
    if (!title) return;
    await updateChatSession(renameSessionModal.id, { title });
    setRenameSessionModal(null);
    await refreshSessions(activeSessionId ?? undefined);
  }

  useEffect(() => {
    if (!sessionSidebarMenuId) {
      sessionSidebarMenuWrapRef.current = null;
      return;
    }
    const onDoc = (e: MouseEvent) => {
      const t = e.target;
      if (!(t instanceof Node)) return;
      if (sessionSidebarMenuWrapRef.current?.contains(t)) return;
      setSessionSidebarMenuId(null);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [sessionSidebarMenuId]);

  async function runArkTaskAndGetOutputUrl(
    prompt: string,
    options?: Record<string, unknown>,
    onProgress?: (p?: number, s?: string) => void,
    referenceMediaUrls?: string[]
  ) {
    const createResp = await generateVideoTask({
      prompt,
      options,
      ...(referenceMediaUrls?.length ? { referenceMediaUrls } : {}),
    });
    if (!createResp.success) throw new Error(formatErrorForUser(createResp.error) || '任务创建失败');

    const taskData = createResp.data;
    const taskId =
      taskData?.task_id ||
      taskData?.taskId ||
      taskData?.id ||
      taskData?.data?.task_id ||
      taskData?.data?.taskId ||
      taskData?.data?.id;
    if (!taskId) throw new Error('任务创建成功但未返回 taskId');

    const maxAttempts = 200;
    const intervalMs = 3000;

    for (let i = 0; i < maxAttempts; i++) {
      const statusResp = await getVideoTask(taskId);
      if (!statusResp.success) throw new Error(formatErrorForUser(statusResp.error) || '查询任务失败');

      const t = statusResp.data;
      const rawStatus = t?.status || t?.state || t?.task_status || t?.data?.status || '';
      // 方舟返回小写：queued | running | succeeded | failed | cancelled（不能用 includes('SUCCESS') 判断 succeeded）
      const statusLower = String(rawStatus || '')
        .trim()
        .toLowerCase();
      const statusNorm = statusLower.toUpperCase();
      const progressRaw = t?.progress ?? t?.data?.progress ?? '';
      const progressNum =
        typeof progressRaw === 'number'
          ? progressRaw
          : parseInt(String(progressRaw).replace(/[^0-9]/g, ''), 10);
      const progress = Number.isFinite(progressNum) ? progressNum : undefined;
      onProgress?.(progress, statusNorm);

      const outputUrl = extractVideoOutputUrlFromTask(t);

      const isSuccess =
        statusLower === 'succeeded' ||
        statusLower === 'success' ||
        statusLower === 'completed' ||
        statusLower === 'done' ||
        statusLower === 'finished';
      const isFailure =
        statusLower === 'failed' ||
        statusLower === 'failure' ||
        statusLower === 'error' ||
        statusLower === 'cancelled' ||
        statusLower === 'canceled';

      if (isSuccess && outputUrl) return String(outputUrl);
      if (isFailure) {
        const failReason =
          t?.fail_reason ?? t?.failReason ?? t?.error ?? t?.data?.fail_reason ?? t?.data?.error ?? '任务失败';
        throw new Error(formatErrorForUser(failReason));
      }

      await new Promise((r) => setTimeout(r, intervalMs));
    }
    throw new Error('生成超时（轮询过多）');
  }

  async function runImageGenerationAndGetUrl(
    prompt: string,
    size: string,
    referenceImages?: string[]
  ): Promise<string> {
    const payload: Record<string, unknown> = {
      prompt,
      response_format: 'url',
      size,
    };
    if (referenceImages && referenceImages.length > 0) {
      payload.image =
        referenceImages.length === 1 ? referenceImages[0] : referenceImages;
    } else {
      payload.model = 'doubao-seedream-3-0-t2i-250415';
    }
    const resp = await generateImage(payload as any);
    if (!resp.success) throw new Error(formatErrorForUser(resp.error) || '图片生成失败');

    const data: any = resp.data;
    const url =
      data?.data?.[0]?.url ||
      data?.output ||
      data?.url;
    if (!url) throw new Error('图片生成成功但未返回图片 URL');
    return String(url);
  }

  async function runSkill(skill: SkillKey, userTextRaw: string, opts?: RunSkillOptions) {
    if (!activeSessionId) return;
    const rawTrim = userTextRaw.trim();
    if (!rawTrim) return;

    const parsed = parseUserMessageWithAttachments(rawTrim);
    /** 调 API 的正文：新消息用输入框原文；重新生成时从落库全文里去掉「参考附件」块，避免 base64 进 prompt */
    const userBodyForApi =
      parsed.refs.length > 0 && inputAttachments.length === 0 ? parsed.body.trim() : rawTrim;

    const refImagesForApi =
      inputAttachments.length > 0
        ? inputAttachments.filter((a) => a.kind === 'image').map((a) => a.apiRef)
        : parsed.refs.filter((r) => r.kind === 'image').map((r) => r.src);

    const refMediaUrlsForApi =
      inputAttachments.length > 0
        ? inputAttachments
            .map((a) => a.apiRef)
            .filter(
              (u) =>
                typeof u === 'string' &&
                (u.startsWith('data:image') ||
                  u.startsWith('data:video') ||
                  u.startsWith('http://') ||
                  u.startsWith('https://'))
            )
        : [
            ...parsed.refs.filter((r) => r.kind === 'image').map((r) => r.src),
            ...parsed.refs.filter((r) => r.kind === 'video').map((r) => r.src),
          ].filter(
            (u) =>
              typeof u === 'string' &&
              (u.startsWith('data:image') ||
                u.startsWith('data:video') ||
                u.startsWith('http://') ||
                u.startsWith('https://'))
          );

    const withReferences =
      inputAttachments.length > 0
        ? `${rawTrim}\n\n参考附件：\n${inputAttachments.map((a) => `- ${a.apiRef}`).join('\n')}`
        : rawTrim;

    const isMediaSkill = skill === 'image' || skill === 'video';
    /** 含附件时统一写入「参考附件」块；对话区由 UserBubbleText 解析为正文 + 缩略图，不渲染原始链接/base64 正文 */
    const userBubbleContent = withReferences;

    /** 本轮追加前的会话快照，用于大模型短时记忆（图/视频生成不走 chat completions） */
    const shortTermMemoryMessages = !isMediaSkill ? uiMessagesToMemoryPayload(uiMessages) : [];

    setIsBusy(true);
    const userUiId = uid();
    const assistantUiId = uid();

    // UI 先追加
    setUiMessages((prev) => [
      ...prev,
      { id: userUiId, role: 'user', kind: 'text', content: userBubbleContent },
      {
        id: assistantUiId,
        role: 'assistant',
        kind: skill === 'video' ? 'video' : skill === 'image' ? 'image' : 'text',
        isLoading: true,
        statusText: '准备中',
        progress: 0,
        content: skill === 'image' || skill === 'video' ? '正在生成…' : '',
        textVariant: skill === 'code' ? 'code' : undefined,
      },
    ]);

    if (isMediaSkill) {
      setInput('');
      clearInputAttachments();
    }

    try {
      // 落库用户消息须在同一 try 内：失败时走 catch/finally，避免 isBusy 永久为 true 导致无法再发送
      await addChatMessage(activeSessionId, { role: 'user', content: userBubbleContent });

      if (skill === 'image') {
        const imageGenPrompt = opts?.pptImage
          ? `${PPT_SLIDE_IMAGE_PROMPT_PREFIX}${userBodyForApi}${refImagesForApi.length ? '\n\n已附参考图，请结合参考图生成幻灯片配图。' : ''}`
          : refImagesForApi.length
            ? `${userBodyForApi}\n\n请结合所附参考图生成。`
            : userBodyForApi;
        const imageUrl = await runImageGenerationAndGetUrl(
          imageGenPrompt,
          mediaAspectToImageSize(mediaAspectKey),
          refImagesForApi.length ? refImagesForApi : undefined
        );

        setUiMessages((prev) =>
          prev.map((m) =>
            m.id === assistantUiId
              ? {
                  ...m,
                  isLoading: false,
                  progress: undefined,
                  statusText: undefined,
                  kind: 'image',
                  imageUrl,
                  videoUrl: undefined,
                  content: undefined,
                }
              : m
          )
        );

        await addChatMessage(activeSessionId, { role: 'assistant', content: imageUrl });
        await refreshSessions(activeSessionId);
        return;
      }

      if (skill === 'video') {
        const videoPrompt =
          refMediaUrlsForApi.length > 0
            ? `${userBodyForApi}\n\n请结合所附参考图/视频生成。`
            : userBodyForApi;
        const outputUrl = await runArkTaskAndGetOutputUrl(
          videoPrompt,
          {
            ratio: mediaAspectKey,
            resolution: '720p',
            duration: '5',
            cameraFixed: false,
            watermark: true,
          },
          (p, s) => {
            const detail = formatVideoTaskStatus(s);
            setUiMessages((prev) =>
              prev.map((m) =>
                m.id === assistantUiId
                  ? { ...m, progress: p, statusText: detail || m.statusText }
                  : m
              )
            );
          },
          refMediaUrlsForApi.length ? refMediaUrlsForApi : undefined
        );

        setUiMessages((prev) =>
          prev.map((m) =>
            m.id === assistantUiId
              ? {
                  ...m,
                  isLoading: false,
                  progress: undefined,
                  statusText: undefined,
                  kind: 'video',
                  videoUrl: outputUrl,
                  imageUrl: undefined,
                  content: undefined,
                }
              : m
          )
        );

        // 落库 assistant：带前缀，刷新会话后仍能按视频渲染（不仅依赖 .mp4 后缀）
        await addChatMessage(activeSessionId, { role: 'assistant', content: `${VIDEO_MSG_PREFIX}${outputUrl}` });
        await refreshSessions(activeSessionId);
        return;
      }

      const systemPrompt =
        skill === 'chat'
          ? (quickMode === 'think' ? activeAssistSystemPrompt.chat_think : activeAssistSystemPrompt.chat)
          : skill === 'translate'
            ? translateSystemPromptFor(translateTargetLang)
            : activeAssistSystemPrompt[skill];
      const answer = await streamChatCompletion({
        systemPrompt,
        /** 含参考附件时必须把完整气泡（含 docb64 文档正文）交给模型；sanitize 会将 docb64 展开为可读文本 */
        userText: sanitizeMemoryContent(userBubbleContent),
        memoryMessages: shortTermMemoryMessages,
        onContent: (_chunk, fullText) => {
          flushSync(() => {
            setUiMessages((prev) =>
              prev.map((m) =>
                m.id === assistantUiId
                  ? {
                      ...m,
                      isLoading: true,
                      content: fullText,
                      statusText: undefined,
                      progress: undefined,
                    }
                  : m
              )
            );
          });
        },
      });

      setUiMessages((prev) =>
        prev.map((m) =>
          m.id === assistantUiId
            ? {
                ...m,
                isLoading: false,
                content: answer,
                statusText: undefined,
                progress: undefined,
                textVariant: skill === 'code' ? 'code' : m.textVariant,
              }
            : m
        )
      );

      await addChatMessage(activeSessionId, { role: 'assistant', content: answer });
      await refreshSessions(activeSessionId);
    } catch (e) {
      const message = formatErrorForUser(e);
      setUiMessages((prev) =>
        prev.map((m) => (m.id === assistantUiId ? { ...m, isLoading: false, error: message, content: `生成失败：${message}`, statusText: undefined, progress: undefined } : m))
      );
      await addChatMessage(activeSessionId, { role: 'assistant', content: `生成失败：${message}` });
      await refreshSessions(activeSessionId);
    } finally {
      setIsBusy(false);
      setInput('');
      clearInputAttachments();
    }
  }

  /** 历史列表：不展示「空且标题仍为默认新对话」的会话，除非当前正选中（避免历史里堆满「新对话」） */
  const sortedSessions = useMemo(() => {
    const list = sessions.filter((s) => {
      const t = (s.title || '').trim();
      const isDefaultTitle = t === '' || t === '新对话';
      const empty = !s.messages || s.messages.length === 0;
      if (isDefaultTitle && empty) return s.id === activeSessionId;
      return true;
    });
    list.sort((a, b) => {
      if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
      return b.updatedAt - a.updatedAt;
    });
    return list;
  }, [sessions, activeSessionId]);

  const handleSend = async () => {
    if (isBusy) return;
    if (inputMode === 'ppt') {
      await runSkill('image', input, { pptImage: true });
      return;
    }

    /** 仅当已选「图像 / 视频」快捷键时走固定模式；否则按正文推断是否生成图/视频/PPT 配图 */
    const inferred =
      inputMode !== 'image' && inputMode !== 'video' ? inferMediaIntentFromUserText(input) : null;
    if (inferred) {
      await runSkill(inferred.skill, input, inferred.pptImage ? { pptImage: true } : undefined);
      return;
    }

    const skill: SkillKey =
      inputMode === 'write'
        ? 'write'
        : inputMode === 'code'
          ? 'code'
          : inputMode === 'translate'
            ? 'translate'
            : inputMode === 'analysis'
              ? 'analysis'
              : inputMode === 'image'
                ? 'image'
                : inputMode === 'video'
                  ? 'video'
                  : 'chat';
    await runSkill(skill, input);
  };

  const stopSpeech = () => {
    try {
      window.speechSynthesis?.cancel();
    } catch {
      // ignore
    }
  };

  const speakText = (text: string) => {
    stopSpeech();
    const clean = String(text || '').trim();
    if (!clean) return;
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const u = new SpeechSynthesisUtterance(clean);
    u.lang = 'zh-CN';
    speechRef.current = u;
    window.speechSynthesis.speak(u);
  };

  const copyToClipboard = async (text: string) => {
    const clean = String(text || '');
    try {
      await navigator.clipboard.writeText(clean);
    } catch {
      // fallback
      const ta = document.createElement('textarea');
      ta.value = clean;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      try {
        document.execCommand('copy');
      } finally {
        document.body.removeChild(ta);
      }
    }
  };

  const likeOptions = ['内容准确', '易于理解', '内容完善', '其他'] as const;
  const dislikeOptions = ['有害/不安全', '信息虚假', '没有帮助', '隐私相关', '其他'] as const;

  const toggleFeedbackReason = (messageId: string, reason: string) => {
    setFeedbackSelected((prev) => {
      const current = prev[messageId] || [];
      const next = current.includes(reason) ? current.filter((x) => x !== reason) : [...current, reason];
      return { ...prev, [messageId]: next };
    });
  };

  const openFeedback = (messageId: string, type: 'like' | 'dislike') => {
    setMoreOpenForId(null);
    setFeedbackOpenForId(messageId);
    setFeedbackType(type);
  };

  const closeFeedback = () => {
    setFeedbackOpenForId(null);
    setFeedbackType(null);
  };

  const submitFeedback = () => {
    // 目前仅做前端展示与收集（不落库、不上报）
    closeFeedback();
  };

  const regenerateForAssistantMessage = async (assistantMessageId: string) => {
    if (isBusy) return;
    const idx = uiMessages.findIndex((m) => m.id === assistantMessageId);
    if (idx < 0) return;
    let lastUserText = '';
    for (let i = idx - 1; i >= 0; i--) {
      const m = uiMessages[i];
      if (m.role === 'user' && m.content) {
        lastUserText = m.content;
        break;
      }
    }
    if (!lastUserText.trim()) return;
    await runSkill('chat', lastUserText);
  };

  const regenerateForAssistantMessageByKind = async (assistantMessageId: string, kind: ChatMessageKind) => {
    if (isBusy) return;
    const idx = uiMessages.findIndex((m) => m.id === assistantMessageId);
    if (idx < 0) return;
    let lastUserText = '';
    for (let i = idx - 1; i >= 0; i--) {
      const m = uiMessages[i];
      if (m.role === 'user' && m.content) {
        lastUserText = m.content;
        break;
      }
    }
    if (!lastUserText.trim()) return;
    if (kind === 'image') {
      await runSkill('image', lastUserText);
      return;
    }
    if (kind === 'video') {
      await runSkill('video', lastUserText);
      return;
    }
    await runSkill('chat', lastUserText);
  };

  const handleQuickQuestion = async (q: string) => {
    if (isBusy) return;
    const text = (q || '').trim();
    if (!text) return;
    setInput(text);
    await runSkill('chat', text);
  };

  const handleToolbarSkill = async (skill: SkillKey) => {
    if (isBusy) return;
    const text = input.trim();
    if (!text) return;
    await runSkill(skill, text);
  };

  const openReferencePicker = () => {
    setIsRefOpen(true);
    setRefLinkDraft('');
  };

  const addReferenceLink = () => {
    const link = refLinkDraft.trim();
    if (!link) return;
    const kind = guessMediaKindFromUrl(link);
    setInputAttachments((prev) => {
      if (prev.some((p) => p.apiRef === link)) return prev;
      return [...prev, { id: uid(), kind, previewUrl: link, apiRef: link }];
    });
    setRefLinkDraft('');
  };

  const handleFilesPicked = async (files: FileList | null) => {
    if (!files?.length) return;
    const newItems: ChatInputAttachment[] = [];
    const pickErrors: string[] = [];
    try {
      for (const file of Array.from(files)) {
        const id = uid();
        if (file.type.startsWith('image/')) {
          const dataUrl = await readFileAsDataUrl(file);
          newItems.push({ id, kind: 'image', previewUrl: dataUrl, apiRef: dataUrl });
        } else if (file.type.startsWith('video/')) {
          const previewUrl = URL.createObjectURL(file);
          const apiRef =
            file.size <= MAX_VIDEO_EMBED_BYTES
              ? await readFileAsDataUrl(file)
              : `[本地视频:${file.name}]`;
          newItems.push({ id, kind: 'video', previewUrl, apiRef });
        } else if (isLegacyDoc(file)) {
          pickErrors.push(`${file.name}：暂不支持 Word 97–2003（.doc），请改用 .docx 或 .txt`);
        } else if (isTxtFile(file)) {
          try {
            let text = await readFileAsTextUtf8(file);
            if (!text.trim()) {
              pickErrors.push(`${file.name}：文件为空`);
            } else {
              if (text.length > MAX_DOC_TEXT_CHARS) {
                text = `${text.slice(0, MAX_DOC_TEXT_CHARS)}\n\n…（已截断，单文件最多 ${MAX_DOC_TEXT_CHARS} 字）`;
              }
              const apiRef = serializeDocAttachmentRef(file.name, text);
              newItems.push({
                id,
                kind: 'document',
                fileName: file.name,
                previewUrl: '',
                apiRef,
                textPreview: makeDocumentTextPreview(text),
              });
            }
          } catch {
            pickErrors.push(`${file.name}：无法读取文本`);
          }
        } else if (isDocxFile(file)) {
          try {
            let text = await extractPlainTextFromDocx(file);
            if (!text.trim()) pickErrors.push(`${file.name}：未能从 docx 中提取到文本`);
            else {
              if (text.length > MAX_DOC_TEXT_CHARS) {
                text = `${text.slice(0, MAX_DOC_TEXT_CHARS)}\n\n…（已截断，单文件最多 ${MAX_DOC_TEXT_CHARS} 字）`;
              }
              const apiRef = serializeDocAttachmentRef(file.name, text);
              newItems.push({
                id,
                kind: 'document',
                fileName: file.name,
                previewUrl: '',
                apiRef,
                textPreview: makeDocumentTextPreview(text),
              });
            }
          } catch (e) {
            pickErrors.push(
              `${file.name}：${e instanceof Error ? e.message : 'docx 解析失败'}`
            );
          }
        } else {
          pickErrors.push(`${file.name}：不支持的格式（请使用图片、视频、.txt 或 .docx）`);
        }
      }
      if (newItems.length) {
        setInputAttachments((prev) => [...prev, ...newItems]);
      }
      if (pickErrors.length) {
        alert(pickErrors.join('\n'));
      }
    } catch {
      alert('部分文件读取失败，请重试');
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <section
      className="w-full h-full min-h-0 flex relative flex-1"
      style={{ backgroundColor: isDark ? '#000' : '#fff' }}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*,.txt,.doc,.docx,text/plain,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        multiple
        className="hidden"
        onChange={(e) => void handleFilesPicked(e.target.files)}
      />
      {/* 左侧：会话列表（参考截图样式） */}
      <aside
        className="w-[260px] h-full border-r flex flex-col relative z-10 pt-3"
        style={{
          borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
          background: isDark ? '#000' : '#f3f4f6',
          backdropFilter: 'none',
        }}
      >
        {/* 与 App 顶栏 liquid-tabs（fixed top-3）同一垂直起点；标题行高度与 Tab 按钮 min-h-[36px] 对齐 */}
        <div className="px-3 pb-2">
          <div className="flex items-center gap-2 px-1 min-h-9">
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center"
              style={{
                background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.9)',
                border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)'}`,
              }}
              aria-hidden
            >
              <Bot className="w-4 h-4" style={{ opacity: 0.75 }} />
            </div>
            <div className="text-[13px] font-semibold" style={{ color: isDark ? 'rgba(255,255,255,0.88)' : '#0f172a' }}>
              聊天助手
            </div>
          </div>
          <button
            className="w-full h-10 rounded-xl flex items-center justify-between px-3 transition-colors"
            onClick={() => void handleNewSession()}
            disabled={isBusy}
            style={{
              background: isDark ? 'rgba(59,130,246,0.16)' : 'rgba(239,246,255,0.95)',
              border: `1px solid ${isDark ? 'rgba(59,130,246,0.22)' : 'rgba(59,130,246,0.30)'}`,
              color: isDark ? 'rgba(255,255,255,0.92)' : '#2563eb',
            }}
            title="新对话"
          >
            <div className="flex items-center gap-2">
              <PenSquare className="w-3.5 h-3.5" />
              <span className="text-[13px] font-semibold">新对话</span>
            </div>
            <span
              className="text-[10px] px-2 py-0.5 rounded-lg"
              style={{
                background: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(59,130,246,0.10)',
                color: isDark ? 'rgba(255,255,255,0.7)' : 'rgba(37,99,235,0.55)',
              }}
            >
              Ctrl K
            </span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar px-2 pb-3">
          <div className="px-2 pb-2 text-[13px] font-medium" style={{ color: isDark ? 'rgba(255,255,255,0.45)' : 'rgba(100,116,139,0.95)' }}>
            历史对话
          </div>

          {sortedSessions.map((s) => {
            const active = s.id === activeSessionId;
            return (
              <div
                key={s.id}
                className="group rounded-xl px-2.5 py-2 mb-1 cursor-pointer flex items-center gap-2"
                onClick={() => {
                  setActiveSessionId(s.id);
                  setUiMessages(sessionToUiMessages(s));
                }}
                style={{
                  background: active ? (isDark ? 'rgba(59,130,246,0.14)' : 'rgba(255,255,255,0.85)') : 'transparent',
                  border: `1px solid ${
                    active
                      ? isDark
                        ? 'rgba(59,130,246,0.25)'
                        : 'rgba(15,23,42,0.08)'
                      : 'transparent'
                  }`,
                }}
              >
                <div className="w-6 h-6 rounded-full flex items-center justify-center"
                  style={{
                    background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(241,245,249,0.95)',
                    border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(148,163,184,0.28)'}`,
                  }}
                  aria-hidden
                >
                  <MessageCircle className="w-3 h-3" style={{ opacity: 0.75 }} />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium truncate" style={{ color: isDark ? 'rgba(255,255,255,0.88)' : '#1f2937' }}>
                    {s.title || '新对话'}
                  </div>
                </div>

                <div
                  ref={sessionSidebarMenuId === s.id ? sessionSidebarMenuWrapRef : undefined}
                  className="group/menu relative flex shrink-0 items-center gap-0.5"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      void handleTogglePin(s);
                    }}
                    title={s.isPinned ? '取消置顶' : '置顶'}
                    aria-label={s.isPinned ? '取消置顶' : '置顶'}
                    style={{
                      background: 'transparent',
                      color: s.isPinned ? (isDark ? '#fbbf24' : '#94a3b8') : isDark ? 'rgba(255,255,255,0.40)' : 'rgba(148,163,184,0.75)',
                      opacity: s.isPinned ? 1 : 0.65,
                      transition: 'opacity 0.15s ease',
                    }}
                  >
                    <Pin className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 transition-all ${
                      sessionSidebarMenuId === s.id
                        ? 'opacity-100'
                        : 'opacity-0 pointer-events-none group-hover/menu:opacity-100 group-hover/menu:pointer-events-auto'
                    }`}
                    title="更多"
                    aria-label="更多操作"
                    aria-expanded={sessionSidebarMenuId === s.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSessionSidebarMenuId((id) => (id === s.id ? null : s.id));
                    }}
                  >
                    <MoreHorizontal className="w-3.5 h-3.5" style={{ opacity: 0.9 }} />
                  </button>

                  {sessionSidebarMenuId === s.id && (
                    <div
                      role="menu"
                      className="absolute right-0 top-full z-[120] mt-1 min-w-[148px] rounded-xl py-1 shadow-lg"
                      style={{
                        background: isDark ? 'rgba(24,24,32,0.98)' : '#ffffff',
                        border: `1px solid ${isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)'}`,
                        boxShadow: isDark ? '0 8px 24px rgba(0,0,0,0.45)' : '0 4px 12px rgba(0,0,0,0.1)',
                      }}
                    >
                      <button
                        type="button"
                        role="menuitem"
                        className={`w-full px-3 py-2 text-left text-[13px] transition ${
                          isDark ? 'hover:bg-white/10' : 'hover:bg-black/5'
                        }`}
                        style={{ color: isDark ? 'rgba(255,255,255,0.9)' : '#0f172a' }}
                        onClick={() => {
                          setSessionSidebarMenuId(null);
                          void handleTogglePin(s);
                        }}
                      >
                        {s.isPinned ? '取消置顶' : '置顶'}
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        className={`w-full px-3 py-2 text-left text-[13px] transition ${
                          isDark ? 'hover:bg-white/10' : 'hover:bg-black/5'
                        }`}
                        style={{ color: isDark ? 'rgba(255,255,255,0.9)' : '#0f172a' }}
                        onClick={() => {
                          setSessionSidebarMenuId(null);
                          setRenameSessionModal({ id: s.id, draft: s.title || '' });
                        }}
                      >
                        重命名
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        className={`w-full px-3 py-2 text-left text-[13px] transition ${
                          isDark ? 'hover:bg-red-500/15' : 'hover:bg-red-500/10'
                        }`}
                        style={{ color: '#ef4444' }}
                        disabled={isBusy}
                        onClick={() => {
                          setSessionSidebarMenuId(null);
                          if (!window.confirm('确定删除该对话？')) return;
                          void handleDeleteSession(s);
                        }}
                      >
                        删除
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="px-3 pb-4">
          <button
            className="liquid-btn liquid-btn-ghost w-full"
            onClick={() => props.onExitToDesktop?.()}
            disabled={!props.onExitToDesktop}
            style={{
              borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)',
              color: isDark ? 'rgba(255,255,255,0.85)' : '#0f172a',
            }}
          >
            返回桌面
          </button>
        </div>
      </aside>

      {/* 右侧：对话 + 输入；gap 保证对话区与输入框之间有固定间隔（勿再用 -mt-* 抵消） */}
      <main className="flex-1 flex flex-col gap-4 relative z-10 min-h-0">
        {/* 顶栏 fixed top-3，条带约 54px（12px + 内边距 + 36px 按钮区）；仅右侧留出避让 */}
        <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-2 pt-[54px] custom-scrollbar">
          {isEmptyState ? (
            <div className="h-full flex items-center justify-center">
              <div
                className="text-center text-3xl font-bold tracking-wide"
                style={{ color: isDark ? 'rgba(255,255,255,0.88)' : '#0f172a' }}
              >
                有什么我能帮你的吗？
              </div>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto space-y-2 pt-4">
              {uiMessages.map((m) => {
                const isUser = m.role === 'user';
                const isAssistantText = !isUser && m.kind === 'text';
                const iconRowHover = isDark ? 'hover:bg-white/10' : 'hover:bg-black/5';

                return (
                  <div key={m.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className={`max-w-[80%] ${isAssistantText ? '' : 'rounded-2xl'} ${isAssistantText ? 'px-0 py-0' : 'px-3 py-2'}`}
                      style={{
                        // 亮色：用户/助手卡片浅灰底；暗色：用户黑底，助手生成的图/视频卡片也黑底（不要浅灰白边）
                        background: isAssistantText
                          ? 'transparent'
                          : isUser
                            ? isDark
                              ? '#000000'
                              : '#f3f4f6'
                            : isDark
                              ? '#000000'
                              : '#f3f4f6',
                        border: 'none',
                        color: isAssistantText
                          ? isDark
                            ? 'rgba(255,255,255,0.92)'
                            : '#0f172a'
                          : isUser
                            ? isDark
                              ? 'rgba(255,255,255,0.92)'
                              : '#0f172a'
                            : isDark
                              ? 'rgba(255,255,255,0.92)'
                              : '#0f172a',
                      }}
                    >
                      {m.kind === 'text' && (
                        <>
                          {m.error ? (
                            <div className="text-sm text-red-500 whitespace-pre-wrap break-words">{m.error}</div>
                          ) : m.isLoading && !(m.role === 'assistant' && m.content?.trim()) ? (
                            <div
                              className="flex items-center gap-3 py-0.5"
                              role="status"
                              aria-live="polite"
                              aria-label={m.statusText ? `${m.statusText}中` : '助手正在生成回复'}
                              style={{
                                color: isAssistantText
                                  ? isDark
                                    ? 'rgba(255,255,255,0.72)'
                                    : 'rgba(15,23,42,0.65)'
                                  : isUser && isDark
                                    ? 'rgba(255,255,255,0.85)'
                                    : '#0f172a',
                              }}
                            >
                              <div
                                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl animate-pulse"
                                style={{
                                  background: isDark ? 'rgba(255,255,255,0.09)' : 'rgba(15,23,42,0.07)',
                                  border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(15,23,42,0.08)'}`,
                                }}
                                aria-hidden
                              >
                                <Bot className="w-5 h-5 opacity-90" strokeWidth={2} />
                              </div>
                              <span className="text-sm">
                                {m.statusText ? `${m.statusText}…` : '正在等待回复…'}
                              </span>
                            </div>
                          ) : (
                            <>
                              {m.content ? (
                                isUser ? (
                                  <UserBubbleText content={m.content} isDark={isDark} />
                                ) : m.textVariant === 'code' ? (
                                  <div className="text-sm leading-6 w-full min-w-0 inline-flex flex-wrap items-end gap-0">
                                    <div className="min-w-0 flex-1">
                                      {renderMarkdownCodeMode(m.content, isDark, {
                                        onCopyBlock: (t) => void copyToClipboard(t),
                                      })}
                                    </div>
                                    {m.isLoading && m.content?.trim() ? (
                                      <span
                                        className="inline-block w-2 h-4 mb-0.5 flex-shrink-0 rounded-sm bg-current opacity-45 animate-pulse"
                                        aria-hidden
                                      />
                                    ) : null}
                                  </div>
                                ) : (
                                  <div className="text-sm leading-6 inline-flex flex-wrap items-end gap-0 max-w-full">
                                    <div className="min-w-0 flex-1">{renderMarkdownLite(m.content || '')}</div>
                                    {m.isLoading && m.content?.trim() ? (
                                      <span
                                        className="inline-block w-0.5 h-4 mb-1 flex-shrink-0 bg-current opacity-60 animate-pulse"
                                        aria-hidden
                                      />
                                    ) : null}
                                  </div>
                                )
                              ) : null}
                              {!isUser && !!m.content && !m.isLoading && m.textVariant === 'code' && (
                                <div
                                  className="mt-2 flex items-center gap-2 flex-wrap"
                                  style={{ color: isDark ? 'rgba(255,255,255,0.55)' : 'rgba(15,23,42,0.55)' }}
                                >
                                  <button
                                    className={`w-7 h-7 rounded-lg flex items-center justify-center ${iconRowHover}`}
                                    type="button"
                                    title="复制全文"
                                    aria-label="复制全文"
                                    onClick={() => void copyToClipboard(m.content || '')}
                                  >
                                    <Copy className="w-4 h-4" />
                                  </button>
                                  <button
                                    className={`w-7 h-7 rounded-lg flex items-center justify-center ${iconRowHover}`}
                                    type="button"
                                    title="转发"
                                    aria-label="转发"
                                    onClick={() => {}}
                                  >
                                    <Share2 className="w-4 h-4" />
                                  </button>
                                  <button
                                    className={`w-7 h-7 rounded-lg flex items-center justify-center ${iconRowHover}`}
                                    type="button"
                                    title="全屏展示"
                                    aria-label="全屏展示"
                                    onClick={() => setCodeFullscreen({ content: m.content || '' })}
                                  >
                                    <Maximize2 className="w-4 h-4" />
                                  </button>
                                  <button
                                    className={`w-7 h-7 rounded-lg flex items-center justify-center ${iconRowHover}`}
                                    type="button"
                                    title="重新生成"
                                    aria-label="重新生成"
                                    onClick={() => void regenerateForAssistantMessage(m.id)}
                                    disabled={isBusy}
                                  >
                                    <RotateCcw className="w-4 h-4" />
                                  </button>
                                  <div className="relative">
                                    <button
                                      className={`w-7 h-7 rounded-lg flex items-center justify-center ${iconRowHover}`}
                                      type="button"
                                      title="更多"
                                      aria-label="更多"
                                      onClick={() => setMoreOpenForId((prev) => (prev === m.id ? null : m.id))}
                                    >
                                      <MoreHorizontal className="w-4 h-4" />
                                    </button>
                                    {moreOpenForId === m.id && (
                                      <button
                                        className={`absolute -right-9 top-0 w-7 h-7 rounded-lg flex items-center justify-center ${iconRowHover}`}
                                        type="button"
                                        title="删除"
                                        aria-label="删除"
                                        style={{ color: '#ef4444' }}
                                        onClick={() => {
                                          const ok = window.confirm('是否确定要删除？');
                                          if (!ok) return;
                                          setMoreOpenForId(null);
                                          setUiMessages((prev) => prev.filter((x) => x.id !== m.id));
                                        }}
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </button>
                                    )}
                                  </div>
                                </div>
                              )}
                              {!isUser && !!m.content && !m.isLoading && m.textVariant !== 'code' && (
                                <div className="mt-2 flex items-center gap-2" style={{ color: isDark ? 'rgba(255,255,255,0.55)' : 'rgba(15,23,42,0.55)' }}>
                                  <button
                                    className={`w-7 h-7 rounded-lg flex items-center justify-center ${iconRowHover}`}
                                    type="button"
                                    title="复制"
                                    aria-label="复制"
                                    onClick={() => void copyToClipboard(m.content || '')}
                                  >
                                    <Copy className="w-4 h-4" />
                                  </button>
                                  <button
                                    className={`w-7 h-7 rounded-lg flex items-center justify-center ${iconRowHover}`}
                                    type="button"
                                    title="重新生成"
                                    aria-label="重新生成"
                                    onClick={() => void regenerateForAssistantMessage(m.id)}
                                    disabled={isBusy}
                                  >
                                    <RotateCcw className="w-4 h-4" />
                                  </button>
                                  <button
                                    className={`w-7 h-7 rounded-lg flex items-center justify-center ${iconRowHover}`}
                                    type="button"
                                    title="朗读"
                                    aria-label="朗读"
                                    onClick={() => speakText(m.content || '')}
                                  >
                                    <Volume2 className="w-4 h-4" />
                                  </button>
                                  <button
                                    className={`w-7 h-7 rounded-lg flex items-center justify-center ${iconRowHover}`}
                                    type="button"
                                    title="喜欢"
                                    aria-label="喜欢"
                                    onClick={() => openFeedback(m.id, 'like')}
                                  >
                                    <ThumbsUp className="w-4 h-4" />
                                  </button>
                                  <button
                                    className={`w-7 h-7 rounded-lg flex items-center justify-center ${iconRowHover}`}
                                    type="button"
                                    title="不喜欢"
                                    aria-label="不喜欢"
                                    onClick={() => openFeedback(m.id, 'dislike')}
                                  >
                                    <ThumbsDown className="w-4 h-4" />
                                  </button>
                                  <button
                                    className={`w-7 h-7 rounded-lg flex items-center justify-center ${iconRowHover}`}
                                    type="button"
                                    title="分享"
                                    aria-label="分享"
                                    onClick={() => {}}
                                  >
                                    <Share2 className="w-4 h-4" />
                                  </button>
                                  <div className="relative">
                                    <button
                                      className={`w-7 h-7 rounded-lg flex items-center justify-center ${iconRowHover}`}
                                      type="button"
                                      title="更多"
                                      aria-label="更多"
                                      onClick={() => setMoreOpenForId((prev) => (prev === m.id ? null : m.id))}
                                    >
                                      <MoreHorizontal className="w-4 h-4" />
                                    </button>
                                    {moreOpenForId === m.id && (
                                      <button
                                        className={`absolute -right-9 top-0 w-7 h-7 rounded-lg flex items-center justify-center ${iconRowHover}`}
                                        type="button"
                                        title="删除"
                                        aria-label="删除"
                                        style={{ color: '#ef4444' }}
                                        onClick={() => {
                                          const ok = window.confirm('是否确定要删除？');
                                          if (!ok) return;
                                          setMoreOpenForId(null);
                                          setUiMessages((prev) => prev.filter((x) => x.id !== m.id));
                                        }}
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </button>
                                    )}
                                  </div>
                                </div>
                              )}

                              {/* AI 快速追问（由模型根据上文生成，加载中显示占位） */}
                              {!isUser && !!m.content && !m.isLoading && m.textVariant !== 'code' && (
                                <div className="mt-3 flex flex-col gap-2">
                                  {followUpLoadingByMsgId[m.id] ? (
                                    <>
                                      <div
                                        className="h-9 max-w-md w-4/5 rounded-2xl animate-pulse"
                                        style={{
                                          background: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)',
                                        }}
                                        aria-hidden
                                      />
                                      <div
                                        className="h-9 max-w-sm w-3/5 rounded-2xl animate-pulse"
                                        style={{
                                          background: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)',
                                        }}
                                        aria-hidden
                                      />
                                    </>
                                  ) : (
                                    (followUpQuestionsByMsgId[m.id] ?? fallbackQuickQuestionsFor(m.content)).slice(0, 2).map((q, i) => (
                                      <button
                                        key={`${m.id}-fq-${i}`}
                                        type="button"
                                        disabled={isBusy}
                                        onClick={() => void handleQuickQuestion(q)}
                                        className="w-fit max-w-full px-4 py-2 rounded-2xl flex items-center gap-2 text-sm transition"
                                        style={{
                                          background: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.04)',
                                          color: isDark ? 'rgba(255,255,255,0.88)' : '#0f172a',
                                          border: 'none',
                                          opacity: isBusy ? 0.6 : 1,
                                        }}
                                      >
                                        <span className="truncate">{q}</span>
                                        <ArrowRight className="w-4 h-4 flex-shrink-0" style={{ opacity: 0.8 }} />
                                      </button>
                                    ))
                                  )}
                                </div>
                              )}
                            </>
                          )}
                        </>
                      )}

                      {m.kind === 'image' && (
                        <>
                          {m.isLoading ? (
                            <MediaGeneratingPlaceholder
                              kind="image"
                              isDark={isDark}
                              aspect={mediaAspectKey}
                              label={m.content?.trim() || '正在根据描述生成图片，请稍候…'}
                            />
                          ) : m.imageUrl ? (
                            <>
                              <img
                                src={m.imageUrl}
                                alt="generated"
                                className="max-w-full rounded-xl border"
                                style={{
                                  backgroundColor: isDark ? '#000000' : undefined,
                                  borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.06)',
                                }}
                              />
                              <div className="mt-2 flex items-center gap-2" style={{ color: isDark ? 'rgba(255,255,255,0.55)' : 'rgba(15,23,42,0.55)' }}>
                                <button
                                  className={`w-7 h-7 rounded-lg flex items-center justify-center ${iconRowHover}`}
                                  type="button"
                                  title="复制"
                                  aria-label="复制"
                                  onClick={() => void copyToClipboard(m.imageUrl || '')}
                                >
                                  <Copy className="w-4 h-4" />
                                </button>
                                <button
                                  className={`w-7 h-7 rounded-lg flex items-center justify-center ${iconRowHover}`}
                                  type="button"
                                  title="重新生成"
                                  aria-label="重新生成"
                                  onClick={() => void regenerateForAssistantMessageByKind(m.id, 'image')}
                                  disabled={isBusy}
                                >
                                  <RotateCcw className="w-4 h-4" />
                                </button>
                                <button
                                  className={`w-7 h-7 rounded-lg flex items-center justify-center ${iconRowHover}`}
                                  type="button"
                                  title="朗读"
                                  aria-label="朗读"
                                  onClick={() => speakText(m.imageUrl || '')}
                                >
                                  <Volume2 className="w-4 h-4" />
                                </button>
                                <button
                                  className={`w-7 h-7 rounded-lg flex items-center justify-center ${iconRowHover}`}
                                  type="button"
                                  title="喜欢"
                                  aria-label="喜欢"
                                  onClick={() => openFeedback(m.id, 'like')}
                                >
                                  <ThumbsUp className="w-4 h-4" />
                                </button>
                                <button
                                  className={`w-7 h-7 rounded-lg flex items-center justify-center ${iconRowHover}`}
                                  type="button"
                                  title="不喜欢"
                                  aria-label="不喜欢"
                                  onClick={() => openFeedback(m.id, 'dislike')}
                                >
                                  <ThumbsDown className="w-4 h-4" />
                                </button>
                                <button
                                  className={`w-7 h-7 rounded-lg flex items-center justify-center ${iconRowHover}`}
                                  type="button"
                                  title="分享"
                                  aria-label="分享"
                                  onClick={() => {}}
                                >
                                  <Share2 className="w-4 h-4" />
                                </button>
                                <div className="relative">
                                  <button
                                    className={`w-7 h-7 rounded-lg flex items-center justify-center ${iconRowHover}`}
                                    type="button"
                                    title="更多"
                                    aria-label="更多"
                                    onClick={() => setMoreOpenForId((prev) => (prev === m.id ? null : m.id))}
                                  >
                                    <MoreHorizontal className="w-4 h-4" />
                                  </button>
                                  {moreOpenForId === m.id && (
                                    <button
                                      className={`absolute -right-9 top-0 w-7 h-7 rounded-lg flex items-center justify-center ${iconRowHover}`}
                                      type="button"
                                      title="删除"
                                      aria-label="删除"
                                      style={{ color: '#ef4444' }}
                                      onClick={() => {
                                        const ok = window.confirm('是否确定要删除？');
                                        if (!ok) return;
                                        setMoreOpenForId(null);
                                        setUiMessages((prev) => prev.filter((x) => x.id !== m.id));
                                      }}
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  )}
                                </div>
                              </div>
                            </>
                          ) : (
                            <div className="text-sm text-red-500">生成失败</div>
                          )}
                        </>
                      )}

                      {m.kind === 'video' && (
                        <>
                          {m.isLoading ? (
                            <MediaGeneratingPlaceholder
                              kind="video"
                              isDark={isDark}
                              aspect={mediaAspectKey}
                              label={m.content?.trim() || '正在根据描述生成视频，请稍候…'}
                              statusDetail={m.statusText}
                              progress={m.progress}
                            />
                          ) : m.videoUrl ? (
                            <>
                              <ChatVideoPlayer src={m.videoUrl} isDark={isDark} />
                              <div className="mt-2 flex items-center gap-2" style={{ color: isDark ? 'rgba(255,255,255,0.55)' : 'rgba(15,23,42,0.55)' }}>
                                <button
                                  className={`w-7 h-7 rounded-lg flex items-center justify-center ${iconRowHover}`}
                                  type="button"
                                  title="复制"
                                  aria-label="复制"
                                  onClick={() => void copyToClipboard(m.videoUrl || '')}
                                >
                                  <Copy className="w-4 h-4" />
                                </button>
                                <button
                                  className={`w-7 h-7 rounded-lg flex items-center justify-center ${iconRowHover}`}
                                  type="button"
                                  title="重新生成"
                                  aria-label="重新生成"
                                  onClick={() => void regenerateForAssistantMessageByKind(m.id, 'video')}
                                  disabled={isBusy}
                                >
                                  <RotateCcw className="w-4 h-4" />
                                </button>
                                <button
                                  className={`w-7 h-7 rounded-lg flex items-center justify-center ${iconRowHover}`}
                                  type="button"
                                  title="朗读"
                                  aria-label="朗读"
                                  onClick={() => speakText(m.videoUrl || '')}
                                >
                                  <Volume2 className="w-4 h-4" />
                                </button>
                                <button
                                  className={`w-7 h-7 rounded-lg flex items-center justify-center ${iconRowHover}`}
                                  type="button"
                                  title="喜欢"
                                  aria-label="喜欢"
                                  onClick={() => openFeedback(m.id, 'like')}
                                >
                                  <ThumbsUp className="w-4 h-4" />
                                </button>
                                <button
                                  className={`w-7 h-7 rounded-lg flex items-center justify-center ${iconRowHover}`}
                                  type="button"
                                  title="不喜欢"
                                  aria-label="不喜欢"
                                  onClick={() => openFeedback(m.id, 'dislike')}
                                >
                                  <ThumbsDown className="w-4 h-4" />
                                </button>
                                <button
                                  className={`w-7 h-7 rounded-lg flex items-center justify-center ${iconRowHover}`}
                                  type="button"
                                  title="分享"
                                  aria-label="分享"
                                  onClick={() => {}}
                                >
                                  <Share2 className="w-4 h-4" />
                                </button>
                                <div className="relative">
                                  <button
                                    className={`w-7 h-7 rounded-lg flex items-center justify-center ${iconRowHover}`}
                                    type="button"
                                    title="更多"
                                    aria-label="更多"
                                    onClick={() => setMoreOpenForId((prev) => (prev === m.id ? null : m.id))}
                                  >
                                    <MoreHorizontal className="w-4 h-4" />
                                  </button>
                                  {moreOpenForId === m.id && (
                                    <button
                                      className={`absolute -right-9 top-0 w-7 h-7 rounded-lg flex items-center justify-center ${iconRowHover}`}
                                      type="button"
                                      title="删除"
                                      aria-label="删除"
                                      style={{ color: '#ef4444' }}
                                      onClick={() => {
                                        const ok = window.confirm('是否确定要删除？');
                                        if (!ok) return;
                                        setMoreOpenForId(null);
                                        setUiMessages((prev) => prev.filter((x) => x.id !== m.id));
                                      }}
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  )}
                                </div>
                              </div>
                            </>
                          ) : (
                            <div className="text-sm text-red-500">生成失败</div>
                          )}
                        </>
                      )}

                      {/* 喜欢/不喜欢反馈面板：文本 / 图像 / 视频助手消息共用 */}
                      {!isUser && feedbackOpenForId === m.id && feedbackType && (
                        <div
                          className="mt-2 w-full max-w-[720px] rounded-2xl px-3.5 py-2.5"
                          style={{
                            background: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.72)',
                            border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.10)'}`,
                          }}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="text-[15px] font-medium" style={{ color: isDark ? 'rgba(255,255,255,0.92)' : '#0f172a' }}>
                              {feedbackType === 'like' ? '你觉得什么让你满意？' : '你觉得什么让你不满意？'}
                            </div>
                            <button
                              type="button"
                              className={`w-7 h-7 rounded-lg flex items-center justify-center ${iconRowHover}`}
                              title="关闭"
                              onClick={closeFeedback}
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>

                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {(feedbackType === 'like' ? likeOptions : dislikeOptions).map((opt) => {
                              const selected = (feedbackSelected[m.id] || []).includes(opt);
                              return (
                                <button
                                  key={opt}
                                  type="button"
                                  onClick={() => toggleFeedbackReason(m.id, opt)}
                                  className="px-3 py-1 rounded-xl text-xs transition"
                                  style={{
                                    background: selected
                                      ? isDark
                                        ? 'rgba(59,130,246,0.24)'
                                        : 'rgba(59,130,246,0.16)'
                                      : isDark
                                        ? 'rgba(255,255,255,0.05)'
                                        : 'rgba(255,255,255,0.95)',
                                    color: isDark ? 'rgba(255,255,255,0.88)' : '#475569',
                                    border: `1px solid ${selected ? (isDark ? 'rgba(59,130,246,0.36)' : 'rgba(59,130,246,0.28)') : (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.10)')}`,
                                  }}
                                >
                                  {opt}
                                </button>
                              );
                            })}
                          </div>

                          <div className="mt-2 flex justify-end">
                            <button
                              type="button"
                              className="px-5 py-1.5 rounded-xl text-sm font-medium"
                              onClick={submitFeedback}
                              style={{
                                background: isDark ? 'rgba(96,165,250,0.34)' : 'rgba(147,197,253,0.72)',
                                color: isDark ? 'rgba(255,255,255,0.92)' : '#ffffff',
                                border: 'none',
                              }}
                            >
                              提交
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              <div ref={endRef} />
            </div>
          )}
        </div>

        {/* 输入框：与上方消息区由 main 的 gap-4 分隔 */}
        <div className="px-5 pb-2 pt-0 shrink-0">
          <div
            className="max-w-[720px] mx-auto rounded-[32px]"
            style={{
              background: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.95)',
              border: isDark ? '1px solid rgba(96, 165, 250, 0.45)' : '1px solid rgba(147, 197, 253, 0.85)',
              boxShadow: isDark
                ? '0 10px 30px rgba(0,0,0,0.34), 0 0 18px rgba(59,130,246,0.20)'
                : '0 8px 20px rgba(15,23,42,0.08), 0 0 12px rgba(59,130,246,0.12)',
            }}
          >
            {inputAttachments.length > 0 && (
              <div className="px-4 pt-2 pb-1 flex gap-2 overflow-x-auto custom-scrollbar">
                {inputAttachments.map((a) => (
                  <div
                    key={a.id}
                    className="relative flex-shrink-0 w-14 h-14 rounded-xl"
                    style={{
                      border: `1px solid ${isDark ? 'rgba(255,255,255,0.12)' : 'rgba(15,23,42,0.10)'}`,
                      background: isDark ? 'rgba(0,0,0,0.25)' : 'rgba(0,0,0,0.04)',
                    }}
                  >
                    {/* 媒体单独一层并裁剪，避免遮挡右上角删除键 */}
                    <div className="absolute inset-0 rounded-[10px] overflow-hidden pointer-events-none">
                      {a.kind === 'image' ? (
                        <img src={a.previewUrl} alt="" className="w-full h-full object-cover" draggable={false} />
                      ) : a.kind === 'video' ? (
                        <video
                          src={a.previewUrl}
                          className="w-full h-full object-cover"
                          muted
                          playsInline
                          preload="metadata"
                        />
                      ) : (
                        <DocumentAttachmentThumbnail
                          fileName={a.fileName || '文档'}
                          textPreview={a.textPreview || ''}
                          isDark={isDark}
                        />
                      )}
                    </div>
                    <button
                      type="button"
                      className="absolute -top-1 -right-1 z-20 w-6 h-6 rounded-full flex items-center justify-center shadow-sm border border-white/20 cursor-pointer"
                      style={{ background: 'rgba(0,0,0,0.65)' }}
                      title="删除"
                      aria-label="删除该附件"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        removeInputAttachment(a.id);
                      }}
                    >
                      <X className="w-3.5 h-3.5 text-white" strokeWidth={2.5} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="px-4 pt-0">
              <div className="relative">
                {slashMenuVisible && slashMenuPos && (
                  <div
                    ref={slashMenuPanelRef}
                    className="fixed z-[305] w-[min(calc(100vw-2rem),320px)] max-h-[min(50vh,280px)] overflow-y-auto rounded-xl py-1.5 shadow-lg"
                    style={{
                      left: slashMenuPos.left,
                      top: slashMenuPos.top,
                      transform: 'translateY(-100%)',
                      background: isDark ? 'rgba(24,24,32,0.98)' : '#ffffff',
                      border: `1px solid ${isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)'}`,
                      boxShadow: isDark ? '0 8px 24px rgba(0,0,0,0.45)' : '0 4px 12px rgba(0,0,0,0.1)',
                    }}
                    role="listbox"
                    aria-label="快捷功能"
                  >
                    <div
                      className="px-3 pb-1.5 text-[11px] select-none"
                      style={{ color: isDark ? 'rgba(255,255,255,0.42)' : 'rgba(15,23,42,0.45)' }}
                    >
                      快捷功能
                    </div>
                    {slashRowsToShow.length === 0 ? (
                      <div className="px-3 py-2 text-[13px]" style={{ color: isDark ? 'rgba(255,255,255,0.55)' : 'rgba(15,23,42,0.55)' }}>
                        无匹配项，继续输入或按 Esc 取消
                      </div>
                    ) : (
                      slashRowsToShow.map((row, idx) => (
                        <button
                          key={`${row.mode}-${row.label}`}
                          type="button"
                          role="option"
                          aria-selected={slashMenuIndex === idx}
                          className="w-full px-3 py-2 flex items-start gap-2.5 text-left transition"
                          style={{
                            background:
                              slashMenuIndex === idx
                                ? isDark
                                  ? 'rgba(255,255,255,0.08)'
                                  : 'rgba(0,0,0,0.05)'
                                : 'transparent',
                          }}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            setInput((v) => stripSlashCommand(v));
                            setInputMode(row.mode === 'chat' ? null : row.mode);
                          }}
                        >
                          <SlashMenuRowIcon mode={row.mode} />
                          <span className="flex-1 min-w-0">
                            <span
                              className="text-[13px] font-medium block"
                              style={{ color: isDark ? 'rgba(255,255,255,0.92)' : '#0f172a' }}
                            >
                              {row.label}
                            </span>
                            <span
                              className="text-[11px] block mt-0.5"
                              style={{ color: isDark ? 'rgba(255,255,255,0.45)' : 'rgba(15,23,42,0.5)' }}
                            >
                              {row.hint}
                            </span>
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                )}
                {/*
                  占位层与 textarea 共用 top/bottom inset（与 CHAT_INPUT_PAD_* 一致），顶对齐首行，
                  勿用 flex items-center，否则与 textarea 首行行盒位置不一致。
                */}
                {!input.trim() && !isInputFocused && (
                  <div
                    className="absolute left-0 right-0 pointer-events-none select-none overflow-hidden"
                    style={{
                      top: CHAT_INPUT_PAD_TOP,
                      bottom: CHAT_INPUT_PAD_BOTTOM,
                      color: isDark ? 'rgba(255,255,255,0.45)' : 'rgba(15,23,42,0.35)',
                    }}
                  >
                    <span
                      className="text-sm block w-full"
                      style={{ lineHeight: `${CHAT_INPUT_LINE_HEIGHT_PX}px` }}
                    >
                      {inputMode === 'write'
                        ? '输入主题和写作要求'
                        : inputMode === 'code'
                          ? '输入代码编辑需求'
                          : inputMode === 'ppt'
                            ? '输入PPT主题和页数要求'
                            : inputMode === 'translate'
                              ? '输入要翻译的内容'
                              : inputMode === 'analysis'
                                ? '输入要分析的数据/问题'
                              : inputMode === 'image'
                                ? '描述你想要的图片'
                                : inputMode === 'video'
                                  ? '描述你想生成的视频'
                                : '发送消息...'}
                    </span>
                  </div>
                )}
                <textarea
                  ref={chatTextareaRef}
                  className="w-full bg-transparent outline-none text-sm leading-[22px]"
                  style={{
                    color: isDark ? 'rgba(255,255,255,0.92)' : '#0f172a',
                    fontFamily: 'inherit',
                    resize: 'none',
                    minHeight: CHAT_INPUT_MIN_HEIGHT,
                    maxHeight: 120,
                    boxSizing: 'border-box',
                    paddingTop: CHAT_INPUT_PAD_TOP,
                    paddingBottom: CHAT_INPUT_PAD_BOTTOM,
                    paddingLeft: 0,
                    paddingRight: 0,
                    lineHeight: `${CHAT_INPUT_LINE_HEIGHT_PX}px`,
                  }}
                  placeholder=""
                  value={input}
                  onFocus={() => setIsInputFocused(true)}
                  onBlur={() => setIsInputFocused(false)}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    const menuOpen = slashMenuVisible && slashRowsToShow.length > 0;
                    if (menuOpen) {
                      if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        setSlashMenuIndex((i) => Math.min(i + 1, slashRowsToShow.length - 1));
                        return;
                      }
                      if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        setSlashMenuIndex((i) => Math.max(i - 1, 0));
                        return;
                      }
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        const row = slashRowsToShow[slashMenuIndex];
                        if (row) {
                          setInput((v) => stripSlashCommand(v));
                          setInputMode(row.mode === 'chat' ? null : row.mode);
                        }
                        return;
                      }
                      if (e.key === 'Escape') {
                        e.preventDefault();
                        setInput((v) => stripSlashCommand(v));
                        return;
                      }
                    }
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      void handleSend();
                    }
                  }}
                  disabled={isBusy || !activeSessionId}
                />
              </div>
            </div>

            <div
              className="px-3 pb-0 pt-0 flex items-center justify-between gap-2"
              style={{ color: isDark ? 'rgba(255,255,255,0.78)' : 'rgba(15,23,42,0.75)' }}
            >
              <div className="flex items-center gap-1 overflow-x-auto custom-scrollbar">
                {inputMode ? (
                  <>
                    <div
                      className="h-6 px-2 rounded-lg flex items-center gap-1"
                      style={{
                        background: isDark ? 'rgba(59,130,246,0.16)' : 'rgba(59,130,246,0.12)',
                        color: isDark ? '#60a5fa' : '#2563eb',
                      }}
                    >
                      <span className="text-[12px] font-medium">
                        {inputMode === 'write'
                          ? '帮我写作'
                          : inputMode === 'code'
                            ? '代码编辑'
                            : inputMode === 'ppt'
                              ? 'PPT生成'
                              : inputMode === 'translate'
                                ? '翻译'
                                : inputMode === 'analysis'
                                  ? '数据分析'
                                  : inputMode === 'image'
                                    ? '图像生成'
                                    : '视频生成'}
                      </span>
                      <button
                        className="w-4 h-4 rounded flex items-center justify-center hover:bg-black/10"
                        onClick={() => setInputMode(null)}
                        title="取消模式"
                        type="button"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>

                    {(inputMode === 'image' || inputMode === 'video') ? (
                      <>
                        <button
                          className="h-6 px-2 rounded-lg flex items-center gap-1 transition whitespace-nowrap"
                          onClick={() => setInputMode('image')}
                          title="图像"
                          style={{
                            background:
                              inputMode === 'image'
                                ? (isDark ? 'rgba(255,255,255,0.12)' : 'rgba(15,23,42,0.10)')
                                : 'transparent',
                          }}
                        >
                          <span className="text-[12px] font-medium">图像</span>
                        </button>
                        <button
                          className="h-6 px-2 rounded-lg flex items-center gap-1 transition whitespace-nowrap"
                          onClick={() => setInputMode('video')}
                          title="视频"
                          style={{
                            background:
                              inputMode === 'video'
                                ? (isDark ? 'rgba(255,255,255,0.12)' : 'rgba(15,23,42,0.10)')
                                : 'transparent',
                          }}
                        >
                          <span className="text-[12px] font-medium">视频</span>
                        </button>

                        <button
                          className="h-6 px-2 rounded-lg flex items-center gap-1 hover:bg-white/10 transition whitespace-nowrap"
                          title="上传图片"
                          disabled={isBusy}
                          onClick={() => fileInputRef.current?.click()}
                          type="button"
                        >
                          <Paperclip className="w-4 h-4" />
                          <span className="text-[12px]">参考图</span>
                        </button>

                        <div className="relative shrink-0">
                          <button
                            ref={aspectRatioTriggerRef}
                            type="button"
                            disabled={isBusy}
                            onClick={(e) => {
                              const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
                              setAspectRatioMenuPos({ left: rect.left, top: rect.top - 8 });
                              setAspectRatioMenuOpen((v) => !v);
                            }}
                            className={`h-7 pl-2 pr-2.5 rounded-full flex items-center gap-1.5 shrink-0 transition disabled:opacity-50 ${
                              isDark ? 'hover:bg-white/10' : 'hover:bg-black/[0.06]'
                            }`}
                            style={{
                              background: 'transparent',
                              color: isDark ? 'rgba(255,255,255,0.92)' : '#0f172a',
                            }}
                            title={inputMode === 'video' ? '视频画面比例' : '图像画面比例'}
                            aria-label={inputMode === 'video' ? '视频画面比例' : '图像画面比例'}
                            aria-expanded={aspectRatioMenuOpen}
                            aria-haspopup="listbox"
                          >
                            <span className="flex h-5 w-5 items-center justify-center rounded-md shrink-0 bg-transparent">
                              <Grid3x3 className="w-3.5 h-3.5" strokeWidth={2} />
                            </span>
                            <span className="text-[12px] font-medium">比例</span>
                            <ChevronUp className="w-3.5 h-3.5 opacity-70 shrink-0" aria-hidden />
                          </button>
                          {aspectRatioMenuOpen && aspectRatioMenuPos && (
                            <div
                              ref={aspectRatioMenuPanelRef}
                              className="fixed z-[300] min-w-[148px] rounded-[10px] py-2 overflow-hidden"
                              style={{
                                left: aspectRatioMenuPos.left,
                                top: aspectRatioMenuPos.top,
                                transform: 'translateY(-100%)',
                                background: isDark ? 'rgba(24,24,32,0.98)' : '#ffffff',
                                border: `1px solid ${isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)'}`,
                                boxShadow: isDark ? '0 8px 24px rgba(0,0,0,0.45)' : '0 4px 12px rgba(0,0,0,0.1)',
                              }}
                              role="listbox"
                              aria-label="比例"
                            >
                              <div
                                className="px-3 pb-1.5 text-[11px] select-none"
                                style={{
                                  color: isDark ? 'rgba(255,255,255,0.42)' : 'rgba(15,23,42,0.45)',
                                }}
                              >
                                比例
                              </div>
                              {MEDIA_ASPECT_OPTIONS.map((o) => (
                                <button
                                  key={o.value}
                                  type="button"
                                  role="option"
                                  aria-selected={mediaAspectKey === o.value}
                                  className={`w-full text-left px-3 py-2.5 text-[13px] transition ${
                                    mediaAspectKey === o.value
                                      ? isDark
                                        ? 'bg-white/[0.08]'
                                        : 'bg-black/[0.04]'
                                      : isDark
                                        ? 'hover:bg-white/[0.06]'
                                        : 'hover:bg-black/[0.04]'
                                  }`}
                                  style={{
                                    color: isDark ? 'rgba(255,255,255,0.92)' : '#0f172a',
                                  }}
                                  onClick={() => {
                                    setMediaAspectKey(o.value);
                                    setAspectRatioMenuOpen(false);
                                  }}
                                >
                                  {o.label}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </>
                    ) : inputMode === 'ppt' ? (
                      <>
                        <button
                          className="h-6 px-2 rounded-lg flex items-center gap-1 hover:bg-white/10 transition whitespace-nowrap"
                          title="上传参考图（风格或版式）"
                          disabled={isBusy}
                          onClick={() => fileInputRef.current?.click()}
                          type="button"
                        >
                          <Paperclip className="w-4 h-4" />
                          <span className="text-[12px]">参考图</span>
                        </button>
                        <select
                          value={mediaAspectKey}
                          onChange={(e) => setMediaAspectKey(e.target.value as MediaAspectKey)}
                          disabled={isBusy}
                          title="PPT 配图比例"
                          aria-label="PPT 配图比例"
                          className="h-6 min-w-[4.5rem] pl-2 pr-1 rounded-lg text-[12px] font-medium shrink-0 cursor-pointer border transition whitespace-nowrap"
                          style={{
                            background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.06)',
                            color: isDark ? 'rgba(255,255,255,0.88)' : 'rgba(15,23,42,0.88)',
                            borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)',
                          }}
                        >
                          {MEDIA_ASPECT_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </>
                    ) : (
                      <>
                        {inputMode === 'translate' && (
                          <div className="relative shrink-0">
                            <button
                              ref={translateLangTriggerRef}
                              type="button"
                              disabled={isBusy}
                              onClick={(e) => {
                                const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
                                setTranslateLangMenuPos({ left: rect.left, top: rect.top - 8 });
                                setTranslateLangMenuOpen((v) => !v);
                              }}
                              className={`h-7 pl-2 pr-2.5 rounded-full flex items-center gap-1.5 shrink-0 transition disabled:opacity-50 ${
                                isDark ? 'hover:bg-white/10' : 'hover:bg-black/[0.06]'
                              }`}
                              style={{
                                background: 'transparent',
                                color: isDark ? 'rgba(255,255,255,0.92)' : '#0f172a',
                              }}
                              title="翻译目标语言"
                              aria-label="翻译目标语言"
                              aria-expanded={translateLangMenuOpen}
                              aria-haspopup="listbox"
                            >
                              <Languages className="w-3.5 h-3.5 shrink-0" strokeWidth={2} />
                              <span className="text-[12px] font-medium max-w-[6.5rem] sm:max-w-[9rem] truncate">
                                {TRANSLATE_TARGET_OPTIONS.find((o) => o.id === translateTargetLang)?.label ??
                                  '中文（简体）'}
                              </span>
                              <ChevronUp className="w-3.5 h-3.5 opacity-70 shrink-0" aria-hidden />
                            </button>
                            {translateLangMenuOpen && translateLangMenuPos && (
                              <div
                                ref={translateLangMenuPanelRef}
                                className="fixed z-[300] min-w-[168px] rounded-[10px] py-2 overflow-hidden"
                                style={{
                                  left: translateLangMenuPos.left,
                                  top: translateLangMenuPos.top,
                                  transform: 'translateY(-100%)',
                                  background: isDark ? 'rgba(24,24,32,0.98)' : '#ffffff',
                                  border: `1px solid ${isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)'}`,
                                  boxShadow: isDark
                                    ? '0 8px 24px rgba(0,0,0,0.45)'
                                    : '0 4px 12px rgba(0,0,0,0.1)',
                                }}
                                role="listbox"
                                aria-label="翻译目标语言"
                              >
                                <div
                                  className="px-3 pb-1.5 text-[11px] select-none"
                                  style={{
                                    color: isDark ? 'rgba(255,255,255,0.42)' : 'rgba(15,23,42,0.45)',
                                  }}
                                >
                                  译成
                                </div>
                                {TRANSLATE_TARGET_OPTIONS.map((o) => (
                                  <button
                                    key={o.id}
                                    type="button"
                                    role="option"
                                    aria-selected={translateTargetLang === o.id}
                                    className={`w-full text-left px-3 py-2.5 text-[13px] transition ${
                                      translateTargetLang === o.id
                                        ? isDark
                                          ? 'bg-white/[0.08]'
                                          : 'bg-black/[0.04]'
                                        : isDark
                                          ? 'hover:bg-white/[0.06]'
                                          : 'hover:bg-black/[0.04]'
                                    }`}
                                    style={{
                                      color: isDark ? 'rgba(255,255,255,0.92)' : '#0f172a',
                                    }}
                                    onClick={() => {
                                      setTranslateTargetLang(o.id);
                                      setTranslateLangMenuOpen(false);
                                    }}
                                  >
                                    {o.label}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                        <div className="relative">
                          <button
                            className="h-7 px-2 rounded-lg flex items-center gap-1 hover:bg-white/10 transition whitespace-nowrap"
                            onClick={(e) => {
                              const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
                              setQuickMenuPos({ left: rect.left, top: rect.top - 8 });
                              setQuickMenuOpen((v) => !v);
                            }}
                            disabled={isBusy}
                            title={quickMode === 'fast' ? '快速' : '思考'}
                            aria-label={quickMode === 'fast' ? '快速' : '思考'}
                            type="button"
                          >
                            <Zap className="w-4 h-4" />
                            <span className="text-[12px]">{quickMode === 'fast' ? '快速' : '思考'}</span>
                          </button>
                          {quickMenuOpen && quickMenuPos && (
                            <div
                              ref={quickMenuPanelRef}
                              className="fixed w-[180px] rounded-xl p-1 shadow-lg z-[300]"
                              style={{
                                left: quickMenuPos.left,
                                top: quickMenuPos.top,
                                transform: 'translateY(-100%)',
                                background: isDark ? 'rgba(18,18,26,0.96)' : 'rgba(255,255,255,0.98)',
                                border: `1px solid ${isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.06)'}`,
                              }}
                            >
                              <button
                                type="button"
                                className="w-full px-3 py-2 rounded-lg flex items-start gap-2 hover:bg-black/5"
                                onClick={() => {
                                  setQuickMode('fast');
                                  setQuickMenuOpen(false);
                                }}
                              >
                                <Zap className="w-4 h-4 mt-0.5" />
                                <div className="flex-1 text-left">
                                  <div className="text-[12px] font-medium">快速</div>
                                  <div className="text-[11px] opacity-60">适用于大部分情况</div>
                                </div>
                                {quickMode === 'fast' && <Check className="w-4 h-4 mt-0.5" />}
                              </button>
                              <button
                                type="button"
                                className="w-full px-3 py-2 rounded-lg flex items-start gap-2 hover:bg-black/5"
                                onClick={() => {
                                  setQuickMode('think');
                                  setQuickMenuOpen(false);
                                }}
                              >
                                <Brain className="w-4 h-4 mt-0.5" />
                                <div className="flex-1 text-left">
                                  <div className="text-[12px] font-medium">思考</div>
                                  <div className="text-[11px] opacity-60">擅长解决更困难的问题</div>
                                </div>
                                {quickMode === 'think' && <Check className="w-4 h-4 mt-0.5" />}
                              </button>
                            </div>
                          )}
                        </div>

                          <button
                            className="h-6 px-2 rounded-lg flex items-center gap-1 hover:bg-white/10 transition whitespace-nowrap"
                          title="上传图片"
                          disabled={isBusy}
                          onClick={() => fileInputRef.current?.click()}
                          type="button"
                        >
                          <Paperclip className="w-4 h-4" />
                          <span className="text-[12px]">参考资料</span>
                        </button>
                      </>
                    )}
                  </>
                ) : (
                  <>
                    <button
                      className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-white/10 transition"
                      title="上传图片"
                      disabled={isBusy}
                      onClick={() => fileInputRef.current?.click()}
                      type="button"
                    >
                      <Paperclip className="w-4 h-4" />
                    </button>
                    <span
                      className="text-xs select-none"
                      style={{ color: isDark ? 'rgba(255,255,255,0.32)' : 'rgba(15,23,42,0.28)' }}
                    >
                      |
                    </span>

                    <div className="relative">
                      <button
                        className="h-7 px-2 rounded-lg flex items-center gap-1 hover:bg-white/10 transition whitespace-nowrap"
                        onClick={(e) => {
                          const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
                          setQuickMenuPos({ left: rect.left, top: rect.top - 8 });
                          setQuickMenuOpen((v) => !v);
                        }}
                        disabled={isBusy}
                        title={quickMode === 'fast' ? '快速' : '思考'}
                        aria-label={quickMode === 'fast' ? '快速' : '思考'}
                        type="button"
                      >
                        <Zap className="w-4 h-4" />
                        <span className="text-[12px]">{quickMode === 'fast' ? '快速' : '思考'}</span>
                      </button>
                      {quickMenuOpen && quickMenuPos && (
                        <div
                          ref={quickMenuPanelRef}
                          className="fixed w-[180px] rounded-xl p-1 shadow-lg z-[300]"
                          style={{
                            left: quickMenuPos.left,
                            top: quickMenuPos.top,
                            transform: 'translateY(-100%)',
                            background: isDark ? 'rgba(18,18,26,0.96)' : 'rgba(255,255,255,0.98)',
                            border: `1px solid ${isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.06)'}`,
                          }}
                        >
                          <button
                            type="button"
                            className="w-full px-3 py-2 rounded-lg flex items-start gap-2 hover:bg-black/5"
                            onClick={() => {
                              setQuickMode('fast');
                              setQuickMenuOpen(false);
                            }}
                          >
                            <Zap className="w-4 h-4 mt-0.5" />
                            <div className="flex-1 text-left">
                              <div className="text-[12px] font-medium">快速</div>
                              <div className="text-[11px] opacity-60">适用于大部分情况</div>
                            </div>
                            {quickMode === 'fast' && <Check className="w-4 h-4 mt-0.5" />}
                          </button>
                          <button
                            type="button"
                            className="w-full px-3 py-2 rounded-lg flex items-start gap-2 hover:bg-black/5"
                            onClick={() => {
                              setQuickMode('think');
                              setQuickMenuOpen(false);
                            }}
                          >
                            <Brain className="w-4 h-4 mt-0.5" />
                            <div className="flex-1 text-left">
                              <div className="text-[12px] font-medium">思考</div>
                              <div className="text-[11px] opacity-60">擅长解决更困难的问题</div>
                            </div>
                            {quickMode === 'think' && <Check className="w-4 h-4 mt-0.5" />}
                          </button>
                        </div>
                      )}
                    </div>

                    <button
                      className="h-7 px-2 rounded-lg flex items-center gap-1 hover:bg-white/10 transition whitespace-nowrap"
                      onClick={() => setInputMode('write')}
                      disabled={isBusy}
                      title="帮我写作"
                    >
                      <PenSquare className="w-4 h-4" />
                      <span className="text-[12px]">帮我写作</span>
                    </button>

                    <button
                      className="h-7 px-2 rounded-lg flex items-center gap-1 hover:bg-white/10 transition whitespace-nowrap"
                      onClick={() => setInputMode('video')}
                      disabled={isBusy}
                      title="视频生成"
                    >
                      <VideoIcon className="w-4 h-4" />
                      <span className="text-[12px]">视频生成</span>
                    </button>

                    <button
                      className="h-7 px-2 rounded-lg flex items-center gap-1 hover:bg-white/10 transition whitespace-nowrap"
                      onClick={() => setInputMode('code')}
                      disabled={isBusy}
                      title="代码编辑"
                    >
                      <Code2 className="w-4 h-4" />
                      <span className="text-[12px]">代码编辑</span>
                    </button>

                    <button
                      className="h-7 px-2 rounded-lg flex items-center gap-1 hover:bg-white/10 transition whitespace-nowrap"
                      onClick={() => setInputMode('image')}
                      disabled={isBusy}
                      title="图像生成"
                    >
                      <ImageIcon className="w-4 h-4" />
                      <span className="text-[12px]">图像生成</span>
                    </button>

                    <button
                      className="h-7 px-2 rounded-lg flex items-center gap-1 hover:bg-white/10 transition whitespace-nowrap"
                      onClick={() => setInputMode('ppt')}
                      disabled={isBusy}
                      title="PPT生成"
                    >
                      <Languages className="w-4 h-4" />
                      <span className="text-[12px]">PPT生成</span>
                    </button>

                    <div className="relative">
                      <button
                        className="h-7 px-2 rounded-lg flex items-center gap-1 hover:bg-white/10 transition whitespace-nowrap"
                        title="更多"
                        aria-label="更多"
                        type="button"
                        onClick={(e) => {
                          const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
                          setMoreMenuPos({ left: rect.left, top: rect.top - 8 });
                          setMoreMenuOpen((v) => !v);
                        }}
                        disabled={isBusy}
                      >
                        <Grid3x3 className="w-4 h-4" />
                        <span className="text-[12px]">更多</span>
                      </button>
                      {moreMenuOpen && moreMenuPos && (
                        <div
                          ref={moreMenuPanelRef}
                          className="fixed w-[180px] rounded-xl p-1 shadow-lg z-[300]"
                          style={{
                            left: moreMenuPos.left,
                            top: moreMenuPos.top,
                            transform: 'translateY(-100%)',
                            background: isDark ? 'rgba(18,18,26,0.96)' : 'rgba(255,255,255,0.98)',
                            border: `1px solid ${isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.06)'}`,
                          }}
                        >
                          <button
                            type="button"
                            className="w-full px-3 py-2 rounded-lg flex items-center gap-2 hover:bg-black/5"
                            onClick={() => {
                              setMoreMenuOpen(false);
                              setInputMode('translate');
                            }}
                          >
                            <Languages className="w-4 h-4" />
                            <div className="flex-1 text-left">
                              <div className="text-[12px] font-medium">翻译</div>
                            </div>
                          </button>
                          <button
                            type="button"
                            className="w-full px-3 py-2 rounded-lg flex items-center gap-2 hover:bg-black/5"
                            onClick={() => {
                              setMoreMenuOpen(false);
                              setInputMode('analysis');
                            }}
                          >
                            <BarChart3 className="w-4 h-4" />
                            <div className="flex-1 text-left">
                              <div className="text-[12px] font-medium">数据分析</div>
                            </div>
                          </button>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>

              <div className="flex items-center gap-2">
                {input.trim().length > 0 ? (
                  <button
                    className="w-9 h-9 rounded-full flex items-center justify-center"
                    title="发送"
                    aria-label="发送"
                    style={{
                      background: '#2563eb',
                      border: 'none',
                      color: 'white',
                      opacity: isBusy ? 0.6 : 1,
                    }}
                    disabled={isBusy || !activeSessionId}
                    onClick={() => void handleSend()}
                    type="button"
                  >
                    <ArrowUp className="w-5 h-5" />
                  </button>
                ) : (
                  <button
                    className="w-9 h-9 rounded-full flex items-center justify-center"
                    title="语音"
                    aria-label="语音"
                    style={{
                      background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.06)',
                      border: 'none',
                    }}
                    disabled
                    type="button"
                  >
                    <Mic className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>

      {renameSessionModal && (
        <div
          className="fixed inset-0 z-[210] flex items-center justify-center bg-black/40 backdrop-blur-sm px-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setRenameSessionModal(null);
          }}
        >
          <div
            className="w-full max-w-md rounded-2xl p-4"
            style={{
              background: isDark ? 'rgba(18,18,26,0.96)' : 'rgba(255,255,255,0.98)',
              border: `1px solid ${isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)'}`,
              boxShadow: isDark ? '0 24px 70px rgba(0,0,0,0.55)' : '0 18px 50px rgba(15,23,42,0.12)',
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="text-sm font-semibold mb-3" style={{ color: isDark ? '#fff' : '#0f172a' }}>
              重命名对话
            </div>
            <input
              className="liquid-input w-full mb-4"
              value={renameSessionModal.draft}
              onChange={(e) => setRenameSessionModal((m) => (m ? { ...m, draft: e.target.value } : null))}
              placeholder="会话标题"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void handleRenameSessionSubmit();
                }
                if (e.key === 'Escape') setRenameSessionModal(null);
              }}
            />
            <div className="flex justify-end gap-2">
              <button type="button" className="liquid-btn liquid-btn-ghost liquid-btn-sm" onClick={() => setRenameSessionModal(null)}>
                取消
              </button>
              <button
                type="button"
                className="liquid-btn liquid-btn-sm"
                onClick={() => void handleRenameSessionSubmit()}
                disabled={!renameSessionModal.draft.trim()}
              >
                确定
              </button>
            </div>
          </div>
        </div>
      )}

      {isRefOpen && (
        <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm">
          <div
            className="w-full sm:w-[520px] mx-4 mb-4 sm:mb-0 rounded-2xl p-4"
            style={{
              background: isDark ? 'rgba(18,18,26,0.92)' : 'rgba(255,255,255,0.98)',
              border: `1px solid ${isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)'}`,
              boxShadow: isDark ? '0 24px 70px rgba(0,0,0,0.55)' : '0 18px 50px rgba(15,23,42,0.12)',
            }}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-semibold" style={{ color: isDark ? 'white' : '#0f172a' }}>
                添加参考图 / 视频
              </div>
              <button
                className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/10"
                onClick={() => setIsRefOpen(false)}
                title="关闭"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <input
                  className="liquid-input"
                  value={refLinkDraft}
                  onChange={(e) => setRefLinkDraft(e.target.value)}
                  placeholder="粘贴图片或视频链接（http/https）"
                />
                <button className="liquid-btn liquid-btn-sm" onClick={addReferenceLink} disabled={!refLinkDraft.trim()}>
                  添加
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button className="liquid-btn liquid-btn-ghost liquid-btn-sm" onClick={() => fileInputRef.current?.click()}>
                  选择本地文件（图片 / 视频 / txt / docx）
                </button>
                <div
                  className="text-xs"
                  style={{ color: isDark ? 'rgba(255,255,255,0.55)' : 'rgba(15,23,42,0.55)' }}
                >
                  已添加 {inputAttachments.length} 个
                </div>
              </div>

              {inputAttachments.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {inputAttachments.map((a) => (
                    <div
                      key={a.id}
                      className="flex items-center gap-2 rounded-lg p-1 pr-2 text-xs"
                      style={{
                        background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.06)',
                        border: `1px solid ${isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.06)'}`,
                        color: isDark ? 'rgba(255,255,255,0.85)' : '#0f172a',
                      }}
                    >
                      <div className="relative w-10 h-10 flex-shrink-0">
                        <div className="absolute inset-0 rounded-md overflow-hidden pointer-events-none">
                          {a.kind === 'image' ? (
                            <img src={a.previewUrl} alt="" className="w-full h-full object-cover" draggable={false} />
                          ) : a.kind === 'video' ? (
                            <video src={a.previewUrl} className="w-full h-full object-cover" muted playsInline preload="metadata" />
                          ) : (
                            <DocumentAttachmentThumbnail
                              fileName={a.fileName || '文档'}
                              textPreview={a.textPreview || ''}
                              isDark={isDark}
                              compact
                            />
                          )}
                        </div>
                        <button
                          type="button"
                          className="absolute -top-1 -right-1 z-10 w-5 h-5 rounded-full flex items-center justify-center border border-white/25"
                          style={{ background: 'rgba(0,0,0,0.65)' }}
                          title="删除"
                          aria-label="删除该附件"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            removeInputAttachment(a.id);
                          }}
                        >
                          <X className="w-2.5 h-2.5 text-white" strokeWidth={2.5} />
                        </button>
                      </div>
                      <span className="max-w-[200px] truncate" title={a.fileName || a.apiRef}>
                        {a.kind === 'document'
                          ? a.fileName || '文档'
                          : a.apiRef.startsWith('data:')
                            ? a.kind === 'video'
                              ? '本地视频'
                              : '本地图片'
                            : a.apiRef}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button className="liquid-btn liquid-btn-ghost liquid-btn-sm" onClick={() => setIsRefOpen(false)}>
                  完成
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {codeFullscreen && (
        <div
          className="fixed inset-0 z-[400] flex flex-col bg-black"
          role="dialog"
          aria-modal="true"
          aria-label="代码全屏"
        >
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-white/10 shrink-0">
            <span className="text-sm font-medium" style={{ color: '#e5e7eb' }}>
              代码预览
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                className="w-9 h-9 rounded-lg flex items-center justify-center hover:bg-white/10"
                style={{ color: '#e5e7eb' }}
                title="复制全文"
                onClick={() => void copyToClipboard(codeFullscreen.content)}
              >
                <Copy className="w-4 h-4" />
              </button>
              <button
                type="button"
                className="w-9 h-9 rounded-lg flex items-center justify-center hover:bg-white/10"
                style={{ color: '#e5e7eb' }}
                title="转发"
                onClick={() => {}}
              >
                <Share2 className="w-4 h-4" />
              </button>
              <button
                type="button"
                className="w-9 h-9 rounded-lg flex items-center justify-center hover:bg-white/10"
                style={{ color: '#e5e7eb' }}
                title="关闭"
                onClick={() => setCodeFullscreen(null)}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div className="flex-1 min-h-0 overflow-auto p-4">
            {renderMarkdownCodeMode(codeFullscreen.content, true, {
              onCopyBlock: (t) => void copyToClipboard(t),
            })}
          </div>
        </div>
      )}
    </section>
  );
}

