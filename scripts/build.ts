import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
await mkdir('dist/server',{recursive:true});await mkdir('dist/runtime',{recursive:true});
await build({entryPoints:['server/index.ts','server/builder-worker.ts','server/runtime-child.ts','server/compile-child.ts'],bundle:true,platform:'node',format:'esm',packages:'external',outdir:'dist/server',sourcemap:true});
await build({entryPoints:['runtime/bootstrap.ts'],bundle:true,format:'iife',globalName:'__engine',outfile:'dist/runtime/bootstrap.js'});
