import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UpdateUserDto } from './dto/update-user.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { User } from 'src/users/entities/user.entity';
import { plainToInstance } from 'class-transformer';
import { UserDto } from './dto/user.dto';
import { UserDevice } from './entities/user_device.entity';
import { CreateUserDeviceDto } from './dto/create-user_device.dto';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,

    @InjectRepository(UserDevice)
    private readonly userDeviceRepository: Repository<UserDevice>,
  ) {}

  async create(createUserPayload: CreateUserDto): Promise<any> {
    const user = this.userRepository.create(createUserPayload);
    await this.userRepository.save(user);
    return plainToInstance(UserDto, user, { excludeExtraneousValues: true });
  }

  async findByEmail(
    email: string,
    relations: string[] = [],
  ): Promise<User | undefined> {
    return this.userRepository.findOne({
      where: { email },
      relations: relations.length ? relations : undefined,
    });
  }

  async findById(
    id: string,
    relations: string[] = [],
  ): Promise<User | undefined> {
    return this.userRepository.findOne({
      where: { id },
      relations: relations.length ? relations : undefined,
    });
  }

  findAll() {
    return `This action returns all user`;
  }

  findOne(id: number) {
    return `This action returns a #${id} user`;
  }

  async update(id: string, payload: Object) {
    return await this.userRepository.update(id, payload);
  }

  remove(id: number) {
    return `This action removes a #${id} user`;
  }

  async changePassword(user: User, password: string): Promise<User> {
    user.password = password;
    await this.userRepository.save(user);
    return user;
  }

  async storeUserDevice(
    user: User,
    data: CreateUserDeviceDto,
  ): Promise<UserDevice> {
    const userDevice = this.userDeviceRepository.create({
      user_id: user.id,
      ...data,
    });

    return await this.userDeviceRepository.save(userDevice);
  }
}
