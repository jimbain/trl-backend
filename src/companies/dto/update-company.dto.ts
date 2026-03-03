import { PartialType } from '@nestjs/mapped-types';
import { CreateCompanyDto } from './create-company.dto';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateCompanyDto extends PartialType(CreateCompanyDto) {
  @IsString()
  @MaxLength(255)
  name: string;

  @IsString()
  @MaxLength(255)
  domain: string;

  @IsOptional()
  available_medias?: any[];

  @IsString()
  @IsIn(['both', 'rent', 'bookshelf'])
  @IsOptional()
  available_audio_title_user_action?: string;
}
