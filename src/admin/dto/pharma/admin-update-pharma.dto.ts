import { PartialType } from '@nestjs/mapped-types';
import { AdminCreatePharmaDto } from './admin-create-pharma.dto';
import { IsNotEmpty, IsString } from 'class-validator';

export class AdminUpdatePharmaDto extends PartialType(AdminCreatePharmaDto) {
  @IsString()
  @IsNotEmpty()
  sku: string;
}
