import { BadRequestException } from '@nestjs/common';
import { TenantsAdminController } from './tenants-admin.controller';

// findAll() query-param parsing: `page` drives `skip` in the service, so
// garbage input must 400 rather than silently resolve to page 1 (an operator
// paging past the end, or with a typo, would otherwise be misled). `pageSize`
// only bounds response size / fan-out cost, so it is clamped instead.
describe('TenantsAdminController.findAll query parsing', () => {
  function createController() {
    const tenantsAdminService = {
      findAll: jest
        .fn()
        .mockResolvedValue({ data: [], total: 0, page: 1, pageSize: 25 }),
      findAllLite: jest.fn().mockResolvedValue([]),
    };
    const controller = new TenantsAdminController(tenantsAdminService as any);
    return { controller, tenantsAdminService };
  }

  it('defaults to page 1 and the default pageSize when neither is given', async () => {
    const { controller, tenantsAdminService } = createController();

    await controller.findAll();

    expect(tenantsAdminService.findAll).toHaveBeenCalledWith(1, 25);
  });

  it('passes through explicit numeric page and pageSize', async () => {
    const { controller, tenantsAdminService } = createController();

    await controller.findAll('3', '10');

    expect(tenantsAdminService.findAll).toHaveBeenCalledWith(3, 10);
  });

  it('rejects a non-numeric page with a 400', async () => {
    const { controller } = createController();

    await expect(controller.findAll('abc')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects a page below 1 with a 400', async () => {
    const { controller } = createController();

    await expect(controller.findAll('0')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('falls back to the default pageSize when it is not a valid number', async () => {
    const { controller, tenantsAdminService } = createController();

    await controller.findAll('1', 'not-a-number');

    expect(tenantsAdminService.findAll).toHaveBeenCalledWith(1, 25);
  });
});

describe('TenantsAdminController.findAllLite', () => {
  it('delegates to the service with no arguments', async () => {
    const tenantsAdminService = { findAllLite: jest.fn().mockResolvedValue([]) };
    const controller = new TenantsAdminController(tenantsAdminService as any);

    await controller.findAllLite();

    expect(tenantsAdminService.findAllLite).toHaveBeenCalledWith();
  });
});
