import { PartialType } from '@nestjs/mapped-types';
import { AdminCreatePharmaDto } from './admin-create-pharma.dto';

export class AdminUpdatePharmaDto extends PartialType(AdminCreatePharmaDto) {}
