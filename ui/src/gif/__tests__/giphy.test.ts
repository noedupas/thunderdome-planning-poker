import { afterEach, describe, expect, it, vi } from 'vitest';
import { createGiphyProvider } from '../providers/giphy';
import { GifRateLimitError } from '../types';
import { jsonResponse } from './fixtures';

const giphyBody = (pagination = { total_count: 30, count: 24, offset: 0 }) => ({
  data: [
    {
      id: 'g1',
      title: 'Cat',
      images: {
        fixed_width: {
          url: 'https://media1.giphy.com/media/g1/200w.gif?cid=a&rid=200w.gif',
          width: '200',
          height: '113',
        },
        fixed_width_small: { url: 'https://media1.giphy.com/media/g1/100w.gif?cid=a', width: '100', height: '57' },
      },
    },
  ],
  pagination,
});

const provider = () => createGiphyProvider({ apiKey: 'test-key', rating: 'pg', locale: 'fr' });

const requestedUrl = (fetchSpy: ReturnType<typeof vi.spyOn>) => new URL(fetchSpy.mock.calls[0][0] as string);

describe('GIPHY provider', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('exposes the GIPHY attribution', () => {
    expect(provider().id).toBe('giphy');
    expect(provider().attribution).toEqual({ label: 'Powered by GIPHY', url: 'https://giphy.com' });
  });

  it('calls the search endpoint with key, query, rating, language and offset', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => jsonResponse(giphyBody()));

    await provider().search('happy cat', { page: 2, limit: 24 });

    const url = requestedUrl(fetchSpy);
    expect(url.origin + url.pathname).toBe('https://api.giphy.com/v1/gifs/search');
    expect(url.searchParams.get('api_key')).toBe('test-key');
    expect(url.searchParams.get('q')).toBe('happy cat');
    expect(url.searchParams.get('rating')).toBe('pg');
    expect(url.searchParams.get('lang')).toBe('fr');
    expect(url.searchParams.get('limit')).toBe('24');
    expect(url.searchParams.get('offset')).toBe('24');
  });

  it('truncates the query to 50 characters', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => jsonResponse(giphyBody()));

    await provider().search('x'.repeat(80));

    expect(requestedUrl(fetchSpy).searchParams.get('q')).toHaveLength(50);
  });

  it('forwards the abort signal', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => jsonResponse(giphyBody()));
    const controller = new AbortController();

    await provider().search('cat', { signal: controller.signal });

    expect(fetchSpy.mock.calls[0][1]).toEqual({ signal: controller.signal });
  });

  it('maps results to the provider-agnostic shape without altering URLs', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => jsonResponse(giphyBody()));

    const page = await provider().search('cat');

    expect(page.results).toEqual([
      {
        id: 'g1',
        title: 'Cat',
        previewUrl: 'https://media1.giphy.com/media/g1/100w.gif?cid=a',
        previewWidth: 100,
        previewHeight: 57,
        gif: {
          provider: 'giphy',
          id: 'g1',
          url: 'https://media1.giphy.com/media/g1/200w.gif?cid=a&rid=200w.gif',
          width: 200,
          height: 113,
          title: 'Cat',
        },
      },
    ]);
    expect(page.nextPage).toBe(2);
  });

  it('returns no next page on the last page', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      jsonResponse(giphyBody({ total_count: 24, count: 24, offset: 0 })),
    );

    expect((await provider().search('cat')).nextPage).toBeNull();
  });

  it('throws GifRateLimitError on HTTP 429', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => jsonResponse({}, 429));

    await expect(provider().search('cat')).rejects.toBeInstanceOf(GifRateLimitError);
  });

  it('throws a generic error on other failures', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => jsonResponse({}, 500));

    await expect(provider().search('cat')).rejects.toThrow('GIPHY search failed with status 500');
  });
});
