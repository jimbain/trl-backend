import { Expose, Transform, Type } from 'class-transformer';
import { CompanyDto } from 'src/company/dto/company.dto';

export class UserDto {
  @Expose()
  id: string;

  @Expose()
  @Transform(({ obj }) => `${obj.first_name} ${obj.last_name}`)
  name: string;

  @Expose()
  email: string;

  @Expose()
  @Type(() => CompanyDto)
  company: CompanyDto;
}
