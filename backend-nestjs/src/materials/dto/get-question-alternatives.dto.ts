import { IsUUID, IsNumber, IsOptional, IsArray, Min, IsString } from 'class-validator';

export class GetQuestionAlternativesDto {
  @IsString()
  @IsOptional()
  courseId?: string;

  @IsString()
  @IsOptional()
  topicId?: string;

  @IsString()
  @IsOptional()
  subtopicId?: string;

  @IsString()
  @IsOptional()
  levelId?: string;

  @IsNumber()
  @Min(1)
  @IsOptional()
  limit?: number;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  excludeIds?: string[];
}

