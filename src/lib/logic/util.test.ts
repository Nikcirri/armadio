import { describe, expect, it } from 'vitest';
import { addDays, daysBetween, fileStamp, fromDateKey, newId, toDateKey } from './util';

describe('date', () => {
  it('converte avanti e indietro senza spostare il giorno', () => {
    expect(toDateKey(fromDateKey('2026-03-29'))).toBe('2026-03-29');
  });

  it('aggiunge giorni attraverso il cambio di mese e di ora legale', () => {
    expect(addDays('2026-03-28', 2)).toBe('2026-03-30');
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
  });

  it('conta i giorni tra due date', () => {
    expect(daysBetween('2026-11-01', '2026-11-15')).toBe(14);
    expect(daysBetween('2026-11-15', '2026-11-01')).toBe(-14);
  });

  it('crea un timbro per i nomi dei file', () => {
    expect(fileStamp(new Date(2026, 10, 5, 9, 7))).toBe('2026-11-05-0907');
  });

  it('crea id diversi', () => {
    expect(newId()).not.toBe(newId());
  });
});
