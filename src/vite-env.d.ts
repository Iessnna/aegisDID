interface ImportMetaEnv {
  readonly VITE_MST_CHAIN_ID?: string;
  readonly VITE_MST_NETWORK_NAME?: string;
  readonly VITE_MST_RPC_URL?: string;
  readonly VITE_MST_EXPLORER_URL?: string;
  readonly VITE_MST_CREDENTIAL_REGISTRY_ADDRESS?: string;
  readonly VITE_MST_FAUCET_URL?: string;
  readonly VITE_MST_MIN_NATIVE_BALANCE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
