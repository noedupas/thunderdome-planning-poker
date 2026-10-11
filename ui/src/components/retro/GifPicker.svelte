<script lang="ts">
  import { onDestroy } from 'svelte';
  import { X } from '@lucide/svelte';
  import LL from '../../i18n/i18n-svelte';
  import { GifRateLimitError } from '../../gif';
  import type { GifProvider, GifSearchResult } from '../../gif';
  import type { RetroItemGif } from '../../types/retro';

  interface Props {
    provider: GifProvider;
    onselect: (gif: RetroItemGif) => void;
    onclose: () => void;
    debounceMs?: number;
  }

  let { provider, onselect, onclose, debounceMs = 600 }: Props = $props();

  // Saves the provider quota (100 calls per hour with free keys): no search on open, nor for 1 character
  const MIN_QUERY_LENGTH = 2;

  let query = $state('');
  let results = $state<GifSearchResult[]>([]);
  let nextPage = $state<number | null>(null);
  let status = $state<'idle' | 'loading' | 'error' | 'rate-limited'>('idle');
  let searched = $state(false);

  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  let controller: AbortController | undefined;

  async function runSearch(page: number) {
    controller?.abort();
    controller = new AbortController();
    status = 'loading';

    try {
      const res = await provider.search(query.trim(), { page, signal: controller.signal });
      results = page === 1 ? res.results : [...results, ...res.results];
      nextPage = res.nextPage;
      searched = true;
      status = 'idle';
    } catch (e) {
      if ((e as Error).name === 'AbortError') {
        return;
      }
      status = e instanceof GifRateLimitError ? 'rate-limited' : 'error';
    }
  }

  function handleInput() {
    clearTimeout(debounceTimer);
    if (query.trim().length < MIN_QUERY_LENGTH) {
      controller?.abort();
      results = [];
      nextPage = null;
      searched = false;
      status = 'idle';
      return;
    }
    debounceTimer = setTimeout(() => runSearch(1), debounceMs);
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      onclose();
    }
  }

  onDestroy(() => {
    clearTimeout(debounceTimer);
    controller?.abort();
  });
</script>

<div
  class="mt-2 p-2 rounded-md border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900"
  data-testid="gif-picker"
>
  <div class="flex items-center gap-2 mb-2">
    <!-- svelte-ignore a11y_autofocus -->
    <input
      type="search"
      bind:value={query}
      oninput={handleInput}
      onkeydown={handleKeydown}
      placeholder={$LL.retroGifSearchPlaceholder()}
      aria-label={$LL.retroGifSearchPlaceholder()}
      class="flex-grow min-w-0 px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800"
      data-testid="gif-picker-search"
      autofocus
    />
    <button
      type="button"
      onclick={onclose}
      aria-label={$LL.retroGifClose()}
      class="text-gray-500 hover:text-red-500"
      data-testid="gif-picker-close"
    >
      <X class="w-5 h-5" />
    </button>
  </div>

  {#if status === 'rate-limited'}
    <p class="text-sm text-amber-600 dark:text-amber-400" data-testid="gif-picker-rate-limited">
      {$LL.retroGifRateLimited()}
    </p>
  {:else if status === 'error'}
    <p class="text-sm text-red-600 dark:text-red-400" data-testid="gif-picker-error">{$LL.retroGifSearchError()}</p>
  {:else if searched && results.length === 0 && status === 'idle'}
    <p class="text-sm text-gray-500" data-testid="gif-picker-empty">{$LL.retroGifSearchNoResults()}</p>
  {/if}

  {#if results.length > 0}
    <div class="grid grid-cols-2 gap-1 max-h-64 overflow-y-auto" data-testid="gif-picker-results">
      {#each results as result (result.id)}
        <button
          type="button"
          onclick={() => onselect(result.gif)}
          class="block rounded overflow-hidden focus:outline-none focus:ring-2 focus:ring-blue-500"
          title={result.title}
          data-testid="gif-picker-result"
        >
          <img
            src={result.previewUrl}
            alt={result.title || 'GIF'}
            width={result.previewWidth}
            height={result.previewHeight}
            loading="lazy"
            referrerpolicy="no-referrer"
            class="w-full h-auto"
          />
        </button>
      {/each}
    </div>
    {#if nextPage !== null}
      <button
        type="button"
        onclick={() => runSearch(nextPage!)}
        disabled={status === 'loading'}
        class="mt-2 w-full text-sm text-blue-600 dark:text-sky-400 hover:underline disabled:opacity-50"
        data-testid="gif-picker-more"
      >
        {$LL.retroGifLoadMore()}
      </button>
    {/if}
  {/if}

  <!-- Attribution is required by GIPHY and KLIPY wherever their API is used -->
  <a
    href={provider.attribution.url}
    target="_blank"
    rel="noopener noreferrer"
    class="block mt-2 text-xs text-end text-gray-500 hover:underline"
    data-testid="gif-picker-attribution"
  >
    {provider.attribution.label}
  </a>
</div>
