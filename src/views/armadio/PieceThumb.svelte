<script lang="ts">
  import { db } from '../../lib/db';
  import type { ItemRecord } from '../../lib/db/types';
  import { live } from '../../lib/state/live.svelte';
  import PhotoThumb from '../../lib/ui/PhotoThumb.svelte';

  /** Miniatura della copertina di un capo, dato solo il suo id. */
  let { itemId }: { itemId: string } = $props();

  const item = live(() => db.items.get(itemId), undefined as ItemRecord | undefined);
</script>

<PhotoThumb photoId={item.value?.photoIds[0]} alt={item.value?.name ?? 'Capo eliminato'} eager />
