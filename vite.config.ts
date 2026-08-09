import vinext from "vinext";
import { defineConfig, type Plugin } from "vite";
import hostingConfig from "./.openai/hosting.json";
import { sites } from "./build/sites-vite-plugin";

const SITE_CREATOR_PLACEHOLDER_DATABASE_ID =
  "00000000-0000-4000-8000-000000000000";

const { d1, r2 } = hostingConfig;

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";

const dependencyDiscoveryGuard: Plugin = {
  name: "knowledge-network-dependency-discovery-guard",
  apply: "serve",
  enforce: "post",
  configEnvironment(_name, config) {
    config.optimizeDeps ??= {};
    config.optimizeDeps.noDiscovery = true;
  },
};

const localBindingConfig = {
  main: "./worker/index.ts",
  compatibility_flags: ["nodejs_compat"],
  d1_databases: d1
    ? [
        {
          binding: d1,
          database_name: "site-creator-d1",
          database_id: SITE_CREATOR_PLACEHOLDER_DATABASE_ID,
        },
      ]
    : [],
  r2_buckets: r2
    ? [
        {
          binding: r2,
          bucket_name: "site-creator-r2",
        },
      ]
    : [],
};

export default defineConfig(async () => {
  // Keep Wrangler and Miniflare state project-local. These are non-secret tool
  // settings; application environment belongs in ignored `.env*` files.
  process.env.WRANGLER_WRITE_LOGS ??= "false";
  process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";
  process.env.MINIFLARE_REGISTRY_PATH ??= ".wrangler/registry";

  // Wrangler snapshots its log path while the Cloudflare plugin is imported.
  const { cloudflare } = await import("@cloudflare/vite-plugin");

  return {
    // The repository contains a large, user-owned corpus. Pre-bundling should
    // follow imports from the active route instead of crawling that corpus.
    optimizeDeps: {
      noDiscovery: true,
    },
    environments: {
      client: { optimizeDeps: { noDiscovery: true } },
      rsc: { optimizeDeps: { noDiscovery: true } },
      ssr: { optimizeDeps: { noDiscovery: true } },
    },
    server: {
      port: 4317,
      strictPort: true,
      watch: {
        ignored: ["**/notegraph-studio/**", "**/*.icloud-placeholder"],
        ...(isCodexSeatbeltSandbox
          ? { useFsEvents: false, usePolling: true }
          : {}),
      },
    },
    plugins: [
      vinext(),
      sites(),
      cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        config: localBindingConfig,
      }),
      dependencyDiscoveryGuard,
    ],
  };
});
