import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import { AudioReview } from './entities/audio_review.entity';
import { CreateAudioReview } from './dto/create_audio_review.dto';
import { User } from 'src/users/entities/user.entity';
import { plainToInstance } from 'class-transformer';
import { AudioReviewDto } from './dto/audio_review.dto';
import { Audio } from './entities/audio.entity';
import { AudioService } from './audio.service';
import { AudioElasticsearchSyncService } from './audio-elasticsearch-sync.service';

@Injectable()
export class AudioReviewService {
  private readonly logger = new Logger(AudioReviewService.name);

  constructor(
    @InjectRepository(Audio)
    private readonly audioRepository: Repository<Audio>,

    @InjectRepository(AudioReview)
    private readonly audioReviewRepository: Repository<AudioReview>,

    private readonly audioService: AudioService,
    private readonly audioElasticsearchSyncService: AudioElasticsearchSyncService,
  ) {}

  async findAudioReviews(
    audioId: string,
    user: User,
  ): Promise<AudioReviewDto[]> {
    const audio = await this.audioService.findById(audioId);

    // Find the current user's review, if it exists
    const userReview = await this.audioReviewRepository.findOne({
      where: { audio_id: audio.id, user: { id: user.id }, review: Not('null') },
      relations: ['user'],
    });

    // Find other reviews, excluding the current user's review, sorted by created_at descending
    const otherReviews = await this.audioReviewRepository.find({
      where: {
        audio_id: audio.id,
        user: { id: Not(user.id) },
        review: Not('null'),
      },
      relations: ['user'],
      order: { created_at: 'DESC' },
    });

    // Combine the reviews with the current user's review first, if it exists
    const reviews = userReview ? [userReview, ...otherReviews] : otherReviews;

    return plainToInstance(AudioReviewDto, reviews, {
      excludeExtraneousValues: true,
    });
  }

  async storeAudioReview(
    audioId: string,
    payload: CreateAudioReview,
    user: User,
  ): Promise<{ average_review_rating: number; review: AudioReviewDto }> {
    const audio = await this.audioService.findById(audioId);

    const review = await this.audioReviewRepository.findOne({
      where: { audio_id: audioId, user_id: user.id },
    });

    if (review) {
      throw new ConflictException(
        'You have already submitted a review for this audio.',
      );
    }

    let newReview = this.audioReviewRepository.create({
      audio: audio,
      user: user,
      ...payload,
    });

    newReview = await this.audioReviewRepository.save(newReview);

    return {
      average_review_rating: await this.updateAverageReviewRate(audio),
      review: plainToInstance(AudioReviewDto, newReview, {
        excludeExtraneousValues: true,
      }),
    };
  }

  async updateAverageReviewRate(audio: Audio): Promise<number> {
    const reviews = await this.audioReviewRepository.find({
      where: { audio_id: audio.id },
      select: ['id', 'rate'],
    });

    const avgRating =
      reviews.length > 0
        ? reviews.reduce((sum, review) => sum + review.rate, 0) / reviews.length
        : 0;

    audio.avg_rating = avgRating;

    await this.audioRepository.save(audio);

    // Sync updated audio to Elasticsearch
    this.audioElasticsearchSyncService
      .syncAudioById(audio.id)
      .catch((error) =>
        this.logger.error(
          `Failed to sync audio ${audio.id} after rating update`,
          error,
        ),
      );

    return avgRating;
  }
}
