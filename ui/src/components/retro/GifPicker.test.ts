import { describe, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';

import GifPicker from './GifPicker.svelte';
import { GifRateLimitError } from '../../gif';
import type { GifProvider } from '../../gif';
import { fakeProvider, sampleResult } from '../../gif/__tests__/fixtures';

const setup = (overrides: Partial<GifProvider> = {}) => {
  const provider = fakeProvider(overrides);
  const search = vi.spyOn(provider, 'search');
  const onselect = vi.fn();
  const onclose = vi.fn();

  render(GifPicker, { provider, onselect, onclose, debounceMs: 0 });

  return { search, onselect, onclose };
};

describe('GifPicker', () => {
  it('does not search below 2 characters', async () => {
    const { search } = setup();

    await userEvent.type(page.getByTestId('gif-picker-search'), 'a');
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(search).not.toHaveBeenCalled();
    await expect.element(page.getByTestId('gif-picker-results')).not.toBeInTheDocument();
  });

  it('searches and lets the user pick a GIF', async () => {
    const { search, onselect } = setup();

    await userEvent.type(page.getByTestId('gif-picker-search'), 'cat');

    await expect.element(page.getByTestId('gif-picker-result').first()).toBeVisible();
    expect(search).toHaveBeenLastCalledWith('cat', expect.objectContaining({ page: 1 }));

    await userEvent.click(page.getByTestId('gif-picker-result').first());
    expect(onselect).toHaveBeenCalledWith(sampleResult('1').gif);
  });

  it('loads the next page on demand', async () => {
    setup({
      search: vi
        .fn()
        .mockResolvedValueOnce({ results: [sampleResult('1')], nextPage: 2 })
        .mockResolvedValueOnce({ results: [sampleResult('2')], nextPage: null }),
    });

    await userEvent.fill(page.getByTestId('gif-picker-search'), 'cat');
    await userEvent.click(page.getByTestId('gif-picker-more'));

    await expect.poll(() => page.getByTestId('gif-picker-result').all().length).toBe(2);
    await expect.element(page.getByTestId('gif-picker-more')).not.toBeInTheDocument();
  });

  it('shows a dedicated message when the rate limit is reached', async () => {
    setup({ search: vi.fn().mockRejectedValue(new GifRateLimitError()) });

    await userEvent.fill(page.getByTestId('gif-picker-search'), 'cat');

    await expect.element(page.getByTestId('gif-picker-rate-limited')).toHaveTextContent('GIF search limit reached');
  });

  it('shows an error message when the search fails', async () => {
    setup({ search: vi.fn().mockRejectedValue(new Error('boom')) });

    await userEvent.fill(page.getByTestId('gif-picker-search'), 'cat');

    await expect.element(page.getByTestId('gif-picker-error')).toBeVisible();
  });

  it('shows an empty state when nothing matches', async () => {
    setup({ search: vi.fn().mockResolvedValue({ results: [], nextPage: null }) });

    await userEvent.fill(page.getByTestId('gif-picker-search'), 'zzzz');

    await expect.element(page.getByTestId('gif-picker-empty')).toHaveTextContent('No GIFs found');
  });

  it('always displays the provider attribution', async () => {
    setup();

    const attribution = page.getByTestId('gif-picker-attribution');
    await expect.element(attribution).toHaveTextContent('Powered by Fake');
    await expect.element(attribution).toHaveAttribute('href', 'https://fake.example.com/');
  });

  it('closes on Escape and with the close button', async () => {
    const { onclose } = setup();

    await userEvent.click(page.getByTestId('gif-picker-search'));
    await userEvent.keyboard('{Escape}');
    await userEvent.click(page.getByTestId('gif-picker-close'));

    expect(onclose).toHaveBeenCalledTimes(2);
  });
});
