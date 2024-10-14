export type Optional<T> = T | null | undefined;
export type Nullable<T> = T | null;

export type EmptyObject = Record<string, never>;

// --

export const isEmptyObject = (obj: unknown): boolean => {
  return !!obj && Object.keys(obj).length === 0 && obj.constructor === Object;
};

export const isEmptyArray = (arr: unknown[]): boolean => {
  return !!arr && Array.isArray(arr) && arr.length === 0;
};

export const isEmpty = (value: unknown): boolean => {
  return (
    (value === null ||
      value === undefined ||
      value === "" ||
      isEmptyObject(value) ||
      isEmptyArray(value as unknown[])) &&
    value !== false
  );
};
