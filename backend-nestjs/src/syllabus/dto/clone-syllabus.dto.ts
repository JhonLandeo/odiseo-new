import { IsString, IsNotEmpty } from 'class-validator';

export class CloneSyllabusDto {
  @IsString()
  @IsNotEmpty()
  sourceId: string;
}
