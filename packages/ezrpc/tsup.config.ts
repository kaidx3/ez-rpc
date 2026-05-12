import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    server: "src/server.ts",
    client: "src/client.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  external: ["express", "mssql", "zod", "@ez-rpc/core", "@ez-rpc/concurrency", "@ez-rpc/router", "@ez-rpc/client", "@ez-rpc/mssql"],
});
