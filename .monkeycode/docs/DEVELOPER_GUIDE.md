# 开发者指南 — Photo Quick Filter

## 环境准备

```bash
# 要求 Node.js >= 18
pnpm install
```

## 常用命令

| 命令 | 说明 |
|------|------|
| `pnpm dev` | 启动开发服务器（端口 5173，HMR） |
| `pnpm build` | 生产构建（输出到 `dist/`） |
| `pnpm test` | 运行所有测试 |
| `pnpm test -- --watch` | 监视模式运行测试 |
| `pnpm typecheck` | TypeScript 类型检查 |
| `pnpm lint` | ESLint 静态检查 |

## 项目结构

```
photo-quick-filter/
├── src/
│   ├── main.tsx              # 入口
│   ├── App.tsx               # 根组件
│   ├── App.css               # 全局样式（1590 行）
│   ├── index.css             # CSS 变量设计系统
│   ├── components/           # UI 组件
│   │   ├── Header.tsx
│   │   ├── StatusBar.tsx
│   │   ├── ErrorBanner.tsx
│   │   ├── WelcomeView.tsx
│   │   ├── CompletionView.tsx
│   │   ├── PhotoViewer.tsx
│   │   ├── ActionBar.tsx
│   │   ├── RecentActions.tsx
│   │   ├── AiPanel.tsx
│   │   └── AiConfigPanel.tsx
│   └── lib/                  # 业务逻辑（无 JSX）
│       ├── types.ts          # 核心类型定义
│       ├── constants.ts      # 全局常量
│       ├── scanner.ts        # 文件扫描
│       ├── natural-sort.ts   # 自然排序
│       ├── mover.ts          # 安全文件移动
│       ├── queue.ts          # 队列纯函数
│       ├── useAppState.ts    # 主业务 Hook
│       ├── ai-types.ts       # AI 类型 + 预设
│       ├── ai-service.ts     # AI API 调用
│       ├── ai-image.ts       # 图片预处理
│       ├── ai-engine.ts      # AI 分析引擎
│       └── useAiConfig.ts    # AI 配置 Hook
├── tests/
│   ├── queue.test.ts         # 队列测试（15 用例）
│   ├── natural-sort.test.ts  # 排序测试（9 用例）
│   └── ai-engine.test.ts     # AI 引擎测试（3 用例）
├── index.html
├── vite.config.ts
├── tsconfig.json
├── tsconfig.app.json
├── tsconfig.node.json
├── eslint.config.js
└── package.json
```

## TypeScript 约定

### 严格模式

- `erasableSyntaxOnly: true` — **禁止使用 `enum`**，使用字符串联合类型替代
- `verbatimModuleSyntax: true` — 类型导入必须用 `import type`
- `noUnusedLocals: true` / `noUnusedParameters: true` — 零未使用变量
- 禁止 `any` 类型

### 正确示例

```typescript
// 字符串联合替代 enum
type Category = 'delete' | 'keep' | 'stash' | 'favorite'

// 类型导入
import type { AiConfig, AiSuggestion } from './ai-types'

// 运行时导入
import { callAiApi } from './ai-service'
```

## 添加新的 AI Provider

1. 在 `src/lib/ai-types.ts` 的 `AI_PROVIDER_PRESETS` 数组中添加新项：

```typescript
{
  id: 'new-provider',
  name: 'New Provider',
  endpoint: 'https://api.example.com/v1/chat/completions',
  model: 'model-name',
  supportsVision: true,  // 是否支持 image_url
  requiresApiKey: true,
}
```

2. 如果 Provider 响应格式有特殊之处（如 DeepSeek 的 `<think>` 块），在 `src/lib/ai-service.ts` 的 `callAiApi` 中添加处理逻辑。

## 添加分类建议策略

`src/lib/ai-engine.ts` 的 `analyzeOnePhoto()` 是 AI 分析的入口。新增文件类型检查或预处理逻辑在此添加。

提示词模板在 `src/lib/ai-types.ts` 的 `AI_PRESETS` 数组中。

## CSS 设计系统

所有样式变量定义在 `src/index.css` 的 `:root` 中：

| 变量组 | 前缀 | 示例 |
|--------|------|------|
| 主色调 | `--primary` | 蓝色系，强调 |
| 分类色 | `--delete` / `--keep` / `--stash` / `--favorite` | 红/蓝/橙/绿 |
| 表面 | `--bg-app` / `--bg-card` / `--bg-elevated` | 深色渐变 |
| 边距 | `--radius-*` | sm/md/lg/xl |
| 过渡 | `--transition` | 200ms ease |

新增组件应使用 CSS 变量而非硬编码颜色值。

## 测试

```bash
# 运行所有测试
pnpm test

# 运行特定测试文件
pnpm test tests/queue.test.ts

# 监视模式
pnpm test -- --watch
```

测试使用 jsdom 环境，可模拟浏览器 DOM API。没有浏览器特定 API（如 File System Access API）的模块使用纯函数测试。

当前 27 个测试用例全部通过。

## 浏览器兼容性

需要 `FileSystemDirectoryHandle`（File System Access API）支持：

- Chrome/Edge 86+
- Opera 72+
- 不支持 Firefox、Safari

应用在 `WelcomeView` 中显示兼容性提示。

## 常见问题

### 如何调试 AI API 调用？

打开浏览器控制台，所有 AI API 调用输出 `[AI]` 前缀的日志。错误信息同时展示在 AiPanel 的进度界面和结果界面的失败详情区。

### 为什么照片没被分类？

1. 检查错误横幅是否有提示
2. 确认目标分类目录有写入权限
3. 确认照片文件可读（未被其他程序占用）
4. AI 预筛选只生成建议，需用户手动采纳才执行移动

### 构建产物大小

- JS: ~235 KB (gzip: ~72 KB)
- CSS: ~24 KB (gzip: ~5 KB)

无外部运行时依赖，仅 React + ReactDOM。
