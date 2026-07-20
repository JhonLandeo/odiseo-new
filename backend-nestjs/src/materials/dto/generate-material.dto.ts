import {
  IsUUID,
  IsNumber,
  IsBoolean,
  IsArray,
  ValidateNested,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CourseDto {
  @IsString()
  course_id: string;
}

export class GenerateMaterialDto {
  @IsUUID()
  profile_id: string;

  @IsNumber()
  @Min(1)
  week_number: number;

  @IsBoolean()
  requires_review: boolean;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CourseDto)
  courses: CourseDto[];

  @IsOptional()
  @IsUUID()
  design_template_id?: string;
}
