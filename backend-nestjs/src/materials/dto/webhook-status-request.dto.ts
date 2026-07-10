export class WebhookStatusRequestDto {
  job_id: string;
  status: string;
  download_url?: string;
  key_download_url?: string;
  solution_download_url?: string;
  merged_key_download_url?: string;
  merged_solution_download_url?: string;
  error_message?: string;
}
