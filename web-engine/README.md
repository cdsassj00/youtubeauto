# web-engine — 3D 웹녹화 영상 엔진 (프로토타입)

Remotion(손그림) 방식과 별개로, **3D 웹페이지를 화면 녹화**해서 영상을 만드는 실험적 엔진.

## 아이디어

Three.js 로 3D 씬을 그리는 웹페이지(`demo.html`)를 만들고, 자동으로 애니메이션을
재생(`window.__play()`)한다. 이걸 Playwright 의 `recordVideo` 로 그대로 녹화하면
GPU 없는 서버(GitHub Actions)에서도 소프트웨어 렌더링(swiftshader)으로 3D 영상이 나온다.
이후 파이프라인에서 나레이션(ElevenLabs) 오디오만 얹으면 완성.

## 구성

- `demo.html` — Three.js 3D 씬. 회전 코어(아이코사헤드론) + 궤도 노드 4개 + 파티클 + 타이틀 오버레이.
  - `window.__seek(t)` : 0..1 결정적 타임라인 (프레임 단위 캡처용)
  - `window.__play()` : 실시간 자동 재생 (녹화용). 끝나면 `window.__done = true`.
  - `window.__duration` : 총 길이(초)
- `three.min.js` — Three.js 라이브러리(벤더링).
- `capture.cjs` — Playwright 로 `demo.html` 을 녹화해 `out/3d-demo.webm` (+ 가능하면 mp4) 생성.

## 실행

```bash
PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node web-engine/capture.cjs [demo.html] [outDir]
```

산출물: `out/3d-demo.webm` (1280x720). 이 환경의 번들 ffmpeg 는 webm 전용이라 mp4 변환은
libx264 가 있는 ffmpeg 가 필요하다.

## 다음 단계 (TODO)

- 대본(장면별)을 받아 `demo.html` 을 데이터로 채우도록 파라미터화.
- 씬 여러 개를 이어붙여 10분 분량으로 확장.
- 녹화 webm + 나레이션 mp3 를 합쳐 최종 mp4 출력(파이프라인 통합).
