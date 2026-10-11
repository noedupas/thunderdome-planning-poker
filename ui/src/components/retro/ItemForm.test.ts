import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';

import ItemForm from './ItemForm.svelte';
import { AppConfig } from '../../config';
import { jsonResponse, tinyGifDataUrl } from '../../gif/__tests__/fixtures';

const PLACEHOLDER = 'What worked well...';

const giphyResponse = () =>
  jsonResponse({
    data: [{ id: 'g1', title: 'Cat', images: { fixed_width: { url: tinyGifDataUrl, width: '200', height: '150' } } }],
    pagination: { total_count: 1, count: 1, offset: 0 },
  });

const setup = () => {
  const sendSocketEvent = vi.fn();
  render(ItemForm, { sendSocketEvent, itemType: 'worked', newItemPlaceholder: PLACEHOLDER, phase: 'brainstorm' });
  return { sendSocketEvent };
};

// The picker debounces searches (600ms by default)
const pickFirstGif = async () => {
  await userEvent.click(page.getByTestId('item-form-gif-add'));
  await userEvent.fill(page.getByTestId('gif-picker-search'), 'cat');
  const firstResult = page.getByTestId('gif-picker-result').first();
  await expect.element(firstResult, { timeout: 3000 }).toBeVisible();
  await userEvent.click(firstResult);
};

describe('ItemForm', () => {
  beforeEach(() => {
    AppConfig.GifProvider = 'giphy';
    AppConfig.GifAPIKey = 'test-key';
    AppConfig.GifRating = 'g';
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => giphyResponse());
  });
  afterEach(() => {
    delete AppConfig.GifProvider;
    delete AppConfig.GifAPIKey;
    delete AppConfig.GifRating;
    vi.restoreAllMocks();
  });

  it('sends a text only item without gif', async () => {
    delete AppConfig.GifProvider;
    const { sendSocketEvent } = setup();

    await userEvent.type(page.getByPlaceholder(PLACEHOLDER), 'Great demo{Enter}');

    expect(sendSocketEvent).toHaveBeenCalledWith(
      'create_item',
      JSON.stringify({ type: 'worked', content: 'Great demo', phase: 'brainstorm', gif: null }),
    );
  });

  it('hides the GIF button when GIFs are disabled', async () => {
    delete AppConfig.GifProvider;
    setup();

    await expect.element(page.getByPlaceholder(PLACEHOLDER)).toBeVisible();
    await expect.element(page.getByTestId('item-form-gif-add')).not.toBeInTheDocument();
  });

  it('sends create_item with the selected GIF and resets the form', async () => {
    const { sendSocketEvent } = setup();

    await userEvent.fill(page.getByPlaceholder(PLACEHOLDER), 'Great demo');
    await pickFirstGif();
    await userEvent.click(page.getByTestId('item-form-submit'));

    expect(sendSocketEvent).toHaveBeenCalledTimes(1);
    const [event, value] = sendSocketEvent.mock.calls[0];
    expect(event).toBe('create_item');
    expect(JSON.parse(value)).toEqual({
      type: 'worked',
      content: 'Great demo',
      phase: 'brainstorm',
      gif: { provider: 'giphy', id: 'g1', url: tinyGifDataUrl, width: 200, height: 150, title: 'Cat' },
    });
    await expect.element(page.getByTestId('item-form-gif-preview')).not.toBeInTheDocument();
    await expect.element(page.getByPlaceholder(PLACEHOLDER)).toHaveValue('');
  });

  it('allows a GIF only item', async () => {
    const { sendSocketEvent } = setup();

    await pickFirstGif();
    await userEvent.click(page.getByTestId('item-form-submit'));

    expect(JSON.parse(sendSocketEvent.mock.calls[0][1])).toMatchObject({ content: '', gif: { id: 'g1' } });
  });

  it('allows only one GIF and lets the user remove it', async () => {
    setup();

    await pickFirstGif();

    await expect.element(page.getByTestId('item-form-gif-preview')).toBeVisible();
    await expect.element(page.getByTestId('item-form-gif-add')).not.toBeInTheDocument();
    await expect.element(page.getByTestId('gif-picker')).not.toBeInTheDocument();

    await userEvent.click(page.getByTestId('item-form-gif-remove'));

    await expect.element(page.getByTestId('item-form-gif-preview')).not.toBeInTheDocument();
    await expect.element(page.getByTestId('item-form-gif-add')).toBeVisible();
  });

  it('does not send an empty item', async () => {
    const { sendSocketEvent } = setup();

    await userEvent.type(page.getByPlaceholder(PLACEHOLDER), '   {Enter}');

    expect(sendSocketEvent).not.toHaveBeenCalled();
  });
});
