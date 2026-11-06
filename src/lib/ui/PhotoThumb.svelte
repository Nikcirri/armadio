<script lang="ts">
  import { onMount } from 'svelte';
  import { db } from '../db';
  import { photoVersions } from '../media/photoCache.svelte';
  import Icon from './Icon.svelte';

  let {
    photoId,
    alt,
    kind = 'thumb',
    eager = false,
  }: { photoId: string | undefined; alt: string; kind?: 'thumb' | 'main'; eager?: boolean } = $props();

  let el: HTMLDivElement;
  let visible = $state(false);
  let url = $state<string | null>(null);

  onMount(() => {
    if (eager || typeof IntersectionObserver === 'undefined') {
      visible = true;
      return;
    }
    // Carica la miniatura solo quando entra (quasi) nello schermo.
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

<div class="thumb" bind:this={el}>
  {#if url}
    <img src={url} {alt} draggable="false" />
  {:else if !photoId}
    <!-- alt vuoto: la miniatura è decorativa (il nome è già scritto accanto). -->
    <span class="none" role={alt ? 'img' : undefined} aria-label={alt ? `${alt}: nessuna foto` : undefined} aria-hidden={alt ? undefined : 'true'}>
      <span class="ico" aria-hidden="true"><Icon name="image" size={18} /></span>
      <span class="label" aria-hidden="true">Nessuna foto</span>
    </span>
  {/if}
</div>

<style>
  .thumb {
    container-type: inline-size;
    width: 100%;
    height: 100%;
    display: grid;
    place-items: center;
    background: var(--surface-2);
    overflow: hidden;
  }
  img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    user-select: none;
  }
  .none {
    font-size: 0.75rem;
    color: var(--text-muted);
    text-align: center;
  }
  .ico {
    display: none;
  }
  /* Nelle miniature piccole basta un'icona. */
  @container (max-width: 79px) {
    .ico {
      display: grid;
    }
    .label {
      display: none;
    }
  }
</style>
