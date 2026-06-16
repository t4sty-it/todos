export const useCache = <T>(builder: () => Promise<T>): (() => Promise<T>) => {
  let cache: Promise<T> | undefined = undefined
  return () => cache ?? (cache = builder())
}
