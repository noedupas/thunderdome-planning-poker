import { GifRateLimitError } from '../types';
import type { GifProvider, GifProviderConfig, GifSearchResult } from '../types';

// Endpoint and response format based on secondary sources, to validate with a KLIPY test key (docs.klipy.com)
const API_URL = 'https://api.klipy.com/api/v1';
const CUSTOMER_ID_STORAGE_KEY = 'thunderdome.gif.customerId';

type KlipyMedia = { url: string; width: number; height: number };
type KlipySize = { gif?: KlipyMedia; webp?: KlipyMedia; mp4?: KlipyMedia };

type KlipyItem = {
  id: number | string;
  slug: string;
  title: string;
  // "ad" for sponsored items
  type?: string;
  file: { hd?: KlipySize; md?: KlipySize; sm?: KlipySize; xs?: KlipySize };
};

type KlipySearchResponse = {
  result: boolean;
  data: { data: KlipyItem[]; current_page: number; per_page: number; has_next: boolean };
};

// KLIPY expects a per-user id: never send the Thunderdome user id or email, use a random id per browser
const getCustomerId = (): string => {
  let id = localStorage.getItem(CUSTOMER_ID_STORAGE_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(CUSTOMER_ID_STORAGE_KEY, id);
  }
  return id;
};

const toResult = (item: KlipyItem): GifSearchResult | null => {
  const stored = item.file.sm?.gif ?? item.file.md?.gif;
  const preview = item.file.xs?.gif ?? stored;
  if (!stored || !preview) {
    return null;
  }

  return {
    id: String(item.id),
    title: item.title,
    previewUrl: preview.url,
    previewWidth: preview.width,
    previewHeight: preview.height,
    gif: {
      provider: 'klipy',
      id: item.slug,
      url: stored.url,
      width: stored.width,
      height: stored.height,
      title: item.title,
    },
  };
};

export function createKlipyProvider(config: GifProviderConfig): GifProvider {
  return {
    id: 'klipy',
    attribution: { label: 'Powered by KLIPY', url: 'https://klipy.com' },

    async search(query, { page = 1, limit = 24, signal } = {}) {
      const params = new URLSearchParams({
        q: query,
        page: String(page),
        // KLIPY accepts 8 to 50 results per page
        per_page: String(Math.min(Math.max(limit, 8), 50)),
        rating: config.rating,
        locale: config.locale,
        customer_id: getCustomerId(),
      });

      const response = await fetch(`${API_URL}/${encodeURIComponent(config.apiKey)}/gifs/search?${params}`, { signal });
      if (response.status === 429) {
        throw new GifRateLimitError();
      }
      if (!response.ok) {
        throw new Error(`KLIPY search failed with status ${response.status}`);
      }

      const body: KlipySearchResponse = await response.json();

      return {
        results: body.data.data
          .filter(item => item.type !== 'ad')
          .map(toResult)
          .filter((r): r is GifSearchResult => r !== null),
        nextPage: body.data.has_next ? page + 1 : null,
      };
    },
  };
}
