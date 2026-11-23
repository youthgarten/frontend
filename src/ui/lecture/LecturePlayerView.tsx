import { useCallback, useEffect, useRef, useState } from 'react';
import { API_BASE, errorMessage, getAccessToken } from '../../api';
import { api } from '../../api';
import type { LectureDetail, ProgressRequest, ProgressResponse } from '../../api';
import { characterSpec } from '../../character';
import { useSession } from '../../session/SessionProvider';
import { KitArt } from '../hud/KitArt';
import { Button, Chip, Loading, Notice, PixelCharacter, ProgressBar } from '../kit';
import { COMPLETE_RATE, formatTime, lectureStatus, percent, tasksForLecture } from './format';
import { createYouTubePlayer, isMockVideo, localVideoUrl, MockPlayer, NativeVideoPlayer, type LecturePlayer, type PlayerState } from './player';
import { WatchTracker } from './watchTracker';

// 강의 재생 화면. 영상 아래에 수강률 막대와 "실제로 본 부분만 들어가요" 설명을 둔다.
// 시청 구간 측정과 보고는 VideoStage가 맡는다.

/** 창을 닫거나 목록으로 돌아가기 전에 부르는 마지막 보고. 재생 화면이 등록한다 */
export type FlushRef = { current: (() => Promise<void>) | null };

const SAMPLE_MS = 500;
const REPORT_MS = 10_000;

const isActive = (s: PlayerState) => s === 'playing' || s === 'buffering';

/**
 * 페이지가 사라지는 중에도 끝까지 나가는 보고 (keepalive). 탭 닫기, 새로고침, 로그아웃에 쓴다.
 * 공용 클라이언트는 keepalive를 모르고, sendBeacon은 Authorization 헤더를 못 붙여서 fetch를 직접 부른다.
 * 토큰 재발급은 하지 않는다. 사라지는 페이지에서는 기다릴 수 없다.
 */
async function sendProgressKeepalive(id: number, body: ProgressRequest, token: string | null): Promise<ProgressResponse> {
    const res = await fetch(`${API_BASE}/lectures/${id}/progress`, {
        method: 'POST',
        keepalive: true,
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(String(res.status));
    return (await res.json()) as ProgressResponse;
}

export function LecturePlayerView({ lectureId, flushRef, onBack, onGuideToExam }: {
    lectureId: number;
    flushRef: FlushRef;
    onBack: () => void;
    onGuideToExam: () => void;
}) {
    const { tasks } = useSession();
    const [detail, setDetail] = useState<LectureDetail | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [rate, setRate] = useState(0);
    const [completed, setCompleted] = useState(false);
    const [justCompleted, setJustCompleted] = useState(false);

    const load = useCallback(async () => {
        setError(null);
        setDetail(null);
        try {
            const d = await api.lecture(lectureId);
            setDetail(d);
            setRate(d.progress_rate);
            setCompleted(d.completed);
        } catch (e) {
            setError(errorMessage(e));
        }
    }, [lectureId]);

    useEffect(() => {
        void load();
    }, [load]);

    const onResult = useCallback((res: ProgressResponse) => {
        setRate(res.progress_rate);
        setCompleted(res.completed);
        if (res.just_completed) setJustCompleted(true);
    }, []);

    const back = (
        <Button size="sm" onClick={onBack}>
            ← 목록으로
        </Button>
    );

    if (error) {
        return (
            <div className="flex flex-col gap-4">
                <div>{back}</div>
                <Notice tone="danger" action={<Button size="sm" onClick={() => void load()}>다시 시도</Button>}>
                    강의를 불러오지 못했어요. {error}
                </Notice>
            </div>
        );
    }
    if (!detail) {
        return (
            <div className="flex flex-col gap-4">
                <div>{back}</div>
                <Loading>강의를 불러오는 중이에요</Loading>
            </div>
        );
    }

    const status = lectureStatus({ progress_rate: rate, completed });
    const linked = tasksForLecture(tasks, detail.id);
    const linkedText = linked.map((t) => `'${t.title}'`).join(', ');

    return (
        <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                {back}
                <h3 className="min-w-0 flex-1 text-[18px] font-bold leading-snug">{detail.title}</h3>
                <span className="font-pixel text-[13px] text-ink-soft">길이 {formatTime(detail.duration_sec)}</span>
            </div>

            <VideoStage
                key={detail.id}
                detail={detail}
                flushRef={flushRef}
                onResult={onResult}
                calm={justCompleted}
            />

            {justCompleted && (
                <div role="status" className="flex flex-wrap items-center gap-4 border-l-[6px] border-ok bg-ok-soft px-4 py-3">
                    <KitArt kind="object" name="trophy" scale={1} />
                    <div className="min-w-0 flex-1 text-[15px] leading-snug">
                        <p className="font-pixel text-[16px] font-bold">수강 완료!</p>
                        <p>
                            이 강의의 80% 이상을 시청했어요.
                            {linkedText && <> 이제 {linkedText} 시험을 볼 수 있어요.</>}
                        </p>
                    </div>
                    {detail.task_id !== null && (
                        <Button variant="primary" onClick={onGuideToExam}>시험장으로 이동</Button>
                    )}
                </div>
            )}

            <section className="bg-paper-sunk px-4 py-3.5" aria-label="수강률">
                <div className="flex items-center gap-3">
                    <span className="font-pixel text-[14px] font-bold">수강률</span>
                    <ProgressBar
                        value={rate}
                        tone={completed ? 'ok' : 'sun'}
                        mark={COMPLETE_RATE}
                        className="flex-1"
                        label={`수강률 ${percent(rate)}%`}
                    />
                    <span className="w-11 text-right font-pixel text-[15px] font-bold">{percent(rate)}%</span>
                    <Chip tone={completed ? 'ok' : rate > 0 ? 'sun' : 'neutral'}>{status.text}</Chip>
                </div>
                <p className="mt-2 text-[14px] leading-snug text-ink-soft">
                    실제로 본 부분만 수강률에 들어가요. 80% 이상 보면 수강 완료예요. 건너뛴 부분은 들어가지 않고, 보는 동안 10초마다 저장돼요.
                </p>
                {/* 명세 5절: 다시 보거나 새로고침한 뒤에도 completed이고 연결 과제가 있으면 이동 버튼을 보여 준다 */}
                {completed && !justCompleted && detail.task_id !== null && (
                    <div className="mt-2">
                        <Button size="sm" variant="primary" onClick={onGuideToExam}>시험장으로 이동</Button>
                    </div>
                )}
                {!completed && linkedText && (
                    <p className="mt-1 text-[14px] leading-snug text-ink-soft">이 강의의 80% 이상을 시청하면 {linkedText} 시험을 볼 수 있어요.</p>
                )}
            </section>
        </div>
    );
}

// ── 영상 영역: 플레이어를 만들고, 본 구간을 재고, 보고한다 ──

function VideoStage({ detail, flushRef, onResult, calm }: {
    detail: LectureDetail;
    flushRef: FlushRef;
    onResult: (res: ProgressResponse) => void;
    /** 수강 완료 안내가 떠 있으면 재생 버튼을 덜 눈에 띄게 한다 (가장 권하는 행동이 바뀌므로) */
    calm: boolean;
}) {
    const stageRef = useRef<HTMLDivElement>(null);
    const [player, setPlayer] = useState<LecturePlayer | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [attempt, setAttempt] = useState(0);
    const onResultRef = useRef(onResult);
    onResultRef.current = onResult;

    const mock = isMockVideo(detail.youtube_video_id);
    const videoUrl = localVideoUrl(detail.youtube_video_id);
    // 거의 끝까지 본 강의는 처음부터 다시 튼다
    const start = detail.last_position_sec >= detail.duration_sec - 5 ? 0 : detail.last_position_sec;

    useEffect(() => {
        const tracker = new WatchTracker(
            detail.duration_sec,
            (body) => api.reportProgress(detail.id, body),
            (res) => onResultRef.current(res),
        );
        const abort = new AbortController();
        let current: LecturePlayer | null = null;
        let host: HTMLDivElement | null = null;
        let disposed = false;

        const stop = (p: LecturePlayer) => {
            if (p.getState() === 'seeking') tracker.interrupt();
            else tracker.stop(p.getTime());
        };

        const attach = (p: LecturePlayer) => {
            current = p;
            setPlayer(p);
            p.onStateChange((s) => {
                if (s === 'seeking') tracker.interrupt();
                else if (isActive(s)) tracker.sample(p.getTime());
                else if (s === 'paused' || s === 'ended') {
                    // 일시정지, 끝까지 봄: 구간을 닫고 바로 보고한다
                    const t = p.getTime();
                    tracker.stop(t);
                    void tracker.report(t);
                }
            });
        };

        setLoadError(null);
        setPlayer(null);
        if (mock) {
            attach(new MockPlayer(detail.duration_sec, start));
        } else if (videoUrl) {
            const video = document.createElement('video');
            video.controls = true;
            video.playsInline = true;
            video.preload = 'metadata';
            video.className = 'absolute inset-0 h-full w-full';
            video.setAttribute('aria-label', detail.title);
            attach(new NativeVideoPlayer(video, start, () => {
                if (!disposed) setLoadError('강의 영상을 재생할 수 없어요. 잠시 뒤 다시 시도해 주세요.');
            }));
            video.src = videoUrl;
            stageRef.current?.appendChild(video);
        } else {
            // YouTube API가 이 div를 iframe으로 바꿔 끼운다. React가 그리지 않는 div를 따로 만들어 넘긴다
            host = document.createElement('div');
            stageRef.current?.appendChild(host);
            createYouTubePlayer(host, detail.youtube_video_id, start, abort.signal)
                .then((p) => {
                    if (disposed) p.destroy();
                    else attach(p);
                })
                .catch((e: Error) => {
                    if (disposed) return;
                    setLoadError(
                        e.message === 'YOUTUBE_VIDEO_ERROR'
                            ? '이 영상을 재생할 수 없어요. 잠시 뒤 다시 시도해 주세요.'
                            : '영상을 불러오지 못했어요. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.',
                    );
                });
        }

        // 재생 중에는 0.5초마다 위치를 재고, 10초마다 보고한다
        // 로그아웃하면 토큰이 먼저 지워진 뒤에 이 화면이 사라진다. 마지막 보고에 쓸 토큰을 기억해 둔다
        let token = getAccessToken();
        const sampler = window.setInterval(() => {
            token = getAccessToken() ?? token;
            if (current && isActive(current.getState())) tracker.sample(current.getTime());
        }, SAMPLE_MS);
        const reporter = window.setInterval(() => {
            if (current && isActive(current.getState())) void tracker.report(current.getTime());
        }, REPORT_MS);
        // 기다릴 수 없을 때(탭 닫기, 새로고침, 화면이 사라짐)의 보고. 앞의 보고를 기다리지 않고 keepalive로 바로 보낸다.
        // 꺼낸 구간은 tracker에서 빠지므로 두 번 보내지 않는다. 실패하면 되돌려 다음 보고에 싣는다
        const flushNow = () => {
            if (!current) return;
            const t = current.getTime();
            if (isActive(current.getState())) tracker.sample(t);
            const body = tracker.drain(t);
            if (!body) return;
            sendProgressKeepalive(detail.id, body, getAccessToken() ?? token).then(
                (res) => onResultRef.current(res),
                () => tracker.restore(body),
            );
        };
        // 다른 탭으로 가거나 창을 내리면 그동안 본 것을 먼저 보고해 둔다. 모바일에서는 이것이 마지막 기회다
        const onHide = () => {
            if (document.visibilityState === 'hidden') flushNow();
        };
        document.addEventListener('visibilitychange', onHide);
        window.addEventListener('pagehide', flushNow);

        const flush = async () => {
            if (!current) return;
            const t = current.getTime();
            stop(current);
            current.pause();
            await tracker.report(t);
        };
        flushRef.current = flush;

        return () => {
            disposed = true;
            abort.abort();
            window.clearInterval(sampler);
            window.clearInterval(reporter);
            document.removeEventListener('visibilitychange', onHide);
            window.removeEventListener('pagehide', flushNow);
            if (flushRef.current === flush) flushRef.current = null;
            if (current) {
                // 마지막 보고 없이 사라지는 경우(로그아웃 등)에도 본 구간을 잃지 않게 보내 둔다.
                // 이때는 토큰이 이미 지워졌을 수 있어서 공용 클라이언트가 아니라 기억해 둔 토큰으로 보낸다
                stop(current);
                flushNow();
                current.destroy();
            }
            host?.remove();
        };
        // detail은 key로 묶여 있어서 바뀌지 않는다. 다시 시도(attempt)할 때만 새로 만든다
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [attempt]);

    return (
        <div className="mx-auto w-full max-w-[min(100%,calc(52vh*16/9))]">
            <div ref={stageRef} className="relative aspect-video w-full overflow-hidden border-[3px] border-ink bg-ink [&>div]:absolute [&>div]:inset-0 [&>iframe]:absolute [&>iframe]:inset-0 [&>iframe]:h-full [&>iframe]:w-full">
                {loadError && (
                    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-paper-sunk p-6 text-center">
                        <KitArt kind="emote" name="sweat" scale={3} />
                        <p className="max-w-[420px] text-[15px] leading-snug">{loadError}</p>
                        <Button onClick={() => setAttempt((n) => n + 1)}>다시 시도</Button>
                    </div>
                )}
                {!mock && !player && !loadError && (
                    <div className="absolute inset-0 z-10 flex items-center justify-center bg-paper-sunk">
                        <Loading>영상을 준비하는 중이에요</Loading>
                    </div>
                )}
                {mock && player instanceof MockPlayer && <MockScreen player={player} duration={detail.duration_sec} calm={calm} />}
            </div>
            {start > 0 && (
                <p className="mt-2 text-[14px] text-ink-soft">지난번에 본 {formatTime(start)}부터 이어서 재생해요.</p>
            )}
        </div>
    );
}

// ── 흉내 플레이어 화면: 영상 대신 "준비 중" 그림과 재생 조작 ──

function MockScreen({ player, duration, calm }: { player: MockPlayer; duration: number; calm: boolean }) {
    const [state, setState] = useState<PlayerState>(player.getState());
    const [time, setTime] = useState(player.getTime());

    useEffect(() => {
        const off = player.onStateChange((s) => {
            setState(s);
            setTime(player.getTime());
        });
        // 재생 중에는 위치 표시를 4번/초 갱신한다
        const tick = window.setInterval(() => {
            if (player.getState() === 'playing') setTime(player.getTime());
        }, 250);
        return () => {
            off();
            window.clearInterval(tick);
        };
    }, [player]);

    const playing = state === 'playing';

    return (
        <div className="absolute inset-0 flex flex-col bg-sky">
            <div className="flex min-h-0 flex-1 items-end justify-center gap-6 border-b-[6px] border-grass-deep px-6">
                <KitArt kind="object" name="chalkboard" scale={3} />
                <PixelCharacter spec={characterSpec(9, 1, playing ? 'excited' : 'curious')} scale={3} breathing={playing} />
                <div className="mb-auto mt-6 max-w-[220px] self-start bg-paper px-box-flat px-3 py-2 text-left">
                    <p className="font-pixel text-[14px] font-bold">영상 준비 중</p>
                    <p className="mt-1 text-[14px] leading-snug text-ink-soft">
                        아직 실제 영상이 없어서 연습용 화면을 보여 줘요. 재생하면 진짜 영상처럼 시간이 흘러요.
                    </p>
                </div>
            </div>
            <div className="flex items-center gap-3 bg-paper px-4 py-2.5">
                <Button
                    size="sm"
                    variant={calm ? 'secondary' : 'primary'}
                    onClick={() => (playing ? player.pause() : player.play())}
                    className="w-24"
                >
                    {playing ? '일시정지' : state === 'ended' ? '다시 재생' : '재생'}
                </Button>
                <input
                    type="range"
                    min={0}
                    max={duration}
                    step={1}
                    value={Math.floor(time)}
                    onChange={(e) => player.seek(Number(e.target.value))}
                    aria-label="재생 위치"
                    aria-valuetext={`${formatTime(time)} / ${formatTime(duration)}`}
                    className="h-2 min-w-0 flex-1 cursor-pointer accent-uniform"
                />
                <span className="w-[92px] shrink-0 text-right font-pixel text-[13px] tabular-nums">
                    {formatTime(time)} / {formatTime(duration)}
                </span>
            </div>
        </div>
    );
}
