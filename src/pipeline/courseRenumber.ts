/**
 * 이미 올라간 강의 회차 제목·설명에 순서를 붙인다.
 *
 * ★댓글로 들어온 요청이다★ "연속성 있는 강의를 파트별로 끊어 올리는 것 같은데 순서를
 * 알 수 있게 번호를 넣어 달라." 앞으로 올라갈 편은 파이프라인이 붙이지만, 그분이 지금
 * 보고 있는 것은 이미 올라간 영상들이라 그쪽도 고쳐야 실제로 반영된 것이다.
 *
 * ★대본을 다시 만들지 않는다★ 제목을 새로 뽑으면 지금 붙어 있는 제목이 바뀌어 검색으로
 * 들어오던 길이 끊긴다. 필요한 것은 번호 하나뿐이므로, 유튜브에 있는 제목·설명을 그대로
 * 읽어 와 번호만 덧붙인다. 모델도 부르지 않고 영상도 건드리지 않는다.
 *
 * ★두 번 돌려도 안전하다★ 이미 [14/43] 이 붙어 있으면 건너뛴다. 스크립트를 다시 돌렸을
 * 때 "[14/43] [14/43]" 이 되는 것이 이런 일괄 수정에서 제일 흔한 사고다.
 */
import { google } from 'googleapis';
import { createOAuthClient, listPublishedEpisodes } from '../lib/youtube.js';
import { courseTotal } from '../lib/courseManifest.js';

const env = (k: string, d = '') => process.env[k]?.trim() || d;

/** 제목 끝에 이미 [N] 또는 [N/M] 이 붙어 있는가. */
const hasNumber = (title: string) => /\[\d+(\/\d+)?\]\s*$/.test(title.trim());

export async function runCourseRenumber(): Promise<void> {
  const seriesCode = env('COURSE_CODE', 'cdsa-ac');
  const seriesTitle = env('SERIES_TITLE', 'AI챔피언 강사양성과정');
  const dry = env('DRY_RUN', 'true').toLowerCase() !== 'false';

  const total = await courseTotal();
  const episodes = await listPublishedEpisodes(seriesCode);
  console.log(`▶ 올라간 회차 ${episodes.length}편 (전체 ${total}편)${dry ? ' · 예행 모드' : ''}`);

  const auth = createOAuthClient();
  const youtube = google.youtube({ version: 'v3', auth });

  let changed = 0;
  for (const ep of episodes.slice().sort((a, b) => a.order - b.order)) {
    // 설명은 목록 응답에 없어서 따로 읽는다. videos.list 는 1 쿼터라 부담이 없다.
    const res = await youtube.videos.list({ part: ['snippet'], id: [ep.videoId] });
    const snip = res.data.items?.[0]?.snippet;
    if (!snip) {
      console.warn(`  · [${ep.order}] 영상을 못 읽었습니다 — 건너뜁니다`);
      continue;
    }
    const curTitle = snip.title ?? '';
    const curDesc = snip.description ?? '';
    const mark = `[${ep.order}${total ? `/${total}` : ''}]`;
    const orderLine = `${seriesTitle} ${ep.order}${total ? `/${total}` : ''}번째 편입니다. 전체 순서는 재생목록에서 볼 수 있습니다.`;

    const needTitle = !hasNumber(curTitle);
    const needDesc = !curDesc.includes(orderLine);
    if (!needTitle && !needDesc) {
      console.log(`  · [${ep.order}] 이미 번호가 있습니다 — 건너뜁니다`);
      continue;
    }

    // 제목 100자 상한. 번호가 잘리면 붙이는 의미가 없으므로 본문 쪽을 줄인다.
    const nextTitle = needTitle ? `${curTitle.slice(0, 100 - mark.length - 1)} ${mark}` : curTitle;
    // 설명은 첫 줄(후킹) 바로 아래에 끼운다 — 맨 위로 올리면 후킹이 밀린다.
    const lines = curDesc.split('\n');
    const nextDesc = needDesc ? [lines[0] ?? '', orderLine, ...lines.slice(1)].join('\n') : curDesc;

    console.log(`  · [${ep.order}] ${needTitle ? '제목' : ''}${needTitle && needDesc ? '·' : ''}${needDesc ? '설명' : ''} → ${nextTitle}`);
    if (!dry) {
      // ★categoryId 를 같이 보내야 한다★ videos.update 는 snippet 을 통째로 갈아끼우므로
      // 빠뜨린 필드는 지워진다. 제목·설명·태그·분류를 그대로 다시 실어 보낸다.
      await youtube.videos.update({
        part: ['snippet'],
        requestBody: {
          id: ep.videoId,
          snippet: {
            title: nextTitle,
            description: nextDesc.slice(0, 5000),
            tags: snip.tags ?? undefined,
            categoryId: snip.categoryId ?? undefined,
            defaultLanguage: snip.defaultLanguage ?? undefined,
          },
        },
      });
      changed++;
    }
  }
  console.log(dry ? `\n예행 모드라 아무것도 바꾸지 않았습니다. DRY_RUN=false 로 실제 반영합니다.` : `\n✅ ${changed}편 반영`);
}

await runCourseRenumber();
