import {
  IsString,
  IsOptional,
  IsEmail,
  IsNotEmpty,
  IsEnum,
  MinLength,
  IsDateString,
} from 'class-validator';
import { Transform } from 'class-transformer';

// The admin UI renders optional fields as empty text inputs and sends them as
// '' rather than omitting them. `@IsOptional()` only skips `undefined`/`null`,
// so an empty string still reaches `@IsEmail()`/`@MinLength()` and fails
// validation. Coerce '' to undefined FIRST so genuinely-empty optionals are
// treated as "not provided" instead of as invalid input.
const emptyStringToUndefined = ({ value }: { value: unknown }) =>
  value === '' ? undefined : value;

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

  // Optional admin credentials (Option A). When BOTH are provided the async
  // provisioning job seeds this Super Administrador inside the new tenant
  // schema; when neither is provided the tenant is created with only its
  // system-default role and the admin is added later (the decoupled flow).
  // Supplying exactly one is rejected in the service — they must come together.
  @Transform(emptyStringToUndefined)
  @IsEmail()
  @IsOptional()
  adminEmail?: string;

  @Transform(emptyStringToUndefined)
  @IsString()
  @IsOptional()
  @MinLength(8)
  adminPassword?: string;

  @Transform(emptyStringToUndefined)
  @IsEmail()
  @IsOptional()
  contactEmail?: string;

  @Transform(emptyStringToUndefined)
  @IsString()
  @IsOptional()
  phone?: string;

  @Transform(emptyStringToUndefined)
  @IsString()
  @IsOptional()
  address?: string;

  @Transform(emptyStringToUndefined)
  @IsString()
  @IsOptional()
  taxId?: string;

  @Transform(emptyStringToUndefined)
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
