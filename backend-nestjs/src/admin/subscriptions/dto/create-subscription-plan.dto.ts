import { IsString, IsNumber, IsNotEmpty, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateSubscriptionPlanDto {
  @ApiProperty({ example: 'Pro Plan' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 49.99 })
  @IsNumber()
  @Min(0)
  price: number;

  @ApiProperty({ example: 10 })
  @IsNumber()
  @Min(1)
  max_users: number;

  @ApiProperty({ example: 500 })
  @IsNumber()
  @Min(0)
  max_pdf_pages_per_month: number;

  @ApiProperty({ example: 1000 })
  @IsNumber()
  @Min(0)
  max_questions_per_month: number;
}
