// API 모듈의 입구. 화면은 여기에서만 가져다 쓴다.
//
//   import { api, isApiError, errorMessage, useLectures } from '../../api';
//
// 사용법과 새 API를 더하는 방법은 docs/api-module.md에 있다.

// ── 공통: 누가 어떤 분야를 맡든 함께 쓴다 ──

// 실패 다루기
export { ApiError, errorMessage, isAborted, isApiError } from './core/errors';

// HTTP 클라이언트와 로그인 상태
export {
    API_BASE, getAccessToken, http, isConnectionUnstable, notifySessionLost, refreshAccessToken, request, setAccessToken, setConnectionUnstableHandler, setSessionLostHandler,
} from './client';
export type { RequestOptions } from './client';

// 조회 저장소와 공통 옵션
export { createQueryClient } from './query/queryClient';
export { FRESH_ON_OPEN, NEVER_CACHE } from './query/options';

// 응답 타입
export type * from './types';

// ── 분야별: 각 담당자가 자기 파일(domains/)에서 내보내는 것 ──

/** 명세의 API 함수를 한 이름으로 모은 것 */
export { api } from './endpoints';

export * from './domains/auth';
export * from './domains/users';
export * from './domains/lectures';
export * from './domains/tasks';
export * from './domains/attempts';
