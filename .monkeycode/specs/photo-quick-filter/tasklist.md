# 需求实施计划

- [ ] 1. 初始化项目脚手架
   - 使用 Vite 创建 React + TypeScript 项目，配置 pnpm 包管理器
   - 配置 TypeScript (`erasableSyntaxOnly`、`verbatimModuleSyntax`、`noUnusedLocals`、`noUnusedParameters`)
   - 配置 ESLint、Vitest 测试框架 (jsdom 环境)

- [ ] 2. 实现核心数据类型和常量
  - [ ] 2.1 定义 `Category` 类型与 `PhotoEntry`、`ActionRecord`、`QueueState`、`Stats` 等核心接口
    - `Category` 为 `'delete' | 'keep' | 'stash' | 'favorite'` 字符串联合类型
    - `PhotoEntry` 包含文件句柄、路径、大小、修改时间
    - `ActionRecord` 记录每次分类操作的完整信息（含 AI 相关可选字段）
    - `Stats` 按分类统计处理进度

  - [ ] 2.2 定义常量表
    - 分类目录名 `CATEGORY_DIR_NAMES`、排除目录 `EXCLUDED_DIRS`
    - 支持的照片扩展名 `PHOTO_EXTENSIONS`（jpg/jpeg/png/webp/gif/bmp/heic/heif）
    - 不可预览扩展名 `UNPREVIEWABLE_EXTENSIONS`（heic/heif）
    - 分类标签 `CATEGORY_LABELS`、颜色 `CATEGORY_COLORS`、键盘映射 `CATEGORY_KEYS`、`KEY_TO_CATEGORY`

  - [ ]* 2.3 为常量和类型编写验证性单元测试
    - 验证 `CATEGORY_LABELS` 对四分类全覆盖
    - 验证 `KEY_TO_CATEGORY` 方向键映射正确

- [ ] 3. 实现文件扫描与自然排序
  - [ ] 3.1 实现 `scanner.ts` 递归扫描模块
    - `getExtension()` 提取文件扩展名
    - `scanDirectory()` 递归遍历目录，跳过排除目录、过滤照片文件
    - 读取文件元数据（大小、修改时间），构建 `PhotoEntry[]`
    - 递归处理子目录保持 `relativePath`

  - [ ] 3.2 实现 `natural-sort.ts` 自然排序算法
    - 按数字部分数值比较（`photo2` < `photo10`）
    - 非数字部分按 `localeCompare('zh-CN')` 字典序比较
    - 支持路径中包含数字的混合场景

  - [ ]* 3.3 为扫描器和自然排序编写单元测试
    - 测试 `naturalCompare`：纯数字、纯文本、混合、相等、路径场景
    - 测试 `scanDirectory`：空目录、有照片、含排除目录、子目录递归

- [ ] 4. 检查点 - 确保核心扫描模块测试通过

- [ ] 5. 实现安全文件移动与撤销
  - [ ] 5.1 实现 `mover.ts` 安全移动模块
    - `movePhoto()`：写→关闭→校验→删除原文件，写入失败回滚，删除失败清理目标
    - `undoMove()`：从分类目录写回原目录，成功后再删除分类目录中的副本
    - `ensureSubDirs()` 递归创建子目录保持原始目录结构
    - `findUniqueName()` 处理重名冲突（自动追加 `_1`、`_2`，兜底时间戳哈希）
    - 错误消息使用中文

  - [ ]* 5.2 为 mover 编写单元测试
    - 测试正常移动流程
    - 测试撤销后文件恢复
    - 测试重名去重逻辑

- [ ] 6. 实现队列管理与状态计算
  - [ ] 6.1 实现 `queue.ts` 纯函数模块
    - `initialQueueState()` 返回空队列状态
    - `getCurrentPhoto()` 获取当前查看的照片
    - `classify()` 从列表移除已分类照片，追加到撤销栈
    - `undo()` 从撤销栈弹回原位置
    - `computeStats()` 按分类统计总数/剩余/各类数量
    - `isComplete()` 判断是否全部分类完成
    - `getRecentActions()` 获取最近 N 条操作（倒序）

  - [ ]* 6.2 为队列逻辑编写单元测试
    - 测试 classify 移除与撤销栈追加
    - 测试 undo 恢复到原始位置（含 updatedPhoto 参数场景）
    - 测试 computeStats 分类统计正确性（total = 各分类之和 + remaining）
    - 测试 isComplete 与 getRecentActions 边界条件

- [ ] 7. 实现核心 UI 组件
  - [ ] 7.1 实现 `Header` - 顶部应用标题 + 重新选择文件夹按钮
  - [ ] 7.2 实现 `StatusBar` - 六列统计栏（总/剩余/待删除/保留/暂存/精选）
  - [ ] 7.3 实现 `PhotoViewer` - 照片预览区
    - 异步加载图片（File System Access API → ObjectURL）
    - 卸载时清理 ObjectURL
    - 不可预览格式（HEIC/HEIF）显示黑图提示
    - 加载失败显示错误提示
    - 底部显示文件名/路径/大小/修改日期
    - 当有 AI 建议时叠加彩色 badge 卡片（分类/置信度/理由）

  - [ ] 7.4 实现 `ActionBar` - 操作面板
    - 四分类按钮按十字排列（↑删除/↓保留/←暂存/→精选），显示颜色和快捷键
    - 采纳 AI 建议按钮（仅当前照片有建议时显示，标注 Enter 快捷键）
    - 撤销上一步按钮（标注 Ctrl+Z）
    - 底部安全提示（待删除仅移动到 _delete_review 目录）
    - `disabled` 状态（移动中时全部禁用）

  - [ ] 7.5 实现 `RecentActions` - 最近操作列表
    - 展示最近 5 条操作记录（分类 / 文件名 / → 目标目录）
    - AI 采纳操作显示 "AI" 标签
    - 按分类颜色高亮

  - [ ] 7.6 实现 `CompletionView` - 分类完成页
    - 显示四分类统计数据 + 对应目录名
    - "选择新文件夹"按钮

  - [ ] 7.7 实现 `WelcomeView` / `UnsupportedView` - 入口页
    - 未选择文件夹时显示引导
    - 浏览器不支持 File System Access API 时显示提示

  - [ ] 7.8 实现 `ErrorBanner` - 错误横幅
    - 显示错误文本 + 关闭按钮

  - [ ]* 7.9 为核心 UI 组件编写交互测试

- [ ] 8. 实现主应用状态钩子与 App 组件
  - [ ] 8.1 实现 `useAppState` 钩子
    - 浏览器支持检测（`showDirectoryPicker`）
    - `selectFolder`：调用 `showDirectoryPicker` → `scanDirectory` → 初始化队列
    - `classifyPhoto`：`movePhoto` → `classify` 更新队列 → 清除该照片的 AI 建议
    - `adoptSuggestion`：采纳当前 AI 建议执行分类 → 标记 `isAiAdopted`/`aiBucket`/`aiConfidence`/`aiReason`
    - `adoptAllByBucket`：批量采纳同一分类的所有建议 → 依次移动，收集错误
    - `undoAction`：`undoMove` → `undo` 更新队列 → 恢复 AI 建议
    - `startAiPreprocess`：逐张分析照片，更新进度、累积建议（支持取消）
    - `cancelAiPreprocess`：中止 AI 预处理
    - `computeSuggestionStats`：统计 AI 建议的分布（各分类数 + 未建议数 + HEIC 数）

  - [ ] 8.2 实现 `App.tsx` 主组件
    - 状态分支路由：不支持 → 未选文件夹 → 完成 → 主界面
    - 全局键盘快捷键（方向键分类、Enter 采纳、Ctrl+Z 撤销）
    - 输入框内不触发键盘快捷键（`isEditableElement` 检测）
    - "AI 预筛选"按钮触发 AiPanel 模态框

  - [ ] 8.3 实现 `App.css` 暗色主题样式
    - 全局暗色背景 + 亮色文字
    - 各组件独立样式区（header/status-bar/photo-viewer/action-bar/recent-actions/error-banner 等）
    - AI 功能相关样式（provider-buttons/test-result/breakdown/confidence/summary/detail-toggle）

- [ ] 9. 检查点 - 确保核心分类流程可运行、测试通过

- [ ] 10. 实现 AI 预筛选子系统
  - [ ] 10.1 定义 AI 类型系统 (`ai-types.ts`)
    - `AiConfig`（endpoint/key/model/maxImageSize）
    - `AiSuggestion`（bucket/confidence/reason）
    - `AiPreset`（id/name/description/prompt）
    - `AiPhotoAnalysis`（photo/suggestion/error）
    - `AiPreprocessState`（phase/running/progress/abortController 等）
    - `AiProviderPreset` 接口 + `AI_PROVIDER_PRESETS`（OpenAI/DeepSeek/SiliconFlow）
    - `DEFAULT_AI_CONFIG` + `AI_PRESETS`（通用分类/质量筛选/内容优先）

  - [ ] 10.2 实现 `ai-service.ts` API 调用与响应解析
    - `callAiApi()`：构建 OpenAI 兼容请求（multimodal content + image_url + base64）
    - `stripThinkTags()`：移除 `\<think\>` 推理块（DeepSeek/Qwen 兼容）
    - `tryParseBucketJson()`：从文本中提取 `{bucket, confidence, reason}` JSON
    - `parseAiResponse()`：多级回退解析（直接JSON → 正则JSON块 → 最后花括号对）
    - HTTP 错误处理（401/429/400）→ 中文错误消息
    - `data.error` 对象检测（DeepSeek 在 body 中返回错误）
    - `testAiConnection()`：纯文本请求验证 API 连通性
    - `AiTestResult` 类型（success/message/model/latency）

  - [ ] 10.3 实现 `ai-image.ts` 图片预处理
    - `prepareImage()`：从 FileHandle 加载 → Image 对象 → Canvas 缩放到 `maxSize` → JPEG base64
    - ObjectURL 及时释放
    - HEIC/HEIF 返回 null

  - [ ] 10.4 实现 `ai-engine.ts` 分析引擎
    - `analyzeOnePhoto()`：检查可预览 → 缩放图片 → 调用 API → 返回 `AiPhotoAnalysis`
    - 不可预览格式返回友好提示

  - [ ] 10.5 实现 `useAiConfig.ts` AI 配置管理钩子
    - localStorage 持久化（config/presetId/customPrompt）
    - `saveConfig`/`clearConfig` 读写本地存储
    - `testConnection` 异步测试流程（含前置校验：API Key 和地址非空）
    - `effectivePrompt` 计算（自定义 vs 预设模板）
    - `isSaved` 状态检测

  - [ ] 10.6 实现 `AiConfigPanel` 配置面板组件
    - 服务商快速选择按钮组（高亮当前匹配的服务商）
    - API 地址/Key（密码框 + 脱敏显示）/模型输入
    - 测试连接按钮 + 结果展示（绿色成功卡片含模型名和延迟 / 红色失败卡片）
    - 保存/清除按钮 + 保存状态 badge
    - 预设提示词下拉选择 + 自定义 textarea（选中 "自定义" 时显示）
    - 预设选中时显示完整提示词预览
    - `disabled` 状态传递（moving 时全部禁用）

  - [ ] 10.7 实现 `AiPanel` 模态框组件（三阶段）
    - Phase `config`：嵌入 AiConfigPanel + 照片数量估算 + "开始 AI 预筛选"按钮 + 前置校验
    - Phase `progress`：进度条 + 已处理/总/建议/失败统计 + 当前文件名 + 取消按钮
    - Phase `results`/`cancelled`：`AiResultsView`
      - 摘要统计卡片（总/已建议/失败/HEIC）
      - 分类分布柱状条（百分比 + 条数）
      - 置信度分析（平均值 / 高置信≥80% / 低置信<50%）
      - 批量采纳按钮（按分类）
      - 可展开的建议详细列表
      - 清除建议/关闭按钮

  - [ ]* 10.8 为 AI 子系统编写测试
    - 测试 AI_PRESETS 完整性（3个预设、必填字段、包含四分类关键词、要求 JSON 格式）
    - 测试 `stripThinkTags` / `tryParseBucketJson` / `parseAiResponse` 各种输入
    - 测试 `testAiConnection` mock HTTP 响应

- [x] 11. 集成 DeepSeek 兼容性处理
  - [x] 11.1 增加 `\<think\>` 标签剥离
    - `stripThinkTags` 正则移除 `<think>...</think>` 推理块
    - 在 `parseAiResponse` 中作为第一步处理

  - [x] 11.2 增加响应解析鲁棒性
    - `max_tokens` 调至 1024（DeepSeek 推理块可能超 150 tokens）
    - `tryParseBucketJson` 返回 null 而非抛异常，支持干净回退链
    - `allJsonBlocks` 扫描：正则匹配 `{[^{}]*}` 遍历所有候选 JSON 块
    - 最后花括号对兜底提取

  - [x] 11.3 增强错误日志
    - HTTP 非 2xx：console.error 输出状态码 + 响应体片段
    - 空内容：console.error 输出完整响应 JSON
    - `AiApiFailure.rawContent` 字段暴露前 200 字符
    - 所有日志带 `[AI]` 前缀便于 DevTools 过滤

- [ ] 12. 最终检查点 - 确保全部测试通过、lint 无警告、类型检查通过、构建成功

