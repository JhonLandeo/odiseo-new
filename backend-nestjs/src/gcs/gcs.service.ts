import { Injectable, Logger } from '@nestjs/common';
import { Storage } from '@google-cloud/storage';

@Injectable()
export class GcsService {
  private readonly storage: Storage;
  private readonly bucketName: string;
  private readonly logger = new Logger(GcsService.name);

  constructor() {
    const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID || 'odiseo-api';
    const keyFilename = process.env.GOOGLE_CLOUD_KEY_FILE || `${process.cwd()}/google-cloud-credentials.json`;
    
    this.storage = new Storage({
      projectId,
      keyFilename,
    });
    this.bucketName = process.env.GOOGLE_CLOUD_STORAGE_BUCKET || 'dev_odiseo_bucket';
  }

  async getSignedUrl(gcsKey: string, expiresMinutes = 60): Promise<string> {
    if (!gcsKey) return '';
    
    // If the key is already a full http/https URL, return it directly
    if (gcsKey.startsWith('http://') || gcsKey.startsWith('https://')) {
      return gcsKey;
    }

    try {
      const gcsPromise = this.storage
        .bucket(this.bucketName)
        .file(gcsKey)
        .getSignedUrl({
          version: 'v4',
          action: 'read',
          expires: Date.now() + expiresMinutes * 60 * 1000,
        });

      const timeoutPromise = new Promise<any[]>((_, reject) =>
        setTimeout(() => reject(new Error('GCS timeout')), 100)
      );

      // Attach catch to prevent UnhandledPromiseRejection crashing the server
      gcsPromise.catch(() => {});

      const [url] = await Promise.race([gcsPromise, timeoutPromise]);
      return url;
    } catch (error: any) {
      this.logger.error(`Error generating GCS signed URL for key "${gcsKey}": ${error.message}`);
      return '';
    }
  }
}
