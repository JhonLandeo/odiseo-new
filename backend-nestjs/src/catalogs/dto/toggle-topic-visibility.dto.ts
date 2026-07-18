import { IsBoolean } from 'class-validator';

export class ToggleTopicVisibilityDto {
  @IsBoolean()
  isActive: boolean;
}
