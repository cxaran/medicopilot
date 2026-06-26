export interface TurnUsage {
  inputTokens: number | null;
  outputTokens: number | null;
  cachedInputTokens: number | null;
}

export const emptyTurnUsage = (): TurnUsage => ({
  inputTokens: null,
  outputTokens: null,
  cachedInputTokens: null
});
