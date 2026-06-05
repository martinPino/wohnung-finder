import { useState, useEffect, useCallback } from "react";

/**
 * Persists state to localStorage under the given key.
 * Falls back to `initialValue` if nothing is stored yet or parsing fails.
 * SSR-safe: reads from localStorage only after mount.
 */
export function useLocalStorage<T>(
  key: string,
  initialValue: T
): [T, (value: T | ((prev: T) => T)) => void, () => void] {
  const [storedValue, setStoredValue] = useState<T>(initialValue);
  const [hydrated, setHydrated] = useState(false);

  // Hydrate from localStorage after first render (avoids SSR mismatch)
  useEffect(() => {
    try {
      const item = window.localStorage.getItem(key);
      if (item !== null) {
        setStoredValue(JSON.parse(item) as T);
      }
    } catch (err) {
      console.warn(`[useLocalStorage] Failed to read key "${key}":`, err);
    }
    setHydrated(true);
  }, [key]);

  const setValue = useCallback(
    (value: T | ((prev: T) => T)) => {
      try {
        setStoredValue((prev) => {
          const next = value instanceof Function ? value(prev) : value;
          window.localStorage.setItem(key, JSON.stringify(next));
          return next;
        });
      } catch (err) {
        console.warn(`[useLocalStorage] Failed to write key "${key}":`, err);
      }
    },
    [key]
  );

  const clearValue = useCallback(() => {
    try {
      window.localStorage.removeItem(key);
      setStoredValue(initialValue);
    } catch (err) {
      console.warn(`[useLocalStorage] Failed to clear key "${key}":`, err);
    }
  }, [key, initialValue]);

  return [hydrated ? storedValue : initialValue, setValue, clearValue];
}
