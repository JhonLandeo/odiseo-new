import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

/**
 * The exact set of course statuses the Worker is allowed to report. Any value
 * outside this list is a producer/contract bug, not a course outcome, so it is
 * rejected loudly (400) instead of being silently coerced into FAILED.
 */
export const WEBHOOK_STATUSES = [
  'completed',
  'completed_with_warnings',
  'empty_bank',
  'failed',
  'processing',
] as const;

export type WebhookStatus = (typeof WEBHOOK_STATUSES)[number];

export class WebhookStatusRequestDto {
  @IsString()
  @IsNotEmpty()
  job_id: string;

  @IsIn(WEBHOOK_STATUSES)
  status: WebhookStatus;

  // These carry either a full S3 URL or a bare object key (the merge step
  // handles both), so they are validated as plain strings, not @IsUrl.
  @IsOptional()
  @IsString()
  download_url?: string;

  @IsOptional()
  @IsString()
  key_download_url?: string;

  @IsOptional()
  @IsString()
  solution_download_url?: string;

  @IsOptional()
  @IsString()
  merged_key_download_url?: string;

  @IsOptional()
  @IsString()
  merged_solution_download_url?: string;

  @IsOptional()
  @IsString()
  error_message?: string;
}
