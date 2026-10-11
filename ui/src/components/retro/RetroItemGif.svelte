<script lang="ts">
  import type { RetroItemGif } from '../../types/retro';

  interface Props {
    gif: RetroItemGif;
    class?: string;
  }

  let { gif, class: klass = 'max-h-48' }: Props = $props();
</script>

<!-- draggable=false avoids a native image drag conflicting with the group phase drag and drop -->
<img
  src={gif.url}
  alt={gif.title || 'GIF'}
  title={gif.title}
  width={gif.width}
  height={gif.height}
  loading="lazy"
  draggable="false"
  referrerpolicy="no-referrer"
  class="{klass} max-w-full w-auto h-auto rounded-md"
  data-testid="retro-item-gif"
/>
