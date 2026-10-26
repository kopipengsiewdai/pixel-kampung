/**
 * Things Mr Lim has built through his paid odd jobs (subsistence.md "Where
 * cooking happens", school.md): each a list of jobs, pinned a couple a day
 * beside his usual ones, and done when every job is. The village kitchen
 * first; the schoolhouse reuses the same.
 *
 * Saved progress is by each job's place in its list (`Project.done`, and
 * kinds like "village-kitchen:3"), so a list that has shipped is append-only:
 * never reorder or remove a job, only add new ones at the end (a living town
 * then has them still to do).
 */
import type { World } from './state.ts';
import { dayIndex } from './time.ts';

/** A job toward a building, and where it's done. */
export interface ProjectJob { what: string; placeId: string }

/** A building: its name in notices, its jobs, what Mr Lim pins when it's ready, and what's seen at the site meanwhile. */
export interface ProjectDef {
  name: string;
  jobs: readonly ProjectJob[];
  ready: string;
  site: (done: number, total: number) => string;
}

/** Each building, by its place id. */
export const PROJECTS: Readonly<Record<string, ProjectDef>> = {
  'village-kitchen': {
    name: 'the village kitchen',
    jobs: [
      { what: 'clear the ground for the village kitchen', placeId: 'village-kitchen' },
      { what: 'carry planks up from the lorry stop for the village kitchen', placeId: 'lorry-stop' },
      { what: 'raise the posts of the village kitchen', placeId: 'village-kitchen' },
      { what: 'put up the attap roof of the village kitchen', placeId: 'village-kitchen' },
      { what: 'build the clay stove in the village kitchen', placeId: 'village-kitchen' },
      { what: 'make a bench for the village kitchen', placeId: 'village-kitchen' },
      { what: 'dig a drain beside the village kitchen', placeId: 'village-kitchen' },
      { what: 'whitewash the village kitchen', placeId: 'village-kitchen' },
    ],
    ready: 'The village kitchen is ready. Anyone may cook there, bringing their own food and a little firewood or kerosene. Mr Lim.',
    site: (done, total) => `The village kitchen is being built here for Mr Lim: ${done} of ${total} jobs done.`,
  },
  schoolhouse: {
    name: 'the schoolhouse',
    jobs: [
      { what: 'clear the ground for the schoolhouse', placeId: 'schoolhouse' },
      { what: 'carry planks up from the lorry stop for the schoolhouse', placeId: 'lorry-stop' },
      { what: 'carry more planks up from the lorry stop for the schoolhouse', placeId: 'lorry-stop' },
      { what: 'dig the post holes for the schoolhouse', placeId: 'schoolhouse' },
      { what: 'raise the posts of the schoolhouse', placeId: 'schoolhouse' },
      { what: 'lay the floor of the schoolhouse', placeId: 'schoolhouse' },
      { what: 'put up the walls of the schoolhouse', placeId: 'schoolhouse' },
      { what: 'cut attap for the schoolhouse roof, past the farm plot', placeId: 'farm' },
      { what: 'put up the attap roof of the schoolhouse', placeId: 'schoolhouse' },
      { what: 'make benches for the schoolhouse', placeId: 'schoolhouse' },
      { what: 'make a blackboard for the schoolhouse', placeId: 'schoolhouse' },
      { what: 'whitewash the schoolhouse', placeId: 'schoolhouse' },
    ],
    ready: 'The school is open. Miss de Souza, a teacher from town, will teach the children English on weekday mornings, free, and grown-ups at seven in the evening, five cents a lesson. Send your children. Mr Lim.',
    site: (done, total) => `A schoolhouse is being built here for Mr Lim: ${done} of ${total} jobs done.`,
  },
};

/** Each building's jobs, in the order Mr Lim pins them. */
export const PROJECT_JOBS: Readonly<Record<string, readonly ProjectJob[]>> = Object.fromEntries(Object.entries(PROJECTS).map(([id, p]) => [id, p.jobs]));

/** What a building is called, in Mr Lim's notices. */
export const PROJECT_NAMES: Readonly<Record<string, string>> = Object.fromEntries(Object.entries(PROJECTS).map(([id, p]) => [id, p.name]));

/** Project jobs pinned a day, beside the usual odd jobs. */
export const PROJECT_JOBS_A_DAY = 2;

/** A project job's kind: the building and which job ("village-kitchen:3"). */
export const projectKind = (project: string, index: number) => `${project}:${index}`;

/** The project job a kind names, if it's one. */
export function projectJobOf(kind: string): (ProjectJob & { project: string; index: number }) | null {
  const m = /^(.+):(\d+)$/.exec(kind);
  const job = m ? PROJECT_JOBS[m[1]!]?.[Number(m[2])] : undefined;
  return job ? { ...job, project: m![1]!, index: Number(m![2]) } : null;
}

/** A project's job done: counted, and when the last is done, it's built (true then). */
export function projectJobDone(w: World, project: string, index: number): boolean {
  const p = w.state.projects.find((x) => x.id === project);
  if (!p || p.builtDay !== null || p.done.includes(index)) return false;
  p.done.push(index);
  if (p.done.length < (PROJECT_JOBS[project]?.length ?? Infinity)) return false;
  p.builtDay = dayIndex(w.t);
  return true;
}

/** Whether something has been built. */
export const isBuilt = (w: World, project: string) => w.state.projects.some((p) => p.id === project && p.builtDay !== null);

/** What's seen at a building site, if r stands at one still going up. */
export function siteLine(w: World, placeId: string): string | null {
  const p = w.state.projects.find((x) => x.id === placeId);
  const def = PROJECTS[placeId];
  return p && def && p.builtDay === null ? def.site(p.done.length, def.jobs.length) : null;
}
