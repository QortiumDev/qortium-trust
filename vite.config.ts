import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

const packageJson = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string;
};

export default defineConfig({
  base: './',
  build: {
    assetsInlineLimit: (filePath) =>
      /[/\\]src[/\\]assets[/\\]fonts[/\\].+\.woff2$/.test(filePath) ||
      /[/\\]src[/\\]assets[/\\]qortium-trust-protoicon-black-transparent\.png$/.test(filePath)
        ? true
        : undefined,
  },
  define: {
    __APP_VERSION__: JSON.stringify(`v${packageJson.version}`),
  },
  plugins: [react()],
  test: {
    environment: 'node',
    globals: true,
  },
});
