import { IsString, IsArray, IsOptional, IsUUID, IsIn } from 'class-validator';
import { PERMISSIONS } from '../constants/permissions.constant';

const PERMISSION_VALUES = Object.values(PERMISSIONS) as string[];

export class CreateRoleDto {
  @IsString()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  // Permissions are matched literally against PERMISSIONS when authorizing, so
  // an unrecognised string is not a harmless extra: it silently produces a role
  // that grants nothing while looking configured. Reject typos at the edge.
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
