import { IsString, IsArray, IsOptional, IsUUID, IsIn } from 'class-validator';
import { PERMISSIONS } from '../constants/permissions.constant';

const PERMISSION_VALUES = Object.values(PERMISSIONS) as string[];

export class UpdateRoleDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  // Same canonical vocabulary as CreateRoleDto: an unknown permission string
  // would be persisted verbatim and never match anything at authorization time.
  @IsArray()
  @IsString({ each: true })
  @IsIn(PERMISSION_VALUES, {
    each: true,
    message: `each value in permissions must be one of the following values: ${PERMISSION_VALUES.join(', ')}`,
  })
  @IsOptional()
  permissions?: string[];

  @IsArray()
  @IsUUID('4', { each: true })
  @IsOptional()
  inheritedRoleIds?: string[];
}
