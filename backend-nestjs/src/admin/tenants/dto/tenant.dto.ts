import {
  IsString,
  IsOptional,
  IsEmail,
  IsNotEmpty,
  IsEnum,
  MinLength,
  IsDateString,
} from 'class-validator';

export class CreateTenantDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  subdomain: string;

  @IsString()
  @IsNotEmpty()
  subscription_plan_id: string;

  @IsEmail()
  @IsOptional()
  contactEmail?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsString()
  @IsOptional()
  taxId?: string;

  @IsString()
  @IsOptional()
  logoUrl?: string;
}

export class UpdateTenantDto {
  @IsString()
  @IsOptional()
  commercialName?: string;

  @IsString()
  @IsOptional()
  subscription_plan_id?: string;

  @IsString()
  @IsOptional()
  contactEmail?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsString()
  @IsOptional()
  taxId?: string;

  @IsString()
  @IsOptional()
  logoUrl?: string;
}

export class UpdateTenantStatusDto {
  @IsEnum(['ACTIVE', 'SUSPENDED', 'GRACE_PERIOD'])
  status: 'ACTIVE' | 'SUSPENDED' | 'GRACE_PERIOD';

  @IsDateString()
  @IsOptional()
  grace_period_until?: string;
}

export class ResetAdminDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsOptional()
  @MinLength(8)
  password?: string;
}
