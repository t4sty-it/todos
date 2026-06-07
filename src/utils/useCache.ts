export const useCache = <T>(builder: () => T) => {
  let cache: T | undefined = undefined
  let built = false

  return () => {
    if (!built) {
      built = true
      cache = builder()
    } 
    return cache as T
  }
}