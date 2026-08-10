import React from 'react';
import { useCurrentFrame, interpolate } from 'remotion';
import type { VisualTheme } from '../theme.js';
import { PRETENDARD } from '../pretendard.js';

/**
 * 상자·화살표가 없는 도식들.
 *
 * ★왜 만들었나★
 * iso.tsx 는 배치를 9가지(equation/orbit/cycle/matrix/hub/conveyor/timeline/layers/row)나
 * 고를 수 있는데, 정작 부품은 FlatNode 하나뿐이다 — 300x150 둥근 사각형에 얇은 테두리,
 * 라벨은 안쪽. 그래서 배치가 아무리 바뀌어도 화면은 늘 "흰 테두리 상자 몇 개 + 화살표"로
 * 읽힌다. 영상을 이어 보면 "비슷한 도식만 계속 갈아 끼운다"고 느껴지는 게 이 때문이다.
 *
 * 배치를 더 늘리는 건 답이 아니다. 생김새가 다른 도식을 넣어야 한다. 여기 둘은
 * 노드도 화살표도 쓰지 않아서, 같은 영상 안에 섞이면 화면의 성격 자체가 달라진다.
 */

/** 숫자 앞부분을 떼어낸다 — "82%" → 82 / "3배" → 3 / "1994년" → 1994. */
function splitNumber(value: string): { num: number | null; prefix: string; suffix: string } {
  const m = value.match(/^([^0-9-]*)(-?[\d,]+(?:\.\d+)?)(.*)$/);
  if (!m) return { num: null, prefix: '', suffix: '' };
  const num = Number(m[2].replace(/,/g, ''));
  if (!Number.isFinite(num)) return { num: null, prefix: '', suffix: '' };
  return { num, prefix: m[1], suffix: m[3] };
}

/**
 * 큰 숫자 하나.
 *
 * 수치는 상자에 가두면 오히려 안 읽힌다. 화면 가운데 숫자만 크게 두고, 등장할 때 0 에서
 * 실제 값까지 굴린다 — 눈이 숫자에 붙는다. 소수점 자리수는 원본 문자열에서 그대로 따와
 * "3.5배"가 "4배"로 반올림되는 일이 없게 한다.
 */
export const MetricFigure: React.FC<{
  metric: { value: string; label: string; note?: string };
  durationInFrames: number;
  theme: VisualTheme;
}> = ({ metric, durationInFrames, theme }) => {
  const frame = useCurrentFrame();
  const { num, prefix, suffix } = splitNumber(metric.value);

  // 카운트업은 앞쪽 1.1초 안에 끝낸다 — 나레이션이 그 수치를 말하는 동안 이미 멈춰 있어야 한다.
  const roll = interpolate(frame, [6, 39], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const eased = 1 - Math.pow(1 - roll, 3);
  const decimals = (metric.value.match(/\.(\d+)/)?.[1] || '').length;
  const shown =
    num === null
      ? metric.value
      : `${prefix}${(num * eased).toLocaleString('ko-KR', {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
        })}${suffix}`;

  const rise = interpolate(frame, [0, 16], [26, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const fade = interpolate(frame, [0, 14], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const out = interpolate(frame, [durationInFrames - 12, durationInFrames - 2], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  // 밑줄은 숫자가 다 굴러간 뒤에 그어진다 — 시선이 숫자에서 라벨로 넘어가는 신호.
  const ruleW = interpolate(frame, [34, 52], [0, 220], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  // 자리수가 많아도 화면을 넘지 않게 — 8자 넘어가면 줄인다.
  const size = shown.length > 10 ? 150 : shown.length > 7 ? 190 : 240;

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: Math.min(fade, out),
        transform: `translateY(${rise}px)`,
        fontFamily: PRETENDARD,
      }}
    >
      <div
        style={{
          fontWeight: 900,
          fontSize: size,
          lineHeight: 1,
          letterSpacing: '-.045em',
          color: theme.ink,
          textShadow: '0 6px 40px rgba(0,0,0,.5)',
          fontVariantNumeric: 'tabular-nums', // 굴러가는 동안 폭이 흔들리지 않게
        }}
      >
        {shown}
      </div>
      <div style={{ width: ruleW, height: 4, background: theme.accent, borderRadius: 2, margin: '30px 0 24px' }} />
      <div
        style={{
          fontWeight: 700,
          fontSize: 46,
          letterSpacing: '-.02em',
          color: theme.ink,
          wordBreak: 'keep-all',
          textAlign: 'center',
          maxWidth: 900,
        }}
      >
        {metric.label}
      </div>
      {metric.note ? (
        <div
          style={{
            marginTop: 16,
            fontWeight: 500,
            fontSize: 28,
            color: theme.sub,
            wordBreak: 'keep-all',
            textAlign: 'center',
            maxWidth: 860,
          }}
        >
          {metric.note}
        </div>
      ) : null}
    </div>
  );
};

/**
 * 막대 비교.
 *
 * "A 가 B 보다 몇 배"를 말로만 하면 흘러간다. 길이는 설명 없이 이해된다.
 * 막대는 왼쪽에서 순서대로 자라고, 가장 큰 항목만 액센트 색으로 둔다 — 어디를 봐야 하는지
 * 화면이 스스로 알려 준다.
 */
export const BarsFigure: React.FC<{
  bars: { unit?: string; items: { label: string; value: number }[] };
  durationInFrames: number;
  theme: VisualTheme;
}> = ({ bars, durationInFrames, theme }) => {
  const frame = useCurrentFrame();
  const items = bars.items.slice(0, 5);
  const max = Math.max(...items.map((i) => Math.abs(i.value)), 1);
  const maxIdx = items.reduce((b, it, i) => (Math.abs(it.value) > Math.abs(items[b].value) ? i : b), 0);

  const TRACK = 720; // 막대가 쓸 수 있는 가로 폭
  const out = interpolate(frame, [durationInFrames - 12, durationInFrames - 2], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 26,
        opacity: out,
        fontFamily: PRETENDARD,
      }}
    >
      {items.map((it, i) => {
        // 항목마다 6프레임씩 늦게 시작 — 한꺼번에 자라면 비교가 안 보인다.
        const start = 8 + i * 7;
        const grow = interpolate(frame, [start, start + 22], [0, 1], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        });
        const eased = 1 - Math.pow(1 - grow, 3);
        const w = (Math.abs(it.value) / max) * TRACK * eased;
        const hot = i === maxIdx;
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 22, width: 1180 }}>
            <div
              style={{
                width: 300,
                textAlign: 'right',
                fontWeight: 700,
                fontSize: 34,
                color: theme.ink,
                letterSpacing: '-.02em',
                wordBreak: 'keep-all',
                opacity: grow > 0 ? 1 : 0,
              }}
            >
              {it.label}
            </div>
            <div style={{ width: TRACK, height: 46, position: 'relative' }}>
              {/* 바탕 트랙 — 막대가 짧을 때 '얼마나 짧은지'가 보이게 */}
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: 'rgba(255,255,255,.08)',
                  borderRadius: 6,
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  bottom: 0,
                  width: w,
                  background: hot ? theme.accent : theme.sub,
                  borderRadius: 6,
                }}
              />
            </div>
            <div
              style={{
                // "1,240MB" 처럼 자리수와 단위가 겹치면 130 으로는 옆 여백을 먹는다.
                width: 170,
                fontWeight: 800,
                fontSize: 32,
                color: hot ? theme.accent : theme.ink,
                fontVariantNumeric: 'tabular-nums',
                opacity: eased,
              }}
            >
              {Math.round(it.value * eased).toLocaleString('ko-KR')}
              {bars.unit || ''}
            </div>
          </div>
        );
      })}
    </div>
  );
};
