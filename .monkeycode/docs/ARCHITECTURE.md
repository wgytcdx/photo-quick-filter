# 系统架构 — Photo Quick Filter

## 架构原则

- **纯前端**：零后端，无数据库，全部运算在浏览器内完成
- **文件系统直连**：通过 File System Access API 直接读写用户本地文件
- **只移动不删除**：所有照片分类均为移动（move），永不执行永久删除
- **AI 建议模式**：AI 仅生成分类建议，用户确认后才执行移动

## 顶层数据流

```
用户选择文件夹
  │
  ▼
scanDirectory() ──► PhotoEntry[]
  │                    │
  ▼                    ▼
QueueState        AiPreprocess
  │                    │
  ▼                    ▼
movePhoto()      callAiApi()
  │                    │
  ▼                    ▼
ActionRecord     AiSuggestion
  │                    │
  ▼                    ▼
undoStack        aiSuggestions map
```

## 核心模块依赖关系

```
useAppState (主 Hook)
├── scanner.ts        → 文件扫描
│   └── natural-sort  → 自然排序
├── queue.ts          → 队列操作（纯函数）
├── mover.ts          → 文件移动（副作用）
│   └── scanner       → getDirectoryParts
├── ai-engine.ts      → AI 分析引擎
│   ├── ai-service.ts → API 调用
│   ├── ai-image.ts   → 图片预处理
│   └── ai-types.ts   → AI 类型定义
└── constants.ts      → 全局常量

useAiConfig (配置 Hook)
├── ai-types.ts       → AiConfig
└── ai-service.ts     → testAiConnection

App.tsx
├── useAppState       → 业务逻辑
├── useAiConfig       → AI 配置
└── 组件层             → UI 渲染
```

## 分类流程（完整时序）

```
1. 用户按方向键（或点击按钮）
2. App.handleKeyDown → classifyPhoto(category)
3. useAppState.classifyPhoto:
   a. 设置 moving=true（禁用所有操作）
   b. mover.movePhoto(rootHandle, photo, category):
      - 确保目标目录存在（_delete_review / _keep / _stash / _favorite）
      - 保持原始子目录结构
      - 复制文件（createWritable → write → close）
      - 校验写入成功
      - 删除原文件
      - 若删除失败，回滚目标文件
   c. queue.classify() 更新队列
   d. 清除该照片的 AI 建议
   e. 设置 moving=false
```

## AI 预筛选流程

```
1. 用户打开 AiPanel，配置 API → 点击"开始 AI 预筛选"
2. useAppState.startAiPreprocess:
   a. 遍历所有未分类照片
   b. 每张调用 analyzeOnePhoto:
      - 检查格式（HEIC 超期返回）
      - prepareImage: 加载 → Canvas 缩放 → JPEG base64
      - callAiApi:
        ├─ vision 模式（supportsVision=true）
        │   └─ 发送 image_url + text
        └─ text 模式（supportsVision=false）
            └─ 发送文件名/大小/时间 + text
      - parseAiResponse: stripThinkTags → tryParseBucketJson
   c. 累积 AiSuggestion 到 aiSuggestions map
   d. 累积 AiUsage 到 totalUsage
3. 结果展示：分布柱状图 + 置信度分析 + Token 统计 + 失败详情
4. 用户逐张或批量采纳 → 执行 movePhoto
```

## 安全机制

### 文件移动安全

```
movePhoto 写入顺序：
  1. 打开目标文件句柄 (create: true)
  2. 读取源文件
  3. 写入目标文件 (createWritable → write → close)
     └─ 写入异常 → abort() → 返回错误
  4. 删除源文件
     └─ 删除失败 → 清理目标文件 → 返回错误

undoMove 恢复顺序：
  1. 读取分类目录中的文件
  2. 写回原始目录
  3. 删除分类目录中的副本
     └─ 删除失败仍返回成功（文件已恢复，手动清理）
```

### 重名处理

```typescript
findUniqueName(dirHandle, 'photo.jpg')
// 尝试: photo.jpg → photo_1.jpg → photo_2.jpg → ...
// 兜底: photo_<hash>.jpg
```

## 状态管理

### AppState（主状态）

```typescript
interface AppState {
  rootHandle: FileSystemDirectoryHandle | null  // 照片文件夹
  folderName: string                              // 文件夹名
  queue: QueueState                               // 队列状态
  moving: boolean                                 // 操作锁
  error: string | null                            // 错误信息
  browserSupported: boolean                       // 浏览器兼容
}
```

### QueueState（队列纯状态）

```typescript
interface QueueState {
  photos: PhotoEntry[]       // 所有照片
  currentIndex: number       // 当前查看位置
  undoStack: ActionRecord[]  // 撤销栈
}
```

所有队列操作为纯函数，返回新状态不修改原值。

### AiPreprocessState（AI 预处理状态）

```typescript
interface AiPreprocessState {
  phase: 'config' | 'progress' | 'results' | 'cancelled'
  running: boolean
  total / processed / suggested / failed  // 统计数据
  analyses: AiPhotoAnalysis[]              // 详细分析结果
  currentPhoto: string                     // 当前正在分析的文件
  abortController: AbortController | null  // 取消控制器
  totalUsage: AiUsage                      // 累计 Token 用量
}
```

### aiSuggestions（建议映射表）

```typescript
Record<string, AiSuggestion>
// key: photo.relativePath → value: { bucket, confidence, reason }
```

独立于队列状态，用户可清除建议而不影响已分类照片。

## 键盘交互

| 按键 | 操作 | 作用域 |
|------|------|--------|
| ↑ | 待删除 | 全局（输入框除外） |
| ↓ | 保留 | 全局 |
| ← | 暂存 | 全局 |
| → | 精选 | 全局 |
| Enter | 采纳 AI 建议 | 全局（有建议时） |
| Ctrl+Z / Cmd+Z | 撤销上一步 | 全局 |

`isEditableElement()` 检测当前焦点元素是否为 INPUT/TEXTAREA/SELECT 或 contentEditable，防止键盘操作与输入冲突。

## AI 模型适配

### 视觉模式（supportsVision = true）

适用：OpenAI GPT-4o / Gemini Flash / Qwen-VL 等

```json
{
  "content": [
    {"type": "text", "text": "<prompt>"},
    {"type": "image_url", "image_url": {"url": "data:image/jpeg;base64,..."}}
  ]
}
```

### 文本模式（supportsVision = false）

适用：DeepSeek V4 等纯文本模型

```
照片信息:
文件名: IMG_2025.jpg
文件大小: 2.4 MB
拍摄/修改时间: 2025-06-01 14:30:00

<prompt>

注意：你无法看到图片，请根据文件名、大小、时间等元信息推断分类...
```
