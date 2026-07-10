import { IsUUID, IsNumber, IsOptional, IsArray, Min } from 'class-validator';

export class GetQuestionAlternativesDto {
  @IsUUID()
  @IsOptional()
  courseId?: string;

  @IsUUID()
  @IsOptional()
  topicId?: string;

  @IsUUID()
  @IsOptional()
  subtopicId?: string;

  @IsUUID()
  @IsOptional()
  levelId?: string;

  @IsNumber()
  @Min(1)
  @IsOptional()
  limit?: number;

  @IsArray()
  @IsUUID('4', { each: true })
  @IsOptional()
  excludeIds?: string[];
}
