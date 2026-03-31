
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Icons } from './Icons';
import { NodeType, NodeData, CanvasPreset } from '../../types/pebblingTypes';
import { CanvasListItem } from '../../services/api/canvas';
import { CreativeIdea } from '../../types';

// 香蕉SVG图标组件
const BananaIcon: React.FC<{ size?: number; className?: string }> = ({ size = 14, className = '' }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="currentColor" 
    className={className}
  >
    <path d="M20.5,10.5c-0.8-0.8-1.9-1.3-3-1.4c0.1-0.5,0.2-1.1,0.2-1.6c0-2.2-1.8-4-4-4c-1.4,0-2.6,0.7-3.3,1.8 C9.6,4.2,8.4,3.5,7,3.5c-2.2,0-4,1.8-4,4c0,0.5,0.1,1.1,0.2,1.6c-1.1,0.1-2.2,0.6-3,1.4c-1.4,1.4-1.4,3.7,0,5.1 c0.7,0.7,1.6,1.1,2.5,1.1c0.9,0,1.8-0.4,2.5-1.1c0.7-0.7,1.1-1.6,1.1-2.5c0-0.9-0.4-1.8-1.1-2.5c-0.2-0.2-0.4-0.4-0.7-0.5 c-0.1-0.4-0.2-0.9-0.2-1.3c0-1.1,0.9-2,2-2s2,0.9,2,2c0,0.5-0.2,0.9-0.5,1.3c-0.5,0.6-0.7,1.3-0.7,2.1c0,0.9,0.4,1.8,1.1,2.5 c0.7,0.7,1.6,1.1,2.5,1.1s1.8-0.4,2.5-1.1c0.7-0.7,1.1-1.6,1.1-2.5c0-0.8-0.3-1.5-0.7-2.1c-0.3-0.4-0.5-0.8-0.5-1.3 c0-1.1,0.9-2,2-2s2,0.9,2,2c0,0.5-0.1,0.9-0.2,1.3c-0.2,0.1-0.5,0.3-0.7,0.5c-0.7,0.7-1.1,1.6-1.1,2.5c0,0.9,0.4,1.8,1.1,2.5 c0.7,0.7,1.6,1.1,2.5,1.1c0.9,0,1.8-0.4,2.5-1.1C21.9,14.2,21.9,11.9,20.5,10.5z"/>
  </svg>
);

interface SidebarProps {
    onDragStart: (type: NodeType) => void;
    onAdd: (type: NodeType, data?: NodeData, title?: string) => void;
    userPresets: CanvasPreset[];
    onAddPreset: (presetId: string) => void;
    onDeletePreset: (presetId: string) => void;
    onHome: () => void;
    onOpenSettings: () => void;
    isApiConfigured: boolean;
    // 画布管理
    canvasList: CanvasListItem[];
    currentCanvasId: string | null;
    canvasName: string;
    isCanvasLoading: boolean;
    onCreateCanvas: () => void;
    onLoadCanvas: (id: string) => void;
    onDeleteCanvas: (id: string) => void;
    onRenameCanvas: (newName: string) => void;
    // 创意库
    creativeIdeas?: CreativeIdea[];
    onApplyCreativeIdea?: (idea: CreativeIdea) => void;
    // 手动保存
    onManualSave?: () => void;
    autoSaveEnabled?: boolean;
    hasUnsavedChanges?: boolean;
    /** 浮动生成面板提交后的全局生成中（与底部 FloatingInput 共用同一状态） */
    composerGenerating?: boolean;
}

type ImageSuggestionKind = 'native-image' | 'native-video' | 'remove-bg' | 'enhance-details' | 'expand-image';
type StyleCategory = 'all' | '人物' | '场景' | '物品' | '风格' | '音效' | '其他';
type ModelBase = 'doubao' | 'comfyui';
type ImageQuality = '1k' | '2k' | '4k';
type AspectRatioOption =
  | 'auto'
  | '1:1'
  | '9:16'
  | '16:9'
  | '3:4'
  | '4:3'
  | '3:2'
  | '2:3'
  | '5:4'
  | '4:5'
  | '21:9';
type SamplerType = 'Euler' | 'DPM++ 2M' | 'DDIM';

const GRID_ASPECT_RATIOS: Exclude<AspectRatioOption, 'auto'>[] = [
  '1:1',
  '9:16',
  '16:9',
  '3:4',
  '4:3',
  '3:2',
  '2:3',
  '5:4',
  '4:5',
  '21:9',
];

function MiniAspectIcon({ ratio }: { ratio: Exclude<AspectRatioOption, 'auto'> }) {
  const [aw, ah] = ratio.split(':').map(Number);
  const box = 22;
  let w = box;
  let h = box;
  if (aw >= ah) {
    w = box;
    h = Math.max(10, Math.round((box * ah) / aw));
  } else {
    h = box;
    w = Math.max(10, Math.round((box * aw) / ah));
  }
  return (
    <div
      className="border border-white/35 rounded-[3px] bg-white/5 mx-auto"
      style={{ width: w, height: h }}
    />
  );
}

interface StyleAsset {
  id: string;
  name: string;
  category: Exclude<StyleCategory, 'all'>;
  preview?: string;
}

const Sidebar: React.FC<SidebarProps> = ({ 
  onDragStart, onAdd, userPresets, onAddPreset, onDeletePreset, onHome, onOpenSettings, isApiConfigured,
  canvasList, currentCanvasId, canvasName, isCanvasLoading, onCreateCanvas, onLoadCanvas, onDeleteCanvas, onRenameCanvas,
  creativeIdeas = [], onApplyCreativeIdea, onManualSave, autoSaveEnabled = false, hasUnsavedChanges = false,
  composerGenerating = false,
}) => {
  const [activeLibrary, setActiveLibrary] = useState(false);
  const [showCanvasPanel, setShowCanvasPanel] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editingName, setEditingName] = useState('');
  const [libraryFilter, setLibraryFilter] = useState<'all' | 'bp' | 'workflow' | 'favorite'>('all');
  const [hoveredIdeaId, setHoveredIdeaId] = useState<number | null>(null);

  const [floatingComposer, setFloatingComposer] = useState<{
    kind: ImageSuggestionKind;
    x: number;
    y: number;
    /** 画布图片节点 id（从节点输出菜单打开时） */
    sourceNodeId?: string;
    /** 画布占位锚点，关闭面板时移除 */
    anchorId?: string;
    /** 上游图片缩略图（data URL 或 http） */
    sourceImageUrl?: string;
  } | null>(null);
  /** 本次生成结果预览（成功回填顶部灰区） */
  const [composerPreviewMedia, setComposerPreviewMedia] = useState<{
    url: string;
    isVideo?: boolean;
  } | null>(null);
  const [showStylePicker, setShowStylePicker] = useState(false);
  const [styleCategory, setStyleCategory] = useState<StyleCategory>('all');
  const [selectedStyleId, setSelectedStyleId] = useState<string | null>(null);
  const [stylePickerPos, setStylePickerPos] = useState<{ x: number; y: number }>({ x: 80, y: 48 });
  const [composerInputText, setComposerInputText] = useState('');
  const [generationCount, setGenerationCount] = useState<1 | 2 | 4>(1);
  const [showGenerationMenu, setShowGenerationMenu] = useState(false);
  const [modelBase, setModelBase] = useState<ModelBase>('doubao');
  const [showModelMenu, setShowModelMenu] = useState(false);
  const [imageQuality, setImageQuality] = useState<ImageQuality>('2k');
  const [aspectRatio, setAspectRatio] = useState<AspectRatioOption>('auto');
  const [showImageSizePanel, setShowImageSizePanel] = useState(false);
  const [showAdvancedParamsPanel, setShowAdvancedParamsPanel] = useState(false);
  const [advancedPanelPos, setAdvancedPanelPos] = useState<{ x: number; y: number }>({ x: 220, y: 120 });
  const [steps, setSteps] = useState(28);
  const [cfgScale, setCfgScale] = useState(7);
  const [sampler, setSampler] = useState<SamplerType>('Euler');
  const [showSamplerMenu, setShowSamplerMenu] = useState(false);
  const [seed, setSeed] = useState('');
  const composerTextareaRef = useRef<HTMLTextAreaElement>(null);

  const draggingComposerRef = useRef<{
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const draggingStylePickerRef = useRef<{
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const draggingAdvancedPanelRef = useRef<{
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);

  const styleAssets = useMemo<StyleAsset[]>(() => {
    return [
      {
        id: 'style-1',
        name: '3D欧美卡通',
        category: '风格',
        preview: '/style-previews/style-3d.png',
      },
      { id: 'style-2', name: '赛博朋克夜景', category: '场景', preview: '/style-previews/style-cyberpunk.png' },
      { id: 'style-3', name: '电影感人像', category: '人物', preview: '/style-previews/style-cinematic.png' },
      { id: 'style-4', name: '国风水墨', category: '风格', preview: '/style-previews/style-ink.png' },
      { id: 'style-5', name: '二次元插画', category: '风格', preview: '/style-previews/style-anime.png' },
      { id: 'style-6', name: '产品摄影棚拍', category: '物品', preview: '/style-previews/style-product.png' },
      { id: 'style-7', name: '蒸汽波复古', category: '风格', preview: '/style-previews/style-vaporwave.png' },
      { id: 'style-8', name: '胶片纪实街拍', category: '场景', preview: '/style-previews/style-filmstreet.png' },
      { id: 'style-9', name: '奇幻角色设定', category: '人物', preview: '/style-previews/style-fantasy.png' },
      { id: 'style-10', name: '环境氛围音', category: '音效', preview: '/style-previews/style-ambience.png' },
      { id: 'style-11', name: '极简现代感', category: '其他', preview: '/style-previews/style-minimal.png' },
    ];
  }, []);


  const floatingTitle = useMemo(() => {
    if (!floatingComposer) return '';
    switch (floatingComposer.kind) {
      case 'native-image':
        return '图生图';
      case 'native-video':
        return '原生视频';
      case 'remove-bg':
        return '图片换背景';
      case 'enhance-details':
        return '首帧图生视频';
      case 'expand-image':
        return '图片扩展';
    }
  }, [floatingComposer]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const s = draggingComposerRef.current;
      if (s) {
        const dx = e.clientX - s.startX;
        const dy = e.clientY - s.startY;
        const nx = s.originX + dx;
        const ny = s.originY + dy;
        setFloatingComposer((prev) => {
          if (!prev) return prev;
          if (prev.anchorId) {
            window.dispatchEvent(
              new CustomEvent('pebbling-composer-anchor-sync', {
                detail: { anchorId: prev.anchorId, panelX: nx, panelY: ny },
              })
            );
          }
          return { ...prev, x: nx, y: ny };
        });
      }

      const p = draggingStylePickerRef.current;
      if (p) {
        const dx = e.clientX - p.startX;
        const dy = e.clientY - p.startY;
        setStylePickerPos({ x: p.originX + dx, y: p.originY + dy });
      }

      const a = draggingAdvancedPanelRef.current;
      if (a) {
        const dx = e.clientX - a.startX;
        const dy = e.clientY - a.startY;
        setAdvancedPanelPos({ x: a.originX + dx, y: a.originY + dy });
      }

    };
    const onUp = () => {
      draggingComposerRef.current = null;
      draggingStylePickerRef.current = null;
      draggingAdvancedPanelRef.current = null;
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  /** 可拖拽生成面板打开后聚焦输入框，确保快捷键生效 */
  useEffect(() => {
    if (!floatingComposer) return;
    const t = window.setTimeout(() => {
      composerTextareaRef.current?.focus();
    }, 0);
    return () => window.clearTimeout(t);
  }, [floatingComposer]);

  const openComposerAt = (kind: ImageSuggestionKind, x: number, y: number) => {
    // 防止生成在屏幕外：粗略钳制一下
    const nextX = Math.max(80, Math.min(window.innerWidth - 820, x + 16));
    const nextY = Math.max(24, Math.min(window.innerHeight - 220, y - 60));
    setComposerPreviewMedia(null);
    setFloatingComposer({ kind, x: nextX, y: nextY });
  };

  /** 画布图片节点输出菜单 → index 创建锚点后回传 */
  useEffect(() => {
    const onFloatingOpen = (e: Event) => {
      const d = (e as CustomEvent).detail || {};
      const kind = d.kind as ImageSuggestionKind | undefined;
      if (!kind) return;
      setComposerPreviewMedia(null);
      setFloatingComposer({
        kind,
        x: d.x,
        y: d.y,
        sourceNodeId: d.sourceNodeId,
        anchorId: d.anchorId,
        sourceImageUrl: d.sourceImageUrl,
      });
    };
    window.addEventListener('pebbling-floating-composer-open', onFloatingOpen);
    return () => window.removeEventListener('pebbling-floating-composer-open', onFloatingOpen);
  }, []);

  useEffect(() => {
    const onPreview = (e: Event) => {
      const d = (e as CustomEvent).detail || {};
      const url = String(d.url || '');
      if (!url) return;
      setComposerPreviewMedia({ url, isVideo: !!d.isVideo });
    };
    window.addEventListener('pebbling-composer-preview', onPreview);
    return () => window.removeEventListener('pebbling-composer-preview', onPreview);
  }, []);

  const openStylePicker = () => {
    setShowImageSizePanel(false);
    const width = Math.min(980, Math.max(760, window.innerWidth * 0.86));
    const height = Math.min(660, Math.max(460, window.innerHeight * 0.82));
    setStylePickerPos({
      x: Math.max(24, (window.innerWidth - width) / 2),
      y: Math.max(16, (window.innerHeight - height) / 2),
    });
    setShowStylePicker(true);
  };

  const handleComposerSubmit = () => {
    if (composerGenerating) return;
    const text = composerInputText.trim();
    if (!text) return;
    const selectedAsset = selectedStyleId
      ? styleAssets.find((s) => s.id === selectedStyleId)
      : undefined;
    window.dispatchEvent(new CustomEvent('pebbling-composer-submit', {
      detail: {
        prompt: text,
        kind: floatingComposer?.kind || 'native-image',
        base: modelBase,
        generationCount,
        imageQuality,
        aspectRatio,
        style: selectedAsset
          ? { id: selectedAsset.id, name: selectedAsset.name, category: selectedAsset.category }
          : undefined,
        advanced: {
          steps,
          cfgScale,
          sampler,
          seed,
        },
        sourceNodeId: floatingComposer?.sourceNodeId,
        anchorId: floatingComposer?.anchorId,
      }
    }));
  };

  const handleComposerSubmitRef = useRef(handleComposerSubmit);
  handleComposerSubmitRef.current = handleComposerSubmit;

  /**
   * 浮动面板内 Shift+Enter 提交：在 capture 阶段处理，避免依赖 textarea 上的 React 委托
   * （否则在部分环境下 onKeyDown 不可靠，只能点发送）。
   */
  useEffect(() => {
    if (!floatingComposer) return;
    const onWinKeyDown = (e: KeyboardEvent) => {
      if (e.isComposing || (e as KeyboardEvent & { keyCode?: number }).keyCode === 229) return;
      const isEnter = e.key === 'Enter' || e.code === 'Enter' || e.code === 'NumpadEnter';
      if (!isEnter || !e.shiftKey || e.repeat) return;
      const root = document.querySelector('[data-floating-composer-root]');
      const t = (e.target as Node | null) ?? document.activeElement;
      if (!root || !t || !root.contains(t)) return;
      e.preventDefault();
      e.stopPropagation();
      handleComposerSubmitRef.current();
    };
    window.addEventListener('keydown', onWinKeyDown, true);
    return () => window.removeEventListener('keydown', onWinKeyDown, true);
  }, [floatingComposer]);

  // Default Presets
  const defaultPresets = [
      {
          id: 'p1',
          title: "Vision: Describe Image",
          description: "Reverse engineer an image into a prompt.",
          type: 'llm' as NodeType,
          data: { systemInstruction: "You are an expert computer vision assistant. Describe the input image in extreme detail, focusing on style, lighting, composition, and subjects." }
      },
      {
          id: 'p2',
          title: "Text Refiner",
          description: "Rewrite text to be professional and concise.",
          type: 'llm' as NodeType,
          data: { systemInstruction: "You are a professional editor. Rewrite the following user text to be more concise, professional, and impactful. Maintain the original meaning." }
      },
      {
          id: 'p3',
          title: "Story Expander",
          description: "Turn a simple sentence into a paragraph.",
          type: 'llm' as NodeType,
          data: { systemInstruction: "You are a creative writer. Take the user's short input and expand it into a vivid, descriptive paragraph suitable for a novel." }
      }
  ];

  const qualityShort = imageQuality === '1k' ? '1K' : imageQuality === '2k' ? '2K' : '4K';
  const resolutionButtonLabel =
    aspectRatio === 'auto' ? `自适应·${qualityShort}` : `${aspectRatio}·${qualityShort}`;

  return (
    <>
        <div className="fixed left-6 top-1/2 -translate-y-1/2 z-40 flex flex-col gap-4 pointer-events-none">
        
        {/* 画布管理按钮 */}
        <button 
            onClick={(e) => { e.stopPropagation(); setShowCanvasPanel(!showCanvasPanel); }}
            className={`w-12 h-12 rounded-2xl flex items-center justify-center border shadow-xl backdrop-blur-sm pointer-events-auto select-none transition-all active:scale-95 ${
              showCanvasPanel ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-300' : 'bg-white/5 border-white/10 text-white hover:bg-white/10'
            }`}
            title={isCanvasLoading ? '加载中...' : canvasName}
        >
            <Icons.Layout className="w-5 h-5" />
        </button>

        {/* 手动保存按钮 */}
        {onManualSave && (
            <button 
                onClick={(e) => { e.stopPropagation(); onManualSave(); }}
                className={`w-12 h-12 rounded-2xl flex items-center justify-center border shadow-xl backdrop-blur-sm pointer-events-auto select-none transition-all active:scale-95 relative ${
                    hasUnsavedChanges
                        ? 'bg-orange-500/20 border-orange-500/30 text-orange-300 animate-pulse'
                        : 'bg-white/5 border-white/10 text-white hover:bg-white/10'
                }`}
                title={hasUnsavedChanges ? "有未保存的修改，点击保存" : "保存画布"}
            >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                </svg>
                {hasUnsavedChanges && (
                    <div className="absolute -top-1 -right-1 w-3 h-3 bg-orange-500 rounded-full border-2 border-[#1c1c1e]" />
                )}
            </button>
        )}

        {/* Main Dock */}
        <div 
            className="bg-[#1c1c1e]/95 backdrop-blur-xl border border-white/10 p-2 rounded-2xl flex flex-col gap-2 shadow-2xl pointer-events-auto items-center"
            onMouseDown={(e) => {
                // 只在点击在 dock 背景上时阻止传播，不阻止拖拽事件
                if (e.target === e.currentTarget) {
                    e.stopPropagation();
                }
            }}
        >
            
            {/* Library Toggle */}
            <button 
                onClick={(e) => { e.stopPropagation(); setActiveLibrary(!activeLibrary); }}
                className={`p-2.5 rounded-xl transition-all shadow-inner border flex items-center justify-center mb-1
                    ${activeLibrary ? 'bg-purple-500/20 text-purple-300 border-purple-500/50' : 'bg-white/5 text-zinc-400 border-transparent hover:text-white hover:bg-white/15'}
                `}
                title="Creative Library"
            >
                <Icons.Layers size={18} />
            </button>

            <div className="w-8 h-px bg-white/10 my-1" />

            {/* Media Group */}
            <div className="flex flex-col gap-1.5">
                <span className="text-[9px] font-bold text-zinc-600 text-center uppercase tracking-wider">Media</span>
                <DraggableButton
                    type="image"
                    icon={<Icons.Image />}
                    label="Image"
                    onDragStart={onDragStart}
                    onClick={() => onAdd('image')}
                    onImageSuggestionClick={(kind, e) => openComposerAt(kind, e.clientX, e.clientY)}
                />
                <DraggableButton type="text" icon={<Icons.Type />} label="Text" onDragStart={onDragStart} onClick={() => onAdd('text')} />
                <DraggableButton type="video" icon={<Icons.Video />} label="Video" onDragStart={onDragStart} onClick={() => onAdd('video')} />
            </div>
            
            <div className="w-8 h-px bg-white/10 my-1" />
            
            {/* Logic Group */}
            <div className="flex flex-col gap-1.5">
                <span className="text-[9px] font-bold text-zinc-600 text-center uppercase tracking-wider">Logic</span>
                <DraggableButton type="llm" icon={<Icons.Sparkles />} label="LLM / Vision" onDragStart={onDragStart} onClick={() => onAdd('llm')} />
                <DraggableButton type="idea" icon={<Icons.Magic />} label="Idea Gen" onDragStart={onDragStart} onClick={() => onAdd('idea')} />
                <DraggableButton type="relay" icon={<Icons.Relay />} label="Relay" onDragStart={onDragStart} onClick={() => onAdd('relay')} />
                <DraggableButton type="edit" icon={<BananaIcon />} label="Magic" onDragStart={onDragStart} onClick={() => onAdd('edit')} />
            </div>

            <div className="w-8 h-px bg-white/10 my-1" />
            
            {/* Tools Group */}
            <div className="flex flex-col gap-1.5">
                <span className="text-[9px] font-bold text-zinc-600 text-center uppercase tracking-wider">Tools</span>
                <DraggableButton type="remove-bg" icon={<Icons.Scissors />} label="Remove BG" onDragStart={onDragStart} onClick={() => onAdd('remove-bg')} />
                <DraggableButton type="upscale" icon={<Icons.Upscale />} label="Upscale" onDragStart={onDragStart} onClick={() => onAdd('upscale')} />
                <DraggableButton type="resize" icon={<Icons.Resize />} label="Resize" onDragStart={onDragStart} onClick={() => onAdd('resize')} />
            </div>

        </div>
        </div>

        {/* 浮动生成面板（可拖拽） */}
        {floatingComposer && (
            <div
                data-floating-composer-root
                className="fixed z-[120] rounded-2xl border border-white/10 bg-[#1f1f22]/95 backdrop-blur-xl shadow-2xl force-white-text"
                style={{ left: floatingComposer.x, top: floatingComposer.y, width: 780, color: '#fff' }}
                onMouseDown={(e) => {
                    // 点击面板本身不影响画布拖拽
                    e.stopPropagation();
                }}
            >
                {/* 关闭按钮 - 固定在右上角 */}
                <button
                    type="button"
                    className="absolute top-3 right-3 z-10 w-8 h-8 rounded-xl text-white/60 hover:text-white hover:bg-white/10 transition"
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                        e.stopPropagation();
                        const aid = floatingComposer?.anchorId;
                        setFloatingComposer(null);
                        if (aid) {
                          window.dispatchEvent(
                            new CustomEvent('pebbling-composer-dismiss', { detail: { anchorId: aid } })
                          );
                        }
                    }}
                    title="关闭"
                >
                    <Icons.Close size={14} />
                </button>

                {/* 生成结果预览（灰底示意区）- 移到最上面 */}
                <div className="px-4 pt-3 pb-3">
                  <div className="relative w-full overflow-hidden rounded-xl border border-white/10 bg-zinc-800/90 min-h-[200px] flex flex-col">
                    {/* 图片操作按钮行 - 在图片上方 */}
                    {composerPreviewMedia?.url && !composerPreviewMedia.isVideo && (
                      <div className="flex items-center justify-center gap-1.5 px-3 pt-2 pb-1 bg-black/30 border-b border-white/5">
                        <button
                          type="button"
                          className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] text-zinc-300 hover:text-white hover:bg-white/10 transition"
                          onClick={(e) => { e.stopPropagation(); /* TODO: 裁剪功能 */ }}
                          onMouseDown={(e) => e.stopPropagation()}
                          title="裁剪"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M6 2v14a2 2 0 0 0 2 2h14"/>
                            <path d="M18 22V8a2 2 0 0 0-2-2H2"/>
                          </svg>
                          裁剪
                        </button>
                        <button
                          type="button"
                          className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] text-zinc-300 hover:text-white hover:bg-white/10 transition"
                          onClick={(e) => { e.stopPropagation(); handleComposerSubmit(); }}
                          onMouseDown={(e) => e.stopPropagation()}
                          title="重新生成"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
                            <path d="M3 3v5h5"/>
                            <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/>
                            <path d="M16 21h5v-5"/>
                          </svg>
                          重新生成
                        </button>
                        <button
                          type="button"
                          className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] text-zinc-300 hover:text-white hover:bg-white/10 transition"
                          onClick={(e) => { e.stopPropagation(); /* TODO: 扩图功能 */ }}
                          onMouseDown={(e) => e.stopPropagation()}
                          title="扩图"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M15 3h6v6"/>
                            <path d="M9 21H3v-6"/>
                            <path d="M21 3l-7 7"/>
                            <path d="M3 21l7-7"/>
                          </svg>
                          扩图
                        </button>
                        <button
                          type="button"
                          className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] text-zinc-300 hover:text-white hover:bg-white/10 transition"
                          onClick={(e) => { e.stopPropagation(); 
                            if (composerPreviewMedia?.url) {
                              const link = document.createElement('a');
                              link.href = composerPreviewMedia.url;
                              link.download = `generated_${Date.now()}.png`;
                              link.click();
                            }
                          }}
                          onMouseDown={(e) => e.stopPropagation()}
                          title="下载"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                            <polyline points="7 10 12 15 17 10"/>
                            <line x1="12" y1="15" x2="12" y2="3"/>
                          </svg>
                          下载
                        </button>
                        <button
                          type="button"
                          className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] text-zinc-300 hover:text-white hover:bg-white/10 transition"
                          onClick={(e) => { e.stopPropagation(); /* TODO: 全屏功能 */ }}
                          onMouseDown={(e) => e.stopPropagation()}
                          title="全屏"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M8 3H5a2 2 0 0 0-2 2v3"/>
                            <path d="M21 8V5a2 2 0 0 0-2-2h-3"/>
                            <path d="M3 16v3a2 2 0 0 0 2 2h3"/>
                            <path d="M16 21h3a2 2 0 0 0 2-2v-3"/>
                          </svg>
                          全屏
                        </button>
                      </div>
                    )}
                    <div className="flex items-center gap-1.5 px-3 pt-2 pb-1 text-[11px] text-zinc-400">
                      <Icons.Image size={12} className="opacity-70" />
                      <span>图片生成</span>
                      {floatingComposer?.sourceImageUrl ? (
                        <span className="text-zinc-500">· 已连接画布图片</span>
                      ) : null}
                    </div>
                    <div className="relative flex-1 min-h-[140px] flex items-center justify-center mx-2 mb-2 rounded-lg bg-zinc-900/80 border border-white/5">
                      {composerGenerating && (
                        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/40 backdrop-blur-[1px]">
                          <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        </div>
                      )}
                      {composerPreviewMedia?.url ? (
                        composerPreviewMedia.isVideo ? (
                          <video
                            src={composerPreviewMedia.url}
                            className="max-h-[200px] w-full object-contain"
                            controls
                            muted
                            playsInline
                          />
                        ) : (
                          <img
                            src={composerPreviewMedia.url}
                            alt="生成预览"
                            className="max-h-[200px] w-full object-contain"
                          />
                        )
                      ) : floatingComposer?.sourceImageUrl ? (
                        <div className="flex flex-col items-center justify-center gap-2 p-4 w-full">
                          <img
                            src={floatingComposer.sourceImageUrl}
                            alt="参考"
                            className="max-h-[100px] max-w-[90%] object-contain opacity-60 rounded"
                          />
                          <span className="text-[11px] text-zinc-500">生成结果将显示在此处</span>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center gap-2 text-zinc-500">
                          <Icons.Image size={40} className="opacity-25" />
                          <span className="text-[11px]">生成结果将显示在此处</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* 风格选项区 */}
                <div
                    className="flex items-center px-4 pt-2 pb-3 cursor-move select-none"
                    onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        draggingComposerRef.current = {
                            startX: e.clientX,
                            startY: e.clientY,
                            originX: floatingComposer.x,
                            originY: floatingComposer.y,
                        };
                    }}
                >
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            className="composer-style-btn flex h-12 w-12 shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl bg-[#2c2c30] text-[#a3a3a8] transition hover:bg-[#36363a] hover:text-[#b8b8bd] active:scale-[0.98]"
                            title="风格"
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                                e.stopPropagation();
                                openStylePicker();
                            }}
                        >
                            <span className="text-[15px] font-light leading-none tracking-tight" aria-hidden>
                                +
                            </span>
                            <span className="text-[10px] font-medium leading-none">风格</span>
                        </button>
                        <div className="text-[11px] text-white !text-white ml-2">模式：{floatingTitle}</div>
                    </div>
                </div>

                {/* 输入区域 */}
                <div className="px-4 pb-3">
                    <textarea
                        ref={composerTextareaRef}
                        className="w-full bg-transparent outline-none resize-none text-sm leading-6 text-white !text-white placeholder:text-white placeholder:!text-white"
                        style={{ minHeight: 64 }}
                        placeholder="输入描述或技巧 / 呼出指令（Shift+Enter 发送，Enter 换行）"
                        value={composerInputText}
                        onChange={(e) => setComposerInputText(e.target.value)}
                        onMouseDown={(e) => e.stopPropagation()}
                    />
                </div>

                {/* 底部参数栏 */}
                <div className="px-4 pb-4 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 text-[12px] text-white !text-white">
                        <button
                            type="button"
                            className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-white/5 transition relative"
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                                e.stopPropagation();
                                setShowModelMenu((prev) => !prev);
                                setShowImageSizePanel(false);
                                setShowGenerationMenu(false);
                            }}
                        >
                            <span className="text-white !text-white">✦</span>
                            {modelBase === 'doubao' ? '闭源豆包大模型' : '开源 ComfyUI'}
                            <span className="text-white !text-white">▼</span>
                            {showModelMenu && (
                                <div
                                    className="absolute left-0 top-10 w-44 rounded-lg border border-white/10 bg-[#1c1c1e]/95 backdrop-blur-xl shadow-xl overflow-hidden z-10"
                                    onMouseDown={(e) => e.stopPropagation()}
                                >
                                    <button
                                        type="button"
                                        className={`w-full px-3 py-2 text-left text-[12px] transition ${
                                            modelBase === 'doubao' ? 'bg-white/15 text-white' : 'text-white hover:bg-white/10'
                                        }`}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setModelBase('doubao');
                                            setShowModelMenu(false);
                                        }}
                                    >
                                        闭源豆包大模型
                                    </button>
                                    <button
                                        type="button"
                                        className={`w-full px-3 py-2 text-left text-[12px] transition ${
                                            modelBase === 'comfyui' ? 'bg-white/15 text-white' : 'text-white hover:bg-white/10'
                                        }`}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setModelBase('comfyui');
                                            setShowModelMenu(false);
                                        }}
                                    >
                                        开源 ComfyUI
                                    </button>
                                </div>
                            )}
                        </button>
                        <button
                            type="button"
                            className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-white/5 transition relative min-w-[100px]"
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                                e.stopPropagation();
                                setShowImageSizePanel((prev) => !prev);
                                setShowModelMenu(false);
                                setShowGenerationMenu(false);
                            }}
                        >
                            <span className="text-white !text-white">⟳</span>
                            <span className="text-white !text-white truncate">{resolutionButtonLabel}</span>
                            <span className="text-white !text-white">▼</span>
                        </button>
                    </div>

                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            className="px-3 py-1.5 rounded-lg text-[12px] text-white hover:bg-white/5 transition relative"
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                                e.stopPropagation();
                                setShowGenerationMenu((prev) => !prev);
                                setShowModelMenu(false);
                                setShowImageSizePanel(false);
                            }}
                        >
                            {generationCount}x <span className="text-white !text-white">▼</span>
                            {showGenerationMenu && (
                                <div
                                    className="absolute right-0 top-10 w-20 rounded-lg border border-white/10 bg-[#1c1c1e]/95 backdrop-blur-xl shadow-xl overflow-hidden z-10"
                                    onMouseDown={(e) => e.stopPropagation()}
                                >
                                    {[1, 2, 4].map((count) => (
                                        <button
                                            key={count}
                                            type="button"
                                            className={`w-full px-3 py-1.5 text-left text-[12px] transition ${
                                                generationCount === count ? 'bg-white/15 text-white' : 'text-white hover:bg-white/10'
                                            }`}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setGenerationCount(count as 1 | 2 | 4);
                                                setShowGenerationMenu(false);
                                            }}
                                        >
                                            {count}x
                                        </button>
                                    ))}
                                </div>
                            )}
                        </button>
                        <button
                            type="button"
                            disabled={composerGenerating}
                            className={`h-10 w-14 rounded-full border border-white/10 flex items-center justify-center text-white transition ${
                              composerGenerating ? 'bg-white/5 opacity-70 cursor-wait' : 'bg-white/10 hover:bg-white/15'
                            }`}
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                                e.stopPropagation();
                                if (composerGenerating) return;
                                setShowGenerationMenu(false);
                                setShowModelMenu(false);
                                setShowImageSizePanel(false);
                                handleComposerSubmit();
                            }}
                            title={composerGenerating ? '生成中…' : '发送'}
                        >
                            {composerGenerating ? (
                              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            ) : (
                              <Icons.ArrowRight size={18} />
                            )}
                        </button>
                    </div>
                </div>

                <div className="px-3 pb-3">
                    <button
                        type="button"
                        className="w-full rounded-xl border border-white/[0.14] bg-[#0a0a0c] py-2.5 text-center text-[12px] font-medium text-white/95 shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_5px_16px_rgba(0,0,0,0.55)] transition hover:bg-[#101012] hover:border-white/20 active:scale-[0.99]"
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                            e.stopPropagation();
                            setAdvancedPanelPos({
                                x: Math.max(24, floatingComposer.x + 60),
                                y: Math.max(24, floatingComposer.y + 40),
                            });
                            setShowAdvancedParamsPanel(true);
                        }}
                    >
                        高级设置
                    </button>
                </div>
            </div>
        )}

        {/* 高级生成参数控制浮窗（可拖拽） */}
        {showAdvancedParamsPanel && (
            <div
                className="fixed z-[140] w-[360px] rounded-2xl border border-white/10 bg-[#1f2024]/95 backdrop-blur-xl shadow-2xl pointer-events-auto force-white-text"
                style={{ left: advancedPanelPos.x, top: advancedPanelPos.y }}
                onMouseDown={(e) => e.stopPropagation()}
            >
                <div
                    className="px-4 py-3 border-b border-white/10 flex items-center justify-between cursor-move select-none"
                    onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        draggingAdvancedPanelRef.current = {
                            startX: e.clientX,
                            startY: e.clientY,
                            originX: advancedPanelPos.x,
                            originY: advancedPanelPos.y,
                        };
                    }}
                >
                    <span className="text-sm font-semibold text-white !text-white">高级生成参数</span>
                    <button
                        type="button"
                        className="w-7 h-7 rounded-md text-white hover:bg-white/10 transition"
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                            e.stopPropagation();
                            setShowAdvancedParamsPanel(false);
                        }}
                    >
                        <Icons.Close size={14} />
                    </button>
                </div>

                <div className="p-4 space-y-4">
                    <div>
                        <div className="flex items-center justify-between mb-1 text-[12px] text-white !text-white">
                            <span>采样步数 (Steps)</span>
                            <span className="text-white">{steps}</span>
                        </div>
                        <input
                            type="range"
                            min={10}
                            max={60}
                            step={1}
                            value={steps}
                            className="w-full accent-blue-400"
                            onChange={(e) => setSteps(Number(e.target.value))}
                            onMouseDown={(e) => e.stopPropagation()}
                        />
                    </div>

                    <div>
                        <div className="flex items-center justify-between mb-1 text-[12px] text-white !text-white">
                            <span>提示词强度 (CFG)</span>
                            <span className="text-white">{cfgScale}</span>
                        </div>
                        <input
                            type="range"
                            min={1}
                            max={20}
                            step={0.5}
                            value={cfgScale}
                            className="w-full accent-blue-400"
                            onChange={(e) => setCfgScale(Number(e.target.value))}
                            onMouseDown={(e) => e.stopPropagation()}
                        />
                    </div>

                    <div>
                        <label className="block mb-1 text-[12px] text-white !text-white">采样器</label>
                        <button
                            type="button"
                            className="w-full px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-sm text-white flex items-center justify-between hover:bg-black/50 transition relative"
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                                e.stopPropagation();
                                setShowSamplerMenu((prev) => !prev);
                            }}
                        >
                            <span className="text-white !text-white">{sampler}</span>
                            <span className="text-white !text-white">▼</span>
                            {showSamplerMenu && (
                                <div
                                    className="absolute left-0 top-10 w-full rounded-lg border border-white/10 bg-[#1c1c1e]/95 backdrop-blur-xl shadow-xl overflow-hidden z-10"
                                    onMouseDown={(e) => e.stopPropagation()}
                                >
                                    {(['Euler', 'DPM++ 2M', 'DDIM'] as SamplerType[]).map((opt) => (
                                        <button
                                            key={opt}
                                            type="button"
                                            className={`w-full px-3 py-2 text-left text-[12px] transition ${
                                                sampler === opt ? 'bg-white/15 text-white' : 'text-white hover:bg-white/10'
                                            }`}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setSampler(opt);
                                                setShowSamplerMenu(false);
                                            }}
                                        >
                                            {opt}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </button>
                    </div>

                    <div>
                        <label className="block mb-1 text-[12px] text-white !text-white">随机种子 (Seed)</label>
                        <input
                            type="text"
                            value={seed}
                            placeholder="留空则随机"
                            className="w-full px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-sm text-white !text-white outline-none placeholder:text-white placeholder:!text-white"
                            onChange={(e) => setSeed(e.target.value)}
                            onMouseDown={(e) => e.stopPropagation()}
                        />
                    </div>
                </div>
            </div>
        )}

        {/* 画质 / 比例选择浮窗 */}
        {showImageSizePanel && (
            <>
                <div
                    className="fixed inset-0 z-[124] bg-black/50"
                    onMouseDown={(e) => {
                        e.stopPropagation();
                        setShowImageSizePanel(false);
                    }}
                />
                <div
                    className="fixed z-[125] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(92vw,440px)] rounded-2xl border border-white/12 bg-black shadow-2xl p-4 pointer-events-auto force-white-text text-white"
                    onMouseDown={(e) => e.stopPropagation()}
                >
                    <div className="text-[13px] font-semibold text-white/95 mb-3">画质</div>
                    <div className="flex rounded-xl bg-black/35 p-1 mb-5 gap-1">
                        {(['1k', '2k', '4k'] as ImageQuality[]).map((q) => {
                            const label = q === '1k' ? '1K' : q === '2k' ? '2K' : '4K';
                            const active = imageQuality === q;
                            return (
                                <button
                                    key={q}
                                    type="button"
                                    className={`flex-1 py-2 rounded-lg text-[13px] font-medium transition ${
                                        active ? 'bg-white/20 text-white shadow-inner' : 'text-white/55 hover:text-white/90 hover:bg-white/5'
                                    }`}
                                    onClick={() => setImageQuality(q)}
                                >
                                    {label}
                                </button>
                            );
                        })}
                    </div>
                    <div className="text-[13px] font-semibold text-white/95 mb-3">比例</div>
                    <div className="flex gap-3 items-start">
                        <button
                            type="button"
                            onClick={() => setAspectRatio('auto')}
                            className={`flex flex-col items-center justify-center w-[76px] shrink-0 rounded-xl border py-3 px-2 transition ${
                                aspectRatio === 'auto'
                                    ? 'bg-white/18 border-white/25 text-white'
                                    : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10'
                            }`}
                        >
                            <div className="w-9 h-9 rounded-md border-2 border-dashed border-white/35 flex items-center justify-center mb-1.5">
                                <div className="w-4 h-4 border border-white/45 rounded-sm bg-white/5" />
                            </div>
                            <span className="text-[11px] leading-tight text-center">自适应</span>
                        </button>
                        <div className="grid grid-cols-5 gap-2 flex-1 min-w-0">
                            {GRID_ASPECT_RATIOS.map((r) => {
                                const active = aspectRatio === r;
                                return (
                                    <button
                                        key={r}
                                        type="button"
                                        onClick={() => setAspectRatio(r)}
                                        className={`flex flex-col items-center gap-1 rounded-lg border py-2 px-1 transition ${
                                            active
                                                ? 'bg-white/18 border-white/25'
                                                : 'bg-white/5 border-white/10 hover:bg-white/10'
                                        }`}
                                    >
                                        <MiniAspectIcon ratio={r} />
                                        <span className="text-[10px] text-white/90 font-medium">{r}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                    <div className="mt-4 flex justify-end">
                        <button
                            type="button"
                            className="px-4 py-1.5 rounded-lg bg-white/15 text-sm text-white hover:bg-white/25"
                            onClick={() => setShowImageSizePanel(false)}
                        >
                            完成
                        </button>
                    </div>
                </div>
            </>
        )}

        {/* 风格选择浮窗（可拖拽） */}
        {showStylePicker && (
            <div
                className="fixed z-[130] rounded-2xl border border-white/10 bg-[#222326]/95 backdrop-blur-xl shadow-2xl pointer-events-auto force-white-text text-white"
                style={{
                    left: stylePickerPos.x,
                    top: stylePickerPos.y,
                    width: '86vw',
                    maxWidth: 980,
                    height: '82vh',
                    maxHeight: 660,
                    minHeight: 460
                }}
                onMouseDown={(e) => e.stopPropagation()}
            >
                <div
                    className="px-5 pt-4 pb-3 border-b border-white/10 flex items-center justify-between cursor-move select-none"
                    onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        draggingStylePickerRef.current = {
                            startX: e.clientX,
                            startY: e.clientY,
                            originX: stylePickerPos.x,
                            originY: stylePickerPos.y,
                        };
                    }}
                >
                    <div className="text-white text-lg font-semibold">选择风格资产</div>
                    <button
                        type="button"
                        className="w-7 h-7 rounded-md text-white hover:bg-white/10 transition"
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                            e.stopPropagation();
                            setShowStylePicker(false);
                        }}
                    >
                        <Icons.Close size={14} />
                    </button>
                </div>

                <div className="px-4 py-3 border-b border-white/10 flex items-center gap-2 overflow-x-auto">
                    {(['all', '人物', '场景', '物品', '风格', '音效', '其他'] as StyleCategory[]).map((category) => (
                        <button
                            key={category}
                            type="button"
                            className={`px-3 py-1 rounded-full text-xs border transition ${
                                styleCategory === category
                                    ? 'bg-white/20 border-white/30 text-white'
                                    : 'bg-white/5 border-transparent text-white hover:bg-white/10'
                            }`}
                            onClick={() => setStyleCategory(category)}
                        >
                            {category === 'all' ? '全部' : category}
                        </button>
                    ))}
                </div>

                <div className="p-4 h-[calc(82vh-118px)] max-h-[542px] overflow-y-auto">
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                        {styleAssets
                            .filter((item) => styleCategory === 'all' || item.category === styleCategory)
                            .map((item) => {
                                const isActive = item.id === selectedStyleId;
                                return (
                                    <button
                                        key={item.id}
                                        type="button"
                                        className={`group rounded-xl border text-left overflow-hidden transition ${
                                            isActive
                                                ? 'border-white/50 bg-white/10'
                                                : 'border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/20'
                                        }`}
                                        onClick={() => setSelectedStyleId(item.id)}
                                    >
                                        <div className="h-36 bg-gradient-to-br from-slate-600 to-slate-800 relative">
                                            {item.preview ? (
                                                <img src={item.preview} alt={item.name} className="w-full h-full object-cover" />
                                            ) : (
                                                <div className="w-full h-full bg-gradient-to-br from-zinc-400/40 to-zinc-800/55" />
                                            )}
                                            <div className="absolute inset-x-0 bottom-0 p-2 text-xs text-white bg-gradient-to-t from-black/55 to-transparent">
                                                {item.name}
                                            </div>
                                        </div>
                                        <div className="px-2 py-1.5 text-[11px] text-white">
                                            {item.category}
                                        </div>
                                    </button>
                                );
                            })}
                    </div>
                </div>
            </div>
        )}

        {/* 画布管理面板 */}
        {showCanvasPanel && (
            <div 
                className="fixed left-24 top-6 z-30 w-72 bg-[#1c1c1e]/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden animate-in slide-in-from-left-4 fade-in duration-300 pointer-events-auto"
                onMouseDown={(e) => e.stopPropagation()}
            >
                {/* 头部 */}
                <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Icons.Layout size={14} className="text-emerald-400"/>
                        <span className="text-sm font-bold text-white">画布管理</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <button 
                            onClick={(e) => { e.stopPropagation(); onCreateCanvas(); }}
                            className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 transition-colors"
                            title="新增画布"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                        </button>
                        <button 
                            onClick={() => setShowCanvasPanel(false)} 
                            className="text-zinc-500 hover:text-white"
                        >
                            <Icons.Close size={14}/>
                        </button>
                    </div>
                </div>
                
                {/* 当前画布 */}
                <div className="px-4 py-2 bg-emerald-500/5 border-b border-white/5">
                    <div className="text-[10px] text-zinc-500 mb-1">当前画布</div>
                    {isEditingName ? (
                        <input
                            type="text"
                            value={editingName}
                            onChange={(e) => setEditingName(e.target.value)}
                            onBlur={() => {
                                if (editingName.trim() && editingName !== canvasName) {
                                    onRenameCanvas(editingName);
                                }
                                setIsEditingName(false);
                            }}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    if (editingName.trim() && editingName !== canvasName) {
                                        onRenameCanvas(editingName);
                                    }
                                    setIsEditingName(false);
                                } else if (e.key === 'Escape') {
                                    setIsEditingName(false);
                                }
                            }}
                            autoFocus
                            className="w-full bg-white/10 border border-emerald-500/30 rounded px-2 py-1 text-sm text-white outline-none focus:border-emerald-500"
                        />
                    ) : (
                        <div 
                            className="flex items-center gap-2 group cursor-pointer"
                            onClick={() => {
                                setEditingName(canvasName);
                                setIsEditingName(true);
                            }}
                        >
                            <span className="text-sm text-white font-medium truncate flex-1">
                                {isCanvasLoading ? '加载中...' : canvasName}
                            </span>
                            <svg className="w-3.5 h-3.5 text-zinc-500 opacity-0 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                            </svg>
                        </div>
                    )}
                </div>

                {/* 画布列表 */}
                <div className="max-h-80 overflow-y-auto" onWheel={(e) => e.stopPropagation()}>
                    {canvasList.length === 0 ? (
                        <div className="p-4 text-center text-zinc-500 text-sm">暂无画布</div>
                    ) : (
                        canvasList
                            .sort((a, b) => b.updatedAt - a.updatedAt)
                            .map(canvas => (
                                <div
                                    key={canvas.id}
                                    className={`px-4 py-2.5 flex items-center justify-between group hover:bg-white/5 cursor-pointer border-b border-white/5 last:border-b-0 ${
                                        canvas.id === currentCanvasId ? 'bg-emerald-500/10' : ''
                                    }`}
                                    onClick={() => {
                                        if (canvas.id !== currentCanvasId) {
                                            onLoadCanvas(canvas.id);
                                            setShowCanvasPanel(false);
                                        }
                                    }}
                                >
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm text-zinc-200 truncate flex items-center gap-2">
                                            {canvas.name}
                                            {canvas.id === currentCanvasId && (
                                                <span className="text-[9px] bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 rounded-full">当前</span>
                                            )}
                                        </div>
                                        <div className="text-[10px] text-zinc-500 mt-0.5">
                                            {canvas.nodeCount} 个节点 · {new Date(canvas.updatedAt).toLocaleDateString()}
                                        </div>
                                    </div>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            if (confirm(`确定删除画布「${canvas.name}」吗？`)) {
                                                onDeleteCanvas(canvas.id);
                                            }
                                        }}
                                        className="p-1.5 rounded opacity-0 group-hover:opacity-100 hover:bg-red-500/20 text-zinc-500 hover:text-red-400 transition-all"
                                        title="删除画布"
                                    >
                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                        </svg>
                                    </button>
                                </div>
                            ))
                    )}
                </div>

                {/* 底部操作 */}
                <div className="px-4 py-2 border-t border-white/10 bg-white/5">
                    <button 
                        onClick={(e) => { e.stopPropagation(); onHome(); }}
                        className="w-full py-1.5 text-xs text-zinc-400 hover:text-white transition-colors flex items-center justify-center gap-1.5"
                    >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                        </svg>
                        重置视图
                    </button>
                </div>
            </div>
        )}

        {/* Library Drawer */}
        {activeLibrary && ((() => {
            // 筛选创意库
            const filteredIdeas = creativeIdeas.filter(idea => {
                if (libraryFilter === 'all') return true;
                if (libraryFilter === 'favorite') return idea.isFavorite;
                if (libraryFilter === 'bp') return idea.isBP;
                if (libraryFilter === 'workflow') return idea.isWorkflow;
                return true;
            });
            
            return (
            <div 
                className="fixed left-24 top-1/2 -translate-y-1/2 z-30 h-[600px] w-80 bg-[#1c1c1e]/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl p-4 flex flex-col gap-3 animate-in slide-in-from-left-4 fade-in duration-300 pointer-events-auto"
                onMouseDown={(e) => e.stopPropagation()}
            >
                {/* 头部 */}
                <div className="flex items-center justify-between pb-2 border-b border-white/10">
                    <h2 className="text-sm font-bold text-white flex items-center gap-2">
                        <Icons.Layers size={14} className="text-purple-400"/> 
                        创意库
                        <span className="text-[10px] text-zinc-500 font-normal">({creativeIdeas.length})</span>
                    </h2>
                    <button onClick={() => setActiveLibrary(false)} className="text-zinc-500 hover:text-white"><Icons.Close size={14}/></button>
                </div>
                
                {/* 筛选按钮 */}
                <div className="flex gap-1 flex-wrap">
                    {[
                        { key: 'all', label: '全部' },
                        { key: 'favorite', label: '⭐' },
                        { key: 'bp', label: 'BP' },
                        { key: 'workflow', label: '📊' },
                    ].map(({ key, label }) => (
                        <button
                            key={key}
                            onClick={() => setLibraryFilter(key as typeof libraryFilter)}
                            className={`px-2 py-1 text-[10px] rounded-lg transition-all ${
                                libraryFilter === key 
                                    ? 'bg-purple-500/30 text-purple-200 border border-purple-500/50' 
                                    : 'bg-white/5 text-zinc-400 hover:bg-white/10 border border-transparent'
                            }`}
                        >
                            {label}
                        </button>
                    ))}
                </div>
                
                {/* 创意列表 */}
                <div className="flex-1 overflow-y-auto pr-1 scrollbar-hide space-y-2" onWheel={(e) => e.stopPropagation()}>
                    {filteredIdeas.length === 0 ? (
                        <div className="text-center py-8 text-zinc-500 text-xs">
                            暂无创意
                        </div>
                    ) : (
                        filteredIdeas.map((idea) => (
                            <div 
                                key={idea.id} 
                                className="group relative"
                                onMouseEnter={() => setHoveredIdeaId(idea.id)}
                                onMouseLeave={() => setHoveredIdeaId(null)}
                            >
                                <button 
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onApplyCreativeIdea?.(idea);
                                        setActiveLibrary(false);
                                    }}
                                    className={`w-full text-left p-2 rounded-xl border transition-all ${
                                        idea.isWorkflow 
                                            ? 'bg-purple-500/10 border-purple-500/20 hover:bg-purple-500/20 hover:border-purple-500/40'
                                            : idea.isBP
                                            ? 'bg-blue-500/10 border-blue-500/20 hover:bg-blue-500/20 hover:border-blue-500/40'
                                            : 'bg-white/5 border-white/5 hover:bg-white/10 hover:border-white/20'
                                    }`}
                                >
                                    <div className="flex gap-2">
                                        {/* 预览图 */}
                                        {idea.imageUrl && (
                                            <div className="w-12 h-12 flex-shrink-0 rounded-lg overflow-hidden bg-black/20">
                                                <img src={idea.imageUrl} alt="" className="w-full h-full object-cover" />
                                            </div>
                                        )}
                                        <div className="flex-1 min-w-0">
                                            {/* 标题行 */}
                                            <div className="flex items-center justify-between mb-0.5">
                                                <div className="font-bold text-xs text-white truncate flex-1 mr-2">
                                                    {idea.isFavorite && <span className="mr-1">⭐</span>}
                                                    {idea.title}
                                                </div>
                                                <div className="flex items-center gap-1">
                                                    {idea.isWorkflow && (
                                                        <span className="text-[8px] bg-purple-500/30 text-purple-200 px-1 py-0.5 rounded">工作流</span>
                                                    )}
                                                    {idea.isBP && (
                                                        <span className="text-[8px] bg-blue-500/30 text-blue-200 px-1 py-0.5 rounded">BP</span>
                                                    )}
                                                </div>
                                            </div>
                                            
                                            {/* 描述/提示词预览 */}
                                            <div className="text-[9px] text-zinc-400 leading-relaxed line-clamp-2">
                                                {idea.isBP && idea.bpFields ? (
                                                    <span className="text-zinc-500">
                                                        输入: {idea.bpFields.map(f => f.label).join(', ')}
                                                    </span>
                                                ) : idea.isWorkflow && idea.workflowNodes ? (
                                                    <span className="text-zinc-500">
                                                        {idea.workflowNodes.length} 个节点
                                                    </span>
                                                ) : (
                                                    idea.prompt.slice(0, 50) + (idea.prompt.length > 50 ? '...' : '')
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </button>
                                
                                {/* Hover 详情 */}
                                {hoveredIdeaId === idea.id && (
                                    <div className="absolute left-full top-0 ml-2 w-64 bg-[#1c1c1e] border border-white/10 rounded-xl p-3 shadow-2xl z-50 pointer-events-none animate-in fade-in slide-in-from-left-2 duration-150">
                                        {/* 缩略图 */}
                                        {idea.imageUrl && (
                                            <div className="w-full h-24 rounded-lg overflow-hidden mb-2 bg-black/20">
                                                <img src={idea.imageUrl} alt="" className="w-full h-full object-cover" />
                                            </div>
                                        )}
                                        <div className="text-xs font-bold text-white mb-1">{idea.title}</div>
                                        {idea.isBP && idea.bpFields ? (
                                            <div className="space-y-1">
                                                <div className="text-[10px] text-zinc-500">输入字段:</div>
                                                {idea.bpFields.map((field, i) => (
                                                    <div key={i} className="text-[10px] text-blue-300 bg-blue-500/10 px-2 py-1 rounded">
                                                        {field.label}
                                                    </div>
                                                ))}
                                            </div>
                                        ) : idea.isWorkflow && idea.workflowInputs ? (
                                            <div className="space-y-1">
                                                <div className="text-[10px] text-zinc-500">工作流输入:</div>
                                                {idea.workflowInputs.map((input, i) => (
                                                    <div key={i} className="text-[10px] text-purple-300 bg-purple-500/10 px-2 py-1 rounded">
                                                        {input.label}
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="text-[10px] text-zinc-400 leading-relaxed max-h-32 overflow-y-auto" onWheel={(e) => e.stopPropagation()}>
                                                {idea.prompt}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        ))
                    )}
                </div>
                
                {/* 底部快捷预设 */}
                {userPresets.length > 0 && (
                    <div className="pt-2 border-t border-white/10">
                        <h3 className="text-[10px] font-bold uppercase text-zinc-500 mb-2 tracking-wider">画布预设</h3>
                        <div className="space-y-1 max-h-32 overflow-y-auto" onWheel={(e) => e.stopPropagation()}>
                            {userPresets.slice(0, 3).map((preset) => (
                                <button 
                                    key={preset.id}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onAddPreset(preset.id);
                                        setActiveLibrary(false);
                                    }}
                                    className="w-full text-left p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500/20 transition-all text-xs"
                                >
                                    <span className="text-emerald-200">{preset.title}</span>
                                    <span className="text-[9px] text-zinc-500 ml-2">({preset.nodes.length} 节点)</span>
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>
            );
        })())}
    </>
  );
};

const DraggableButton = ({
    type,
    icon,
    label,
    onDragStart,
    onClick,
    onImageSuggestionClick
}: {
    type: NodeType,
    icon: React.ReactNode,
    label: string,
    onDragStart: (t: NodeType) => void,
    onClick: () => void,
    onImageSuggestionClick?: (kind: ImageSuggestionKind, e: React.MouseEvent<HTMLButtonElement>) => void
}) => {
    const [isDragging, setIsDragging] = React.useState(false);
    const startPosRef = React.useRef({ x: 0, y: 0 });
    
    const handleMouseDown = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        startPosRef.current = { x: e.clientX, y: e.clientY };
        
        const handleMouseMove = (moveE: MouseEvent) => {
            const dx = moveE.clientX - startPosRef.current.x;
            const dy = moveE.clientY - startPosRef.current.y;
            // 移动超过 5px 才算拖拽
            if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
                if (!isDragging) {
                    setIsDragging(true);
                    console.log('[Sidebar] Mouse drag start:', type);
                    (window as any).__draggingNodeType = type;
                    (window as any).__dragMousePos = { x: moveE.clientX, y: moveE.clientY };
                }
                (window as any).__dragMousePos = { x: moveE.clientX, y: moveE.clientY };
            }
        };
        
        const handleMouseUp = (upE: MouseEvent) => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            
            const dx = upE.clientX - startPosRef.current.x;
            const dy = upE.clientY - startPosRef.current.y;
            
            if (Math.abs(dx) <= 5 && Math.abs(dy) <= 5) {
                // 没有移动，算点击
                onClick();
            } else {
                // 拖拽结束，触发全局事件
                console.log('[Sidebar] Mouse drag end at:', upE.clientX, upE.clientY);
                (window as any).__dragMousePos = { x: upE.clientX, y: upE.clientY };
                // 触发自定义事件
                window.dispatchEvent(new CustomEvent('sidebar-drag-end', { 
                    detail: { type, x: upE.clientX, y: upE.clientY } 
                }));
            }
            
            setIsDragging(false);
            (window as any).__draggingNodeType = null;
        };
        
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    };
    
    return (
        <div
            onMouseDown={handleMouseDown}
            className="group relative cursor-grab active:cursor-grabbing select-none"
        >
            <div className="w-8 h-8 rounded-lg bg-white/5 text-zinc-400 hover:text-white hover:bg-white/15 hover:scale-105 transition-all shadow-inner border border-transparent hover:border-white/10 active:scale-95 flex items-center justify-center">
                 {React.isValidElement(icon) ? React.cloneElement(icon as React.ReactElement<any>, { size: 16 }) : icon}
            </div>
            {/* Hover tip / panel */}
            {type === 'image' ? (
                <div
                    className="absolute left-full top-1/2 -translate-y-1/2 ml-3 w-[260px] rounded-2xl border border-white/15 bg-[#222225]/95 backdrop-blur-xl shadow-2xl
                               opacity-0 group-hover:opacity-100 translate-x-[-6px] group-hover:translate-x-0 transition-all duration-150
                               pointer-events-auto z-50"
                    onMouseDown={(e) => {
                        // 防止触发外层 DraggableButton 的拖拽逻辑
                        e.preventDefault();
                        e.stopPropagation();
                    }}
                >
                    {/* 上方小标题：image（对齐截图位置感） */}
                    <div className="absolute -top-5 left-0 text-[12px] font-medium text-white/80">
                        image
                    </div>

                    <div className="px-4 py-3">
                        <div className="text-[11px] font-semibold text-white/50 mb-2">尝试：</div>
                        <div className="space-y-2.5">
                            {[
                                { kind: 'native-image' as const, text: '图生图', icon: <Icons.Upload size={14} className="text-white/35" /> },
                                { kind: 'native-video' as const, text: '图生视频', icon: <Icons.Upload size={14} className="text-white/35" /> },
                                { kind: 'remove-bg' as const, text: '图片换背景', icon: <svg width="14" height="14" viewBox="0 0 24 24" className="text-white/35" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M4 18L11 11"/><path d="M8 18L15 11"/><path d="M12 18L19 11"/></svg> },
                                { kind: 'enhance-details' as const, text: '首帧图生视频', icon: <Icons.Video size={14} className="text-white/35" /> },
                                { kind: 'expand-image' as const, text: '图片扩展', icon: <Icons.Expand size={14} className="text-white/35" /> },
                            ].map((item) => (
                                <button
                                    key={item.kind}
                                    type="button"
                                    className="w-full flex items-center gap-2 text-left text-[11px] text-white/35 hover:text-white/70 hover:bg-white/5 rounded-lg px-2 py-1 transition"
                                    onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        onImageSuggestionClick?.(item.kind, e);
                                    }}
                                >
                                    <span className="w-4 h-4 flex items-center justify-center">
                                        {item.icon}
                                    </span>
                                    <span className="truncate">{item.text}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            ) : (
                <div className="absolute left-full top-1/2 -translate-y-1/2 ml-3 px-2 py-1 bg-[#1c1c1e] border border-white/10 rounded text-[10px] font-medium text-white opacity-0 group-hover:opacity-100 transition-all pointer-events-none whitespace-nowrap z-50 shadow-lg translate-x-[-5px] group-hover:translate-x-0">
                    {label}
                </div>
            )}
        </div>
    )
}

export default Sidebar;
