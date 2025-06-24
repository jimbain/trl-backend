import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { StorageService } from './storage.service';
import { GenerateSignedUrlDto } from './dto/generate-signed-url.dto';

@Controller('storage')
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
