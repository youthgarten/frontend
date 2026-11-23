import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => vi.unstubAllEnvs());

it('forwards only the API prefix to the configured HTTPS origin', async () => {
    vi.stubEnv('VITE_PUBLIC_BACKEND_ORIGIN', 'https://api.example.com/');
    vi.resetModules();
    const { config } = await import('./vercel');
    expect(config.rewrites).toEqual([
        { source: '/api/v1/:path*', destination: 'https://api.example.com/api/v1/:path*' },
    ]);
    expect(config.headers[0].headers).toContainEqual({ key: 'Cache-Control', value: 'no-store' });
});

it('leaves routing untouched when a production backend has yet to be assigned', async () => {
    vi.stubEnv('VITE_PUBLIC_BACKEND_ORIGIN', '');
    vi.resetModules();
    const { config } = await import('./vercel');
    expect(config.rewrites).toEqual([]);
});

it('rejects an insecure or credential-bearing proxy target', async () => {
    for (const origin of ['http://api.example.com', 'https://user:pass@api.example.com', 'https://api.example.com/internal']) {
        vi.stubEnv('VITE_PUBLIC_BACKEND_ORIGIN', origin);
        vi.resetModules();
        await expect(import('./vercel')).rejects.toThrow('VITE_PUBLIC_BACKEND_ORIGIN');
    }
});
