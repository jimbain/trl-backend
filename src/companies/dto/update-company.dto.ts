import { PartialType } from '@nestjs/mapped-types';
import { CreateCompanyDto } from './create-company.dto';
import { IsNotEmpty, IsString } from 'class-validator';
import { IsUnique } from 'src/validation/validators/is-unique.validator';
import { Company } from 'src/companies/entities/company.entity';

export class UpdateCompanyDto extends PartialType(CreateCompanyDto) {
  @IsString()
  @IsNotEmpty()
  @IsUnique(Company, 'name', { id: 'company_01J4YBE43FGEY0WYCQ8JHA37HF' })
  name: string;
}
