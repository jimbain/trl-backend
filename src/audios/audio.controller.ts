import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Request,
  Query,
} from '@nestjs/common';
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
    const companyAudioCategoryIds =
      await this.audioService.findAllAudioCategoryIdOfCompany(
        req.user.company.id,
      );

    return [
      {
        label: 'Featured Titles',
        slug: 'featured',
        audios: await this.audioService.getFeaturedAudios(
          companyAudioCategoryIds,
          10,
        ),
      },
      {
        label: 'Continue Listening',
        slug: 'continue_listening',
        audios: await this.audioService.getAudiosOfUserBasedOnStatus(
          req.user,
          'rented',
          10,
        ),
      },
      {
        label: 'My Bookshelf',
        slug: 'bookself',
        audios: await this.audioService.getAudiosOfUserBasedOnStatus(
          req.user,
          'bookshelved',
          10,
        ),
      },
      {
        label: 'Queued Titles',
        slug: 'queued',
        audios: await this.audioService.getAudiosOfUserBasedOnStatus(
          req.user,
          'queued',
          10,
        ),
      },
      {
        label: 'Popular Audio Titles',
        slug: 'popular',
        audios: [],
      },
    ];
  }

  @Get('audio-categories')
  findAudioCategories(@Request() req) {
    return this.audioService.findAllAudioCategoriesForCompany(
      req.user.company.id,
    );
  }

  @Get('audio-categories/:id/audios')
  findAudiosByCategory(
    @Request() req,
    @Param('id') id: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '20',
  ) {
    const parsedPage = parseInt(page, 10) || 1;
    const parsedLimit = parseInt(limit, 10) || 20;

    return this.audioService.findAudiosByCategory(
      req.user.company.id,
      id,
      parsedPage,
      parsedLimit,
    );
  }

  @Get('search/audios')
  search(
    @Request() req,
    @Query('query') query: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '20',
  ) {
    const parsedPage = parseInt(page, 10) || 1;
    const parsedLimit = parseInt(limit, 10) || 20;
    return this.audioService.searchAudios(req.user.company.id, query, parsedPage, parsedLimit);
  }

  @Get(':type/audios')
  async list(
    @Param('type') type: 'featured' | 'queued' | 'bookself' | 'popular' | 'new',
    @Request() req,
  ) {
    const companyAudioCategoryIds =
      await this.audioService.findAllAudioCategoryIdOfCompany(
        req.user.company.id,
      );

    let data: any;

    if (type === 'featured') {
      data = await this.audioService.getFeaturedAudios(companyAudioCategoryIds);
    } else if (type === 'queued') {
      data = await this.audioService.getAudiosOfUserBasedOnStatus(
        req.user,
        'queued',
      );
    } else if (type === 'bookself') {
      data = await this.audioService.getAudiosOfUserBasedOnStatus(
        req.user,
        'bookshelved',
      );
    } else if (type === 'popular' || type === 'new') {
      data = [];
    }

    return { data };
  }

  @Get('audios/:id')
  findOne(@Request() req, @Param('id') id: string) {
    return this.audioService.findAudioById(id, req.user);
  }

  @Get('audios/:id/reviews')
  findAudioReviews(@Request() req, @Param('id') id: string) {
    return this.audioReviewService.findAudioReviews(id, req.user);
  }

  @Get('audios/:id/playlist')
  findAudioPlaylist(@Request() req, @Param('id') id: string) {
    return this.audioService.findAudioPlaylist(id, req.user);
  }

  @Post('audios/:id/reviews')
  storeAudioReview(
    @Request() req,
    @Param('id') id: string,
    @Body() payload: CreateAudioReview,
  ) {
    return this.audioReviewService.storeAudioReview(id, payload, req.user);
  }
}
