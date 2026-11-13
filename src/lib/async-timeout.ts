/** Resolve with a fallback if `promise` takes longer than `ms`. Does not reject. */
export function withTimeoutFallback<T>(
  promise: PromiseLike<T>,
  ms: number,
  fallback: T,
  label?: string,
): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      if (label) console.warn(`timeout ${label} after ${ms}ms`);
      resolve(fallback);
    }, ms);
    Promise.resolve(promise).then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        if (label) console.warn(`failed ${label}`, err);
        resolve(fallback);
      },
    );
  });
}
