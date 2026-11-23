import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
    api, getAccessToken, invalidateLectureProgress, isConnectionUnstable, refreshAccessToken, setAccessToken,
    setConnectionUnstableHandler, setSessionLostHandler, useLectures, userQueries, useTasks,
    type LectureDashboard, type Me, type TaskSummary,
} from '../api';

// 로그인 상태와, 여러 화면이 함께 보는 내 정보(레벨, 강의 수강 현황, 과제 현황)를 들고 있다.
// 강의와 과제 현황은 조회 저장소(TanStack Query)에 있다. 여기서는 그것을 꺼내 보여 줄 뿐이라,
// 어느 화면이든 값을 바꾼 뒤 그 조회를 낡은 것으로 표시하면 HUD까지 함께 갱신된다.

type Status = 'booting' | 'guest' | 'authed';

interface Session {
    status: Status;
    me: Me | null;
    /** 강의 대시보드. 아직 못 불렀으면 null */
    lectures: LectureDashboard | null;
    /** 과제 목록. 아직 못 불렀으면 null */
    tasks: TaskSummary[] | null;
    /** 토큰 재발급이 통신 문제로 실패해 다시 시도하는 중. 로그인은 그대로 둔다 */
    connectionUnstable: boolean;
    login: (loginId: string, password: string) => Promise<void>;
    logout: () => Promise<void>;
    /** 내 정보를 다시 불러온다 (레벨업 뒤, 첫 입장 안내를 본 뒤) */
    reloadMe: () => Promise<Me | null>;
    /** 강의와 과제 현황을 다시 불러온다 (강의 창이나 시험 창을 닫은 뒤) */
    reloadProgress: () => Promise<void>;
}

const Ctx = createContext<Session | null>(null);

export function useSession() {
    const s = useContext(Ctx);
    if (!s) throw new Error('SessionProvider 안에서만 쓸 수 있어요');
    return s;
}

/** 로그인한 화면에서 쓴다. me가 반드시 있다. */
export function useMe() {
    const { me } = useSession();
    if (!me) throw new Error('로그인한 뒤에만 쓸 수 있어요');
    return me;
}

export function SessionProvider({ children }: { children: ReactNode }) {
    const queryClient = useQueryClient();
    const [status, setStatus] = useState<Status>('booting');
    const [me, setMe] = useState<Me | null>(null);
    const [connectionUnstable, setConnectionUnstable] = useState(isConnectionUnstable);

    // 로그인한 동안에만 부른다. 한쪽이 실패해도 다른 쪽은 보여 준다
    const authed = status === 'authed';
    const lectures = useLectures(authed).data ?? null;
    const tasks = useTasks(authed).data ?? null;

    const clear = useCallback(() => {
        setAccessToken(null);
        setMe(null);
        setStatus('guest');
        // 다음에 로그인하는 사람에게 앞사람의 값이 보이면 안 된다
        queryClient.clear();
    }, [queryClient]);

    const reloadProgress = useCallback(async () => {
        await invalidateLectureProgress(queryClient);
    }, [queryClient]);

    const reloadMe = useCallback(async () => {
        try {
            // 저장해 둔 값을 쓰지 않고 반드시 새로 받는다
            const next = await queryClient.fetchQuery({ ...userQueries.me(), staleTime: 0 });
            setMe(next);
            return next;
        } catch {
            return null;
        }
    }, [queryClient]);

    const enter = useCallback(async () => {
        setMe(await queryClient.fetchQuery({ ...userQueries.me(), staleTime: 0 }));
        setStatus('authed');
    }, [queryClient]);

    // 앱 시작: 새로고침하면 메모리의 액세스 토큰이 사라지므로 쿠키의 리프레시 토큰으로 복구한다
    useEffect(() => {
        let cancelled = false;
        setSessionLostHandler(clear);
        setConnectionUnstableHandler(setConnectionUnstable);
        (async () => {
            try {
                await refreshAccessToken();
                if (!cancelled) await enter();
            } catch {
                // 통신 문제면 로그인 화면으로 보내지 않고 기다린다. 다시 시도가 성공하면 아래 효과가 들여보낸다
                if (!cancelled && !isConnectionUnstable()) clear();
            }
        })();
        return () => {
            cancelled = true;
            setSessionLostHandler(null);
            setConnectionUnstableHandler(null);
        };
    }, [clear, enter]);

    // 앱 시작 때 통신 문제로 복구하지 못했다가 다시 시도가 성공한 경우
    useEffect(() => {
        if (status === 'booting' && !connectionUnstable && getAccessToken()) enter().catch(clear);
    }, [status, connectionUnstable, enter, clear]);

    const login = useCallback(async (loginId: string, password: string) => {
        const token = await api.login({ login_id: loginId, password });
        setAccessToken(token.access_token);
        await enter();
    }, [enter]);

    const logout = useCallback(async () => {
        try {
            await api.logout();
        } finally {
            // 서버에 닿지 못해도 이 브라우저에서는 로그아웃한다
            clear();
        }
    }, [clear]);

    const value = useMemo<Session>(
        () => ({ status, me, lectures, tasks, connectionUnstable, login, logout, reloadMe, reloadProgress }),
        [status, me, lectures, tasks, connectionUnstable, login, logout, reloadMe, reloadProgress],
    );
    return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
