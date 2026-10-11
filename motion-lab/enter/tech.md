## 기술 조건 (A·B 공통 — 창작 지시 아님)
- 출력: HTML 파일 한 장. three.js 0.160.0 을 importmap 으로 `"three": "../vendor/three.module.js"`, `"three/addons/": "../vendor/addons/"`.
  vendor 에는 three.module.js, addons/geometries/RoundedBoxGeometry.js, addons/environments/RoomEnvironment.js 가 있다.
  다른 addon 이 필요하면 https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/<경로> 를 vendor/addons/<경로> 로 내려받아 쓴다.
- 캔버스 1080×680, devicePixelRatio 1. 8초 루프, 30fps = 240프레임(0~239), 프레임 239 는 0 으로 이어진다.
- 렌더 계약: 모든 프레임은 시간 t(초)의 순수 함수. `window.renderAt(t)` 가 정확히 그 프레임을 그린다.
  requestAnimationFrame 시작·Date.now·setTimeout·시드 없는 Math.random 금지. 준비가 끝나면 `window.__ready = true`.
- 렌더 도구(저장소 루트에서):
  `CHROMIUM_PATH=/opt/pw-browsers/chromium node motion-lab/render.mjs <html> --secs 8 --fps 30 --w 1080 --h 680 --frames 0,60,120 --out <폴더>`
  `--contact <png> --every 12` 는 프레임 번호가 박힌 밀착 인화지, `--onion 41-49` 는 잔상 겹치기.
