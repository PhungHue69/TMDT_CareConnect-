export type AddressSuggestion = { place_id: string; description: string };

export function shouldAutoChoose(suggestions: AddressSuggestion[]): AddressSuggestion | null {
  return suggestions.length === 1 ? suggestions[0] : null;
}

/** Increment when input or another location source changes so late responses cannot overwrite it. */
export class AddressLookup {
  private version = 0;

  start(address: string): number | null {
    const version = ++this.version;
    return address.trim().length >= 2 ? version : null;
  }

  invalidate(): void {
    this.version++;
  }

  isCurrent(version: number | null): boolean {
    return version !== null && version === this.version;
  }
}
