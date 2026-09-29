// Build-time constants normally injected by esbuild.
(globalThis as unknown as { __DEV__: boolean; __E2E__: boolean }).__DEV__ = true;
(globalThis as unknown as { __DEV__: boolean; __E2E__: boolean }).__E2E__ = false;
