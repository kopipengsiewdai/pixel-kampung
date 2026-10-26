/**
 * Where cooking happens (subsistence.md "Where cooking happens"): outdoor
 * fires at the jetty or on the beach, lit with a bundle of firewood and burning
 * about an hour, for simple food from what the cook carries; and the shared
 * village kitchen, once Mr Lim's odd jobs have built it. A fire or a stove is
 * only ever where one really burns.
 */
import { type ActionResult, no, ok } from './actions/common.ts';
import { distance, PLACE_BY_ID, tileAt } from './map.ts';
import { PROJECT_JOBS, PROJECT_JOBS_A_DAY } from './projects.ts';
import { addGoods, countGoods, NEARBY_TILES, type Resident, type World } from './state.ts';
import { dayIndex } from './time.ts';

export { PROJECT_JOBS_A_DAY };
/** A cooking fire burns this long on a bundle of firewood. */
export const FIRE_MINUTES = 60;
/** Under this long left, it's burning low. */
export const FIRE_LOW = 15;
export const KITCHEN_ID = 'village-kitchen';
export const KITCHEN_JOBS = PROJECT_JOBS[KITCHEN_ID]!;

/** Whether r stands where a fire may be lit: the jetty, or the beach. */
export function fireGround(w: World, r: Resident): boolean {
  return w.isAt(r, 'jetty') || tileAt(r.pos.x, r.pos.y) === 'sand';
}

/** The fire burning near r, if there is one. */
export function fireNear(w: World, r: Resident): World['state']['fires'][number] | null {
  return w.state.fires.find((f) => f.until > w.t && distance(f, r.pos) <= NEARBY_TILES) ?? null;
}

export function lightFire(w: World, r: Resident): ActionResult {
  if (!fireGround(w, r)) return no('You can only light a cooking fire down at the jetty or on the beach.');
  if (countGoods(r.items, 'firewood') < 1) return no("You'd need a bundle of firewood to light a fire.");
  if (fireNear(w, r)) return no("There's a fire burning here already.");
  addGoods(r.items, 'firewood', -1);
  w.state.fires.push({ id: w.nextId(), x: r.pos.x, y: r.pos.y, by: r.id, until: w.t + FIRE_MINUTES });
  w.emit({ type: 'fire_lit', who: r.id });
  return ok('You set the firewood down and get a cooking fire going. It will burn for about an hour.');
}

/** Each minute: fires that have burnt out are gone. */
export function firesMinute(w: World): void {
  if (w.state.fires.some((f) => f.until <= w.t)) w.state.fires = w.state.fires.filter((f) => f.until > w.t);
}

/** Whether the village kitchen has been built. */
export function kitchenBuilt(w: World): boolean {
  return w.state.projects.some((p) => p.id === KITCHEN_ID && p.builtDay !== null);
}

/** What someone sees of where they could cook here: a fire burning, or the village kitchen built or going up. */
export function cookingLines(w: World, r: Resident): string[] {
  const out: string[] = [];
  const fire = fireNear(w, r);
  if (fire) {
    const by = fire.by === r.id ? 'you lit it' : `${w.nameOf(fire.by)} lit it`;
    out.push(`A cooking fire is burning here (${by})${fire.until - w.t <= FIRE_LOW ? ", burning low" : ''}.`);
  }
  if (w.isAt(r, KITCHEN_ID)) {
    const p = w.state.projects.find((x) => x.id === KITCHEN_ID);
    if (p?.builtDay !== null && p) out.push('This is the village kitchen: anyone may cook here, bringing their own food and a little firewood or kerosene.');
    else if (p) out.push(`The village kitchen is being built here for Mr Lim: ${p.done.length} of ${KITCHEN_JOBS.length} jobs done.`);
  }
  return out;
}

/** A project's job done: counted, and when the last is done, it's built. */
export function projectJobDone(w: World, project: string, index: number): boolean {
  const p = w.state.projects.find((x) => x.id === project);
  if (!p || p.builtDay !== null || p.done.includes(index)) return false;
  p.done.push(index);
  if (p.done.length < (PROJECT_JOBS[project]?.length ?? Infinity)) return false;
  p.builtDay = dayIndex(w.t);
  return true;
}

export const placeName = (id: string) => PLACE_BY_ID.get(id)?.name ?? id;
