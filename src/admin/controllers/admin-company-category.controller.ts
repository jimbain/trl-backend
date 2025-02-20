import {
  Controller,
  Get,
  UseGuards,
  Query,
  Param,
  Post,
  Body,
  Put,
  BadRequestException,
  HttpCode,
} from '@nestjs/common';
import { JwtAdminAuthGuard } from '../guards/jwt-admin-auth.guard';
import { CategoryService } from 'src/categories/category.service';
import { CreateCategoryDto } from 'src/categories/dto/create-category.dto';
import { UpdateCategoryDto } from 'src/categories/dto/update-category.dto';
import { AssignDeassignCategoryDto } from '../dto/category/AssignDeassignCategory.dto';

@UseGuards(JwtAdminAuthGuard)
@Controller('admin/categories')
export class AdminCompanyCategoryController {
  constructor(private readonly categoryService: CategoryService) {}

  @Post()
  async store(@Body() payload: CreateCategoryDto) {
    return this.categoryService.create(payload);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() payload: UpdateCategoryDto) {
    return this.categoryService.update(id, payload);
  }

  @Post(':id/:actionType')
  @HttpCode(200)
  async handleAction(
    @Param('id') id: string,
    @Param('actionType') actionType: string,
    @Body() payload: AssignDeassignCategoryDto,
  ) {
    if (actionType !== 'assign' && actionType !== 'deassign') {
      throw new BadRequestException(
        `Invalid actionType. Allowed values: 'assign', 'deassign'`,
      );
    }

    if (!payload.ids.length) {
      return;
    }

    if (actionType === 'assign') {
      return this.categoryService.assign(id, payload.ids);
    } else if (actionType === 'deassign') {
      return this.categoryService.deassign(id, payload.ids);
    }
  }
}
