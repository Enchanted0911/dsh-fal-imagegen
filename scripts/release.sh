#!/usr/bin/env bash
# 一键发布 dsh-fal-imagegen 到 npm。
# 流程：离线发布闸门 → 检查 npm 认证 → pnpm publish → 从 registry 校验。
#
#   ./scripts/release.sh
#   NODE=/path/to/node PNPM=/path/to/pnpm ./scripts/release.sh   # 手动指定运行时
#
# 发布是不可逆的公开动作（npm 只允许 72 小时内 unpublish），所以闸门先跑、认证缺失即中止。
set -euo pipefail
cd "$(cd "$(dirname "$0")/.." && pwd)"

# 本机 node / pnpm 可能不在 PATH 上（DSH Desktop 自带运行时目录里有一份）。
runtime_root="$HOME/Library/Application Support/DSH Desktop/runtime-commands/generations"
node_bin="${NODE:-$(command -v node || true)}"
[ -n "$node_bin" ] || node_bin="$(ls -d "$runtime_root"/*/private/node-bin/node 2>/dev/null | head -1 || true)"
pnpm_bin="${PNPM:-$(command -v pnpm || true)}"
[ -n "$pnpm_bin" ] || pnpm_bin="$(ls -d "$runtime_root"/*/bin/pnpm 2>/dev/null | head -1 || true)"
[ -n "$node_bin" ] && [ -x "$node_bin" ] || { echo "找不到 node：用 NODE=/path/to/node 指定" >&2; exit 1; }
[ -n "$pnpm_bin" ] && [ -x "$pnpm_bin" ] || { echo "找不到 pnpm：用 PNPM=/path/to/pnpm 指定" >&2; exit 1; }

echo "== 1/4 发布闸门（离线，不需要凭据） =="
"$node_bin" tests/fal-publish-test.mjs
for t in fal-manifest-test fal-client-test fal-settings-roundtrip-test fal-schema-test; do
  "$node_bin" "tests/$t.mjs" >/dev/null && echo "ok   $t"
done

echo "== 2/4 npm 认证 =="
if ! grep -qs "_authToken" "$HOME/.npmrc"; then
  cat >&2 <<'MSG'
缺少 npm 认证。二选一（不要把 token 贴到聊天里）：
  A. pnpm login
  B. npmjs.com → Access Tokens → Granular Access Token（Packages: dsh-fal-imagegen，Read and write），然后
     echo '//registry.npmjs.org/:_authToken=npm_xxx' >> ~/.npmrc && chmod 600 ~/.npmrc
MSG
  exit 1
fi

echo "== 3/4 发布 =="
"$pnpm_bin" publish --no-git-checks

echo "== 4/4 从 registry 校验 =="
curl -fsS https://registry.npmjs.org/dsh-fal-imagegen/latest | "$node_bin" -e '
let raw = ""
process.stdin.on("data", (chunk) => { raw += chunk }).on("end", () => {
  const meta = JSON.parse(raw)
  console.log(`npm 已上线：${meta.name}@${meta.version}`)
  console.log(`repository: ${meta.repository?.url ?? "(none)"}`)
  console.log(`keywords:   ${(meta.keywords ?? []).join(", ")}`)
})'
echo "完成 → https://www.npmjs.com/package/dsh-fal-imagegen"
