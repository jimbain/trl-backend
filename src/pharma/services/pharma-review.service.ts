import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import { User } from 'src/users/entities/user.entity';
import { plainToInstance } from 'class-transformer';
import { Pharma } from '../entities/pharma.entity';
import { PharmaReview } from '../entities/pharma-review.entity';
import { PharmaService } from './pharma.service';
import { PharmaReviewDto } from '../dto/pharma-review.dto';
import { CreatePharmaReviewDto } from '../dto/create-pharma-review.dto';

@Injectable()
export class PharmaReviewService {
  constructor(
    @InjectRepository(Pharma)
    private readonly pharmaRepository: Repository<Pharma>,

    @InjectRepository(PharmaReview)
    private readonly pharmaReviewRepository: Repository<PharmaReview>,

    private readonly pharmaService: PharmaService,
  ) {}

  async findAll(pharmaId: string, user: User): Promise<PharmaReviewDto[]> {
    const pharma = await this.pharmaService.findById(pharmaId);

    // Find the current user's review, if it exists
    const userReview = await this.pharmaReviewRepository.findOne({
      where: {
        pharma_id: pharma.id,
        user: { id: user.id },
        review: Not('null'),
      },
      relations: ['user'],
    });

    // Find other reviews, excluding the current user's review, sorted by created_at descending
    const otherReviews = await this.pharmaReviewRepository.find({
      where: {
        pharma_id: pharma.id,
        user: { id: Not(user.id) },
        review: Not('null'),
      },
      relations: ['user'],
      order: { created_at: 'DESC' },
    });

    // Combine the reviews with the current user's review first, if it exists
    const reviews = userReview ? [userReview, ...otherReviews] : otherReviews;

    return plainToInstance(PharmaReviewDto, reviews, {
      excludeExtraneousValues: true,
    });
  }

  async store(
    pharmaId: string,
    payload: CreatePharmaReviewDto,
    user: User,
  ): Promise<{ average_review_rating: number; review: PharmaReviewDto }> {
    const pharma = await this.pharmaService.findById(pharmaId);

    const review = await this.pharmaReviewRepository.findOne({
      where: { pharma_id: pharmaId, user_id: user.id },
    });

    if (review) {
      throw new ConflictException(
        'You have already submitted a review for this pharma.',
      );
    }

    let newReview = this.pharmaReviewRepository.create({
      pharma: pharma,
      user: user,
      ...payload,
    });

    newReview = await this.pharmaReviewRepository.save(newReview);

    return {
      average_review_rating: await this.updateAverageReviewRate(pharma),
      review: plainToInstance(PharmaReviewDto, newReview, {
        excludeExtraneousValues: true,
      }),
    };
  }

  async updateAverageReviewRate(pharma: Pharma): Promise<number> {
    const reviews = await this.pharmaReviewRepository.find({
      where: { pharma_id: pharma.id },
      select: ['id', 'rate'],
    });

    const avgRating =
      reviews.length > 0
        ? reviews.reduce((sum, review) => sum + review.rate, 0) / reviews.length
        : 0;

    pharma.avg_rating = avgRating;

    await this.pharmaRepository.save(pharma);

    return avgRating;
  }
}
