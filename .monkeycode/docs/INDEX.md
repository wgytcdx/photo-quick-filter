# Photo Quick Filter — 项目文档索引

本地照片快速分类工具。通过浏览器 File System Access API 直接操作本地文件，无需后端服务器或数据库。支持 AI 视觉预筛选辅助分类。

## 技术栈

| 层面 | 技术 |
|------|------|
| 框架 | React 19 + TypeScript 6 |
| 构建 | Vite 8 |
| 测试 | Vitest 4 (jsdom) |
| 包管理 | pnpm |
| 样式 | CSS Variables 暗色主题 |

## 文档导航

| 文档 | 说明 |
|------|------|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | 系统架构、模块关系、数据流 |
| [INTERFACES.md](./INTERFACES.md) | 类型定义、接口契约、API 格式 |
| [DEVELOPER_GUIDE.md](./DEVELOPER_GUIDE.md) | 开发指南、命令、约定、常见问题 |

## 模块速览

| 模块 | 路径 | 职责 |
|------|------|------|
| 类型系统 | `src/lib/types.ts` | `Category`、`PhotoEntry`、`ActionRecord`、`Stats` |
| 常量 | `src/lib/constants.ts` | 分类映射、扩展名、键盘绑定 |
| 文件扫描 | `src/lib/scanner.ts` | `scanDirectory()` 递归遍历 |
| 自然排序 | `src/lib/natural-sort.ts` | `naturalCompare()` 中文自然序 |
| 安全移动 | `src/lib/mover.ts` | `movePhoto()` / `undoMove()` 先写后删 |
| 队列管理 | `src/lib/queue.ts` | classify / undo / stats 纯函数 |
| AI 类型 | `src/lib/ai-types.ts` | `AiConfig`、`AiSuggestion`、`AiUsage`、预设 |
| AI 服务 | `src/lib/ai-service.ts` | `callAiApi()` / `testAiConnection()` 视觉/文本双模式 |
| AI 图片 | `src/lib/ai-image.ts` | `prepareImage()` Canvas 缩放压缩 |
| AI 引擎 | `src/lib/ai-engine.ts` | `analyzeOnePhoto()` 单张分析 |
| AI 配置 | `src/lib/useAiConfig.ts` | localStorage 持久化配置管理 |
| 应用状态 | `src/lib/useAppState.ts` | 核心业务逻辑 Hook |

## 组件树

```
App
├── Header            # 标题 + 重新选择
├── StatusBar         # 统计信息
├── ErrorBanner       # 错误横幅
├── WelcomeView       # 欢迎页（未选文件夹）
├── CompletionView    # 完成页（全部处理完）
├── PhotoViewer       # 照片预览区
├── ActionBar         # 操作按钮面板
│   ├── ActionButton×4
│   ├── AdoptBtn
│   └── UndoBtn
├── RecentActions     # 最近操作列表
└── AiPanel（模态框）
    ├── AiConfigPanel    # API 配置
    ├── AiProgressView   # 进度界面
    └── AiResultsView    # 结果 + Token 统计
```
