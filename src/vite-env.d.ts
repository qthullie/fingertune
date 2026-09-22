/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** URL of the hand_landmarker.task model (default: Google's CDN). */
  readonly VITE_HAND_MODEL_URL?: string;
  /** Folder holding the MediaPipe wasm binaries (default: ./mediapipe/wasm). */
  readonly VITE_MEDIAPIPE_WASM_PATH?: string;
  /** Supabase project URL for the online board (default: none, local scores only). */
  readonly VITE_SUPABASE_URL?: string;
  /** Supabase anon key. Public by design — see supabase/migrations. */
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
