# 모션 쇼츠

대본(JSON) 한 장 → 나레이션이 들어간 세로 모션 쇼츠(1080×1920 MP4 + SRT).
화면: 고정 제목 · 가운데 모션 무대 · 읽는 단어를 따라 칠해지는 자막 · 움직이는 배경 · 고정 꼬리말.
모션은 CDSA "브라우저의 재발견 2 · 모션·영상 능력 사전"에서 골랐다. 자세한 사용법은
`.claude/skills/motionshorts/SKILL.md`.

```bash
# 비트마다 정지 화면 2장(음성까지 만들어 실제 시간표로)
node motion-shorts/build.mjs motion-shorts/specs/browser-motion.json --stills beats
# 완성 MP4
node motion-shorts/build.mjs motion-shorts/specs/browser-motion.json
```
목소리는 `OPENAI_API_KEY`(OpenAI TTS) → `ELEVENLABS_API_KEY` → 없음(자막만) 순으로 고른다.
Playwright 브라우저가 안 맞으면 `CHROMIUM_PATH=<chrome 경로>`.
