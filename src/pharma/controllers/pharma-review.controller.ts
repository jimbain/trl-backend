import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { CreatePharmaReviewDto } from '../dto/create-pharma-review.dto';
import { PharmaReviewService } from '../services/pharma-review.service';

@UseGuards(JwtAuthGuard)
@Controller('pharmas')
export class PharmaReviewController {
  constructor(private readonly pharmaReviewService: PharmaReviewService) {}

  @Get(':id/reviews')
  findAll(@Request() req, @Param('id') id: string) {
    return this.pharmaReviewService.findAll(id, req.user);
  }

  @Post(':id/reviews')
  store(
    @Request() req,
    @Param('id') id: string,
    @Body() payload: CreatePharmaReviewDto,
  ) {
    return this.pharmaReviewService.store(id, payload, req.user);
  }
}
