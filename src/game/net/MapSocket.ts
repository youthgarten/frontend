import { getAccessToken, isConnectionUnstable, notifySessionLost, refreshAccessToken } from '../../api';
import type { Dir, MapClientMessage, MapPlayer, MapServerMessage } from '../../api';
import { emit } from '../../events';

// 멀티플레이 WebSocket 클라이언트 (API 명세서 8절).
// - 연결 직후 첫 메시지로 액세스 토큰을 보낸다. 토큰을 주소에 넣지 않는다.
// - 4401: 토큰을 한 번 재발급해 다시 연결한다. 또 4401이면 더 시도하지 않는다.
// - 4409: 다른 탭이나 기기에서 같은 계정으로 접속했다. 다시 연결하지 않는다.
// - 그 밖의 끊김: 1초, 2초, 4초 … 최대 10초 간격으로 다시 연결한다.
// 서버에 닿지 못해도 맵은 혼자 동작한다. 이 클래스는 알림만 보내고 맵을 멈추지 않는다.

export const MAP_WS_PATH = '/api/v1/ws/map';

/**
 * 초당 최대 10번 (명세: 그보다 많이 보내면 서버가 버린다).
 * 100ms에 딱 맞추면 네트워크 지연이 들쭉날쭉할 때 서버의 1초 창에 11번이 들어가 버려질 수 있어 조금 여유를 둔다.
 */
const MOVE_INTERVAL_MS = 110;
const RETRY_BASE_MS = 1000;
const RETRY_MAX_MS = 10000;

export interface MapSocketHandlers {
    /**
     * 인증에 성공해 다른 접속자 전체를 받았다. 연결할 때마다(다시 연결할 때도) 한 번씩 온다.
     * 서버가 알려 주는 내 시작 자리(me)는 쓰지 않는다. 내 자리는 맵(World)이 정한다.
     */
    snapshot(players: MapPlayer[]): void;
    joined(player: MapPlayer): void;
    moved(userId: number, x: number, y: number, dir: Dir, moving: boolean): void;
    updated(userId: number, level: number): void;
    left(userId: number): void;
    /** 연결이 끊겼다. 다른 사용자 표시를 비운다 */
    disconnected(): void;
}

interface MoveState {
    x: number;
    y: number;
    dir: Dir;
    moving: boolean;
}

export function mapSocketUrl(loc: Location = window.location) {
    const scheme = loc.protocol === 'https:' ? 'wss' : 'ws';
    return `${scheme}://${loc.host}${MAP_WS_PATH}`;
}

export class MapSocket {
    private ws: WebSocket | null = null;
    private stopped = false;
    private authed = false;
    /** 4401을 받고 재발급한 토큰으로 다시 붙는 중이면 true. 또 4401이면 포기한다 */
    private authRetried = false;
    private attempts = 0;
    private retryTimer: ReturnType<typeof setTimeout> | null = null;
    private lastSent: MoveState | null = null;
    private lastSentAt = 0;
    /** 간격이 아직 안 열려 보내지 못한 가장 최근 상태. 간격이 열리면 flushTimer가 보낸다 */
    private pending: MoveState | null = null;
    private flushTimer: ReturnType<typeof setTimeout> | null = null;

    constructor(private readonly handlers: MapSocketHandlers) {}

    start() {
        this.stopped = false;
        void this.connect();
    }

    /** 게임이 끝날 때 부른다. 소켓을 닫고 재연결 타이머를 지운다. 이후로는 아무 알림도 보내지 않는다 */
    stop() {
        this.stopped = true;
        this.clearRetry();
        this.clearPending();
        const ws = this.ws;
        this.ws = null;
        this.authed = false;
        if (ws) {
            ws.onopen = ws.onmessage = ws.onclose = ws.onerror = null;
            if (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN) ws.close(1000);
        }
    }

    /**
     * 내 캐릭터의 지금 상태를 알린다. 매 프레임 불러도 된다.
     * 마지막으로 보낸 상태와 다를 때만, 그리고 MOVE_INTERVAL_MS에 한 번까지만 보낸다.
     * 간격이 안 열렸을 때 받은 상태는 버리지 않고 간격이 열리는 대로 보낸다.
     * 그래서 마지막 보고(예: 멈춤 moving:false)는 그 뒤로 더 부르지 않아도 반드시 한 번 나간다.
     */
    reportMove(x: number, y: number, dir: Dir, moving: boolean) {
        if (!this.authed || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
        this.pending = { x: Math.round(x), y: Math.round(y), dir, moving };
        this.flush();
    }

    private flush() {
        const next = this.pending;
        if (!next || !this.authed || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
        const prev = this.lastSent;
        if (prev && prev.x === next.x && prev.y === next.y && prev.dir === next.dir && prev.moving === next.moving) {
            this.pending = null;
            return;
        }
        const wait = MOVE_INTERVAL_MS - (performance.now() - this.lastSentAt);
        if (wait > 0) {
            this.flushTimer ??= setTimeout(() => {
                this.flushTimer = null;
                this.flush();
            }, wait);
            return;
        }
        this.send({ type: 'move', ...next });
        this.lastSent = next;
        this.lastSentAt = performance.now();
        this.pending = null;
    }

    private clearPending() {
        if (this.flushTimer !== null) clearTimeout(this.flushTimer);
        this.flushTimer = null;
        this.pending = null;
    }

    private send(msg: MapClientMessage) {
        this.ws?.send(JSON.stringify(msg));
    }

    private async connect() {
        if (this.stopped) return;
        let token = getAccessToken();
        if (!token) {
            // 새로고침 직후처럼 메모리에 토큰이 없으면 먼저 재발급한다
            try {
                token = await refreshAccessToken();
            } catch {
                // 연결이 불안정해서 실패한 것이면 로그인은 유지되므로 멈추지 않고 다시 시도한다
                if (isConnectionUnstable()) this.scheduleRetry();
                else this.giveUp('액세스 토큰이 없고 재발급도 실패했다');
                return;
            }
            if (this.stopped) return;
        }

        let ws: WebSocket;
        try {
            ws = new WebSocket(mapSocketUrl());
        } catch {
            this.scheduleRetry();
            return;
        }
        this.ws = ws;
        const accessToken = token;

        ws.onopen = () => {
            this.send({ type: 'auth', access_token: accessToken });
        };
        ws.onmessage = (ev) => {
            let msg: MapServerMessage;
            try {
                msg = JSON.parse(String(ev.data)) as MapServerMessage;
            } catch {
                return;
            }
            this.handle(msg);
        };
        ws.onclose = (ev) => {
            if (this.ws !== ws) return;
            this.ws = null;
            const wasAuthed = this.authed;
            this.authed = false;
            // 끊긴 연결에 보내려던 상태는 버린다. 다시 연결되면 맵이 지금 상태를 새로 알린다
            this.clearPending();
            if (wasAuthed) this.handlers.disconnected();
            if (this.stopped) return;
            this.onClosed(ev.code);
        };
        // 오류 뒤에는 언제나 close가 온다. 처리는 close에서 한 번만 한다
        ws.onerror = () => undefined;
    }

    private handle(msg: MapServerMessage) {
        switch (msg.type) {
            case 'snapshot':
                this.authed = true;
                this.authRetried = false;
                this.attempts = 0;
                // 서버가 정한 시작 자리를 이미 알고 있으니, 그 자리에 서 있다는 보고는 보내지 않는다
                this.lastSent = { x: Math.round(msg.me.x), y: Math.round(msg.me.y), dir: msg.me.dir, moving: false };
                this.lastSentAt = 0;
                this.handlers.snapshot(msg.players);
                emit('map-connection', 'connected');
                break;
            case 'player_joined':
                this.handlers.joined(msg.player);
                break;
            case 'player_moved':
                this.handlers.moved(msg.user_id, msg.x, msg.y, msg.dir, msg.moving);
                break;
            case 'player_updated':
                this.handlers.updated(msg.user_id, msg.level);
                break;
            case 'player_left':
                this.handlers.left(msg.user_id);
                break;
        }
    }

    private onClosed(code: number) {
        if (code === 4409) {
            emit('map-connection', 'replaced');
            this.stopped = true;
            return;
        }
        if (code === 4401) {
            if (this.authRetried) {
                this.giveUp('재발급한 토큰으로도 인증에 실패했다 (4401)');
                return;
            }
            this.authRetried = true;
            emit('map-connection', 'reconnecting');
            refreshAccessToken()
                .then(() => this.connect())
                .catch(() => {
                    if (!isConnectionUnstable()) return this.giveUp('토큰 재발급에 실패했다 (4401)');
                    this.authRetried = false;
                    this.scheduleRetry();
                });
            return;
        }
        this.scheduleRetry();
    }

    private scheduleRetry() {
        if (this.stopped) return;
        emit('map-connection', 'reconnecting');
        const delay = Math.min(RETRY_BASE_MS * 2 ** this.attempts, RETRY_MAX_MS);
        this.attempts += 1;
        this.clearRetry();
        this.retryTimer = setTimeout(() => {
            this.retryTimer = null;
            void this.connect();
        }, delay);
    }

    private clearRetry() {
        if (this.retryTimer !== null) clearTimeout(this.retryTimer);
        this.retryTimer = null;
    }

    // 로그인이 풀린 경우다. 로그인 화면으로 보내는 일은 세션(화면) 쪽 몫이라 여기서는 연결만 멈춘다.
    private giveUp(reason: string) {
        if (this.stopped) return;
        this.stopped = true;
        this.clearRetry();
        console.warn(`[map] 멀티플레이 연결을 멈춘다: ${reason}`);
        // 명세: 재발급 뒤에도 인증에 실패하면 로그인 화면으로 보낸다
        notifySessionLost();
    }
}
