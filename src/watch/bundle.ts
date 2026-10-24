/**
 * Builds the browser client in memory when the server starts (esbuild, about
 * a second), so `npm start` always serves the page that matches the code.
 * Phaser is bundled in: the page loads nothing from anywhere but this server.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ClientFiles } from './server.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
export const CLIENT_DIR = join(HERE, 'client');
export const ASSETS_DIR = join(HERE, '..', '..', 'assets');

export async function buildClient(): Promise<ClientFiles> {
  const esbuild = await import('esbuild');
  try {
    const out = await esbuild.build({
      entryPoints: [join(CLIENT_DIR, 'main.ts')],
      bundle: true,
      write: false,
      format: 'iife',
      minify: true,
      target: 'es2022',
      legalComments: 'none',
      logLevel: 'silent',
    });
    return {
      html: readFileSync(join(CLIENT_DIR, 'index.html'), 'utf8'),
      css: readFileSync(join(CLIENT_DIR, 'style.css'), 'utf8'),
      js: out.outputFiles[0]!.text,
    };
  } finally {
    // esbuild runs a helper process; let it go so the server stays light.
    await esbuild.stop();
  }
}
