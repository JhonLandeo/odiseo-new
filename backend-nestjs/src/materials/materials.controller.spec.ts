import { Reflector } from '@nestjs/core';
import { MaterialsController } from './materials.controller';
import { REQUIRE_PERMISSIONS_KEY } from '../common/guards/permissions.guard';
import { PERMISSIONS } from '../admin/roles/constants/permissions.constant';
import { IS_PUBLIC_KEY } from '../common/decorators/public.decorator';

describe('MaterialsController permissions', () => {
  const reflector = new Reflector();

  function permissionsOf(method: keyof MaterialsController) {
    return reflector.get<string[]>(
      REQUIRE_PERMISSIONS_KEY,
      MaterialsController.prototype[method],
    );
  }

  const readRoutes: (keyof MaterialsController)[] = [
    'getReviewData',
    'downloadCoursePdf',
    'downloadMergedPdf',
    'getDashboardMetrics',
    'getHistory',
    'getAttempts',
    'getQuestionPreview',
    'getQuestionAlternatives',
  ];

  const writeRoutes: (keyof MaterialsController)[] = [
    'generateMaterial',
    'saveDraftCuration',
    'approveCuration',
  ];

  it.each(readRoutes)('gates %s on VIEW_MATERIALS', (method) => {
    expect(permissionsOf(method)).toEqual([PERMISSIONS.VIEW_MATERIALS]);
  });

  it.each(writeRoutes)('gates %s on EDIT_MATERIALS', (method) => {
    expect(permissionsOf(method)).toEqual([PERMISSIONS.EDIT_MATERIALS]);
  });

  it('leaves the worker webhook ungated, since it carries no user session', () => {
    // Authenticated by WebhookAuthGuard with a shared secret. There is no user
    // and therefore no permission set for PermissionsGuard to evaluate, so a
    // @RequirePermissions here would reject every legitimate worker callback.
    expect(permissionsOf('updateMaterialStatus')).toBeUndefined();
    expect(
      reflector.get<boolean>(
        IS_PUBLIC_KEY,
        MaterialsController.prototype.updateMaterialStatus,
      ),
    ).toBe(true);
  });

  it('leaves no other route ungated', () => {
    const routes = Object.getOwnPropertyNames(
      MaterialsController.prototype,
    ).filter((name) => name !== 'constructor');

    const ungated = routes.filter(
      (name) =>
        permissionsOf(name as keyof MaterialsController) === undefined &&
        name !== 'updateMaterialStatus',
    );

    expect(ungated).toEqual([]);
  });
});
