export type Optional<T> = T | null | undefined;
export type Nullable<T> = T | null;

export type EmptyObject = Record<string, never>;

export function nullifyIfEmpty<T>(value: T | undefined): Nullable<T> {
  return value === undefined ? null : value;
}
