import { defineConfig } from 'tsup';

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/types/index.ts',
    'src/types/hooks/index.ts',
    'src/schemas/index.ts',
    'src/transcripts/index.ts',
    'src/runners/index.ts',
    'src/mcp/index.ts',
    'src/format/index.ts',
  ],
  outDir: './dist',
  format: 'esm',
  target: 'node18',
  sourcemap: true,
  splitting: false,
  clean: true,
  external: ['@modelcontextprotocol/sdk'],
});
