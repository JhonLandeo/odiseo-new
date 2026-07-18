import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

@Injectable()
export class S3Service {
  private readonly s3Client: S3Client;
  private readonly bucketName: string;
  private readonly logger = new Logger(S3Service.name);

  /**
   * The dev defaults below (LocalStack endpoint, dev bucket) are a convenience
   * for a fresh clone ONLY. In production they were actively dangerous: a
   * missing `AWS_S3_ENDPOINT` silently pointed the live API at
   * `http://localhost:4566`, so uploads appeared to succeed and went nowhere.
   * The Joi schema in AppModule now makes these keys required when
   * `NODE_ENV=production`, so the fallbacks can never be reached there.
   */
  constructor(private readonly config: ConfigService) {
    this.s3Client = new S3Client({
      region: this.config.get<string>('AWS_REGION', 'us-east-1'),
      endpoint: this.config.get<string>(
        'AWS_S3_ENDPOINT',
        'http://localhost:4566',
      ),
      forcePathStyle: true,
    });
    this.bucketName = this.config.get<string>(
      'AWS_S3_BUCKET',
      'odiseo-materials',
    );
  }

  async getPresignedDownloadUrl(
    key: string,
    expiresInSeconds: number = 86400,
  ): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });

    try {
      const url = await getSignedUrl(this.s3Client, command, {
        expiresIn: expiresInSeconds,
      });
      return url;
    } catch (error: any) {
      this.logger.error(
        `Failed to generate presigned URL for key ${key}: ${error.message}`,
      );
      throw error;
    }
  }
  async uploadBuffer(
    key: string,
    buffer: Buffer,
    contentType: string,
  ): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    });

    try {
      await this.s3Client.send(command);
      this.logger.log(`Successfully uploaded buffer to S3 with key ${key}`);
      return await this.getPresignedDownloadUrl(key);
    } catch (error: any) {
      this.logger.error(`Failed to upload buffer to S3: ${error.message}`);
      throw error;
    }
  }

  async getObject(key: string): Promise<Buffer> {
    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });

    try {
      const response = await this.s3Client.send(command);
      if (!response.Body) {
        throw new Error(`Empty response body for key ${key}`);
      }
      return Buffer.from(await response.Body.transformToByteArray());
    } catch (error: any) {
      this.logger.error(
        `Failed to get object from S3 with key ${key}: ${error.message}`,
      );
      throw error;
    }
  }

  async deleteObject(key: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });

    try {
      await this.s3Client.send(command);
      this.logger.log(`Successfully deleted object from S3 with key ${key}`);
    } catch (error: any) {
      this.logger.error(
        `Failed to delete object from S3 with key ${key}: ${error.message}`,
      );
      throw error;
    }
  }
}
