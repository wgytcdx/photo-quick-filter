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

请使用支持 File System Access API 的浏览器：

- Chrome 86+
- Edge 86+

安卓网页模式会优先尝试同一套目录读写能力。选择相册目录后，工具会先创建并删除一个临时探针文件，确认当前浏览器确实能写入和删除所选目录；如果验证失败，请不要继续用网页端整理原图，应改用 APK 路线。

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

移动端触控：

| 手势 | 分类 |
| --- | --- |
| 上滑 | 待删除 |
| 下滑 | 保留 |
| 左滑 | 暂存 |
| 右滑 | 精选 |
| 长按照片或撤销按钮 | 撤销上一步 |

## 安装和运行

```bash
pnpm install
pnpm dev
```

启动后打开终端中显示的本地地址，通常是：

```text
http://localhost:5173/
```

手机同网调试可以使用：

```bash
pnpm dev -- --host 0.0.0.0
```

然后在手机 Chrome 中访问电脑局域网 IP 对应的地址。正式部署必须使用 HTTPS，否则浏览器可能拒绝目录选择能力。

## 生产构建

```bash
pnpm build
pnpm preview
```

## Android APK 路线

网页端如果在安卓 Chrome 中提示不支持 File System Access API，可以使用 APK 路线。APK 不调用浏览器的 `showDirectoryPicker()`，而是通过 Capacitor 原生插件 `PhotoLibrary` 使用 Android Storage Access Framework 选择可写照片目录。

前置条件：

- Android Studio
- JDK 17+
- 一台开启 USB 调试的 Android 手机

```bash
pnpm android:sync
pnpm android:open
```

在 Android Studio 中运行到手机，点击“选择照片文件夹”后会弹出 Android 系统目录授权界面。请选择 `DCIM/Camera` 或你要整理的可写照片目录。

本地打 debug APK：

```bash
pnpm android:debug
```

APK 模式能力：

- 递归扫描授权目录中的 JPG / PNG / WebP / GIF / BMP / HEIC / HEIF。
- 在授权目录下创建 `_delete_review`、`_keep`、`_stash`、`_favorite`。
- 分类时复制到目标目录后删除原文件，避免直接覆盖。
- 撤销时从分类目录复制回原目录，并删除分类目录中的文件。
- AI 预筛选继续复用云端视觉模型流程，原生层会为前端提供压缩后的图片 data URL。

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
