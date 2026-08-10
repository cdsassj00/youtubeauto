// 유튜브 채널 인증 → refresh token 발급 (브라우저에서만 진행).
//
// 왜 만들었나:
//   기존에는 scripts/authorize-youtube.mjs 를 로컬에서 돌려야 토큰을 얻을 수 있었다.
//   저장소 clone + npm install + .env 작성이 전제라, 채널 하나 추가하는 데 개발 환경이
//   필요했다. 두 번째 채널을 붙이면서 실제로 여기서 막혔다. 이 엔드포인트는 링크 한 번으로
//   같은 일을 한다.
//
// ★로컬 스크립트와 다른 점★
//   로컬 스크립트는 '데스크톱 앱' OAuth 클라이언트를 쓴다(콜백이 http://localhost:4599).
//   구글은 데스크톱 클라이언트에 https 리디렉션을 허용하지 않으므로, 이 경로는 반드시
//   '웹 애플리케이션' 유형 클라이언트를 따로 만들어야 한다. 그래서 환경변수도 분리했다
//   (YT_CLIENT_ID / YT_CLIENT_SECRET).
//
//   그리고 refresh token 은 발급받은 클라이언트로만 갱신된다. 이 경로로 받은 토큰을 쓰려면
//   파이프라인 쪽에도 같은 클라이언트를 넣어야 한다 — 워크플로가 이미 채널별 클라이언트를
//   지원하므로 YOUTUBE_CLIENT_ID_CH2 / YOUTUBE_CLIENT_SECRET_CH2 로 넣으면 된다.
//   (이 안내는 아래 결과 화면에도 그대로 출력한다. 여기까지 와서 토큰만 받고 클라이언트를
//    안 맞추면 업로드 단계에서 invalid_grant 로 터진다.)

const SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube', // 썸네일 설정 등
].join(' ');

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function page(title, bodyHtml) {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(title)}</title>
<style>
 body{margin:0;background:#0b0c0e;color:#e8e6e1;font:16px/1.65 -apple-system,'Segoe UI',Roboto,'Malgun Gothic',sans-serif}
 .wrap{max-width:760px;margin:0 auto;padding:48px 22px 80px}
 h1{font-size:26px;letter-spacing:-.02em;margin:0 0 8px}
 h2{font-size:17px;margin:34px 0 10px;color:#cfd3da}
 p{margin:10px 0;color:#a9aeb8}
 code,pre{font-family:ui-monospace,Menlo,Consolas,monospace}
 pre{background:#15171b;border:1px solid #262a31;border-radius:10px;padding:14px 16px;
     overflow-x:auto;color:#f0ede7;font-size:13.5px;white-space:pre-wrap;word-break:break-all}
 .ok{color:#8fd6a4} .warn{color:#e2a45c} .bad{color:#e8836f}
 .ch{background:#15171b;border:1px solid #2f3742;border-radius:10px;padding:16px 18px;margin:18px 0}
 .ch b{font-size:21px;color:#fff}
 a{color:#8ab4f8}
 ol{color:#a9aeb8;padding-left:20px} li{margin:8px 0}
</style></head><body><div class="wrap">${bodyHtml}</div></body></html>`;
}

export default async function handler(req, res) {
  const { YT_CLIENT_ID, YT_CLIENT_SECRET, APP_PASSWORD } = process.env;
  const html = (code, body) => res.status(code).setHeader('Content-Type', 'text/html; charset=utf-8').send(body);

  if (!YT_CLIENT_ID || !YT_CLIENT_SECRET) {
    return html(
      500,
      page(
        '설정 필요',
        `<h1 class="bad">환경변수가 없습니다</h1>
         <p>Vercel 프로젝트 환경변수에 아래 두 개를 넣고 다시 배포하세요.</p>
         <pre>YT_CLIENT_ID
YT_CLIENT_SECRET</pre>
         <p>구글 클라우드 콘솔에서 <b>유형이 '웹 애플리케이션'인</b> OAuth 클라이언트를 만들고,
         승인된 리디렉션 URI에 이 페이지 주소를 그대로 등록해야 합니다.</p>`,
      ),
    );
  }

  // 리디렉션 URI 는 구글에 등록된 값과 문자 하나까지 같아야 한다.
  // 배포 도메인이 여러 개일 수 있으므로 요청 호스트에서 만들되, 필요하면 환경변수로 고정한다.
  const redirectUri = process.env.YT_OAUTH_REDIRECT || `https://${req.headers.host}/api/ytauth`;

  const url = new URL(req.url, `https://${req.headers.host}`);
  const code = url.searchParams.get('code');
  const err = url.searchParams.get('error');

  if (err) {
    return html(400, page('취소됨', `<h1 class="bad">인증이 취소되었습니다</h1><p>${esc(err)}</p>`));
  }

  // ── 1단계: 구글 동의 화면으로 보낸다 ─────────────────────────────────────
  if (!code) {
    if (APP_PASSWORD && url.searchParams.get('password') !== APP_PASSWORD) {
      return html(
        401,
        page(
          '비밀번호 필요',
          `<h1>비밀번호가 필요합니다</h1>
           <p>주소 끝에 <code>?password=앱비밀번호</code> 를 붙여 다시 여세요.</p>`,
        ),
      );
    }
    const auth = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    auth.searchParams.set('client_id', YT_CLIENT_ID);
    auth.searchParams.set('redirect_uri', redirectUri);
    auth.searchParams.set('response_type', 'code');
    auth.searchParams.set('scope', SCOPES);
    auth.searchParams.set('access_type', 'offline');
    // 이미 승인한 앱이면 refresh_token 이 다시 안 나온다. 계정에서 권한을 해제하면
    // 기존 채널 토큰까지 같이 죽으므로, 해제 대신 매번 동의를 강제해 새로 받는다.
    auth.searchParams.set('prompt', 'consent');
    res.writeHead(302, { Location: auth.toString() });
    return res.end();
  }

  // ── 2단계: 코드를 토큰으로 바꾸고, 어느 채널인지 되물어본다 ───────────────
  try {
    const tr = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: YT_CLIENT_ID,
        client_secret: YT_CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });
    const tok = await tr.json();
    if (!tr.ok) {
      return html(
        502,
        page(
          '토큰 교환 실패',
          `<h1 class="bad">토큰 교환에 실패했습니다</h1>
           <pre>${esc(JSON.stringify(tok, null, 2))}</pre>
           <p>리디렉션 URI가 구글 콘솔에 등록한 값과 정확히 같은지 확인하세요.</p>
           <pre>${esc(redirectUri)}</pre>`,
        ),
      );
    }

    // ★어느 채널에 붙었는지 반드시 확인시킨다★
    // 계정이 같아도 토큰은 '선택한 채널'에 묶인다. 여기서 확인하지 않으면 엉뚱한 채널에
    // 영상이 올라간 뒤에야 알게 된다(로컬 스크립트에도 같은 이유로 같은 확인이 있다).
    let channel = '';
    try {
      const cr = await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true', {
        headers: { Authorization: `Bearer ${tok.access_token}` },
      });
      const cj = await cr.json();
      channel = cj?.items?.[0]?.snippet?.title || '';
    } catch {
      channel = '';
    }

    if (!tok.refresh_token) {
      return html(
        200,
        page(
          'refresh token 없음',
          `<h1 class="warn">refresh token 이 발급되지 않았습니다</h1>
           <p>인증된 채널: <b>${esc(channel || '확인 불가')}</b></p>
           <p>이 주소를 처음부터 다시 열어 주세요. 구글 계정의 앱 권한을 해제하는 방법도 있지만,
           같은 계정의 <b>다른 채널 토큰까지 함께 무효화</b>되므로 권하지 않습니다.</p>`,
        ),
      );
    }

    return html(
      200,
      page(
        '인증 완료',
        `<h1 class="ok">인증 완료</h1>
         <div class="ch">인증된 채널<br><b>${esc(channel || '(확인 불가)')}</b></div>
         <p class="warn">위 채널 이름이 업로드하려는 채널이 맞는지 먼저 확인하세요.
         다르면 이 페이지를 다시 열어 채널 선택을 다시 하세요.</p>

         <h2>GitHub Secrets 에 넣을 값</h2>
         <p>이 토큰으로 갱신하려면 <b>토큰을 발급한 클라이언트와 같은 클라이언트</b>가
         파이프라인에도 있어야 합니다. 세 개를 함께 넣으세요.</p>
         <pre>YOUTUBE_REFRESH_TOKEN_CH2 = ${esc(tok.refresh_token)}

YOUTUBE_CLIENT_ID_CH2     = (이 페이지에 설정한 YT_CLIENT_ID 와 같은 값)
YOUTUBE_CLIENT_SECRET_CH2 = (이 페이지에 설정한 YT_CLIENT_SECRET 과 같은 값)</pre>
         <p class="bad">이 토큰은 비밀번호와 같습니다. 저장소나 채팅에 남기지 마세요.
         이 페이지는 새로고침하면 사라집니다.</p>`,
      ),
    );
  } catch (e) {
    return html(500, page('오류', `<h1 class="bad">오류</h1><pre>${esc(String(e))}</pre>`));
  }
}
