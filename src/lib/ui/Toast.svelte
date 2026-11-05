<script lang="ts">
  let { message }: { message: string | null } = $props();
</script>

{#if message}
  <div class="toast" role="status" aria-live="polite">{message}</div>
{/if}

<style>
  .toast {
    position: fixed;
    left: 50%;
    bottom: calc(var(--navbar-h) + var(--safe-bottom) + 16px);
    transform: translateX(-50%);
    max-width: calc(100% - 32px);
    padding: 12px 18px;
    border-radius: 12px;
    background: var(--text);
    color: var(--bg);
    font-size: 0.9375rem;
    box-shadow: 0 6px 24px rgb(0 0 0 / 0.18);
    z-index: 50;
    animation: in 160ms ease-out;
  }
  @keyframes in {
    from {
      opacity: 0;
      transform: translate(-50%, 8px);
    }
  }
</style>
