/**
 * OA-Sathi Settings Persistence Utility
 * -------------------------------------
 * Provides validated, schema-safe storage for application preferences in localStorage.
 *
 * Guarantees:
 * 1. Safe parsing with schema defaults (no crashes on corrupted JSON).
 * 2. Caches reads to avoid redundant localStorage accesses.
 * 3. Does NOT store passwords, credentials, or participant health data.
 * 4. Preserves non-demo participant records when demo data is cleared.
 */

import { type NERLanguageCode, SUPPORTED_REGIONAL_LANGUAGES } from "./regionalTerms.ts";
import { districts } from "./screeningRules.ts";

export const SETTINGS_STORAGE_KEY = "oa_sathi_app_settings_v1";

export interface AppSettings {
  preferredLanguage: NERLanguageCode;
  enablePoseOverlay: boolean;
  defaultDistrict: string;
  autoStopCameraOnSave: boolean;
  highContrastMode: boolean;
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  preferredLanguage: "en",
  enablePoseOverlay: true,
  defaultDistrict: "",
  autoStopCameraOnSave: true,
  highContrastMode: false,
};

const VALID_LANG_CODES = new Set(SUPPORTED_REGIONAL_LANGUAGES.map((l) => l.code));
const VALID_DISTRICTS = new Set(districts);

let cachedSettings: AppSettings | null = null;

/**
 * Loads validated settings from localStorage with safe fallback to defaults.
 */
export function loadAppSettings(): AppSettings {
  if (cachedSettings) {
    return { ...cachedSettings };
  }

  if (typeof window === "undefined" || !window.localStorage) {
    cachedSettings = { ...DEFAULT_APP_SETTINGS };
    return { ...DEFAULT_APP_SETTINGS };
  }

  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) {
      cachedSettings = { ...DEFAULT_APP_SETTINGS };
      return { ...DEFAULT_APP_SETTINGS };
    }

    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) {
      cachedSettings = { ...DEFAULT_APP_SETTINGS };
      return { ...DEFAULT_APP_SETTINGS };
    }

    const validated: AppSettings = {
      preferredLanguage: VALID_LANG_CODES.has(parsed.preferredLanguage)
        ? parsed.preferredLanguage
        : DEFAULT_APP_SETTINGS.preferredLanguage,
      enablePoseOverlay:
        typeof parsed.enablePoseOverlay === "boolean"
          ? parsed.enablePoseOverlay
          : DEFAULT_APP_SETTINGS.enablePoseOverlay,
      defaultDistrict:
        typeof parsed.defaultDistrict === "string" && VALID_DISTRICTS.has(parsed.defaultDistrict as any)
          ? parsed.defaultDistrict
          : DEFAULT_APP_SETTINGS.defaultDistrict,
      autoStopCameraOnSave:
        typeof parsed.autoStopCameraOnSave === "boolean"
          ? parsed.autoStopCameraOnSave
          : DEFAULT_APP_SETTINGS.autoStopCameraOnSave,
      highContrastMode:
        typeof parsed.highContrastMode === "boolean"
          ? parsed.highContrastMode
          : DEFAULT_APP_SETTINGS.highContrastMode,
    };

    cachedSettings = validated;
    return { ...validated };
  } catch {
    cachedSettings = { ...DEFAULT_APP_SETTINGS };
    return { ...DEFAULT_APP_SETTINGS };
  }
}

/**
 * Saves validated settings to localStorage without redundant writes.
 */
export function saveAppSettings(newSettings: Partial<AppSettings>): AppSettings {
  const current = loadAppSettings();
  const merged: AppSettings = {
    ...current,
    ...newSettings,
  };

  // Validate bounds
  if (!VALID_LANG_CODES.has(merged.preferredLanguage)) {
    merged.preferredLanguage = DEFAULT_APP_SETTINGS.preferredLanguage;
  }
  if (!VALID_DISTRICTS.has(merged.defaultDistrict as any) && merged.defaultDistrict !== "") {
    merged.defaultDistrict = "";
  }

  cachedSettings = merged;

  if (typeof window !== "undefined" && window.localStorage) {
    try {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(merged));
    } catch {
      // Non-blocking quota error handling
    }
  }

  return { ...merged };
}

/**
 * Resets settings back to default configuration.
 */
export function resetAppSettings(): AppSettings {
  cachedSettings = { ...DEFAULT_APP_SETTINGS };
  if (typeof window !== "undefined" && window.localStorage) {
    try {
      localStorage.removeItem(SETTINGS_STORAGE_KEY);
    } catch {
      // non-blocking
    }
  }
  return { ...DEFAULT_APP_SETTINGS };
}
