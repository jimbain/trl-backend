import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AudioReview } from './entities/audio_review.entity';
import { CreateAudioReview } from './dto/create_audio_review.dto';
import { User } from 'src/user/entities/user.entity';
import { plainToInstance } from 'class-transformer';
import { AudioReviewDto } from './dto/audio_review.dto';

@Injectable()
export class AudioReviewService {
  @InjectRepository(AudioReview)
    private readonly audioReviewRepository: Repository<AudioReview>

  async findAudioReviews(audioId: string): Promise<any> {
    const reviews =  await this.audioReviewRepository.find({ 
      where: { audio_id: audioId } ,
      relations: ['user']
    });

    const totalReviews = reviews.length;
    const avgRating = reviews.reduce((sum, review) => sum + review.rate, 0) / totalReviews || 0;

    return {
      summary: {
        avg_rating: avgRating,
        total_reviews: totalReviews,
      },
      reviews: plainToInstance(AudioReviewDto, reviews, {excludeExtraneousValues: true}),
    };
  }   

  async storeAudioReview(audioId: string, payload: CreateAudioReview, user: User): Promise<AudioReviewDto> {

    let review = await this.audioReviewRepository.findOne({
      where: { audio_id: audioId, user_id: user.id },
    });

    if (review) {
      throw new ConflictException('You have already submitted a review for this audio.');
    }

    let newReview = this.audioReviewRepository.create({
      audio_id: audioId,
      user_id: user.id,
      ...payload,
    });

    newReview = await this.audioReviewRepository.save(newReview);

    return plainToInstance(AudioReviewDto, newReview, {excludeExtraneousValues: true});
  }
}
