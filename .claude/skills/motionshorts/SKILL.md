---
name: motionshorts
description: 대본(JSON) 하나로 나레이션이 들어간 세로 모션 애니메이션 쇼츠(1080×1920 MP4)를 만든다. 화면 짜임은 고정 제목 · 가운데 모션 무대 · 읽는 단어를 따라 칠해지는 나레이션 자막 · 움직이는 배경 · 고정 꼬리말. 모션은 CDSA "브라우저의 재발견 2 · 모션·영상 능력 사전"(MV-0xx)에서 고른 키네틱 타이포, 스크램블, 타이핑, 손그림 도식, 입자, 물리, 카운터, 글자 속 영상, 도장, 입체 카드. 사용자가 "모션 쇼츠", "애니메이션 쇼츠", "나레이션 쇼츠", "모션 사전으로 쇼츠", "motionshorts" 를 요청하거나, 짧은 설명·팁·개념을 움직이는 세로 영상으로 만들어 달라고 할 때 사용한다. 숫자 데이터 하나를 차트로 보여 주는 영상은 chartshorts 를 쓴다.
---

# motionshorts — 대본 한 장으로 나레이션 모션 쇼츠

비트(한 문장 + 모션 하나)를 이어 붙여 쇼츠를 만든다. 비트마다 TTS 를 만들고 **실제 음성 길이만큼**
그 장면을 보여 주므로 말과 화면이 어긋나지 않는다. 화면은 `window.seek(t)` 로 프레임마다 찍는다.

| 파일 | 하는 일 |
|---|---|
| `motion-shorts/engine/engine.js` | 화면 엔진 — 배경·고정 제목·무대·자막·꼬리말 + 모션 10종 |
| `motion-shorts/build.mjs` | 대본 → TTS → 시간표 → 프레임 렌더 → 나레이션·비트 믹스 → MP4(+SRT) |
| `motion-shorts/music.mjs` | 합성 배경 비트(저작권 없음). 말할 때는 자동으로 눌러 준다 |
| `motion-shorts/specs/*.json` | 대본 예시 |

## 화면 짜임 (고정)

```
 ┌──────────────────────┐
 │   kicker (작은 글씨)   │  y 150   ← 영상 내내 고정
 │   제목 1줄             │  y 250   ← *강조* 는 액센트색
 │   제목 2줄             │  y 346
 │ ┌──────────────────┐ │
 │ │                  │ │  y 450~1250  모션 무대 (960×800)
 │ │   모션 애니메이션    │ │           비트가 바뀔 때 원형 조리개로 열린다(MV-020)
 │ └──────────────────┘ │
 │  나레이션 자막 1~2줄    │  y 1350  ← 읽은 단어는 흰색, 아직은 회색(MV-013)
 │  ───  꼬리말  ───      │  y 1585  ← 고정
 │  (쇼츠 UI 자리 — 비움)  │
 └──────────────────────┘
 배경: 테마 그라데이션 + 천천히 떠도는 빛 + 필름 그레인
```

## 대본 형식 — `motion-shorts/specs/<id>.json`

```json
{
  "id": "browser-motion",
  "theme": "midnight",
  "kicker": "브라우저의 재발견",
  "title": ["편집 프로그램 없이", "*코드*로 만드는 모션 5가지"],
  "footer": "CDSA · cdsa.kr",
  "voice": { "provider": "openai", "voice": "onyx", "speed": 1.1, "instructions": "밝고 또렷한 한국어 강사 톤" },
  "bgm": { "bpm": 104, "key": 2 },
  "beats": [
    { "say": "첫째, 깨진 글자가 해독되는 *스크램블*. AI 오프닝에 딱입니다.",
      "spoken": "첫째, 깨진 글자가 해독되는 스크램블. 에이아이 오프닝에 딱입니다.",
      "motion": "scramble", "p": { "text": "데이터를 해독합니다" }, "minDur": 3.5 }
  ]
}
```
- `theme` 은 `midnight`(남색 밤) · `paper`(크림 종이) · `neon`(검정+마젠타·시안).
- `say` 는 화면 자막(영문·숫자 그대로), `spoken` 은 읽을 문장(한글 발음으로 풀어 씀). 영문·숫자가 있으면 반드시 `spoken` 을 쓴다.
- `*강조*` 는 자막·제목에서 액센트색. 자막 하나에 강조는 한 군데만.
- `minDur` 은 모션이 말보다 길게 필요할 때(타이핑·도식·물리).
- 그 밖에 `lead`(첫 비트 전 여백, 기본 0.5), `tail`(끝 여백, 0.8), 비트별 `gap`(말 뒤 여백, 0.45), `fps`(30).

## 모션 10종

| motion | 사전 | p (매개변수) | 어울리는 곳 |
|---|---|---|---|
| `kinetic` | MV-014 | `text`(줄바꿈 `\n`, `*강조*`), `size` | 첫 문장·핵심 메시지. 단어가 흐릿하게 올라오고 강조에 바가 쓸고 감 |
| `scramble` | MV-011 | `text`, `label` | AI·보안·데이터 오프닝. 무작위 한글이 앞에서부터 해독 |
| `typing` | MV-012 | `prompt`, `reply`, `app` | 프롬프트 시연, 채팅 장면 |
| `flow` | MV-016·017 | `nodes`(2~4개 권장) | 과정·순서 설명. 손그림 상자와 화살표가 펜으로 그려짐 |
| `particles` | MV-024 | `text`(짧게), `label`, `scatterEnd` | 키워드 한 단어 강조. 점들이 모여 글자가 됨 |
| `physics` | MV-025 | `items`(6~9개), `gap` | "일이 쏟아진다" 같은 장면. 블록이 떨어져 튕기며 쌓임 |
| `counter` | MV-019 | `to`, `from`, `unit`, `label`, `grid`, `dur` | 숫자 하나. `grid:true` 면 1칸=1개 점이 켜짐 |
| `textclip` | MV-010 | `word` | 단어 하나를 크게. 흰 글자 → 흐르는 색이 차오름 → 글자 속으로 줌 |
| `stamp` | MV-037 | `text`, `sub`, `stamp`, `at`, `mono` | 결론·반전. 화면이 멈추며 빨간 도장이 쾅 |
| `cards` | MV-026 | `items:[{big,text}]`(2~3개) | 비교·요약. 카드가 뒤집히며 등장 |

## 순서

1. **대본 짜기** — 비트 6~9개, 30~45초. 첫 비트는 제목을 다시 말하는 훅(`kinetic`/`scramble`),
   마지막은 결론 한 방(`stamp`/`counter`). 비트 하나에 한 생각. 문장이 길면 두 비트로 나눈다.
   사실·숫자는 확인된 것만 쓴다. 대본을 사용자에게 먼저 보여 준다.
2. **정지 화면 미리보기** — 음성까지 만들어 실제 시간표로 비트마다 2장씩 찍는다.
   ```bash
   CHROMIUM_PATH=/opt/pw-browsers/chromium node motion-shorts/build.mjs motion-shorts/specs/<id>.json --stills beats
   ```
   `out/motion/<id>/stills/` 를 이어 붙여 보고 겹침·잘림·자막 줄바꿈·모션 타이밍을 고친다.
   특정 순간은 `--stills 4.5,12,15.3`. 음성은 캐시되므로 다시 돌려도 TTS 비용이 다시 들지 않는다.
3. **완성 렌더** (40초에 약 10~20분)
   ```bash
   CHROMIUM_PATH=/opt/pw-browsers/chromium node motion-shorts/build.mjs motion-shorts/specs/<id>.json
   ```
   결과: `out/motion/<id>/<id>.mp4`, 자막 `<id>.srt`, 시간표 `timeline.json`. 음량은 -14 LUFS.
4. **확인** — 완성본을 사용자에게 보내 확인받는다.

목소리: `OPENAI_API_KEY` 가 있으면 OpenAI TTS(`gpt-4o-mini-tts`, 목소리 `onyx`/`nova`/`alloy` 등),
없고 `ELEVENLABS_API_KEY` 가 있으면 ElevenLabs(`voice.voice` 에 voice_id). 둘 다 없거나 `--no-voice` 면
목소리 없이 자막과 비트만(장면 길이는 읽기 시간 0.35초 + 글자 수 ÷ 10초).

## 새 모션 추가

`engine.js` 에 `M.이름 = (w, h, lt, d, p) => { ... }` 하나를 더하면 된다. `w,h` 는 무대 크기(960×800,
좌표 원점이 무대 왼쪽 위), `lt` 는 비트 안 시간, `d` 는 비트 길이, `p` 는 대본의 `p`.
쓸 수 있는 도구: `prog(t,a,b)`, `E.*` 이징, `hash(a,b)`(결정적 난수), `text()`, `rr()`, `measure()`,
`fitSize()`, `wrap()`, `roughPts()`+`drawPartial()`(손그림 선을 비율만큼), 테마 색 `TH.*`.
사전의 다른 기법(가변 폰트 MV-009, 길 따라 흐르는 글자 MV-015, 합성 모드 MV-023 등)도 이 틀로 옮길 수 있다.

## 원칙과 겪은 함정

- **모든 움직임은 lt 의 함수.** `Math.random`·`Date.now`·CSS 애니메이션 금지 — 무작위는 `hash(번호, 프레임)`.
- **말이 장면 길이를 정한다.** 모션이 말보다 길면 `minDur` 로 늘린다(타이핑 5초, 4칸 도식 4.5초 정도).
- **강조 뒤 문장부호·여러 단어 강조.** 자막은 강조를 먼저 조각내고 그다음 공백으로 단어를 나눈다 — "*스크램블*." 의 마침표가 떨어지지 않고, "*손그림 도식*" 처럼 두 단어에 걸친 강조도 별표가 남지 않는다.
- **제목 숫자와 내용 맞추기.** "모션 5가지"라고 했으면 번호 붙인 비트가 5개여야 한다.
- **영문·숫자 발음.** TTS 는 "AI", "52", "render(t)" 를 엉뚱하게 읽는다 — `spoken` 에 "에이아이", "쉰두", "렌더 티".
- **Playwright 브라우저.** "Executable doesn't exist" 면 `CHROMIUM_PATH` 를 준다.
