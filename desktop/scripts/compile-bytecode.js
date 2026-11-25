import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import * as esbuild from 'esbuild';
import bytenode from 'bytenode';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function compileProjectBytecode() {
  console.log('🔒 [Bytecode & Bundle Compiler] Empacotando backend em bundle de produção protegido...');

  const serverSrcDir = path.resolve(__dirname, '../../server/src');
  const serverDistDir = path.resolve(__dirname, '../../server/dist');

  if (!fs.existsSync(serverDistDir)) {
    fs.mkdirSync(serverDistDir, { recursive: true });
  }

  const prodBundlePath = path.join(serverDistDir, 'server.prod.cjs');
  const finalJscPath = path.join(serverDistDir, 'server.jsc');

  try {
    // 1. Bundle do backend TypeScript minificado, ofuscado e fechado em CommonJS único
    console.log('  📦 1/2 Criando bundle CJS de produção (minificado e ofuscado)...');
    await esbuild.build({
      entryPoints: [path.join(serverSrcDir, 'server.ts')],
      bundle: true,
      minify: true,
      treeShaking: true,
      legalComments: 'none',
      platform: 'node',
      target: 'node22',
      format: 'cjs',
      outfile: prodBundlePath,
      banner: {
        js: `const import_meta_url = require('node:url').pathToFileURL(__filename).toString();`,
      },
      define: {
        'import.meta.url': 'import_meta_url',
      },
      external: [
        'fsevents',
        'pino-pretty',
        '@napi-rs/keyring',
        '@napi-rs/keyring-*',
      ],
    });

    // 1.5. Copiar sql-wasm.wasm para junto do bundle de produção (necessário para sql.js)
    const serverRequire = createRequire(path.resolve(serverSrcDir, '../package.json'));
    const sqlWasmSrc = serverRequire.resolve('sql.js/dist/sql-wasm.wasm');
    fs.copyFileSync(sqlWasmSrc, path.join(serverDistDir, 'sql-wasm.wasm'));

    // 2. Compilação adicional para V8 Bytecode (.jsc)
    console.log('  🔒 2/2 Compilando binário V8 Bytecode (.jsc)...');
    try {
      bytenode.compileFile({
        filename: prodBundlePath,
        output: finalJscPath,
        electron: true,
      });
    } catch (e) {
      console.warn('  ⚠️ Aviso Bytenode:', e.message);
    }

    // 3. Compilação do script de Preload em CommonJS (necessário para sandbox seguro do Electron)
    const preloadSrc = path.resolve(__dirname, '../src/preload/index.ts');
    const preloadDistCjs = path.resolve(__dirname, '../dist/preload/index.cjs');
    if (fs.existsSync(preloadSrc)) {
      console.log('  🔌 3/3 Empacotando preload em CommonJS...');
      await esbuild.build({
        entryPoints: [preloadSrc],
        bundle: true,
        platform: 'node',
        format: 'cjs',
        outfile: preloadDistCjs,
        external: ['electron'],
      });
    }

    console.log('✅ [Bytecode & Bundle Compiler] Backend e Preload prontos com sucesso!');
  } catch (err) {
    console.error('❌ [Bytecode Compiler] Erro na compilação:', err);
    process.exit(1);
  }
}

compileProjectBytecode();
