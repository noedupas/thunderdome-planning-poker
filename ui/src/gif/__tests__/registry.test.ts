import { afterEach, describe, expect, it, vi } from 'vitest';
import { createGifProvider } from '../index';
import { jsonResponse } from './fixtures';

const searchedRating = async (rating?: string) => {
  const fetchSpy = vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation(async () => jsonResponse({ data: [], pagination: { total_count: 0, count: 0, offset: 0 } }));

  await createGifProvider({ GifProvider: 'giphy', GifAPIKey: 'key', GifRating: rating }, 'en')!.search('cat');
  const url = new URL(fetchSpy.mock.calls[0][0] as string);
  fetchSpy.mockRestore();

  return url.searchParams.get('rating');
};

describe('createGifProvider', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns null when GIFs are disabled', () => {
    expect(createGifProvider({}, 'en')).toBeNull();
    expect(createGifProvider({ GifProvider: '', GifAPIKey: 'key' }, 'en')).toBeNull();
  });

  it('returns null for an unknown provider or a missing key', () => {
    expect(createGifProvider({ GifProvider: 'tenor', GifAPIKey: 'key' }, 'en')).toBeNull();
    expect(createGifProvider({ GifProvider: 'giphy', GifAPIKey: '' }, 'en')).toBeNull();
    expect(createGifProvider({ GifProvider: 'giphy' }, 'en')).toBeNull();
  });

  it('builds the configured provider, ignoring case and spaces', () => {
    expect(createGifProvider({ GifProvider: 'giphy', GifAPIKey: 'key' }, 'en')?.id).toBe('giphy');
    expect(createGifProvider({ GifProvider: ' KLIPY ', GifAPIKey: 'key' }, 'en')?.id).toBe('klipy');
  });

  it('uses the configured rating, normalized', async () => {
    expect(await searchedRating('pg-13')).toBe('pg-13');
    expect(await searchedRating(' PG ')).toBe('pg');
  });

  it('falls back to the safest rating when the configured one is missing or invalid', async () => {
    expect(await searchedRating(undefined)).toBe('g');
    expect(await searchedRating('')).toBe('g');
    expect(await searchedRating('pg13')).toBe('g');
  });
});
