---
name: chartshorts
description: 데이터 하나를 30초 안팎의 세로 모션차트 영상(1080×1920 MP4)으로 만든다. 나레이션 없이 화면과 합성 비트만으로 간다. 사용자가 "모션차트 쇼츠", "차트 쇼츠 만들어줘", "데이터 쇼츠", "바 차트 레이스", "숫자로 보는 쇼츠", "chartshorts" 를 요청하거나, 순위·성장·비교 데이터를 짧은 세로 영상으로 바꿔 달라고 할 때 사용한다. 나레이션이 있는 긴 설명 영상은 ssjhtmlvideo 를 쓴다.
---

# chartshorts — 데이터 한 장을 30초 모션차트 영상으로

차트 하나를 HTML 한 장으로 그리고, `window.seek(t)` 로 프레임마다 찍어 MP4 로 굽고,
저작권 없는 합성 비트를 깔아 완성한다. 도구는 전부 `shorts-charts/` 에 있다.

| 파일 | 하는 일 |
|---|---|
| `charts/lib.js` | 공용 도구 — `defineChart`, 이징, 글자·도형 함수, 필름 그레인 |
| `charts/*.html` | 차트 한 편 = HTML 한 장 |
| `render.mjs` | HTML → 정지 화면(PNG) 또는 무음 MP4 |
| `music.mjs` | 합성 비트(킥·스네어·베이스·코드, 임팩트) |
| `finish.mjs` | 무음 MP4 + 비트 → 완성 MP4 |

## 핵심 원칙 (어기면 영상이 망가지거나 틀린 숫자가 나간다)

1. **숫자는 확인된 것만.** 공식 발표·널리 인용된 출처가 있는 값만 쓴다. 확실하지 않으면 그 점을 빼거나
   "발표 시점끼리 직선 연결"처럼 화면 아래 각주에 기준을 밝힌다. 사이 값을 지어내지 않는다.
2. **눈금을 속이지 않는다.** 선형 눈금이 웃음 포인트면 그대로 두고(ChatGPT 5일 막대가 2px),
   로그나 넓이 비례를 쓰면 화면에 "원의 넓이 = 토큰 수"처럼 적는다.
3. **애니메이션은 전부 t 의 함수.** CSS 트랜지션·requestAnimationFrame 금지. `draw(ctx, t)` 가
   "t 초의 화면"을 그리는 순수 함수여야 몇 번을 다시 찍어도 같은 영상이 나온다.
4. **첫 2초에 질문, 끝 5초에 한 방.** 제목은 질문형("걸린 시간은?"), 마지막엔 비교 한 줄
   ("넷플릭스보다 256배", "대한민국 인구의 15배", "4조→5조 단 112일").
5. **편마다 디자인을 다르게.** 아래 카탈로그에서 아직 안 쓴 스타일을 고르거나 새로 만든다.
6. **세로 영상 UI 자리를 비운다.** 아래 약 300px 와 오른쪽 아래 버튼 줄(x>940, y 1000~1600)에는
   핵심 숫자를 두지 않는다. 각주는 y≈1836.

## 디자인 카탈로그 (이미 쓴 것)

| 파일 | 차트 | 스타일 |
|---|---|---|
| `speedrun.html` | 가로 막대 + 돋보기 | 팝·네오브루탈: 노랑, 굵은 검정 테두리, 딱딱한 그림자 |
| `weekly.html` | 라인 + 따라 오르는 세로축 | 다크 네온: 민트 글로우, 핑 링 |
| `nvidia.html` | 계단(폭 = 걸린 날수) | 블랙&골드: 골드 그라디언트, 얇은 프레임 |
| `context.html` | 넓이 비례 원 + 무한 줌아웃 | 크림 종이 에디토리얼: 잉크 남색, 버밀리언 |

아직 안 쓴 아이디어: 3D 막대 레이스, 버블 레이스, 도넛 점유율 변화, 와플(100칸) 차트, 지도 위 점, 슬로프 차트.

## 순서

### 1. 주제·데이터 확정
데이터 점마다 날짜·값·출처를 표로 정리해 사용자에게 먼저 보여 준다(숫자가 틀리면 여기서 잡는다).
펀치라인(마지막 비교 한 줄)도 함께 정한다.

### 2. 차트 HTML 작성 — `shorts-charts/charts/<id>.html`
기존 차트 하나를 복사해 시작하는 게 가장 빠르다. 뼈대:

```html
<!doctype html><html><head><meta charset="utf-8">
<style>html,body{margin:0;background:#000}canvas{display:block}</style></head>
<body><canvas id="c"></canvas><script src="lib.js"></script><script>
defineChart({
  duration: 27,            // 초
  hits: [13.75, 16.3],     // 임팩트(쿵) 시각 — 핵심 순간에만 2~5개
  draw(ctx, t) {
    // 배경 → 제목 → 데이터 → 펀치라인 → 각주 → grain()
  },
});
</script></body></html>
```
`lib.js` 도구: `prog(t,a,b)`(0~1 진행률), `E.outBack/outCubic/outExpo/outElastic/inOutCubic`, `lerp`, `clamp`,
`txt(ctx, s, x, y, {font, color, align, ls, alpha})`, `rr()`(둥근 사각), `measure()`, `comma()`, `days(a,b)`, `grain()`.
폰트는 `f(굵기, 크기, KR|NUM)` — `KR` 은 Pretendard(한글), `NUM` 은 Inter Display(숫자). 화면은 `W=1080, H=1920`.
브라우저로 `charts/<id>.html?play` 를 열면 실시간으로 돌려 볼 수 있다.

### 3. 정지 화면으로 확인 → 고치기 (렌더 전에 반드시)
```bash
CHROMIUM_PATH=/opt/pw-browsers/chromium node shorts-charts/render.mjs \
  shorts-charts/charts/<id>.html out/stills --stills 1,6,13,17,24
```
PNG 를 이어 붙여 한 장으로 보고 겹침·잘림·빈 공간·타이밍을 고친다. 전환 구간은 0.3초 간격으로 촘촘히 본다.

### 4. 무음 MP4 렌더 (한 편 약 6~15분, 여러 편은 병렬로)
```bash
CHROMIUM_PATH=/opt/pw-browsers/chromium node shorts-charts/render.mjs \
  shorts-charts/charts/<id>.html out/<id>.mp4
```
끝에 `임팩트 시각(bgm.hits): [...]` 이 찍힌다.

### 5. 비트 깔아 완성
```bash
node shorts-charts/finish.mjs out/<id>.mp4 out/<id>_final.mp4 --hits 13.75,16.3 --bpm 118 --key 0
```
편마다 `--bpm`(100~124)·`--key`(-4~3)를 바꿔 비트가 겹치지 않게 한다. 음량은 -15 LUFS 로 맞춰진다.
완성본을 사용자에게 보내 확인받는다.

## 겪은 함정

- **새 원/막대가 카메라보다 먼저 커진다.** outBack 오버슈트 + 줌 동시 진행이면 화면을 덮는다.
  카메라를 먼저 물리고(`tIn-1.0 → tIn+0.15`) 그다음 요소를 키운다. 무대 영역을 clip 한다.
- **제목이 비는 순간.** 현재 항목을 카메라 진행률로 고르면 줌 중에 라벨이 사라진다 — "나타난 항목 수"로 고른다.
- **Playwright 브라우저 버전 불일치.** `CHROMIUM_PATH=/opt/pw-browsers/chromium` 을 준다.
- **한글 폰트.** 차트는 `charts/pretendard.woff2` 를 직접 읽으므로 시스템 폰트가 없어도 된다.
- **카운터 반올림.** 255.6 → 256 처럼 화면 숫자와 설명 문구의 숫자를 맞춘다.
- **임팩트 과다.** 2초 간격으로 7개를 넣으면 시끄럽다. 핵심 순간 2~5개만.
