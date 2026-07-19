# AI 영상 자동 발행 — 웹앱

주제만 입력하면 GitHub Actions 파이프라인(대본→나레이션→렌더→업로드)을 트리거하는 웹 인터페이스입니다.
폰/PC 어디서든 접속해 발행할 수 있고, 진행 상황을 보여줍니다.

```
[이 웹앱]  →  /api/publish (서버리스, 토큰 보관)  →  GitHub repository_dispatch  →  파이프라인 실행
```

## 배포 (Vercel, 무료)

1. [Vercel](https://vercel.com) 로그인 → **Add New → Project** → 이 저장소 선택
2. **Root Directory** 를 `web` 으로 지정
3. **Environment Variables** 등록:
   | 이름 | 값 |
   |---|---|
   | `GITHUB_TOKEN` | 아래에서 만드는 GitHub 토큰 |
   | `GITHUB_REPO` | `cdsassj00/youtubeauto` |
   | `APP_PASSWORD` | (선택) 아무나 못 누르게 할 비밀번호 |
4. **Deploy** → 나온 주소가 내 스튜디오 URL

CLI 로도 가능: `cd web && npx vercel --prod` (프로젝트 루트를 web 으로).

## GitHub 토큰 만들기 (트리거 권한만)

[github.com/settings/personal-access-tokens](https://github.com/settings/personal-access-tokens) →
**Fine-grained token** → Repository access: `cdsassj00/youtubeauto` 만 →
Permissions:
- **Actions: Read and write** (워크플로우 트리거 + 상태 조회)
- **Contents: Read-only**

발급된 `github_pat_...` 를 위 `GITHUB_TOKEN` 에 넣습니다. (이 토큰은 웹앱 서버에만 저장되고 브라우저에 노출되지 않습니다.)

## 로컬 실행 (선택)

```bash
cd web
npm i -g vercel
GITHUB_TOKEN=... GITHUB_REPO=cdsassj00/youtubeauto vercel dev
```

## 동작
- **발행 시작** → `/api/publish` 가 `repository_dispatch(type=publish-video)` 를 보냄
- 워크플로우가 `client_payload.topic` 으로 대본을 만들고 렌더·업로드
- 웹앱은 `/api/runs` 로 실행 상태를 폴링해 표시

> 파이프라인/키(Anthropic·ElevenLabs·YouTube)는 저장소의 **GitHub Secrets** 에 이미 설정돼 있어야 합니다. (루트 README §5 / `scripts/setup-secrets.sh`)
