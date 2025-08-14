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
import { PharmaService } from './pharma.service';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { QueryPharmaDto } from './dto/query-pharma.dto';

@UseGuards(JwtAuthGuard)
@Controller()
export class PharmaController {
  constructor(private readonly pharmaService: PharmaService) {}

  @Get('pharmas')
  findAll(@Request() req, @Query() query: QueryPharmaDto) {
    return this.pharmaService.findAll(query, req.user);
  }

  @Get('pharma-categories')
  findAudioCategories(@Request() req) {
    return this.pharmaService.findAllPharmaCategoryForCompany(
      req.user.company.id,
    );
  }

  @Get('pharma-categories/:id/pharmas')
  findPharmasByCategory(
    @Request() req,
    @Param('id') id: string,
    @Query('page') page: string = '1',
    @Query('per_page') per_page: string = '20',
  ) {
    const parsedPage = parseInt(page, 10) || 1;
    const parsedPerPage = parseInt(per_page, 10) || 20;

    return this.pharmaService.findPharmasByCategory(
      req.user,
      id,
      parsedPage,
      parsedPerPage,
    );
  }

  @Get('pharmas/:id/reviews')
  findPharmaReviews(@Request() req, @Param('id') id: string) {
    return this.pharmaService.findPharmaReviews(id, req.user);
  }

  @Post('pharmas/:id/reviews')
  storePharmaReview(
    @Request() req,
    @Param('id') id: string,
    @Body() payload: CreatePharmaReview,
  ) {
    return this.pharmaService.storePharmaReview(id, payload, req.user);
  }
}
