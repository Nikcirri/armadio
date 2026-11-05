import type { ItemRecord } from '../db/types';
import { colorInfo } from './colors';
import { formatEuro } from './labels';

/** Testo pronto da incollare su Vinted o Wallapop (SPEC.md, sezione 8.5). */
export function buildListing(
  item: Pick<ItemRecord, 'name' | 'brand' | 'size' | 'colors' | 'fabrics' | 'statusNote' | 'resalePrice' | 'notes' | 'fitNote'>,
  categoryName: string,
): { title: string; description: string; text: string } {
  const colorNames = item.colors.filter((c) => c !== 'pattern').map((c) => colorInfo(c).label.toLowerCase());
  const pattern = item.colors.includes('pattern');
  const titleParts = [item.brand, item.name, item.size ? `taglia ${item.size}` : ''].filter(Boolean);
  const title = titleParts.join(' · ');
  const lines: string[] = [];
  const brand = item.brand.trim().replace(/\.+$/, '');
  lines.push(`${item.name}${brand ? ` di ${brand}` : ''}.`);
  if (categoryName) lines.push(`Categoria: ${categoryName}`);
  if (item.size) lines.push(`Taglia: ${item.size}`);
  if (colorNames.length || pattern) lines.push(`Colore: ${[...colorNames, ...(pattern ? ['fantasia'] : [])].join(', ')}`);
  if (item.fabrics.length) lines.push(`Tessuto: ${item.fabrics.join(', ')}`);
  if (item.statusNote) lines.push(`Condizioni: ${item.statusNote}`);
  if (item.fitNote) lines.push(`Vestibilità: ${item.fitNote}`);
  if (item.notes) lines.push(item.notes);
  if (item.resalePrice !== null) lines.push(`Prezzo: ${formatEuro(item.resalePrice)}`);
  lines.push('Spedizione rapida e imballaggio curato.');
  const description = lines.join('\n');
  return { title, description, text: `${title}\n\n${description}` };
}
