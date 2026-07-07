import { Test, TestingModule } from '@nestjs/testing';
import { MaterialsService } from './materials.service';
import { getQueueToken } from '@nestjs/bullmq';
import { ClsService } from 'nestjs-cls';
import { TenantService } from '../database/tenant.service';
import { getEntityManagerToken } from '@nestjs/typeorm';
import { I_MATERIALS_REPOSITORY } from './repositories/i-materials.repository';
import { S3Service } from '../aws/s3.service';
import { GcsService } from '../gcs/gcs.service';
import {
  BadRequestException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { MaterialRequestStatus } from './entities/material-status.enum';
import { ReviewQuestionStatus } from './entities/material-review-question.entity';
import { CourseMaterialStatus } from './entities/material-request-course.entity';

describe('MaterialsService', () => {
  let service: MaterialsService;
  let materialsQueue: any;
  let clsService: any;
  let tenantService: any;
  let materialsRepo: any;
  let s3Service: any;
  let mockEntityManager: any;
  let gcsService: any;

  beforeEach(async () => {
    mockEntityManager = {
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn((entityClass, data) => data),
      save: jest.fn((entityClass, data) => Promise.resolve(data)),
      update: jest.fn(),
      query: jest.fn().mockResolvedValue([{ topic_id: 't-1', subtopic_id: 's-1' }]),
    };

    materialsQueue = {
      add: jest.fn(),
    };
    clsService = {
      get: jest.fn().mockReturnValue('mock-tenant-id'),
    };
    tenantService = {
      runInTenant: jest.fn((callback) => callback(mockEntityManager)),
    };
    materialsRepo = {
      createRequest: jest.fn(),
      findRequestById: jest.fn(),
      updateRequestStatus: jest.fn(),
    };
    s3Service = {
      getPresignedDownloadUrl: jest
        .fn()
        .mockResolvedValue('https://s3.amazonaws.com/mock-signed-url'),
    };
    gcsService = {
      getSignedUrl: jest
        .fn()
        .mockResolvedValue('https://storage.googleapis.com/mock-signed-url'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MaterialsService,
        { provide: getQueueToken('materials-queue'), useValue: materialsQueue },
        { provide: ClsService, useValue: clsService },
        { provide: TenantService, useValue: tenantService },
        { provide: I_MATERIALS_REPOSITORY, useValue: materialsRepo },
        { provide: S3Service, useValue: s3Service },
        { provide: GcsService, useValue: gcsService },
        {
          provide: getEntityManagerToken('questionsConnection'),
          useValue: mockEntityManager,
        },
      ],
    }).compile();

    service = module.get<MaterialsService>(MaterialsService);
  });

  describe('getReviewData', () => {
    it('should throw NotFoundException if request not found', async () => {
      mockEntityManager.findOne.mockResolvedValue(null);

      await expect(service.getReviewData('non-existent-id')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should transition status to IN_REVIEW and return review questions', async () => {
      const mockRequest = {
        id: 'req-id',
        status: MaterialRequestStatus.REVIEW_REQUIRED,
        version: 1,
      };
      const mockQuestions = [
        {
          id: 'q-1',
          topicId: 'topic-1',
          subtopicId: 'sub-1',
          position: 1,
          status: ReviewQuestionStatus.FOUND,
        },
      ];
      const mockTopics = [
        { id: 'topic-1', courseId: 'course-1', name: 'Topic 1' },
      ];
      const mockSubtopics = [{ id: 'sub-1', name: 'Subtopic 1' }];

      mockEntityManager.findOne.mockResolvedValue(mockRequest);
      mockEntityManager.find.mockImplementation((entityClass, options) => {
        // Match the entity name or class
        if (entityClass.name === 'MaterialReviewQuestion')
          return Promise.resolve(mockQuestions);
        if (entityClass.name === 'Topic') return Promise.resolve(mockTopics);
        if (entityClass.name === 'Subtopic')
          return Promise.resolve(mockSubtopics);
        return Promise.resolve([]);
      });

      const result = await service.getReviewData('req-id');

      expect(result.materialId).toBe('req-id');
      expect(result.status).toBe(MaterialRequestStatus.IN_REVIEW);
      expect(result.questions[0].topicName).toBe('Topic 1');
      expect(mockEntityManager.save).toHaveBeenCalled();
    });
  });

  describe('approveCuration', () => {
    it('should throw ConflictException on version mismatch (optimistic locking)', async () => {
      const mockRequest = { id: 'req-id', version: 1 };
      mockEntityManager.findOne.mockResolvedValue(mockRequest);

      await expect(
        service.approveCuration('req-id', {
          version: 2,
          continueWithWarnings: false,
          replacements: [],
          removals: [],
        }, 'test-user'),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw BadRequestException if there are empty slots and continueWithWarnings is false', async () => {
      const mockRequest = { id: 'req-id', version: 1, courses: [] };
      const mockQuestions = [{ id: 'q-1', status: ReviewQuestionStatus.EMPTY }];

      mockEntityManager.findOne.mockResolvedValue(mockRequest);
      mockEntityManager.find.mockResolvedValue(mockQuestions);

      await expect(
        service.approveCuration('req-id', {
          version: 1,
          continueWithWarnings: false,
          replacements: [],
          removals: [],
        }, 'test-user'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should succeed, process updates, and dispatch to SQS', async () => {
      const mockRequest = {
        id: 'req-id',
        version: 1,
        profileId: 'template-id',
        weekNumber: 1,
        courses: [{ id: 'course-req-1', courseId: 'course-1' }],
      };
      const mockQuestions = [{ id: 'q-1', status: ReviewQuestionStatus.FOUND }];
      const mockSyllabus = { id: 'syllabus-id' };
      const mockDistributions = [
        { topicId: 't-1', subtopicId: 's-1', questionCount: 1 },
      ];

      mockEntityManager.findOne.mockImplementation((entityClass, options) => {
        if (options.where && options.where.id === 'req-id')
          return Promise.resolve(mockRequest);
        if (options.where && options.where.courseId === 'course-1')
          return Promise.resolve(mockSyllabus);
        if (entityClass.name === 'MaterialReviewQuestion' || (options.where && options.where.id === 'q-1')) {
          return Promise.resolve({
            id: 'q-1',
            materialRequestId: 'req-id',
            topicId: 't-1',
            subtopicId: 's-1',
            status: ReviewQuestionStatus.FOUND,
          });
        }
        return Promise.resolve(null);
      });

      mockEntityManager.find.mockImplementation((entityClass, options) => {
        if (entityClass.name === 'MaterialReviewQuestion')
          return Promise.resolve(mockQuestions);
        if (entityClass.name === 'SyllabusDistribution')
          return Promise.resolve(mockDistributions);
        return Promise.resolve([]);
      });

      const result = await service.approveCuration('req-id', {
        version: 1,
        continueWithWarnings: false,
        replacements: [{ reviewQuestionId: 'q-1', questionId: '999' }],
        removals: [],
      }, 'test-user');

      expect(result.status).toBe(MaterialRequestStatus.PROCESSING);
      expect(mockEntityManager.update).toHaveBeenCalled();
      expect(materialsQueue.add).toHaveBeenCalled();
    });
  });

  describe('getDownloadUrl', () => {
    it('should throw NotFoundException if course request does not exist', async () => {
      mockEntityManager.findOne.mockResolvedValue(null);

      await expect(
        service.getDownloadUrl('req-id', 'course-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if course generation is not completed', async () => {
      const mockCourseReq = {
        id: 'c-req-id',
        status: CourseMaterialStatus.PROCESSING,
        downloadUrl: null,
      };
      mockEntityManager.findOne.mockResolvedValue(mockCourseReq);

      await expect(
        service.getDownloadUrl('req-id', 'course-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should resolve the presigned URL successfully from raw or http keys', async () => {
      const mockCourseReq = {
        id: 'c-req-id',
        status: CourseMaterialStatus.COMPLETED,
        downloadUrl:
          'http://localhost:4566/odiseo-materials/materiales/job-123/doc.pdf',
      };
      mockEntityManager.findOne.mockResolvedValue(mockCourseReq);

      const result = await service.getDownloadUrl('req-id', 'course-1');

      expect(result.downloadUrl).toBe(
        'https://s3.amazonaws.com/mock-signed-url',
      );
      expect(s3Service.getPresignedDownloadUrl).toHaveBeenCalledWith(
        'materiales/job-123/doc.pdf',
        3600,
      );
    });
  });
});
