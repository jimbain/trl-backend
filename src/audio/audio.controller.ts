import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Request } from '@nestjs/common';
import { AudioService } from './audio.service';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { AudioReviewService } from './audio_review.service';
import { CreateAudioReview } from './dto/create_audio_review.dto';

@UseGuards(JwtAuthGuard)
@Controller()
export class AudioController {
  constructor(
    private readonly audioService: AudioService,
    private readonly audioReviewService: AudioReviewService,
  ) {}

  @Get('audio/home')
  async getAudioHomeList(@Request() req) {
    const companyAudioCategoryIds = await this.audioService.findAllAudioCategoryIdOfCompany(req.user.company.id);

    return [
      {
        label: "Featured Titles",
        slug: 'featured',
        audios: await this.audioService.findAllFeaturedAudios(companyAudioCategoryIds)
      },
      {
        label: "Continue Listening",
        slug: 'continue_listening',
        audios: []
      },
      {
        label: "My Bookshelf",
        slug: 'bookself',
        audios: []
      },
      {
        label: "Queued Titles",
        slug: 'queued',
        audios: []
      },
      {
        label: "Popular Audio Titles",
        slug: 'popular',
        audios: []
      },
    ];
  }

  @Get('audio-categories')
  findAudioCategories(@Request() req) {
    return this.audioService.findAllAudioCategoriesForCompany(req.user.company.id);
  }

  @Get('audio-categories/:id/audios')
  findAudiosByCategory(@Request() req, @Param('id') id: string) {
    return this.audioService.findAudiosByCategory(req.user.company.id, id);
  }

  @Get('audios/:id')
  findOne(@Param('id') id: string) {
    return this.audioService.findAudioById(id);
  }

  @Get('audios/:id/reviews')
  findAudioReviews(@Param('id') id: string) {
    return this.audioReviewService.findAudioReviews(id);
  }

  @Post('audios/:id/reviews')
  storeAudioReview(@Request() req, @Param('id') id: string, @Body() payload: CreateAudioReview) {
    return this.audioReviewService.storeAudioReview(id, payload, req.user);
  }
}
