# Photo Quick Filter

一个本地照片快速筛选工具。选择照片文件夹后，可以用方向键把照片快速移动到不同分类目录，也可以让 AI 先给出分类建议，再由你确认采纳。

## 主要功能

- 本地处理照片，不需要上传照片文件。
- 支持方向键快速分类：待删除、保留、暂存、精选。
- 支持撤销上一步操作。
- 自动保留原有子目录结构。
- 分类目录会被自动排除，避免重复扫描。
- 支持可选 AI 预筛选，AI 只生成建议，不会自动移动文件。

## 浏览器要求

请使用支持 File System Access API 的桌面浏览器：

- Chrome 86+
- Edge 86+

## 支持格式

JPG / JPEG / PNG / WebP / GIF / BMP / HEIC / HEIF

说明：部分浏览器无法直接预览 HEIC / HEIF，但仍然可以对这些文件进行分类移动。

## 分类规则

| 快捷键 | 分类 | 目标目录 |
| --- | --- | --- |
| ↑ | 待删除 | `_delete_review/` |
| ↓ | 保留 | `_keep/` |
| ← | 暂存 | `_stash/` |
| → | 精选 | `_favorite/` |
| Ctrl+Z / Cmd+Z | 撤销上一步 | 恢复到原目录 |
| Enter | 采纳当前 AI 建议 | 移动到建议目录 |

## 安装和运行

```bash
pnpm install
pnpm dev
```

启动后打开终端中显示的本地地址，通常是：

```text
http://localhost:5173/
```

## 生产构建

```bash
pnpm build
pnpm preview
```

## 检查命令

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

## AI 预筛选

AI 预筛选是可选功能。打开页面后点击“AI 预筛选”，填写 API 地址、API Key 和模型名称，再选择提示词模板即可开始分析。

内置服务商配置包括 OpenAI、DeepSeek、SiliconFlow、Google Gemini 和阿里千问。不同服务商对图片输入的支持不同；如果服务商不支持图片输入，工具会根据文件名、大小、时间等信息进行粗略判断。

## 安全说明

- “待删除”只是把照片移动到 `_delete_review/`，不会永久删除。
- 文件移动采用先写入目标位置、再删除原文件的方式，尽量避免丢失。
- 如果目标目录存在同名文件，会自动追加后缀，不会覆盖已有文件。
- 分类目录不会被再次扫描，避免重复处理。
