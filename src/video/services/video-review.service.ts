import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import { User } from 'src/users/entities/user.entity';
import { plainToInstance } from 'class-transformer';
import { Video } from '../entities/video.entity';
import { VideoReview } from '../entities/video-review.entity';
import { VideoService } from './video.service';
import { VideoReviewDto } from '../dto/video-review.dto';
import { CreateVideoReviewDto } from '../dto/create-video-review.dto';

@Injectable()
export class VideoReviewService {
  constructor(
    @InjectRepository(Video)
    private readonly videoRepository: Repository<Video>,

    @InjectRepository(VideoReview)
    private readonly videoReviewRepository: Repository<VideoReview>,

    private readonly videoService: VideoService,
  ) {}

  async findAll(videoId: string, user: User): Promise<VideoReviewDto[]> {
    const video = await this.videoService.findById(videoId);

    // Find the current user's review, if it exists
    const userReview = await this.videoReviewRepository.findOne({
      where: {
        video_id: video.id,
        user: { id: user.id },
        review: Not('null'),
      },
      relations: ['user'],
    });

    // Find other reviews, excluding the current user's review, sorted by created_at descending
    const otherReviews = await this.videoReviewRepository.find({
      where: {
        video_id: video.id,
        user: { id: Not(user.id) },
        review: Not('null'),
      },
      relations: ['user'],
      order: { created_at: 'DESC' },
    });

    // Combine the reviews with the current user's review first, if it exists
    const reviews = userReview ? [userReview, ...otherReviews] : otherReviews;

    return plainToInstance(VideoReviewDto, reviews, {
      excludeExtraneousValues: true,
    });
  }

  async create(
    videoId: string,
    createVideoReviewDto: CreateVideoReviewDto,
    user: User,
  ): Promise<VideoReviewDto> {
    const video = await this.videoService.findById(videoId);

    // Check if user already has a review for this video
    const existingReview = await this.videoReviewRepository.findOne({
      where: {
        video_id: video.id,
        user_id: user.id,
      },
    });

    if (existingReview) {
      throw new ConflictException('User has already reviewed this video');
    }

    const review = this.videoReviewRepository.create({
      video_id: video.id,
      user_id: user.id,
      ...createVideoReviewDto,
    });

    const savedReview = await this.videoReviewRepository.save(review);

    // Update video average rating
    await this.videoService.updateAverageRating(video.id);

    return plainToInstance(VideoReviewDto, savedReview, {
      excludeExtraneousValues: true,
    });
  }

  async update(
    videoId: string,
    createVideoReviewDto: CreateVideoReviewDto,
    user: User,
  ): Promise<VideoReviewDto> {
    const video = await this.videoService.findById(videoId);

    const existingReview = await this.videoReviewRepository.findOne({
      where: {
        video_id: video.id,
        user_id: user.id,
      },
    });

    if (!existingReview) {
      throw new ConflictException('No existing review found for this video');
    }

    Object.assign(existingReview, createVideoReviewDto);
    const savedReview = await this.videoReviewRepository.save(existingReview);

    // Update video average rating
    await this.videoService.updateAverageRating(video.id);

    return plainToInstance(VideoReviewDto, savedReview, {
      excludeExtraneousValues: true,
    });
  }
}
