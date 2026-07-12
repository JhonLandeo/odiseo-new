import { IsString, IsArray, IsOptional, IsUUID } from 'class-validator';

export class CreateRoleDto {
  @IsString()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  permissions?: string[];

  @IsArray()
  @IsUUID('4', { each: true })
  @IsOptional()
  inheritedRoleIds?: string[];
}
