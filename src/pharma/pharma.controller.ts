import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
} from '@nestjs/common';
import { PharmaService } from './pharma.service';

@Controller('pharma')
export class PharmaController {
  constructor(private readonly pharmaService: PharmaService) {}

  // @Post()
  // create(@Body() createPharmaDto: CreatePharmaDto) {
  //   return this.pharmaService.create(createPharmaDto);
  // }

  // @Get()
  // findAll() {
  //   return this.pharmaService.findAll();
  // }

  // @Get(':id')
  // findOne(@Param('id') id: string) {
  //   return this.pharmaService.findOne(id);
  // }

  // @Patch(':id')
  // update(@Param('id') id: string, @Body() updatePharmaDto: UpdatePharmaDto) {
  //   return this.pharmaService.update(id, updatePharmaDto);
  // }

  // @Delete(':id')
  // remove(@Param('id') id: string) {
  //   return this.pharmaService.remove(id);
  // }
}
