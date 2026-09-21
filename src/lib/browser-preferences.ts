"use client";
import { useSyncExternalStore } from "react";
const event = "verdant-preferences";
function subscribe(listener: () => void) {
  window.addEventListener("storage", listener);
  window.addEventListener(event, listener);
  return () => {
    window.removeEventListener("storage", listener);
    window.removeEventListener(event, listener);
  };
}
export function setPreference(key: string, value: string) {
  localStorage.setItem(key, value);
  window.dispatchEvent(new Event(event));
}
export function usePreference(key: string) {
  return useSyncExternalStore(
    subscribe,
    () => {
      try {
        return localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    () => null,
  );
}
