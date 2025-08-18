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
import { PharmaService } from '../services/pharma.service';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { QueryPharmaDto } from '../dto/query-pharma.dto';
import { TriggerPharmaVideoPlayerEventDto } from '../dto/trigger-pharma-video-player-event.dto';

@UseGuards(JwtAuthGuard)
@Controller()
export class PharmaController {
  constructor(private readonly pharmaService: PharmaService) {}

  @Get('pharma-categories')
  findCategories(@Request() req) {
    return this.pharmaService.findAllCategoryForCompany(req.user.company.id);
  }

  @Get('pharma-categories/:id')
  findCategory(@Param('id') id: string, @Request() req) {
    return this.pharmaService.findCategoryForCompany(id, req.user.company.id);
  }

  @Get('pharmas')
  findAll(@Request() req, @Query() query: QueryPharmaDto) {
    // This method handles all pharma listing with filtering
    // QueryPharmaDto supports: page, per_page, category_ids, is_featured
    // status: 'queued' | 'rented' | 'bookshelved' (filters by user's pharma status)
    // search: search by title, sort_by: sort field, sort_order: sort direction
    return this.pharmaService.findAll(query, req.user);
  }

  @Get('pharmas/:id')
  show(@Param('id') id: string, @Request() req) {
    return this.pharmaService.findOne(id, req.user);
  }

  @Get('pharma/home')
  async getPharmaHomeList(@Request() req) {
    return this.pharmaService.getHomeList(req.user);
  }

  @Post('pharmas/:id/trigger-event/:eventType?')
  @HttpCode(200)
  triggerVideoPlayerEvent(
    @Request() req,
    @Body() payload: TriggerPharmaVideoPlayerEventDto,
    @Param('id') id: string,
    @Param('eventType') eventType?: 'play' | 'pause',
  ) {
    return this.pharmaService.triggerVideoPlayerEvent(
      id,
      eventType,
      payload,
      req.user,
    );
  }
}
