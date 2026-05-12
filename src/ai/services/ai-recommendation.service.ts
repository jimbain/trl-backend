import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { plainToInstance } from 'class-transformer';
import { createHash } from 'crypto';
import { In, Repository } from 'typeorm';
import { Audio } from 'src/audios/entities/audio.entity';
import { CacheService } from 'src/common/services/cache.service';
import { RecommendedAudioDto } from '../dto/recommended-audio.dto';
import {
  PythonRecommenderService,
  RecommenderMatch,
} from './python-recommender.service';

const CACHE_TTL_SECONDS = 5 * 60;
const CACHE_KEY_PREFIX = 'ai-reco:matches:';
const STATS_COUNTS_CACHE_KEY = 'ai-reco:stats:counts';
const STATS_COUNTS_TTL_SECONDS = 60;

interface CachedCounts {
  total: number;
  with_embeddings: number;
  active: number;
}

export interface AiRecommendationStats {
  total: number;
  with_embeddings: number;
  active: number;
  indexed: number;
  is_warm: boolean;
}

@Injectable()
export class AiRecommendationService {
  constructor(
    private readonly pythonRecommender: PythonRecommenderService,
    private readonly cacheService: CacheService,
    @InjectRepository(Audio)
    private readonly audioRepository: Repository<Audio>,
  ) {}

  async recommend(
    prompt: string,
    limit: number,
  ): Promise<RecommendedAudioDto[]> {
    const normalizedPrompt = prompt.trim();
    const cacheKey = this.cacheKey(normalizedPrompt, limit);

    let matches = (await this.cacheService.get(cacheKey)) as
      | RecommenderMatch[]
      | null;

    if (!matches) {
      matches = await this.pythonRecommender.recommend(normalizedPrompt, limit);
      await this.cacheService.set(cacheKey, matches, CACHE_TTL_SECONDS);
    }

    if (matches.length === 0) return [];

    const skus = matches.map((m) => m.sku);
    const audios = await this.audioRepository.find({
      where: { sku: In(skus) },
      relations: ['metadata'],
    });
    const bySku = new Map(audios.map((a) => [a.sku, a]));

    const enriched = matches
      .map((match) => {
        const audio = bySku.get(match.sku);
        if (!audio) return null;
        return Object.assign(audio, { score: match.score });
      })
      .filter((entry): entry is Audio & { score: number } => entry !== null);

    return plainToInstance(RecommendedAudioDto, enriched, {
      excludeExtraneousValues: true,
    });
  }

  async getStats(): Promise<AiRecommendationStats> {
    const counts = await this.getOrComputeCounts();

    return {
      ...counts,
      indexed: this.pythonRecommender.getIndexedCount(),
      is_warm: this.pythonRecommender.isWarm(),
    };
  }

  private async getOrComputeCounts(): Promise<CachedCounts> {
    const cached = (await this.cacheService.get(
      STATS_COUNTS_CACHE_KEY,
    )) as CachedCounts | null;
    if (cached) return cached;

    // Run the three counts in parallel. Each uses its own pooled connection,
    // independent from the Python child's stream. On first warmup with a
    // large remote DB they may take several seconds, but the 1-minute Redis
    // TTL keeps the frontend's polling cheap thereafter.
    const [total, with_embeddings, active] = await Promise.all([
      this.audioRepository.count(),
      this.audioRepository
        .createQueryBuilder('audio')
        .where('audio.ai_embedding IS NOT NULL')
        .getCount(),
      this.audioRepository.count({ where: { is_active: true } }),
    ]);

    const counts: CachedCounts = { total, with_embeddings, active };
    await this.cacheService.set(
      STATS_COUNTS_CACHE_KEY,
      counts,
      STATS_COUNTS_TTL_SECONDS,
    );
    return counts;
  }

  private cacheKey(prompt: string, limit: number) {
    const hash = createHash('sha1').update(prompt).digest('hex');
    return `${CACHE_KEY_PREFIX}${hash}:${limit}`;
  }
}
