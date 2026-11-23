import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MapServerMessage } from '../../api';

// 멀티플레이 WebSocket 클라이언트 (API 명세서 8절). 가짜 WebSocket과 가짜 시계로 확인한다.

const mocks = vi.hoisted(() => ({
    getAccessToken: vi.fn<() => string | null>(),
    refreshAccessToken: vi.fn<() => Promise<string>>(),
    notifySessionLost: vi.fn(),
    emit: vi.fn(),
}));
vi.mock('../../api', () => ({
    getAccessToken: mocks.getAccessToken,
    refreshAccessToken: mocks.refreshAccessToken,
    notifySessionLost: mocks.notifySessionLost,
    isConnectionUnstable: () => false,
}));
// events는 phaser를 불러온다. 노드 환경에서는 못 불러오므로 대신한다
vi.mock('../../events', () => ({ emit: mocks.emit }));

import { MapSocket, type MapSocketHandlers } from './MapSocket';

class FakeWebSocket {
    static readonly CONNECTING = 0;
    static readonly OPEN = 1;
    static readonly CLOSED = 3;
    static instances: FakeWebSocket[] = [];

    readyState = FakeWebSocket.CONNECTING;
    sent: Record<string, unknown>[] = [];
    closedWith: number | null = null;
    onopen: (() => void) | null = null;
    onmessage: ((ev: { data: string }) => void) | null = null;
    onclose: ((ev: { code: number }) => void) | null = null;
    onerror: (() => void) | null = null;

    constructor(readonly url: string) {
        FakeWebSocket.instances.push(this);
    }
    send(data: string) {
        this.sent.push(JSON.parse(data));
    }
    close(code: number) {
        this.closedWith = code;
        this.readyState = FakeWebSocket.CLOSED;
    }

    // ── 서버 쪽 동작 ──
    open() {
        this.readyState = FakeWebSocket.OPEN;
        this.onopen?.();
    }
    receive(msg: MapServerMessage) {
        this.onmessage?.({ data: JSON.stringify(msg) });
    }
    serverClose(code: number) {
        this.readyState = FakeWebSocket.CLOSED;
        this.onclose?.({ code });
    }
    get moves() {
        return this.sent.filter((m) => m.type === 'move');
    }
}

const SNAPSHOT: MapServerMessage = { type: 'snapshot', me: { x: 960, y: 880, dir: 'down' }, players: [] };
const sockets = () => FakeWebSocket.instances;
const lastSocket = () => sockets()[sockets().length - 1];

function handlers(): MapSocketHandlers {
    return { snapshot: vi.fn(), joined: vi.fn(), moved: vi.fn(), updated: vi.fn(), left: vi.fn(), disconnected: vi.fn() };
}

/** 연결하고 인증까지 마친 소켓 */
function connected(h = handlers()) {
    const socket = new MapSocket(h);
    socket.start();
    const ws = lastSocket();
    ws.open();
    ws.receive(SNAPSHOT);
    return { socket, ws, h };
}

beforeEach(() => {
    FakeWebSocket.instances = [];
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance', 'Date'] });
    // 실제 브라우저처럼 performance.now()가 0이 아닌 상태에서 시작한다
    vi.advanceTimersByTime(5000);
    vi.stubGlobal('WebSocket', FakeWebSocket);
    vi.stubGlobal('window', { location: { protocol: 'http:', host: 'localhost:5173' } });
    mocks.getAccessToken.mockReturnValue('tok-1');
    mocks.refreshAccessToken.mockResolvedValue('tok-2');
    vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    vi.resetAllMocks();
});

it('connects from the Vercel frontend to the configured public backend over WSS', () => {
    vi.stubEnv('VITE_PUBLIC_BACKEND_ORIGIN', 'https://api.example.com/');
    const { socket, ws } = connected();
    expect(ws.url).toBe('wss://api.example.com/api/v1/ws/map');
    socket.stop();
});

describe('MapSocket 연결과 인증', () => {
    it('연결 직후 첫 메시지로 토큰을 보낸다. 주소에는 토큰을 넣지 않는다', () => {
        new MapSocket(handlers()).start();
        const ws = lastSocket();
        expect(ws.url).toBe('ws://localhost:5173/api/v1/ws/map');
        expect(ws.sent).toEqual([]);
        ws.open();
        expect(ws.sent).toEqual([{ type: 'auth', access_token: 'tok-1' }]);
    });

    it('메모리에 토큰이 없으면 먼저 재발급한 토큰으로 인증한다', async () => {
        mocks.getAccessToken.mockReturnValue(null);
        new MapSocket(handlers()).start();
        expect(sockets()).toHaveLength(0);
        await vi.advanceTimersByTimeAsync(0);
        lastSocket().open();
        expect(lastSocket().sent).toEqual([{ type: 'auth', access_token: 'tok-2' }]);
    });

    it('토큰이 없고 재발급도 실패하면 연결하지 않고 세션이 끊겼다고 알린다', async () => {
        mocks.getAccessToken.mockReturnValue(null);
        mocks.refreshAccessToken.mockRejectedValue(new Error('401'));
        new MapSocket(handlers()).start();
        await vi.advanceTimersByTimeAsync(60_000);
        expect(sockets()).toHaveLength(0);
        expect(mocks.notifySessionLost).toHaveBeenCalledTimes(1);
    });
});

describe('MapSocket move 보내기', () => {
    it('인증(snapshot) 전에는 move를 보내지 않는다', () => {
        const socket = new MapSocket(handlers());
        socket.start();
        const ws = lastSocket();
        ws.open();
        socket.reportMove(100, 200, 'right', true);
        vi.advanceTimersByTime(1000);
        expect(ws.moves).toEqual([]);
    });

    it('x, y, dir, moving을 보낸다. 좌표는 반올림한 정수다', () => {
        const { socket, ws } = connected();
        socket.reportMove(100.4, 200.6, 'right', true);
        expect(ws.moves).toEqual([{ type: 'move', x: 100, y: 201, dir: 'right', moving: true }]);
    });

    it('매 프레임 불러도 1초에 10번을 넘기지 않는다', () => {
        const { socket, ws } = connected();
        // 60fps로 1초 동안 계속 움직인다
        for (let t = 0; t < 1000; t += 16) {
            socket.reportMove(100 + t, 200, 'right', true);
            vi.advanceTimersByTime(16);
        }
        expect(ws.moves.length).toBeGreaterThanOrEqual(8);
        expect(ws.moves.length).toBeLessThanOrEqual(10);
    });

    it('간격에 막힌 마지막 상태(멈춤)는 더 부르지 않아도 간격이 열리면 나간다', () => {
        const { socket, ws } = connected();
        socket.reportMove(100, 200, 'right', true);
        vi.advanceTimersByTime(16);
        socket.reportMove(104, 200, 'right', true);
        vi.advanceTimersByTime(16);
        socket.reportMove(108, 200, 'right', false);
        expect(ws.moves).toHaveLength(1);
        vi.advanceTimersByTime(200);
        // 중간 상태(104)는 건너뛰고 가장 최근 상태만 보낸다
        expect(ws.moves).toEqual([
            { type: 'move', x: 100, y: 200, dir: 'right', moving: true },
            { type: 'move', x: 108, y: 200, dir: 'right', moving: false },
        ]);
    });

    it('마지막으로 보낸 상태와 같으면 다시 보내지 않는다. 소수점만 달라도 같은 상태다', () => {
        const { socket, ws } = connected();
        socket.reportMove(100, 200, 'up', false);
        vi.advanceTimersByTime(500);
        socket.reportMove(100.2, 199.9, 'up', false);
        vi.advanceTimersByTime(500);
        expect(ws.moves).toHaveLength(1);
        socket.reportMove(100, 200, 'left', false);
        expect(ws.moves).toHaveLength(2);
    });

    it('서버가 알려 준 시작 자리에 서 있다는 보고는 보내지 않는다', () => {
        const { socket, ws } = connected();
        socket.reportMove(960, 880, 'down', false);
        vi.advanceTimersByTime(500);
        expect(ws.moves).toEqual([]);
    });
});

describe('MapSocket 서버 메시지', () => {
    it('메시지 종류별로 알맞은 알림을 부른다', () => {
        const h = handlers();
        const socket = new MapSocket(h);
        socket.start();
        const ws = lastSocket();
        ws.open();
        const player = { user_id: 7, nickname: '서연', level: 3, x: 1010, y: 880, dir: 'down', moving: false } as const;

        ws.receive({ ...SNAPSHOT, players: [player] });
        expect(h.snapshot).toHaveBeenCalledWith([player]);
        expect(mocks.emit).toHaveBeenCalledWith('map-connection', 'connected');

        ws.receive({ type: 'player_joined', player: { ...player, user_id: 8 } });
        expect(h.joined).toHaveBeenCalledWith({ ...player, user_id: 8 });

        ws.receive({ type: 'player_moved', user_id: 7, x: 1020, y: 890, dir: 'left', moving: true });
        expect(h.moved).toHaveBeenCalledWith(7, 1020, 890, 'left', true);

        ws.receive({ type: 'player_updated', user_id: 7, level: 4 });
        expect(h.updated).toHaveBeenCalledWith(7, 4);

        ws.receive({ type: 'player_left', user_id: 7 });
        expect(h.left).toHaveBeenCalledWith(7);
    });

    it('JSON이 아닌 메시지나 모르는 type은 무시한다', () => {
        const { ws, h } = connected();
        expect(() => {
            ws.onmessage?.({ data: 'not json' });
            ws.onmessage?.({ data: JSON.stringify({ type: 'something_new' }) });
        }).not.toThrow();
        expect(h.snapshot).toHaveBeenCalledTimes(1);
        expect(h.joined).not.toHaveBeenCalled();
    });
});

describe('MapSocket 끊김과 재연결', () => {
    it('네트워크가 끊기면 1초, 2초, 4초, 8초, 이후 10초 간격으로 다시 연결한다', () => {
        const { ws, h } = connected();
        ws.serverClose(1006);
        expect(h.disconnected).toHaveBeenCalledTimes(1);
        expect(mocks.emit).toHaveBeenLastCalledWith('map-connection', 'reconnecting');

        for (const delay of [1000, 2000, 4000, 8000, 10000, 10000]) {
            const before = sockets().length;
            vi.advanceTimersByTime(delay - 1);
            expect(sockets()).toHaveLength(before);
            vi.advanceTimersByTime(1);
            expect(sockets()).toHaveLength(before + 1);
            // 인증까지 가지 못하고 다시 끊긴다
            lastSocket().serverClose(1006);
        }
        // 인증된 적 없는 연결이 끊긴 것은 disconnected로 알리지 않는다
        expect(h.disconnected).toHaveBeenCalledTimes(1);
    });

    it('다시 연결에 성공하면 간격이 1초로 돌아가고 snapshot을 다시 알린다', () => {
        const { ws, h } = connected();
        ws.serverClose(1006);
        vi.advanceTimersByTime(1000);
        lastSocket().serverClose(1006);
        vi.advanceTimersByTime(2000);
        const again = lastSocket();
        again.open();
        expect(again.sent).toEqual([{ type: 'auth', access_token: 'tok-1' }]);
        again.receive(SNAPSHOT);
        expect(h.snapshot).toHaveBeenCalledTimes(2);

        const count = sockets().length;
        again.serverClose(1006);
        vi.advanceTimersByTime(1000);
        expect(sockets()).toHaveLength(count + 1);
    });

    it('끊긴 연결에 보내려던 move는 새 연결로 넘어가지 않는다', () => {
        const { socket, ws } = connected();
        socket.reportMove(100, 200, 'right', true);
        socket.reportMove(104, 200, 'right', true); // 간격에 막혀 대기
        ws.serverClose(1006);
        vi.advanceTimersByTime(1000);
        const again = lastSocket();
        again.open();
        again.receive(SNAPSHOT);
        vi.advanceTimersByTime(1000);
        expect(ws.moves).toHaveLength(1);
        expect(again.moves).toEqual([]);
    });

    it('4401이면 토큰을 재발급해 한 번 다시 연결한다', async () => {
        const { ws } = connected();
        mocks.getAccessToken.mockReturnValue('tok-2');
        ws.serverClose(4401);
        await vi.advanceTimersByTimeAsync(0);
        expect(mocks.refreshAccessToken).toHaveBeenCalledTimes(1);
        expect(sockets()).toHaveLength(2);
        lastSocket().open();
        expect(lastSocket().sent).toEqual([{ type: 'auth', access_token: 'tok-2' }]);
        expect(mocks.notifySessionLost).not.toHaveBeenCalled();
    });

    it('재발급한 토큰으로도 4401이면 더 연결하지 않고 세션이 끊겼다고 알린다', async () => {
        const { ws } = connected();
        ws.serverClose(4401);
        await vi.advanceTimersByTimeAsync(0);
        lastSocket().open();
        lastSocket().serverClose(4401);
        await vi.advanceTimersByTimeAsync(60_000);
        expect(sockets()).toHaveLength(2);
        expect(mocks.refreshAccessToken).toHaveBeenCalledTimes(1);
        expect(mocks.notifySessionLost).toHaveBeenCalledTimes(1);
    });

    it('4401 뒤 재발급에 실패하면 연결하지 않고 세션이 끊겼다고 알린다', async () => {
        const { ws } = connected();
        mocks.refreshAccessToken.mockRejectedValue(new Error('401'));
        ws.serverClose(4401);
        await vi.advanceTimersByTimeAsync(60_000);
        expect(sockets()).toHaveLength(1);
        expect(mocks.notifySessionLost).toHaveBeenCalledTimes(1);
    });

    it('4409(다른 곳에서 접속)면 알리고 다시 연결하지 않는다', async () => {
        const { ws, h } = connected();
        ws.serverClose(4409);
        await vi.advanceTimersByTimeAsync(60_000);
        expect(mocks.emit).toHaveBeenLastCalledWith('map-connection', 'replaced');
        expect(h.disconnected).toHaveBeenCalledTimes(1);
        expect(sockets()).toHaveLength(1);
        expect(mocks.refreshAccessToken).not.toHaveBeenCalled();
        expect(mocks.notifySessionLost).not.toHaveBeenCalled();
    });

    it('stop()하면 소켓을 닫고, 예약된 재연결과 대기 중인 move를 버린다', () => {
        const { socket, ws, h } = connected();
        socket.reportMove(100, 200, 'right', true);
        socket.reportMove(104, 200, 'right', true); // 대기
        socket.stop();
        expect(ws.closedWith).toBe(1000);
        vi.advanceTimersByTime(60_000);
        expect(ws.moves).toHaveLength(1);
        expect(sockets()).toHaveLength(1);
        expect(h.disconnected).not.toHaveBeenCalled();
    });

    it('재연결을 기다리는 중에 stop()하면 다시 연결하지 않는다', () => {
        const { socket, ws } = connected();
        ws.serverClose(1006);
        socket.stop();
        vi.advanceTimersByTime(60_000);
        expect(sockets()).toHaveLength(1);
    });
});
