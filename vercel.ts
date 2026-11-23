import { publicBackendOrigin } from './src/backendOrigin';

const backend = publicBackendOrigin(process.env.VITE_PUBLIC_BACKEND_ORIGIN);
const api = '/api/v1/:path*';

export const config = {
    rewrites: backend ? [{ source: api, destination: `${backend}${api}` }] : [],
    headers: [{
        source: api,
        headers: [
            { key: 'Cache-Control', value: 'no-store' },
            { key: 'CDN-Cache-Control', value: 'no-store' },
        ],
    }],
};
