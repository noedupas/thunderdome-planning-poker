import { createGiphyProvider } from './providers/giphy';
import { createKlipyProvider } from './providers/klipy';
import type { GifProvider, GifProviderConfig, GifRating } from './types';

export * from './types';

// To add a provider: write an adapter in ./providers and register it here and in internal/gif on the backend
const factories: Record<string, (config: GifProviderConfig) => GifProvider> = {
  giphy: createGiphyProvider,
  klipy: createKlipyProvider,
};

const ratings: GifRating[] = ['g', 'pg', 'pg-13', 'r'];

type GifAppConfig = {
  GifProvider?: string;
  GifAPIKey?: string;
  GifRating?: string;
};

// Any unknown rating falls back to the safest one, a typo in config must never disable content filtering
const toRating = (rating?: string): GifRating => ratings.find(r => r === rating?.trim().toLowerCase()) ?? 'g';

// Returns null when GIFs are disabled, the provider is unknown or the key is missing
export function createGifProvider(appConfig: GifAppConfig, locale: string): GifProvider | null {
  const factory = factories[(appConfig.GifProvider ?? '').trim().toLowerCase()];
  if (!factory || !appConfig.GifAPIKey) {
    return null;
  }

  return factory({
    apiKey: appConfig.GifAPIKey,
    rating: toRating(appConfig.GifRating),
    locale,
  });
}
