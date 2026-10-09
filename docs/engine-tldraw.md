# tldraw 하네스 애니메이션 (engine: `tldraw`)

손으로 그린 듯한 도식이 **한 획씩 그려지며** 나레이션을 따라가는 16:9 설명 영상.
밖에서 한 번 만들어 본 방식을 이 저장소의 방식으로 적어 둔 것이다.

> **아직 이 저장소에서 돌려 본 적이 없다.** 아래는 밖에서 돌아간 구현의 사양이고,
> 원본 소스(`src/main.tsx`, `render.mjs`, `enc.sh`)는 이 저장소에 없다. 옮겨 붙일 때
> 아래 "값비싸게 알아낸 것들"을 그대로 지키면 같은 함정을 다시 밟지 않는다.

## 결과물

1920x1080 · 30fps · 약 90초 · 8장면 · 한국어 나레이션.
예시 주제: "AI 에이전트 = LLM(두뇌) + 스킬(매뉴얼) + 하네스(손발)".

## 왜 tldraw 인가

★손그림 느낌을 흉내 내면 들킨다★ 처음에는 Remotion 에서 Excalidraw 식 러프 경로
생성기를 가져다 색만 바꿔 썼는데, 결과가 그냥 Excalidraw 로 보였고 거부당했다.
tldraw 를 진짜로 띄워서 그 렌더러가 그리게 해야 그 느낌이 난다.

기존 `handdrawn` 엔진과 다른 점: `handdrawn` 은 종이 위에 **이미 그려진** 도식을
얹지만, 이쪽은 **그려지는 과정**이 보인다. 설명 영상에서는 그 과정이 곧 설명이다.

## 파이프라인

1. **tldraw 페이지** — `tldraw@5.5.2` + react, esbuild 로 번들해 `<Tldraw hideUi>` 를
   띄우고 `editor.createShape` 로 도형을 만든다.
   - `geo`(사각형·타원): `dash:"draw"`, `fill:"semi"`, `size:"m"`, `font:"draw"`, `scale` 1~2
   - `arrow`, `text`, `draw` — `draw` 는 사람 그림용
2. **글꼴** — `@fontsource/shantell-sans` 를 `@font-face` 로 싣는다.
3. **애니메이션** — 도형을 전부 미리 만들어 두고 `window.setFrame(f)` 가 프레임마다
   DOM 을 손본다. 도형마다 `from`·`dur`·`kind` 를 갖는다.
   - `geo`: CSS `mask-image: conic-gradient` 로 테두리를 따라 도는 스윕
   - `arrow`·`draw`: `linear-gradient` 마스크로 와이프
   - `text`: 페이드
   - 장면이 바뀔 때 이전 도형은 `out` 프레임에서 지운다
   - 자막은 `#cap` DOM 으로 따로 띄운다
   - 장면 시작 프레임은 **오디오 길이에서 계산**한다: `ceil(초*30)+24`
4. **프레임 캡처** — Playwright-core 로 `dist/` 를 로컬 http 로 서빙하고 jpeg(q92) 로 받는다.
5. **합성** — ffmpeg `-framerate 30` 으로 시퀀스를 잇고, 장면별 mp3 를 `adelay` 로
   **시작 프레임+6** 에 얹은 뒤 `amix`(normalize=0) → libx264 crf18 + aac.

## 값비싸게 알아낸 것들

- **tldraw v5 의 `draw` 는 `points` 를 안 받는다.** `path: b64Vecs.encodePoints(...)` 를 요구한다.
- **Shantell Sans 에는 한글이 없다.** `--tl-font-draw: 'Shantell Sans','Noto Sans CJK KR',sans-serif`
  로 한글을 대체하지 않으면 전부 네모로 나온다.
- **`text` 의 `w` 는 `w/scale` 로 넣어야** 가운데 정렬이 맞는다.
- **좌표는 1920x1080 을 그대로 쓰고 카메라는 `{x:0,y:0,z:1}` 로 못박는다.** 안 그러면
  tldraw 가 알아서 맞춰 버려 프레임마다 화면이 흔들린다.
- **`playwright install` 을 하지 마라.** 이 환경에는 `/opt/pw-browsers/` 에 크로미움이
  이미 있고(`PLAYWRIGHT_BROWSERS_PATH`), 다시 받으면 프록시에서 막히거나 디스크를 먹는다.
- **나레이션은 본인 음성만 쓴다.** 영문 TTS 프리셋은 외국인 억양이라 거부당했다.

## 나레이션 설정

이 엔진은 **ssjvoice2** 를 쓴다 — 저장소 기본값(ssjvoice)과 다르다.

```
ELEVENLABS_VOICE_ID=UqucvPiVZ97qMJ98GsVO   # ssjvoice2 (복제 음성, ko)
ELEVENLABS_MODEL_ID=eleven_v4
```

저장소 기본값은 `zXF1qpTynfgd9dv4R300`(ssjvoice) + `eleven_multilingual_v2` 이고,
주식·강의 파이프라인이 그 소리로 나가고 있다. **기본값은 건드리지 말고** 이 엔진을
돌릴 때만 위 두 값을 덮어쓴다.

## 옮겨 붙이기 전에 풀어야 할 것

- **★tldraw 워터마크★** 라이선스 없이 쓰면 화면 오른쪽 아래에 "Get a license for
  production" 이 박힌다. 수익 창출 채널에 올리는 영상이라 **상용 라이선스가 필요하다.**
  이것부터 정하지 않으면 만들어 봐야 못 올린다.
- **CPU** — 2코어 기준 2759프레임에 약 2.5분이 걸렸고, 동시 처리는 2개까지가 안전했다.
  GitHub Actions 러너도 같은 수준이라 90초 영상 한 편에 캡처만 수 분을 잡아야 한다.
- **원본 소스가 없다** — 위 사양만으로 다시 쓰면 함정을 다시 밟을 수 있다.
  `src/main.tsx`·`render.mjs`·`enc.sh` 를 주면 그대로 옮긴다.
