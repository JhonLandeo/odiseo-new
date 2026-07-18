import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Storage } from '@google-cloud/storage';

@Injectable()
export class GcsService {
  private readonly storage: Storage;
  private readonly bucketName: string;
  private readonly signedUrlTimeoutMs: number;
  private readonly logger = new Logger(GcsService.name);

  private static readonly MAX_ATTEMPTS = 3;
  private static readonly DEFAULT_TIMEOUT_MS = 5000;

  constructor(private readonly config: ConfigService) {
    // No `|| 'odiseo-api'` style fallbacks: a production process that silently
    // fell back to the dev project/bucket wrote user data to the wrong place and
    // nobody noticed. These keys are enforced in production by the Joi schema in
    // AppModule; the dev-only defaults below stay so a fresh clone still boots.
    const projectId = this.config.get<string>(
      'GOOGLE_CLOUD_PROJECT_ID',
      'odiseo-api',
    );
    const keyFilename = this.config.get<string>(
      'GOOGLE_CLOUD_KEY_FILE',
      `${process.cwd()}/google-cloud-credentials.json`,
    );

    this.storage = new Storage({ projectId, keyFilename });
    this.bucketName = this.config.get<string>(
      'GOOGLE_CLOUD_STORAGE_BUCKET',
      'dev_odiseo_bucket',
    );
    this.signedUrlTimeoutMs = Number(
      this.config.get<string | number>(
        'GCS_SIGNED_URL_TIMEOUT_MS',
        GcsService.DEFAULT_TIMEOUT_MS,
      ),
    );
  }

  /**
   * Returns a short-lived signed read URL for a GCS object.
   *
   * Throws when signing cannot be completed. This is deliberate and is a
   * behaviour change: the previous implementation raced signing against a 100ms
   * timeout and returned `''` on any failure. That empty string became the `src`
   * of `<img>` tags in generated exam PDFs, so jobs shipped documents with
   * missing question images and still reported `completed` — silent data loss.
   * A caller that genuinely tolerates a missing URL must now opt in explicitly
   * by catching.
   */
  async getSignedUrl(gcsKey: string, expiresMinutes = 60): Promise<string> {
    if (!gcsKey) return '';

    // If the key is already a full http/https URL, return it directly
    if (gcsKey.startsWith('http://') || gcsKey.startsWith('https://')) {
      return gcsKey;
    }

    // Bounded retry with backoff: signing is a network call to Google's IAM
    // endpoint, and a transient blip must not cost the whole PDF job.
    let lastError: Error = new Error('unknown error');
    for (let attempt = 1; attempt <= GcsService.MAX_ATTEMPTS; attempt++) {
      try {
        return await this.signWithTimeout(gcsKey, expiresMinutes);
      } catch (error) {
        lastError = error as Error;
        const isLast = attempt === GcsService.MAX_ATTEMPTS;
        this.logger.error(
          `Error generating GCS signed URL for key "${gcsKey}" ` +
            `(attempt ${attempt}/${GcsService.MAX_ATTEMPTS}): ${lastError.message}`,
        );
        if (!isLast) {
          await this.delay(attempt * 500);
        }
      }
    }

    throw new Error(
      `Failed to generate GCS signed URL for key "${gcsKey}" after ` +
        `${GcsService.MAX_ATTEMPTS} attempts: ${lastError.message}`,
    );
  }

  private async signWithTimeout(
    gcsKey: string,
    expiresMinutes: number,
  ): Promise<string> {
    const gcsPromise = this.storage
      .bucket(this.bucketName)
      .file(gcsKey)
      .getSignedUrl({
        version: 'v4',
        action: 'read',
        expires: Date.now() + expiresMinutes * 60 * 1000,
      });

    // The old `gcsPromise.catch(() => {})` guard is gone: `Promise.race`
    // subscribes to every input promise, so a rejection arriving after the
    // timeout already won is still handled and can never surface as an
    // UnhandledPromiseRejection.
    let timer: NodeJS.Timeout | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () =>
          reject(
            new Error(
              `GCS signing timed out after ${this.signedUrlTimeoutMs}ms`,
            ),
          ),
        this.signedUrlTimeoutMs,
      );
    });

    try {
      const [url] = await Promise.race([gcsPromise, timeoutPromise]);
      return url;
    } finally {
      // Clear the pending timer so a fast success does not hold the event loop
      // open for the full timeout window.
      if (timer) clearTimeout(timer);
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
