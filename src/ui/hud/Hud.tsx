import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import type { TaskSummary } from '../../api';
import { characterSpec, levelInfo, MAX_LEVEL } from '../../character';
import { current, emit, on, type GameEvents } from '../../events';
import { useMe, useSession } from '../../session/SessionProvider';
import { Button, Kbd, LevelBadge, Notice, PixelCharacter, useMapLock } from '../kit';
import { HatDots } from './HatTrack';

// 맵 위에 늘 떠 있는 정보. 맵을 가리지 않게 가장자리에 작게 두고,
// 빈 곳은 마우스 입력을 맵으로 흘려보낸다 (바깥 틀은 pointer-events-none, 카드만 auto).

/**
 * 마우스로 누른 뒤 버튼에 초점이 남으면 Space가 버튼을 또 누르고 맵의 상호작용 키와 겹친다.
 * 그래서 마우스로 눌렀을 때만 초점을 내려놓는다. 키보드로 누른 경우(detail === 0)는 초점을 그대로 둬서
 * Tab으로 다니는 사용자가 제자리를 잃지 않게 한다.
 */
function releaseFocus(e: MouseEvent<HTMLButtonElement>) {
    if (e.detail > 0) e.currentTarget.blur();
}

export function Hud({ onOpenHelp }: { onOpenHelp: () => void }) {
    const connection = useLatest('map-connection');
    const population = useLatest('map-population');

    return (
        <div className="pointer-events-none fixed inset-0 z-30 select-none">
            {/* 왼쪽 아래: 내 정보와 지금 할 일. 아래 가운데는 맵의 안내 문구("F 또는 Space: …") 자리라 비워 둔다 */}
            <div className="absolute bottom-5 left-4 flex w-[300px] flex-col gap-5">
                <MyCard />
                <NextStepCard />
            </div>

            {/* 오른쪽 위: 접속자 수, 조작법, 로그아웃 */}
            <div className="absolute right-4 top-4 flex items-start gap-3">
                {population !== undefined && (
                    <p className="pointer-events-auto bg-paper/90 px-box-flat px-3 py-2 font-pixel text-[13px] font-bold leading-none">
                        <span className="mr-1.5 inline-block h-2 w-2 bg-grass-deep align-middle" aria-hidden />
                        {population > 0 ? `함께 있는 친구 ${population}명` : "지금은 나 혼자 있어요"}
                    </p>
                )}
                <Button
                    size="sm"
                    className="pointer-events-auto"
                    onClick={(e) => {
                        releaseFocus(e);
                        onOpenHelp();
                    }}
                >
                    조작법
                </Button>
                <LogoutButton />
            </div>

            {/* 가운데 위: 연결 상태 */}
            {connection && connection !== 'connected' && (
                <div className="absolute left-1/2 top-16 w-[min(560px,calc(100vw-2rem))] -translate-x-1/2">
                    <ConnectionBanner state={connection} />
                </div>
            )}

        </div>
    );
}

/** 맵이 보낸 이벤트의 가장 최근 값. HUD가 맵보다 늦게 떠도 지나간 값을 놓치지 않는다 */
function useLatest<K extends 'map-connection' | 'map-population' | 'place'>(event: K): GameEvents[K][0] | undefined {
    const [value, setValue] = useState<GameEvents[K][0] | undefined>(() => current(event)?.[0]);
    useEffect(() => {
        const handler = (...args: GameEvents[K]) => setValue(args[0]);
        return on(event, handler);
    }, [event]);
    return value;
}

// ── 내 정보 ──

function MyCard() {
    const me = useMe();
    const info = levelInfo(me.level);
    const isMax = info.level >= MAX_LEVEL;
    // 서로 다른 과제를 하나 통과할 때마다 1레벨. 다음 레벨은 통과 개수가 지금 레벨과 같아지면 된다
    const left = Math.max(1, info.level - me.passed_task_count);

    return (
        <section className="pointer-events-auto bg-paper px-box px-3.5 pb-3 pt-3" aria-label="내 정보">
            <div className="flex items-center gap-3">
                <div className="bg-sky px-1 pt-1">
                    <PixelCharacter spec={characterSpec(me.id, me.level)} crop="head" scale={1} />
                </div>
                <div className="min-w-0 flex-1">
                    <p className="truncate font-pixel text-[16px] font-bold leading-tight">{me.nickname}</p>
                    <div className="mt-1 flex items-center gap-2">
                        <LevelBadge level={me.level} showName />
                    </div>
                    <p className="mt-1 truncate text-[13px] leading-tight text-ink-soft">{me.job.name}</p>
                </div>
            </div>
            <div className="mt-3 border-t-2 border-dashed border-line pt-2.5">
                <div className="flex items-center justify-between gap-2">
                    <HatDots current={info.level} />
                    <span className="font-pixel text-[12px] text-ink-soft">통과 {me.passed_task_count}개</span>
                </div>
                <p className="mt-1.5 text-[14px] leading-snug">
                    {isMax ? (
                        <>최고 레벨이에요. <b>골드 모자</b>를 모았어요!</>
                    ) : (
                        <>시험 <b>{left}개</b>를 더 통과하면 <b>{levelInfo(info.level + 1).hatName}</b>를 써요.</>
                    )}
                </p>
            </div>
        </section>
    );
}

// ── 지금 할 일 ──

type NextStep =
    | { kind: 'loading' }
    | { kind: 'none' }
    | { kind: 'all-passed' }
    | { kind: 'lecture'; task: TaskSummary; order: number; total: number }
    | { kind: 'exam'; task: TaskSummary; order: number; total: number };

function nextStep(tasks: TaskSummary[] | null): NextStep {
    if (tasks === null) return { kind: 'loading' };
    if (tasks.length === 0) return { kind: 'none' };
    const index = tasks.findIndex((t) => !t.passed);
    if (index < 0) return { kind: 'all-passed' };
    const task = tasks[index];
    const ready = task.available || task.required_lecture.completed;
    return { kind: ready ? 'exam' : 'lecture', task, order: index + 1, total: tasks.length };
}

function NextStepCard() {
    const { tasks } = useSession();
    const [open, setOpen] = useState(true);
    const step = nextStep(tasks);
    // 캐릭터가 지금 있는 공간. 이미 그 건물 안이면 이동 버튼 대신 무엇을 누르면 되는지 알려 준다
    const place = useLatest('place');

    let body: ReactNode;
    switch (step.kind) {
        case 'loading':
            body = <p className="h-[76px] text-[14px] text-ink-soft">할 일을 확인하는 중이에요</p>;
            break;
        case 'none':
            body = <p className="text-[14px]">지금은 준비된 과제가 없어요. 맵을 둘러보며 기다려 주세요.</p>;
            break;
        case 'all-passed':
            body = (
                <p className="text-[14px] leading-snug">
                    <b>모든 시험을 통과했어요!</b> 정말 대단해요. 강의를 다시 보거나 지난 결과를 둘러볼 수 있어요.
                </p>
            );
            break;
        case 'lecture':
            body = (
                <>
                    <StepTitle tag="강의 듣기" order={step.order} total={step.total}>{step.task.required_lecture.title}</StepTitle>
                    <p className="mt-1.5 text-[14px] leading-snug text-ink-soft">
                        {place === 'classroom' ? '위쪽 칠판' : '강의실 칠판'} 앞이나 자리에서 <Kbd>F</Kbd>를 눌러 들어요. 80% 이상 시청하면 이 과제의 시험을 볼 수 있어요.
                    </p>
                    {place !== 'classroom' && (
                        <Button
                            size="sm"
                            variant="primary"
                            className="mt-3 w-full"
                            onClick={(e) => {
                                releaseFocus(e);
                                emit('goto', 'classroom');
                            }}
                        >
                            강의실로 이동
                        </Button>
                    )}
                </>
            );
            break;
        case 'exam':
            body = (
                <>
                    <StepTitle tag="시험 보기" order={step.order} total={step.total}>{step.task.title}</StepTitle>
                    <p className="mt-1.5 text-[14px] leading-snug text-ink-soft">
                        {place === 'exam' ? '위쪽' : '시험장'}의 AI 시험관 앞이나 자리에서 <Kbd>F</Kbd>를 눌러요. 통과하면 레벨이 올라요.
                    </p>
                    {place !== 'exam' && (
                        <Button
                            size="sm"
                            variant="primary"
                            className="mt-3 w-full"
                            onClick={(e) => {
                                releaseFocus(e);
                                emit('goto', 'exam');
                            }}
                        >
                            시험장으로 이동
                        </Button>
                    )}
                </>
            );
            break;
    }

    return (
        <section className="pointer-events-auto bg-paper px-box" aria-label="지금 할 일">
            <h2>
                <button
                    type="button"
                    aria-expanded={open}
                    onClick={(e) => {
                        releaseFocus(e);
                        setOpen((v) => !v);
                    }}
                    className="flex w-full items-center justify-between gap-2 bg-sun px-3.5 py-2 font-pixel text-[14px] font-bold leading-none"
                >
                    지금 할 일
                    <span className="font-normal text-ink-soft">{open ? '접기 ▲' : '펼치기 ▼'}</span>
                </button>
            </h2>
            {open && <div className="px-3.5 pb-3.5 pt-3">{body}</div>}
        </section>
    );
}

function StepTitle({ tag, order, total, children }: { tag: string; order: number; total: number; children: ReactNode }) {
    return (
        <div>
            <p className="flex items-center gap-2 font-pixel text-[12px] font-bold leading-none text-ink-soft">
                <span className="bg-ink px-1.5 py-1 text-paper">{tag}</span>
                과제 {order} / {total}
            </p>
            <p className="mt-2 text-[15px] font-bold leading-snug">{children}</p>
        </div>
    );
}

// ── 로그아웃 ──

function LogoutButton() {
    const { logout } = useSession();
    const [asking, setAsking] = useState(false);
    const [busy, setBusy] = useState(false);
    const cancelRef = useRef<HTMLButtonElement>(null);
    // 묻는 동안은 캐릭터를 세워 둔다. 초점이 버튼에 있어서 Space가 맵과 겹치지 않게 한다
    useMapLock(asking);

    useEffect(() => {
        if (!asking) return;
        cancelRef.current?.focus();
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setAsking(false);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [asking]);

    return (
        <div className="pointer-events-auto relative">
            <Button
                size="sm"
                aria-expanded={asking}
                onClick={(e) => {
                    releaseFocus(e);
                    setAsking((v) => !v);
                }}
            >
                로그아웃
            </Button>
            {asking && (
                <div role="alertdialog" aria-label="로그아웃 확인" className="absolute right-0 top-[calc(100%+14px)] w-[240px] bg-paper px-box p-4">
                    <p className="text-[14px] leading-snug">로그아웃할까요? 다시 들어오려면 아이디와 비밀번호가 필요해요.</p>
                    <div className="mt-3 flex justify-end gap-2.5">
                        <button
                            ref={cancelRef}
                            type="button"
                            onClick={() => setAsking(false)}
                            className="min-h-8 px-3 font-pixel text-[13px] font-bold text-ink-soft hover:bg-paper-sunk hover:text-ink"
                        >
                            취소
                        </button>
                        <Button
                            size="sm"
                            variant="danger"
                            busy={busy}
                            onClick={async () => {
                                setBusy(true);
                                await logout();
                            }}
                        >
                            로그아웃하기
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}

// ── 연결 상태 ──

function ConnectionBanner({ state }: { state: 'reconnecting' | 'replaced' }) {
    if (state === 'replaced') {
        return (
            <Notice
                tone="danger"
                className="pointer-events-auto px-box-flat"
                action={<Button size="sm" onClick={() => window.location.reload()}>새로고침</Button>}
            >
                <b>다른 곳에서 같은 아이디로 접속했어요.</b> 여기서 계속하려면 새로고침해 주세요.
            </Notice>
        );
    }
    return (
        <Notice tone="warn" className="pointer-events-auto px-box-flat">
            <span className="mr-2 inline-block h-2.5 w-2.5 animate-[px-blink_0.8s_steps(2)_infinite] bg-sun-deep motion-reduce:animate-none align-middle" aria-hidden />
            <b>다른 사용자와 연결이 끊겨 다시 연결하는 중이에요.</b> 그동안 다른 사람의 움직임이 멈춰 보일 수 있어요.
        </Notice>
    );
}
