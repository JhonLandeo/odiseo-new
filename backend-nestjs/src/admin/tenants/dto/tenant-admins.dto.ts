import { IsString, IsEmail, IsNotEmpty, IsOptional } from 'class-validator';

export class CreateTenantAdminDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  password: string;
}

export class UpdateTenantAdminDto {
  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  name?: string;
}

export class UpdatePasswordDto {
  @IsString()
  @IsNotEmpty()
  password: string;
}
