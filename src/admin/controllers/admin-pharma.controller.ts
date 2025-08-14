import {
  Controller,
  Get,
  UseGuards,
  Query,
  Res,
  StreamableFile,
  Post,
  Body,
  Param,
  Patch,
  Delete,
} from '@nestjs/common';
import { JwtAdminAuthGuard } from '../guards/jwt-admin-auth.guard';
import { AdminPharmaService } from '../services/admin-pharma.service';
import { Response } from 'express';
import { AdminCreatePharmaDto } from '../dto/pharma/admin-create-pharma.dto';
import { AdminUpdatePharmaDto } from '../dto/pharma/admin-update-pharma.dto';
import { QueryAdminPharmaDto } from '../dto/pharma/query-admin-pharma.dto';

@UseGuards(JwtAdminAuthGuard)
@Controller('admin/pharmas')
export class AdminPharmaController {
  constructor(private readonly adminPharmaService: AdminPharmaService) {}

  @Get()
  async findAll(@Query() query: QueryAdminPharmaDto, @Res() res: Response) {
    const result = await this.adminPharmaService.findAll(query);

    if (result instanceof StreamableFile) {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="pharmas.csv"`,
      );

      result.getStream().pipe(res);
    } else {
      res.status(200).send(result);
    }
  }

  @Post()
  create(@Body() payload: AdminCreatePharmaDto) {
    return this.adminPharmaService.create(payload);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.adminPharmaService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() payload: AdminUpdatePharmaDto) {
    return this.adminPharmaService.update(id, payload);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.adminPharmaService.remove(id);
  }
}
