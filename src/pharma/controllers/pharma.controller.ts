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
import { PharmaService } from '../services/pharma.service';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { QueryPharmaDto } from '../dto/query-pharma.dto';

@UseGuards(JwtAuthGuard)
@Controller()
export class PharmaController {
  constructor(private readonly pharmaService: PharmaService) {}

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

  @Get('pharma-categories')
  findCategories(@Request() req) {
    return this.pharmaService.findAllPharmaCategoryForCompany(
      req.user.company.id,
    );
  }
}
