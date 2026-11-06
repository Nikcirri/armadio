<script lang="ts">
  import { onMount } from 'svelte';
  import { db } from '../../lib/db';
  import { photoVersions } from '../../lib/media/photoCache.svelte';

  /** Un pezzo del collage: la foto con le sue proporzioni (o un riquadro con il nome). */
  let { photoId, name, kind = 'thumb' }: { photoId: string | undefined; name: string; kind?: 'thumb' | 'main' } = $props();

  let el: HTMLDivElement;
  let visible = $state(false);
  let url = $state<string | null>(null);

  onMount(() => {
    if (typeof IntersectionObserver === 'undefined') {
      visible = true;
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          visible = true;
          io.disconnect();
        }
      },
      { rootMargin: '300px' },
    );
    io.observe(el);
    return () => io.disconnect();
  });

  $effect(() => {
    if (!visible || !photoId) {
      url = null;
      return;
    }
    void photoVersions[photoId];
    let cancelled = false;
    let created: string | null = null;
    void db.photos.get(photoId).then((rec) => {
      if (cancelled || !rec) return;
      created = URL.createObjectURL(kind === 'main' ? rec.blob : rec.thumb);
      url = created;
    });
    return () => {
      cancelled = true;
      if (created) URL.revokeObjectURL(created);
    };
  });
</script>

<div class="piece" bind:this={el}>
  {#if url}
    <img src={url} alt={name} draggable="false" />
  {:else}
    <span class="ph" class:empty={!photoId}>{photoId ? '' : name}</span>
  {/if}
</div>

<style>
  .piece {
    width: 100%;
  }
  img {
    display: block;
    width: 100%;
    height: auto;
    border-radius: 6%;
    user-select: none;
    -webkit-user-drag: none;
    pointer-events: none;
  }
  .ph {
    display: grid;
    place-items: center;
    aspect-ratio: 3 / 4;
    border-radius: 8%;
    background: var(--surface-2);
    color: var(--text-muted);
    font-size: 0.7rem;
    text-align: center;
    padding: 4px;
    overflow: hidden;
  }
  .ph:not(.empty) {
    opacity: 0.6;
  }
</style>
