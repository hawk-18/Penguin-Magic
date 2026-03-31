import React from 'react';
import { Icons } from './Icons';

/** 与侧栏 Image 按钮悬停面板一致：图生图 / 图生视频 / … */
export type ImageSuggestionKind =
  | 'native-image'
  | 'native-video'
  | 'remove-bg'
  | 'enhance-details'
  | 'expand-image';

const ITEMS: { kind: ImageSuggestionKind; text: string; icon: React.ReactNode }[] = [
  { kind: 'native-image', text: '图生图', icon: <Icons.Upload size={14} className="text-white/35" /> },
  { kind: 'native-video', text: '图生视频', icon: <Icons.Upload size={14} className="text-white/35" /> },
  {
    kind: 'remove-bg',
    text: '图片换背景',
    icon: (
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        className="text-white/35"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      >
        <path d="M4 18L11 11" />
        <path d="M8 18L15 11" />
        <path d="M12 18L19 11" />
      </svg>
    ),
  },
  { kind: 'enhance-details', text: '首帧图生视频', icon: <Icons.Video size={14} className="text-white/35" /> },
  { kind: 'expand-image', text: '图片扩展', icon: <Icons.Expand size={14} className="text-white/35" /> },
];

export interface ImageSuggestionPanelProps {
  /** 点击某一项（侧栏需传 event 以取 clientX/Y 定位浮动面板） */
  onSelect: (kind: ImageSuggestionKind, e: React.MouseEvent<HTMLButtonElement>) => void;
  className?: string;
  style?: React.CSSProperties;
  onMouseDown?: (e: React.MouseEvent) => void;
}

/**
 * 侧栏 Image 悬停层与画布图片节点「+」菜单共用同一套 UI（以侧栏为准）。
 */
export function ImageSuggestionPanel({ onSelect, className = '', style, onMouseDown }: ImageSuggestionPanelProps) {
  return (
    <div
      className={`relative w-[280px] rounded-2xl border border-white/15 bg-[#222225]/95 backdrop-blur-xl shadow-2xl ${className}`}
      style={style}
      onMouseDown={onMouseDown}
    >
      <div className="space-y-2 px-4 py-3">
        {ITEMS.map((item) => (
          <button
            key={item.kind}
            type="button"
            className="flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left text-[11px] text-white/35 transition hover:bg-white/5 hover:text-white/70"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onSelect(item.kind, e);
            }}
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          >
            <span className="flex h-4 w-4 shrink-0 items-center justify-center">{item.icon}</span>
            <span className="truncate">{item.text}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
