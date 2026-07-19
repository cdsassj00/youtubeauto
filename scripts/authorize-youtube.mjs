// YouTube 업로드용 refresh token 을 발급받는 일회성 스크립트.
// 로컬에서 `npm run authorize:youtube` 로 실행한 뒤, 브라우저에서 채널 계정으로 로그인·동의하면
// 콘솔에 YOUTUBE_REFRESH_TOKEN 값이 출력됩니다. 이 값을 .env / GitHub Secrets 에 저장하세요.
//
// 사전 준비: GCP 콘솔에서 OAuth 클라이언트(유형: 데스크톱 앱)를 만들고
//   YOUTUBE_CLIENT_ID / YOUTUBE_CLIENT_SECRET 를 .env 에 넣어두세요.

import 'dotenv/config';
import http from 'node:http';
import { URL } from 'node:url';
import { google } from 'googleapis';

const PORT = 4599;
const REDIRECT_URI = `http://localhost:${PORT}/oauth2callback`;
const SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube', // 썸네일 설정 등
];

const clientId = process.env.YOUTUBE_CLIENT_ID;
const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;

if (!clientId || !clientSecret) {
  console.error(
    'YOUTUBE_CLIENT_ID / YOUTUBE_CLIENT_SECRET 가 .env 에 없습니다.\n' +
      'GCP 콘솔에서 데스크톱 앱 OAuth 클라이언트를 만들고 값을 넣은 뒤 다시 실행하세요.',
  );
  process.exit(1);
}

const oauth2 = new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI);

const authUrl = oauth2.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent', // refresh_token 을 반드시 받기 위해
  scope: SCOPES,
});

const server = http.createServer(async (req, res) => {
  if (!req.url?.startsWith('/oauth2callback')) {
    res.writeHead(404).end();
    return;
  }
  const code = new URL(req.url, REDIRECT_URI).searchParams.get('code');
  if (!code) {
    res.writeHead(400).end('code 파라미터가 없습니다.');
    return;
  }
  try {
    const { tokens } = await oauth2.getToken(code);
    oauth2.setCredentials(tokens);

    // 어느 유튜브 채널로 인증됐는지 확인해 출력 — 잘못된 계정 업로드를 사전에 방지.
    let channelInfo = '';
    try {
      const yt = google.youtube({ version: 'v3', auth: oauth2 });
      const me = await yt.channels.list({ part: ['snippet'], mine: true });
      const ch = me.data.items?.[0]?.snippet;
      if (ch) channelInfo = `${ch.title}`;
    } catch (e) {
      channelInfo = '(채널 정보 조회 실패: ' + (e?.message || e) + ')';
    }

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(
      `<h2>인증 완료!</h2><p>인증된 채널: <b>${channelInfo || '확인 불가'}</b></p>` +
        '<p>터미널로 돌아가 refresh token 을 복사하세요. 이 창은 닫아도 됩니다.</p>',
    );
    console.log('\n────────────────────────────────────────────');
    console.log('✅ 인증된 유튜브 채널: ' + (channelInfo || '(확인 불가)'));
    console.log('   → 이 채널이 업로드 대상입니다. 원하는 채널이 맞는지 꼭 확인하세요!');
    console.log('────────────────────────────────────────────');
    if (tokens.refresh_token) {
      console.log('YOUTUBE_REFRESH_TOKEN=' + tokens.refresh_token);
    } else {
      console.log(
        '⚠️ refresh_token 이 발급되지 않았습니다. Google 계정의 앱 권한을 해제한 뒤 다시 시도하세요.\n' +
          '   https://myaccount.google.com/permissions',
      );
    }
    console.log('────────────────────────────────────────────\n');
  } catch (e) {
    res.writeHead(500).end('토큰 교환 실패: ' + String(e));
    console.error(e);
  } finally {
    setTimeout(() => server.close(() => process.exit(0)), 500);
  }
});

server.listen(PORT, () => {
  console.log('아래 URL 을 브라우저에서 열어 채널 계정으로 로그인·동의하세요:\n');
  console.log(authUrl + '\n');
});
