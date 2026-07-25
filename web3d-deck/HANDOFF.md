# web3d-deck — 3D 스크롤/나레이션 프레젠테이션 생성기 (인수인계)

이 폴더는 "주제만 주면 다채로운 3D 발표 영상을 찍어내는" 생성기의 소스다.
다른 세션에서 이어서 작업할 때 이 문서부터 읽으면 처음부터 설명할 필요 없다.

## 지금까지 한 것 / 왜 만들었나
사용자가 만든 3D 발표 HTML(Three.js + 나레이션)을 영상으로 뽑는 데서 출발해서,
"검정 배경 하나가 아니라 다채로운 템플릿 + 역동적 3D + 나레이션 동기 카메라"로 확장 중이다.

핵심 요구(사용자 원문 취지):
1. 팔레트만이 아니라 **템플릿마다 3D요소·카메라 움직임·등장 연출·디자인이 다 다르게**.
2. 앞으로만 가지 말고 **줌인/줌아웃/좌우 이동** 등 카메라 역동성.
3. **나레이션에 맞춰**, 워크플로 도식이 나오면 **카메라가 그 도식을 단계별로 따라가는** 움직임. ← 지금 핵심 방향
4. 폰트는 반드시 **Pretendard**(임베드), 자체완결 HTML, 워크플로로 영상화.

## 파일
- `three-lib.js` — Three.js r149(UMD, 전역 THREE). 오프라인용으로 인라인.
- `pretendard.woff2` — Pretendard 가변폰트(2MB). @font-face base64 로 임베드 → 어디서 열든 동일.
- `scene-3d.js` — **스크롤 스크럽 엔진**. PRESET(팔레트+오브젝트배치+카메라경로+등장모션+배경+카드) 기반.
  - 프리셋 4종: tunnel(직선 dolly+링), orbit(공전+와이어박스+그리드), rise(상승+미니멀+라이트), spiral(나선+파편).
  - 카메라 안무: 슬라이드마다 dwell → 도착 시 줌인 → 이동 중 줌아웃+좌우 스윙.
  - 데이터 주입: `window.DECK_DATA`, `window.PRESET_NAME`(또는 `?p=tunnel|orbit|rise|spiral`).
- `build-deck.py` — `deck.json` → 자체완결 HTML (three-lib + 폰트 + DECK 주입 + scene-3d). 사용: `python3 build-deck.py deck.json out.html`
- `system-prompt-deck.md` — LLM 이 주제→`deck.json`(내용+테마) 만들 때 쓰는 시스템 프롬프트(슬라이드 스키마 포함).
- `sample-deck.json` — deck.json 예시(RAG 주제, blueprint 테마).
- `workflow-follow.js` — **나레이션 동기 "도식 추적" 엔진(신방향 PoC)**. 노드를 3D 공간에 배치하고
  `window.__setTime(t)` 가 시간에 맞춰 카메라를 노드→노드로 이동·줌인, 자막(#cap) 전환.
  스크롤이 아니라 **시간이 카메라를 운전** → 각 단계 dwell 시간이 나레이션 오디오 길이가 될 자리.
- `frame-render.mjs` — 스크롤 엔진용 결정적 프레임 렌더(스크롤을 프레임마다 세팅→스크린샷). 버벅임 없음.
- `frame-time.mjs` — 시간 엔진용(`__setTime(t)` 를 프레임마다 호출→스크린샷). workflow-follow 용.
- `record.mjs` — (구) 실시간 MediaRecorder 캡처(오디오 포함). 스크롤 오토+오디오 tap. 버벅임 있어 프레임렌더로 대체 권장.

## 미리보기/렌더 방법 (repo 루트에서)
사전: `npm i playwright ffmpeg-static`(없으면). Chromium 은 `/opt/pw-browsers/chromium-*/chrome-linux/chrome`.
ffmpeg 는 `node_modules/ffmpeg-static/ffmpeg`(H.264/AAC 됨. Playwright 번들 ffmpeg 는 webm 전용이라 부적합).
- 스크롤 엔진 빌드: `python3 web3d-deck/build-deck.py deck.json out.html`
- 프레임 렌더→mp4: `P=tunnel node web3d-deck/frame-render.mjs` 후 `ffmpeg -framerate 30 -i frames/f%05d.png -c:v libx264 -pix_fmt yuv420p out.mp4`
- 도식 추적 렌더: `node web3d-deck/frame-time.mjs` (workflow-follow.html 필요 — build 로 조립)

## 남은 일 (다음 세션 시작점)
1. **도식 추적을 정식 엔진으로**: workflow-follow.js 를 scene 타입(flow/diagram)에 통합 —
   deck.json 의 flow 씬이 오면 노드를 3D 배치하고 카메라가 따라가게. 타이틀/불릿/인용 등 다른 씬과 한 타임라인으로.
2. **나레이션 동기**: 씬/비트별 텍스트 → ElevenLabs TTS → 오디오 길이로 dwell 시간 결정 → 프레임렌더 후 오디오 mux.
   ⚠️ 현재 ssjvoice(zXF1qpTynfgd9dv4R300)가 **파인튜닝 미완**이라 TTS 불가. 사용자가 학습 완료 후 진행 예정.
   ElevenLabs API 키는 새로 발급돼 GitHub Secret 갱신됨(키 자체는 유효, voice 만 학습중).
3. **워크플로/파이프라인 통합**: 새 엔진 옵션(예: VIDEO_ENGINE=deck3d) — 주제→deck.json(Claude, system-prompt-deck.md)→build→프레임렌더→mux→업로드.
   웹앱→GitHub 전달은 topic 텍스트만 되고 12MB HTML 은 못 넘김(dispatch 256KB) → 러너에서 생성하므로 문제없음. 워크플로에 ffmpeg-static 추가 필요.
4. 프리셋 추가 여지: Wave / Zoom-punch / Card-flip 등.

## 프로젝트 전체 맥락(메인 파이프라인, 이 폴더 밖)
- 프로덕션 브랜치 = `claude/ai-youtube-auto-publish-workflow-tscg7h`. 스케줄+repository_dispatch 실행됨.
- 최근 커밋: 대본 분량 미달(초당 7자 실측, 460자/분) + bullets 편중 + 썸네일 dramatic 모드 수정.
- ⚠️ OpenAI 샌드박스 사건 영상: 잘못된 "에르되시 모델" 명칭본이 비공개로 업로드됨(스튜디오 삭제 권장).
  올바른 "OpenAI 내부 모델" 수정본은 나레이션(ElevenLabs 키/음성) 문제로 실패 → 음성 준비되면 재실행.
- 규칙: **유료 실행(발행/렌더)은 사용자가 명시적으로 "돌려/발행" 할 때만.** 코드 커밋은 무비용이라 자유.
