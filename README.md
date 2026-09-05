# AI 유튜브 자동 발행 워크플로우

AI 트렌드와 기초 상식을 **Excalidraw 손그림 스타일 플래시 애니메이션**으로 설명하는
**10분 분량 유튜브 영상**을 매일 자동으로 제작·발행하는 파이프라인입니다.

- 🧠 **대본/구성**: Claude (Anthropic SDK, `claude-opus-4-8`) — 구조화 출력으로 씬 단위 대본 생성
- 🎙️ **나레이션**: ElevenLabs TTS (한국어 다국어 모델)
- ✏️ **영상**: Remotion + roughjs 손그림 애니메이션 (노드·화살표 도식, 손글씨 자막, 형광펜 강조)
- 📤 **업로드**: YouTube Data API v3 (GCP OAuth)
- ⏰ **자동화**: GitHub Actions 매일 cron

```
[Claude 대본] → [ElevenLabs 나레이션 + 길이측정] → [Remotion 렌더(mp4)] → [YouTube 업로드]
        script.json            public/audio/*.mp3            out/video.mp4          youtu.be/...
```

요일에 따라 주제가 자동으로 바뀝니다 (월·수·금 = 최신 트렌드 / 화·목·토·일 = 기초 상식). `CONTENT_MODE`로 고정할 수도 있습니다.

---

## 1. 요구사항

- Node.js 20+
- 렌더링 시 Chromium (Remotion 이 자동 준비: `npx remotion browser ensure`)
- 한국어 폰트 (로컬 렌더 시): `Nanum Pen Script`, `Nanum Gothic` 권장. GitHub Actions 에서는 자동 설치됩니다.
- API 키 3종: Anthropic / ElevenLabs / YouTube(GCP OAuth)

## 2. 설치

```bash
npm install
npx remotion browser ensure   # 렌더용 브라우저 준비
cp .env.example .env          # 값 채우기
```

## 3. API 키 발급

### 3-1. Anthropic (Claude)
1. https://console.anthropic.com/ → API Keys 에서 발급
2. `.env` 의 `ANTHROPIC_API_KEY` 에 입력

### 3-2. ElevenLabs (나레이션)
1. https://elevenlabs.io/app/settings/api-keys 에서 발급 → `ELEVENLABS_API_KEY`
2. Voice Library 에서 한국어에 어울리는 목소리를 고르고 Voice ID 복사 → `ELEVENLABS_VOICE_ID`
3. 한국어는 다국어 모델(`eleven_multilingual_v2`)을 권장 → `ELEVENLABS_MODEL_ID`

### 3-3. YouTube Data API (GCP)
1. [Google Cloud Console](https://console.cloud.google.com/) 에서 프로젝트 생성
2. **API 및 서비스 → 라이브러리** 에서 **YouTube Data API v3** 사용 설정
3. **OAuth 동의 화면** 구성 (외부 / 테스트 사용자에 본인 계정 추가)
4. **사용자 인증 정보 → OAuth 클라이언트 ID → 애플리케이션 유형: 데스크톱 앱** 생성
5. 발급된 Client ID / Secret 을 `.env` 의 `YOUTUBE_CLIENT_ID` / `YOUTUBE_CLIENT_SECRET` 에 입력
6. refresh token 발급:
   ```bash
   npm run authorize:youtube
   ```
   브라우저가 열리면 **업로드할 채널의 계정**으로 로그인·동의 → 터미널에 출력된
   `YOUTUBE_REFRESH_TOKEN=...` 값을 `.env` 에 저장

> ⚠️ 새 GCP 프로젝트는 업로드 영상이 `private` 로 강제될 수 있습니다(미검증 앱). 채널 확인이 끝나면 `YOUTUBE_PRIVACY_STATUS=public` 으로 바꾸세요. 처음에는 `private` 로 테스트를 권장합니다.

## 4. 로컬 실행

전체 파이프라인 (대본→나레이션→렌더→업로드):
```bash
npm run pipeline
```

단계별 실행 (디버깅용):
```bash
npm run generate:script   # 1) out/script.json 생성
npm run generate:voice    # 2) public/audio/*.mp3 + out/manifest.json
npm run render            # 3) out/video.mp4 (+ out/thumbnail.png)
npm run upload            # 4) 업로드 (DO_UPLOAD=true 일 때만)
```

`DO_UPLOAD=false`(기본) 이면 업로드 없이 `out/video.mp4` 까지만 만듭니다. 먼저 영상 품질을 확인한 뒤 `true` 로 바꾸세요.

### 스튜디오 미리보기 (디자인 조정)
```bash
npm run studio
```
브라우저에서 손그림 씬/애니메이션을 실시간으로 확인하며 `src/remotion/` 의 디자인을 수정할 수 있습니다. (샘플 매니페스트로 미리보기)

## 5. GitHub Actions 자동화 (매일 발행)

`.github/workflows/daily-publish.yml` 이 매일 **07:00 KST** 에 실행됩니다.

저장소 **Settings → Secrets and variables → Actions** 에서:

**Secrets (민감정보)**
| 이름 | 값 |
|---|---|
| `ANTHROPIC_API_KEY` | Claude 키 |
| `ELEVENLABS_API_KEY` | ElevenLabs 키 |
| `YOUTUBE_CLIENT_ID` | OAuth 클라이언트 ID |
| `YOUTUBE_CLIENT_SECRET` | OAuth 시크릿 |
| `YOUTUBE_REFRESH_TOKEN` | 위 3-3 에서 발급한 refresh token |

**Variables (일반 설정, 선택)**
| 이름 | 예시 |
|---|---|
| `ELEVENLABS_VOICE_ID` | 목소리 ID |
| `CONTENT_MODE` | `auto` / `trend` / `basics` |
| `TARGET_MINUTES` | `10` |
| `YOUTUBE_PRIVACY_STATUS` | `private` → 확인 후 `public` |

수동 실행: **Actions → 매일 AI 영상 자동 발행 → Run workflow** (모드/업로드 여부 선택 가능).
실행마다 산출물(`out/video.mp4`)이 아티팩트로 첨부되어 확인할 수 있습니다.

### 키 한 번에 등록 (선택)
GitHub 웹에서 하나씩 넣는 대신, 로컬 `.env` 를 채운 뒤 아래 한 줄이면 Secrets/Variables 를 일괄 등록합니다.
[GitHub CLI](https://cli.github.com/) 설치 & 로그인(`gh auth login`)이 필요합니다.

```bash
cp .env.example .env      # 값 채우기
gh auth login             # 최초 1회
bash scripts/setup-secrets.sh
```

값은 로컬 `.env` 에서만 읽어 `gh` 가 암호화 전송하며 화면에 출력되지 않습니다.

> 발행 시각은 `daily-publish.yml` 의 `schedule.cron` (UTC) 을 수정해 바꿉니다.
> 현재는 `'30 8 * * 1-5'`(17:30 KST, 한국장 마감 뒤)와 `'30 21 * * 1-5'`(06:30 KST, 미국장 마감 뒤) 두 줄입니다.

### 주식 수시 발행 (이벤트 기반)

`.github/workflows/stock-spot-publish.yml` 은 데일리와 **다른 축**으로 돕니다.

- 데일리는 "오늘 시장" 한 장을 하루 한 번 내보냅니다. 505종목을 분석해도 영상에 쓰이는 건 5종목입니다.
- 수시 발행은 사이트가 알려 주는 **변화**(`/api/feed`)를 받아, 그 종목 한 편을 만듭니다.
  거래대금 3배가 어제도 3배였으면 이벤트가 아닙니다 — **값이 큰 것이 아니라 바뀐 것**입니다.

평일 하루 5번(한국장 2 · 마감 뒤 1 · 미국장 2) 후보를 확인하고, 후보가 없으면 아무것도 하지 않습니다.
이벤트가 0건인 것은 고장이 아니라 조용한 시간대라는 뜻입니다.

| 단계 | 하는 일 |
|---|---|
| `probe` 잡 | `curl` 두 번으로 후보 수만 셉니다(20초). 0건이면 본 잡을 아예 띄우지 않습니다. |
| `publish` 잡 | 우선순위 높은 순으로 후보를 훑어, 최근 발행한 종목·재료가 모자란 종목을 건너뛰고 한 편을 만듭니다. |

**후보는 두 갈래에서 옵니다.**

1. **피드 이벤트** (`/api/feed`) — 직전 대비 바뀐 것. 발행 이유로는 제일 강하지만 조용한 날엔 0~1건입니다.
2. **관점 교차** (`/api/quant/rank`) — 순위표에 관점이 다섯 개 있습니다(차트 중심 · 수급 중심 ·
   수급+차트 · 돌파 · 역추세). 이걸 교차해서 **서로 다른 기준이 같은 종목에 모인 것**을 후보로 씁니다.

두 번째가 중요한 이유는, 순위 1위 자체는 어제도 오늘도 할 수 있는 말이라서입니다.
관점의 겹침은 다릅니다 — 역추세(눌림목)는 상승 추세 종목을 싫어하므로 돌파와 동시에 걸리는 일이
드뭅니다. 다섯 관점 전부에 걸린 종목은 실제로 하루 한두 개뿐이라, 희소해서 값이 있습니다.

같은 종목이 두 갈래로 들어오면 피드 쪽을 남깁니다 — 사이트가 쓴 "어제와 오늘의 차이"가 들어 있으니까요.

중복 발행은 **채널에 물어봅니다**(최근 영상 제목 50개). 이 저장소는 발행 이력 파일을 두지 않습니다 —
파일은 워크플로가 다른 러너에서 돌거나 수동 실행이 섞이면 곧 사실과 어긋납니다.

수동 실행: **Actions → 주식 수시 발행 (이벤트 기반) → Run workflow** (시장 KR/US, 공개 상태, 채널 선택).

## 6. 커스터마이징

- **주제 방향**: `src/lib/anthropic.ts` 의 시스템/유저 프롬프트 (톤, 분량, 씬 구성 규칙)
- **주제 요일 배분**: `src/config.ts` 의 `resolveTopicMode()`
- **디자인/애니메이션**: `src/remotion/` (색·폰트 `theme.ts`, 손그림 도형 `components/Rough.tsx`, 씬 `components/Scenes.tsx`)
- **자막 스타일**: `src/remotion/components/Captions.tsx`
- **목소리/속도**: `.env` 의 `ELEVENLABS_*`, `src/lib/elevenlabs.ts` 의 `voice_settings`

## 7. 폴더 구조

```
src/
  config.ts              환경변수·경로·규격
  schema.ts              대본/매니페스트 타입 (zod)
  lib/
    anthropic.ts         Claude 대본 생성
    elevenlabs.ts        TTS + 오디오 길이 측정
    render.ts            Remotion 번들·렌더·썸네일
    youtube.ts           OAuth 업로드
  pipeline/run.ts        오케스트레이터(4단계)
  remotion/              영상 컴포지션(React)
    Root.tsx / Video.tsx / theme.ts
    components/          Rough·Layout·Scenes·Captions
scripts/authorize-youtube.mjs   refresh token 발급 도우미
.github/workflows/daily-publish.yml       매일 발행(주식 데일리 포함)
.github/workflows/stock-spot-publish.yml  주식 수시 발행(이벤트 기반)
public/audio/            (런타임에 나레이션 mp3 저장)
out/                     (산출물: script.json, manifest.json, video.mp4)
```

## 8. 비용·주의사항

- 각 실행마다 Claude(수만 토큰) + ElevenLabs(수천 자 TTS) 비용이 발생합니다. 사용량/요금제를 확인하세요.
- YouTube Data API 는 업로드당 약 1,600 쿼터를 소비합니다(기본 일일 10,000). 하루 1회 발행은 충분합니다.
- 자동 생성 콘텐츠의 **사실성 검증 책임은 발행자에게** 있습니다. 처음에는 `private`/`unlisted` 로 검토 후 공개를 권장합니다.
- Excalidraw 정품 손글씨 폰트(Virgil/Excalifont)를 쓰려면 폰트를 시스템에 설치하고 `src/remotion/theme.ts` 의 `handFont` 우선순위를 조정하세요. (기본은 Nanum Pen Script 등으로 폴백)
