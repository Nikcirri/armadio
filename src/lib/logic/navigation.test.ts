import { describe, expect, it } from 'vitest';
import { EXIT_WINDOW_MS, TABS, decideBack, popTab, pushTab } from './navigation';

describe('decideBack', () => {
  it('chiude prima il foglio aperto', () => {
    expect(decideBack({ overlayOpen: true, historyLength: 3, lastBackPressAt: null, now: 0 })).toBe(
      'close-overlay',
    );
  });

  it('torna alla scheda precedente se c’è cronologia', () => {
    expect(decideBack({ overlayOpen: false, historyLength: 2, lastBackPressAt: null, now: 0 })).toBe(
      'previous-tab',
    );
  });

  it('alla prima pressione chiede conferma di uscita', () => {
    expect(decideBack({ overlayOpen: false, historyLength: 1, lastBackPressAt: null, now: 5000 })).toBe(
      'confirm-exit',
    );
  });

  it('esce con la seconda pressione entro la finestra', () => {
    expect(
      decideBack({ overlayOpen: false, historyLength: 1, lastBackPressAt: 1000, now: 1000 + EXIT_WINDOW_MS }),
    ).toBe('exit');
  });

  it('chiede di nuovo conferma se la seconda pressione arriva tardi', () => {
    expect(
      decideBack({ overlayOpen: false, historyLength: 1, lastBackPressAt: 1000, now: 1001 + EXIT_WINDOW_MS }),
    ).toBe('confirm-exit');
  });
});

describe('cronologia delle schede', () => {
  it('non duplica la scheda corrente', () => {
    expect(pushTab(['armadio'], 'armadio')).toEqual(['armadio']);
  });

  it('sposta in fondo una scheda già visitata', () => {
    expect(pushTab(['armadio', 'outfit', 'agenda'], 'outfit')).toEqual(['armadio', 'agenda', 'outfit']);
  });

  it('lascia sempre almeno una scheda', () => {
    expect(popTab(['armadio'])).toEqual(['armadio']);
    expect(popTab(['armadio', 'outfit'])).toEqual(['armadio']);
  });

  it('ha esattamente 5 schede con id unici', () => {
    expect(TABS).toHaveLength(5);
    expect(new Set(TABS.map((t) => t.id)).size).toBe(5);
  });
});
