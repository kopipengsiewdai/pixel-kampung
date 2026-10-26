/**
 * Things Mr Lim has built through his paid odd jobs (subsistence.md "Where
 * cooking happens", school.md): each a list of jobs, pinned a couple a day
 * beside his usual ones, and done when every job is. The village kitchen
 * first; the schoolhouse reuses the same.
 */

/** A job toward a building, and where it's done. */
export interface ProjectJob { what: string; placeId: string }

/** Each building's jobs, in the order Mr Lim pins them. */
export const PROJECT_JOBS: Readonly<Record<string, readonly ProjectJob[]>> = {
  'village-kitchen': [
    { what: 'clear the ground for the village kitchen', placeId: 'village-kitchen' },
    { what: 'carry planks up from the lorry stop for the village kitchen', placeId: 'lorry-stop' },
    { what: 'raise the posts of the village kitchen', placeId: 'village-kitchen' },
    { what: 'put up the attap roof of the village kitchen', placeId: 'village-kitchen' },
    { what: 'build the clay stove in the village kitchen', placeId: 'village-kitchen' },
    { what: 'make a bench for the village kitchen', placeId: 'village-kitchen' },
    { what: 'dig a drain beside the village kitchen', placeId: 'village-kitchen' },
    { what: 'whitewash the village kitchen', placeId: 'village-kitchen' },
  ],
};

/** What a building is called, in Mr Lim's notices. */
export const PROJECT_NAMES: Readonly<Record<string, string>> = { 'village-kitchen': 'the village kitchen' };

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
