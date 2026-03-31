
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal, flushSync } from 'react-dom';
import { Icons } from './Icons';
import { ImageSuggestionPanel, type ImageSuggestionKind } from './ImageSuggestionPanel';
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
    /** 画布偏移量（用于同步浮动面板位置） */
    canvasOffset?: { x: number; y: number };
    /** 画布缩放比例 */
    canvasScale?: number;
}

const isComposerVideoKind = (k: ImageSuggestionKind | undefined): boolean =>
  k === 'native-video' || k === 'enhance-details';
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

/** 浮动生成面板中与底模相关的可调项：豆包 / ComfyUI 各存一份，切换时恢复、互不覆盖 */
type FloatingComposerPanelParams = {
  generationCount: 1 | 2 | 4;
  imageQuality: ImageQuality;
  aspectRatio: AspectRatioOption;
  steps: number;
  cfgScale: number;
  sampler: SamplerType;
  seed: string;
  videoDurationSec: number;
  videoCameraFixed: boolean;
  videoWatermarkEnabled: boolean;
};

const DEFAULT_FLOATING_PANEL_PARAMS: FloatingComposerPanelParams = {
  generationCount: 1,
  imageQuality: '2k',
  aspectRatio: 'auto',
  steps: 28,
  cfgScale: 7,
  sampler: 'Euler',
  seed: '',
  videoDurationSec: 5,
  videoCameraFixed: false,
  videoWatermarkEnabled: true,
};

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
  canvasOffset = { x: 0, y: 0 },
  canvasScale = 1,
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
    /** 画布图片节点 id（从节点输出菜单打开时，多图时为首张） */
    sourceNodeId?: string;
    /** 画布占位锚点，关闭面板时移除 */
    anchorId?: string;
    /** 上游参考图 URL（单张或首张；与 sourceImageUrls 同步） */
    sourceImageUrl?: string;
    /** 多图参考：与 composer-anchor 相连的多个图片节点 URL（方舟 image 数组） */
    sourceImageUrls?: string[];
    sourceNodeIds?: string[];
  } | null>(null);
  /** 本次生成结果预览（成功回填顶部灰区） */
  const [composerPreviewMedia, setComposerPreviewMedia] = useState<{
    url: string;
    isVideo?: boolean;
    /** 豆包 sequential 多图时的其余 URL */
    galleryUrls?: string[];
  } | null>(null);
  /** 多图/多视频预览时当前下标（左右切换） */
  const [composerPreviewIndex, setComposerPreviewIndex] = useState(0);

  const composerCarouselSlides = useMemo(() => {
    const m = composerPreviewMedia;
    if (!m?.url) return [] as string[];
    const g = m.galleryUrls;
    if (g && g.length > 0) return g;
    return [m.url];
  }, [composerPreviewMedia]);

  useEffect(() => {
    setComposerPreviewIndex(0);
  }, [composerPreviewMedia?.url, composerPreviewMedia?.isVideo, composerPreviewMedia?.galleryUrls?.join('|')]);

  const activeComposerPreviewUrl = useMemo(() => {
    if (composerCarouselSlides.length === 0) return '';
    const i = Math.min(Math.max(0, composerPreviewIndex), composerCarouselSlides.length - 1);
    return composerCarouselSlides[i] || '';
  }, [composerCarouselSlides, composerPreviewIndex]);

  /** 生成图全屏预览 */
  const [fullscreenMedia, setFullscreenMedia] = useState<{ url: string; isVideo?: boolean } | null>(null);
  const [showStylePicker, setShowStylePicker] = useState(false);
  const [styleCategory, setStyleCategory] = useState<StyleCategory>('all');
  const [selectedStyleId, setSelectedStyleId] = useState<string | null>(null);
  const [stylePickerPos, setStylePickerPos] = useState<{ x: number; y: number }>({ x: 80, y: 48 });
  const [composerInputText, setComposerInputText] = useState('');
  const [generationCount, setGenerationCount] = useState<1 | 2 | 4>(1);
  const [showGenerationMenu, setShowGenerationMenu] = useState(false);
  const [modelBase, setModelBase] = useState<ModelBase>('doubao');
  const [showModelMenu, setShowModelMenu] = useState(false);
  const [comfyuiStatus, setComfyuiStatus] = useState<'unknown' | 'checking' | 'connected' | 'disconnected'>('unknown');
  const [comfyuiError, setComfyuiError] = useState<string>('');
  const [imageQuality, setImageQuality] = useState<ImageQuality>('2k');
  const [aspectRatio, setAspectRatio] = useState<AspectRatioOption>('auto');
  const [showImageSizePanel, setShowImageSizePanel] = useState(false);
  /** 画质/比例浮窗位置（须高于浮动生成面板 z-index，避免被挡住） */
  const [imageSizePanelPos, setImageSizePanelPos] = useState<{ x: number; y: number }>({ x: 120, y: 120 });
  const [showAdvancedParamsPanel, setShowAdvancedParamsPanel] = useState(false);
  const [advancedPanelPos, setAdvancedPanelPos] = useState<{ x: number; y: number }>({ x: 220, y: 120 });
  const [steps, setSteps] = useState(28);
  const [cfgScale, setCfgScale] = useState(7);
  const [sampler, setSampler] = useState<SamplerType>('Euler');
  const [showSamplerMenu, setShowSamplerMenu] = useState(false);
  const [seed, setSeed] = useState('');
  /** 视频任务（方舟）：与图像 Steps/CFG 无关，单独配置 */
  const [videoDurationSec, setVideoDurationSec] = useState(5);
  const [videoCameraFixed, setVideoCameraFixed] = useState(false);
  const [videoWatermarkEnabled, setVideoWatermarkEnabled] = useState(true);

  /** 浮动面板「生成结果」区：index 通过 pebbling-composer-progress 推送进度 */
  const [composerProgressOverlay, setComposerProgressOverlay] = useState<{
    message: string;
    mode: 'image' | 'video';
    imageIndex?: number;
    imageTotal?: number;
    percent?: number;
  } | null>(null);

  /** 浮动面板图生视频：已连参考图；与方舟 Seedance 1.5 Pro 离散时长一致 */
  const composerHasVideoReference = useMemo(
    () =>
      Boolean(
        floatingComposer?.sourceImageUrl ||
          (!!floatingComposer?.sourceImageUrls && floatingComposer.sourceImageUrls.length > 0)
      ),
    [floatingComposer?.sourceImageUrl, floatingComposer?.sourceImageUrls]
  );
  const arkSeedanceVideoDurationChoices = useMemo(
    () => (composerHasVideoReference ? [5, 8] : [4, 5, 8, 10, 12]),
    [composerHasVideoReference]
  );
  useEffect(() => {
    if (!floatingComposer || !isComposerVideoKind(floatingComposer.kind)) return;
    const allowed = arkSeedanceVideoDurationChoices;
    if (!allowed.includes(videoDurationSec)) {
      const nearest = allowed.reduce((best, x) =>
        Math.abs(x - videoDurationSec) < Math.abs(best - videoDurationSec) ? x : best
      );
      setVideoDurationSec(nearest);
    }
  }, [floatingComposer, arkSeedanceVideoDurationChoices, videoDurationSec]);

  /** 切换 豆包 ↔ ComfyUI 时：把当前面板参数存回上一底模，再恢复目标底模上次留下的参数 */
  const panelParamsByBaseRef = useRef<Partial<Record<ModelBase, FloatingComposerPanelParams>>>({});
  const modelBasePrevForPanelRef = useRef<ModelBase>(modelBase);
  const panelParamsLiveRef = useRef<FloatingComposerPanelParams>(DEFAULT_FLOATING_PANEL_PARAMS);
  panelParamsLiveRef.current = {
    generationCount,
    imageQuality,
    aspectRatio,
    steps,
    cfgScale,
    sampler,
    seed,
    videoDurationSec,
    videoCameraFixed,
    videoWatermarkEnabled,
  };

  useEffect(() => {
    const prev = modelBasePrevForPanelRef.current;
    if (prev === modelBase) return;
    panelParamsByBaseRef.current[prev] = { ...panelParamsLiveRef.current };
    const next = panelParamsByBaseRef.current[modelBase] ?? DEFAULT_FLOATING_PANEL_PARAMS;
    setGenerationCount(next.generationCount);
    setImageQuality(next.imageQuality);
    setAspectRatio(next.aspectRatio);
    setSteps(next.steps);
    setCfgScale(next.cfgScale);
    setSampler(next.sampler);
    setSeed(next.seed);
    setVideoDurationSec(next.videoDurationSec);
    setVideoCameraFixed(next.videoCameraFixed);
    setVideoWatermarkEnabled(next.videoWatermarkEnabled);
    modelBasePrevForPanelRef.current = modelBase;
  }, [modelBase]);

  /** 每次新开可拖拽浮动生成面板时：风格、画质/比例、张数、高级参数、底模等均恢复默认 */
  const resetFloatingComposerUiToDefaults = useCallback(() => {
    const d = DEFAULT_FLOATING_PANEL_PARAMS;
    panelParamsByBaseRef.current = {
      doubao: { ...d },
      comfyui: { ...d },
    };
    modelBasePrevForPanelRef.current = 'doubao';
    setModelBase('doubao');
    setGenerationCount(d.generationCount);
    setImageQuality(d.imageQuality);
    setAspectRatio(d.aspectRatio);
    setSteps(d.steps);
    setCfgScale(d.cfgScale);
    setSampler(d.sampler);
    setSeed(d.seed);
    setVideoDurationSec(d.videoDurationSec);
    setVideoCameraFixed(d.videoCameraFixed);
    setVideoWatermarkEnabled(d.videoWatermarkEnabled);
    /** 新开/重开浮动面板时不继承上次选中的风格资产 */
    setSelectedStyleId(null);
    setStyleCategory('all');
    setShowStylePicker(false);
    setShowGenerationMenu(false);
    setShowModelMenu(false);
    setShowImageSizePanel(false);
    setShowAdvancedParamsPanel(false);
    setShowSamplerMenu(false);
    setComposerPreviewMedia(null);
    setComposerPreviewIndex(0);
    setComposerInputText('');
    setVideoTaskProgress(0);
    setVideoTaskStatus('');
    setComposerProgressOverlay(null);
    setFullscreenMedia(null);
  }, []);

  useEffect(() => {
    const onProg = (e: Event) => {
      const d = (e as CustomEvent).detail || {};
      if (!d.active) {
        setComposerProgressOverlay(null);
        return;
      }
      const mode = d.mode === 'video' ? 'video' : 'image';
      setComposerProgressOverlay({
        message: String(
          d.message || (mode === 'video' ? '视频生成中…' : '图片生成中…')
        ),
        mode,
        imageIndex: typeof d.imageIndex === 'number' ? d.imageIndex : undefined,
        imageTotal: typeof d.imageTotal === 'number' ? d.imageTotal : undefined,
        percent: typeof d.percent === 'number' ? d.percent : undefined,
      });
    };
    window.addEventListener('pebbling-composer-progress', onProg);
    return () => window.removeEventListener('pebbling-composer-progress', onProg);
  }, []);

  const composerTextareaRef = useRef<HTMLTextAreaElement>(null);
  const floatingComposerRootRef = useRef<HTMLDivElement>(null);

  const isVideoTaskStatusBusy = (s: string) => {
    const x = String(s || '').toLowerCase();
    return ['pending', 'running', 'queued', 'processing', 'submitted', 'in_progress', 'working'].includes(x);
  };

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
  const draggingImageSizePanelRef = useRef<{
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);

  // 记录上一次的画布偏移量，用于计算差值
  const prevCanvasOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // 当画布偏移变化时，同步更新浮动面板位置
  useEffect(() => {
    if (!floatingComposer) return;
    
    const dx = canvasOffset.x - prevCanvasOffsetRef.current.x;
    const dy = canvasOffset.y - prevCanvasOffsetRef.current.y;
    
    // 只有当偏移量有变化时才更新
    if (dx !== 0 || dy !== 0) {
      setFloatingComposer((prev) => {
        if (!prev) return prev;
        const newX = prev.x + dx;
        const newY = prev.y + dy;
        
        // 同步锚点位置
        if (prev.anchorId) {
          window.dispatchEvent(
            new CustomEvent('pebbling-composer-anchor-sync', {
              detail: { anchorId: prev.anchorId, panelX: newX, panelY: newY },
            })
          );
        }
        
        return { ...prev, x: newX, y: newY };
      });
    }
    
    prevCanvasOffsetRef.current = { x: canvasOffset.x, y: canvasOffset.y };
  }, [canvasOffset, floatingComposer]);

  // 初始化 prevCanvasOffsetRef
  useEffect(() => {
    prevCanvasOffsetRef.current = canvasOffset;
  }, []);

  // ComfyUI 连接测试
  const testComfyuiConnection = useCallback(async () => {
    setComfyuiStatus('checking');
    setComfyuiError('');
    try {
      const resp = await fetch('/api/ai/comfyui/test', { method: 'POST' });
      const json = await resp.json();
      if (json.success && json.connected) {
        setComfyuiStatus('connected');
        if (!json.workflowExists) {
          setComfyuiError('工作流文件不存在，请配置 data/comfyui_default_workflow.json');
        }
      } else {
        setComfyuiStatus('disconnected');
        setComfyuiError(json.error || '无法连接到 ComfyUI');
      }
    } catch (e) {
      setComfyuiStatus('disconnected');
      setComfyuiError(e instanceof Error ? e.message : '连接测试失败');
    }
  }, []);

  // 当选择 ComfyUI 时自动测试连接
  useEffect(() => {
    if (modelBase === 'comfyui' && comfyuiStatus === 'unknown') {
      testComfyuiConnection();
    }
  }, [modelBase, comfyuiStatus, testComfyuiConnection]);

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

      const ip = draggingImageSizePanelRef.current;
      if (ip) {
        const dx = e.clientX - ip.startX;
        const dy = e.clientY - ip.startY;
        setImageSizePanelPos({ x: ip.originX + dx, y: ip.originY + dy });
      }
    };
    const onUp = () => {
      draggingComposerRef.current = null;
      draggingStylePickerRef.current = null;
      draggingAdvancedPanelRef.current = null;
      draggingImageSizePanelRef.current = null;
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

  const floatingComposerRef = useRef(floatingComposer);
  useEffect(() => {
    floatingComposerRef.current = floatingComposer;
  }, [floatingComposer]);

  /** 从侧栏打开：由画布 index 创建 composer-anchor，便于从图片节点拖线连接 */
  const openComposerAt = (kind: ImageSuggestionKind, x: number, y: number) => {
    const prevAnchor = floatingComposerRef.current?.anchorId;
    window.dispatchEvent(
      new CustomEvent('pebbling-composer-open-with-anchor', {
        detail: { kind, clientX: x, clientY: y, previousAnchorId: prevAnchor },
      })
    );
  };

  /** 画布图片节点输出菜单 / 工具栏打开 → index 创建锚点后回传 */
  useEffect(() => {
    const onFloatingOpen = (e: Event) => {
      const d = (e as CustomEvent).detail || {};
      const kind = d.kind as ImageSuggestionKind | undefined;
      if (!kind) return;
      flushSync(() => {
        resetFloatingComposerUiToDefaults();
      });
      const oneUrl = String(d.sourceImageUrl || '').trim();
      setFloatingComposer({
        kind,
        x: d.x,
        y: d.y,
        sourceNodeId: d.sourceNodeId,
        anchorId: d.anchorId,
        sourceImageUrl: oneUrl || undefined,
        sourceImageUrls: oneUrl ? [oneUrl] : undefined,
        sourceNodeIds: d.sourceNodeId ? [d.sourceNodeId as string] : undefined,
      });
    };
    window.addEventListener('pebbling-floating-composer-open', onFloatingOpen);
    return () => window.removeEventListener('pebbling-floating-composer-open', onFloatingOpen);
  }, [resetFloatingComposerUiToDefaults]);

  /** 画布上图片节点连线到 composer-anchor 时同步参考图 */
  useEffect(() => {
    const onSyncSource = (e: Event) => {
      const d = (e as CustomEvent).detail || {};
      const anchorId = d.anchorId as string | undefined;
      if (!anchorId) return;
      setFloatingComposer((prev) => {
        if (!prev || prev.anchorId !== anchorId) return prev;
        if (d.disconnectCanvasRef) {
          const hadCanvas =
            prev.sourceNodeId != null ||
            (Array.isArray(prev.sourceNodeIds) && prev.sourceNodeIds.length > 0);
          if (!hadCanvas) return prev;
          return {
            ...prev,
            sourceNodeId: undefined,
            sourceNodeIds: undefined,
            sourceImageUrl: undefined,
            sourceImageUrls: undefined,
          };
        }
        const urlsRaw = Array.isArray(d.sourceImageUrls) ? d.sourceImageUrls : [];
        const urls = urlsRaw.map((u: string) => String(u || '').trim()).filter(Boolean);
        const sidsRaw = Array.isArray(d.sourceNodeIds) ? d.sourceNodeIds : [];
        const sids = sidsRaw.map((id: string) => String(id || '').trim()).filter(Boolean);
        const fallbackUrl = String(d.sourceImageUrl || '').trim();
        const fallbackSid = d.sourceNodeId as string | undefined;
        const finalUrls =
          urls.length > 0 ? urls : fallbackUrl ? [fallbackUrl] : [];
        const finalSids =
          sids.length > 0 ? sids : fallbackSid ? [fallbackSid] : [];
        if (finalUrls.length === 0) {
          return {
            ...prev,
            sourceImageUrl: undefined,
            sourceImageUrls: undefined,
            sourceNodeId: undefined,
            sourceNodeIds: undefined,
          };
        }
        return {
          ...prev,
          sourceImageUrls: finalUrls,
          sourceNodeIds: finalSids.length ? finalSids : undefined,
          sourceImageUrl: finalUrls[0],
          sourceNodeId: finalSids[0],
        };
      });
    };
    window.addEventListener('pebbling-composer-sync-source', onSyncSource);
    return () => window.removeEventListener('pebbling-composer-sync-source', onSyncSource);
  }, []);

  useEffect(() => {
    const onPreview = (e: Event) => {
      const d = (e as CustomEvent).detail || {};
      const rawList = Array.isArray(d.urls) ? d.urls : [];
      const list = rawList.map((u: unknown) => String(u || '').trim()).filter(Boolean);
      const primary = String(d.url || '').trim();
      const url = list.length ? list[0] : primary;
      if (!url) return;
      const galleryUrls = list.length > 1 ? list : undefined;
      setComposerPreviewMedia({ url, isVideo: !!d.isVideo, galleryUrls });
    };
    window.addEventListener('pebbling-composer-preview', onPreview);
    return () => window.removeEventListener('pebbling-composer-preview', onPreview);
  }, []);

  const openStylePicker = () => {
    setShowImageSizePanel(false);
    setShowAdvancedParamsPanel(false);
    const width = Math.min(980, Math.max(760, window.innerWidth * 0.86));
    const height = Math.min(660, Math.max(460, window.innerHeight * 0.82));
    setStylePickerPos({
      x: Math.max(24, (window.innerWidth - width) / 2),
      y: Math.max(16, (window.innerHeight - height) / 2),
    });
    setShowStylePicker(true);
  };

  const openImageSizePanel = () => {
    setShowStylePicker(false);
    setShowAdvancedParamsPanel(false);
    setShowModelMenu(false);
    setShowGenerationMenu(false);
    const panelW = Math.min(440, window.innerWidth * 0.92);
    const fc = floatingComposerRef.current;
    if (fc) {
      const x = Math.max(16, Math.min(window.innerWidth - panelW - 16, fc.x));
      const y = Math.max(16, Math.min(window.innerHeight - 420, fc.y + 24));
      setImageSizePanelPos({ x, y });
    } else {
      setImageSizePanelPos({
        x: Math.max(16, (window.innerWidth - panelW) / 2),
        y: Math.max(16, (window.innerHeight - 400) / 2),
      });
    }
    setShowImageSizePanel(true);
  };

  // 视频生成任务状态
  const [videoTaskProgress, setVideoTaskProgress] = useState<number>(0);
  const [videoTaskStatus, setVideoTaskStatus] = useState<string>('');

  // 轮询视频任务状态（浮动面板内直接提交视频时使用）
  const pollVideoTask = useCallback(async (taskId: string, maxAttempts: number = 120, intervalMs: number = 5000) => {
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const resp = await fetch(`/api/ai/video-task/${taskId}`);
        const json = await resp.json();
        
        if (json.success && json.data) {
          const status = json.data.status?.toLowerCase() || '';
          const progress = json.data.progress || 0;
          
          setVideoTaskProgress(typeof progress === 'number' ? progress : parseInt(String(progress).replace('%', '')) || 0);
          setVideoTaskStatus(status);
          
          // 方舟任务成功状态为 succeeded（非 success/completed）
          if (status === 'completed' || status === 'success' || status === 'succeeded') {
            const videoUrl = json.data.video_url || json.data.videoUrl;
            if (videoUrl) {
              return videoUrl;
            }
          }
          
          if (status === 'failed' || status === 'failure') {
            throw new Error(json.data.fail_reason || '视频生成失败');
          }
        }
      } catch (e) {
        console.error('[视频轮询] 查询失败:', e);
      }
      
      await new Promise(resolve => setTimeout(resolve, intervalMs));
    }
    throw new Error('视频生成超时');
  }, []);

  const buildComposerSubmitDetail = (overrides?: {
    kind?: ImageSuggestionKind;
    prompt?: string;
    previewImageAsRef?: string;
  }) => {
    const selectedAsset = selectedStyleId
      ? styleAssets.find((s) => s.id === selectedStyleId)
      : undefined;
    const kind = overrides?.kind ?? floatingComposer?.kind ?? 'native-image';
    const prompt =
      overrides?.prompt !== undefined ? overrides.prompt : composerInputText.trim();
    const canvasRefUrls =
      floatingComposer?.sourceImageUrls && floatingComposer.sourceImageUrls.length > 0
        ? floatingComposer.sourceImageUrls
        : floatingComposer?.sourceImageUrl
          ? [floatingComposer.sourceImageUrl]
          : [];
    const previewAsRef =
      overrides?.previewImageAsRef ??
      (canvasRefUrls.length === 0 &&
      activeComposerPreviewUrl &&
      !composerPreviewMedia?.isVideo
        ? activeComposerPreviewUrl
        : undefined);
    const imageAdvanced = {
      steps,
      cfgScale,
      sampler,
      seed,
    };
    const videoOpts = {
      duration: videoDurationSec,
      cameraFixed: videoCameraFixed,
      watermark: videoWatermarkEnabled,
    };
    return {
      prompt,
      kind,
      base: modelBase,
      generationCount,
      imageQuality,
      aspectRatio,
      style: selectedAsset
        ? { id: selectedAsset.id, name: selectedAsset.name, category: selectedAsset.category }
        : undefined,
      ...(isComposerVideoKind(kind)
        ? { videoOptions: videoOpts }
        : { advanced: imageAdvanced }),
      sourceNodeId: floatingComposer?.sourceNodeId,
      anchorId: floatingComposer?.anchorId,
      previewImageAsRef: previewAsRef,
      /** 供 index 中 pebbling-composer-submit 注入图生视频 referenceMediaUrls */
      sourceImageUrl: floatingComposer?.sourceImageUrl,
      sourceImageUrls:
        floatingComposer?.sourceImageUrls && floatingComposer.sourceImageUrls.length > 0
          ? floatingComposer.sourceImageUrls
          : undefined,
    };
  };

  const startComposerDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.button !== 0 || !floatingComposer) return;
    draggingComposerRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      originX: floatingComposer.x,
      originY: floatingComposer.y,
    };
  };

  /** 移除已连接的参考图（并通知画布删除锚点连线） */
  const detachConnectedSource = () => {
    if (!floatingComposer) return;
    const aid = floatingComposer.anchorId;
    setFloatingComposer((prev) =>
      prev
        ? {
            ...prev,
            sourceImageUrl: undefined,
            sourceNodeId: undefined,
            sourceImageUrls: undefined,
            sourceNodeIds: undefined,
          }
        : null
    );
    if (aid) {
      window.dispatchEvent(
        new CustomEvent('pebbling-composer-detach-source', {
          detail: { anchorId: aid, clearAllCanvasRefs: true },
        })
      );
    }
  };

  /** 新窗口打开大图，便于截图或在外部工具中裁剪 */
  const openImageForCropPreview = (url: string) => {
    const w = window.open('', '_blank');
    if (!w) {
      alert('请允许弹出窗口以预览图片');
      return;
    }
    w.document.title = '裁剪 / 预览';
    const body = w.document.body;
    body.style.cssText =
      'margin:0;background:#0a0a0a;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;';
    const hint = w.document.createElement('p');
    hint.textContent = '可配合浏览器截图或另存为后，在外部工具中裁剪。';
    hint.style.cssText = 'color:#71717a;font:12px system-ui;padding:12px;text-align:center;max-width:480px;';
    body.appendChild(hint);
    const img = w.document.createElement('img');
    img.src = url;
    img.alt = 'preview';
    img.style.cssText = 'max-width:100%;max-height:85vh;object-fit:contain;';
    body.appendChild(img);
  };

  const handleComposerSubmit = async () => {
    if (composerGenerating) return;
    const kind = floatingComposer?.kind || 'native-image';
    /** 图生视频、首帧图生视频：共用豆包 video 任务 + 轮询（与 index 中 task===video 一致） */
    const isVideo = isComposerVideoKind(kind);
    let text = composerInputText.trim();
    if (!text) {
      if (kind === 'remove-bg') text = '替换背景为描述中的场景，保留清晰主体与边缘自然';
      else if (kind === 'expand-image') text = '自然扩展画面边缘，保持风格与透视一致';
      else if (kind === 'enhance-details') text = '基于首帧生成连贯、自然的动态与镜头运动';
      else if (kind === 'native-video') text = '按描述生成动态视频';
      else if (!isVideo) return;
    }

    // 如果是视频生成，直接在浮动面板处理
    if (isVideo) {
      if (videoTaskStatus && isVideoTaskStatusBusy(videoTaskStatus)) return;
      const wiredUrls =
        floatingComposer?.sourceImageUrls && floatingComposer.sourceImageUrls.length > 0
          ? floatingComposer.sourceImageUrls
          : floatingComposer?.sourceImageUrl
            ? [floatingComposer.sourceImageUrl]
            : [];
      if ((kind === 'enhance-details' || kind === 'native-video') && wiredUrls.length === 0) {
        alert(
          kind === 'native-video'
            ? '图生视频需要先将画布上的图片节点连线到本面板左侧锚点。'
            : '首帧图生视频需要先将画布上的图片节点连线到本面板左侧锚点。'
        );
        return;
      }
      setVideoTaskProgress(0);
      setVideoTaskStatus('pending');
      
      // 触发外部生成状态
      window.dispatchEvent(new CustomEvent('pebbling-composer-generating', { detail: { isGenerating: true } }));
      
      try {
        let videoPrompt = text;
        if (kind === 'enhance-details') {
          videoPrompt = `【首帧图生视频】以上传图片为第一帧参考，按描述生成连贯动态视频。\n${text}`;
        } else if (kind === 'native-video' && wiredUrls.length > 0) {
          videoPrompt = `【图生视频】以参考图为基准，按描述生成动态视频。\n${text}`;
        }
        // 构建视频生成请求（与 backend POST /generate task=video 一致）
        const body: any = {
          base: modelBase,
          task: 'video',
          prompt: videoPrompt,
          options: {
            ratio: aspectRatio === 'auto' ? '16:9' : aspectRatio,
            resolution: imageQuality === '1k' ? '720p' : '1080p',
            duration: videoDurationSec,
            cameraFixed: videoCameraFixed,
            watermark: videoWatermarkEnabled,
          },
        };
        
        if (wiredUrls.length > 0) {
          body.referenceMediaUrls = wiredUrls;
        }
        
        console.log('[视频生成] 发送请求:', body);
        
        const resp = await fetch('/api/ai/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        
        const json = await resp.json();
        
        if (!json.success) {
          throw new Error(json.error || '视频生成请求失败');
        }
        
        const taskId = json.data?.id || json.data?.task_id;
        if (!taskId) {
          throw new Error('未获取到任务ID');
        }
        
        console.log('[视频生成] 任务已创建:', taskId);
        setVideoTaskStatus('running');
        
        // 轮询等待视频完成
        const videoUrl = await pollVideoTask(taskId);
        
        console.log('[视频生成] 完成:', videoUrl);
        setComposerPreviewMedia({ url: videoUrl, isVideo: true });
        setVideoTaskProgress(100);
        setVideoTaskStatus('completed');
      } catch (e) {
        console.error('[视频生成] 失败:', e);
        alert(`视频生成失败: ${e instanceof Error ? e.message : String(e)}`);
        setVideoTaskStatus('');
        setVideoTaskProgress(0);
      } finally {
        window.dispatchEvent(new CustomEvent('pebbling-composer-generating', { detail: { isGenerating: false } }));
      }
      
      return;
    }
    
    // 图片生成：走画布 index 统一 /api/ai/generate（换背景 / 扩图等需带连线参考图）
    window.dispatchEvent(
      new CustomEvent('pebbling-composer-submit', {
        detail: { ...buildComposerSubmitDetail(), prompt: text },
      })
    );
  };

  const handleComposerSubmitRef = useRef(handleComposerSubmit);
  handleComposerSubmitRef.current = handleComposerSubmit;

  /** 根节点捕获阶段处理：仅当焦点在提示词 textarea 时，Shift/Ctrl/Cmd + Enter 提交 */
  const handleComposerRootKeyDownCapture = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    const ta = composerTextareaRef.current;
    if (!ta || document.activeElement !== ta) return;
    const enter = e.key === 'Enter' || e.code === 'Enter' || e.code === 'NumpadEnter';
    if (!enter || e.repeat) return;
    const submitMods = e.shiftKey || e.ctrlKey || e.metaKey;
    if (!submitMods) return;
    if (e.nativeEvent.isComposing) return;
    e.preventDefault();
    e.stopPropagation();
    void handleComposerSubmitRef.current?.();
  }, []);

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
    floatingComposer && isComposerVideoKind(floatingComposer.kind)
      ? aspectRatio === 'auto'
        ? `自适应·${imageQuality === '1k' ? '720p' : imageQuality === '2k' ? '1080p' : '1080p·高'}`
        : `${aspectRatio}·${imageQuality === '1k' ? '720p' : imageQuality === '2k' ? '1080p' : '1080p·高'}`
      : aspectRatio === 'auto'
        ? `自适应·${qualityShort}`
        : `${aspectRatio}·${qualityShort}`;
  const composerSendBusy =
    composerGenerating ||
    (!!floatingComposer && isComposerVideoKind(floatingComposer.kind) && isVideoTaskStatusBusy(videoTaskStatus));

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
                ref={floatingComposerRootRef}
                data-floating-composer-root
                className="fixed z-[135] flex flex-col items-center gap-3 force-white-text"
                style={{ left: floatingComposer.x, top: floatingComposer.y, width: 560, color: '#fff' }}
                onKeyDownCapture={handleComposerRootKeyDownCapture}
                onMouseDown={(e) => {
                    e.stopPropagation();
                }}
            >
                <div className="relative w-full">
                {/* 生成结果：可整体拖拽，右上角关闭 */}
                <div
                  className="relative mx-auto w-[400px] max-w-full cursor-move select-none overflow-hidden rounded-[22px] border border-white/[0.1] bg-[#1a1a1c] shadow-[0_20px_50px_rgba(0,0,0,0.45)] backdrop-blur-sm"
                  onMouseDown={startComposerDrag}
                >
                  <button
                    type="button"
                    className="absolute right-2 top-2 z-30 flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-black/50 text-white/80 backdrop-blur-sm transition hover:bg-white/15 hover:text-white"
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      const aid = floatingComposer?.anchorId;
                      flushSync(() => {
                        resetFloatingComposerUiToDefaults();
                      });
                      setFloatingComposer(null);
                      if (aid) {
                        window.dispatchEvent(
                          new CustomEvent('pebbling-composer-dismiss', { detail: { anchorId: aid } })
                        );
                      }
                    }}
                    title="关闭"
                  >
                    <Icons.Close size={18} />
                  </button>
                  <div className="flex flex-col">
                    {/* 生成结果工具栏：图片多操作；视频仅「重新生成 / 下载」 */}
                    {composerPreviewMedia?.url && (
                      <div
                        className="flex flex-wrap items-center justify-center gap-1 border-b border-white/5 bg-black/40 px-2 py-1.5"
                        onMouseDown={(e) => {
                          if ((e.target as HTMLElement).closest('button')) return;
                          startComposerDrag(e);
                        }}
                      >
                        {!composerPreviewMedia.isVideo ? (
                          <>
                            <button
                              type="button"
                              className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-zinc-200 transition hover:bg-white/10 hover:text-white"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (activeComposerPreviewUrl) openImageForCropPreview(activeComposerPreviewUrl);
                              }}
                              onMouseDown={(e) => e.stopPropagation()}
                              title="在新窗口打开大图，便于裁剪或截图"
                            >
                              <svg className="shrink-0" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M6 2v14a2 2 0 0 0 2 2h14" />
                                <path d="M18 22V8a2 2 0 0 0-2-2H2" />
                              </svg>
                              裁剪
                            </button>
                            <button
                              type="button"
                              className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-zinc-200 transition hover:bg-white/10 hover:text-white"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleComposerSubmit();
                              }}
                              onMouseDown={(e) => e.stopPropagation()}
                              title="使用当前描述重新生成"
                            >
                              <svg className="shrink-0" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                                <path d="M3 3v5h5" />
                                <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
                                <path d="M16 21h5v-5" />
                              </svg>
                              重新生成
                            </button>
                            <button
                              type="button"
                              className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-zinc-200 transition hover:bg-white/10 hover:text-white"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (!activeComposerPreviewUrl) return;
                                const p = composerInputText.trim() || '自然扩展画面边缘，保持风格一致';
                                window.dispatchEvent(
                                  new CustomEvent('pebbling-composer-submit', {
                                    detail: buildComposerSubmitDetail({
                                      kind: 'expand-image',
                                      prompt: p,
                                    }),
                                  })
                                );
                              }}
                              onMouseDown={(e) => e.stopPropagation()}
                              title="以当前图为参考扩图"
                            >
                              <svg className="shrink-0" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M15 3h6v6" />
                                <path d="M9 21H3v-6" />
                                <path d="M21 3l-7 7" />
                                <path d="M3 21l7-7" />
                              </svg>
                              扩图
                            </button>
                            <button
                              type="button"
                              className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-zinc-200 transition hover:bg-white/10 hover:text-white"
                              onClick={async (e) => {
                                e.stopPropagation();
                                const url = activeComposerPreviewUrl;
                                if (!url) return;
                                try {
                                  const r = await fetch(url);
                                  const blob = await r.blob();
                                  const a = document.createElement('a');
                                  a.href = URL.createObjectURL(blob);
                                  a.download = `generated_${Date.now()}.png`;
                                  a.click();
                                  URL.revokeObjectURL(a.href);
                                } catch {
                                  const a = document.createElement('a');
                                  a.href = url;
                                  a.download = `generated_${Date.now()}.png`;
                                  a.click();
                                }
                              }}
                              onMouseDown={(e) => e.stopPropagation()}
                              title="下载图片"
                            >
                              <svg className="shrink-0" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                <polyline points="7 10 12 15 17 10" />
                                <line x1="12" y1="15" x2="12" y2="3" />
                              </svg>
                              下载
                            </button>
                            <button
                              type="button"
                              className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-zinc-200 transition hover:bg-white/10 hover:text-white"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (activeComposerPreviewUrl) {
                                  setFullscreenMedia({ url: activeComposerPreviewUrl, isVideo: false });
                                }
                              }}
                              onMouseDown={(e) => e.stopPropagation()}
                              title="全屏预览"
                            >
                              <svg className="shrink-0" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M8 3H5a2 2 0 0 0-2 2v3" />
                                <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
                                <path d="M3 16v3a2 2 0 0 0 2 2h3" />
                                <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
                              </svg>
                              全屏
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/15 bg-black/45 text-zinc-200 shadow-sm backdrop-blur-sm transition hover:bg-white/10 hover:text-white"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleComposerSubmit();
                              }}
                              onMouseDown={(e) => e.stopPropagation()}
                              title="重新生成"
                              aria-label="重新生成"
                            >
                              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                                <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                                <path d="M3 3v5h5" />
                                <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
                                <path d="M16 21h5v-5" />
                              </svg>
                            </button>
                            <button
                              type="button"
                              className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/15 bg-black/45 text-zinc-200 shadow-sm backdrop-blur-sm transition hover:bg-white/10 hover:text-white"
                              onClick={async (e) => {
                                e.stopPropagation();
                                const url = activeComposerPreviewUrl;
                                if (!url) return;
                                try {
                                  const r = await fetch(url);
                                  const blob = await r.blob();
                                  const a = document.createElement('a');
                                  a.href = URL.createObjectURL(blob);
                                  a.download = `generated_${Date.now()}.mp4`;
                                  a.click();
                                  URL.revokeObjectURL(a.href);
                                } catch {
                                  const a = document.createElement('a');
                                  a.href = url;
                                  a.download = `generated_${Date.now()}.mp4`;
                                  a.click();
                                }
                              }}
                              onMouseDown={(e) => e.stopPropagation()}
                              title="下载视频"
                              aria-label="下载视频"
                            >
                              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                <polyline points="7 10 12 15 17 10" />
                                <line x1="12" y1="15" x2="12" y2="3" />
                              </svg>
                            </button>
                          </>
                        )}
                      </div>
                    )}
                    <div
                      className="flex cursor-move select-none items-center gap-2 border-b border-white/[0.06] pr-11 py-2 pl-3 text-xs font-medium text-zinc-300"
                      onMouseDown={startComposerDrag}
                    >
                      {isComposerVideoKind(floatingComposer?.kind) ? (
                        <>
                          <Icons.Video size={16} className="shrink-0 text-zinc-400" />
                          <span className="shrink-0 tracking-tight">生成结果</span>
                          <span className="text-[10px] font-normal text-zinc-500">视频</span>
                        </>
                      ) : (
                        <>
                          <Icons.Image size={16} className="shrink-0 text-zinc-400" />
                          <span className="shrink-0 tracking-tight">生成结果</span>
                          <span className="text-[10px] font-normal text-zinc-500">图片</span>
                        </>
                      )}
                    </div>
                    <div
                      className="relative mx-3 mb-3 mt-1 flex h-[min(360px,calc(100vw-120px))] min-h-[280px] w-[calc(100%-24px)] cursor-move flex-col items-center justify-center rounded-2xl border border-white/[0.07] bg-[#121214] select-none"
                      onMouseDown={startComposerDrag}
                    >
                      {/* 视频生成进度显示 */}
                      {isComposerVideoKind(floatingComposer?.kind) && isVideoTaskStatusBusy(videoTaskStatus) && (
                        <div
                          className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/60 backdrop-blur-[2px]"
                          onClick={(e) => e.stopPropagation()}
                          onMouseDown={(e) => e.stopPropagation()}
                        >
                          <div className="mb-3 h-11 w-11 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                          <div className="mb-1 text-sm font-medium text-white">
                            {String(videoTaskStatus || '').toLowerCase() === 'pending'
                              ? '任务排队中...'
                              : '视频生成中...'}
                          </div>
                          {videoTaskProgress > 0 && (
                            <div className="w-36 h-2 overflow-hidden rounded-full bg-white/20">
                              <div
                                className="h-full bg-blue-500 transition-all duration-300"
                                style={{ width: `${videoTaskProgress}%` }}
                              />
                            </div>
                          )}
                          <div className="mt-2 text-xs text-zinc-400">
                            {videoTaskProgress > 0 ? `进度: ${videoTaskProgress}%` : '预计 1-5 分钟'}
                          </div>
                        </div>
                      )}
                      <div
                        className={`relative z-0 min-h-0 w-full flex-1 ${
                          composerGenerating &&
                          !isComposerVideoKind(floatingComposer?.kind) &&
                          composerPreviewMedia?.url
                            ? 'opacity-35'
                            : ''
                        }`}
                      >
                      {composerPreviewMedia?.url ? (
                        composerPreviewMedia.isVideo ? (
                          <div className="relative flex w-full max-w-full flex-col items-center justify-center px-1">
                            {composerCarouselSlides.length > 1 && (
                              <>
                                <button
                                  type="button"
                                  aria-label="上一段视频"
                                  className="absolute left-1 top-1/2 z-20 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-black/55 text-white shadow-md backdrop-blur-sm transition hover:bg-black/70"
                                  onMouseDown={(e) => e.stopPropagation()}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setComposerPreviewIndex((i) =>
                                      i <= 0 ? composerCarouselSlides.length - 1 : i - 1
                                    );
                                  }}
                                >
                                  ‹
                                </button>
                                <button
                                  type="button"
                                  aria-label="下一段视频"
                                  className="absolute right-1 top-1/2 z-20 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-black/55 text-white shadow-md backdrop-blur-sm transition hover:bg-black/70"
                                  onMouseDown={(e) => e.stopPropagation()}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setComposerPreviewIndex((i) =>
                                      i >= composerCarouselSlides.length - 1 ? 0 : i + 1
                                    );
                                  }}
                                >
                                  ›
                                </button>
                                <div className="absolute bottom-2 left-1/2 z-20 -translate-x-1/2 rounded-full bg-black/50 px-2 py-0.5 text-[10px] text-zinc-300 backdrop-blur-sm">
                                  {composerPreviewIndex + 1} / {composerCarouselSlides.length}
                                </div>
                              </>
                            )}
                            <video
                              key={activeComposerPreviewUrl}
                              src={activeComposerPreviewUrl}
                              className="max-h-[min(280px,50vh)] w-full object-contain"
                              controls
                              muted
                              playsInline
                              onMouseDown={(e) => e.stopPropagation()}
                            />
                          </div>
                        ) : (
                          <div className="relative flex w-full flex-col items-center gap-2 px-1">
                            {composerCarouselSlides.length > 1 && (
                              <>
                                <button
                                  type="button"
                                  aria-label="上一张"
                                  className="absolute left-1 top-[min(140px,25vh)] z-20 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-black/55 text-white shadow-md backdrop-blur-sm transition hover:bg-black/70"
                                  onMouseDown={(e) => e.stopPropagation()}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setComposerPreviewIndex((i) =>
                                      i <= 0 ? composerCarouselSlides.length - 1 : i - 1
                                    );
                                  }}
                                >
                                  ‹
                                </button>
                                <button
                                  type="button"
                                  aria-label="下一张"
                                  className="absolute right-1 top-[min(140px,25vh)] z-20 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-black/55 text-white shadow-md backdrop-blur-sm transition hover:bg-black/70"
                                  onMouseDown={(e) => e.stopPropagation()}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setComposerPreviewIndex((i) =>
                                      i >= composerCarouselSlides.length - 1 ? 0 : i + 1
                                    );
                                  }}
                                >
                                  ›
                                </button>
                              </>
                            )}
                            <img
                              key={activeComposerPreviewUrl}
                              src={activeComposerPreviewUrl}
                              alt="生成预览"
                              className="max-h-[min(280px,50vh)] w-full object-contain"
                              draggable={false}
                              onMouseDown={(e) => e.stopPropagation()}
                            />
                            {composerCarouselSlides.length > 1 && (
                              <div className="flex max-w-full gap-1 overflow-x-auto px-1 pb-0.5">
                                {composerCarouselSlides.map((u, idx) => (
                                  <button
                                    key={`${idx}-${u.slice(0, 48)}`}
                                    type="button"
                                    title="切换预览"
                                    className={`h-10 w-10 shrink-0 overflow-hidden rounded-md border ${
                                      idx === composerPreviewIndex
                                        ? 'border-sky-500'
                                        : 'border-white/20'
                                    }`}
                                    onMouseDown={(e) => e.stopPropagation()}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setComposerPreviewIndex(idx);
                                    }}
                                  >
                                    <img
                                      src={u}
                                      alt=""
                                      className="h-full w-full object-cover"
                                      draggable={false}
                                    />
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        )
                      ) : floatingComposer?.sourceImageUrl ||
                        (floatingComposer?.sourceImageUrls &&
                          floatingComposer.sourceImageUrls.length > 0) ? (
                        <div className="flex w-full flex-col items-center justify-center gap-2 p-6 text-center">
                          <span className="text-sm text-zinc-500">
                            {isComposerVideoKind(floatingComposer?.kind)
                              ? '已连接参考图（见下方风格区），视频结果将显示在此处'
                              : '已连接参考图（见下方风格区），生成结果将显示在此处'}
                          </span>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center gap-3 py-6 text-zinc-500">
                          {isComposerVideoKind(floatingComposer?.kind) ? (
                            <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 bg-black/30">
                              <Icons.Video size={36} className="text-zinc-600" />
                            </div>
                          ) : (
                            <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 bg-black/30">
                              <Icons.Image size={36} className="text-zinc-600" />
                            </div>
                          )}
                          <span className="text-sm text-zinc-500">
                            {isComposerVideoKind(floatingComposer?.kind) ? '待生成视频将显示在此处' : '待生成图片将显示在此处'}
                          </span>
                        </div>
                      )}
                      </div>
                      {/* 生成中：图片走 composerGenerating + 进度（必须叠在预览图之上，故放在内容之后 + 更高 z-index） */}
                      {composerGenerating &&
                        !(
                          isComposerVideoKind(floatingComposer?.kind) &&
                          isVideoTaskStatusBusy(videoTaskStatus)
                        ) && (
                        <div
                          className="pointer-events-auto absolute inset-0 z-[35] flex flex-col items-center justify-center bg-black/60 px-4 backdrop-blur-[2px]"
                          onClick={(e) => e.stopPropagation()}
                          onMouseDown={(e) => e.stopPropagation()}
                          role="status"
                          aria-live="polite"
                        >
                          <div className="mb-3 h-11 w-11 shrink-0 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                          <p className="mb-2 max-w-[min(300px,92vw)] text-center text-[13px] font-medium leading-snug text-white">
                            {composerProgressOverlay?.message ||
                              (isComposerVideoKind(floatingComposer?.kind)
                                ? '视频任务处理中…'
                                : '图片生成中…')}
                          </p>
                          {(composerProgressOverlay?.mode === 'image' ||
                            (!isComposerVideoKind(floatingComposer?.kind) &&
                              composerGenerating)) &&
                            composerProgressOverlay?.imageTotal != null &&
                            composerProgressOverlay.imageTotal > 0 && (
                              <>
                                <div className="h-2 w-44 max-w-[min(280px,80vw)] overflow-hidden rounded-full bg-white/20">
                                  <div
                                    className="h-full rounded-full bg-blue-500 transition-[width] duration-500 ease-out"
                                    style={{
                                      width: `${Math.min(
                                        100,
                                        Math.max(
                                          0,
                                          composerProgressOverlay.percent != null
                                            ? composerProgressOverlay.percent
                                            : composerProgressOverlay.imageIndex != null
                                              ? Math.round(
                                                  ((composerProgressOverlay.imageIndex - 0.35) /
                                                    composerProgressOverlay.imageTotal) *
                                                    100
                                                )
                                              : 0
                                        )
                                      )}%`,
                                    }}
                                  />
                                </div>
                                {composerProgressOverlay.imageIndex != null &&
                                  composerProgressOverlay.imageIndex >= 1 &&
                                  composerProgressOverlay.imageTotal != null && (
                                    <p className="mt-2 text-center text-[11px] text-zinc-300">
                                      进度：第 {composerProgressOverlay.imageIndex} /{' '}
                                      {composerProgressOverlay.imageTotal} 张
                                    </p>
                                  )}
                              </>
                            )}
                          {composerProgressOverlay?.mode === 'video' && (
                            <p className="mt-1 max-w-[260px] text-center text-[11px] text-zinc-400">
                              方舟排队与渲染耗时较长，请勿关闭面板
                            </p>
                          )}
                          {(!composerProgressOverlay ||
                            (composerProgressOverlay.mode === 'image' &&
                              (composerProgressOverlay.imageTotal == null ||
                                composerProgressOverlay.imageTotal <= 0))) && (
                            <div className="mt-2 h-1.5 w-36 overflow-hidden rounded-full bg-white/12">
                              <div
                                className="h-full w-2/5 animate-pulse rounded-full bg-white/35"
                                style={{ animationDuration: '1.1s' }}
                              />
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* 3. 输入窗体：全宽，视觉上宽于上方结果块 */}
                <div className="mt-3 w-full rounded-[20px] border border-white/[0.1] bg-[#1c1c20] shadow-[0_16px_40px_rgba(0,0,0,0.35)] backdrop-blur-sm">
                {/* 风格与参考图行 */}
                <div
                    className="flex cursor-move select-none items-center border-b border-white/[0.06] px-4 py-3"
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
                    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
                        <button
                            type="button"
                            className="composer-style-btn flex h-14 w-14 shrink-0 flex-col items-center justify-center gap-1 rounded-2xl bg-[#2a2a2f] text-[#b4b4bc] transition hover:bg-[#34343a] hover:text-white active:scale-[0.98]"
                            title="风格"
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                                e.stopPropagation();
                                openStylePicker();
                            }}
                        >
                            <span className="text-xl font-light leading-none tracking-tight" aria-hidden>
                                +
                            </span>
                            <span className="text-[13px] font-medium leading-none">风格</span>
                        </button>
                        {(() => {
                          const refUrls =
                            floatingComposer?.sourceImageUrls &&
                            floatingComposer.sourceImageUrls.length > 0
                              ? floatingComposer.sourceImageUrls
                              : floatingComposer?.sourceImageUrl
                                ? [floatingComposer.sourceImageUrl]
                                : [];
                          if (refUrls.length === 0) return null;
                          return (
                            <div className="flex shrink-0 items-center gap-1">
                              {refUrls.slice(0, 4).map((u, idx) => (
                                <div
                                  key={`${idx}-${u.slice(0, 48)}`}
                                  className="relative h-14 w-14 overflow-hidden rounded-2xl border border-white/15 bg-black/50"
                                >
                                  <img
                                    src={u}
                                    alt={idx === 0 ? '已连接参考图' : '参考图'}
                                    className="h-full w-full object-cover"
                                    draggable={false}
                                  />
                                  {idx === 0 ? (
                                    <button
                                      type="button"
                                      className="absolute right-0.5 top-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/80 text-white/90 shadow hover:bg-red-500/90"
                                      title="移除全部画布参考连接"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        detachConnectedSource();
                                      }}
                                      onMouseDown={(e) => e.stopPropagation()}
                                    >
                                      <Icons.Close size={12} />
                                    </button>
                                  ) : null}
                                </div>
                              ))}
                              {refUrls.length > 4 ? (
                                <span className="px-1 text-[11px] font-medium text-zinc-500">
                                  +{refUrls.length - 4}
                                </span>
                              ) : null}
                            </div>
                          );
                        })()}
                        <div className="ml-1 min-w-0 text-sm font-medium text-white">
                          模式：{floatingTitle}
                        </div>
                    </div>
                </div>

                {/* 输入区域 */}
                <div className="px-4 pb-2 pt-3">
                    <textarea
                        ref={composerTextareaRef}
                        className="w-full resize-none bg-transparent text-[15px] leading-7 text-white !text-white outline-none placeholder:text-zinc-500 placeholder:!text-zinc-500"
                        style={{ minHeight: 88 }}
                        placeholder="描述画面或镜头…（Shift+Enter 或 Ctrl+Enter 发送，Enter 换行）"
                        value={composerInputText}
                        onChange={(e) => setComposerInputText(e.target.value)}
                        onMouseDown={(e) => e.stopPropagation()}
                    />
                </div>

                {/* 底部参数栏 */}
                <div className="flex items-center justify-between gap-3 border-t border-white/[0.06] px-4 py-3">
                    <div className="flex items-center gap-3 text-[13px] text-white !text-white">
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
                                        <div className="flex items-center justify-between">
                                            <span>开源 ComfyUI</span>
                                            {modelBase === 'comfyui' && (
                                                <span className={`text-[10px] ${
                                                    comfyuiStatus === 'connected' ? 'text-green-400' :
                                                    comfyuiStatus === 'disconnected' ? 'text-red-400' :
                                                    comfyuiStatus === 'checking' ? 'text-yellow-400' : 'text-zinc-400'
                                                }`}>
                                                    {comfyuiStatus === 'connected' && '● 已连接'}
                                                    {comfyuiStatus === 'disconnected' && '● 未连接'}
                                                    {comfyuiStatus === 'checking' && '● 检测中...'}
                                                    {comfyuiStatus === 'unknown' && ''}
                                                </span>
                                            )}
                                        </div>
                                        {modelBase === 'comfyui' && comfyuiError && (
                                            <div className="text-[10px] text-red-400 mt-0.5">{comfyuiError}</div>
                                        )}
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
                                setShowModelMenu(false);
                                setShowGenerationMenu(false);
                                if (showImageSizePanel) {
                                  setShowImageSizePanel(false);
                                } else {
                                  openImageSizePanel();
                                }
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
                            className="relative rounded-lg px-3 py-2 text-[13px] font-medium text-white transition hover:bg-white/5"
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
                            disabled={composerSendBusy}
                            className={`flex h-11 w-[3.75rem] items-center justify-center rounded-full border border-white/15 text-white transition ${
                              composerSendBusy ? 'cursor-wait bg-white/5 opacity-70' : 'bg-white/[0.12] hover:bg-white/[0.18]'
                            }`}
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                                e.stopPropagation();
                                if (composerSendBusy) return;
                                setShowGenerationMenu(false);
                                setShowModelMenu(false);
                                setShowImageSizePanel(false);
                                handleComposerSubmit();
                            }}
                            title={composerSendBusy ? '生成中…' : '发送'}
                        >
                            {composerSendBusy ? (
                              <div className="h-5 w-5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                            ) : (
                              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                                <path d="M12 19V5M5 12l7-7 7 7" />
                              </svg>
                            )}
                        </button>
                    </div>
                </div>

                <div className="border-t border-white/[0.06] px-3 pb-3 pt-2">
                    <button
                        type="button"
                        className="w-full rounded-xl border border-white/[0.14] bg-[#0a0a0c] py-3 text-center text-[13px] font-medium text-white/95 shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_5px_16px_rgba(0,0,0,0.55)] transition hover:bg-[#101012] hover:border-white/20 active:scale-[0.99]"
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
                </div>
            </div>
        )}

        {/* 高级生成参数控制浮窗（可拖拽） */}
        {showAdvancedParamsPanel && (
            <div
                className="fixed z-[190] w-[360px] rounded-2xl border border-white/10 bg-[#1f2024]/95 backdrop-blur-xl shadow-2xl pointer-events-auto force-white-text"
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
                    <span className="text-sm font-semibold text-white !text-white">
                      {floatingComposer && isComposerVideoKind(floatingComposer.kind)
                        ? '视频生成参数'
                        : '高级生成参数'}
                    </span>
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
                    {floatingComposer && isComposerVideoKind(floatingComposer.kind) ? (
                      <>
                        <div>
                          <div className="mb-1 flex items-center justify-between text-[12px] text-white !text-white">
                            <span>时长（秒）</span>
                            <span className="text-white">{videoDurationSec}s</span>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {arkSeedanceVideoDurationChoices.map((sec) => (
                              <button
                                key={sec}
                                type="button"
                                className={`min-w-[2.5rem] rounded-md px-2 py-1 text-[11px] font-medium transition ${
                                  videoDurationSec === sec
                                    ? 'bg-blue-500/40 text-white ring-1 ring-blue-400/50'
                                    : 'bg-black/40 text-zinc-400 hover:bg-white/10 hover:text-zinc-200'
                                }`}
                                onMouseDown={(e) => e.stopPropagation()}
                                onClick={() => setVideoDurationSec(sec)}
                              >
                                {sec}s
                              </button>
                            ))}
                          </div>
                          <p className="mt-1 text-[11px] text-zinc-500">
                            豆包 Seedance 1.5 Pro：{composerHasVideoReference ? '图生视频仅 5s / 8s' : '文生视频可选 4 / 5 / 8 / 10 / 12 秒'}
                          </p>
                        </div>
                        <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/40 px-3 py-2.5 text-[13px] text-white">
                          <span>固定镜头</span>
                          <input
                            type="checkbox"
                            checked={videoCameraFixed}
                            onChange={(e) => setVideoCameraFixed(e.target.checked)}
                            onMouseDown={(e) => e.stopPropagation()}
                            className="h-4 w-4 accent-blue-500"
                          />
                        </label>
                        <p className="-mt-2 text-[11px] text-zinc-500">关闭时允许镜头运动（cameraFixed=false）</p>
                        <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/40 px-3 py-2.5 text-[13px] text-white">
                          <span>显示水印</span>
                          <input
                            type="checkbox"
                            checked={videoWatermarkEnabled}
                            onChange={(e) => setVideoWatermarkEnabled(e.target.checked)}
                            onMouseDown={(e) => e.stopPropagation()}
                            className="h-4 w-4 accent-blue-500"
                          />
                        </label>
                      </>
                    ) : (
                      <>
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
                      </>
                    )}
                </div>
            </div>
        )}

        {/* 画质 / 比例选择浮窗（高于浮动生成面板 z-[135]，可拖拽标题栏） */}
        {showImageSizePanel && (
            <>
                <div
                    className="fixed inset-0 z-[200] bg-black/50"
                    onMouseDown={(e) => {
                        e.stopPropagation();
                        setShowImageSizePanel(false);
                    }}
                />
                <div
                    className="fixed z-[201] w-[min(92vw,440px)] rounded-2xl border border-white/12 bg-black shadow-2xl pointer-events-auto force-white-text text-white"
                    style={{ left: imageSizePanelPos.x, top: imageSizePanelPos.y }}
                    onMouseDown={(e) => e.stopPropagation()}
                >
                    <div
                      className="flex cursor-move select-none items-center justify-between border-b border-white/10 px-4 py-3"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        draggingImageSizePanelRef.current = {
                          startX: e.clientX,
                          startY: e.clientY,
                          originX: imageSizePanelPos.x,
                          originY: imageSizePanelPos.y,
                        };
                      }}
                    >
                      <div className="text-[13px] font-semibold text-white/95">
                        {floatingComposer && isComposerVideoKind(floatingComposer.kind) ? '视频清晰度 / 比例' : '画质 / 比例'}
                      </div>
                      <button
                        type="button"
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-white/70 hover:bg-white/10 hover:text-white"
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowImageSizePanel(false);
                        }}
                        title="关闭"
                      >
                        <Icons.Close size={16} />
                      </button>
                    </div>
                    <div className="p-4 pt-3">
                    <div className="flex rounded-xl bg-black/35 p-1 mb-5 gap-1">
                        {(['1k', '2k', '4k'] as ImageQuality[]).map((q) => {
                            const label =
                              floatingComposer && isComposerVideoKind(floatingComposer.kind)
                                ? q === '1k'
                                  ? '720p'
                                  : q === '2k'
                                    ? '1080p'
                                    : '1080p·高'
                                : q === '1k'
                                  ? '1K'
                                  : q === '2k'
                                    ? '2K'
                                    : '4K';
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
                </div>
            </>
        )}

        {/* 风格选择浮窗（可拖拽） */}
        {showStylePicker && (
            <div
                className="fixed z-[202] rounded-2xl border border-white/10 bg-[#222326]/95 backdrop-blur-xl shadow-2xl pointer-events-auto force-white-text text-white"
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
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <div className="text-white text-lg font-semibold">选择风格资产</div>
                      {selectedStyleId ? (
                        <button
                          type="button"
                          className="shrink-0 text-xs font-medium text-zinc-400 transition hover:text-white"
                          onMouseDown={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedStyleId(null);
                          }}
                        >
                          清除已选
                        </button>
                      ) : null}
                    </div>
                    <button
                        type="button"
                        className="w-7 h-7 shrink-0 rounded-md text-white hover:bg-white/10 transition"
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
                                        onClick={() => {
                                          setSelectedStyleId((prev) =>
                                            prev === item.id ? null : item.id
                                          );
                                        }}
                                        title={
                                          item.id === selectedStyleId
                                            ? '再次点击可取消选择'
                                            : item.name
                                        }
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

        {fullscreenMedia &&
          createPortal(
            <div
              className="fixed inset-0 z-[400] flex items-center justify-center bg-black/92 p-4"
              role="dialog"
              aria-modal="true"
              onClick={() => setFullscreenMedia(null)}
            >
              <button
                type="button"
                className="absolute right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-white transition hover:bg-white/20"
                onClick={() => setFullscreenMedia(null)}
                title="关闭"
              >
                <Icons.Close size={20} />
              </button>
              <div className="max-h-[95vh] max-w-[95vw]" onClick={(e) => e.stopPropagation()}>
                {fullscreenMedia.isVideo ? (
                  <video
                    src={fullscreenMedia.url}
                    controls
                    playsInline
                    className="max-h-[95vh] max-w-[95vw] rounded-lg"
                  />
                ) : (
                  <img
                    src={fullscreenMedia.url}
                    alt="全屏预览"
                    className="max-h-[95vh] max-w-[95vw] object-contain"
                  />
                )}
              </div>
            </div>,
            document.body
          )}
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
                    className="absolute left-full top-1/2 -translate-y-1/2 ml-3 opacity-0 group-hover:opacity-100 translate-x-[-6px] group-hover:translate-x-0 transition-all duration-150 pointer-events-auto z-50"
                    onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                    }}
                >
                    <ImageSuggestionPanel onSelect={(kind, e) => onImageSuggestionClick?.(kind, e)} />
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
