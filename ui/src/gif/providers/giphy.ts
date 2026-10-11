import { GifRateLimitError } from '../types';
import type { GifProvider, GifProviderConfig, GifSearchResult } from '../types';

const SEARCH_URL = 'https://api.giphy.com/v1/gifs/search';
// GIPHY limits q to 50 characters
const MAX_QUERY_LENGTH = 50;

type GiphyRendition = { url: string; width: string; height: string };

type GiphyGif = {
  id: string;
  title: string;
  images: {
    fixed_width: GiphyRendition;
    fixed_width_small?: GiphyRendition;
  };
};

type GiphySearchResponse = {
  data: GiphyGif[];
  pagination: { total_count: number; count: number; offset: number };
};

const toResult = (g: GiphyGif): GifSearchResult => {
  // fixed_width (200px wide) is what we store: light enough for a board full of GIFs
  const stored = g.images.fixed_width;
  const preview = g.images.fixed_width_small ?? stored;

  return {
    id: g.id,
    title: g.title,
    previewUrl: preview.url,
    previewWidth: Number(preview.width),
    previewHeight: Number(preview.height),
    gif: {
      provider: 'giphy',
      id: g.id,
      // GIPHY terms: URLs must be kept as returned, query string included
      url: stored.url,
      width: Number(stored.width),
      height: Number(stored.height),
      title: g.title,
    },
  };
};

export function createGiphyProvider(config: GifProviderConfig): GifProvider {
  return {
    id: 'giphy',
    attribution: { label: 'Powered by GIPHY', url: 'https://giphy.com' },

    async search(query, { page = 1, limit = 24, signal } = {}) {
      const params = new URLSearchParams({
        api_key: config.apiKey,
        q: query.slice(0, MAX_QUERY_LENGTH),
        limit: String(limit),
        offset: String((page - 1) * limit),
        rating: config.rating,
        lang: config.locale.slice(0, 2),
        // only return the renditions useful for messaging, smaller payload
        bundle: 'messaging_non_clips',
      });

      const response = await fetch(`${SEARCH_URL}?${params}`, { signal });
      if (response.status === 429) {
        throw new GifRateLimitError();
      }
      if (!response.ok) {
        throw new Error(`GIPHY search failed with status ${response.status}`);
      }

      const body: GiphySearchResponse = await response.json();
      const { total_count, count, offset } = body.pagination;

      return {
        results: body.data.map(toResult),
        nextPage: offset + count < total_count ? page + 1 : null,
      };
    },
  };
}
