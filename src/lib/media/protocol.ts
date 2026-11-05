import type { ColorId } from '../db/types';

/** Messaggi tra l'app e il worker delle immagini. */
export type WorkerRequest =
  | { id: number; op: 'decode'; blob: Blob; maxSide: number }
  | { id: number; op: 'encode'; width: number; height: number; buffer: ArrayBuffer; mainMax: number; thumbMax: number }
  | { id: number; op: 'colors'; width: number; height: number; buffer: ArrayBuffer }
  | { id: number; op: 'floodFill'; width: number; height: number; buffer: ArrayBuffer; tolerance: number };

export interface DecodeResult {
  width: number;
  height: number;
  buffer: ArrayBuffer;
}

export interface EncodeResult {
  blob: Blob;
  thumb: Blob;
  width: number;
  height: number;
}

export type WorkerResultMap = {
  decode: DecodeResult;
  encode: EncodeResult;
  colors: ColorId[];
  floodFill: ArrayBuffer;
};

export type WorkerResponse =
  | { id: number; ok: true; result: unknown }
  | { id: number; ok: false; error: string };
