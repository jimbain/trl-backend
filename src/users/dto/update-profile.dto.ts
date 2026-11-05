import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

/**
 * Partial update: every field is optional so a client can send only the part
 * of the profile its screen owns. The app's Edit Address screen has no name
 * or title inputs, and requiring them here meant it could never save.
 *
 * Optional does not mean unvalidated -- a field that is sent still has to be
 * valid, and a name that is sent still has to be non-empty, so an existing
 * name cannot be blanked out by an empty string.
 */
export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  first_name?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  last_name?: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  address1?: string;

  @IsOptional()
  @IsString()
  address2?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsString()
  state?: string;

  @IsOptional()
  @IsString()
  zip?: string;
}
