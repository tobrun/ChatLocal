"use client";

import { create } from "zustand";
import type { AppSettings } from "@/types";
import { DEFAULT_SETTINGS } from "@/types";

function applyTheme(theme: "light" | "dark") {
  document.documentElement.classList.toggle("dark", theme === "dark");
  localStorage.setItem("theme", theme);
}

interface SettingsStore {
  settings: AppSettings;
  loaded: boolean;
  fetchSettings: () => Promise<void>;
  updateSettings: (patch: Partial<AppSettings>) => Promise<void>;
}

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  loaded: false,

  fetchSettings: async () => {
    try {
      const res = await fetch("/api/settings");
      if (res.ok) {
        const data = await res.json();
        applyTheme(data.theme ?? "dark");
        set({ settings: data, loaded: true });
      }
    } catch {
      set({ loaded: true });
    }
  },

  updateSettings: async (patch) => {
    const previous = get().settings;
    const next = { ...previous, ...patch };
    set({ settings: next });
    if (patch.theme) applyTheme(patch.theme);
    try {
      await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
    } catch {
      set({ settings: previous });
      if (patch.theme) applyTheme(previous.theme);
    }
  },
}));
