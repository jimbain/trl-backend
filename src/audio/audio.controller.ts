import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Request } from '@nestjs/common';
import { AudioService } from './audio.service';
import { CreateAudioDto } from './dto/create-audio.dto';
import { UpdateAudioDto } from './dto/update-audio.dto';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('audio')
export class AudioController {
  constructor(private readonly audioService: AudioService) {}

  @Post()
  create(@Body() createAudioDto: CreateAudioDto) {
    return this.audioService.create(createAudioDto);
  }

  @Get()
  findAll() {
    return this.audioService.findAll();
  }

  @Get('home/list')
  async getAudioHomeList(@Request() req) {
    return {
      featured: await this.audioService.findAllFeaturedAudios(),
      bookshelf: [],
      queued: [],
      popular: []
    };
  }

  @Get('categories')
  findAudioCategories(@Request() req) {
    return this.audioService.findAllAudioCategoriesForCompany(req.user.company.id);
  }

  @Get('categories/:id/audios')
  findAudiosByCategory(@Request() req, @Param('id') id: string) {
    return this.audioService.findAudiosByCategory(id);
  }

  @Get('categories/:categoryId/audios/:audioId')
  findAudioByCategory(@Request() req, @Param('categoryId') categoryId: string, @Param('audioId') audioId: string) {
    return this.audioService.findAudioByCategory(categoryId, audioId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.audioService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateAudioDto: UpdateAudioDto) {
    return this.audioService.update(+id, updateAudioDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.audioService.remove(+id);
  }
}
