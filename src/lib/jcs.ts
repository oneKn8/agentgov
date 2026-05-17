export function canonicalize(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortValue);
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = sortValue(record[key]);
        return acc;
      }, {});
  }

  return value;
}

export function withoutSignature<T extends Record<string, unknown>>(value: T): Omit<T, "signature" | "signatures"> {
  const copy = { ...value };
  delete copy.signature;
  delete copy.signatures;
  return copy;
}
