import { readFileSync } from 'node:fs';

const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
const apiRewrite = config.rewrites.find(({ source }) => source === '/api/v1/:path*');

if (!apiRewrite) throw new Error('Missing the Vercel API rewrite');

const backend = new URL(apiRewrite.destination);
if (backend.protocol !== 'https:') throw new Error('The Vercel backend must use HTTPS');

console.log(backend.origin);
