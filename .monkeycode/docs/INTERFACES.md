# 接口文档 — Photo Quick Filter

## 核心类型

### `Category` — 分类枚举

```typescript
type Category = 'delete' | 'keep' | 'stash' | 'favorite'
```

四分类体系：delete（待删除）、keep（保留）、stash（暂存）、favorite（精选）。

### `PhotoEntry` — 照片条目

```typescript
interface PhotoEntry {
  file: File
  relativePath: string        // 相对于根目录的路径
  category: Category | null   // null = 未分类
  name: string                // 文件名（含扩展名）
  ext: string                 // 扩展名（小写）
}
```

### `ActionRecord` — 操作记录

```typescript
interface ActionRecord {
  type: Category
  photo: PhotoEntry
  timestamp: number
  sourcePath: string     // 移动前的完整路径
  targetPath: string     // 移动后的完整路径
  aiSuggestion?: AiSuggestion  // 若有 AI 建议则附带
}
```

### `Stats` — 分类统计

```typescript
interface Stats {
  total: number
  processed: number          // 已分类 = delete+keep+stash+favorite
  remaining: number          // 未分类
  delete: number
  keep: number
  stash: number
  favorite: number
  recentActions: ActionRecord[]  // 最近 10 条
}
```

### `QueueState` — 队列状态

```typescript
interface QueueState {
  photos: PhotoEntry[]
  currentIndex: number       // 以 processedCount 为起点
  undoStack: ActionRecord[]
}
```

---

## AI 相关类型

### `AiConfig` — AI 配置

```typescript
interface AiConfig {
  endpoint: string           // API 端点 URL
  apiKey: string             // API 密钥
  model: string              // 模型名称
  supportsVision: boolean    // 是否支持视觉输入
}
```

### `AiProviderPreset` — 供应商预设

```typescript
interface AiProviderPreset {
  id: 'openai' | 'deepseek' | 'siliconflow' | 'gemini' | 'qwen'
  name: string               // 显示名称
  endpoint: string
  model: string
  supportsVision: boolean
  requiresApiKey: boolean
}
```

### 内置预设表

| ID | 名称 | 模型 | 视觉 | 端点 |
|----|------|------|------|------|
| `openai` | OpenAI | gpt-4o | ✓ | `https://api.openai.com/v1/chat/completions` |
| `deepseek` | DeepSeek | deepseek-v4-pro | ✗ | `https://api.deepseek.com/v1/chat/completions` |
| `siliconflow` | SiliconFlow | Qwen/Qwen2.5-VL-72B-Instruct | ✓ | `https://api.siliconflow.cn/v1/chat/completions` |
| `gemini` | Google Gemini | gemini-2.0-flash | ✓ | `https://generativelanguage.googleapis.com/v1beta/openai/chat/completions` |
| `qwen` | 阿里云 Qwen | qwen-vl-plus | ✓ | `https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions` |

### `AiPreset` — 提示词预设

```typescript
interface AiPreset {
  id: 'balanced' | 'smart' | 'liberal' | 'custom'
  name: string               // 显示名称
  prompt: string             // 系统提示词
}
```

### `AiSuggestion` — AI 分类建议

```typescript
interface AiSuggestion {
  bucket: Category
  confidence: number         // 0-1
  reason: string             // AI 给出的分类理由
}
```

### `AiUsage` — Token 用量

```typescript
interface AiUsage {
  promptTokens: number
  completionTokens: number
  totalTokens: number
}
```

### `AiPhotoAnalysis` — 单张分析结果

```typescript
interface AiPhotoAnalysis {
  photoName: string
  suggestion?: AiSuggestion  // 成功时有建议
  error?: string             // 失败时有错误描述
  usage?: AiUsage            // 该次调用的 Token 用量
}
```

### `AiPreprocessState` — 预处理状态

```typescript
interface AiPreprocessState {
  phase: 'config' | 'progress' | 'results' | 'cancelled'
  running: boolean
  total: number
  processed: number
  suggested: number
  failed: number
  analyses: AiPhotoAnalysis[]
  currentPhoto: string
  abortController: AbortController | null
  totalUsage: AiUsage
}
```

---

## 模块接口

### `scanner.ts`

```typescript
function scanDirectory(
  rootHandle: FileSystemDirectoryHandle
): Promise<PhotoEntry[]>
// 递归扫描目录，跳过系统文件和以 _ 开头的分类目录
// 按 naturalCompare 排序

function getExtension(name: string): string
// 返回小写扩展名（含点），如 '.jpg'

function getDirectoryParts(rootHandle: FileSystemDirectoryHandle): {
  parentHandle: FileSystemDirectoryHandle
  rootName: string
}
// 获取根目录的名称和父句柄
```

### `queue.ts`

```typescript
function classify(
  state: QueueState, 
  category: Category, 
  photo: PhotoEntry, 
  sourcePath: string, 
  targetPath: string, 
  aiSuggestion?: AiSuggestion
): QueueState
// 分类一张照片，返回新队列状态（纯函数）

function undo(
  state: QueueState, 
  record: ActionRecord
): QueueState
// 撤销一次分类操作

function computeStats(state: QueueState): Stats
// 计算统计信息

function getRecentActions(state: QueueState, n?: number): ActionRecord[]
// 获取最近 n 条操作记录（默认 10）
```

### `mover.ts`

```typescript
async function movePhoto(
  rootHandle: FileSystemDirectoryHandle,
  photo: PhotoEntry,
  category: Category
): Promise<ActionRecord>
// 将照片移动到分类子目录
// 保持原始子目录结构
// 重名自动追加 _1, _2 后缀

async function undoMove(
  rootHandle: FileSystemDirectoryHandle,
  record: ActionRecord
): Promise<void>
// 撤销照片移动操作
```

### `ai-service.ts`

```typescript
async function callAiApi(
  config: AiConfig, 
  photoBase64: string | null,  // null → 文本模式
  photoMeta: PhotoMeta         // 文件名/大小/时间
): Promise<{ analysis: AiPhotoAnalysis; usage: AiUsage }>
// 调用 AI API，根据 supportsVision 选择视觉或文本模式

async function testAiConnection(
  config: AiConfig
): Promise<AiTestResult>
// 测试 AI 连接是否正常

function parseAiResponse(
  text: string
): AiSuggestion | null
// 解析 AI 返回的 JSON

function stripThinkTags(text: string): string
// 清除 DeepSeek 的 <think>...</think> 块

function tryParseBucketJson(text: string): AiSuggestion | null
// 从文本中提取 AI 建议 JSON
```

### `ai-image.ts`

```typescript
async function prepareImage(
  file: File
): Promise<string | null>
// 将图片文件转为 JPEG base64
// 最长边缩放到 1024px
// HEIC 格式返回 null
```

### `useAiConfig.ts`

```typescript
function useAiConfig(): {
  config: AiConfig
  presetId: string
  customPrompt: string
  isSaved: boolean
  effectivePrompt: string
  testing: boolean
  testResult: AiTestResult | null
  updateConfig: (partial: Partial<AiConfig>) => void
  updatePresetId: (id: string) => void
  updateCustomPrompt: (prompt: string) => void
  saveConfig: () => void
  clearConfig: () => void
  testConnection: () => void
}
// localStorage 自动持久化，useEffect 监听状态变更
```

### `useAppState.ts`

```typescript
function useAppState(): {
  state: AppState
  stats: Stats
  aiSuggestions: Record<string, AiSuggestion>
  aiState: AiPreprocessState
  setRootHandle: (handle: FileSystemDirectoryHandle | null) => void
  classifyPhoto: (category: Category) => Promise<void>
  adoptSuggestion: (photo: PhotoEntry) => Promise<void>
  adoptAllSuggestions: () => Promise<void>
  clearSuggestions: () => void
  undoLastAction: () => Promise<void>
  startAiPreprocess: (config: AiConfig, prompt: string, concurrency?: number) => void
  cancelAiPreprocess: () => void
  resetAiPreprocess: () => void
  dismissError: () => void
  getUndoName: () => string | null
}
// 所有操作在 moving 锁期间被禁用
```

---

## API 请求/响应格式

### 请求

所有 Provider 统一使用 OpenAI 兼容的 Chat Completions 格式：

```json
POST {endpoint}
Authorization: Bearer {apiKey}
Content-Type: application/json

{
  "model": "gpt-4o",
  "messages": [
    {
      "role": "user",
      "content": [
        {"type": "text", "text": "<system prompt + photo metadata>"},
        {"type": "image_url", "image_url": {"url": "data:image/jpeg;base64,..."}}
      ]
    }
  ],
  "max_tokens": 1024,
  "temperature": 0.1
}
```

非视觉模式下去掉 `image_url` 内容块。

### 期望响应

```json
{
  "choices": [
    {
      "message": {
        "content": "分类: stash\n置信度: 0.85\n原因: 照片中有模糊的..."
      }
    }
  ],
  "usage": {
    "prompt_tokens": 500,
    "completion_tokens": 50,
    "total_tokens": 550
  }
}
```

解析器兼容包裹在 `\`\`\`json` 代码块中的 JSON 和裸 JSON 文本。
