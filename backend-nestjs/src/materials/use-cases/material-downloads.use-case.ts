import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { TenantService } from '../../database/tenant.service';
import {
  MaterialRequestCourse,
  CourseMaterialStatus,
} from '../entities/material-request-course.entity';
import { MaterialRequest } from '../entities/material-request.entity';
import { S3Service } from '../../aws/s3.service';

@Injectable()
export class MaterialDownloadsUseCase {
  private readonly logger = new Logger(MaterialDownloadsUseCase.name);

  constructor(
    private readonly tenantService: TenantService,
    private readonly s3Service: S3Service,
  ) {}

  private async getSignedUrlFromRaw(
    rawUrl: string,
  ): Promise<{ signedUrl: string; s3Key: string; filename: string }> {
    let s3Key = rawUrl;
    if (rawUrl.startsWith('http')) {
      const urlObj = new URL(rawUrl);
      const parts = urlObj.pathname.split('/');
      s3Key = parts.slice(2).join('/');
    }

    const filename = s3Key.split('/').pop() || 'material.pdf';
    const signedUrl = await this.s3Service.getPresignedDownloadUrl(s3Key, 3600);

    return { signedUrl, s3Key, filename };
  }

  async getDownloadUrl(
    id: string,
    courseId: string,
    type: 'student' | 'keys' | 'solutions' = 'student',
  ): Promise<any> {
    return this.tenantService.runInTenant(async (manager) => {
      const courseReq = await manager.findOne(MaterialRequestCourse, {
        where: { materialRequestId: id, courseId },
      });

      if (!courseReq) {
        throw new NotFoundException(
          'El curso solicitado no forma parte de esta solicitud de material',
        );
      }

      let rawUrl: string | null = courseReq.downloadUrl;
      if (type === 'keys') {
        rawUrl = courseReq.keyDownloadUrl;
      } else if (type === 'solutions') {
        rawUrl = courseReq.solutionDownloadUrl;
      }

      if (
        (courseReq.status !== CourseMaterialStatus.COMPLETED &&
          courseReq.status !== CourseMaterialStatus.COMPLETED_WITH_WARNINGS) ||
        !rawUrl
      ) {
        throw new BadRequestException(
          'El material aún no está listo o falló su generación',
        );
      }

      const { signedUrl, s3Key, filename } =
        await this.getSignedUrlFromRaw(rawUrl);

      return {
        materialId: id,
        courseId,
        downloadUrl: signedUrl,
        s3Key,
        filename,
        expiresIn: 3600,
      };
    });
  }

  async getMergedDownloadUrl(
    id: string,
    type: 'student' | 'keys' | 'solutions' = 'student',
  ): Promise<any> {
    return this.tenantService.runInTenant(async (manager) => {
      const request = await manager.findOne(MaterialRequest, {
        where: { id },
      });

      if (!request) {
        throw new NotFoundException('La solicitud de material no existe');
      }

      let rawUrl: string | null = request.mergedDownloadUrl;
      if (type === 'keys') {
        rawUrl = request.mergedKeyDownloadUrl;
      } else if (type === 'solutions') {
        rawUrl = request.mergedSolutionDownloadUrl;
      }

      if (!rawUrl) {
        throw new BadRequestException(
          'El PDF combinado aún no está disponible',
        );
      }

      const { signedUrl, s3Key, filename } =
        await this.getSignedUrlFromRaw(rawUrl);

      return {
        materialId: id,
        downloadUrl: signedUrl,
        s3Key,
        filename,
        expiresIn: 3600,
      };
    });
  }

  async streamDownload(s3Key: string): Promise<Buffer> {
    return this.s3Service.getObject(s3Key);
  }

  async getCoursesForMerge(materialRequestId: string): Promise<any[]> {
    return this.tenantService.runInTenant(async (manager) => {
      return manager.find(MaterialRequestCourse, {
        where: { materialRequestId },
      });
    });
  }

  async updateMergedDownloadUrl(
    materialRequestId: string,
    mergedUrl: string,
    mergedKeyUrl?: string,
    mergedSolutionUrl?: string,
  ): Promise<void> {
    return this.tenantService.runInTenant(async (manager) => {
      await manager.update(MaterialRequest, materialRequestId, {
        mergedDownloadUrl: mergedUrl,
        mergedKeyDownloadUrl: mergedKeyUrl || undefined,
        mergedSolutionDownloadUrl: mergedSolutionUrl || undefined,
      });
      this.logger.log(
        `Merged download URLs updated for MaterialRequest ${materialRequestId}`,
      );
    });
  }
}
