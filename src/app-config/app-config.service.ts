import { Injectable } from '@nestjs/common';
import { CreateAppConfigDto } from './dto/create-app-config.dto';
import { UpdateAppConfigDto } from './dto/update-app-config.dto';

@Injectable()
export class AppConfigService {
  create(createAppConfigDto: CreateAppConfigDto) {
    return 'This action adds a new appConfig';
  }

  findAll() {
    return `This action returns all appConfig`;
  }

  findOne(id: number) {
    return `This action returns a #${id} appConfig`;
  }

  update(id: number, updateAppConfigDto: UpdateAppConfigDto) {
    return `This action updates a #${id} appConfig`;
  }

  remove(id: number) {
    return `This action removes a #${id} appConfig`;
  }
}
