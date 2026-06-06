type NotFunction<T> = T extends Function ? never : T;

export type ProviderOr<T> = T | (() => T)

export function maybeApply<T>(x: ProviderOr<NotFunction<T>>): NotFunction<T> {
  if (Object.getPrototypeOf(x) === Function) return (x as () => NotFunction<T>)()
  else return x as NotFunction<T>
}