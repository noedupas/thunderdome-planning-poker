import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createKlipyProvider } from '../providers/klipy';
import { GifRateLimitError } from '../types';
import { jsonResponse } from './fixtures';

const CUSTOMER_ID_STORAGE_KEY = 'thunderdome.gif.customerId';

const klipyBody = (items: unknown[] = [], hasNext = false) => ({
  result: true,
  data: { data: items, current_page: 1, per_page: 24, has_next: hasNext },
});

const catItem = {
  id: 1,
  slug: 'cat-1',
  title: 'Cat',
  file: {
    sm: { gif: { url: 'https://static.klipy.com/ii/cat/sm.gif', width: 220, height: 160 } },
    xs: { gif: { url: 'https://static.klipy.com/ii/cat/xs.gif', width: 90, height: 65 } },
  },
};

const provider = () => createKlipyProvider({ apiKey: 'k/ey', rating: 'g', locale: 'fr_FR' });

describe('KLIPY provider', () => {
  beforeEach(() => {
    localStorage.removeItem(CUSTOMER_ID_STORAGE_KEY);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('exposes the KLIPY attribution', () => {
    expect(provider().id).toBe('klipy');
    expect(provider().attribution.label).toBe('Powered by KLIPY');
  });

  it('puts the encoded key in the path and sends the search params', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => jsonResponse(klipyBody()));

    await provider().search('cat', { page: 3, limit: 100 });

    const url = new URL(fetchSpy.mock.calls[0][0] as string);
    expect(url.origin + url.pathname).toBe('https://api.klipy.com/api/v1/k%2Fey/gifs/search');
    expect(url.searchParams.get('q')).toBe('cat');
    expect(url.searchParams.get('page')).toBe('3');
    expect(url.searchParams.get('per_page')).toBe('50');
    expect(url.searchParams.get('rating')).toBe('g');
    expect(url.searchParams.get('locale')).toBe('fr_FR');
  });

  it('maps results, filters out ads and items without a usable rendition', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      jsonResponse(
        klipyBody(
          [
            catItem,
            { id: 2, slug: 'ad', title: 'Ad', type: 'ad', file: {} },
            { id: 3, slug: 'empty', title: 'x', file: {} },
          ],
          true,
        ),
      ),
    );

    const page = await provider().search('cat');

    expect(page.results).toEqual([
      {
        id: '1',
        title: 'Cat',
        previewUrl: 'https://static.klipy.com/ii/cat/xs.gif',
        previewWidth: 90,
        previewHeight: 65,
        gif: {
          provider: 'klipy',
          id: 'cat-1',
          url: 'https://static.klipy.com/ii/cat/sm.gif',
          width: 220,
          height: 160,
          title: 'Cat',
        },
      },
    ]);
    expect(page.nextPage).toBe(2);
  });

  it('sends a stable random customer_id, never the user id', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => jsonResponse(klipyBody()));
    const p = provider();

    await p.search('a');
    await p.search('b');

    const ids = fetchSpy.mock.calls.map(call => new URL(call[0] as string).searchParams.get('customer_id'));
    expect(ids[0]).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(ids[1]).toBe(ids[0]);
    expect(localStorage.getItem(CUSTOMER_ID_STORAGE_KEY)).toBe(ids[0]);
  });

  it('throws GifRateLimitError on HTTP 429', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => jsonResponse({}, 429));

    await expect(provider().search('cat')).rejects.toBeInstanceOf(GifRateLimitError);
  });

  it('throws a generic error on other failures', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => jsonResponse({}, 403));

    await expect(provider().search('cat')).rejects.toThrow('KLIPY search failed with status 403');
  });
});
