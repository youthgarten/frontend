export function publicBackendOrigin(value: string | undefined): string | undefined {
    const address = value?.trim();
    if (!address) return undefined;
    try {
        const url = new URL(address);
        if (url.protocol === 'https:' && url.pathname === '/' && !url.username && !url.password && !url.search && !url.hash) {
            return url.origin;
        }
    } catch {
        // Report configuration errors without printing the supplied value.
    }
    throw new Error('VITE_PUBLIC_BACKEND_ORIGIN must be the backend HTTPS origin.');
}
