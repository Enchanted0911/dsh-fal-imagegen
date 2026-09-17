# 发布到社区：待办与命令

这份文档记录把本插件发布到 DSH 社区所需的步骤、已经备好的东西，以及**只有仓库所有者能做**的授权动作。

## 已经备好的（无需账号）

- [x] `package.json` 可发布：去掉 `private`、补 `description` / `keywords`（含 `dsh-plugin`）/ `author` /
      `repository` / `homepage` / `bugs` / `publishConfig: { access: public, registry: npmjs }`、
      `files` 只打包 `lib` + `cordis.patch.yml` + `README.md` + `LICENSE`
- [x] `LICENSE`（MIT，署名 wujunsheng，不含邮箱）
- [x] `.gitignore`
- [x] 符合 dsh-community-market v1 契约的目录源：`catalog/entry.mjs`（唯一数据源）、
      `catalog/worker.js`（Cloudflare Worker）、`catalog/static/`（静态托管形态，由
      `node catalog/build-static.mjs <origin>` 生成）
- [x] 本地 git 仓库与首个提交（仓库内 `user.email` 设为 GitHub noreply，避免公开工作邮箱）
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
pnpm publish --no-git-checks          # publishConfig 已指定 public + npmjs
npm view dsh-fal-imagegen version     # 期望输出 0.1.0
```

包名 `dsh-fal-imagegen` 目前**未被占用**（2026-09-17 查 registry 返回 404）。若你想放到 scope 下
（`@yourname/dsh-fal-imagegen`），把 `package.json` 的 `name` 改掉并保证 `publishConfig.access: public`。

### 3. 建 GitHub 仓库并推送

本机 `gh` 未安装，`ssh -T git@github.com` 返回 `Permission denied (publickey)`，也就是说现有 SSH key
没有注册到 GitHub。你需要：

```sh
# 在 GitHub 网页新建 public 仓库 dsh-fal-imagegen（不要勾选初始化 README）
# 然后把公钥加到账号（Settings → SSH keys），或改用 HTTPS + PAT
cat ~/.ssh/id_rsa.pub

cd ~/dsh-fal-imagegen
git remote add origin git@github.com:<你的用户名>/dsh-fal-imagegen.git
git push -u origin main
```

**⚠️ 需要你确认**：`package.json` 现在假设 GitHub 用户名是 `wujunsheng`
（`https://github.com/wujunsheng/dsh-fal-imagegen`）。如果不是，改这三处：
`package.json` 的 `homepage` / `repository` / `bugs`，`catalog/entry.mjs` 的两处 URL，然后重新提交。

推送后在仓库页面 **Topics** 加 `dsh-plugin`（`find_dsh_plugin` 工具与 awesome 列表都按这个 topic 搜索）。

### 4. 目录源（想让人在插件市场里浏览到才需要）

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
node catalog/build-static.mjs https://<你的用户名>.github.io/dsh-fal-imagegen
# 把 catalog/static/ 作为 GitHub Pages 站点根（main 分支的 /docs 或专用分支）
```

注意：静态主机按扩展名决定 content-type，无扩展名的 `/v1/plugins` 通常会被服务成
`application/octet-stream`；若市场拒收，就回到 Worker 形态。

### 5. 提交到 awesome 列表（可选）

在 awesome-dsh-plugin 这类列表仓库提 PR，加一行：

```md
- [dsh-fal-imagegen](https://github.com/<用户名>/dsh-fal-imagegen) — fal.ai 原生文生图/图生图：FAL_KEY 设置卡片 + `fal_generate_image` / `fal_edit_image` Agent 工具，直连 queue.fal.run（Key 鉴权、队列轮询）。
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
