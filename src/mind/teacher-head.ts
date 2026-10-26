/**
 * Miss de Souza's bounded head (docs/design/school.md): a few short lines a
 * weekday on the cheap model, a word to open the lessons and answers to what's
 * said to her. src/sim/school.ts holds her to TEACHER_CALLS_A_DAY; every call
 * is counted in the cost log and the town's daily cap, and with the cap spent
 * or a call failing she speaks her own scripted words.
 */
import type Anthropic from '@anthropic-ai/sdk';
import { cleanLine } from '../sim/osman.ts';
import { TEACHER_CALLS_A_DAY, TEACHER_ID, type TeacherHead } from '../sim/school.ts';
import { dayIndex, MINUTES_PER_DAY, SGT_OFFSET_MIN } from '../sim/time.ts';
import { dayCap, ESTIMATE } from './budget.ts';
import type { CostLog } from './cost-log.ts';
import type { ModelClient } from './model.ts';

export const TEACHER_SYSTEM = `You are Miss de Souza, a young Eurasian schoolteacher from town in the 1960s. On weekdays you cycle out to a small seaside kampung to teach English in its new schoolhouse: the children in the mornings, and any grown-ups who come in the evening. You are kind, patient and brisk, you believe English will open doors for these families, and you encourage everyone to send their children to school. You speak simple, clear English, and keep it short.`;

export const SPEAK_TOOL: Anthropic.Tool = {
  name: 'speak',
  description: 'What you say.',
  input_schema: { type: 'object', properties: { words: { type: 'string', description: 'What you say, one or two short sentences.' } }, required: ['words'] },
};

export class ModelTeacherHead implements TeacherHead {
  private readonly client: ModelClient;
  private readonly costs: CostLog;
  private readonly onError: (err: unknown) => void;
  /** Her calls this game day: counted from the cost log on the day's first call, so a restart doesn't give her more. */
  private day = { day: -1, calls: 0 };

  constructor(opts: { client: ModelClient; costs: CostLog; onError?: (err: unknown) => void }) {
    this.client = opts.client;
    this.costs = opts.costs;
    this.onError = opts.onError ?? (() => {});
  }

  async speak(b: Parameters<TeacherHead['speak']>[0], at: { t: number; realMs: number }): Promise<string | null> {
    if (this.costs.spentOn(this.costs.dayKey(at.realMs)) + ESTIMATE.routine > dayCap(this.costs, at.realMs)) return null;
    const day = dayIndex(at.t);
    if (this.day.day !== day) {
      const since = day * MINUTES_PER_DAY - SGT_OFFSET_MIN;
      const realDays = [this.costs.dayKey(at.realMs - 86_400_000), this.costs.dayKey(at.realMs)];
      this.day = { day, calls: this.costs.callsSince(TEACHER_ID, since, realDays) };
    }
    if (this.day.calls >= TEACHER_CALLS_A_DAY) return null;
    this.day.calls++;
    const user = b.moment === 'answer'
      ? `${b.asker} says to you at the schoolhouse: "${b.said}". Answer them briefly.`
      : b.moment === 'morning'
        ? `It's a weekday morning. The children have come to school: ${b.pupils.join(', ')}. Greet them and begin the day's English lesson, in a sentence or two.`
        : `It's the evening English class for grown-ups. Those who have come: ${b.pupils.join(', ')}. Welcome them and begin, in a sentence or two.`;
    try {
      const res = await this.client.think({ tier: 'routine', kind: 'trader', residentId: TEACHER_ID, t: at.t, system: TEACHER_SYSTEM, user, tools: [SPEAK_TOOL], hint: { fake: null } });
      for (const a of res.attempts) this.costs.add({ t: at.t, realMs: at.realMs, resident: TEACHER_ID, kind: 'trader', model: a.model, usage: a.usage });
      const words = (res.toolCall?.input as { words?: unknown } | undefined)?.words;
      // Only in-world words reach the kampung (as with Pak Osman's).
      return res.refused ? null : cleanLine(words, 240);
    } catch (err) {
      this.onError(err);
      this.costs.add({ t: at.t, realMs: at.realMs, resident: TEACHER_ID, kind: 'trader', model: 'failed', usage: { input_tokens: 0, output_tokens: 0 }, estimatedUsd: ESTIMATE.routine });
      return null;
    }
  }
}
