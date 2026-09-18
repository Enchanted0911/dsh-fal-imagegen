# 发布到社区：待办与命令

这份文档记录把本插件发布到 DSH 社区所需的步骤、已经备好的东西，以及**只有仓库所有者能做**的授权动作。

## 已经备好的（无需账号）

- [x] `package.json` 可发布：去掉 `private`、补 `description` / `keywords`（含 `dsh-plugin`）/ `author` /
      `repository` / `homepage` / `bugs` / `publishConfig: { access: public, registry: npmjs }`、
      `files` 打包 `lib` + `cordis.patch.yml` + `README.md`（及 6 个语言版本 `README.zh/es/ar/fr/ja/ko.md`）+ `LICENSE`
- [x] `LICENSE`（MIT，署名 wujunsheng，不含邮箱）
- [x] `.gitignore`
- [x] 符合 dsh-community-market v1 契约的目录源：`catalog/entry.mjs`（唯一数据源）、
      `catalog/worker.js`（Cloudflare Worker）、`catalog/static/`（静态托管形态，由
      `node catalog/build-static.mjs <origin>` 生成）
- [x] 本地 git 仓库与首个提交（仓库内 `user.email` 设为 GitHub noreply，避免公开工作邮箱）
- [x] 发布闸门 `tests/fal-publish-test.mjs`（离线校验可发布性：非 private、精确稳定版本、`dsh.bundle.patch` 安全相对路径且存在、
      exports 与 `dsh.client.platform`、tarball 覆盖 lib/patch/README/LICENSE、发布文件里不含任何凭据形态、目录源与 package.json 一致）
- [x] 一键发布脚本 `scripts/release.sh`（闸门 → 认证检查 → 发布 → registry 回读校验）
- [x] README 面向使用者改写：npm 安装 / 源码开发两条路径、目录源说明、本机路径已去除

## 需要你做的（按顺序）

### 1. npm 认证

本机没有 npm CLI，也**没有** `~/.npmrc` token，所以发布必须由你授权。二选一：

```sh
# A. 交互式登录（在 DSH 终端或你的终端里；pnpm 走 npm registry 的登录流程）
pnpm login

# B. 网页创建 Granular Access Token（推荐，可限定只允许这个包）
#    npmjs.com → Access Tokens → Generate New Token → Granular Access Token
#    Permissions: Read and write；Packages: dsh-fal-imagegen
#    然后把 token 写进 ~/.npmrc（不要贴到聊天里）：
echo '//registry.npmjs.org/:_authToken=npm_xxxxxxxx' >> ~/.npmrc
chmod 600 ~/.npmrc
```

本机 `pnpm` 在 DSH 运行时里，如果终端里没有：

```sh
"$HOME/Library/Application Support/DSH Desktop/runtime-commands/generations/"*/bin/pnpm login
```

### 2. 发布 npm 包

```sh
cd ~/dsh-fal-imagegen
./scripts/release.sh        # 先跑离线闸门，再检查认证、发布、从 registry 回读校验
```

只想手动来：

```sh
pnpm publish --no-git-checks          # publishConfig 已指定 public + npmjs
npm view dsh-fal-imagegen version     # 期望输出 0.2.0
```

包名 `dsh-fal-imagegen` 目前**未被占用**（2026-09-17 查 registry 返回 404）。若你想放到 scope 下
（`@yourname/dsh-fal-imagegen`），把 `package.json` 的 `name` 改掉并保证 `publishConfig.access: public`。

### 2.1 若 publish 报 E403（2FA）

```
[E403] 403 Forbidden - PUT https://registry.npmjs.org/<pkg>
Two-factor authentication or granular access token with bypass 2fa enabled is required to publish packages.
```

这是 npm 账户开了 2FA、而 `~/.npmrc` 里的 token 没有「绕过 2FA」权限。二选一：

- **推荐**：npmjs.com → Access Tokens → Generate New Token → **Granular Access Token**，
  Permissions 选 Read and write，Packages 选 **All packages**（包尚未存在时选不了具体包），
  并**勾选 Bypass two-factor authentication (2FA)**；生成后替换 `~/.npmrc` 里那一行 token。
- 或用一次性验证码：`pnpm publish --no-git-checks --otp=<6 位动态码>`（30 秒内有效）。

### 3. 建 GitHub 仓库并推送

本机 `gh` 未安装，`ssh -T git@github.com` 返回 `Permission denied (publickey)`，也就是说现有 SSH key
没有注册到 GitHub。你需要：

```sh
# 在 GitHub 网页新建 public 仓库 dsh-fal-imagegen（不要勾选初始化 README）
# 然后把公钥加到账号（Settings → SSH keys），或改用 HTTPS + PAT
cat ~/.ssh/id_rsa.pub

cd ~/dsh-fal-imagegen
git remote add origin git@github.com:Enchanted0911/dsh-fal-imagegen.git
git push -u origin main
```

GitHub 用户名已确认：**Enchanted0911**。`package.json` 与 `catalog/entry.mjs` 里的仓库 URL
均已指向 `https://github.com/Enchanted0911/dsh-fal-imagegen`（署名仍写 `wujunsheng`，不含邮箱）。

推送后在仓库页面 **Topics** 加 `dsh-plugin`（`find_dsh_plugin` 工具与 awesome 列表都按这个 topic 搜索）。

### 4. 目录源（想让人在插件市场里浏览到才需要）

**推荐 Cloudflare Pages 形态**（`.workers.dev` 在部分网络会被 SNI 过滤；`.pages.dev` 通常可达）：

```sh
cd ~/dsh-fal-imagegen
npx wrangler pages deploy catalog/pages --project-name dsh-fal-imagegen-catalog
# 部署后将输出 https://dsh-fal-imagegen-catalog.pages.dev
curl -s https://dsh-fal-imagegen-catalog.pages.dev/catalog-source.json | head
curl -s -o /dev/null -w '%{content_type}\n' https://dsh-fal-imagegen-catalog.pages.dev/v1/plugins
# 期望 application/json
```
然后在 DSH「设置 → 插件市场 → 来源」添加 `https://dsh-fal-imagegen-catalog.pages.dev/catalog-source.json`。

Worker 形态（国际市场可达时）：

```sh
cd ~/dsh-fal-imagegen/catalog
npx wrangler deploy
```


```sh
cd ~/dsh-fal-imagegen/catalog
npx wrangler deploy        # 需要 Cloudflare 账号，免费额度足够
# 部署后会输出 https://dsh-fal-imagegen-catalog.<account>.workers.dev
# 自己验一下：
curl -s https://dsh-fal-imagegen-catalog.<account>.workers.dev/catalog-source.json
curl -s -o /dev/null -w '%{content_type}\n' https://dsh-fal-imagegen-catalog.<account>.workers.dev/v1/plugins
```

然后在 DSH「设置 → 插件市场 → 来源」里添加
`https://dsh-fal-imagegen-catalog.<account>.workers.dev/catalog-source.json`。

静态托管形态（不想开 Cloudflare）：

```sh
node catalog/build-static.mjs https://enchanted0911.github.io/dsh-fal-imagegen
# 把 catalog/static/ 作为 GitHub Pages 站点根（main 分支的 /docs 或专用分支）
```

注意：静态主机按扩展名决定 content-type，无扩展名的 `/v1/plugins` 通常会被服务成
`application/octet-stream`；若市场拒收，就回到 Worker 形态。

### 5. 提交到 awesome 列表（可选，条目已备好）

**关于「发到社区的插件市场」的事实**（2026-09-17 查证）：

- DSH 社区市场**没有默认来源**，也**没有唯一的中央收录处**。插件到达用户有四条通道：
  1. **自建目录源**（第 4 步）——任何用户添加 manifest URL 即见即装，无需任何批准；
  2. **awesome-dsh-plugin.com**——官方策展列表，PR 制，条目是一个 YAML 文件；
  3. **dshfind / DSH 1024Store**——合作目录源，**每日从 GitHub 自动同步**（dshfind 宣称每日；1024Store 有筛选流程），
     无作者侧提交接口，只能等收录；收录后是否带「可安装」取决于它们是否补上 npm 安装证据；
  4. `dsh-plugin` topic——仓库发现层的底色（`dsh-find-plugin` 直接搜它）。
- 本插件条件核验：public 仓库 ✓ · `dsh-plugin` topic ✓ · `package.json` 声明 `dsh.bundle`（bundle.patch）✓ ·
  npm 已发布且 `repository` 指回本仓库 ✓（可与列表条目自动关联下载量）· 真实代码非空壳 ✓。
  **唯一硬门槛：仓库创建满 24 小时**（CI 自动查）。本仓库 created 2026-09-17T07:54:53Z，
  **2026-09-18 07:54Z 之后即可提 PR**。

提 PR（fork https://github.com/awesome-dsh-plugin/awesome-dsh-plugin，加一个文件
`data/plugins/Enchanted0911__dsh-fal-imagegen.yml`，内容就是仓库里的 `community/awesome-entry.yml`）：

```yaml
url: https://github.com/Enchanted0911/dsh-fal-imagegen
name: Enchanted0911/dsh-fal-imagegen
category: tools
description:
  en: 'fal.ai-native image generation for DeepSeek Harness: an async-first fal_generate_image with a fal_get_image_task background-task API, plus fal_edit_image and fal_list_image_models, and a settings card that follows the DSH language.'
  zh: 'fal.ai 原生生图插件：异步 fal_generate_image + fal_get_image_task 后台任务查询 + fal_edit_image / fal_list_image_models，设置卡片跟随 DSH 语言。'
```

不要手改它的 README（脚本生成），一个 PR 最多 3 条。想加截图：仓库根放 `screenshots.json` 列 1-8 张本地路径即可。

### 6. 检查合作目录源收录状态

被收录是被动等（每日同步），可用这几条命令复查（无需登录）：

```sh
# dshfind（14k+ 条）：输出 True 说明条目已被同步
curl -s https://api.dshfind.com/v1/catalog | python3 -c "import json,sys; print('ENCHANTED0911' in json.dumps(json.load(sys.stdin)['data']).upper())"
# dsh 1024Store（13k+ 条）：搜索命中即已收录
curl -s 'https://deepseek1024.com/api/v2/plugins?q=Enchanted0911&limit=5' | python3 -c "import json,sys; import json as j; d=j.load(sys.stdin); print('total:', d['total'])"
```

## 发布后自检

```sh
npm view dsh-fal-imagegen            # 元数据：repository / keywords / version
# 用另一个 profile 试装（不要动 desktop profile）
dsh plugin --profile web add dsh-fal-imagegen
dsh --profile web --dump-config | grep -A2 fal-imagegen
```

## 不要做的事

- 不要把 FAL_KEY 写进仓库任何文件（密钥只应存在本机 `~/.dsh/settings.yaml` 或环境变量里）
- 不要在聊天里粘贴 npm token / GitHub PAT
- 不要在 desktop profile 上用 `dsh plugin --profile desktop`（应用独占管理，会被拒绝）
