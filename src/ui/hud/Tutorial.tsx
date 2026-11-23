import { useEffect, useRef, useState, type ReactNode } from 'react';
import { api } from '../../api';
import { characterSpec, EXAMINER_SPEC, levelInfo, MAX_LEVEL } from '../../character';
import { useMe } from '../../session/SessionProvider';
import { Button, Dialog, Kbd, PixelCharacter, ProgressBar } from '../kit';
import { KitArt } from './KitArt';

// 첫 입장 안내. 조작법 버튼으로 다시 열어도 같은 화면이 뜬다.
// 게임에 익숙하지 않은 사람도 "움직이기 → 강의 듣기 → 시험 보기" 한 바퀴를 머릿속에 그릴 수 있게 세 장으로 나눴다.

type Step = { title: string; art: ReactNode; body: ReactNode };

export function Tutorial({ onDone }: { onDone: () => void }) {
    const me = useMe();
    const [index, setIndex] = useState(0);
    const [busy, setBusy] = useState(false);
    const finished = useRef(false);
    // 처음 들어온 사람인지. 안내를 다 본 뒤 me가 바뀌어도 문구가 흔들리지 않게 처음 값을 쥐고 있는다
    const firstTime = useRef(!me.tutorial_seen).current;

    const steps: Step[] = [
        {
            title: '걸어 다니고 말 걸기',
            art: <MoveArt userId={me.id} level={me.level} />,
            body: (
                <>
                    <p>
                        <Kbd>W</Kbd> <Kbd>A</Kbd> <Kbd>S</Kbd> <Kbd>D</Kbd>나 방향키로 걸어요.
                        건물 문 앞에서 <Kbd>F</Kbd> 또는 <Kbd>Space</Kbd>를 누르면 안으로 들어가요.
                        안에서는 칠판이나 시험관 앞, 또는 자리에 서서 같은 키를 누르면 강의를 보거나 말을 걸 수 있어요.
                    </p>
                    <p className="mt-3 text-ink-soft">
                        어디로 가야 할지 모르겠다면 화면 왼쪽 아래의 <b className="text-ink">지금 할 일</b>을 보세요.
                        이동 버튼을 누르면 그 건물 안으로 바로 가요.
                    </p>
                </>
            ),
        },
        {
            title: '강의실에서 강의 듣기',
            art: <LectureArt userId={me.id} level={me.level} />,
            body: (
                <>
                    <p>
                        강의실 칠판 앞이나 자리에서 <Kbd>F</Kbd>를 누르면 강의 목록이 열려요.
                        영상에서 <b>실제로 본 부분이 80% 이상</b>이면 수강 완료예요.
                    </p>
                    <p className="mt-3 text-ink-soft">건너뛴 부분은 들어가지 않아요. 중간에 나가도 다음에 이어서 볼 수 있어요.</p>
                </>
            ),
        },
        {
            title: '시험장에서 시험 보기',
            art: <ExamArt level={me.level} />,
            body: (
                <>
                    <p>
                        시험장의 AI 시험관에게 말을 걸면 실무 과제를 받아요. 과제는 화면 안의 AI와 함께 풀어요.
                        <b> 실무 과제 해결과 AI 활용 역량, 두 영역을 모두 충족하면 통과</b>! 레벨이 오르고 모자 색이 바뀌어요.
                    </p>
                    <p className="mt-3 text-ink-soft">과제마다 먼저 들어야 하는 강의가 하나씩 있어요. 그 강의를 다 들으면 시험을 볼 수 있어요.</p>
                </>
            ),
        },
    ];
    const last = index === steps.length - 1;
    const step = steps[index];

    const finish = async () => {
        if (finished.current) return;
        finished.current = true;
        if (!me.tutorial_seen) {
            setBusy(true);
            try {
                await api.markTutorialSeen();
            } catch {
                // 저장하지 못해도 맵으로 들어간다. 다음 접속 때 안내가 한 번 더 뜰 뿐이다
            }
        }
        onDone();
    };

    // 좌우 방향키로도 넘긴다
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'ArrowRight') setIndex((i) => Math.min(i + 1, steps.length - 1));
            if (e.key === 'ArrowLeft') setIndex((i) => Math.max(i - 1, 0));
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [steps.length]);

    return (
        <Dialog
            title={firstTime ? '청년 유치원에 온 걸 환영해요' : '조작법과 둘러보기'}
            description="세 장만 보면 바로 시작할 수 있어요."
            onClose={() => void finish()}
            size="md"
            footer={
                <>
                    {!last && (
                        <Button key="skip" variant="quiet" className="mr-auto" onClick={() => void finish()} disabled={busy}>
                            {firstTime ? '건너뛰기' : '닫기'}
                        </Button>
                    )}
                    {index > 0 && (
                        <Button key="prev" onClick={() => setIndex(index - 1)} disabled={busy}>이전</Button>
                    )}
                    <Button
                        key="next"
                        variant="primary"
                        autoFocus
                        busy={busy}
                        onClick={() => (last ? void finish() : setIndex(index + 1))}
                    >
                        {last ? (firstTime ? '시작하기' : '알겠어요') : '다음'}
                    </Button>
                </>
            }
        >
            <div className="flex items-center justify-between gap-3">
                <h3 className="font-pixel text-[18px] font-bold">
                    <span className="mr-2 text-ink-soft">{index + 1}.</span>
                    {step.title}
                </h3>
                <StepDots count={steps.length} index={index} />
            </div>
            <div className="mt-4 flex h-[176px] items-end justify-center gap-6 overflow-hidden bg-sky px-4 pb-0 pt-4">
                {step.art}
            </div>
            <div className="mt-5 min-h-[112px] text-[15px] leading-relaxed" aria-live="polite">{step.body}</div>
        </Dialog>
    );
}

function StepDots({ count, index }: { count: number; index: number }) {
    return (
        <p className="flex items-center gap-1.5 font-pixel text-[13px] text-ink-soft">
            <span className="sr-only">{count}장 중 {index + 1}번째</span>
            {Array.from({ length: count }, (_, i) => (
                <span key={i} aria-hidden className={`inline-block h-2.5 ${i === index ? 'w-6 bg-ink' : 'w-2.5 bg-line'}`} />
            ))}
            <span aria-hidden className="ml-1">{index + 1}/{count}</span>
        </p>
    );
}

// ── 장마다 들어가는 그림. 잔디 줄 위에 키트 그림을 세운다 ──

function Ground({ children }: { children: ReactNode }) {
    return <div className="flex items-end gap-6 border-b-[6px] border-grass-deep px-3">{children}</div>;
}

function MoveArt({ userId, level }: { userId: number; level: number }) {
    return (
        <>
            <div className="mb-4 grid grid-cols-3 gap-1" aria-hidden>
                <span />
                <Kbd>W</Kbd>
                <span />
                <Kbd>A</Kbd>
                <Kbd>S</Kbd>
                <Kbd>D</Kbd>
            </div>
            <Ground>
                <PixelCharacter spec={characterSpec(userId, level, 'friendly')} dir="right" scale={2} breathing label="내 캐릭터" />
                <KitArt kind="object" name="sign" scale={2} />
            </Ground>
            <div className="mb-4 flex flex-col items-center gap-1.5" aria-hidden>
                <Kbd>F</Kbd>
                <span className="font-pixel text-[12px] text-ink-soft">또는</span>
                <Kbd>Space</Kbd>
            </div>
        </>
    );
}

function LectureArt({ userId, level }: { userId: number; level: number }) {
    return (
        <>
            <Ground>
                <PixelCharacter spec={characterSpec(userId, level, 'curious')} dir="up" scale={2} label="칠판을 보는 내 캐릭터" />
                <KitArt kind="object" name="chalkboard" scale={2} label="칠판" />
            </Ground>
            <div className="mb-6 w-[180px] bg-paper p-3">
                <p className="flex justify-between font-pixel text-[12px] font-bold">
                    <span>수강률</span>
                    <span>85%</span>
                </p>
                <ProgressBar value={0.85} tone="ok" mark={0.8} className="mt-1.5" label="수강률 예시 85%" />
                <p className="mt-2 font-pixel text-[12px] text-ok">80% 넘으면 수강 완료</p>
            </div>
        </>
    );
}

function ExamArt({ level }: { level: number }) {
    // 이미 Lv.MAX면 바뀔 모자가 없으니 처음 단계를 예로 든다
    const base = level >= MAX_LEVEL ? 1 : level;
    const from = levelInfo(base);
    const to = levelInfo(base + 1);
    return (
        <>
            <Ground>
                <PixelCharacter spec={EXAMINER_SPEC} scale={2} breathing label="AI 시험관" />
                <KitArt kind="object" name="computer" scale={2} />
            </Ground>
            <div className="mb-6 flex items-center gap-2 bg-paper px-3 py-2.5 font-pixel text-[13px] font-bold">
                <span className="flex flex-col items-center gap-1">
                    <span className="h-5 w-7 border-2 border-ink" style={{ background: from.color }} aria-hidden />
                    {from.label}
                </span>
                <span aria-hidden className="text-ink-soft">→</span>
                <span className="flex flex-col items-center gap-1">
                    <span className="h-5 w-7 border-2 border-ink" style={{ background: to.color }} aria-hidden />
                    {to.label}
                </span>
                <span className="sr-only">통과하면 {from.hatName}에서 {to.hatName}로 바뀌어요</span>
            </div>
        </>
    );
}
