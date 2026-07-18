import { plainToInstance, Type } from 'class-transformer';
import {
  IsArray,
  IsDefined,
  IsNotEmpty,
  IsString,
  ValidateNested,
  validateSync,
} from 'class-validator';

/**
 * Contract for the catalog payload returned by the Core API.
 *
 * WHY THIS EXISTS
 * ---------------
 * `upsertCatalogs` used to accept `any`, check only that `payload.courses`
 * existed, and then walk `topics[].subtopics[]` blind before upserting into
 * `public.courses/topics/subtopics` — tables every tenant reads. A malformed or
 * partially-broken upstream response therefore wrote garbage (or nulls into NOT
 * NULL columns) straight into the shared catalog, and the catalog is the source
 * of every exam question. Validating the shape first means a bad response is
 * rejected and recorded as a failed sync instead of being half-applied.
 *
 * Ids are validated as non-empty strings rather than numbers: the upstream
 * sends them as strings and the columns are `bigint`, which TypeORM represents
 * as a string too.
 */

export class CatalogSubtopicDto {
  @IsDefined()
  @IsNotEmpty()
  id: string | number;

  @IsString()
  @IsNotEmpty()
  name: string;
}

export class CatalogTopicDto {
  @IsDefined()
  @IsNotEmpty()
  id: string | number;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CatalogSubtopicDto)
  subtopics: CatalogSubtopicDto[] = [];
}

export class CatalogCourseDto {
  @IsDefined()
  @IsNotEmpty()
  id: string | number;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CatalogTopicDto)
  topics: CatalogTopicDto[] = [];
}

export class CatalogPayloadDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CatalogCourseDto)
  courses: CatalogCourseDto[];
}

/** Raised when the upstream payload does not match the expected contract. */
export class InvalidCatalogPayloadError extends Error {
  constructor(details: string) {
    super(`Invalid catalog payload from Core API: ${details}`);
    this.name = 'InvalidCatalogPayloadError';
  }
}

/**
 * Validates and normalises an untrusted catalog payload.
 *
 * Throws rather than returning null so the caller cannot accidentally treat a
 * rejected payload as "nothing to do" — a silent no-op is exactly how a broken
 * upstream would go unnoticed. Missing `topics`/`subtopics` arrays are defaulted
 * to empty (a course legitimately may have none); anything else is a rejection.
 */
export function validateCatalogPayload(payload: unknown): CatalogPayloadDto {
  if (!payload || typeof payload !== 'object') {
    throw new InvalidCatalogPayloadError('payload is not an object');
  }

  const raw = payload as Record<string, unknown>;
  if (!Array.isArray(raw.courses)) {
    throw new InvalidCatalogPayloadError(
      '"courses" is missing or not an array',
    );
  }

  // Normalise the optional collections before validation so a course without
  // topics is accepted. Only a nullish value is defaulted — anything else
  // (a string, an object) is passed through untouched so @IsArray rejects it
  // rather than the normaliser crashing on it.
  const asArray = (value: unknown) => (value == null ? [] : value);
  const mapIfArray = (value: unknown, fn: (item: any) => any) =>
    Array.isArray(value) ? value.map(fn) : value;

  const normalised = {
    courses: raw.courses.map((course: any) => ({
      ...course,
      topics: mapIfArray(asArray(course?.topics), (topic: any) => ({
        ...topic,
        subtopics: asArray(topic?.subtopics),
      })),
    })),
  };

  const instance = plainToInstance(CatalogPayloadDto, normalised);
  const errors = validateSync(instance, {
    whitelist: false,
    forbidUnknownValues: true,
  });

  if (errors.length > 0) {
    throw new InvalidCatalogPayloadError(
      errors
        .map((error) => error.toString())
        .join('; ')
        .slice(0, 2000),
    );
  }

  return instance;
}
