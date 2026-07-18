import { EntityManager } from 'typeorm';

/**
 * Role-hierarchy traversal, expressed once as SQL.
 *
 * WHY SQL AND NOT AN IN-MEMORY WALK
 * ---------------------------------
 * Permission resolution sits on the guard path: it runs for (almost) every
 * authenticated request. The previous in-memory resolver loaded the ENTIRE
 * roles table with its `inheritedRoles` relation just to answer "what can this
 * one user do", which is O(all roles) per call regardless of how many roles the
 * user actually holds. A recursive CTE walks only the reachable sub-graph and
 * returns nothing but the permission arrays, so the cost tracks the user's own
 * hierarchy instead of the tenant's role catalogue.
 *
 * WHY THIS IS CYCLE-SAFE
 * ----------------------
 * Both queries use `UNION` (set semantics), never `UNION ALL`. Postgres stops
 * a recursive term once an iteration produces no rows that are not already in
 * the working set, so a cycle A -> B -> A contributes A and B exactly once and
 * then terminates. This is the SQL equivalent of the `visitedRoleIds` guard the
 * in-memory resolver used, with the same two properties: it cannot loop
 * forever, and it cannot emit a role twice.
 *
 * SCHEMA NOTE
 * -----------
 * `role_inheritance` is (parent_role_id, child_role_id) — verified against both
 * the tenant migration and the live database, and it matches the `@JoinTable`
 * mapping on `Role.inheritedRoles` (joinColumn = child_role_id, inverseJoin =
 * parent_role_id). A role's `inheritedRoles` are therefore its PARENTS: the
 * role is the child and inherits downward from what it points at.
 *
 * Identifiers are deliberately unqualified: every caller runs inside a
 * transaction whose `search_path` is already pinned to the tenant schema.
 */

/**
 * Every role a user effectively holds: the ones assigned directly, plus every
 * ancestor reachable through `role_inheritance` (child -> parent).
 */
const EFFECTIVE_PERMISSIONS_SQL = `
  WITH RECURSIVE effective_roles AS (
    SELECT ur.role_id AS role_id
    FROM user_roles ur
    WHERE ur.user_id = $1
    UNION
    SELECT ri.parent_role_id AS role_id
    FROM role_inheritance ri
    INNER JOIN effective_roles er ON ri.child_role_id = er.role_id
  )
  SELECT r.id, r.name, r.permissions
  FROM roles r
  INNER JOIN effective_roles er ON er.role_id = r.id
`;

/**
 * Every permission a GIVEN SET OF ROLES effectively confers: the permissions of
 * the roles themselves, plus those of every ancestor reachable through
 * `role_inheritance` (child -> parent).
 *
 * Same upward traversal as EFFECTIVE_PERMISSIONS_SQL, but seeded from an
 * explicit array of role ids (`unnest($1::uuid[])`) instead of from a user's
 * `user_roles`. This is what the grant-boundary check needs: "if I attach these
 * roles (as inheritance, or as a user assignment), which permissions would that
 * confer?" — so the actor can be stopped from handing out anything they do not
 * themselves hold. `UNION` (not `UNION ALL`) makes it cycle-safe for the same
 * reason the other CTEs are.
 */
const ROLE_SET_EFFECTIVE_PERMISSIONS_SQL = `
  WITH RECURSIVE effective_roles AS (
    SELECT unnest($1::uuid[]) AS role_id
    UNION
    SELECT ri.parent_role_id AS role_id
    FROM role_inheritance ri
    INNER JOIN effective_roles er ON ri.child_role_id = er.role_id
  )
  SELECT r.id, r.name, r.permissions
  FROM roles r
  INNER JOIN effective_roles er ON er.role_id = r.id
`;

/**
 * Every role whose effective permissions depend on the given role: the role
 * itself, plus every descendant that inherits from it (parent -> child).
 *
 * The inverse direction of the permission walk, and the reason it exists:
 * editing a PARENT silently changes what holders of its DESCENDANTS can do, so
 * cache invalidation has to fan out this way or those users keep serving stale,
 * potentially over-privileged permissions until the TTL expires.
 */
const DEPENDENT_ROLE_HOLDERS_SQL = `
  WITH RECURSIVE dependent_roles AS (
    SELECT $1::uuid AS role_id
    UNION
    SELECT ri.child_role_id AS role_id
    FROM role_inheritance ri
    INNER JOIN dependent_roles dr ON ri.parent_role_id = dr.role_id
  )
  SELECT DISTINCT ur.user_id
  FROM user_roles ur
  INNER JOIN dependent_roles dr ON ur.role_id = dr.role_id
`;

export interface EffectiveRoleRow {
  id: string;
  name: string;
  permissions: string[] | null;
}

/**
 * Loads the user's effective roles (direct + inherited) inside the manager's
 * current schema. Returns the raw rows so callers that also need role NAMES
 * (login, /auth/me) do not have to issue a second query.
 */
export async function findEffectiveRoles(
  manager: EntityManager,
  userId: string,
): Promise<EffectiveRoleRow[]> {
  return manager.query(EFFECTIVE_PERMISSIONS_SQL, [userId]);
}

/** Flattens effective-role rows into a de-duplicated permission list. */
export function flattenPermissions(rows: EffectiveRoleRow[]): string[] {
  return Array.from(
    new Set<string>(rows.flatMap((row) => row.permissions || [])),
  );
}

/** Convenience wrapper: effective permissions only. */
export async function findEffectivePermissions(
  manager: EntityManager,
  userId: string,
): Promise<string[]> {
  return flattenPermissions(await findEffectiveRoles(manager, userId));
}

/**
 * Effective permissions conferred by a set of role ids: the roles' own
 * permissions plus everything they inherit, transitively, de-duplicated.
 *
 * Used to bound privilege grants — an actor must not be able to attach (via
 * inheritance or user assignment) a role that carries a permission they lack.
 * Returns an empty list for an empty input without touching the database.
 */
export async function findEffectivePermissionsForRoleIds(
  manager: EntityManager,
  roleIds: string[],
): Promise<string[]> {
  if (roleIds.length === 0) return [];
  const rows: EffectiveRoleRow[] = await manager.query(
    ROLE_SET_EFFECTIVE_PERMISSIONS_SQL,
    [roleIds],
  );
  return flattenPermissions(rows);
}

/**
 * Ids of every user whose cached permissions are invalidated by a change to
 * `roleId` — direct holders AND holders of any role inheriting from it.
 */
export async function findDependentRoleHolderIds(
  manager: EntityManager,
  roleId: string,
): Promise<string[]> {
  const rows = await manager.query(DEPENDENT_ROLE_HOLDERS_SQL, [roleId]);
  return rows.map((row: { user_id: string }) => row.user_id);
}
