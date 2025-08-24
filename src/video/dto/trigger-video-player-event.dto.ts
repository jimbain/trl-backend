import { IsNotEmpty, IsInt, Min, IsString } from 'class-validator';

export class TriggerVideoPlayerEventDto {
  @IsString()
  @IsNotEmpty()
  event: string;

  @IsInt()
  @IsNotEmpty()
  @Min(0, { message: 'Play position must be greater than or equal to 0' })
  play_position: number;
}
