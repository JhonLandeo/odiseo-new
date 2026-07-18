import { IsBoolean } from 'class-validator';

export class ArchiveSyllabusDto {
  @IsBoolean()
  isActive: boolean;
}
