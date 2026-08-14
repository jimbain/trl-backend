import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { ListRecommendedActiveAudiosDto } from 'src/ai/dto/list-recommended-active-audios.dto';
import { AiActiveRecommendationService } from 'src/ai/services/ai-active-recommendation.service';
import { JwtAdminAuthGuard } from '../guards/jwt-admin-auth.guard';

@UseGuards(JwtAdminAuthGuard)
@Controller('admin/ai-recommendations/active-list')
export class AdminAiActiveRecommendationController {
  constructor(
    private readonly aiActiveRecommendationService: AiActiveRecommendationService,
  ) {}

  @Get()
  list(@Query() query: ListRecommendedActiveAudiosDto) {
    return this.aiActiveRecommendationService.listLatestBatch(
      query.page,
      query.limit,
    );
  }

  @Get('status')
  status() {
    return this.aiActiveRecommendationService.getStatus();
  }

  @Post('regenerate')
  @HttpCode(HttpStatus.ACCEPTED)
  async regenerate() {
    const run = await this.aiActiveRecommendationService.triggerManual();
    return { batch_id: run.batch_id, run_id: run.id, status: run.status };
  }

  @Get('export')
  async export(
    @Res() res: Response,
    @Query('batch_id') batchId?: string,
  ): Promise<void> {
    const filename = `recommended_books_${batchId ?? 'latest'}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    await this.aiActiveRecommendationService.streamCsv(
      (chunk) => res.write(chunk),
      batchId,
    );
    res.end();
  }
}
