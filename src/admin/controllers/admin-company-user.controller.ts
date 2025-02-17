import {
  Controller,
  Get,
  UseGuards,
  Query,
  Param,
  Post,
  Body,
  Patch,
  Delete,
  UseInterceptors,
  UploadedFile,
  Res,
} from '@nestjs/common';
import { JwtAdminAuthGuard } from '../guards/jwt-admin-auth.guard';
import { UserService } from 'src/users/user.service';
import { CreateUserDto } from 'src/users/dto/create-user.dto';
import { UpdateUserDto } from 'src/users/dto/update-user.dto';
import { FileInterceptor } from '@nestjs/platform-express';
import multer from 'multer';
import { Response } from 'express';

@UseGuards(JwtAdminAuthGuard)
@Controller('admin/companies')
export class AdminCompanyUserController {
  constructor(private readonly userService: UserService) {}

  @Get(':id/users')
  findAll(@Param('id') id: string, @Query() query: any) {
    query.company_id = id;
    return this.userService.findAll(query, ['company']);
  }

  @Post(':id/users')
  storeUser(@Param('id') id: string, @Body() payload: CreateUserDto) {
    return this.userService.store({ ...payload, ...{ company_id: id } });
  }

  @Get(':companyId/users/:id')
  findUser(@Param('companyId') companyId: string, @Param('id') id: string) {
    return this.userService.findUserByCompany(id, companyId);
  }

  @Patch(':companyId/users/:id')
  updateUser(
    @Param('companyId') companyId: string,
    @Param('id') id: string,
    @Body() payload: UpdateUserDto,
  ) {
    return this.userService.update(id, {
      ...payload,
      ...{ company_id: companyId },
    });
  }

  @Delete(':companyId/users/:id')
  deleteUser(@Param('companyId') companyId: string, @Param('id') id: string) {
    return this.userService.removeUserByCompany(id, companyId);
  }

  @Post(':id/import-user')
  @UseInterceptors(FileInterceptor('file', { storage: multer.memoryStorage() }))
  async importUser(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.userService.importUsers(file, id);
  }

  @Post(':id/export-user')
  async exportUsers(@Param('id') id: string, @Res() res: Response) {
    const buffer = await this.userService.exportUsers(id);

    res.setHeader('Content-Disposition', 'attachment; filename="users.xlsx"');
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.send(buffer);
  }
}
