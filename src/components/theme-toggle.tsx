"use client";

import { useSyncExternalStore } from "react";

const STORAGE_KEY = "pam-theme";
const CHANGE_EVENT = "pam-theme-change";

function applyTheme(preference: string | null) {
  const explicit = preference === "light" || preference === "dark";
  const theme = explicit ? preference : window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.themePreference = explicit ? preference : "system";
}

function subscribe(onChange: () => void) {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const onSystemChange = () => {
    if (document.documentElement.dataset.themePreference === "system") {
      applyTheme(null);
      onChange();
    }
  };
  const onStorageChange = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY || event.key === null) {
      applyTheme(event.key === null ? null : event.newValue);
      onChange();
    }
  };
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onStorageChange);
  media.addEventListener("change", onSystemChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onStorageChange);
    media.removeEventListener("change", onSystemChange);
  };
}

function getSnapshot() {
  return document.documentElement.dataset.theme === "dark";
}

function getServerSnapshot() {
  return false;
}

export function ThemeToggle() {
  const dark = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  return (
    <label className="flex cursor-pointer items-center gap-2.5 rounded-full border border-base-300 bg-base-100 px-3 py-2 text-base-content/65">
      <svg aria-hidden="true" className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </svg>
      <input
        aria-label="Mod întunecat"
        role="switch"
        type="checkbox"
        className="toggle toggle-primary toggle-sm"
        checked={dark}
        onChange={(event) => {
          const theme = event.target.checked ? "dark" : "light";
          applyTheme(theme);
          try {
            localStorage.setItem(STORAGE_KEY, theme);
          } catch {
            // The current page still changes theme when storage is unavailable.
          }
          window.dispatchEvent(new Event(CHANGE_EVENT));
        }}
      />
      <svg aria-hidden="true" className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20.9 13.1A9 9 0 0 1 10.9 3a9 9 0 1 0 10 10.1Z" />
      </svg>
    </label>
  );
}
