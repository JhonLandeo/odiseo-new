import {
  findEffectiveRoles,
  findEffectivePermissions,
  flattenPermissions,
  findDependentRoleHolderIds,
} from './flattened-permissions.query';

/**
 * Simulates the recursive CTEs in JS so the traversal SEMANTICS are covered
 * without a live database: same seed, same edge direction, same `UNION` set
 * semantics (a role already in the working set is never expanded twice).
 */
function makeManager(graph: {
  userRoles?: Record<string, string[]>;
  // child -> parents, matching role_inheritance(child_role_id, parent_role_id)
  inheritance?: Array<{ parent: string; child: string }>;
  roles?: Record<string, { name: string; permissions: string[] | null }>;
}) {
  const edges = graph.inheritance ?? [];
  const roles = graph.roles ?? {};
  const userRoles = graph.userRoles ?? {};

  const expand = (
    seed: string[],
    next: (id: string) => string[],
    guard: { max: number },
  ) => {
    const seen = new Set<string>();
    const queue = [...seed];
    let iterations = 0;
    while (queue.length > 0) {
      // Mirrors UNION: stop expanding anything already in the working set.
      // Also the tripwire for a non-terminating traversal.
      if (++iterations > guard.max) {
        throw new Error('traversal did not terminate');
      }
      const id = queue.shift()!;
      if (seen.has(id)) continue;
      seen.add(id);
      queue.push(...next(id));
    }
    return seen;
  };

  return {
    query: jest.fn(async (sql: string, params: any[]) => {
      if (sql.includes('effective_roles')) {
        const seed = userRoles[params[0]] ?? [];
        const reachable = expand(
          seed,
          (id) => edges.filter((e) => e.child === id).map((e) => e.parent),
          { max: 1000 },
        );
        return [...reachable]
          .filter((id) => roles[id])
          .map((id) => ({ id, ...roles[id] }));
      }

      if (sql.includes('dependent_roles')) {
        const reachable = expand(
          [params[0]],
          (id) => edges.filter((e) => e.parent === id).map((e) => e.child),
          { max: 1000 },
        );
        const holders = new Set<string>();
        for (const [userId, held] of Object.entries(userRoles)) {
          if (held.some((roleId) => reachable.has(roleId))) holders.add(userId);
        }
        return [...holders].map((user_id) => ({ user_id }));
      }

      throw new Error(`unexpected sql: ${sql}`);
    }),
  } as any;
}

describe('role hierarchy SQL', () => {
  describe('query shape', () => {
    it('uses UNION (set semantics), never UNION ALL', async () => {
      // This is the mechanism that makes the recursion cycle-safe: Postgres
      // stops once an iteration adds no unseen rows. UNION ALL would loop
      // forever on a cyclic hierarchy.
      const manager = makeManager({ userRoles: { u1: [] } });
      await findEffectiveRoles(manager, 'u1');
      await findDependentRoleHolderIds(manager, 'r1');

      for (const [sql] of manager.query.mock.calls) {
        expect(sql).toContain('UNION');
        expect(sql).not.toContain('UNION ALL');
      }
    });

    it('walks child -> parent for permissions and parent -> child for invalidation', async () => {
      const manager = makeManager({ userRoles: { u1: [] } });

      await findEffectiveRoles(manager, 'u1');
      expect(manager.query.mock.calls[0][0]).toContain(
        'ri.child_role_id = er.role_id',
      );

      await findDependentRoleHolderIds(manager, 'r1');
      expect(manager.query.mock.calls[1][0]).toContain(
        'ri.parent_role_id = dr.role_id',
      );
    });
  });

  describe('flattenPermissions', () => {
    it('de-duplicates permissions across roles', () => {
      expect(
        flattenPermissions([
          { id: 'a', name: 'A', permissions: ['P1', 'P2'] },
          { id: 'b', name: 'B', permissions: ['P2', 'P3'] },
        ]),
      ).toEqual(['P1', 'P2', 'P3']);
    });

    it('tolerates roles with null permissions', () => {
      expect(
        flattenPermissions([
          { id: 'a', name: 'A', permissions: null },
          { id: 'b', name: 'B', permissions: ['P1'] },
        ]),
      ).toEqual(['P1']);
    });
  });

  describe('inherited permissions', () => {
    it('grants permissions inherited from a parent role', async () => {
      const manager = makeManager({
        userRoles: { u1: ['editor'] },
        inheritance: [{ parent: 'viewer', child: 'editor' }],
        roles: {
          editor: { name: 'Editor', permissions: ['EDIT_SYLLABUS'] },
          viewer: { name: 'Viewer', permissions: ['VIEW_SYLLABUS'] },
        },
      });

      const permissions = await findEffectivePermissions(manager, 'u1');

      // The user holds only "editor"; VIEW_SYLLABUS arrives purely by
      // inheritance. Before this wiring the hierarchy was ignored entirely.
      expect(permissions.sort()).toEqual(['EDIT_SYLLABUS', 'VIEW_SYLLABUS']);
    });

    it('resolves inheritance transitively across several levels', async () => {
      const manager = makeManager({
        userRoles: { u1: ['c'] },
        inheritance: [
          { parent: 'b', child: 'c' },
          { parent: 'a', child: 'b' },
        ],
        roles: {
          a: { name: 'A', permissions: ['PA'] },
          b: { name: 'B', permissions: ['PB'] },
          c: { name: 'C', permissions: ['PC'] },
        },
      });

      expect((await findEffectivePermissions(manager, 'u1')).sort()).toEqual([
        'PA',
        'PB',
        'PC',
      ]);
    });

    it('returns [] for a user with no roles', async () => {
      const manager = makeManager({ userRoles: { u1: [] } });
      expect(await findEffectivePermissions(manager, 'u1')).toEqual([]);
    });

    it('does NOT hang or duplicate on a cyclic hierarchy', async () => {
      const manager = makeManager({
        userRoles: { u1: ['a'] },
        // a -> b -> a: the exact shape that would loop forever without
        // set semantics.
        inheritance: [
          { parent: 'b', child: 'a' },
          { parent: 'a', child: 'b' },
        ],
        roles: {
          a: { name: 'A', permissions: ['PA', 'SHARED'] },
          b: { name: 'B', permissions: ['PB', 'SHARED'] },
        },
      });

      const permissions = await findEffectivePermissions(manager, 'u1');

      expect(permissions.sort()).toEqual(['PA', 'PB', 'SHARED']);
      // SHARED appears in both roles but exactly once in the result.
      expect(permissions.filter((p) => p === 'SHARED')).toHaveLength(1);
    });

    it('does not hang on a self-referencing role', async () => {
      const manager = makeManager({
        userRoles: { u1: ['a'] },
        inheritance: [{ parent: 'a', child: 'a' }],
        roles: { a: { name: 'A', permissions: ['PA'] } },
      });

      expect(await findEffectivePermissions(manager, 'u1')).toEqual(['PA']);
    });
  });

  describe('findDependentRoleHolderIds', () => {
    it('includes holders of DESCENDANT roles, not just direct holders', async () => {
      const manager = makeManager({
        userRoles: { direct: ['admin'], indirect: ['editor'] },
        inheritance: [{ parent: 'admin', child: 'editor' }],
      });

      const holders = await findDependentRoleHolderIds(manager, 'admin');

      // "indirect" never appears in user_roles for admin, yet editing admin
      // changes what they can do. Missing them here is exactly the stale,
      // over-privileged cache this walk exists to prevent.
      expect(holders.sort()).toEqual(['direct', 'indirect']);
    });

    it('walks descendants transitively', async () => {
      const manager = makeManager({
        userRoles: { u1: ['a'], u2: ['b'], u3: ['c'], unrelated: ['z'] },
        inheritance: [
          { parent: 'a', child: 'b' },
          { parent: 'b', child: 'c' },
        ],
      });

      expect((await findDependentRoleHolderIds(manager, 'a')).sort()).toEqual([
        'u1',
        'u2',
        'u3',
      ]);
    });

    it('does not hang on a cyclic hierarchy', async () => {
      const manager = makeManager({
        userRoles: { u1: ['a'], u2: ['b'] },
        inheritance: [
          { parent: 'a', child: 'b' },
          { parent: 'b', child: 'a' },
        ],
      });

      expect((await findDependentRoleHolderIds(manager, 'a')).sort()).toEqual([
        'u1',
        'u2',
      ]);
    });

    it('returns each user once even when they hold several affected roles', async () => {
      const manager = makeManager({
        userRoles: { u1: ['a', 'b'] },
        inheritance: [{ parent: 'a', child: 'b' }],
      });

      expect(await findDependentRoleHolderIds(manager, 'a')).toEqual(['u1']);
    });
  });
});
