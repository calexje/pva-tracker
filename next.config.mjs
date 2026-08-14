import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

/** @type {import('next').NextConfig} */
export default {
  // Pin the workspace root. A package-lock.json exists in a parent directory,
  // which makes Next infer the root as the home directory and ignore this
  // project's own lockfile when tracing files.
  turbopack: { root: dirname(fileURLToPath(import.meta.url)) },
};
