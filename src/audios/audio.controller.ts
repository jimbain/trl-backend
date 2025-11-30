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
import { AudioSeedService } from './audio_seed.service';
import { CompanyService } from 'src/companies/company.service';
import { QueryAudioDto } from './dto/query-audio.dto';
import { QueryAudioCategoryDto } from './dto/query-audio-category.dto';

@UseGuards(JwtAuthGuard)
@Controller()
export class AudioController {
  constructor(
    private readonly companyService: CompanyService,
    private readonly audioService: AudioService,
    private readonly audioReviewService: AudioReviewService,
    private readonly audioSeedService: AudioSeedService,
  ) {}

  @Get('audios')
  findAll(@Request() req, @Query() query: QueryAudioDto = {}) {
    return this.audioService.findAll(req.user, query);
  }

  @Get('audio/home')
  async getAudioHomeList(@Request() req) {
    return this.audioService.getHomeList(req.user);
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
    @Query() query: QueryAudioCategoryDto,
  ) {
    const page = query.page || 1;
    const perPage = query.per_page || 20;

    return this.audioService.findAudiosByCategory(req.user, id, page, perPage);
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

  @Get('audios/:param')
  async findAudioByTypeOrId(
    @Param('param') param: string,
    @Request() req,
    @Query('page') page: string = '1',
    @Query('per_page') per_page: string = '10',
  ) {
    const validTypes = ['featured', 'queued', 'bookself', 'popular', 'new'];

    if (!validTypes.includes(param)) {
      return this.audioService.findAudioById(param, req.user);
    }

    const parsedPage = parseInt(page, 10) || 1;
    const parsedPerPage = parseInt(per_page, 10) || 10;
    const company = await this.companyService.findByIdWithCache(
      req.user.company.id,
    );
    const categoryIds = company.category_ids.audio;

    if (param === 'featured') {
      return this.audioService.getFeaturedAudios(
        company,
        req.user,
        parsedPerPage,
        parsedPage,
      );
    } else if (param === 'queued' || param === 'bookself') {
      return {
        data: await this.audioService.getAudiosOfUserBasedOnStatus(
          company,
          req.user,
          param === 'queued' ? 'queued' : 'bookshelved',
        ),
      };
    } else if (param === 'popular' || param === 'new') {
      return {
        data: await this.audioService.getPopularAudios(categoryIds, req.user),
      };
    }
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

  @Post('audios/:id/trigger-event/:eventType?')
  triggerAudioPlayerEvent(
    @Request() req,
    @Body() payload: TriggerAudioPlayerEventDto,
    @Param('id') id: string,
    @Param('eventType') eventType?: 'play' | 'pause',
  ) {
    return this.audioService.triggerAudioPlayerEvent(
      id,
      eventType,
      payload,
      req.user,
    );
  }

  @Get('seed-audios')
  seedAudio() {
    return this.audioSeedService.seed();
  }
}
