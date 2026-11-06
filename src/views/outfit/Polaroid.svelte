<script lang="ts">
  import PhotoThumb from '../../lib/ui/PhotoThumb.svelte';

  /** Foto del diario in cornice polaroid, leggermente inclinata. */
  let { photoId, index = 0, alt = 'Foto del ricordo' }: { photoId: string; index?: number; alt?: string } = $props();
  const tilt = [-2.5, 1.8, -1.2, 2.4, -0.8, 1.2];
</script>

<span class="polaroid" style:rotate="{tilt[index % tilt.length]}deg">
  <span class="photo"><PhotoThumb {photoId} {alt} /></span>
</span>

<style>
  .polaroid {
    display: block;
    padding: 6px 6px 18px;
    background: #fbfaf7;
    border-radius: 3px;
    box-shadow: 0 2px 8px rgb(0 0 0 / 0.18);
  }
  .photo {
    display: block;
    aspect-ratio: 1;
    overflow: hidden;
    background: #ddd;
  }
  .photo :global(img) {
    object-fit: cover;
  }
</style>
