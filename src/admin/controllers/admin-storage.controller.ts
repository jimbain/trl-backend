import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { GenerateSignedUrlDto } from 'src/storage/dto/generate-signed-url.dto';
import { StorageService } from 'src/storage/storage.service';
import { JwtAdminAuthGuard } from '../guards/jwt-admin-auth.guard';

@UseGuards(JwtAdminAuthGuard)
@Controller('admin/storage')
export class StorageController {
  constructor(private readonly storageService: StorageService) {}

  @Post('signed-url')
  @HttpCode(HttpStatus.OK)
  async generateSignedUrl(@Body() dto: GenerateSignedUrlDto) {
    return this.storageService.generateSignedUploadUrl(
      dto.folder,
      dto.file_name,
      dto.file_type,
    );
  }
}
