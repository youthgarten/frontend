// 영상 재생기를 하나의 모양으로 감싼다. 강의 화면은 이 인터페이스만 알고, 실제 재생기가 무엇인지 모른다.
// - 흉내 플레이어: youtube_video_id가 'mock:'으로 시작할 때. 영상 없이 1초에 1초씩 위치가 흐른다
// - 로컬 플레이어: local: 키에 연결된 MP4를 같은 출처에서 재생한다
// - YouTube 플레이어: YouTube IFrame Player API를 쓴다

export type PlayerState = 'unstarted' | 'playing' | 'paused' | 'buffering' | 'seeking' | 'ended';

export interface LecturePlayer {
    play(): void;
    pause(): void;
    /** 현재 재생 위치(초) */
    getTime(): number;
    seek(sec: number): void;
    getState(): PlayerState;
    /** 상태가 바뀔 때마다 부른다. 구독을 끊는 함수를 돌려준다 */
    onStateChange(fn: (state: PlayerState) => void): () => void;
    /** 타이머와 구독, 화면 요소를 모두 정리한다. 여러 번 불러도 된다 */
    destroy(): void;
}

export const isMockVideo = (videoId: string) => videoId.startsWith('mock:');

export function localVideoUrl(videoId: string): string | null {
    const key = /^local:([a-z0-9][a-z0-9-]{0,13})$/.exec(videoId)?.[1];
    return key && videoId === `local:${key}` ? `/lecture-media/${key}.mp4` : null;
}

export class NativeVideoPlayer implements LecturePlayer {
    private readonly events = new AbortController();
    private readonly listeners = new Set<(s: PlayerState) => void>();
    private state: PlayerState = 'unstarted';

    constructor(private readonly video: HTMLVideoElement, start: number, onError: () => void) {
        const { signal } = this.events;
        video.addEventListener('loadedmetadata', () => {
            if (start > 0) this.seek(start);
        }, { signal, once: true });
        video.addEventListener('playing', () => this.set('playing'), { signal });
        video.addEventListener('waiting', () => this.set('buffering'), { signal });
        video.addEventListener('seeking', () => this.set('seeking'), { signal });
        video.addEventListener('seeked', () => {
            this.set(video.ended ? 'ended' : video.paused ? 'paused' : video.readyState < 3 ? 'buffering' : 'playing');
        }, { signal });
        video.addEventListener('pause', () => this.set(video.ended ? 'ended' : 'paused'), { signal });
        video.addEventListener('ended', () => this.set('ended'), { signal });
        video.addEventListener('error', () => {
            this.set('paused');
            onError();
        }, { signal });
    }

    play() { void this.video.play().catch(() => {}); }
    pause() { this.video.pause(); }
    getTime() { return this.video.currentTime; }
    getState(): PlayerState { return this.video.seeking ? 'seeking' : this.state; }
    seek(sec: number) { this.video.currentTime = clamp(sec, 0, this.video.duration); }

    onStateChange(fn: (s: PlayerState) => void) {
        this.listeners.add(fn);
        return () => { this.listeners.delete(fn); };
    }

    destroy() {
        if (this.events.signal.aborted) return;
        this.events.abort();
        this.listeners.clear();
        this.video.pause();
        this.video.removeAttribute('src');
        this.video.load();
        this.video.remove();
    }

    private set(next: PlayerState) {
        const state = this.video.seeking ? 'seeking' : next;
        if (state === this.state) return;
        this.state = state;
        for (const listener of this.listeners) listener(state);
    }
}

// ── 흉내 플레이어 ──

export class MockPlayer implements LecturePlayer {
    private base: number;
    /** 재생을 시작한 시각(performance.now). 멈춰 있으면 null */
    private startedAt: number | null = null;
    private state: PlayerState = 'unstarted';
    private endTimer: number | null = null;
    private listeners = new Set<(s: PlayerState) => void>();

    constructor(private duration: number, start = 0) {
        this.base = clamp(start, 0, duration);
    }

    getTime() {
        if (this.startedAt === null) return this.base;
        return clamp(this.base + (performance.now() - this.startedAt) / 1000, 0, this.duration);
    }
    getState() {
        return this.state;
    }
    play() {
        if (this.state === 'playing') return;
        // 끝까지 본 뒤 다시 누르면 처음부터
        if (this.base >= this.duration) this.base = 0;
        this.startedAt = performance.now();
        this.scheduleEnd();
        this.set('playing');
    }
    pause() {
        if (this.state !== 'playing') return;
        this.base = this.getTime();
        this.startedAt = null;
        this.clearEnd();
        this.set('paused');
    }
    seek(sec: number) {
        this.base = clamp(sec, 0, this.duration);
        if (this.startedAt !== null) {
            this.startedAt = performance.now();
            this.scheduleEnd();
        }
        // 상태는 그대로지만 화면이 위치를 다시 그리도록 알린다
        this.emit();
    }
    onStateChange(fn: (s: PlayerState) => void) {
        this.listeners.add(fn);
        return () => {
            this.listeners.delete(fn);
        };
    }
    destroy() {
        this.clearEnd();
        this.startedAt = null;
        this.listeners.clear();
    }

    private scheduleEnd() {
        this.clearEnd();
        const left = (this.duration - this.base) * 1000;
        this.endTimer = window.setTimeout(() => {
            this.base = this.duration;
            this.startedAt = null;
            this.endTimer = null;
            this.set('ended');
        }, left);
    }
    private clearEnd() {
        if (this.endTimer !== null) window.clearTimeout(this.endTimer);
        this.endTimer = null;
    }
    private set(s: PlayerState) {
        this.state = s;
        this.emit();
    }
    private emit() {
        for (const fn of [...this.listeners]) fn(this.state);
    }
}

// ── YouTube 플레이어 ──

// IFrame Player API 중 여기서 쓰는 것만 선언한다
interface YTPlayer {
    playVideo(): void;
    pauseVideo(): void;
    seekTo(sec: number, allowSeekAhead: boolean): void;
    getCurrentTime(): number;
    getPlayerState(): number;
    destroy(): void;
}
interface YTNamespace {
    Player: new (el: HTMLElement, options: {
        width?: string | number;
        height?: string | number;
        videoId: string;
        playerVars?: Record<string, string | number>;
        events?: {
            onReady?: () => void;
            onStateChange?: (e: { data: number }) => void;
            onError?: (e: { data: number }) => void;
        };
    }) => YTPlayer;
}
declare global {
    interface Window {
        YT?: YTNamespace;
        onYouTubeIframeAPIReady?: () => void;
    }
}

const API_URL = 'https://www.youtube.com/iframe_api';
const LOAD_TIMEOUT_MS = 12000;
let apiPromise: Promise<YTNamespace> | null = null;

/** API 스크립트를 한 번만 불러온다. 실패하면 다음 호출 때 다시 시도할 수 있게 기억을 지운다 */
export function loadYouTubeApi(): Promise<YTNamespace> {
    if (window.YT?.Player) return Promise.resolve(window.YT);
    if (apiPromise) return apiPromise;
    apiPromise = new Promise<YTNamespace>((resolve, reject) => {
        const fail = () => {
            window.clearTimeout(timer);
            apiPromise = null;
            reject(new Error('YOUTUBE_API_LOAD_FAILED'));
        };
        const timer = window.setTimeout(fail, LOAD_TIMEOUT_MS);
        const previous = window.onYouTubeIframeAPIReady;
        window.onYouTubeIframeAPIReady = () => {
            previous?.();
            window.clearTimeout(timer);
            if (window.YT?.Player) resolve(window.YT);
            else fail();
        };
        let script = document.querySelector<HTMLScriptElement>(`script[src="${API_URL}"]`);
        if (!script) {
            script = document.createElement('script');
            script.src = API_URL;
            script.async = true;
            document.head.appendChild(script);
        }
        script.addEventListener('error', () => {
            script?.remove();
            fail();
        }, { once: true });
    });
    return apiPromise;
}

const YT_STATE: Record<number, PlayerState> = {
    [-1]: 'unstarted',
    0: 'ended',
    1: 'playing',
    2: 'paused',
    3: 'buffering',
    5: 'unstarted',
};

/**
 * host 안에 YouTube 플레이어를 만든다. API가 host를 iframe으로 바꿔 끼우므로
 * React가 그리지 않는 빈 div를 넘겨야 한다.
 */
export async function createYouTubePlayer(
    host: HTMLElement,
    videoId: string,
    start: number,
    /** 다 만들어지기 전에 화면이 사라지면 abort해서 만들던 플레이어를 치운다 */
    signal: AbortSignal,
    onPlaybackError?: () => void,
): Promise<LecturePlayer> {
    const YT = await loadYouTubeApi();
    if (signal.aborted) throw new Error('ABORTED');
    return new Promise<LecturePlayer>((resolve, reject) => {
        const listeners = new Set<(s: PlayerState) => void>();
        let state: PlayerState = 'unstarted';
        let ready = false;
        let destroyed = false;
        // 영상 틀이 끝내 준비되지 않으면(차단, 느린 연결) 오류로 알린다
        const readyTimer = window.setTimeout(() => {
            if (ready) return;
            adapter.destroy();
            reject(new Error('YOUTUBE_READY_TIMEOUT'));
        }, LOAD_TIMEOUT_MS);
        signal.addEventListener('abort', () => {
            window.clearTimeout(readyTimer);
            adapter.destroy();
            if (!ready) reject(new Error('ABORTED'));
        }, { once: true });

        const player = new YT.Player(host, {
            width: '100%',
            height: '100%',
            videoId,
            playerVars: { start: Math.floor(start), rel: 0, playsinline: 1, modestbranding: 1 },
            events: {
                onReady: () => {
                    if (destroyed) return;
                    ready = true;
                    window.clearTimeout(readyTimer);
                    resolve(adapter);
                },
                onStateChange: (e) => {
                    state = YT_STATE[e.data] ?? state;
                    for (const fn of [...listeners]) fn(state);
                },
                onError: () => {
                    if (ready) {
                        if (!destroyed) onPlaybackError?.();
                        return;
                    }
                    window.clearTimeout(readyTimer);
                    reject(new Error('YOUTUBE_VIDEO_ERROR'));
                },
            },
        });

        const adapter: LecturePlayer = {
            play: () => player.playVideo(),
            pause: () => player.pauseVideo(),
            getTime: () => (ready ? player.getCurrentTime() || 0 : start),
            seek: (sec) => player.seekTo(sec, true),
            getState: () => state,
            onStateChange: (fn) => {
                listeners.add(fn);
                return () => {
                    listeners.delete(fn);
                };
            },
            destroy: () => {
                if (destroyed) return;
                destroyed = true;
                listeners.clear();
                try {
                    player.destroy();
                } catch {
                    // 이미 사라진 iframe
                }
            },
        };
    });
}

function clamp(v: number, lo: number, hi: number) {
    return Math.min(Math.max(v, lo), hi);
}
