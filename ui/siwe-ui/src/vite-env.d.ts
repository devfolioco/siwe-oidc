/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_INFURA_ID: string;
  readonly VITE_WALLET_CONNECT_ID: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
