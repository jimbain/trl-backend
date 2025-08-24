import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { CreateVideoReviewDto } from '../dto/create-video-review.dto';
import { VideoReviewService } from '../services/video-review.service';

@UseGuards(JwtAuthGuard)
@Controller('videos')
export class VideoReviewController {
  constructor(private readonly videoReviewService: VideoReviewService) {}

  @Get(':id/reviews')
  findAll(@Request() req, @Param('id') id: string) {
    return this.videoReviewService.findAll(id, req.user);
  }

  @Post(':id/reviews')
  create(
    @Request() req,
    @Param('id') id: string,
    @Body() payload: CreateVideoReviewDto,
  ) {
    return this.videoReviewService.create(id, payload, req.user);
  }

  @Put(':id/reviews')
  update(
    @Request() req,
    @Param('id') id: string,
    @Body() payload: CreateVideoReviewDto,
  ) {
    return this.videoReviewService.update(id, payload, req.user);
  }
}
