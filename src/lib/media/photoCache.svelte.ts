// Versione di ogni foto: quando una foto viene modificata le miniature si ricaricano da sole.
export const photoVersions = $state<Record<string, number>>({});

export function bumpPhoto(id: string): void {
  photoVersions[id] = (photoVersions[id] ?? 0) + 1;
}
