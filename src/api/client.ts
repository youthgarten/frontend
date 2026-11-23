import { createClient, type RequestOptions } from './core/createClient';
import { errorFromResponse, networkError, type ApiError } from './core/errors';
import type { TokenResponse } from './types';

// 이 서비스의 HTTP 클라이언트 하나. 모든 REST 요청이 여기를 지난다.
// 범용 부분(시간 제한, 다시 시도, 훅)은 core/createClient.ts에 있고, 여기에는 이 서비스의 규칙만 둔다.
// - 기본 주소는 /api/v1 (명세 1절)
// - 액세스 토큰은 메모리에만 둔다. 새로고침하면 사라지고 /auth/refresh로 복구한다 (명세 2절)
// - 401 TOKEN_EXPIRED를 받으면 재발급한 뒤 원래 요청을 한 번만 다시 보낸다
// - 재발급은 한 번에 하나만 보낸다. 여러 요청이 동시에 401을 받아도 같은 재발급 결과를 기다린다

export const API_BASE = '/api/v1';

export { ApiError, errorMessage, isAborted, isApiError } from './core/errors';
export type { RequestOptions } from './core/createClient';

let accessToken: string | null = null;
let refreshing: Promise<string> | null = null;
let onSessionLost: (() => void) | null = null;

// 재발급이 서버 거절(401)이 아니라 통신 문제(끊김, 5xx)로 실패한 상태. 이때는 로그인을 풀지 않고 다시 시도한다
let unstable = false;
let onUnstable: ((unstable: boolean) => void) | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let retryCount = 0;
const RETRY_BASE_MS = 2000;
const RETRY_MAX_MS = 30_000;

export function getAccessToken() {
    return accessToken;
}
/** 로그인, 로그아웃 때 부른다. 진행 중이던 재발급 다시 시도도 멈춘다. */
export function setAccessToken(token: string | null) {
    accessToken = token;
    setUnstable(false);
}
/** 재발급까지 실패해 로그인이 풀렸을 때 부를 함수를 등록한다 (세션 쪽에서 한 번 등록). */
export function setSessionLostHandler(fn: (() => void) | null) {
    onSessionLost = fn;
}
/**
 * 로그인이 풀린 것을 알린다. REST 밖(멀티플레이 연결)에서 인증이 끝내 실패했을 때도 부른다. 화면이 로그인으로 돌아간다.
 * 재발급이 통신 문제로 실패한 동안에는 아무 일도 하지 않는다. 서버가 거절(401)했을 때만 로그인이 풀린다.
 */
export function notifySessionLost() {
    if (!unstable) onSessionLost?.();
}

/** 재발급이 통신 문제로 실패해 다시 시도하는 중인가. 화면이 "연결이 불안정해요" 안내를 띄우는 데 쓴다. */
export function isConnectionUnstable() {
    return unstable;
}
/** 위 상태가 바뀔 때 부를 함수를 등록한다 (세션 쪽에서 한 번 등록). */
export function setConnectionUnstableHandler(fn: ((unstable: boolean) => void) | null) {
    onUnstable = fn;
}

const retryRefresh = () => void refreshAccessToken().catch(notifySessionLost);

function setUnstable(next: boolean) {
    if (retryTimer !== null) clearTimeout(retryTimer);
    retryTimer = null;
    if (next) {
        // 2초, 4초, 8초 … 최대 30초 간격으로 다시 시도한다. 그 사이에 다른 요청이 재발급을 불러도 된다
        retryTimer = setTimeout(retryRefresh, Math.min(RETRY_BASE_MS * 2 ** retryCount, RETRY_MAX_MS));
        retryCount += 1;
    } else {
        retryCount = 0;
    }
    if (unstable === next) return;
    unstable = next;
    onUnstable?.(next);
}

// 인터넷이 다시 붙으면 기다리지 않고 바로 다시 시도한다 (브라우저에서만)
globalThis.addEventListener?.('online', () => {
    if (unstable) retryRefresh();
});

/**
 * 액세스 토큰을 새로 받는다. 동시에 여러 번 불려도 요청은 한 번만 나간다.
 * 서버가 거절(401)하면 토큰을 지운다. 통신 문제(끊김, 5xx 등)면 토큰을 그대로 두고 뒤에서 다시 시도한다.
 */
export function refreshAccessToken(): Promise<string> {
    if (!refreshing) {
        refreshing = (async () => {
            let res: Response;
            try {
                // 재발급은 클라이언트를 거치지 않고 직접 보낸다. 거치면 재발급의 401이 또 재발급을 부른다
                res = await fetch(`${API_BASE}/auth/refresh`, { method: 'POST', credentials: 'same-origin' });
            } catch {
                setUnstable(true);
                throw networkError();
            }
            if (!res.ok) {
                if (res.status === 401) setAccessToken(null);
                else setUnstable(true);
                throw await errorFromResponse(res);
            }
            const body = (await res.json()) as TokenResponse;
            setAccessToken(body.access_token);
            return body.access_token;
        })().finally(() => {
            refreshing = null;
        });
    }
    return refreshing;
}

const isTokenProblem = (e: ApiError) => e.status === 401 && (e.code === 'TOKEN_EXPIRED' || e.code === 'INVALID_TOKEN');

export const http = createClient({
    baseUrl: API_BASE,
    auth: {
        getToken: () => accessToken,
        shouldRefresh: isTokenProblem,
        refresh: refreshAccessToken,
        onSessionLost: notifySessionLost,
    },
});

/**
 * 메서드와 경로로 직접 부른다. 명세에 있는 API는 endpoints.ts의 `api`를 쓰고,
 * 이 함수는 명세 밖의 주소(모의 서버 조작판)를 부를 때만 쓴다.
 */
export function request<T>(method: string, path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    // 로그인, 가입, 로그아웃의 401은 토큰 만료가 아니다. 재발급하지 않는다
    const auth = path.startsWith('/auth/') ? false : options?.auth;
    return http.request<T>(method, path, { ...options, body, auth });
}
