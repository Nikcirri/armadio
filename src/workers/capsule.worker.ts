/// <reference lib="webworker" />
import { capsuleScore, type CapsuleItem } from '../lib/logic/stats';

// Capsule score in un worker: con tanti capi il conteggio non blocca l'interfaccia (SPEC 8.5).

interface CapsuleRequest {
  items: CapsuleItem[];
  matrix: [string, string][];
  limit: number;
}

self.onmessage = (e: MessageEvent<CapsuleRequest>) => {
  const { items, matrix, limit } = e.data;
  self.postMessage(capsuleScore(items, matrix, limit));
};
