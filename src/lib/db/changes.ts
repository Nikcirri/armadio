import type { ArmadioDB } from './schema';
import { TRACKED_TABLES } from './schema';
import type { SettingsMap } from './types';

/**
 * Conta le modifiche ai dati per il promemoria backup (SPEC.md, sezione 10).
 * Le operazioni di massa (ripristino, esempio, svuota) si eseguono dentro `withoutTracking`.
 */
export class ChangeTracker {
  private pending = 0;
  private suspended = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly db: ArmadioDB,
    private readonly delayMs = 800,
  ) {
    const bump = () => this.bump();
    for (const name of TRACKED_TABLES) {
      const table = db.table(name);
      table.hook('creating', bump);
      table.hook('updating', bump);
      table.hook('deleting', bump);
    }
  }

  private bump(): void {
    if (this.suspended > 0) return;
    this.pending += 1;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), this.delayMs);
  }

  /** Scrive subito le modifiche in sospeso. */
  async flush(): Promise<void> {
    clearTimeout(this.timer);
    const n = this.pending;
    this.pending = 0;
    if (n === 0) return;
    await this.db.transaction('rw', this.db.settings, async () => {
      const rec = await this.db.settings.get('backup');
      if (!rec) return;
      const value = rec.value as SettingsMap['backup'];
      await this.db.settings.put({
        key: 'backup',
        value: { ...value, changesSinceBackup: value.changesSinceBackup + n },
      });
    });
  }

  /** Esegue `fn` senza contare le modifiche (ripristino, esempio, svuota tutto). */
  async withoutTracking<T>(fn: () => Promise<T>): Promise<T> {
    this.suspended += 1;
    try {
      return await fn();
    } finally {
      this.suspended -= 1;
    }
  }

  /** Azzera il conteggio (dopo un backup riuscito o un ripristino). */
  discardPending(): void {
    clearTimeout(this.timer);
    this.pending = 0;
  }
}
