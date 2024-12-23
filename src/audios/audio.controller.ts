import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Request,
  Query,
} from '@nestjs/common';
import { AudioService } from './audio.service';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { AudioReviewService } from './audio_review.service';
import { CreateAudioReview } from './dto/create_audio_review.dto';
import { TriggerAudioPlayerEventDto } from './dto/trigger_audio_player_event.dto';

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

    const featuredAudios = await this.audioService.getFeaturedAudios(
      companyAudioCategoryIds,
      req.user,
      10,
      1,
    );

    return [
      {
        label: 'Featured Titles',
        slug: 'featured',
        audios: featuredAudios?.data ?? [],
      },
      {
        label: 'Continue Listening',
        slug: 'continue_listening',
        audios: await this.audioService.getContinueListeningAudiosOfUser(
          req.user,
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
    @Query('per_page') per_page: string = '20',
  ) {
    const parsedPage = parseInt(page, 10) || 1;
    const parsedPerPage = parseInt(per_page, 10) || 20;

    return this.audioService.findAudiosByCategory(
      req.user,
      id,
      parsedPage,
      parsedPerPage,
    );
  }

  @Get('search/audios')
  search(
    @Request() req,
    @Query('query') query: string,
    @Query('page') page: string = '1',
    @Query('per_page') per_page: string = '20',
  ) {
    const parsedPage = parseInt(page, 10) || 1;
    const parsedPerPage = parseInt(per_page, 10) || 20;

    return this.audioService.searchAudios(
      req.user,
      query,
      parsedPage,
      parsedPerPage,
    );
  }

  @Get(':type/audios')
  async list(
    @Param('type') type: 'featured' | 'queued' | 'bookself' | 'popular' | 'new',
    @Request() req,
    @Query('page') page: string = '1',
    @Query('per_page') per_page: string = '10',
  ) {
    const parsedPage = parseInt(page, 10) || 1;
    const parsedPerPage = parseInt(per_page, 10) || 10;

    const companyAudioCategoryIds =
      await this.audioService.findAllAudioCategoryIdOfCompany(
        req.user.company.id,
      );

    let data: any;

    if (type === 'featured') {
      return this.audioService.getFeaturedAudios(
        companyAudioCategoryIds,
        req.user,
        parsedPerPage,
        parsedPage,
      );
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

  @Post('audios/:id/reviews')
  storeAudioReview(
    @Request() req,
    @Param('id') id: string,
    @Body() payload: CreateAudioReview,
  ) {
    return this.audioReviewService.storeAudioReview(id, payload, req.user);
  }

  @Get('audios/:id/playlist')
  findAudioPlaylist(@Request() req, @Param('id') id: string) {
    return this.audioService.findAudioPlaylist(id, req.user);
  }

  @Post('audios/:id/trigger-event')
  triggerAudioPlayerEvent(
    @Request() req,
    @Param('id') id: string,
    @Body() payload: TriggerAudioPlayerEventDto,
  ) {
    return this.audioService.triggerAudioPlayerEvent(id, payload, req.user);
  }
}
