/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CLIENT_ID?: string;
  readonly VITE_PROXY?: string;
  readonly VITE_REPO_OWNER?: string;
  readonly VITE_REPO_NAME?: string;
  readonly VITE_ADMIN?: string;
}
