import type { ProgressRequest, ProgressResponse } from '../../api';

// "실제로 재생된 구간"을 모아 서버에 보고한다 (명세 5절 POST /lectures/{id}/progress).
// - 재생 중에 0.5초마다 위치를 받아(sample) 이어지는 동안은 한 구간으로 늘린다
// - 위치가 갑자기 크게 바뀌면(건너뛰기) 구간을 끊고 새로 시작한다
// - 보고는 한 번에 하나씩 차례로 보낸다. 실패하면 보내지 못한 구간을 다음 보고 때 함께 보낸다
// React를 모르는 순수한 클래스로 두어 화면이 다시 그려져도 쌓인 구간이 흔들리지 않게 한다.

/** 한 번에 보낼 수 있는 구간 수 (명세) */
export const MAX_RANGES_PER_REPORT = 20;
/** 앞으로 가는 것이 이 정도를 넘으면 건너뛰기로 본다: 흐른 시간 × 배속 여유 + 여유 초 */
const MAX_SPEED = 2;
const SLACK_SEC = 1.5;
/** 뒤로 이만큼 넘게 가면 되감기로 본다 */
const BACK_SLACK_SEC = 0.5;

type Range = [number, number];

export class WatchTracker {
    /** 끊긴 구간들 (아직 보내지 못한 것) */
    private closed: Range[] = [];
    /** 지금 이어지고 있는 구간의 시작과 마지막으로 본 위치 */
    private segStart: number | null = null;
    private segLast = 0;
    private lastWall = 0;
    private lastPosition = -1;
    private queue: Promise<void> = Promise.resolve();

    constructor(
        private readonly duration: number,
        private readonly send: (body: ProgressRequest) => Promise<ProgressResponse>,
        private readonly onResult: (res: ProgressResponse) => void,
    ) {}

    /** 재생 중일 때 현재 위치를 넣는다 */
    sample(t: number, now = performance.now()) {
        if (this.segStart === null) {
            this.segStart = t;
            this.segLast = t;
            this.lastWall = now;
            return;
        }
        const wallSec = Math.max(0, (now - this.lastWall) / 1000);
        const delta = t - this.segLast;
        this.lastWall = now;
        if (delta < -BACK_SLACK_SEC || delta > wallSec * MAX_SPEED + SLACK_SEC) {
            // 건너뛰었다: 지금까지 본 구간을 닫고 새 위치에서 다시 시작
            this.closeSegment();
            this.segStart = t;
            this.segLast = t;
            return;
        }
        if (t > this.segLast) this.segLast = t;
    }

    /** 멈추거나 끝났을 때. 마지막 위치까지 넣고 구간을 닫는다 */
    stop(t: number) {
        if (this.segStart !== null) this.sample(t);
        this.closeSegment();
    }

    /** 이동 이벤트의 재생 위치는 이미 바뀌었으므로 마지막 시청 지점에서 닫는다. */
    interrupt() {
        this.closeSegment();
    }

    /** 아직 보내지 못한 구간이 있는가 */
    hasUnsent() {
        return this.closed.length > 0 || (this.segStart !== null && this.segLast > this.segStart);
    }

    /**
     * 쌓인 구간과 현재 위치를 보고한다. 앞의 보고가 끝난 뒤에 보낸다.
     * 보낼 구간도 없고 위치도 그대로면 보내지 않는다.
     */
    report(position: number): Promise<void> {
        const run = async () => {
            const batch = this.takeBatch();
            const pos = Math.round(clamp(position, 0, this.duration));
            if (batch.length === 0 && pos === this.lastPosition) return;
            try {
                const res = await this.send({ watched_ranges: batch, position_sec: pos });
                this.lastPosition = pos;
                this.onResult(res);
            } catch {
                // 보내지 못한 구간은 되돌려 두고 다음 보고 때 함께 보낸다. 재생은 멈추지 않는다
                this.closed = [...batch, ...this.closed];
            }
        };
        this.queue = this.queue.then(run, run);
        return this.queue;
    }

    /**
     * 보낼 구간을 차례를 기다리지 않고 지금 바로 꺼낸다. 탭이 닫힐 때처럼 앞의 보고를 기다릴 수 없을 때 쓴다.
     * 꺼낸 구간은 쌓아 둔 데서 빠지므로 다음 보고에 다시 들어가지 않는다. 보낼 구간이 없으면 null.
     * 보내지 못했으면 restore로 되돌린다.
     */
    drain(position: number): ProgressRequest | null {
        const batch = this.takeBatch();
        if (batch.length === 0) return null;
        return { watched_ranges: batch, position_sec: Math.round(clamp(position, 0, this.duration)) };
    }

    /** drain으로 꺼냈지만 보내지 못한 구간을 되돌린다 */
    restore(body: ProgressRequest) {
        this.closed = [...body.watched_ranges, ...this.closed];
    }

    /** 이번에 보낼 구간을 떼어 낸다. 이어지는 구간은 지금까지를 떼고, 같은 자리에서 계속 이어 간다 */
    private takeBatch(): Range[] {
        if (this.segStart !== null && this.segLast > this.segStart) {
            this.closed.push([this.segStart, this.segLast]);
            this.segStart = this.segLast;
        }
        const all = normalize(this.closed, this.duration);
        this.closed = all.slice(MAX_RANGES_PER_REPORT);
        return all.slice(0, MAX_RANGES_PER_REPORT);
    }

    private closeSegment() {
        if (this.segStart !== null && this.segLast > this.segStart) this.closed.push([this.segStart, this.segLast]);
        this.segStart = null;
    }
}

/**
 * 보낼 모양으로 다듬는다: 0~길이로 자르고, 초를 정수로 맞추고(명세 예시가 정수다),
 * 겹치거나 맞닿은 구간을 합치고, 길이가 0인 구간은 버린다.
 * 이어지는 구간을 나눠 보낼 때 앞 구간의 끝과 뒤 구간의 시작이 같은 값으로 반올림되므로 틈이 생기지 않는다.
 */
function normalize(ranges: Range[], duration: number): Range[] {
    const rounded = ranges
        .map(([a, b]): Range => [Math.round(clamp(a, 0, duration)), Math.round(clamp(b, 0, duration))])
        .filter(([a, b]) => b > a)
        .sort((x, y) => x[0] - y[0]);
    const merged: Range[] = [];
    for (const r of rounded) {
        const prev = merged[merged.length - 1];
        if (prev && r[0] <= prev[1]) prev[1] = Math.max(prev[1], r[1]);
        else merged.push([r[0], r[1]]);
    }
    return merged;
}

function clamp(v: number, lo: number, hi: number) {
    return Math.min(Math.max(v, lo), hi);
}
