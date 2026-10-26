import { describe, expect, it } from 'vitest';
import { act } from '../src/sim/actions/index.ts';
import { FrameBuilder, layoutOf, placeCardOf } from '../src/watch/view.ts';
import type { Frame } from '../src/watch/types.ts';
import { accepted, newWorld, put, sgt, who } from './helpers.ts';

function cardAt(w: ReturnType<typeof newWorld>, id: string) {
  return placeCardOf(new FrameBuilder().build(w), layoutOf(w), id);
}

describe('clicking a place shows what is inside', () => {
  it('a shop: stock, prices both ways, who is serving and who works there', () => {
    const w = newWorld(9);
    const tan = put(w, 'Mdm Tan', 'provision-shop');
    const kow = who(w, 'Ah Kow');
    w.state.jobs.push({ id: 50, employerId: tan.id, workerId: kow.id, placeId: 'provision-shop', wage: 120, startHour: 13, hours: 4, lastWorkedDay: null });
    put(w, 'Siti', 'provision-shop');
    const c = cardAt(w, 'provision-shop')!;
    expect(c).toMatchObject({ id: 'provision-shop', kind: 'provision_shop', name: 'the provision shop' });
    expect(c.shop!.owner).toBe('Mdm Tan');
    expect(c.shop!.serving).toBe('Mdm Tan (the owner)');
    expect(c.shop!.workers).toEqual(['Ah Kow']);
    expect(c.shop!.sells).toContain('rice 30¢');
    expect(c.shop!.stock.map((s) => s.label).join(', ')).toMatch(/rice/);
    expect(c.here.sort()).toEqual(['Mdm Tan', 'Siti']);
  });

  it('says plainly who is minding a shop: the owner, or a worker on shift', () => {
    const w = newWorld(9);
    const tan = put(w, 'Mdm Tan', 'well');
    const kow = put(w, 'Ah Kow', 'provision-shop');
    w.state.jobs.push({ id: 51, employerId: tan.id, workerId: kow.id, placeId: 'provision-shop', wage: 120, startHour: 13, hours: 4, lastWorkedDay: null });
    kow.activity = { kind: 'working', jobId: 51 } as never;
    expect(cardAt(w, 'provision-shop')!.shop!.serving).toBe('Ah Kow (on shift)');
  });

  it('a shop nobody is minding says so', () => {
    const w = newWorld(9);
    put(w, 'Mdm Tan', 'well');
    expect(cardAt(w, 'provision-shop')!.shop!.serving).toBeNull();
  });

  it('the notice board: every note pinned, with who wrote it and when', () => {
    const w = newWorld(9);
    put(w, 'Siti', 'notice-board');
    accepted(act(w, who(w, 'Siti').id, { verb: 'pin_note', text: 'Will mend nets. Ask Siti.' }));
    const c = cardAt(w, 'notice-board')!;
    expect(c.notes).toEqual([{ author: 'Siti', stamp: 'Mon 09:00', text: 'Will mend nets. Ask Siti.' }]);
  });

  it('the farm plot: each bed, who is growing what, and whether it is ready', () => {
    const w = newWorld(9);
    put(w, 'Raju', 'farm');
    accepted(act(w, who(w, 'Raju').id, { verb: 'plant' }));
    const c = cardAt(w, 'farm')!;
    expect(c.beds).toHaveLength(8);
    const raju = c.beds!.filter((b) => b.who === 'Raju');
    expect(raju).toHaveLength(1);
    expect(raju[0]).toMatchObject({ growing: 'kangkong', ready: false });
    expect(raju[0]!.status).toMatch(/growing/);
    expect(c.beds!.filter((b) => b.who === null).every((b) => b.status === 'free')).toBe(true);
    // Ripe once watered and grown.
    const bed = w.state.beds.find((b) => b.planterId === who(w, 'Raju').id)!;
    bed.wateredDays = 2;
    bed.plantedDay -= 2;
    expect(cardAt(w, 'farm')!.beds!.find((b) => b.who === 'Raju')).toMatchObject({ ready: true, status: 'ready to harvest' });
  });

  it('the jetty: who is fishing', () => {
    const w = newWorld(9);
    put(w, 'Muthu', 'jetty');
    accepted(act(w, who(w, 'Muthu').id, { verb: 'fish' }));
    put(w, 'Raju', 'jetty');
    const c = cardAt(w, 'jetty')!;
    expect(c.fishing).toEqual(['Muthu']);
    expect(c.here.sort()).toEqual(['Muthu', 'Raju']);
  });

  it('the lorry stop: when the lorry comes next, and what it buys and sells at', () => {
    const early = cardAt(newWorld(6, 10), 'lorry-stop')!;
    expect(early.lorry!.here).toBe(false);
    expect(early.lorry!.next).toBe('Pak Osman comes about 06:30 today, and stays until about noon.');
    expect(early.lorry!.sells).toContain('rice 20¢');
    expect(early.lorry!.buys).toContain('fish 15¢');
    const w = newWorld(7, 10);
    w.state.lorryHere = true;
    expect(cardAt(w, 'lorry-stop')!.lorry).toMatchObject({ here: true, next: 'Pak Osman is here now, until about 12:00.' });
    expect(cardAt(newWorld(9), 'lorry-stop')!.lorry!.next).toBe('Pak Osman comes about 06:30 tomorrow, and stays until about noon.');
  });

  it("a house: whose it is and who's in", () => {
    const w = newWorld(9);
    const siti = who(w, 'Siti');
    put(w, 'Siti', siti.homeId);
    const c = cardAt(w, siti.homeId)!;
    expect(c.name).toBe("Siti's house");
    expect(c.home).toEqual({ of: 'Siti' });
    // Her mother lives with her, and is home too.
    expect(c.here).toEqual(['Siti', 'Mak Esah']);
  });

  it('nothing for a place that does not exist', () => {
    expect(cardAt(newWorld(9), 'the-moon')).toBeNull();
  });

  it('a replay frame from before place cards still opens, with what it has', () => {
    const w = newWorld(9);
    const old = new FrameBuilder().build(w) as Partial<Frame>;
    delete old.notes;
    for (const s of old.shops!) { delete (s as Partial<typeof s>).workers; delete (s as Partial<typeof s>).serving; }
    for (const b of old.beds!) delete (b as Partial<typeof b>).planter;
    const layout = layoutOf(w);
    expect(placeCardOf(old as Frame, layout, 'notice-board')!.notes).toEqual([]);
    expect(placeCardOf(old as Frame, layout, 'provision-shop')!.shop!.workers).toEqual([]);
    expect(placeCardOf(old as Frame, layout, 'farm')!.beds!.every((b) => b.who === null)).toBe(true);
    expect(sgt(9)).toBeGreaterThan(0);
  });
});
