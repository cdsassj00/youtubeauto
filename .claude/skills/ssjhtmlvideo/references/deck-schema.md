# deck.json 스키마

```jsonc
{
  "engine": "signal" | "timed",   // signal = DOM/CSS 엔진, timed = Three.js 3D 엔진
  "space3d": true,                // signal 엔진에서만. 3D 깊이 카메라 사용(= signal3d)
  "header": "좌상단에 계속 뜨는 머리글 (<b> 강조 가능)",
  "accent": "#2ee87a",            // 단일 액센트 색
  "palette": "noir",              // timed 엔진 팔레트: noir | aurora | blueprint | paper
  "slides": [ ... ]
}
```

공통: 모든 슬라이드(및 `steps` 의 각 단계)에 `say`(자막)와 선택적 `spoken`(발음)을 쓴다.
`dur` 을 직접 주면 그 초만큼 머문다(보통은 TTS 길이로 자동 결정하니 쓰지 않는다).

---

## SIGNAL 엔진 (`engine: "signal"`)

### claim — 큰 문장 하나
```jsonc
{ "type":"claim", "kicker":"소제목", "claim":"큰 문장(<br> 줄바꿈, <em>강조</em>)", "lead":"보조설명",
  "say":"...", "spoken":"..." }
```

### big — 거대한 숫자 하나
```jsonc
{ "type":"big", "kicker":"코딩", "value":"2×", "unit":"이상",
  "sub":"영문 소문자 모노 라벨", "lead":"보조설명", "say":"...", "spoken":"..." }
```

### convert — A → B 변화
```jsonc
{ "type":"convert", "kicker":"가격", "from":"$5 / $25", "fromLabel":"opus 4.8",
  "to":"$5 / $25", "toLabel":"opus 5 · 그대로", "lead":"...", "say":"...", "spoken":"..." }
```

### metrics — 지표 카드 3~4개
```jsonc
{ "type":"metrics", "kicker":"벤치마크",
  "items":[["ARC-AGI 3","3×","vs next-best model"], ["OSWorld 2.0","1위","1/3 cost"]],
  "say":"...", "spoken":"..." }
```
항목은 `[제목, 값, 영문 모노 설명]`. 값만 액센트 색으로 강조된다.

### nodes — 관계도 + 단계 추적
```jsonc
{ "type":"nodes", "kicker":"에이전트 루프",
  "points":[{"label":"목표","x":10,"y":50},{"label":"행동 결정","x":37,"y":22}],
  "links":[[0,1],[1,2],[2,3],[3,0]],
  "steps":[ {"node":0,"say":"...","spoken":"..."}, {"node":1,"say":"..."} ] }
```
- `x`,`y` 는 0~100 백분율. 3~5개를 화면에 고르게 배치.
- `steps` **각각이 하나의 나레이션 비트** — 카메라가 그 노드를 강조하며 진행한다.
- `say` 는 슬라이드가 아니라 `steps` 안에 쓴다.

---

## DECK3D 엔진 (`engine: "timed"`)

### title
```jsonc
{ "type":"title", "kicker":"...", "title":"큰 제목(\n 로 2줄)", "lead":"보조설명", "say":"..." }
```

### stat
```jsonc
{ "type":"stat", "kicker":"...", "head":"소제목",
  "stats":[["5+","라벨"],["2축","라벨"],["1","라벨"]], "say":"..." }
```

### flow — 카메라가 노드를 따라감
```jsonc
{ "type":"flow", "kicker":"...", "head":"소제목",
  "nodes":[ {"label":"목표","say":"...","spoken":"..."}, {"label":"실행","say":"..."} ] }
```
`nodes` 각각이 나레이션 비트다.

### cmp — 좌우 비교
```jsonc
{ "type":"cmp", "kicker":"...", "head":"소제목",
  "left":["제목","항목","항목"], "right":["제목","항목","항목"], "say":"..." }
```

### quote
```jsonc
{ "type":"quote", "quote":"한 문장(\n 로 2줄, 아랫줄이 강조됨)", "say":"..." }
```

---

## 분량 계산

한국어 나레이션은 **초당 약 7자(분당 460자)**.

```
필요한 say 총 글자 수 = 목표분(分) × 460 × 배속(NARRATION_SPEED)
```

- 10분 · 배속 1.12 → 약 **5,150자**
- 슬라이드 20~26개, 각 `say` 2~4문장(120~220자)

분량이 모자라면 배경·비교·사례·한계·활용법 같은 각도를 더 다뤄 채운다(같은 말 반복 금지).

## spoken 작성 규칙

| 자막(say) | 발음(spoken) |
|---|---|
| `Opus 5` | `오퍼스 파이브` |
| `Opus 4.8` | `오퍼스 사 점 팔` |
| `$25` | `이십오 달러` |
| `2×` | `두 배` |
| `0.5%` | `영 점 오 퍼센트` |
| `1/3` | `삼분의 일` |
| `ARC-AGI 3` | `아크 에이지아이 쓰리` |
| `OSWorld 2.0` | `오에스월드 투` |
| `API` | `에이피아이` |

`spoken` 에는 **아라비아 숫자와 로마자를 남기지 않는다**.
