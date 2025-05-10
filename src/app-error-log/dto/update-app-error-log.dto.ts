import { PartialType } from '@nestjs/mapped-types';
import { CreateAppErrorLogDto } from './create-app-error-log.dto';

export class UpdateAppErrorLogDto extends PartialType(CreateAppErrorLogDto) {}
