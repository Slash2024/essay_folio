import { readFile, writeFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

// Astro injects its serialized manifest before adapter build post-hooks. A
// Cloudflare post-hook can re-emit the pre-injection chunk. Restore only that
// literal token using the manifest supplied by Astro's own public build hook.
export default function ssrManifest() {
  let manifest;
  let serverDir;
  return {
    name: 'folio-ssr-manifest',
    hooks: {
      'astro:config:done': ({ config }) => { serverDir=fileURLToPath(config.build.server); },
      'astro:build:ssr': ({ manifest: value }) => { manifest=value; },
    },
    finish: async () => {
        async function visit(dir) {
          for (const entry of await readdir(dir,{withFileTypes:true})) {
            const path=join(dir,entry.name);
            if (entry.isDirectory()) { await visit(path); continue; }
            if (!/\.m?js$/.test(entry.name)) continue;
            const code=await readFile(path,'utf8');
            const token=/['"`]@@ASTRO_MANIFEST_REPLACE@@['"`]/g;
            if (!token.test(code)) continue;
            if (!manifest?.rootDir || !manifest?.key) throw new Error('SSR manifest was not supplied by Astro');
            await writeFile(path,code.replace(token,()=>JSON.stringify(manifest)));
            console.log('[folio-ssr-manifest] Restored Astro manifest in '+entry.name);
          }
        }
        await visit(serverDir);
    },
  };
}
