/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Solo desarrollo: credenciales del usuario de prueba para el acceso rápido del login. */
  readonly VITE_DEV_LOGIN_EMAIL?: string;
  readonly VITE_DEV_LOGIN_PASSWORD?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
