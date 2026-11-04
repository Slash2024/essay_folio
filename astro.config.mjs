import tailwindcss from "@tailwindcss/vite";
// @ts-check
import { defineConfig } from 'astro/config';
import wix from "@wix/astro";
import wixPages from "@wix/astro-pages";

import react from "@astrojs/react";
import ssrManifest from './integrations/ssr-manifest.mjs';
import wixHostingAdapter from "@wix/astro-wix-hosting-adapter";

// https://astro.build/config
const uiPreview = process.env.FOLIO_UI_PREVIEW === '1';
const manifestGuard=ssrManifest();
const hostingAdapter=wixHostingAdapter();
const hostingBuildDone=hostingAdapter.hooks['astro:build:done'];
hostingAdapter.hooks['astro:build:done']=async params=>{
  await hostingBuildDone?.(params);
  await manifestGuard.finish();
};
export default defineConfig({
  vite: { plugins: [tailwindcss()] },
  integrations: uiPreview ? [react()] : [wix(), wixPages(), react(), manifestGuard],
  security: { checkOrigin: false },
  adapter: uiPreview ? undefined : hostingAdapter,

  image: {
    domains: ["static.wixstatic.com"],
  },

  output: "server",
});
