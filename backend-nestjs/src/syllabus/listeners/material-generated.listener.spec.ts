import { MaterialGeneratedListener } from './material-generated.listener';
import { SyllabusDistribution } from '../entities/syllabus-distribution.entity';
import { Syllabus } from '../entities/syllabus.entity';

/**
 * Scope: `markWeekGenerated`'s return value, which `MaterialsCron`'s
 * reconciliation sweep relies on to tell "recovered" apart from "found
 * nothing to recover" (a silently-missed no-op would otherwise be
 * mis-logged as a success while the row keeps re-matching every tick).
 * `handleMaterialGeneratedEvent`'s retry loop is covered elsewhere; it never
 * inspects this return value.
 */
function build(options: {
  syllabus?: { id: string } | null;
  affected?: number;
}) {
  const syllabus =
    options.syllabus === undefined ? { id: 'syllabus-1' } : options.syllabus;
  const manager = {
    findOne: jest.fn().mockResolvedValue(syllabus),
    update: jest
      .fn()
      .mockResolvedValue({ affected: options.affected ?? 1 }),
  };
  const tenantService = {
    runInTenant: jest.fn((work: (manager: any) => any) => work(manager)),
  };

  const listener = new MaterialGeneratedListener(tenantService as any);
  return { listener, manager, tenantService };
}

describe('MaterialGeneratedListener.markWeekGenerated', () => {
  const event = { cycleId: 'cycle-1', courseId: 'course-1', weekNumber: 3 };

  it('returns true and applies the update when the syllabus exists and a row is affected', async () => {
    const { listener, manager } = build({});

    await expect(listener.markWeekGenerated(event)).resolves.toBe(true);

    expect(manager.update).toHaveBeenCalledWith(
      SyllabusDistribution,
      { syllabusId: 'syllabus-1', weekNumber: 3 },
      { isGenerated: true },
    );
  });

  it('returns false without attempting an update when the syllabus lookup misses', async () => {
    const { listener, manager } = build({ syllabus: null });

    await expect(listener.markWeekGenerated(event)).resolves.toBe(false);

    expect(manager.update).not.toHaveBeenCalled();
  });

  it('returns false when the syllabus exists but the update affects no rows', async () => {
    const { listener } = build({ affected: 0 });

    await expect(listener.markWeekGenerated(event)).resolves.toBe(false);
  });

  it('looks the syllabus up by cycle and course, matching the event exactly', async () => {
    const { listener, manager } = build({});

    await listener.markWeekGenerated(event);

    expect(manager.findOne).toHaveBeenCalledWith(Syllabus, {
      where: { cycleId: 'cycle-1', courseId: 'course-1' },
    });
  });
});
