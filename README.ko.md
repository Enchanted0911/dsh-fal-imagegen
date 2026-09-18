# 🎨 dsh-fal-imagegen — DeepSeek Harness용 fal.ai 네이티브 이미지 생성 플러그인, v0.2.0

<p align="center">
  <a href="https://www.npmjs.com/package/dsh-fal-imagegen"><img src="https://img.shields.io/npm/v/dsh-fal-imagegen?style=for-the-badge&logo=npm&label=npm" alt="npm version" /></a>
  <a href="https://github.com/Enchanted0911/dsh-fal-imagegen"><img src="https://img.shields.io/github/stars/Enchanted0911/dsh-fal-imagegen?style=for-the-badge&logo=github&label=Stars" alt="Stars" /></a>
  <a href="https://github.com/Enchanted0911/dsh-fal-imagegen/blob/main/LICENSE"><img src="https://img.shields.io/github/license/Enchanted0911/dsh-fal-imagegen?style=for-the-badge&label=License" alt="License: MIT" /></a>
  <a href="https://github.com/Enchanted0911/dsh-fal-imagegen"><img src="https://img.shields.io/github/last-commit/Enchanted0911/dsh-fal-imagegen?style=for-the-badge&label=Last%20commit" alt="Last commit" /></a>
  <a href="https://github.com/Enchanted0911/dsh-fal-imagegen"><img src="https://img.shields.io/badge/DSH%20Plugin-🎨%20imagegen-10B981?style=for-the-badge&logoColor=white" alt="DSH plugin" /></a>
</p>

<p align="center">
  <b>한 줄 설치</b>:
  <code>dsh plugin --profile web add dsh-fal-imagegen</code>
</p>

<p align="center">
  <b>다른 언어:</b>
  <a href="README.md">English</a> ·
  <a href="README.zh.md">简体中文</a> ·
  <a href="README.es.md">Español</a> ·
  <a href="README.ar.md">العربية</a> ·
  <a href="README.fr.md">Français</a> ·
  <a href="README.ja.md">日本語</a>
</p>

DeepSeek Harness(DSH)용 [fal.ai](https://fal.ai) 네이티브 이미지 생성 플러그인: DSH 언어를 따르는 설정 카드와, fal 프로토콜을 처음부터 끝까지 직접 사용하는 에이전트 도구 — OpenAI 호환 게이트웨이를 거치지 않습니다.

## 목차

- [기능](#기능)
- [비동기 생성 흐름](#비동기-생성-흐름)
- [모델 별칭](#모델-별칭)
- [설정](#설정)
- [설치](#설치)
- [개발](#개발)
- [마켓플레이스 카탈로그 소스](#마켓플레이스-카탈로그-소스)
- [알려진 제한 사항](#알려진-제한-사항)

## 기능

- **네이티브 fal 프로토콜** — `Authorization: Key <key_id>:<key_secret>` 헤더로 `POST https://queue.fal.run/<slug>`, 큐 티켓(`status_url` → `response_url`)을 폴링하여 `{ images: [{ url, width, height }] }`를 소비합니다.
- **기본 비동기 생성** — `fal_generate_image`가 작업을 fal 큐에 제출하고 즉시 `task_id`를 반환합니다. 백그라운드 수집기가 완료까지 처리하며, `fal_get_image_task`로 진행 상황을 확인하고 완성된 이미지를 받을 수 있습니다(쿼리당 최대 120초 대기). 예전처럼 동기적으로 기다리려면 `wait=true`를 전달하세요.
- **DSH 언어를 따르는 설정 카드** — 설정 → 플러그인의 "fal 生図"/"fal imagegen": 마스터 스위치, FAL_KEY, 기본 텍스트→이미지/이미지→이미지 엔드포인트, 기본 크기, 품질, 출력 형식, 타임아웃, 출력 폴더, 시스템 프롬프트 공지 스위치. 카드는 내장 플러그인 카드와 동일한 모양과 동작(접기, 미저장 태그, 필드별 초기화, 저장/취소)을 따르며, 카드 문구는 DSH 자체 언어(설정 → 일반 → 언어)를 따릅니다: DSH가 중국어면 중국어, 그 외의 모든 언어면 영어 — 일치하는 언어가 없으면 영어를 기본값으로 사용합니다. 별도 전환 버튼은 없습니다. 항상 주변 UI의 일부로 읽힙니다.
- **에이전트 도구**:

  | 도구 | 용도 |
  | --- | --- |
  | `fal_generate_image` | 텍스트→이미지, 기본 비동기: `prompt` / `model` / `size` / `quality` / `count` / `wait` → `task_id` 반환 |
  | `fal_get_image_task` | 백그라운드 작업 조회: 진행, 대기, 완성 이미지(`task_id` 또는 fal `request_id`로 지정. 둘 다 생략하면 최근 작업 목록) |
  | `fal_edit_image` | 이미지→이미지, 동기 처리: `prompt` + 소스(첨부 참조 또는 디스크의 `image_path`) |
  | `fal_list_image_models` | 내장 별칭, 현재 기본값, 출력 폴더 목록 |

- **재사용 가능한 결과물** — 모든 이미지는 대화에 첨부되고(도구 호출 옆에 표시) **그리고** `<DSH_HOME>/fal-imagegen` 아래 디스크에 저장됩니다. 반환된 `path`는 `fal_edit_image`의 `image_path`에 곧바로 넣을 수 있습니다.
- **검증된 모델 별칭** — 모든 내장 별칭은 fal 공식 엔드포인트 스키마로 검증했습니다. "/"를 포함한 미지의 slug는 그대로 전달되며, 텍스트→이미지 slug를 편집에 쓰면 깨진 요청 대신 명확하게 거부합니다.

## 비동기 생성 흐름

`fal_generate_image`는 더 이상 에이전트 턴을 fal 큐에 묶어두지 않습니다:

1. 도구가 작업을 큐에 제출하고, fal이 수락하는 즉시 `{ status: "queued", task_id, request_id, message, next_action, images: [] }`를 응답합니다.
2. 분리된 수집기가 큐를 폴링하고 이미지를 다운로드해 첨부로 저장하고 출력 폴더로 복사합니다 — 모두 백그라운드에서.
3. `fal_get_image_task`(`task_id` 필수, 또는 fal의 `request_id`)는 `queued / running / completed / failed`를 보고합니다. `wait_seconds`(0–120)를 주면 그 시간만큼 블로킹하고, `completed`가 되면 결과에 `attachment_id` + 로컬 `path`가 담긴 전체 `images[]`가 포함되며 도구 호출 옆에 이미지가 렌더링됩니다.
4. id를 생략하면 최근 작업 목록(`task_id`, 상태, 모델, 이미지 수)을 표시합니다.

참고: 작업 기록은 현재 호스트 프로세스에 보관됩니다(약 6시간, 최신 64개). 백그라운드 대기가 타임아웃된 작업은 다음 조회에서 자동으로 재시도됩니다. `fal_edit_image`는 그 결과가 보통 다음 단계의 입력으로 쓰이기 때문에 동기 방식 그대로 유지합니다.

## 모델 별칭

| 별칭 | 텍스트→이미지 엔드포인트 | 이미지→이미지 엔드포인트 | 크기 파라미터 | quality |
| --- | --- | --- | --- | --- |
| `gpt-image-2.5-flare`(기본값. `gpt-image-2.5` / `gpt-image-2.5-flash`도 허용) | `openai/gpt-image-2.5/flare/text-to-image` | `openai/gpt-image-2.5/flare/edit` | `image_size` | 지원 |
| `gpt-image-2.5-sunburst` | `openai/gpt-image-2.5/sunburst/text-to-image` | `openai/gpt-image-2.5/sunburst/edit` | `image_size` | 지원 |
| `gpt-image-2` | `openai/gpt-image-2` | `openai/gpt-image-2/edit` | `image_size` | 지원 |
| `gpt-image-1.5` | `fal-ai/gpt-image-1.5` | `fal-ai/gpt-image-1.5/edit` | `image_size` | 지원 |
| `nano-banana-2` | `fal-ai/nano-banana-2` | `fal-ai/nano-banana-2/edit` | `aspect_ratio` | 생략 |
| `gemini-25-flash-image` | `fal-ai/gemini-25-flash-image` | `fal-ai/gemini-25-flash-image/edit` | `aspect_ratio` | 생략 |
| `flux-2-flash` | `fal-ai/flux-2/flash` | `fal-ai/flux-2/flash/edit` | `image_size` | 생략 |

## 설정

| 필드 | 기본값 | 의미 |
| --- | --- | --- |
| `enabled` | `true` | 마스터 스위치(도구 + 프롬프트 공지) |
| `falKey` | 빈 값 | FAL_KEY(`key_id:key_secret` 형식. fal.ai → Keys 페이지에서 전체 문자열 복사) |
| `defaultTextToImageModel` | `openai/gpt-image-2.5/flare/text-to-image` | 기본 텍스트→이미지 엔드포인트 |
| `defaultImageToImageModel` | `openai/gpt-image-2.5/flare/edit` | 기본 이미지→이미지 엔드포인트 |
| `defaultImageSize` | `1:1` | `1:1 / 4:3 / 3:4 / 3:2 / 2:3 / 16:9 / 9:16 / 21:9`, `WxH` 픽셀 지정, 또는 `auto` |
| `quality` | `high` | `auto / low / medium / high / xhigh / max`(지원하지 않는 엔드포인트는 자동 생략) |
| `outputFormat` | `png` | `png / jpeg / webp` |
| `timeoutSeconds` | `300` | 요청 1회 총 예산(제출 + 대기 + 수신) |
| `saveDir` | 빈 값 | 출력 폴더. 빈 값 = `<DSH_HOME>/fal-imagegen` |
| `announceToAgent` | `true` | 에이전트 시스템 프롬프트에 플러그인 공지 여부 |

설정 카드는 `~/.dsh/settings.yaml`의 `dsh-fal-imagegen:` 섹션과 동일한 설정을 읽고 씁니다. FAL_KEY는 비밀번호 필드입니다: 비워 두면 현재 키가 유지됩니다(키는 모든 네트워크 뷰에서 마스킹됩니다).

## 설치

### npm(권장)

`dsh-fal-imagegen@0.2.0`이 게시되어 있습니다:

```sh
# CLI 관리 프로필(web / headless / 커스텀):
dsh plugin --profile web add dsh-fal-imagegen
# 설치 후 해당 프로세스 재시작
```

**desktop 프로필**은 DSH Desktop 앱이 독점 관리합니다(`dsh plugin --profile desktop`은 거부됨): 설정 → 플러그인 → 마켓에서 설치하거나, `~/.dsh/profiles/desktop/package.json`에 수동 등록(의존성 + `dsh.profile.bundles`에 `dsh-fal-imagegen` 추가)한 뒤 DSH Desktop을 완전히 재시작하세요.

설치 후 설정 → 플러그인 → 插件配置 의 "fal 生図" 카드에서 FAL_KEY를 입력하거나 `~/.dsh/settings.yaml`의 `dsh-fal-imagegen:` 섹션에 작성합니다.

### git에서(대체 경로)

```sh
dsh plugin --profile web add github:Enchanted0911/dsh-fal-imagegen
```

### 소스에서

```sh
git clone https://github.com/Enchanted0911/dsh-fal-imagegen
# 프로필에 link: 하세요(의존성 + dsh.profile.bundles 항목) → DSH Desktop 재시작
```

런타임 패키지(`@deepseek-ai/dsh-tools`, `dsh-attachment`, `dsh-settings`, `schemastery`)는 하니스에서 제공됩니다. 소스 트리의 `node_modules/`는 오프라인 테스트를 하니스 밖에서 돌리기 위해서만 존재합니다.

## 개발

오프라인 테스트(키 없음, 네트워크 없음):

```sh
node tests/fal-manifest-test.mjs             # 매니페스트 계약: patch 행, exports, dsh.client, wrapper id
node tests/fal-client-test.mjs               # 브라우저 절반: 슬롯 등록, 카드 상태, 저장 ops, 언어 전환
node tests/fal-settings-roundtrip-test.mjs   # 양쪽 접합: 카드 쓰기 → 호스트 읽기, 리셋, 토글
node tests/fal-schema-test.mjs               # 도구 파라미터·출력 스키마
node tests/fal-tasks-test.mjs                # 비동기 경로: 제출 → 백그라운드 완료 → 조회(가짜 fal 큐 사용)
```

실제 호출 테스트(fal 크레딧 소모):

```sh
FAL_KEY='<key_id>:<key_secret>' node tests/fal-host-test.mjs   # 호스트 시뮬레이션: 생성 + 편집 + 첨부/저장 + 실패 경로
FAL_KEY='<key_id>:<key_secret>' node tests/fal-smoke.mjs       # fal 클라이언트만(1회 생성)
```

링크 설치에서 코드 변경 반영: 브라우저 절반(`lib/client.js`)은 페이지 새로고침으로 반영됩니다. 호스트 절반 코드와 `package.json` 매니페스트 변경은 DSH Desktop 재시작이 필요합니다.

## 마켓플레이스 카탈로그 소스

DSH 커뮤니티 마켓에는 기본 소스가 없습니다. 이 저장소는 `catalog/`(데이터 소스는 `catalog/entry.mjs`)에 v1 계약을 따르는 카탈로그 소스를 포함합니다. Cloudflare Pages 형태를 배포하고 설정 → 플러그인 → 마켓 → 소스에 매니페스트 URL을 등록하세요:

```sh
npx wrangler pages deploy catalog/pages --project-name dsh-fal-imagegen-catalog
# 그런 다음 https://dsh-fal-imagegen-catalog.pages.dev/catalog-source.json을 소스로 추가
```

## 알려진 제한 사항

- `aspect_ratio`만 문서화된 엔드포인트(nano-banana / gemini)에서는 명시적 픽셀 크기가 `auto`로 강등됩니다.
- 생성은 fal 크레딧을 소모하며 이미지 콘텐츠는 fal 호스팅 모델이 만듭니다.