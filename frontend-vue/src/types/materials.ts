/**
 * Tipos compartidos para el módulo de Generación de Balotario PDF.
 * Basados en los contratos de `data-model.md` y `ws-notification.md`.
 */

// --- Enums de Estado ---

/** Estados posibles de un MaterialRequest en la BD */
export enum MaterialRequestStatus {
  PENDING = 'PENDING',
  IN_REVIEW = 'IN_REVIEW',
  PROCESSING = 'PROCESSING',
  REVIEW_REQUIRED = 'REVIEW_REQUIRED',
  COMPLETED = 'COMPLETED',
  COMPLETED_WITH_WARNINGS = 'COMPLETED_WITH_WARNINGS',
  FAILED = 'FAILED',
}

/** Estados de curaduría individual de una pregunta */
export enum ReviewQuestionStatus {
  FOUND = 'FOUND',
  EMPTY = 'EMPTY',
  REPLACED = 'REPLACED',
  REMOVED = 'REMOVED',
}

// --- Interfaces de Datos ---

export interface MaterialRequest {
  id: string;
  tenantId: string;
  profileId: string;
  cycleId: string;
  weekNumber: number;
  status: MaterialRequestStatus;
  requiresReview: boolean;
  designTemplateId: string | null;
  materialId: string | null;
  mergedDownloadUrl: string | null;
  mergedKeyDownloadUrl: string | null;
  mergedSolutionDownloadUrl: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  version: number;
  courses: MaterialRequestCourse[];
  reviewQuestions: MaterialReviewQuestion[];
}

export interface MaterialRequestCourse {
  id: string;
  materialRequestId: string;
  courseId: string;
  status: string;
  downloadUrl?: string;
  keyDownloadUrl?: string;
  solutionDownloadUrl?: string;
  warnings?: any;
}

export interface MaterialReviewQuestion {
  id: string;
  materialRequestId: string;
  questionId: string | null;
  code?: string;
  levelName?: string;
  type?: string;
  topicId: string;
  subtopicId: string;
  position: number;
  status: ReviewQuestionStatus;
  htmlContent?: string;
  options?: any[];
  images?: any[];
  solution?: any;
  textOrigin?: string;
  courseId?: string;
  topicName?: string;
  subtopicName?: string;
}

// --- WebSocket Event Payloads ---

export interface WsCompletedPayload {
  event: 'material.generation.completed';
  data: {
    job_id: string;
    material_type: 'EXAMEN' | 'BALOTARIO';
    status: 'success';
    download_url: string;
    expires_in: number;
  };
}

export interface WsFailedPayload {
  event: 'material.generation.failed';
  data: {
    job_id: string;
    status: 'error';
    error_message: string;
  };
}

export type WsNotificationPayload = WsCompletedPayload | WsFailedPayload;

// --- API Request/Response DTOs ---

export interface GenerateMaterialRequest {
  material_type: 'EXAMEN' | 'BALOTARIO';
  course_id: string;
  difficulty_level: string;
  exam_areas?: string[];
}

export interface GenerateMaterialResponse {
  status: 'processing';
  job_id: string;
  message: string;
}
