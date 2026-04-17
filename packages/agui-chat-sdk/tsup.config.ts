import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'react/index': 'src/react/index.ts',
  },
  format: ['esm'],
  dts: true,
  clean: true,
  treeshake: true,
  external: ['react', 'react-dom', '@ag-ui/client', '@ag-ui/core'],
});
