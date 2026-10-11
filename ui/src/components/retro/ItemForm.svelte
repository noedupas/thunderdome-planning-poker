<script lang="ts">
  import { Angry, CircleQuestionMark, Frown, ImagePlus, Smile, X } from '@lucide/svelte';
  import GrowingTextArea from '../global/GrowingTextArea.svelte';
  import RetroFeedbackItem from './RetroFeedbackItem.svelte';
  import GifPicker from './GifPicker.svelte';
  import RetroItemGif from './RetroItemGif.svelte';
  import LL, { locale } from '../../i18n/i18n-svelte';
  import { AppConfig } from '../../config';
  import { createGifProvider } from '../../gif';
  import type { RetroItem, RetroItemGif as Gif, RetroUser } from '../../types/retro';

  interface Props {
    sendSocketEvent?: any;
    itemType?: string;
    content?: string;
    newItemPlaceholder?: string;
    phase?: string;
    isFacilitator?: boolean;
    items?: RetroItem[];
    users?: RetroUser[];
    feedbackVisibility?: string;
    icon?: string;
    color?: string;
    columnColors?: any;
  }

  let {
    sendSocketEvent = (event: string, value: any) => {},
    itemType = '',
    content = $bindable(''),
    newItemPlaceholder = '',
    phase = 'brainstorm',
    isFacilitator = false,
    items = [],
    users = [],
    feedbackVisibility = 'visible',
    icon = '',
    color = 'blue',
    columnColors = {},
  }: Props = $props();

  let textareaComponent: any;

  // null when GIFs are disabled in config: no GIF button is rendered
  const gifProvider = createGifProvider(AppConfig, $locale);
  let gif = $state<Gif | null>(null);
  let showGifPicker = $state(false);

  const handleFormSubmit = (evt: Event) => {
    evt.preventDefault();

    if (content.trim() === '' && gif === null) {
      return;
    }

    sendSocketEvent(
      `create_item`,
      JSON.stringify({
        type: itemType,
        content,
        phase: phase,
        gif,
      }),
    );
    content = '';
    gif = null;
    showGifPicker = false;
    textareaComponent?.resetHeight();
  };

  const handleGifSelect = (selected: Gif) => {
    gif = selected;
    showGifPicker = false;
  };
</script>

<div class="p-3 bg-white dark:bg-gray-800 rounded-lg shadow-lg flex flex-col flex-wrap text-gray-800 dark:text-white">
  <div class="flex items-start mb-4">
    {#if icon !== ''}
      <div
        class="flex-shrink pt-1 pe-2"
        class:text-green-400={color === 'green'}
        class:dark:text-lime-400={color === 'green'}
        class:text-red-500={color === 'red'}
        class:text-blue-400={color === 'blue'}
        class:dark:text-sky-400={color === 'blue'}
        class:text-yellow-500={color === 'yellow'}
        class:dark:text-yellow-400={color === 'yellow'}
        class:text-orange-500={color === 'orange'}
        class:dark:text-orange-400={color === 'orange'}
        class:text-teal-500={color === 'teal'}
        class:dark:text-teal-400={color === 'teal'}
        class:text-indigo-500={color === 'purple'}
        class:dark:text-indigo-400={color === 'purple'}
      >
        {#if icon === 'smiley'}
          <Smile class="w-8 h-8" />
        {:else if icon === 'frown'}
          <Frown class="w-8 h-8" />
        {:else if icon === 'question'}
          <CircleQuestionMark class="w-8 h-8" />
        {:else if icon === 'angry'}
          <Angry class="w-8 h-8" />
        {/if}
      </div>
    {/if}
    <div class="flex-grow">
      <form onsubmit={handleFormSubmit} class="flex flex-col w-full min-w-0">
        <GrowingTextArea
          bind:this={textareaComponent}
          bind:value={content}
          placeholder={newItemPlaceholder}
          id="new{itemType}"
          name="new{itemType}"
          required={gif === null}
          onkeydown={(e: KeyboardEvent) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleFormSubmit(e as unknown as Event);
            }
          }}
        />

        {#if gifProvider}
          {#if gif}
            <div class="relative mt-2 self-start" data-testid="item-form-gif-preview">
              <RetroItemGif {gif} class="max-h-32" />
              <button
                type="button"
                onclick={() => (gif = null)}
                aria-label={$LL.retroGifRemove()}
                class="absolute top-1 end-1 p-0.5 rounded-full bg-white/90 dark:bg-gray-800/90 text-gray-700 dark:text-gray-200 hover:text-red-500"
                data-testid="item-form-gif-remove"
              >
                <X class="w-4 h-4" />
              </button>
            </div>
            <!-- a GIF is picked with the mouse, so a visible submit button avoids going back to the textarea -->
            <button
              type="submit"
              class="mt-2 self-end px-3 py-1 text-sm rounded bg-blue-600 text-white hover:bg-blue-700"
              data-testid="item-form-submit"
            >
              {$LL.retroGifSubmit()}
            </button>
          {:else if showGifPicker}
            <GifPicker provider={gifProvider} onselect={handleGifSelect} onclose={() => (showGifPicker = false)} />
          {:else}
            <button
              type="button"
              onclick={() => (showGifPicker = true)}
              class="mt-2 self-start inline-flex items-center gap-1 text-sm text-gray-600 dark:text-gray-300 hover:text-blue-600 dark:hover:text-sky-400"
              data-testid="item-form-gif-add"
            >
              <ImagePlus class="w-4 h-4" />
              {$LL.retroGifAdd()}
            </button>
          {/if}
        {/if}

        <button type="submit" class="hidden">submit</button>
      </form>
    </div>
  </div>
  <div class="min-w-0">
    {#each items.filter(i => i.type === itemType) as item}
      <RetroFeedbackItem {item} {phase} {users} {isFacilitator} {sendSocketEvent} {columnColors} {feedbackVisibility} />
    {/each}
  </div>
</div>
