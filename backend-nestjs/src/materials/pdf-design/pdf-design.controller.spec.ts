import { Reflector } from '@nestjs/core';
import { PdfDesignController } from './pdf-design.controller';
import { REQUIRE_PERMISSIONS_KEY } from '../../common/guards/permissions.guard';
import { PERMISSIONS } from '../../admin/roles/constants/permissions.constant';

describe('PdfDesignController permissions', () => {
  const reflector = new Reflector();

  function permissionsOf(method: keyof PdfDesignController) {
    return reflector.get<string[]>(
      REQUIRE_PERMISSIONS_KEY,
      PdfDesignController.prototype[method],
    );
  }

  const readRoutes: (keyof PdfDesignController)[] = [
    'findAll',
    'findById',
    'preview',
  ];

  const writeRoutes: (keyof PdfDesignController)[] = [
    'create',
    'update',
    'delete',
    'uploadAsset',
    'deleteAsset',
  ];

  it.each(readRoutes)('gates %s on VIEW_MATERIALS', (method) => {
    expect(permissionsOf(method)).toEqual([PERMISSIONS.VIEW_MATERIALS]);
  });

  it.each(writeRoutes)('gates %s on EDIT_MATERIALS', (method) => {
    expect(permissionsOf(method)).toEqual([PERMISSIONS.EDIT_MATERIALS]);
  });

  it('leaves no route ungated', () => {
    const routes = Object.getOwnPropertyNames(
      PdfDesignController.prototype,
    ).filter((name) => name !== 'constructor' && name !== 'getTenantId');

    const ungated = routes.filter(
      (name) => permissionsOf(name as keyof PdfDesignController) === undefined,
    );

    expect(ungated).toEqual([]);
  });
});
