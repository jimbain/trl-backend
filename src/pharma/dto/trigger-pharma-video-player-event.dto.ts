import { IsNotEmpty, IsInt, Min } from 'class-validator';

export class TriggerPharmaVideoPlayerEventDto {
  @IsInt()
  @IsNotEmpty()
  @Min(0, { message: 'Play position must be greater than or equal to 0' })
  play_position: number;
}
