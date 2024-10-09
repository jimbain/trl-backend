import { PartialType } from '@nestjs/mapped-types';
import { CreateAppConfigDto } from './create-app-config.dto';

export class UpdateAppConfigDto extends PartialType(CreateAppConfigDto) {}
