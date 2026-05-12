import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AiRecommendationService } from 'src/ai/services/ai-recommendation.service';
import { PythonRecommenderService } from 'src/ai/services/python-recommender.service';
import { RecommendAudiosDto } from '../dto/recommend-audios.dto';
import { JwtAdminAuthGuard } from '../guards/jwt-admin-auth.guard';

@UseGuards(JwtAdminAuthGuard)
@Controller('admin/ai-recommendations')
export class AdminAiRecommendationController {
  constructor(
    private readonly aiRecommendationService: AiRecommendationService,
    private readonly pythonRecommender: PythonRecommenderService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  recommend(@Body() body: RecommendAudiosDto) {
    return this.aiRecommendationService.recommend(body.prompt, body.limit);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh() {
    return this.pythonRecommender.refresh();
  }

  @Get('stats')
  stats() {
    return this.aiRecommendationService.getStats();
  }
}
