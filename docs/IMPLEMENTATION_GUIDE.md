# 容器功能和图片操作功能实现指南

本文档提供详细的实现步骤，用于完成设计文档中规划的容器分类功能和图片基础操作功能。

## 前置准备（已完成）

✅ 1. **类型定义**
   - 已在 `types.ts` 中添加 `ContainerSizeType`、`ContainerLayoutType`、`DesktopContainerItem`
   - 已更新 `DesktopItemType` 和 `DesktopItem` 联合类型

✅ 2. **工具函数**
   - 已创建 `utils/container.ts`，包含容器尺寸计算、容量检测等辅助函数

✅ 3. **项目文档**
   - 已创建 CHANGELOG.md 和 CONTRIBUTING.md
   - 已优化 .gitignore 和版本号管理

## 第二阶段：容器功能实现

### 步骤 1：在 Desktop.tsx 中添加容器渲染支持

**位置**：`components/Desktop.tsx` 第 1379 行附近（桌面项目渲染部分）

**需要添加的代码**：

在现有的 `item.type === 'image'`、`item.type === 'stack'`、`item.type === 'folder'` 判断后，添加容器类型的渲染：

```typescript
import { DesktopContainerItem, ContainerSizeType } from '../types';
import { getContainerPixelSize, getContainerCapacity, getContainerItemPositions, isContainerFull } from '../utils/container';

// 在渲染部分添加（约 1490 行后）
} else if (item.type === 'container') {
  const container = item as DesktopContainerItem;
  const containerSize = getContainerPixelSize(container.size, gridSize);
  const capacity = getContainerCapacity(container.size);
  const isFull = isContainerFull(container.itemIds.length, container.size);
  
  // 容器边框和背景
  <div 
    className="w-full h-full relative border-2 border-dashed rounded-lg"
    style={{
      width: containerSize.width,
      height: containerSize.height,
      borderColor: container.color || theme.colors.accent,
      backgroundColor: `${container.color || theme.colors.accent}${Math.round((container.bgOpacity || 10) * 2.55).toString(16).padStart(2, '0')}`,
    }}
  >
    {/* 容器标题 */}
    {container.titlePosition !== 'hidden' && (
      <div 
        className={`absolute ${container.titlePosition === 'top' ? 'top-1' : 'bottom-1'} left-0 right-0 text-center`}
        style={{
          fontSize: '10px',
          color: theme.colors.textPrimary,
          backgroundColor: 'rgba(0,0,0,0.5)',
          padding: '2px 4px',
        }}
      >
        {container.name} ({container.itemIds.length}/{capacity})
      </div>
    )}
    
    {/* 容器内的项目 */}
    {container.layout === 'grid' && (
      <>
        {container.itemIds.map((itemId, index) => {
          const innerItem = items.find(i => i.id === itemId);
          if (!innerItem) return null;
          
          const positions = getContainerItemPositions(
            container.itemIds.length,
            container.size,
            60, // 容器内项目尺寸
            8   // 内边距
          );
          const pos = positions[index];
          
          return (
            <div
              key={itemId}
              className="absolute"
              style={{
                left: pos.x,
                top: pos.y + (container.titlePosition === 'top' ? 20 : 0),
                width: 60,
                height: 60,
              }}
            >
              {/* 渲染容器内的项目缩略图 */}
              {innerItem.type === 'image' && (
                <img
                  src={getThumbnailUrl((innerItem as DesktopImageItem).imageUrl)}
                  alt={innerItem.name}
                  className="w-full h-full object-cover rounded"
                  draggable={false}
                />
              )}
            </div>
          );
        })}
      </>
    )}
  </div>
}
```

### 步骤 2：添加创建容器的右键菜单选项

**位置**：`components/Desktop.tsx` 第 1820 行附近（右键菜单部分）

在"新建文件夹"按钮后添加：

```typescript
{/* 新建容器子菜单 */}
<div className="relative group">
  <button
    className="w-full px-3 py-2 text-left text-[12px] hover:bg-blue-500/10 transition-colors flex items-center gap-2 justify-between"
    style={{ color: theme.colors.textPrimary }}
  >
    <div className="flex items-center gap-2">
      <PackageIcon className="w-4 h-4 text-purple-500" />
      <span>新建容器</span>
    </div>
    <ChevronRightIcon className="w-3 h-3" />
  </button>
  
  {/* 容器尺寸子菜单 */}
  <div className="absolute left-full top-0 ml-1 hidden group-hover:block min-w-[140px] py-1.5 rounded-xl shadow-2xl border backdrop-blur-xl"
    style={{
      background: isLight ? 'rgba(255,255,255,0.95)' : 'rgba(18,18,26,0.95)',
      borderColor: isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)',
    }}
  >
    {(['1x1', '1x2', '2x1', '2x2'] as ContainerSizeType[]).map(size => (
      <button
        key={size}
        onClick={() => handleCreateContainer(size)}
        className="w-full px-3 py-2 text-left text-[12px] hover:bg-purple-500/10 transition-colors"
        style={{ color: theme.colors.textPrimary }}
      >
        容器 {size.replace('x', '×')}
      </button>
    ))}
  </div>
</div>
```

### 步骤 3：实现创建容器的处理函数

**位置**：在 `handleCreateFolder` 函数后添加（约 552 行后）

```typescript
import { getContainerSizeName, suggestContainerSize } from '../utils/container';

// 创建容器
const handleCreateContainer = useCallback((size: ContainerSizeType) => {
  let pos = { x: 0, y: 0 };
  
  if (contextMenu && containerRef.current) {
    const rect = containerRef.current.getBoundingClientRect();
    const relativeX = contextMenu.x - rect.left - horizontalPadding;
    const relativeY = contextMenu.y - rect.top - TOP_OFFSET;
    
    pos = {
      x: Math.min(maxX, Math.max(0, relativeX)),
      y: Math.min(maxY, Math.max(0, relativeY)),
    };
  }
  
  const snappedPos = findNearestFreePosition(pos);
  snappedPos.x = Math.min(maxX, Math.max(0, snappedPos.x));
  snappedPos.y = Math.min(maxY, Math.max(0, snappedPos.y));
  
  const newContainer: DesktopContainerItem = {
    id: generateId(),
    type: 'container',
    name: `容器 (${getContainerSizeName(size)})`,
    position: snappedPos,
    size: size,
    itemIds: [],
    layout: 'grid',
    color: theme.colors.accent,
    bgOpacity: 10,
    titlePosition: 'top',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  
  onItemsChange([...items, newContainer]);
  setContextMenu(null);
}, [contextMenu, containerRef, items, onItemsChange, theme, maxX, maxY]);
```

### 步骤 4：支持拖拽项目到容器内

**位置**：修改 `handleItemMouseDown` 和拖拽逻辑（约 237 行附近）

需要在拖拽结束时检测是否拖到容器上：

```typescript
// 在 handleMouseMove 中添加容器检测
const targetContainer = currentItems.find(item => {
  if (item.type !== 'container' || selectedIds.includes(item.id)) return false;
  const container = item as DesktopContainerItem;
  const containerSize = getContainerPixelSize(container.size, gridSize);
  const containerX = horizontalPadding + container.position.x;
  const containerY = TOP_OFFSET + container.position.y;
  
  return mouseX >= containerX && 
         mouseX <= containerX + containerSize.width &&
         mouseY >= containerY && 
         mouseY <= containerY + containerSize.height &&
         !isContainerFull(container.itemIds.length, container.size);
});

// 在 handleMouseUp 中处理放入容器
if (targetContainer && targetContainer.type === 'container') {
  const container = targetContainer as DesktopContainerItem;
  const updatedItems = items.map(item => {
    if (item.id === container.id) {
      const newItemIds = [...container.itemIds];
      selectedIds.forEach(id => {
        const selectedItem = items.find(i => i.id === id);
        if (selectedItem && selectedItem.type === 'image' && !newItemIds.includes(id)) {
          if (!isContainerFull(newItemIds.length, container.size)) {
            newItemIds.push(id);
          }
        }
      });
      return { ...container, itemIds: newItemIds, updatedAt: Date.now() };
    }
    return item;
  });
  onItemsChange(updatedItems);
  onSelectionChange([]);
}
```

### 步骤 5：实现从容器移出项目

添加右键菜单选项和处理函数：

```typescript
// 处理函数
const handleMoveOutOfContainer = useCallback((containerId: string) => {
  const container = items.find(i => i.id === containerId) as DesktopContainerItem;
  if (!container) return;
  
  const updatedItems = items.map(item => {
    if (item.id === containerId) {
      return {
        ...container,
        itemIds: container.itemIds.filter(id => !selectedIds.includes(id)),
        updatedAt: Date.now(),
      };
    }
    return item;
  });
  
  onItemsChange(updatedItems);
  onSelectionChange([]);
}, [items, selectedIds, onItemsChange, onSelectionChange]);
```

---

## 第三阶段：图片操作功能实现

### 步骤 1：后端实现图片合并 API

**位置**：创建 `backend-nodejs/src/routes/imageOps.js`

```javascript
const express = require('express');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs').promises;
const config = require('../config');

const router = express.Router();

// 图片合并
router.post('/merge', async (req, res) => {
  try {
    const { imagePaths, layout, gridColumns = 2, resizeStrategy = 'keep', spacing = 0, backgroundColor = '#FFFFFF' } = req.body;
    
    if (!imagePaths || imagePaths.length < 2) {
      return res.json({ success: false, error: '至少需要2张图片进行合并' });
    }
    
    // 验证图片路径
    const validPaths = [];
    for (const imgPath of imagePaths) {
      const fullPath = path.join(config.BASE_DIR, imgPath);
      try {
        await fs.access(fullPath);
        validPaths.push(fullPath);
      } catch (e) {
        console.error(`图片不存在: ${imgPath}`);
      }
    }
    
    if (validPaths.length < 2) {
      return res.json({ success: false, error: '可用图片不足' });
    }
    
    // 加载所有图片并获取尺寸
    const images = await Promise.all(
      validPaths.map(async p => {
        const img = sharp(p);
        const metadata = await img.metadata();
        return { path: p, image: img, width: metadata.width, height: metadata.height };
      })
    );
    
    let canvasWidth, canvasHeight;
    let positions = [];
    
    if (layout === 'horizontal') {
      // 左右合并
      const maxHeight = Math.max(...images.map(i => i.height));
      canvasWidth = images.reduce((sum, i) => sum + i.width, 0) + spacing * (images.length - 1);
      canvasHeight = maxHeight;
      
      let offsetX = 0;
      images.forEach(img => {
        positions.push({
          input: img.path,
          top: Math.floor((maxHeight - img.height) / 2),
          left: offsetX,
        });
        offsetX += img.width + spacing;
      });
      
    } else if (layout === 'vertical') {
      // 上下合并
      const maxWidth = Math.max(...images.map(i => i.width));
      canvasWidth = maxWidth;
      canvasHeight = images.reduce((sum, i) => sum + i.height, 0) + spacing * (images.length - 1);
      
      let offsetY = 0;
      images.forEach(img => {
        positions.push({
          input: img.path,
          top: offsetY,
          left: Math.floor((maxWidth - img.width) / 2),
        });
        offsetY += img.height + spacing;
      });
      
    } else if (layout === 'grid') {
      // 网格布局
      const cols = gridColumns;
      const rows = Math.ceil(images.length / cols);
      
      const maxWidth = Math.max(...images.map(i => i.width));
      const maxHeight = Math.max(...images.map(i => i.height));
      
      canvasWidth = cols * maxWidth + spacing * (cols - 1);
      canvasHeight = rows * maxHeight + spacing * (rows - 1);
      
      images.forEach((img, index) => {
        const row = Math.floor(index / cols);
        const col = index % cols;
        positions.push({
          input: img.path,
          top: row * (maxHeight + spacing) + Math.floor((maxHeight - img.height) / 2),
          left: col * (maxWidth + spacing) + Math.floor((maxWidth - img.width) / 2),
        });
      });
    }
    
    // 创建画布并合成
    const timestamp = Date.now();
    const outputFilename = `merged_${timestamp}.png`;
    const outputPath = path.join(config.OUTPUT_DIR, outputFilename);
    
    await sharp({
      create: {
        width: canvasWidth,
        height: canvasHeight,
        channels: 4,
        background: backgroundColor,
      }
    })
    .composite(positions)
    .png()
    .toFile(outputPath);
    
    res.json({
      success: true,
      data: {
        imageUrl: `/output/${outputFilename}`,
        width: canvasWidth,
        height: canvasHeight,
      }
    });
    
  } catch (error) {
    console.error('图片合并失败:', error);
    res.json({ success: false, error: error.message });
  }
});

// 图片裁切
router.post('/crop', async (req, res) => {
  try {
    const { imagePath, cropRegion } = req.body;
    const { left, top, width, height } = cropRegion;
    
    const fullPath = path.join(config.BASE_DIR, imagePath);
    await fs.access(fullPath);
    
    const timestamp = Date.now();
    const outputFilename = `cropped_${timestamp}.png`;
    const outputPath = path.join(config.OUTPUT_DIR, outputFilename);
    
    await sharp(fullPath)
      .extract({ left, top, width, height })
      .toFile(outputPath);
    
    res.json({
      success: true,
      data: {
        imageUrl: `/output/${outputFilename}`,
        width,
        height,
      }
    });
    
  } catch (error) {
    console.error('图片裁切失败:', error);
    res.json({ success: false, error: error.message });
  }
});

// 图片缩放
router.post('/resize', async (req, res) => {
  try {
    const { imagePath, width, height, fit = 'inside', maintainAspectRatio = true } = req.body;
    
    const fullPath = path.join(config.BASE_DIR, imagePath);
    await fs.access(fullPath);
    
    const timestamp = Date.now();
    const outputFilename = `resized_${timestamp}.png`;
    const outputPath = path.join(config.OUTPUT_DIR, outputFilename);
    
    const resizeOptions = { width, height };
    if (maintainAspectRatio) {
      resizeOptions.fit = fit;
    } else {
      resizeOptions.fit = 'fill';
    }
    
    const result = await sharp(fullPath)
      .resize(resizeOptions)
      .toFile(outputPath);
    
    res.json({
      success: true,
      data: {
        imageUrl: `/output/${outputFilename}`,
        width: result.width,
        height: result.height,
      }
    });
    
  } catch (error) {
    console.error('图片缩放失败:', error);
    res.json({ success: false, error: error.message });
  }
});

module.exports = router;
```

### 步骤 2：在后端主文件中注册路由

**位置**：`backend-nodejs/src/server.js`

```javascript
const imageOpsRouter = require('./routes/imageOps');
app.use('/api/image-ops', imageOpsRouter);
```

### 步骤 3：前端创建 API 服务

**位置**：创建 `services/api/imageOps.ts`

```typescript
import { post } from './index';

// 图片合并
export const mergeImages = async (params: {
  imagePaths: string[];
  layout: 'horizontal' | 'vertical' | 'grid';
  gridColumns?: number;
  resizeStrategy?: 'keep' | 'stretch' | 'fit';
  spacing?: number;
  backgroundColor?: string;
}): Promise<{ success: boolean; data?: { imageUrl: string; width: number; height: number }; error?: string }> => {
  return post('/image-ops/merge', params);
};

// 图片裁切
export const cropImage = async (params: {
  imagePath: string;
  cropRegion: { left: number; top: number; width: number; height: number };
}): Promise<{ success: boolean; data?: { imageUrl: string; width: number; height: number }; error?: string }> => {
  return post('/image-ops/crop', params);
};

// 图片缩放
export const resizeImage = async (params: {
  imagePath: string;
  width?: number;
  height?: number;
  fit?: 'contain' | 'cover' | 'fill' | 'inside' | 'outside';
  maintainAspectRatio?: boolean;
}): Promise<{ success: boolean; data?: { imageUrl: string; width: number; height: number }; error?: string }> => {
  return post('/image-ops/resize', params);
};
```

### 步骤 4：前端添加右键菜单选项

在选中图片时的右键菜单中添加：

```typescript
{/* 图片操作选项 */}
{selectedIds.length >= 2 && selectedIds.every(id => items.find(i => i.id === id)?.type === 'image') && (
  <>
    <div className="h-px my-1" style={{ background: isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)' }} />
    <button
      onClick={() => handleMergeImages('horizontal')}
      className="w-full px-3 py-2 text-left text-[12px] hover:bg-teal-500/10 transition-colors flex items-center gap-2"
      style={{ color: theme.colors.textPrimary }}
    >
      <span>← → 左右合并</span>
    </button>
    <button
      onClick={() => handleMergeImages('vertical')}
      className="w-full px-3 py-2 text-left text-[12px] hover:bg-teal-500/10 transition-colors flex items-center gap-2"
      style={{ color: theme.colors.textPrimary }}
    >
      <span>↑ ↓ 上下合并</span>
    </button>
  </>
)}

{selectedIds.length === 1 && items.find(i => i.id === selectedIds[0])?.type === 'image' && (
  <>
    <button
      onClick={() => handleCropImage(selectedIds[0])}
      className="w-full px-3 py-2 text-left text-[12px] hover:bg-lime-500/10 transition-colors flex items-center gap-2"
      style={{ color: theme.colors.textPrimary }}
    >
      <span>✂️ 裁切图片</span>
    </button>
    <button
      onClick={() => handleResizeImage(selectedIds[0])}
      className="w-full px-3 py-2 text-left text-[12px] hover:bg-cyan-500/10 transition-colors flex items-center gap-2"
      style={{ color: theme.colors.textPrimary }}
    >
      <span>📐 调整尺寸</span>
    </button>
  </>
)}
```

### 步骤 5：实现处理函数

```typescript
import { mergeImages, cropImage, resizeImage } from '../services/api/imageOps';

const handleMergeImages = useCallback(async (layout: 'horizontal' | 'vertical') => {
  const selectedImages = selectedIds
    .map(id => items.find(i => i.id === id) as DesktopImageItem)
    .filter(i => i && i.type === 'image');
  
  if (selectedImages.length < 2) return;
  
  const imagePaths = selectedImages.map(img => img.imageUrl.replace('/api/', ''));
  
  const result = await mergeImages({
    imagePaths,
    layout,
    spacing: 10,
    backgroundColor: '#FFFFFF',
  });
  
  if (result.success && result.data) {
    // 在桌面上创建新图片
    const newImage: DesktopImageItem = {
      id: generateId(),
      type: 'image',
      name: `合并图片_${Date.now()}`,
      imageUrl: result.data.imageUrl,
      position: findNearestFreePosition({ x: 100, y: 100 }),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    onItemsChange([...items, newImage]);
  }
}, [selectedIds, items, onItemsChange]);

// 裁切和缩放类似实现...
```

---

## 测试检查清单

### 容器功能测试
- [ ] 可以通过右键菜单创建四种尺寸的容器
- [ ] 可以拖拽图片到容器内
- [ ] 容器已满时无法继续添加
- [ ] 可以从容器中移出项目
- [ ] 容器内项目正确布局显示
- [ ] 容器可以被选中、移动、删除
- [ ] 容器状态正确保存和恢复

### 图片操作测试
- [ ] 左右合并功能正常
- [ ] 上下合并功能正常
- [ ] 网格合并功能正常
- [ ] 裁切功能正常（需要实现裁切界面）
- [ ] 缩放功能正常（需要实现尺寸调整界面）
- [ ] 合并后的图片正确显示在桌面上
- [ ] 原图片保持不变（非破坏性编辑）

---

## 注意事项

1. **性能优化**
   - 大量项目时考虑虚拟滚动
   - 图片处理使用异步操作，显示加载状态

2. **错误处理**
   - 所有 API 调用都要有错误处理
   - 向用户展示清晰的错误信息

3. **用户体验**
   - 所有操作提供视觉反馈
   - 重要操作（如删除）需要确认

4. **数据一致性**
   - 删除容器时处理内部项目
   - 删除项目时从容器中移除引用

---

## 后续优化建议

1. **容器功能增强**
   - 支持容器与文件夹/堆叠的相互转换
   - 支持容器尺寸的动态调整
   - 支持更多布局方式（自由布局、堆叠布局）

2. **图片操作增强**
   - 实现图形化的裁切界面
   - 实现尺寸调整的预览界面
   - 添加图片旋转和翻转功能
   - 添加图片格式转换功能

3. **批量操作优化**
   - 显示操作进度
   - 支持操作队列管理
   - 支持撤销/重做

---

**完成时间估算**
- 容器功能完整实现：2-3 天
- 图片操作功能完整实现：2-3 天
- 测试和优化：1-2 天

**总计**：5-8 个工作日
