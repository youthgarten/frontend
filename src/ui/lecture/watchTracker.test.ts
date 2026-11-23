import { describe, expect, it, vi } from 'vitest';
import type { ProgressRequest, ProgressResponse } from '../../api';
import { MAX_RANGES_PER_REPORT, WatchTracker } from './watchTracker';

// 수강률은 "실제로 본 구간"으로 정해진다. 구간을 잘못 재면 본 만큼 인정받지 못하거나 안 본 구간이 들어간다.

const OK: ProgressResponse = { progress_rate: 0, completed: false, just_completed: false };

function setup(duration = 600) {
    const sent: ProgressRequest[] = [];
    const send = vi.fn(async (body: ProgressRequest) => {
        sent.push(body);
        return OK;
    });
    const tracker = new WatchTracker(duration, send, () => {});
    return { tracker, sent, send };
}

/** start초부터 seconds초 동안 0.5초 간격으로 재생한 것처럼 위치를 넣는다. 마지막 벽시계 시각을 돌려준다 */
function play(tracker: WatchTracker, start: number, seconds: number, wallStart = 0) {
    for (let i = 0; i <= seconds * 2; i++) tracker.sample(start + i * 0.5, wallStart + i * 500);
    return wallStart + seconds * 1000;
}

describe('WatchTracker', () => {
    it('이어서 본 구간을 하나로 보고한다', async () => {
        const { tracker, sent } = setup();
        play(tracker, 0, 10);
        await tracker.report(10);
        expect(sent).toEqual([{ watched_ranges: [[0, 10]], position_sec: 10 }]);
    });

    it('앞으로 건너뛰면 구간을 끊는다. 건너뛴 부분은 들어가지 않는다', async () => {
        const { tracker, sent } = setup();
        const wall = play(tracker, 0, 3);
        play(tracker, 200, 3, wall + 500);
        await tracker.report(203);
        expect(sent[0].watched_ranges).toEqual([[0, 3], [200, 203]]);
    });

    it('명시적인 이동은 두 초 이내라도 수강 구간에서 제외한다', async () => {
        const { tracker, sent } = setup();
        const wall = play(tracker, 0, 3);
        tracker.interrupt();
        play(tracker, 5, 3, wall + 500);
        await tracker.report(8);
        expect(sent[0].watched_ranges).toEqual([[0, 3], [5, 8]]);
    });

    it('뒤로 되감아 다시 본 구간은 서버가 합치도록 겹친 채로 하나로 보낸다', async () => {
        const { tracker, sent } = setup();
        const wall = play(tracker, 0, 10);
        play(tracker, 4, 4, wall + 500);
        await tracker.report(8);
        // [0,10]과 [4,8]은 겹치므로 [0,10] 하나가 된다
        expect(sent[0].watched_ranges).toEqual([[0, 10]]);
    });

    it('나눠 보고해도 구간 사이에 틈이 생기지 않는다', async () => {
        const { tracker, sent } = setup();
        let wall = play(tracker, 0, 9.5);
        await tracker.report(9.5);
        wall = play(tracker, 9.5, 10, wall);
        await tracker.report(19.5);
        const [first] = sent[0].watched_ranges;
        const [second] = sent[1].watched_ranges;
        expect(second[0]).toBe(first[1]);
    });

    it('영상 길이를 넘는 위치는 길이로 자른다', async () => {
        const { tracker, sent } = setup(30);
        play(tracker, 25, 5);
        tracker.stop(31);
        await tracker.report(31);
        expect(sent[0]).toEqual({ watched_ranges: [[25, 30]], position_sec: 30 });
    });

    it('보고가 실패하면 그 구간을 다음 보고에 함께 보낸다', async () => {
        const { tracker, sent, send } = setup();
        send.mockRejectedValueOnce(new Error('network'));
        let wall = play(tracker, 0, 10);
        await tracker.report(10);
        expect(sent).toHaveLength(0);
        expect(tracker.hasUnsent()).toBe(true);

        wall = play(tracker, 10, 10, wall);
        await tracker.report(20);
        expect(sent[0].watched_ranges).toEqual([[0, 20]]);
        expect(tracker.hasUnsent()).toBe(false);
    });

    it(`한 번에 ${MAX_RANGES_PER_REPORT}개까지만 보내고 나머지는 다음에 보낸다`, async () => {
        const { tracker, sent } = setup(10_000);
        let wall = 0;
        for (let i = 0; i < 25; i++) wall = play(tracker, i * 100, 2, wall + 500);
        tracker.stop(2402);
        await tracker.report(2402);
        expect(sent[0].watched_ranges).toHaveLength(MAX_RANGES_PER_REPORT);
        expect(tracker.hasUnsent()).toBe(true);
        await tracker.report(2402);
        expect(sent[1].watched_ranges).toHaveLength(5);
    });

    it('drain으로 바로 꺼낸 구간은 다음 보고에 다시 들어가지 않고, restore하면 다시 들어간다', async () => {
        const { tracker, sent } = setup();
        let wall = play(tracker, 0, 10);
        const body = tracker.drain(10);
        expect(body).toEqual({ watched_ranges: [[0, 10]], position_sec: 10 });
        expect(tracker.drain(10)).toBeNull();

        wall = play(tracker, 10, 5, wall);
        await tracker.report(15);
        expect(sent[0].watched_ranges).toEqual([[10, 15]]);

        tracker.restore(body!);
        await tracker.report(16);
        expect(sent[1].watched_ranges).toEqual([[0, 10]]);
    });

    it('새로 본 구간도 없고 위치도 그대로면 보내지 않는다', async () => {
        const { tracker, send } = setup();
        play(tracker, 0, 5);
        tracker.stop(5);
        await tracker.report(5);
        await tracker.report(5);
        expect(send).toHaveBeenCalledTimes(1);
    });
});
