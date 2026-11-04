import { secrets } from '@wix/secrets';
import { auth } from '@wix/essentials';
const getSecret = auth.elevate(secrets.getSecretValue);
export async function secret(name: 'ESSAY_ACCESS'|'ESSAY_BARK_KEY') { const r = await getSecret(name); if (!r.value) throw new Error('服务端配置暂不可用'); return r.value; }
export async function accessConfig(): Promise<{code:string;signing:string}> { return JSON.parse(await secret('ESSAY_ACCESS')); }
const bytes = new TextEncoder();
function b64(buf: ArrayBuffer) { return btoa(String.fromCharCode(...new Uint8Array(buf))).replaceAll('+','-').replaceAll('/','_').replaceAll('=',''); }
async function sign(message:string,key:string) { const k=await crypto.subtle.importKey('raw',bytes.encode(key),{name:'HMAC',hash:'SHA-256'},false,['sign']);return b64(await crypto.subtle.sign('HMAC',k,bytes.encode(message))); }
export function equal(a:string,b:string) { const x=bytes.encode(a),y=bytes.encode(b);let d=x.length^y.length;for(let i=0;i<Math.max(x.length,y.length);i++) d|=(x[i]||0)^(y[i]||0);return d===0; }
export async function makeSession(key:string) { const value=`${Date.now()+30*86400000}.${crypto.randomUUID()}`;return `${value}.${await sign(value,key)}`; }
export async function authorized(request: Request) { const token=request.headers.get('cookie')?.split(';').map(s=>s.trim()).find(s=>s.startsWith('folio_session='))?.slice(14);if(!token)return false;const [expiry,nonce,sig]=token.split('.');if(!sig||Number(expiry)<Date.now())return false;const cfg=await accessConfig();return equal(sig,await sign(`${expiry}.${nonce}`,cfg.signing)); }
// Wix's backend request URL is an internal hosting address, not the public origin.
export const SITE_ORIGIN='https://headless-dvpmxjtmvvv-y97m7z9bm2-140a.wix-site-host.com';
export function sameOrigin(request:Request) { const origin=request.headers.get('origin');return !origin||origin===SITE_ORIGIN; }
