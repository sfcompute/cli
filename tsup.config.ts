import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs"],
  target: "node20",
  platform: "node",
  outDir: "dist",
  clean: true,
  shims: true,
  treeshake: true,
  noExternal: [/.*/], // Bundle ALL dependencies
  define: {
    "process.env.NODE_ENV": '"production"',
  },
  esbuildOptions(options) {
    options.bundle = true;
    options.alias = {
      "react-devtools-core": "./src/stubs/react-devtools-core.ts",
    };
  },
});
