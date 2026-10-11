import { describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';

import Export from './Export.svelte';
import { sampleGif } from '../../gif/__tests__/fixtures';

const retro = {
  template: { format: { columns: [{ name: 'worked', label: 'What worked well', color: 'green', icon: 'smiley' }] } },
  items: [
    { id: 'i1', type: 'worked', content: 'Great demo', gif: sampleGif },
    { id: 'i2', type: 'worked', content: 'Fast reviews', gif: null },
  ],
  actionItems: [],
};

describe('Export', () => {
  it('renders the GIF of the items that have one', async () => {
    render(Export, { retro });

    await expect.element(page.getByText('Great demo')).toBeVisible();
    await expect.element(page.getByText('Fast reviews')).toBeVisible();
    expect(page.getByTestId('retro-item-gif').all()).toHaveLength(1);
    await expect.element(page.getByTestId('retro-item-gif')).toHaveAttribute('alt', sampleGif.title);
  });
});
