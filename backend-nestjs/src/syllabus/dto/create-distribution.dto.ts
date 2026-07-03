import { IsString, IsNotEmpty, IsNumber, Min, Max, IsOptional } from 'class-validator';

export class CreateDistributionDto {
  @IsNumber()
  @Min(1)
  @IsNotEmpty()
  weekNumber: number;

  @IsString()
  @IsNotEmpty()
  topicId: string;

  @IsString()
  @IsNotEmpty()
  subtopicId: string;

  @IsNumber()
  @Min(1)
  @Max(100)
  @IsNotEmpty()
  questionCount: number;

  @IsString()
  @IsOptional()
  templateId?: string;
}
