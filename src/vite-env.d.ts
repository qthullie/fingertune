/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** URL du modele hand_landmarker.task (defaut : CDN Google). */
  readonly VITE_HAND_MODEL_URL?: string;
  /** Dossier contenant les binaires wasm de MediaPipe (defaut : ./mediapipe/wasm). */
  readonly VITE_MEDIAPIPE_WASM_PATH?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
