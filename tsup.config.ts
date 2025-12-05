import { defineConfig } from 'tsup';

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/types/index.ts',
    'src/types/hooks/index.ts',
    'src/types/tools/index.ts',
    'src/schemas/index.ts',
    'src/transcripts/index.ts',
    'src/runners/index.ts',
    'src/mcp/index.ts',
    'src/format/index.ts',
  ],
  format: ['esm'],
  dts: false,
  clean: true,
  splitting: false,
  sourcemap: true,
  outDir: 'dist',
  target: 'es2022',
  external: ['@modelcontextprotocol/sdk'],
});
