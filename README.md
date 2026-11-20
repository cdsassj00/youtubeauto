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

> `daily-publish.yml` 에는 예약이 없습니다(손으로 실행). 주식은 아래 **주식 쇼츠** 워크플로가 예약으로 돕니다.

### 주식 쇼츠 (구간별 추천)

`.github/workflows/stock-shorts-daily.yml` — 평일 17:30 KST(한국장)·06:30 KST(미국장)에
stockontology.cc 공식 추천(`/api/daily-brief` 의 `horizons`: 단타·스윙·중기·장기)을 40초 안팎 세로 쇼츠로 만들어 **공개**로 올립니다.

- 목표가·손절가·지지선·저항선을 나레이션 + 장면 14개 + 단어 자막으로 설명합니다(video-studio 엔진, 고정 커밋).
- 화면 스타일은 날마다 돌아갑니다: 모션 블루프린트 · 화이트보드 · 스크랩북(한국·미국편도 서로 다르게). `style` 입력으로 고정 가능.
- 대본은 고정 틀에 응답 값만 채웁니다 — AI 대본 비용 없음, 나레이션(ElevenLabs) 300자 한 번, 배경음악은 합성.
- 끝맺음: "더 자세한 종목 분석은 프로필 링크에서 보세요. AI 전문가가 만듭니다." + stockontology.cc · t.me/stockontologist.
- 백테스트 성적(`track`·`league`·`previous`)은 넣지 않습니다.
- 장이 마감되지 않았거나 시세가 낡았거나 같은 제목이 이미 있으면 아무것도 올리지 않습니다.
- `ELEVENLABS_API_KEY` 가 없거나 나레이션판이 실패하면 무음 차트판(`scripts/stock-shorts.mjs`)으로 대신 올립니다.
- 손으로: Actions → 주식 쇼츠 매일 발행 → Run workflow(시장 KR/US, `do_upload=false` 면 만들기만).
- 시험(돈 안 듦): `STOCK_BRIEF_FILE=brief.json STOCK_FAKE_TTS=1 DO_UPLOAD=false VIDEO_STUDIO_DIR=../video-studio npx tsx scripts/stock-studio.mjs`
- 코드: `scripts/stock-studio.mjs`(대본·장면 데이터) + `scripts/stock-studio/scenes.template.js`(장면),
  `scripts/stock-shorts.mjs`(제목·설명·무음판), `shorts-charts/charts/stock-horizons.html`(무음판 화면).

예전 8분 미드폼(주식 데일리)과 이벤트 기반 수시 발행은 2026-10 에 들어냈습니다.

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
.github/workflows/daily-publish.yml       AI 영상 발행(손으로 실행)
.github/workflows/stock-shorts-daily.yml  주식 쇼츠 매일 발행(구간별 추천)
public/audio/            (런타임에 나레이션 mp3 저장)
out/                     (산출물: script.json, manifest.json, video.mp4)
```

## 8. 비용·주의사항

- 각 실행마다 Claude(수만 토큰) + ElevenLabs(수천 자 TTS) 비용이 발생합니다. 사용량/요금제를 확인하세요.
- YouTube Data API 는 업로드당 약 1,600 쿼터를 소비합니다(기본 일일 10,000).
  **한 프로젝트로는 하루 여섯 편쯤이 천장입니다** — 수시 발행 슬롯을 그보다 많이 두면
  남는 슬롯은 업로드에서 막힙니다. 막히는 것은 고장이 아니므로 파이프라인이 조용히
  끝내고(잡은 초록) 다음 슬롯에서 다시 시도합니다. 더 내보내려면 Google Cloud 콘솔에서
  쿼터 증설을 신청하거나, 채널마다 별도 프로젝트의 OAuth 자격증명을 씁니다(채널이 달라도
  같은 프로젝트를 쓰면 한도를 나눠 씁니다).
- 자동 생성 콘텐츠의 **사실성 검증 책임은 발행자에게** 있습니다. 처음에는 `private`/`unlisted` 로 검토 후 공개를 권장합니다.
- Excalidraw 정품 손글씨 폰트(Virgil/Excalifont)를 쓰려면 폰트를 시스템에 설치하고 `src/remotion/theme.ts` 의 `handFont` 우선순위를 조정하세요. (기본은 Nanum Pen Script 등으로 폴백)
