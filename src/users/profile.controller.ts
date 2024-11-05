import {
  Controller,
  Request,
  Post,
  UseGuards,
  Body,
  Get,
  HttpCode,
  Put,
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { ProfileDto } from './dto/profile.dto';
import { plainToInstance } from 'class-transformer';
import { UserService } from './user.service';
import { UpdateProfileDto } from './dto/update-profile.dto';

@UseGuards(JwtAuthGuard)
@Controller('profile')
export class ProfileController {
  constructor(private readonly userService: UserService) {}

  @Get()
  @HttpCode(200)
  getProfile(@Request() req): ProfileDto {
    return plainToInstance(ProfileDto, req.user, {
      excludeExtraneousValues: true,
    });
  }

  @Put()
  @HttpCode(200)
  async updateProfile(@Request() req, @Body() payload: UpdateProfileDto) {
    await this.userService.update(req.user.id, payload);
    const updatedUser = this.userService.findByEmail(req.user.email, ['company']);

    return plainToInstance(ProfileDto, updatedUser, {
      excludeExtraneousValues: true,
    });
  }
}
