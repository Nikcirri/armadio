import type { ItemRecord } from '../db/types';
import { CAPSULE_LIMIT, capsuleScore, type CapsuleItem, type CapsuleResult } from '../logic/stats';

/** Calcola il capsule score nel worker (o qui, se il worker non è disponibile). */
export function computeCapsule(items: readonly ItemRecord[], matrix: readonly (readonly [string, string])[]): Promise<CapsuleResult> {
  const slim: CapsuleItem[] = items.map((i) => ({ id: i.id, slotType: i.slotType, occasions: [...i.occasions], status: i.status }));
  const pairs = matrix.map((p): [string, string] => [p[0], p[1]]);
  if (typeof Worker === 'undefined') return Promise.resolve(capsuleScore(slim, pairs, CAPSULE_LIMIT));
  return new Promise((resolve) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL('../../workers/capsule.worker.ts', import.meta.url), { type: 'module' });
    } catch {
      resolve(capsuleScore(slim, pairs, CAPSULE_LIMIT));
      return;
    }
    worker.onmessage = (e: MessageEvent<CapsuleResult>) => {
      resolve(e.data);
      worker.terminate();
    };
    worker.onerror = () => {
      worker.terminate();
      resolve(capsuleScore(slim, pairs, CAPSULE_LIMIT));
    };
    worker.postMessage({ items: slim, matrix: pairs, limit: CAPSULE_LIMIT });
  });
}
