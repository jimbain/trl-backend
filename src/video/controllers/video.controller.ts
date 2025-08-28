import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { VideoService } from '../services/video.service';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { QueryVideoDto } from '../dto/query-video.dto';
import { TriggerVideoPlayerEventDto } from '../dto/trigger-video-player-event.dto';

@UseGuards(JwtAuthGuard)
@Controller()
export class VideoController {
  constructor(private readonly videoService: VideoService) {}

  @Get('video-categories')
  findCategories(@Request() req) {
    return this.videoService.findAllCategoryForCompany(req.user.company.id);
  }

  @Get('video-categories/:id')
  findCategory(@Param('id') id: string, @Request() req) {
    return this.videoService.findCategoryForCompany(id, req.user.company.id);
  }

  @Get('videos')
  findAll(@Request() req, @Query() query: QueryVideoDto) {
    // This method handles all video listing with filtering
    // QueryVideoDto supports: page, per_page, category_ids, is_featured
    // status: 'queued' | 'rented' (filters by user's video status)
    // search: search by title, sort_by: sort field, sort_order: sort direction
    // avilar_course_id, group: additional filtering options
    return this.videoService.findAll(query, req.user);
  }

  @Get('video/home')
  async getVideoHomeList(@Request() req) {
    return this.videoService.getHomeList(req.user);
  }

  /**
   * Get a single video with details and related videos from the same group
   * @param id Video ID
   * @param req Request object containing user information
   * @returns Object containing data (main video) and playlist (group videos)
   *
   * Response structure:
   * {
   *   data: {
   *     id, title, description, image_url, categories, runtime, avg_rating,
   *     is_featured, group, avilar_course_id, sku, status, current_rental_expire_at,
   *     next_rental_expire_at, rental_start_at, is_rental_valid, can_renew,
   *     can_return, avilar_lms_url (only if user is registered for the course)
   *   },
   *   playlist: [
   *     {
   *       id, sku, title, is_featured, image_url, avg_rating, status,
   *       current_rental_expire_at, next_rental_expire_at, is_rental_valid,
   *       can_renew, can_return
   *     }
   *   ]
   * }
   */
  @Get('videos/:id')
  show(@Param('id') id: string, @Request() req) {
    return this.videoService.findOne(id, req.user);
  }

  @HttpCode(200)
  @Post('videos/:id/trigger-video-player-event')
  async triggerVideoPlayerEvent(
    @Param('id') id: string,
    @Body() payload: TriggerVideoPlayerEventDto,
    @Request() req,
  ) {
    return this.videoService.triggerVideoPlayerEvent(id, payload, req.user);
  }
}
