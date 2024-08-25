import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AudioReview } from './entities/audio_review.entity';
import { CreateAudioReview } from './dto/create_audio_review.dto';
import { User } from 'src/user/entities/user.entity';
import { plainToInstance } from 'class-transformer';
import { AudioReviewDto } from './dto/audio_review.dto';
import { Audio } from './entities/audio.entity';
import { AudioService } from './audio.service';

@Injectable()
export class AudioReviewService {
  constructor(
    @InjectRepository(Audio)
    private readonly audioRepository: Repository<Audio>,

    @InjectRepository(AudioReview)
    private readonly audioReviewRepository: Repository<AudioReview>,

    private readonly audioService: AudioService
  ) {}

  async findAudioReviews(audioId: string): Promise<any> {
    const audio = await this.audioService.findById(audioId);

    const reviews =  await this.audioReviewRepository.find({ 
      where: { audio_id: audio.id } ,
      relations: ['user']
    });

    return plainToInstance(AudioReviewDto, reviews, {excludeExtraneousValues: true});
  }   

  async storeAudioReview(audioId: string, payload: CreateAudioReview, user: User): Promise<{average_review_rating: number, review: AudioReviewDto}> {

    const audio = await this.audioService.findById(audioId);

    let review = await this.audioReviewRepository.findOne({
      where: { audio_id: audioId, user_id: user.id },
    });

    if (review) {
      throw new ConflictException('You have already submitted a review for this audio.');
    }

    let newReview = this.audioReviewRepository.create({
      audio: audio,
      user: user,
      ...payload,
    });

    newReview = await this.audioReviewRepository.save(newReview);

    return {
      average_review_rating: await this.updateAverageReviewRate(audio),
      review: plainToInstance(AudioReviewDto, newReview, {excludeExtraneousValues: true})
    };
  }

  async updateAverageReviewRate(audio: Audio): Promise<number>{
    const reviews =  await this.audioReviewRepository.find({ 
      where: { audio_id: audio.id } ,
      select: ['id', 'rate']
    });

    audio.average_review_rating = reviews.reduce((sum, review) => sum + review.rate, 0) / reviews.length ?? 0;

    const avgRating = reviews.reduce((sum, review) => sum + review.rate, 0) / reviews.length ?? 0;
    
    await this.audioRepository.save(audio);

    return avgRating;
  }
}
