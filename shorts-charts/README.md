# 모션차트 쇼츠

말 없이 화면과 비트만으로 가는 30초 안팎의 세로 차트 영상. 각 차트는 HTML 한 장이고,
`window.seek(t)` 가 "t 초의 화면"을 그리는 순수 함수라 몇 번을 다시 찍어도 같은 영상이 나온다.

| 파일 | 주제 | 디자인 |
|---|---|---|
| `charts/speedrun.html` | 100만 명 모으는 데 걸린 시간 | 팝·네오브루탈(노랑, 굵은 테두리, 돋보기) |
| `charts/weekly.html` | ChatGPT 주간 사용자 1억→8억 | 다크 네온 라인, 따라 올라가는 세로축 |
| `charts/nvidia.html` | 엔비디아 시총 1조→5조 달러 | 블랙&골드 계단(폭 = 걸린 날수) |
| `charts/context.html` | 컨텍스트 윈도우 2K→10M | 크림 종이 에디토리얼, 무한 줌아웃 |

```bash
# 미리보기 PNG 몇 장
node shorts-charts/render.mjs shorts-charts/charts/nvidia.html out/stills --stills 3,10,20
# MP4 (소리 없음) — 끝에 bgm.hits 로 쓸 임팩트 시각을 찍어 준다
node shorts-charts/render.mjs shorts-charts/charts/nvidia.html assets/shorts/charts/nvidia.mp4
# 브라우저로 그냥 재생: charts/<name>.html?play

# 비트를 깔아 완성본 (render.mjs 가 찍어 준 임팩트 시각을 그대로)
node shorts-charts/finish.mjs assets/shorts/charts/nvidia.mp4 out/nvidia_final.mp4 --hits 6,9.2,13.4,17,19.6 --bpm 112 --key -4
```

Playwright 가 받아 둔 브라우저 버전이 안 맞으면 `CHROMIUM_PATH=/path/to/chrome` 으로 지정한다.

업로드는 `scripts/chart-shorts-manifest.json` 에 항목을 넣고 Actions →
**완성 쇼츠 업로드** 를 manifest=`scripts/chart-shorts-manifest.json` 로 돌린다.
소리 없는 클립에는 `music.mjs` 의 합성 비트가 깔리고, `bgm.hits` 시각에 임팩트가 들어간다.

새 차트를 만들 때: `lib.js` 의 `defineChart({ duration, hits, draw })` 하나만 부르면 된다.
화면 아래 약 300px 와 오른쪽 아래 버튼 줄은 쇼츠 UI 에 가려지므로 핵심 숫자를 두지 않는다.
