import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    ApiError, errorMessage, getAccessToken, isConnectionUnstable, request, setAccessToken, setConnectionUnstableHandler, setSessionLostHandler,
} from './client';

// 명세: 액세스 토큰이 만료되면 재발급한 뒤 원래 요청을 다시 보낸다.
// 재발급할 때마다 리프레시 토큰이 교체되므로, 재발급 요청이 두 번 나가면 하나는 반드시 실패해 로그인이 풀린다.

type Handler = (url: string, init: RequestInit) => Response | Promise<Response>;

const json = (status: number, body?: unknown) =>
    new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const err = (status: number, code: string, message = '안내 문장') => json(status, { error: { code, message } });

let calls: { url: string; auth: string | null }[];

function mockFetch(handler: Handler) {
    calls = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
        calls.push({ url, auth: new Headers(init.headers).get('Authorization') });
        return handler(url, init);
    }));
}

beforeEach(() => {
    setAccessToken('old');
});
afterEach(() => {
    vi.unstubAllGlobals();
    setAccessToken(null);
    setSessionLostHandler(null);
    setConnectionUnstableHandler(null);
    vi.useRealTimers();
});

describe('request', () => {
    it('토큰을 붙여 보내고 응답 본문을 돌려준다', async () => {
        mockFetch(() => json(200, { id: 1 }));
        await expect(request('GET', '/users/me')).resolves.toEqual({ id: 1 });
        expect(calls).toEqual([{ url: '/api/v1/users/me', auth: 'Bearer old' }]);
    });

    it('204는 null로 돌려준다', async () => {
        mockFetch(() => json(204));
        await expect(request('GET', '/attempts/current')).resolves.toBeNull();
    });

    it('명세의 에러 형식을 code와 message로 풀어 던진다', async () => {
        mockFetch(() => err(403, 'LECTURE_NOT_COMPLETED', '필수 강의를 먼저 들어야 해요.'));
        const e = await request('GET', '/tasks/2').catch((x) => x);
        expect(e).toBeInstanceOf(ApiError);
        expect(e).toMatchObject({ code: 'LECTURE_NOT_COMPLETED', status: 403 });
        expect(errorMessage(e)).toBe('필수 강의를 먼저 들어야 해요.');
    });

    it('서버에 닿지 못하면 NETWORK_ERROR로 던진다', async () => {
        mockFetch(() => {
            throw new TypeError('Failed to fetch');
        });
        await expect(request('GET', '/jobs')).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
    });

    it('토큰이 만료되면 재발급한 뒤 새 토큰으로 원래 요청을 한 번 다시 보낸다', async () => {
        mockFetch((url, init) => {
            if (url.endsWith('/auth/refresh')) return json(200, { access_token: 'new', token_type: 'bearer', expires_in: 3600 });
            return new Headers(init.headers).get('Authorization') === 'Bearer new' ? json(200, { ok: true }) : err(401, 'TOKEN_EXPIRED');
        });
        await expect(request('GET', '/lectures')).resolves.toEqual({ ok: true });
        expect(calls.map((c) => c.url)).toEqual(['/api/v1/lectures', '/api/v1/auth/refresh', '/api/v1/lectures']);
        expect(getAccessToken()).toBe('new');
    });

    it('여러 요청이 동시에 만료를 받아도 재발급은 한 번만 보낸다', async () => {
        mockFetch(async (url, init) => {
            if (url.endsWith('/auth/refresh')) {
                await new Promise((r) => setTimeout(r, 10));
                return json(200, { access_token: 'new', token_type: 'bearer', expires_in: 3600 });
            }
            return new Headers(init.headers).get('Authorization') === 'Bearer new' ? json(200, { ok: true }) : err(401, 'TOKEN_EXPIRED');
        });
        await Promise.all([request('GET', '/lectures'), request('GET', '/tasks'), request('GET', '/users/me')]);
        expect(calls.filter((c) => c.url.endsWith('/auth/refresh'))).toHaveLength(1);
    });

    it('재발급도 실패하면 로그인이 풀렸다고 알리고 원래 오류를 던진다', async () => {
        const lost = vi.fn();
        setSessionLostHandler(lost);
        mockFetch((url) => (url.endsWith('/auth/refresh') ? err(401, 'INVALID_REFRESH_TOKEN') : err(401, 'TOKEN_EXPIRED')));
        await expect(request('GET', '/lectures')).rejects.toMatchObject({ code: 'TOKEN_EXPIRED' });
        expect(lost).toHaveBeenCalledTimes(1);
        expect(getAccessToken()).toBeNull();
    });

    it('로그인 실패(401)는 재발급을 시도하지 않는다', async () => {
        mockFetch(() => err(401, 'INVALID_CREDENTIALS', '아이디 또는 비밀번호가 맞지 않아요.'));
        await expect(request('POST', '/auth/login', {})).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
        expect(calls).toHaveLength(1);
    });

    it('다시 보낸 요청이 또 만료를 받으면 더 시도하지 않는다', async () => {
        mockFetch((url) => (url.endsWith('/auth/refresh') ? json(200, { access_token: 'new', token_type: 'bearer', expires_in: 3600 }) : err(401, 'TOKEN_EXPIRED')));
        await expect(request('GET', '/lectures')).rejects.toMatchObject({ code: 'TOKEN_EXPIRED' });
        expect(calls.map((c) => c.url)).toEqual(['/api/v1/lectures', '/api/v1/auth/refresh', '/api/v1/lectures']);
    });

    // 로그인이 풀리는 것은 서버가 재발급을 거절(401)했을 때뿐이다. 통신 문제면 로그인을 유지하고 다시 시도한다
    it.each([
        ['서버에 닿지 못함', () => { throw new TypeError('Failed to fetch'); }],
        ['서버 오류(503)', () => json(503)],
    ] as const)('재발급이 통신 문제로 실패하면(%s) 로그인을 유지하고, 다시 시도가 성공하면 안내를 내린다', async (_name, fail) => {
        vi.useFakeTimers();
        const lost = vi.fn();
        const notice = vi.fn();
        setSessionLostHandler(lost);
        setConnectionUnstableHandler(notice);
        let down = true;
        mockFetch((url) => {
            if (!url.endsWith('/auth/refresh')) return err(401, 'TOKEN_EXPIRED');
            return down ? fail() : json(200, { access_token: 'new', token_type: 'bearer', expires_in: 3600 });
        });

        await expect(request('GET', '/lectures')).rejects.toMatchObject({ code: 'TOKEN_EXPIRED' });
        expect(lost).not.toHaveBeenCalled();
        expect(getAccessToken()).toBe('old');
        expect(isConnectionUnstable()).toBe(true);
        expect(notice).toHaveBeenLastCalledWith(true);

        // 아직 안 되면 계속 기다린다
        await vi.advanceTimersByTimeAsync(2000);
        expect(isConnectionUnstable()).toBe(true);
        expect(lost).not.toHaveBeenCalled();

        down = false;
        await vi.advanceTimersByTimeAsync(4000);
        expect(isConnectionUnstable()).toBe(false);
        expect(notice).toHaveBeenLastCalledWith(false);
        expect(getAccessToken()).toBe('new');
        expect(lost).not.toHaveBeenCalled();
    });

    it('다시 시도하던 중에 서버가 재발급을 거절(401)하면 로그인이 풀린다', async () => {
        vi.useFakeTimers();
        const lost = vi.fn();
        setSessionLostHandler(lost);
        let down = true;
        mockFetch((url) => {
            if (!url.endsWith('/auth/refresh')) return err(401, 'TOKEN_EXPIRED');
            return down ? json(502) : err(401, 'INVALID_REFRESH_TOKEN');
        });
        await request('GET', '/lectures').catch(() => undefined);
        expect(lost).not.toHaveBeenCalled();

        down = false;
        await vi.advanceTimersByTimeAsync(2000);
        expect(lost).toHaveBeenCalledTimes(1);
        expect(getAccessToken()).toBeNull();
        expect(isConnectionUnstable()).toBe(false);
    });
});
