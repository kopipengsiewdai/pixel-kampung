import { gameMinuteFromMs } from '../sim/time.ts';

/** Fast sims start just before Monday 2 November 2026, 06:00 in Singapore. */
export const SIM_START = gameMinuteFromMs(Date.parse('2026-11-01T22:00:00Z')) - 1;
