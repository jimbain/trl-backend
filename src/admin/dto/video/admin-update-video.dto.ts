import { PartialType } from '@nestjs/mapped-types';
import { AdminCreateVideoDto } from './admin-create-video.dto';
import { IsNotEmpty, IsString } from 'class-validator';

export class AdminUpdateVideoDto extends PartialType(AdminCreateVideoDto) {
  @IsString()
  @IsNotEmpty()
  sku: string;
}
