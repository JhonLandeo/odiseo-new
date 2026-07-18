import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  HttpCode,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CatalogUseCase } from './catalog.use-case';
import { JwtAuthGuard } from '../auth/auth.guard';
import {
  PermissionsGuard,
  RequirePermissions,
} from '../common/guards/permissions.guard';
import { PERMISSIONS } from '../admin/roles/constants/permissions.constant';
import { ToggleTopicVisibilityDto } from './dto/toggle-topic-visibility.dto';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('v1/catalogs')
export class CatalogsController {
  constructor(private readonly catalogUseCase: CatalogUseCase) {}

  @Get('courses')
  @RequirePermissions(PERMISSIONS.VIEW_CATALOGS)
  async getCourses(@Query('search') search?: string) {
    return this.catalogUseCase.getCourses(search);
  }

  @Get('courses/:id/topics')
  @RequirePermissions(PERMISSIONS.VIEW_CATALOGS)
  async getCourseTopics(
    @Param('id') courseId: string,
    @Query('search') search?: string,
  ) {
    return this.catalogUseCase.getCourseTopics(courseId, search);
  }

  @Patch('topics/:id/visibility')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.EDIT_CATALOGS)
  async updateTopicVisibility(
    @Param('id') id: string,
    @Body() body: ToggleTopicVisibilityDto,
  ) {
    await this.catalogUseCase.updateTopicVisibility(id, body.isActive);
    return { id, isActive: body.isActive };
  }
}
