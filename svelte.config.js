import adapter from "@sveltejs/adapter-static";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    // Static build in build/, ready for GitHub Pages.
    adapter: adapter({ fallback: undefined }),
    // Set BASE_PATH=/voidspark when publishing to a GitHub Pages project site.
    paths: { base: process.env.BASE_PATH ?? "" },
  },
};

export default config;
