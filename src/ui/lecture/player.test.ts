import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createYouTubePlayer, localVideoUrl, MockPlayer, NativeVideoPlayer, type PlayerState } from './player';

// 영상 재생기 어댑터. 수강률은 여기서 읽은 재생 위치와 상태로 정해진다.
// DOM 없이 돌린다. window에는 타이머와 가짜 YT만 둔다.

interface YTOptions {
    videoId: string;
    playerVars: Record<string, string | number>;
    events: { onReady(): void; onStateChange(e: { data: number }): void; onError(e: { data: number }): void };
}

function fakeYT() {
    const created: { host: unknown; options: YTOptions; api: Record<string, ReturnType<typeof vi.fn>> }[] = [];
    class Player {
        playVideo = vi.fn();
        pauseVideo = vi.fn();
        seekTo = vi.fn();
        getCurrentTime = vi.fn(() => 42.5);
        getPlayerState = vi.fn();
        destroy = vi.fn();
        constructor(host: unknown, options: YTOptions) {
            created.push({ host, options, api: this as unknown as Record<string, ReturnType<typeof vi.fn>> });
        }
    }
    return { YT: { Player }, created };
}

const HOST = {} as HTMLElement;

beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance', 'Date'] });
});
afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

describe('MockPlayer', () => {
    beforeEach(() => {
        vi.stubGlobal('window', globalThis);
    });

    it('재생 중에는 1초에 1초씩 흐르고, 멈추면 위치가 그대로다', () => {
        const p = new MockPlayer(600, 30);
        expect(p.getTime()).toBe(30);
        p.play();
        vi.advanceTimersByTime(4000);
        expect(p.getTime()).toBe(34);
        p.pause();
        vi.advanceTimersByTime(4000);
        expect(p.getTime()).toBe(34);
        expect(p.getState()).toBe('paused');
    });

    it('끝까지 가면 ended를 알리고 위치는 영상 길이를 넘지 않는다. 다시 재생하면 처음부터다', () => {
        const p = new MockPlayer(10, 7);
        const states: PlayerState[] = [];
        p.onStateChange((s) => states.push(s));
        p.play();
        vi.advanceTimersByTime(20_000);
        expect(states).toEqual(['playing', 'ended']);
        expect(p.getTime()).toBe(10);
        p.play();
        expect(p.getTime()).toBe(0);
    });

    it('재생 중에 건너뛰면 그 위치부터 흐르고, 끝나는 시점도 다시 잡는다', () => {
        const p = new MockPlayer(100);
        p.play();
        vi.advanceTimersByTime(5000);
        p.seek(90);
        vi.advanceTimersByTime(5000);
        expect(p.getTime()).toBe(95);
        expect(p.getState()).toBe('playing');
        vi.advanceTimersByTime(5000);
        expect(p.getState()).toBe('ended');
        p.seek(999);
        expect(p.getTime()).toBe(100);
    });

    it('destroy 뒤에는 끝남 알림이 오지 않는다', () => {
        const p = new MockPlayer(10);
        const fn = vi.fn();
        p.play();
        p.onStateChange(fn);
        p.destroy();
        vi.advanceTimersByTime(20_000);
        expect(fn).not.toHaveBeenCalled();
    });
});

describe('NativeVideoPlayer', () => {
    it('resolves a catalog key only to the same-origin media folder', () => {
        expect(localVideoUrl('local:trade-delay-v1')).toBe('/lecture-media/trade-delay-v1.mp4');
        expect(localVideoUrl('local:../secret')).toBeNull();
        expect(localVideoUrl('local:trade-delay-v1\n')).toBeNull();
        expect(localVideoUrl('dQw4w9WgXcQ')).toBeNull();
    });

    it('resumes after metadata and distinguishes playback, seeking, buffering, and cleanup', () => {
        const element = Object.assign(new EventTarget(), {
            currentTime: 0, duration: 697.3, ended: false, paused: true, seeking: false, readyState: 4,
            pause: vi.fn(), remove: vi.fn(), removeAttribute: vi.fn(), load: vi.fn(),
        });
        const fail = vi.fn();
        const player = new NativeVideoPlayer(element as unknown as HTMLVideoElement, 12, fail);
        const states: PlayerState[] = [];
        player.onStateChange((state) => states.push(state));
        const fire = (name: string) => element.dispatchEvent(new Event(name));

        fire('loadedmetadata');
        expect(element.currentTime).toBe(12);
        element.paused = false;
        fire('playing');
        element.seeking = true;
        expect(player.getState()).toBe('seeking');
        fire('seeking');
        fire('waiting');
        element.seeking = false;
        fire('seeked');
        fire('waiting');
        fire('playing');
        element.paused = true;
        fire('pause');
        expect(states).toEqual(['playing', 'seeking', 'playing', 'buffering', 'playing', 'paused']);

        fire('error');
        expect(fail).toHaveBeenCalledOnce();
        player.destroy();
        player.destroy();
        fire('error');
        expect(fail).toHaveBeenCalledOnce();
        expect(element.remove).toHaveBeenCalledOnce();
    });
});

describe('createYouTubePlayer', () => {
    function setup() {
        const yt = fakeYT();
        vi.stubGlobal('window', { YT: yt.YT, setTimeout, clearTimeout });
        return yt;
    }

    it('준비되면 어댑터를 돌려준다. 이어보기 위치는 정수 초로 넘긴다', async () => {
        const { created } = setup();
        const promise = createYouTubePlayer(HOST, 'abc123', 75.8, new AbortController().signal);
        await vi.advanceTimersByTimeAsync(0);
        const { host, options, api } = created[0];
        expect(host).toBe(HOST);
        expect(options.videoId).toBe('abc123');
        expect(options.playerVars.start).toBe(75);

        options.events.onReady();
        const player = await promise;
        expect(player.getTime()).toBe(42.5);
        player.play();
        player.pause();
        player.seek(120);
        expect(api.playVideo).toHaveBeenCalledTimes(1);
        expect(api.pauseVideo).toHaveBeenCalledTimes(1);
        expect(api.seekTo).toHaveBeenCalledWith(120, true);
    });

    it('YouTube 상태 번호를 재생기 상태로 바꿔 알린다. 모르는 번호는 직전 상태를 유지한다', async () => {
        const { created } = setup();
        const promise = createYouTubePlayer(HOST, 'abc123', 0, new AbortController().signal);
        await vi.advanceTimersByTimeAsync(0);
        const { events } = created[0].options;
        events.onReady();
        const player = await promise;

        const states: PlayerState[] = [];
        const off = player.onStateChange((s) => states.push(s));
        for (const code of [-1, 3, 1, 2, 5, 1, 99, 0]) events.onStateChange({ data: code });
        expect(states).toEqual(['unstarted', 'buffering', 'playing', 'paused', 'unstarted', 'playing', 'playing', 'ended']);
        expect(player.getState()).toBe('ended');

        off();
        events.onStateChange({ data: 1 });
        expect(states).toHaveLength(8);
    });

    it('준비 전에 영상 오류가 나면 실패한다', async () => {
        const { created } = setup();
        const promise = createYouTubePlayer(HOST, 'gone', 0, new AbortController().signal);
        const failed = expect(promise).rejects.toThrow('YOUTUBE_VIDEO_ERROR');
        await vi.advanceTimersByTimeAsync(0);
        created[0].options.events.onError({ data: 100 });
        await failed;
    });

    it('준비가 끝난 뒤의 재생 오류도 강의 화면에 알린다', async () => {
        const { created } = setup();
        const onPlaybackError = vi.fn();
        const promise = createYouTubePlayer(HOST, 'video', 0, new AbortController().signal, onPlaybackError);
        await vi.advanceTimersByTimeAsync(0);
        const { events } = created[0].options;
        events.onReady();
        const player = await promise;
        events.onError({ data: 153 });
        expect(onPlaybackError).toHaveBeenCalledOnce();
        player.destroy();
    });

    it('끝내 준비되지 않으면 시간 초과로 실패하고 만들던 플레이어를 치운다', async () => {
        const { created } = setup();
        const promise = createYouTubePlayer(HOST, 'abc123', 0, new AbortController().signal);
        const failed = expect(promise).rejects.toThrow('YOUTUBE_READY_TIMEOUT');
        await vi.advanceTimersByTimeAsync(12_000);
        await failed;
        expect(created[0].api.destroy).toHaveBeenCalledTimes(1);
    });

    it('준비 전에 화면이 사라지면(abort) 실패하고 만들던 플레이어를 치운다', async () => {
        const { created } = setup();
        const ctrl = new AbortController();
        const promise = createYouTubePlayer(HOST, 'abc123', 0, ctrl.signal);
        const failed = expect(promise).rejects.toThrow('ABORTED');
        await vi.advanceTimersByTimeAsync(0);
        ctrl.abort();
        await failed;
        expect(created[0].api.destroy).toHaveBeenCalledTimes(1);
        // 늦게 온 준비 알림과 시간 초과는 아무 일도 하지 않는다
        created[0].options.events.onReady();
        await vi.advanceTimersByTimeAsync(20_000);
        expect(created[0].api.destroy).toHaveBeenCalledTimes(1);
    });

    it('이미 abort된 상태면 플레이어를 만들지 않는다', async () => {
        const { created } = setup();
        const ctrl = new AbortController();
        ctrl.abort();
        await expect(createYouTubePlayer(HOST, 'abc123', 0, ctrl.signal)).rejects.toThrow('ABORTED');
        expect(created).toHaveLength(0);
    });

    it('destroy는 여러 번 불러도 한 번만 치우고, 그 뒤로는 상태를 알리지 않는다', async () => {
        const { created } = setup();
        const promise = createYouTubePlayer(HOST, 'abc123', 0, new AbortController().signal);
        await vi.advanceTimersByTimeAsync(0);
        const { options, api } = created[0];
        options.events.onReady();
        const player = await promise;
        const fn = vi.fn();
        player.onStateChange(fn);
        player.destroy();
        player.destroy();
        options.events.onStateChange({ data: 1 });
        expect(api.destroy).toHaveBeenCalledTimes(1);
        expect(fn).not.toHaveBeenCalled();
    });
});
