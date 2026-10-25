import { readFileSync } from 'node:fs';

/** This release's version, from package.json ("0.9.4"). */
export const VERSION: string = (JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }).version;
