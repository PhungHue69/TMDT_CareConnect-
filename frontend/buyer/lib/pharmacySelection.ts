export function decidePharmacySelection(
  currentId: number | null,
  nextId: number,
  hasDraftOrCart: boolean,
): "select" | "reopen" | "confirm" {
  if (currentId === nextId) return "reopen";
  return currentId !== null && hasDraftOrCart ? "confirm" : "select";
}
