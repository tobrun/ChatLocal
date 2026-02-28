"use client";

import { create } from "zustand";
import type { AppSettings } from "@/types";
import { DEFAULT_SETTINGS } from "@/types";

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
        set({ settings: data, loaded: true });
      }
    } catch {
      set({ loaded: true });
    }
  },

  updateSettings: async (patch) => {
    const previous = get().settings;
    set({ settings: { ...previous, ...patch } });
    try {
      await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
    } catch {
      set({ settings: previous });
    }
  },
}));
