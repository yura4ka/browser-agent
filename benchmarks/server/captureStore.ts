import type { CapturedInteraction, CaptureStore } from "./types";

export function createCaptureStore(): CaptureStore {
  const interactions: CapturedInteraction[] = [];

  return {
    add(interaction) {
      interactions.push(interaction);
    },
    list() {
      return [...interactions];
    },
    reset() {
      interactions.length = 0;
    },
  };
}
