#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# 로컬 .env 하나만 채우면, GitHub Actions 자동발행에 필요한 키를
# GitHub Secrets/Variables 에 "한 번에" 등록해주는 스크립트.
#
# 준비:
#   1) GitHub CLI 설치 & 로그인:  gh auth login   (https://cli.github.com/)
#   2) cp .env.example .env  후 값 채우기
#   3) 이 저장소 폴더에서:      bash scripts/setup-secrets.sh
#
# 안전: 값은 로컬 .env 에서만 읽고, gh 가 암호화해 업로드합니다(화면 미출력).
# ─────────────────────────────────────────────────────────────
# 이식성: 일부 Windows 셸은 pipefail 미지원 → -eu 만 사용
set -eu

cd "$(dirname "$0")/.."

if ! command -v gh >/dev/null 2>&1; then
  echo "❌ GitHub CLI(gh) 가 필요합니다: https://cli.github.com/  설치 후 'gh auth login'" >&2
  exit 1
fi
if ! gh auth status >/dev/null 2>&1; then
  echo "❌ gh 로그인이 필요합니다:  gh auth login" >&2
  exit 1
fi
if [[ ! -f .env ]]; then
  echo "❌ .env 파일이 없습니다.  cp .env.example .env  후 값을 채우세요." >&2
  exit 1
fi

# 저장소 자동 감지 (현재 폴더의 origin). 다른 저장소면 REPO=owner/name 로 지정.
REPO="${REPO:-$(gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null || true)}"
if [[ -z "${REPO}" ]]; then
  echo "❌ 대상 저장소를 찾지 못했습니다.  REPO=owner/name bash scripts/setup-secrets.sh" >&2
  exit 1
fi
echo "▶ 대상 저장소: ${REPO}"

# .env 로드 (주석/빈 줄 무시, KEY=VALUE)
set -a
# shellcheck disable=SC1091
source <(grep -E '^[A-Za-z_][A-Za-z0-9_]*=' .env)
set +a

# 민감정보 → Secrets
SECRETS=(ANTHROPIC_API_KEY ELEVENLABS_API_KEY YOUTUBE_CLIENT_ID YOUTUBE_CLIENT_SECRET YOUTUBE_REFRESH_TOKEN)
# 일반 설정 → Variables (없거나 예시값이면 건너뜀)
VARS=(CLAUDE_MODEL ELEVENLABS_VOICE_ID ELEVENLABS_MODEL_ID CONTENT_MODE TARGET_MINUTES CONTENT_LANGUAGE YOUTUBE_PRIVACY_STATUS YOUTUBE_CATEGORY_ID)

is_placeholder() {
  # 값이 비었거나 .env.example 의 예시값(xxxx 포함)이면 미입력으로 간주
  [[ -z "$1" || "$1" == *xxxx* ]]
}

echo "▶ Secrets 등록..."
for name in "${SECRETS[@]}"; do
  val="${!name:-}"
  if is_placeholder "$val"; then
    echo "  · $name  건너뜀(값 없음/예시값)"
    continue
  fi
  gh secret set "$name" --repo "$REPO" --body "$val" >/dev/null
  echo "  · $name  ✔"
done

echo "▶ Variables 등록..."
for name in "${VARS[@]}"; do
  val="${!name:-}"
  [[ -z "$val" ]] && continue
  gh variable set "$name" --repo "$REPO" --body "$val" >/dev/null
  echo "  · $name = $val  ✔"
done

echo ""
echo "✅ 완료. 확인: gh secret list --repo ${REPO}"
echo "   수동 실행: GitHub → Actions → '매일 AI 영상 자동 발행' → Run workflow"
