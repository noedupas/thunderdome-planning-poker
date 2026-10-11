import type { RetroItemGif } from '../types/retro';

// A search result: preview is the small rendition shown in the picker grid, gif is what gets stored on the item
export type GifSearchResult = {
  id: string;
  title: string;
  previewUrl: string;
  previewWidth: number;
  previewHeight: number;
  gif: RetroItemGif;
};

export type GifSearchPage = {
  results: GifSearchResult[];
  nextPage: number | null;
};

export type GifSearchOptions = {
  page?: number;
  limit?: number;
  signal?: AbortSignal;
};

export type GifProviderConfig = {
  apiKey: string;
  rating: GifRating;
  locale: string;
};

export type GifRating = 'g' | 'pg' | 'pg-13' | 'r';

export interface GifProvider {
  readonly id: string;
  readonly attribution: { label: string; url: string };
  search(query: string, options?: GifSearchOptions): Promise<GifSearchPage>;
}

// Thrown when the provider answers HTTP 429 (GIPHY beta and KLIPY test keys are limited to 100 calls per hour)
export class GifRateLimitError extends Error {
  constructor() {
    super('GIF provider rate limit reached');
    this.name = 'GifRateLimitError';
  }
}
