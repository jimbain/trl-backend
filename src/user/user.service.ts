import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UpdateUserDto } from './dto/update-user.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { User } from 'src/user/entities/user.entity';
import { plainToClass } from 'class-transformer';
import { UserDto } from './dto/user.dto';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async create(createUserPayload: CreateUserDto): Promise<any> {
    const user = this.userRepository.create(createUserPayload);
    await this.userRepository.save(user);
    return plainToClass(UserDto, user, { excludeExtraneousValues: true });
  }

  async findByEmail(email: string, relations: string[] = []): Promise<User | undefined> {
    return this.userRepository.findOne({
        where: { email },
        relations: relations.length ? relations : undefined,
    });
  }

  async findById(id: string, relations: string[] = []): Promise<User | undefined> {
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

  update(id: number, updateUserDto: UpdateUserDto) {
    return `This action updates a #${id} user`;
  }

  remove(id: number) {
    return `This action removes a #${id} user`;
  }

  async changePassword(user:User, password: string): Promise<User> {
    user.password = password;
    await this.userRepository.save(user);
    return user;
  }
}
