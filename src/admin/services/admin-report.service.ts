import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Company } from 'src/companies/entities/company.entity';
import { User } from 'src/users/entities/user.entity';
import { Audio } from 'src/audios/entities/audio.entity';

export interface OverviewInterface {
  company_count: number;
  user_count: number;
  audio_count: number;
  video_count: number;
  pharma_count: number;
}

@Injectable()
export class AdminReportService {
  constructor(
    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,

    @InjectRepository(User)
    private readonly userRepository: Repository<User>,

    @InjectRepository(Audio)
    private readonly audioRepository: Repository<Audio>,
  ) {}

  async getOverview(): Promise<OverviewInterface> {
    const [companyCount, userCount, audioCount] = await Promise.all([
      this.companyRepository.count({ where: { is_active: true } }),
      this.userRepository.count({ where: { is_active: true } }),
      this.audioRepository.count({ where: { is_active: true } }),
    ]);

    return {
      company_count: companyCount ?? 0,
      user_count: userCount ?? 0,
      audio_count: audioCount ?? 0,
      video_count: 0,
      pharma_count: 0,
    };
  }

  async getUsage() {
    return [];
  }
}
