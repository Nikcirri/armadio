import { describe, expect, it } from 'vitest';
import { isNewer, parseRelease, parseVersion, releaseNotes, shouldAutoCheck } from './updates';

describe('controllo aggiornamenti', () => {
  it('confronta le versioni', () => {
    expect(parseVersion('v1.2.3')).toEqual([1, 2, 3]);
    expect(parseVersion('1.2')).toBeNull();
    expect(isNewer('v1.0.0', '0.8.0')).toBe(true);
    expect(isNewer('0.10.0', '0.9.5')).toBe(true);
    expect(isNewer('1.0.0', '1.0.0')).toBe(false);
    expect(isNewer('0.9.0', '1.0.0')).toBe(false);
    expect(isNewer('boh', '1.0.0')).toBe(false);
  });

  it('legge la Release di GitHub', () => {
    const r = parseRelease({
      tag_name: 'v1.0.0',
      html_url: 'https://github.com/x/releases/tag/v1.0.0',
      body: '\n## [1.0.0]\n- Prima novità\n- Seconda\ntesto\n',
      assets: [{ name: 'note.txt', browser_download_url: 'a' }, { name: 'Armadio-v1.0.0.apk', browser_download_url: 'https://x/a.apk' }],
    });
    expect(r).toEqual({ version: '1.0.0', apkUrl: 'https://x/a.apk', pageUrl: 'https://github.com/x/releases/tag/v1.0.0', notes: ['Prima novità', 'Seconda'] });
    expect(parseRelease({ tag_name: 'latest' })).toBeNull();
    expect(parseRelease(null)).toBeNull();
    expect(parseRelease({ tag_name: 'v1.0.1' })?.apkUrl).toBeNull();
    expect(releaseNotes('- a\n- b\n- c', 2)).toEqual(['a', 'b']);
    expect(releaseNotes('- **Wishlist**: desideri con foto\n- ' + 'x'.repeat(120))).toEqual(['Wishlist', 'x'.repeat(89) + '…']);
  });

  it('controlla in silenzio al massimo una volta al giorno', () => {
    const now = new Date('2026-11-06T10:00:00Z');
    expect(shouldAutoCheck(null, now)).toBe(true);
    expect(shouldAutoCheck('2026-11-06T01:00:00Z', now)).toBe(false);
    expect(shouldAutoCheck('2026-11-05T09:00:00Z', now)).toBe(true);
    expect(shouldAutoCheck('rotto', now)).toBe(true);
  });
});
