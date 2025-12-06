import { rm } from 'fs/promises';
import { resolve } from 'path';

const rootDir = import.meta.dir;

const entryPoints = [
  'src/index.ts',
  'src/types/index.ts',
  'src/types/hooks/index.ts',
  'src/schemas/index.ts',
  'src/transcripts/index.ts',
  'src/runners/index.ts',
  'src/mcp/index.ts',
  'src/format/index.ts',
].map(p => resolve(rootDir, p));

await rm('./dist', { recursive: true, force: true });

const result = await Bun.build({
  entrypoints: entryPoints,
  outdir: './dist',
  root: './src',
  format: 'esm',
  target: 'node',
  sourcemap: 'external',
  splitting: false,
  external: ['@modelcontextprotocol/sdk'],
});

if (!result.success) {
  console.error('Build failed:');
  for (const log of result.logs) {
    console.error(log);
  }
  process.exit(1);
}

console.log('Build complete');
