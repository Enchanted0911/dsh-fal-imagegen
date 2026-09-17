# dsh-fal-imagegen

**语言：** [English](README.md) · **中文** · [Español](README.es.md) · [العربية](README.ar.md) · [Français](README.fr.md) · [日本語](README.ja.md) · [한국어](README.ko.md)

面向 DeepSeek Harness (DSH) 的 [fal.ai](https://fal.ai) 原生生图插件：一张中英双语「fal 生图」设置卡片 + 四个 Agent 工具，端到端直连 fal 协议，中间不经过任何 OpenAI 兼容网关。

## 能力

- **原生 fal 协议** — `POST https://queue.fal.run/<slug>`，`Authorization: Key <key_id>:<key_secret>`，轮询队列票据（`status_url` → `response_url`），消费 `{ images: [{ url, width, height }] }`。
- **异步生图优先** — `fal_generate_image` 把任务提交进 fal 队列后立即返回 `task_id`；后台收集器自动跑完并落地成图片，`fal_get_image_task` 随时查询进度、取回成品（单次可最多等 120 秒）。想回到旧式同步等待，传 `wait=true` 即可。
- **设置卡片跟随 DSH 语言** — 「设置 → 插件 → 插件配置」里的 **fal 生图**：总开关、FAL_KEY、默认文生图/图生图端点、默认尺寸、质量档、输出格式、超时、输出目录、系统提示公告开关。卡片外观与交互对齐内置插件卡片（默认折叠、未保存标记、字段级恢复默认、保存/放弃），文案跟随 DSH 自己的语言（设置 → 常规 → 语言）：DSH 为中文时显示中文，其他语言一律显示英文——没有匹配语言时也默认英文。不做单独的切换按钮，永远和周围界面一致。
- **Agent 工具**：

  | 工具 | 作用 |
  | --- | --- |
  | `fal_generate_image` | 文生图，默认异步：`prompt` / `model` / `size` / `quality` / `count` / `wait` → 返回 `task_id` |
  | `fal_get_image_task` | 后台任务查询：进度、等待、取回成品（按 `task_id` 或 fal `request_id`；都不传则列出近期任务） |
  | `fal_edit_image` | 图生图，同步返回：`prompt` + 参考图（附件引用，或本机 `image_path`） |
  | `fal_list_image_models` | 列出内置别名、当前默认值与输出目录 |

- **产出可复用** — 每张图同时（1）作为附件显示在工具调用旁（模型侧只收到 attachment 引用与路径文本，纯文本模型也能用）；（2）写入本地 `<DSH_HOME>/fal-imagegen`；返回的 `path` 可直接交给 `fal_edit_image` 的 `image_path` 做二次编辑。
- **别名与 slug 全部核验** — 内置别名逐个对照 fal 官方端点 schema 验证过；未知 slug（含 `/`）原样透传；拿文生图端点到图生图上会直接报错，而不是发无效请求。

## 异步生图流程

`fal_generate_image` 不再让 Agent 卡在 fal 队列上：

1. 工具把任务提交进队列，fal 一接受就返回 `{ status: "queued", task_id, request_id, message, next_action, images: [] }`。
2. 后台收集器自动轮询队列、下载图片、存成附件并复制到输出目录——全程不占对话。
3. `fal_get_image_task`（必填 `task_id`，或 fal 的 `request_id`）返回 `queued / running / completed / failed`；带 `wait_seconds`（0–120）可以阻塞等待这么久；`completed` 时结果带完整 `images[]`（`attachment_id` + 本地 `path`），图片直接渲染在工具调用旁。
4. 不传 id 时列出近期任务（`task_id`、状态、模型、图片数）。

说明：任务记录存在当前宿主进程内（保留约 6 小时、最多 64 条）；后台等待超时的任务在下一次查询时会自动续查；`fal_edit_image` 保持同步，因为它的结果通常马上要作为下一步的输入。

## 内置别名

| 别名 | 文生图端点 | 图生图端点 | 尺寸参数 | quality |
| --- | --- | --- | --- | --- |
| `gpt-image-2.5-flare`（默认，也接受 `gpt-image-2.5` / `gpt-image-2.5-flash`） | `openai/gpt-image-2.5/flare/text-to-image` | `openai/gpt-image-2.5/flare/edit` | `image_size` | 支持 |
| `gpt-image-2.5-sunburst` | `openai/gpt-image-2.5/sunburst/text-to-image` | `openai/gpt-image-2.5/sunburst/edit` | `image_size` | 支持 |
| `gpt-image-2` | `openai/gpt-image-2` | `openai/gpt-image-2/edit` | `image_size` | 支持 |
| `gpt-image-1.5` | `fal-ai/gpt-image-1.5` | `fal-ai/gpt-image-1.5/edit` | `image_size` | 支持 |
| `nano-banana-2` | `fal-ai/nano-banana-2` | `fal-ai/nano-banana-2/edit` | `aspect_ratio` | 省略 |
| `gemini-25-flash-image` | `fal-ai/gemini-25-flash-image` | `fal-ai/gemini-25-flash-image/edit` | `aspect_ratio` | 省略 |
| `flux-2-flash` | `fal-ai/flux-2/flash` | `fal-ai/flux-2/flash/edit` | `image_size` | 省略 |

## 配置

| 字段 | 默认值 | 说明 |
| --- | --- | --- |
| `enabled` | `true` | 总开关（工具 + 提示词公告） |
| `falKey` | 空 | FAL_KEY，格式 `key_id:key_secret`（fal.ai → Keys 页面复制完整那一串） |
| `defaultTextToImageModel` | `openai/gpt-image-2.5/flare/text-to-image` | 默认文生图端点 |
| `defaultImageToImageModel` | `openai/gpt-image-2.5/flare/edit` | 默认图生图端点 |
| `defaultImageSize` | `1:1` | `1:1 / 4:3 / 3:4 / 3:2 / 2:3 / 16:9 / 9:16 / 21:9`、`1024x1536` 这样的像素对，或 `auto` |
| `quality` | `high` | `auto / low / medium / high / xhigh / max`（不提供质量档的端点会自动省略） |
| `outputFormat` | `png` | `png / jpeg / webp` |
| `timeoutSeconds` | `300` | 单次请求总预算（提交 + 排队 + 取回） |
| `saveDir` | 空 | 输出目录；空 = `<DSH_HOME>/fal-imagegen` |
| `announceToAgent` | `true` | 是否在系统提示里公告本插件 |

设置卡片与 `~/.dsh/settings.yaml` 的 `dsh-fal-imagegen:` 段读写同一份设置。`falKey` 是密码框：留空表示保持当前密钥（密钥在宿主所有 wire 视图里都会被脱敏）。

## 安装

### 从 npm 装（推荐，已上架）

`dsh-fal-imagegen@0.2.0` 已发布到 npm：

```sh
# 由 dsh CLI 管理的 profile（web / headless / 自定义）：
dsh plugin --profile web add dsh-fal-imagegen
# 装完重启对应进程
```

**desktop profile 例外**：它由 DSH Desktop 应用独占管理（`dsh plugin --profile desktop` 会被拒绝），请用
「设置 → 插件市场」安装，或手动登记 `~/.dsh/profiles/desktop/package.json`（依赖 + `dsh.profile.bundles`），
然后完整退出并重新打开 DSH Desktop。

装完在「设置 → 插件 → 插件配置」展开「fal 生图」卡片填 FAL_KEY，或直接写
`~/.dsh/settings.yaml` 的 `dsh-fal-imagegen:` 段。

### 从 git 装（备用路径）

```sh
dsh plugin --profile web add github:Enchanted0911/dsh-fal-imagegen
```

### 从源码开发

```sh
git clone https://github.com/Enchanted0911/dsh-fal-imagegen
# 把仓库 link: 进一个 profile（依赖 + dsh.profile.bundles），然后重启 DSH Desktop
```

运行时依赖（`@deepseek-ai/dsh-tools`、`dsh-attachment`、`dsh-settings`、`schemastery`）由宿主提供；
源码树里的 `node_modules/` 只为了让离线测试能在宿主之外加载本包。

## 开发与自测

离线测试（不需要 key、不联网）：

```sh
node tests/fal-manifest-test.mjs             # 清单契约：patch 行、exports、dsh.client、wrapper id
node tests/fal-client-test.mjs               # 浏览器半：槽位注册、卡片状态、保存写出、双语切换
node tests/fal-settings-roundtrip-test.mjs   # 两半接缝：卡片写 → 宿主读、reset 回退、开关门控
node tests/fal-schema-test.mjs               # 工具参数与输出 schema
node tests/fal-tasks-test.mjs                # 异步路径：提交 → 后台完成 → 查询，用假的 fal 队列
```

真调用测试（消耗 fal 额度）：

```sh
FAL_KEY='<key_id>:<key_secret>' node tests/fal-host-test.mjs   # 仿真宿主：生成 + 图生图 + 附件/落盘 + 失败路径
FAL_KEY='<key_id>:<key_secret>' node tests/fal-smoke.mjs       # 只测 fal 客户端（单次生成）
```

本地链接安装下改代码的生效方式：浏览器半（`lib/client.js`）改动刷新页面即可；host 半改动与
`package.json` 清单改动需要重启 DSH Desktop。

## 插件市场目录源

DSH 社区市场没有默认来源；本仓库自带一个符合 v1 契约的目录源（`catalog/`，数据源见
`catalog/entry.mjs`）。部署 Cloudflare Pages 形态，然后在「设置 → 插件 → 插件市场 → 来源」添加：

```sh
npx wrangler pages deploy catalog/pages --project-name dsh-fal-imagegen-catalog
# 然后添加 https://dsh-fal-imagegen-catalog.pages.dev/catalog-source.json 作为来源
```

## 已知限制

- 只文档化 `aspect_ratio` 的端点（nano-banana / gemini）会把显式像素尺寸降级成 `auto`。
- 生成消耗 fal 额度；图片内容由 fal 侧模型产出。