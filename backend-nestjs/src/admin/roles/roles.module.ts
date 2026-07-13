import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Role } from './entities/role.entity';
import { UserRole } from './entities/user-role.entity';
import { RolesService } from './services/roles.service';
import { RolesResolverService } from './services/roles-resolver.service';
import { RolesController } from './controllers/roles.controller';
import { UserRolesController } from './controllers/user-roles.controller';
import { PermissionsController } from './controllers/permissions.controller';
import { UsersController } from './controllers/users.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Role, UserRole])],
  controllers: [RolesController, UserRolesController, PermissionsController, UsersController],
  providers: [RolesService, RolesResolverService],
  exports: [RolesService, RolesResolverService],
})
export class RolesModule {}
