export {};

declare global {
  interface Window {
    ENV?: {
      API_URL?: string;
      API_BASE_URL?: string;
      RUST_WS_URL?: string;
      WS_URL?: string;
    };
  }
}
