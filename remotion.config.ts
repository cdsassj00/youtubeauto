import { Config } from '@remotion/cli/config';

Config.setVideoImageFormat('jpeg');
Config.setConcurrency(2);
Config.setChromiumOpenGlRenderer('angle');

// 소스에서 사용하는 `.js` 확장자 import 를 webpack 이 .ts/.tsx 로 해석하도록.
Config.overrideWebpackConfig((config) => ({
  ...config,
  resolve: {
    ...config.resolve,
    extensionAlias: {
      '.js': ['.js', '.ts', '.tsx'],
    },
  },
}));
