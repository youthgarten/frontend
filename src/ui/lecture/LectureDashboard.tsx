import { useQuery } from '@tanstack/react-query';
import { errorMessage, FRESH_ON_OPEN, lectureQueries, type LectureSummary } from '../../api';
import { useSession } from '../../session/SessionProvider';
import { Button, Chip, Loading, Notice, ProgressBar } from '../kit';
import { COMPLETE_RATE, formatTime, lectureStatus, percent, tasksForLecture } from './format';

// 강의 대시보드: 전체 수강 현황과 강의 목록.
// 강의마다 "다 들으면 어떤 시험을 볼 수 있는지"를 붙여 강의와 시험의 관계가 보이게 한다.

export function LectureDashboard({ onOpen }: { onOpen: (lectureId: number) => void }) {
    const { tasks } = useSession();
    // 창을 열 때마다 최신 수강률을 받는다. 그동안에는 저장해 둔 값을 먼저 보여 준다
    const { data, error, refetch, isFetching } = useQuery({ ...lectureQueries.dashboard(), ...FRESH_ON_OPEN });

    if (!data && error) {
        return (
            <Notice tone="danger" action={<Button size="sm" busy={isFetching} onClick={() => void refetch()}>다시 시도</Button>}>
                강의 목록을 불러오지 못했어요. {errorMessage(error)}
            </Notice>
        );
    }
    if (!data) return <Loading>강의 목록을 불러오는 중이에요</Loading>;

    // 가장 먼저 들어야 할 강의(아직 수강 완료하지 않은 첫 강의)에만 가장 눈에 띄는 버튼을 준다
    const nextId = data.lectures.find((l) => !l.completed)?.id;

    return (
        <div>
            <section className="flex flex-wrap items-center gap-x-6 gap-y-3 bg-paper-sunk px-4 py-3.5" aria-label="전체 수강 현황">
                <p className="font-pixel text-[16px] font-bold">
                    {data.total_count}개 중 <span className="text-[22px]">{data.completed_count}</span>개 수강 완료
                </p>
                <ProgressBar
                    value={data.total_count ? data.completed_count / data.total_count : 0}
                    tone="ok"
                    className="min-w-[160px] flex-1"
                    label={`전체 강의 ${data.total_count}개 중 ${data.completed_count}개 수강 완료`}
                />
                <p className="w-full text-[14px] text-ink-soft">
                    영상에서 실제로 본 부분이 80% 이상이면 수강 완료예요. 막대의 세로 줄이 80% 자리예요.
                </p>
            </section>

            {data.lectures.length === 0 ? (
                <p className="py-10 text-center text-[15px] text-ink-soft">아직 준비된 강의가 없어요.</p>
            ) : (
                <ol className="mt-2">
                    {data.lectures.map((l, i) => (
                        <LectureRow
                            key={l.id}
                            lecture={l}
                            order={i + 1}
                            recommended={l.id === nextId}
                            taskTitles={tasksForLecture(tasks, l.id).map((t) => t.title)}
                            onOpen={() => onOpen(l.id)}
                        />
                    ))}
                </ol>
            )}
        </div>
    );
}

function LectureRow({ lecture, order, recommended, taskTitles, onOpen }: {
    lecture: LectureSummary;
    order: number;
    recommended: boolean;
    taskTitles: string[];
    onOpen: () => void;
}) {
    const status = lectureStatus(lecture);
    const chipTone = status.kind === 'done' ? 'ok' : status.kind === 'doing' ? 'sun' : 'neutral';
    const taskText = taskTitles.map((t) => `'${t}'`).join(', ');

    return (
        <li className="flex items-center gap-4 border-b-2 border-line py-4 last:border-b-0">
            <span
                className={`flex h-10 w-10 shrink-0 items-center justify-center border-[3px] border-ink font-pixel text-[17px] font-bold ${lecture.completed ? 'bg-grass' : 'bg-paper'}`}
                aria-label={`${order}번째 강의`}
            >
                {order}
            </span>
            <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <h3 className="text-[16px] font-bold leading-snug">{lecture.title}</h3>
                    <Chip tone={chipTone}>{status.text}</Chip>
                    {recommended && <Chip tone="uniform">다음에 들을 강의</Chip>}
                </div>
                <div className="mt-2 flex items-center gap-3">
                    <span className="w-12 shrink-0 font-pixel text-[13px] text-ink-soft" aria-label={`길이 ${formatTime(lecture.duration_sec)}`}>
                        {formatTime(lecture.duration_sec)}
                    </span>
                    <ProgressBar
                        value={lecture.progress_rate}
                        tone={lecture.completed ? 'ok' : 'sun'}
                        mark={COMPLETE_RATE}
                        className="max-w-[320px] flex-1"
                        label={`수강률 ${percent(lecture.progress_rate)}%`}
                    />
                    <span className="w-10 shrink-0 font-pixel text-[13px] font-bold">{percent(lecture.progress_rate)}%</span>
                </div>
                {taskText && (
                    <p className="mt-1.5 text-[14px] leading-snug text-ink-soft">
                        {lecture.completed
                            ? `${taskText} 시험을 볼 수 있어요.`
                            : `이 강의의 80% 이상을 시청하면 ${taskText} 시험을 볼 수 있어요.`}
                    </p>
                )}
            </div>
            <Button variant={recommended ? 'primary' : 'secondary'} onClick={onOpen} className="shrink-0" aria-label={`${lecture.title} ${status.action}`}>
                {status.action}
            </Button>
        </li>
    );
}
