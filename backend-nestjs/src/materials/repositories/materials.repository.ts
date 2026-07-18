import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IMaterialsRepository } from './i-materials.repository';
import { MaterialRequest } from '../entities/material-request.entity';
import { MaterialRequestCourse } from '../entities/material-request-course.entity';
import { MaterialReviewQuestion } from '../entities/material-review-question.entity';
import { MaterialQuestionUsage } from '../entities/material-question-usage.entity';
import { TenantService } from '../../database/tenant.service';

@Injectable()
export class MaterialsRepository implements IMaterialsRepository {
  constructor(private readonly tenantService: TenantService) {}

  async createRequest(
    request: Partial<MaterialRequest>,
  ): Promise<MaterialRequest> {
    return this.tenantService.runInTenant(async (manager) => {
      const requestRepo = manager.getRepository(MaterialRequest);
      const entity = requestRepo.create(request);
      return requestRepo.save(entity);
    });
  }

  async getRequestById(id: string): Promise<MaterialRequest | null> {
    return this.tenantService.runInTenant(async (manager) => {
      const requestRepo = manager.getRepository(MaterialRequest);
      return requestRepo.findOne({
        where: { id },
        relations: ['courses', 'reviewQuestions'],
      });
    });
  }

  async updateRequestStatus(id: string, status: any): Promise<void> {
    return this.tenantService.runInTenant(async (manager) => {
      const requestRepo = manager.getRepository(MaterialRequest);
      await requestRepo.update(id, { status });
    });
  }

  async createCourses(
    courses: Partial<MaterialRequestCourse>[],
  ): Promise<MaterialRequestCourse[]> {
    return this.tenantService.runInTenant(async (manager) => {
      const courseRepo = manager.getRepository(MaterialRequestCourse);
      const entities = courseRepo.create(courses);
      return courseRepo.save(entities);
    });
  }

  async updateCourse(
    courseId: string,
    data: Partial<MaterialRequestCourse>,
  ): Promise<void> {
    return this.tenantService.runInTenant(async (manager) => {
      const courseRepo = manager.getRepository(MaterialRequestCourse);
      await courseRepo.update(courseId, data);
    });
  }

  async saveReviewQuestions(
    questions: Partial<MaterialReviewQuestion>[],
  ): Promise<void> {
    return this.tenantService.runInTenant(async (manager) => {
      const reviewRepo = manager.getRepository(MaterialReviewQuestion);
      const entities = reviewRepo.create(questions);
      await reviewRepo.save(entities);
    });
  }

  async getReviewQuestions(
    requestId: string,
  ): Promise<MaterialReviewQuestion[]> {
    return this.tenantService.runInTenant(async (manager) => {
      const reviewRepo = manager.getRepository(MaterialReviewQuestion);
      return reviewRepo.find({
        where: { materialRequestId: requestId },
        order: { position: 'ASC' },
      });
    });
  }

  async saveQuestionUsage(
    usages: Partial<MaterialQuestionUsage>[],
  ): Promise<void> {
    return this.tenantService.runInTenant(async (manager) => {
      const usageRepo = manager.getRepository(MaterialQuestionUsage);
      const entities = usageRepo.create(usages);
      await usageRepo.save(entities);
    });
  }

  async getUsedQuestionsInCycle(
    cycleId: string,
    courseId: string,
  ): Promise<string[]> {
    return this.tenantService.runInTenant(async (manager) => {
      const usageRepo = manager.getRepository(MaterialQuestionUsage);
      const usages = await usageRepo.find({
        where: { cycleId, courseId },
        select: ['questionId'],
      });
      return usages.map((u) => u.questionId);
    });
  }
}
