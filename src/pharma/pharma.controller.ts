import { Controller, Get, Param } from '@nestjs/common';
import { PharmaService } from './pharma.service';

@Controller('pharmas')
export class PharmaController {
  constructor(private readonly pharmaService: PharmaService) {}

  @Get()
  findAll() {
    return this.pharmaService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.pharmaService.findOne(id);
  }
}
