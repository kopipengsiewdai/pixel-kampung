/** Tiny `--key value` / `--flag` parser; no dependency needed. */
export function parseArgs(argv: string[]): Record<string, string | true> {
  const out: Record<string, string | true> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (!a.startsWith('--')) continue;
    const [k, v] = a.slice(2).split('=', 2) as [string, string | undefined];
    if (v !== undefined) out[k] = v;
    else if (argv[i + 1] !== undefined && !argv[i + 1]!.startsWith('--')) out[k] = argv[++i]!;
    else out[k] = true;
  }
  return out;
}

export function numArg(args: Record<string, string | true>, key: string, fallback: number): number {
  const v = args[key];
  if (v === undefined || v === true) return fallback;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`--${key} needs a number`);
  return n;
}
