/**
 * 드라이브에 올라온 강의 파일 이름을 읽어 "무엇을 몇 번째로 올릴지"를 정한다.
 *
 * 순번을 파일 이름에 적는 방식을 쓰는 이유: 드라이브에는 순서를 담을 자리가 없고,
 * 별도 목록 파일을 두면 파일과 목록이 어긋나기 시작한다. 이름에 적으면 폴더를 보는
 * 것만으로 순서가 보이고, 순서를 바꾸려면 이름만 고치면 된다.
 */

export interface CourseFile {
  /** 올릴 순서. 작을수록 먼저. */
  order: number;
  /** 확장자를 뺀 이름 — mp4 와 srt 를 짝짓는 열쇠다. */
  stem: string;
  /** 예: "2일차 오전 M01" */
  moduleLabel: string;
  /** 예: "AI 서비스 구조와 메타 프롬프트" */
  topic: string;
}

/**
 * 지원하는 두 가지 표기.
 *   [유튜브추천_1순위]_2일차오전_M01_AI_서비스_구조와_메타_프롬프트
 *   01_2일차오전_M01_AI_서비스_구조와_메타_프롬프트
 *
 * ★순번이 없으면 건너뛴다★ 폴더에 실수로 넣은 파일이나 안내문(.txt)이 발행되면
 * 되돌리기가 번거롭다. 순번은 "이건 올려도 된다"는 표시 구실을 겸한다.
 */
export function parseCourseFileName(fileName: string): CourseFile | null {
  const stem = fileName.replace(/\.[A-Za-z0-9]+$/, '');

  let order = NaN;
  let rest = '';
  const bracket = /^\[[^\]]*?(\d+)\s*순위\][_\s-]*(.+)$/.exec(stem);
  const numeric = /^(\d{1,3})[_\s-]+(.+)$/.exec(stem);
  if (bracket) {
    order = Number(bracket[1]);
    rest = bracket[2];
  } else if (numeric) {
    order = Number(numeric[1]);
    rest = numeric[2];
  } else {
    return null;
  }
  if (!Number.isFinite(order)) return null;

  // 남은 부분에서 "1일차 / 2일차오전 …" 과 "M01" 을 떼어내면 나머지가 주제다.
  const m = /^(\d+일차(?:오전|오후)?)[_\s-]+(M\d+)[_\s-]+(.+)$/.exec(rest);
  if (m) {
    const day = m[1].replace(/(오전|오후)/, ' $1');
    return { order, stem, moduleLabel: `${day} ${m[2]}`, topic: m[3].replace(/_/g, ' ').trim() };
  }
  // 형식이 달라도 버리지는 않는다 — 순번이 있으면 올릴 의사는 분명하다.
  return { order, stem, moduleLabel: '', topic: rest.replace(/_/g, ' ').trim() };
}

export interface DriveEntry {
  id: string;
  title: string;
}

export interface CoursePair extends CourseFile {
  videoId: string;
  srtId: string;
  videoName: string;
  srtName: string;
}

/**
 * 폴더 목록에서 mp4+srt 짝을 만들어 순번대로 돌려준다.
 * 짝이 안 맞는 것은 건너뛰고 이유를 함께 돌려준다 — 조용히 사라지면 왜 안 올라갔는지 알 수 없다.
 */
export function pairCourseFiles(entries: DriveEntry[]): { pairs: CoursePair[]; skipped: string[] } {
  const videos = new Map<string, DriveEntry & { info: CourseFile }>();
  const subs = new Map<string, DriveEntry>();
  const skipped: string[] = [];

  for (const e of entries) {
    const lower = e.title.toLowerCase();
    const isVideo = /\.(mp4|mov|m4v)$/.test(lower);
    const isSrt = /\.srt$/.test(lower);
    if (!isVideo && !isSrt) continue;
    const info = parseCourseFileName(e.title);
    if (!info) {
      skipped.push(`${e.title} — 이름 앞에 순번이 없습니다`);
      continue;
    }
    if (isVideo) videos.set(info.stem, { ...e, info });
    else subs.set(info.stem, e);
  }

  const pairs: CoursePair[] = [];
  for (const [stem, v] of videos) {
    const s = subs.get(stem);
    if (!s) {
      skipped.push(`${v.title} — 같은 이름의 .srt 가 없습니다`);
      continue;
    }
    pairs.push({ ...v.info, videoId: v.id, srtId: s.id, videoName: v.title, srtName: s.title });
  }
  for (const [stem, s] of subs) {
    if (!videos.has(stem)) skipped.push(`${s.title} — 같은 이름의 영상이 없습니다`);
  }

  pairs.sort((a, b) => a.order - b.order || a.stem.localeCompare(b.stem));
  return { pairs, skipped };
}
