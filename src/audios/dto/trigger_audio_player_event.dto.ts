import { IsNotEmpty, IsInt, Min } from 'class-validator';

export class TriggerAudioPlayerEventDto {
  @IsInt()
  @IsNotEmpty()
  @Min(0, { message: 'Part number is invalid' })
  part_number: number;

  @IsInt()
  @IsNotEmpty()
  @Min(0, { message: 'Chapter number is invalid' })
  chapter_number: number;

  @IsInt()
  @IsNotEmpty()
  @Min(0, { message: 'Play position must be greater than or equal to 0' })
  play_position: number;
}
