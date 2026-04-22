import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    alias: {
      '@arnessa/react': path.resolve(__dirname, '../../packages/agui-chat-sdk/src/index.ts'),
    },
  },
});
