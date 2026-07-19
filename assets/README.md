# assets — 썸네일 진행자 사진

썸네일에 합성할 **진행자 사진**을 이 폴더에 `presenter.png` 로 넣으세요.

- 그린스크린/단색 배경 사진 OK (gpt-image-1 이 알아서 인물만 오려서 합성합니다).
- 정면·상반신, 얼굴이 잘 보이는 사진이 가장 좋습니다.
- 파일명 고정: **`presenter.png`** (jpg 라면 png 로 저장하거나 이름만 .png 로).

## 이 폴더 대신 URL 로 주고 싶다면
저장소가 공개(public)라 얼굴 사진 커밋이 꺼려지면, 사진을 어딘가에 올리고
`.env` 또는 GitHub Secret 에 `PRESENTER_IMAGE_URL=https://...` 로 넣으세요.
그러면 `presenter.png` 없이 그 URL 을 씁니다.

> 사진이 없으면 썸네일은 인물 없이 "제목 + 손그림 다이어그램" 으로 생성됩니다.
