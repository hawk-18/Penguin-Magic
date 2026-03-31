# ComfyUI 连接问题修复计划

## 问题分析

### 当前状态
1. **豆包** - 工作正常
   - 后端配置了 `thirdPartyConfig`，有 `baseUrl` 和 `apiKey`
   - 前端调用 `/api/ai/generate` 时，`base: 'doubao'` 正确路由

2. **ComfyUI** - 连接不通的原因
   - 后端配置了 `comfyuiConfig`，`enabled: true`，`baseUrl: 'http://127.0.0.1:8188'`
   - **缺少 `defaultWorkflow` 或 `data/comfyui_default_workflow.json` 文件**
   - 后端代码会尝试加载工作流文件，但文件不存在
   - 没有连接测试功能来验证 ComfyUI 是否可用

### 后端代码逻辑 (ai.js:781-859)
```javascript
if (base === 'comfyui') {
  // 1. 检查 baseUrl
  // 2. 加载 workflow（优先级：req.body.comfy.workflow > comfy.defaultWorkflow > loadComfyWorkflowFromDisk()）
  // 3. 如果都没有 workflow，返回错误
  // 4. 替换 {{prompt}} 占位符
  // 5. POST /prompt 到 ComfyUI
  // 6. 轮询 /history 获取结果
}
```

## 修复方案

### 步骤 1: 添加 ComfyUI 连接测试 API
**文件**: `backend-nodejs/src/routes/ai.js`

添加 `/api/ai/comfyui/test` 端点：
- 测试 ComfyUI 服务是否可访问
- 返回连接状态和错误信息

### 步骤 2: 创建默认 ComfyUI 工作流文件
**文件**: `backend-nodejs/data/comfyui_default_workflow.json`

创建一个基础的文生图工作流：
- 包含 KSampler 节点
- 包含 Save Image 节点
- 使用 `{{prompt}}` 占位符

### 步骤 3: 前端添加 ComfyUI 状态检测
**文件**: `components/PebblingCanvas/Sidebar.tsx`

- 在选择 ComfyUI 时检测连接状态
- 显示连接状态提示
- 提供配置引导

### 步骤 4: 添加 ComfyUI 配置界面
**文件**: `components/PebblingCanvas/ApiSettings.tsx`

- 添加 ComfyUI baseUrl 配置
- 添加连接测试按钮
- 显示工作流状态

## 实施步骤

1. [ ] 后端添加 ComfyUI 连接测试 API
2. [ ] 创建默认 ComfyUI 工作流文件
3. [ ] 前端添加 ComfyUI 状态检测和提示
4. [ ] 在设置界面添加 ComfyUI 配置选项
5. [ ] 测试完整流程
