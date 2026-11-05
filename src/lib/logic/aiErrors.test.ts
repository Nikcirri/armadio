import { describe, expect, it } from 'vitest';
import { isAiModuleAlreadyInstalled, isAiModuleMissing } from './aiErrors';

describe('errori dello scontorno AI', () => {
  it('riconosce il modulo già installato (non è un errore)', () => {
    const msg = 'The Google Subject Segmentation Module is already installed.';
    expect(isAiModuleAlreadyInstalled(msg)).toBe(true);
    expect(isAiModuleMissing(msg)).toBe(false);
  });

  it('riconosce il modulo mancante', () => {
    expect(isAiModuleMissing('MlKitException: Waiting for the subject segmentation optional module to be downloaded. Please wait.')).toBe(true);
    expect(isAiModuleMissing('MlKitException: Subject segmentation module is not available')).toBe(true);
    expect(isAiModuleMissing('Feature is unavailable')).toBe(true);
  });

  it('non confonde altri errori', () => {
    expect(isAiModuleMissing('Immagine non leggibile')).toBe(false);
    expect(isAiModuleMissing('Memoria insufficiente per lo scontorno')).toBe(false);
  });
});
