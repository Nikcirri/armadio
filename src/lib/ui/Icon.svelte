<script lang="ts" module>
  export type IconName =
    | 'back'
    | 'more'
    | 'chevron'
    | 'up'
    | 'down'
    | 'plus'
    | 'trash'
    | 'check'
    | 'close'
    | 'settings'
    | 'tag'
    | 'save'
    | 'info'
    | 'upload'
    | 'download'
    | 'sparkles'
    | 'heart'
    | 'heartFilled'
    | 'share'
    | 'image'
    | 'calendar'
    | 'edit'
    | 'copy'
    | 'move'
    | 'camera'
    | 'pin'
    | 'alert';
</script>

<script lang="ts">
  let { name, size = 24 }: { name: IconName; size?: number } = $props();
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="1.8"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
>
  {#if name === 'back'}
    <path d="M15 18l-6-6 6-6" />
  {:else if name === 'more'}
    <circle cx="12" cy="5" r="1.3" /><circle cx="12" cy="12" r="1.3" /><circle cx="12" cy="19" r="1.3" />
  {:else if name === 'chevron'}
    <path d="M9 18l6-6-6-6" />
  {:else if name === 'up'}
    <path d="M18 15l-6-6-6 6" />
  {:else if name === 'down'}
    <path d="M6 9l6 6 6-6" />
  {:else if name === 'plus'}
    <path d="M12 5v14M5 12h14" />
  {:else if name === 'trash'}
    <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" />
  {:else if name === 'check'}
    <path d="M20 6 9 17l-5-5" />
  {:else if name === 'close'}
    <path d="M18 6 6 18M6 6l12 12" />
  {:else if name === 'settings'}
    <circle cx="12" cy="12" r="3" />
    <path
      d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"
    />
  {:else if name === 'tag'}
    <path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z" />
    <circle cx="7.5" cy="7.5" r="1.2" />
  {:else if name === 'save'}
    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
    <path d="M17 21v-8H7v8M7 3v5h8" />
  {:else if name === 'info'}
    <circle cx="12" cy="12" r="9" /><path d="M12 16v-4M12 8h.01" />
  {:else if name === 'upload'}
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />
  {:else if name === 'download'}
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
  {:else if name === 'sparkles'}
    <path d="M12 3l1.9 5.2L19 10l-5.1 1.8L12 17l-1.9-5.2L5 10l5.1-1.8L12 3z" />
  {:else if name === 'heart' || name === 'heartFilled'}
    <path
      fill={name === 'heartFilled' ? 'currentColor' : 'none'}
      d="M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l7 7z"
    />
  {:else if name === 'share'}
    <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
    <path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" />
  {:else if name === 'image'}
    <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="9" cy="9" r="2" />
    <path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21" />
  {:else if name === 'calendar'}
    <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" />
  {:else if name === 'edit'}
    <path d="M21.2 6.8a2.8 2.8 0 0 0-4-4L3.8 16.2a2 2 0 0 0-.5.8l-1.3 4.4a.5.5 0 0 0 .6.6l4.4-1.3a2 2 0 0 0 .8-.5z" />
  {:else if name === 'copy'}
    <rect x="8" y="8" width="14" height="14" rx="2" /><path d="M4 16a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2" />
  {:else if name === 'move'}
    <path d="M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20" />
  {:else if name === 'camera'}
    <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z" />
    <circle cx="12" cy="13" r="3" />
  {:else if name === 'pin'}
    <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z" /><circle cx="12" cy="10" r="3" />
  {:else}
    <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01" />
  {/if}
</svg>
