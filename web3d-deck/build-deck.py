#!/usr/bin/env python3
"""deck.json → 자체완결 3D 발표 HTML.
사용: python3 build-deck.py deck.json out.html
deck.json 형식: { "theme": "aurora|blueprint|paper|neon", "slides": [ ...슬라이드... ] }
슬라이드 스키마는 system-prompt-deck.md 참고.
엔진(scene-3d.js)과 Three.js(three-lib.js)는 고정, 내용(slides)+테마만 주입한다.
"""
import json, sys, html, os, base64

HERE = os.path.dirname(os.path.abspath(__file__))

def font_style():
    """Pretendard 가변 woff2 를 base64 @font-face 로 임베드 — 어디서 열든 동일 폰트."""
    fp = os.path.join(HERE, 'pretendard.woff2')
    if not os.path.exists(fp):
        return ''
    b64 = base64.b64encode(open(fp, 'rb').read()).decode()
    return ("@font-face{font-family:'Pretendard';font-weight:100 900;font-display:block;"
            "src:url(data:font/woff2;base64,%s) format('woff2')}"
            "body{font-family:'Pretendard',sans-serif}" % b64)

def build(deck_path, out_path):
    deck = json.load(open(deck_path, encoding='utf-8'))
    # preset = 팔레트+3D오브젝트+카메라+등장을 묶은 프리셋(tunnel/orbit/rise/spiral/editorial).
    # 기본은 중후한 editorial. 옛 deck 은 theme 키를 쓸 수 있어 폴백.
    preset = deck.get('preset', deck.get('theme', 'editorial'))
    slides = deck.get('slides', [])
    lib = open(os.path.join(HERE, 'three-lib.js'), encoding='utf-8').read()
    scene = open(os.path.join(HERE, 'scene-3d.js'), encoding='utf-8').read()
    inject = ("window.PRESET_NAME=%s;window.DECK_DATA=%s;"
              % (json.dumps(preset), json.dumps(slides, ensure_ascii=False)))
    doc = f"""<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{html.escape(deck.get('title','3D 프레젠테이션'))}</title>
<style>{font_style()}
*{{margin:0;padding:0}}html,body{{overflow-x:hidden}}
#gl{{position:fixed;inset:0;width:100vw;height:100vh;z-index:0}}
#hint{{position:fixed;left:50%;bottom:30px;transform:translateX(-50%);z-index:5;color:#9aa;font:600 15px Pretendard,sans-serif;opacity:.6;letter-spacing:.1em}}</style></head>
<body><canvas id="gl"></canvas><div id="hint">스크롤 ↓</div>
<script>{lib}</script>
<script>{inject}</script>
<script>{scene}</script></body></html>"""
    open(out_path, 'w', encoding='utf-8').write(doc)
    print(f"OK: {out_path}  ({round(len(doc)/1024)}KB, preset={preset}, slides={len(slides)})")

if __name__ == '__main__':
    if len(sys.argv) < 3:
        print("사용: python3 build-deck.py deck.json out.html"); sys.exit(1)
    build(sys.argv[1], sys.argv[2])
