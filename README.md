# dsh-fal-imagegen

fal.ai 原生生图的 DSH 插件（host 半，无自绘面板）。

## 为什么单独写一个

既有的 `@dickpy/dsh-imagegen` 只会说 OpenAI 生图协议：它把渠道 `apiUrl` 拼上 `/images/generations`、用 `Authorization: Bearer` 发请求、再解析 `data[].b64_json`。

fal 不是这套：

| | fal | OpenAI 兼容 |
| --- | --- | --- |
| 端点 | `https://queue.fal.run/<slug>` | `<base>/images/generations` |
| 鉴权 | `Authorization: Key <key_id>:<key_secret>` | `Authorization: Bearer <key>` |
| 流程 | POST 拿 queue ticket → 轮询 `status_url` → GET `response_url` | 单次请求返回结果 |
| 响应 | `{ images: [{ url, content_type, width, height }] }` | `{ data: [{ b64_json \| url }] }` |

所以这个插件自己实现整条链路：设置段 → fal 客户端 → Agent 工具。

## 配置

「设置 → 插件」里的 **fal 生图** 设置段（settings namespace `dsh-fal-imagegen`）：

| 字段 | 默认值 | 说明 |
| --- | --- | --- |
| `enabled` | `true` | 总开关（工具 + 提示词公告） |
| `falKey` | 空 | FAL_KEY，格式 `key_id:key_secret`（fal.ai → Keys 页面复制完整串） |
| `defaultTextToImageModel` | `openai/gpt-image-2.5/flare/text-to-image` | 文生图端点 |
| `defaultImageToImageModel` | `openai/gpt-image-2.5/flare/edit` | 图生图端点 |
| `defaultImageSize` | `1:1` | `1:1 / 4:3 / 3:4 / 3:2 / 2:3 / 16:9 / 9:16 / 21:9`、`1024x1536`、`auto` |
| `quality` | `high` | `auto / low / medium / high / xhigh / max` |
| `outputFormat` | `png` | `png / jpeg / webp` |
| `timeoutSeconds` | `300` | 单次请求总预算（提交 + 排队 + 取回） |
| `saveDir` | 空 | 图片落地目录；空 = `<DSH_HOME>/fal-imagegen` |
| `announceToAgent` | `true` | 是否在系统提示里公告本插件 |

设置卡片由本插件的**浏览器半**（`lib/client.js`）自己注册：宿主把「插件配置」页渲染成
「宿主提供的 settings namespace ∩ 注册进 `settings.plugin.item` 槽位的卡片」的交集，
所以纯 host 半的插件虽然可配置但不会出现在界面上。卡片注册的 key 就是 namespace
（`dsh-fal-imagegen`），保存时通过 `ctx.settingsScope` 写回同一段设置。

卡片外观与交互**对齐官方 `ui-settings-plugins` 的 PluginCard**（`lib/client.js` 里内联了同款
CSS，用的是同一套 `--dsw-alias-*` 语义 token）：一张 `<li>` 卡片，默认折叠，点标题行（带
chevron）展开；标题行右侧在有待保存改动时显示「未保存」；展开后每个字段带提示文案，
被用户层覆盖过的字段显示「已覆盖」+「恢复默认」；底部是「放弃修改 / 保存」，保存失败会
显示原因，保存成功后卡片自动收起。

卡片字段与上述 schema 一一对应；`falKey` 输入框是密码框、留空表示保持当前密钥
（密钥在所有 wire 视图里都会被宿主脱敏，所以卡片无法显示「已配置」状态，只有
写入成功的反馈）。也可以不用界面，直接编辑 `~/.dsh/settings.yaml` 的
`dsh-fal-imagegen:` 段（密钥在该文档中以明文保存，与 `dsh-imagegen` 插件一致）。

## Agent 工具

| 工具 | 作用 |
| --- | --- |
| `fal_generate_image` | 文生图：`prompt` / `model` / `size` / `quality` / `count` |
| `fal_edit_image` | 图生图：`prompt` + `source_image`（上次结果里的 `images[]` 元素）或 `image_path`（本机绝对路径） |
| `fal_list_image_models` | 列出内置别名、当前默认值与输出目录 |

生成的图片同时：① 作为附件显示在工具调用旁（模型侧只收到 attachment 引用与本地路径文本，纯文本模型也能用）；② 写入本地目录，返回的 `path` 可以直接喂给 `fal_edit_image` 的 `image_path` 做二次编辑。

## 内置别名

| 别名 | 文生图 slug | 图生图 slug | 尺寸参数 | quality |
| --- | --- | --- | --- | --- |
| `gpt-image-2.5-flare`（默认，别名还接受 `gpt-image-2.5` / `gpt-image-2.5-flash`） | `openai/gpt-image-2.5/flare/text-to-image` | `openai/gpt-image-2.5/flare/edit` | `image_size` | 支持 |
| `gpt-image-2.5-sunburst` | `openai/gpt-image-2.5/sunburst/text-to-image` | `openai/gpt-image-2.5/sunburst/edit` | `image_size` | 支持 |
| `gpt-image-2` | `openai/gpt-image-2` | `openai/gpt-image-2/edit` | `image_size` | 支持 |
| `gpt-image-1.5` | `fal-ai/gpt-image-1.5` | `fal-ai/gpt-image-1.5/edit` | `image_size` | 支持 |
| `nano-banana-2` | `fal-ai/nano-banana-2` | `fal-ai/nano-banana-2/edit` | `aspect_ratio` | 省略 |
| `gemini-25-flash-image` | `fal-ai/gemini-25-flash-image` | `fal-ai/gemini-25-flash-image/edit` | `aspect_ratio` | 省略 |
| `flux-2-flash` | `fal-ai/flux-2/flash` | `fal-ai/flux-2/flash/edit` | `image_size` | 省略 |

关于命名：**fal 上没有 `gpt image 2.5 flash`**。GPT Image 2.5 在 fal 只有两个变体 —— `flare`（官方定位「面向多数应用的默认档：快、质量高」）和 `sunburst`（细节优先、更慢更贵）。本插件默认用 `flare`，并额外接受 `gpt-image-2.5-flash` 这个别名，避免每次都要纠正叫法。

任何其他 fal slug（含 `/`）都可以直接传给 `model`，插件原样调用；不认识的 slug 若用于图生图且不是 `/edit` 端点，会直接报错而不是发出无效请求。

## 安装

### 从 npm 装（推荐）

```sh
# 由 dsh CLI 管理的 profile（web / headless / 自定义）：
dsh plugin --profile web add dsh-fal-imagegen

# 之后重启：dsh 管理的 profile 重启对应进程，DSH Desktop 则完整退出再打开
```

**desktop profile 例外**：它由 DSH Desktop 应用独占管理（`dsh plugin --profile desktop` 会被拒绝），请用
「设置 → 插件市场」安装，或手动登记两处后再重启应用：

```
~/.dsh/profiles/desktop/package.json  →  "dependencies": { "dsh-fal-imagegen": "0.1.0" }
                                      →  "dsh": { "profile": { "bundles": [ …, "dsh-fal-imagegen" ] } }
```

安装完在「设置 → 插件 → 插件配置」展开「fal 生图」卡片填 FAL_KEY，或直接写
`~/.dsh/settings.yaml` 的 `dsh-fal-imagegen:` 段。

### 从源码开发（本地链接）

```sh
git clone https://github.com/Enchanted0911/dsh-fal-imagegen
cd ~/.dsh/profiles/desktop
# dependencies 加 "dsh-fal-imagegen": "link:/path/to/dsh-fal-imagegen"
# dsh.profile.bundles 末尾加 "dsh-fal-imagegen"
pnpm install
# 然后完整退出并重新打开 DSH Desktop
```

插件运行所需的 `@deepseek-ai/dsh-tools`、`dsh-attachment`、`dsh-settings`、`schemastery`
由宿主提供（宿主有自己的 profile 模块解析器，接受指向 profile 之外的软链）。
源码目录下的 `node_modules/` 只是让离线测试能在宿主之外加载本包。

## 改动后如何生效

插件是以 `link:` 注册进 desktop profile 的（`~/.dsh/profiles/desktop/node_modules/dsh-fal-imagegen` 指向本目录），
源码改动**不需要重跑 `pnpm install`**：

| 改了什么 | 怎么生效 |
| --- | --- |
| 浏览器半（`lib/client.js`） | **刷新页面**即可。宿主的 client-modules 服务会监听 bundle 文件并按内容哈希刷新 rev，页面重新拉取到新版本 |
| host 半（`lib/index.js`、`lib/fal.js`、`lib/presets.js`、`lib/image-meta.js`） | **重启 DSH Desktop**（完整退出再打开）。宿主进程只在启动时 import 插件 |
| `package.json`（exports / `dsh.client` / patch） | **重启 DSH Desktop** |

## 插件市场目录源

DSH 社区市场**没有默认目录源**（官方 v1 契约明确写了没有默认、优先或兜底来源），所以想让人在
市场里浏览到这个插件，需要一个目录源。本仓库自带一个符合该契约的目录源：

- `catalog/entry.mjs` — 唯一数据源（插件条目 + manifest/page 构造）
- `catalog/worker.js` — Cloudflare Worker 形态：`/catalog-source.json` 与 `/v1/plugins`
  （endpoint 路径以 `/v1/plugins` 结尾、同源、`application/json`，这是推荐形态）
- `catalog/static/` — 静态托管形态（GitHub Pages 等）；静态主机按扩展名给 content-type，
  无扩展名的 `/v1/plugins` 通常会是 `application/octet-stream`，若市场拒绝就改用 Worker

部署后把这个 URL 登记到「设置 → 插件市场 → 来源」：

```
https://dsh-fal-imagegen-catalog.<account>.workers.dev/catalog-source.json
```

## 本地自测

```sh
cd ~/dsh-fal-imagegen

# 离线：不需要 key、不联网
node tests/fal-manifest-test.mjs             # 清单契约：patch 行名、exports、dsh.client、wrapper id
node tests/fal-client-test.mjs               # 浏览器半：槽位注册、卡片两种状态、保存写出的 ops
node tests/fal-settings-roundtrip-test.mjs   # 两半的接缝：卡片写 → 宿主读、reset 回退、开关门控
node tests/fal-schema-test.mjs               # 工具参数与输出 schema

# 真调用（消耗 fal 额度）
FAL_KEY='<key_id>:<key_secret>' node tests/fal-host-test.mjs   # 仿真宿主：生成 + 图生图 + 附件/落盘 + 缺 key 失败路径
FAL_KEY='<key_id>:<key_secret>' node tests/fal-smoke.mjs       # 只测 fal 客户端（单次生成）
```

注：本机 `node` 不在 PATH 上，DSH 自带运行时在
`~/Library/Application Support/DSH Desktop/runtime-commands/generations/*/private/node-bin/node`。

## 已知限制

- 界面只有一张设置卡片：没有提示词面板、画廊或无限画布。要那些请用 `@dickpy/dsh-imagegen`（两者并存，工具名不冲突）。
- 一次工具调用是同步等待的（内部轮询 fal 队列），超时由 `timeoutSeconds` 控制；没有后台任务查询接口。
- `nano-banana-2` / `gemini-*` 端点只吃 `aspect_ratio`，传具体像素尺寸时会被降级成 `auto`。
- 生成消耗 fal 额度；图片由 fal 侧模型产出，内容不受本插件控制。
- 卡片文案只有中文（没有接 `ctx.locale`；要英文界面得自己加词典）。
