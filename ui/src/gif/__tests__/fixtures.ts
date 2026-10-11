import type { GifProvider, GifSearchResult } from '../types';
import type { RetroItemGif } from '../../types/retro';

// 1x1 transparent GIF, avoids network access when an <img> loads in tests
export const tinyGifDataUrl = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

export const sampleGif: RetroItemGif = {
  provider: 'giphy',
  id: 'abc123',
  url: tinyGifDataUrl,
  width: 200,
  height: 150,
  title: 'Happy dance',
};

export const sampleResult = (id: string): GifSearchResult => ({
  id,
  title: `gif ${id}`,
  previewUrl: tinyGifDataUrl,
  previewWidth: 100,
  previewHeight: 75,
  gif: { ...sampleGif, id, title: `gif ${id}` },
});

export const fakeProvider = (overrides: Partial<GifProvider> = {}): GifProvider => ({
  id: 'fake',
  attribution: { label: 'Powered by Fake', url: 'https://fake.example.com/' },
  search: async () => ({ results: [sampleResult('1'), sampleResult('2')], nextPage: null }),
  ...overrides,
});

// A new Response per call: a Response body can only be read once
export const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
