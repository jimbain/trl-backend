import { Transform } from 'class-transformer';
import { IsNumber, IsString } from 'class-validator';
import { Company } from '../entities/company.entity';
import { IsExist } from 'src/validation/validators/is-exist.validator';

export class CreateCompanyCreditLogDto {
  @IsString()
  @IsExist(Company, 'id')
  company_id: string;

  @IsNumber()
  @Transform(({ value }) => parseInt(value, 10) ?? 0, { toClassOnly: true })
  purchased_credit: number;
}
