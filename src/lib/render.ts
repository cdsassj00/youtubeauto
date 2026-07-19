import path from 'node:path';
import { bundle } from '@remotion/bundler';
import { renderMedia, renderStill, selectComposition, ensureBrowser } from '@remotion/renderer';
import { ROOT, VIDEO_PATH, THUMBNAIL_PATH } from '../config.js';
import type { RenderManifest } from '../schema.js';

/**
 * Remotion 컴포지션을 렌더해 mp4 파일을 생성한다.
 */
export async function renderVideo(manifest: RenderManifest): Promise<string> {
  await ensureBrowser();

  const entry = path.join(ROOT, 'src', 'remotion', 'index.ts');

  console.log('  · Remotion 번들링...');
  const serveUrl = await bundle({
    entryPoint: entry,
    // public 폴더(오디오)가 번들에 포함되도록 기본 경로 사용.
    onProgress: (p) => {
      if (p % 25 === 0) process.stdout.write(`\r    번들 ${p}%   `);
    },
    // 소스의 `.js` import 를 .ts/.tsx 로 해석.
    webpackOverride: (webpackConfig) => ({
      ...webpackConfig,
      resolve: {
        ...webpackConfig.resolve,
        extensionAlias: {
          '.js': ['.js', '.ts', '.tsx'],
        },
      },
    }),
  });
  process.stdout.write('\n');

  const composition = await selectComposition({
    serveUrl,
    id: 'AiExplainer',
    inputProps: manifest,
  });

  console.log(`  · 렌더 시작 (${composition.durationInFrames} 프레임 @ ${composition.fps}fps)`);
  await renderMedia({
    composition,
    serveUrl,
    codec: 'h264',
    outputLocation: VIDEO_PATH,
    inputProps: manifest,
    concurrency: 4,
    onProgress: ({ progress }) => {
      process.stdout.write(`\r    렌더 ${(progress * 100).toFixed(1)}%   `);
    },
  });
  process.stdout.write('\n');

  // 표지(첫 씬)를 썸네일로 저장.
  try {
    await renderStill({
      composition,
      serveUrl,
      output: THUMBNAIL_PATH,
      frame: Math.min(45, composition.durationInFrames - 1),
      inputProps: manifest,
    });
    console.log('  · 썸네일 저장:', THUMBNAIL_PATH);
  } catch (e) {
    console.warn('  · 썸네일 생성 실패(무시):', (e as Error).message);
  }

  return VIDEO_PATH;
}
