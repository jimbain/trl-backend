import { PartialType } from '@nestjs/mapped-types';
import { CreateAudioMetadataDto } from './create-audio-metadata.dto';

export class UpdateAudioMetadataDto extends PartialType(
  CreateAudioMetadataDto,
) {}
