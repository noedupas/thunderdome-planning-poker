import { describe, it, expect, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';

import { user } from '../../stores';
import RetroFeedbackItem from './RetroFeedbackItem.svelte';
import { sampleGif } from '../../gif/__tests__/fixtures';
import type { RetroItemGif } from '../../types/retro';

const baseUser = {
  id: 'user-1',
  name: 'Alex Doe',
  createdDate: '2024-01-01T00:00:00.000Z',
  updatedDate: '2024-01-01T00:00:00.000Z',
  lastActive: '2024-01-01T00:00:00.000Z',
  locale: 'en',
  rank: 'warrior',
  subscribed: true,
};

const baseItem = {
  id: 'item-1',
  type: 'worked_well',
  content: 'Ship it',
  userId: 'user-1',
  groupId: 'group-1',
  comments: [],
  reactions: [
    {
      id: 'reaction-1',
      item_id: 'item-1',
      user_id: 'user-2',
      reaction: '🚀',
      created_date: '2024-01-01T00:00:00.000Z',
      updated_date: '2024-01-01T00:00:00.000Z',
    },
  ],
};

const setup = (overrides?: {
  item?: typeof baseItem & { gif?: RetroItemGif | null };
  phase?: string;
  feedbackVisibility?: string;
  sendSocketEvent?: (event: string, value: any) => void;
}) => {
  const {
    item = baseItem,
    phase = 'group',
    feedbackVisibility = 'visible',
    sendSocketEvent = vi.fn(),
  } = overrides || {};

  user.create({
    ...baseUser,
    id: baseUser.id,
  });

  return {
    sendSocketEvent,
    ...render(RetroFeedbackItem, {
      item,
      phase,
      feedbackVisibility,
      sendSocketEvent,
      users: [],
      columnColors: {},
    }),
  };
};

describe('RetroFeedbackItem component reactions', () => {
  it('renders only active reaction counts by default', () => {
    setup();

    const rocketReaction = page.getByTestId('reaction-rocket');
    expect(rocketReaction).toHaveTextContent('🚀 1');
    expect(page.getByTestId('reaction-picker-toggle')).toBeTruthy();
  });

  it('opens the picker and sends add reaction socket event for a new reaction', async () => {
    const sendSocketEvent = vi.fn();
    setup({ sendSocketEvent });

    const reactionPickerToggle = page.getByTestId('reaction-picker-toggle');
    await userEvent.click(reactionPickerToggle);

    const reactionPopover = page.getByTestId('reaction-picker-popover');
    expect(reactionPopover).toBeTruthy();

    const thumbsDownReaction = page.getByTestId('reaction-picker-option-thumbsdown');
    await userEvent.click(thumbsDownReaction);

    expect(sendSocketEvent).toHaveBeenCalledWith(
      'item_reaction_add',
      JSON.stringify({
        item_id: 'item-1',
        reaction: '👎',
      }),
    );
  });

  it('sends delete reaction socket event when toggling an existing user reaction', async () => {
    const sendSocketEvent = vi.fn();
    setup({
      sendSocketEvent,
      item: {
        ...baseItem,
        reactions: [
          ...baseItem.reactions,
          {
            id: 'reaction-2',
            item_id: 'item-1',
            user_id: 'user-1',
            reaction: '🚀',
            created_date: '2024-01-01T00:00:00.000Z',
            updated_date: '2024-01-01T00:00:00.000Z',
          },
        ],
      },
    });

    const rocketReaction = page.getByTestId('reaction-rocket');
    await userEvent.click(rocketReaction);

    expect(sendSocketEvent).toHaveBeenCalledWith(
      'item_reaction_delete',
      JSON.stringify({
        reaction_id: 'reaction-2',
      }),
    );
  });

  it('disables picker options for reactions already used by the current user', async () => {
    setup({
      item: {
        ...baseItem,
        reactions: [
          {
            id: 'reaction-2',
            item_id: 'item-1',
            user_id: 'user-1',
            reaction: '👎',
            created_date: '2024-01-01T00:00:00.000Z',
            updated_date: '2024-01-01T00:00:00.000Z',
          },
        ],
      },
    });

    await userEvent.click(page.getByTestId('reaction-picker-toggle'));

    const thumbsDownReaction = page.getByTestId('reaction-picker-option-thumbsdown');
    expect(thumbsDownReaction).toBeDisabled();
  });
});

describe('RetroFeedbackItem GIF', () => {
  // the logged in user is user-1
  const gifItem = (userId: string) => ({ ...baseItem, userId, gif: sampleGif });

  it('renders no GIF when the item has none', async () => {
    setup({ phase: 'group' });

    await expect.element(page.getByTestId('retro-feedback-item-content')).toHaveTextContent('Ship it');
    await expect.element(page.getByTestId('retro-item-gif')).not.toBeInTheDocument();
  });

  it.each(['group', 'vote', 'action', 'completed'])(
    'shows the GIF in the %s phase, even when brainstorm feedback was hidden',
    async phase => {
      setup({ item: gifItem('user-2'), phase, feedbackVisibility: 'hidden' });

      const gif = page.getByTestId('retro-item-gif');
      await expect.element(gif).toBeVisible();
      await expect.element(gif).toHaveAttribute('src', sampleGif.url);
      await expect.element(gif).toHaveAttribute('alt', sampleGif.title);
    },
  );

  it("shows other users' GIFs in brainstorm when feedback is visible", async () => {
    setup({ item: gifItem('user-2'), phase: 'brainstorm', feedbackVisibility: 'visible' });

    await expect.element(page.getByTestId('retro-item-gif')).toBeVisible();
  });

  it.each(['hidden', 'concealed'])("hides other users' GIFs in brainstorm when feedback is %s", async visibility => {
    setup({ item: gifItem('user-2'), phase: 'brainstorm', feedbackVisibility: visibility });

    await expect.element(page.getByTestId('retro-feedback-item-content')).toBeInTheDocument();
    await expect.element(page.getByTestId('retro-item-gif')).not.toBeInTheDocument();
  });

  it.each(['hidden', 'concealed'])('always shows my own GIF in brainstorm when feedback is %s', async visibility => {
    setup({ item: gifItem('user-1'), phase: 'brainstorm', feedbackVisibility: visibility });

    await expect.element(page.getByTestId('retro-item-gif')).toBeVisible();
  });

  it('shows the hidden placeholder for a GIF only item of another user', async () => {
    setup({ item: { ...gifItem('user-2'), content: '' }, phase: 'brainstorm', feedbackVisibility: 'hidden' });

    await expect.element(page.getByTestId('retro-feedback-item-content')).toHaveTextContent('Feedback Hidden');
    await expect.element(page.getByTestId('retro-item-gif')).not.toBeInTheDocument();
  });

  it('marks the GIF as non draggable to avoid conflicts with drag and drop', async () => {
    setup({ item: gifItem('user-1'), phase: 'group' });

    await expect.element(page.getByTestId('retro-item-gif')).toHaveAttribute('draggable', 'false');
  });
});
