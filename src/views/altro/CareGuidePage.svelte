<script lang="ts">
  import Page from '../../lib/ui/Page.svelte';
  import CareGuide from './care/CareGuide.svelte';

  /** Guida macchie e lavaggio in Altro (SPEC.md, sezione 8.8). */
  let { onclose }: { onclose: () => void } = $props();
</script>

<Page title="Guida macchie e lavaggio" {onclose}>
  <CareGuide />
</Page>
