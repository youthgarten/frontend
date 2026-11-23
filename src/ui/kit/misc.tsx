import { useId, type InputHTMLAttributes, type ReactNode } from 'react';
import { levelInfo } from '../../character';

// 작은 부품들: 진행 막대, 꼬리표, 레벨 표시, 입력란, 알림 줄, 키 모양, 기다림 표시.

/** 0~1 비율을 보여주는 막대. 강의 수강률과 점수에 쓴다. */
export function ProgressBar({ value, tone = 'sun', mark, label, className = '' }: {
    value: number;
    tone?: 'sun' | 'ok' | 'uniform' | 'danger';
    /** 0~1. 기준선을 세로 줄로 표시한다 (수강 완료 80%, 예전 채점 기준의 통과 80점) */
    mark?: number;
    /** 화면 낭독기용 설명 */
    label?: string;
    className?: string;
}) {
    const v = Math.min(Math.max(value, 0), 1);
    const fill = { sun: 'bg-sun', ok: 'bg-grass', uniform: 'bg-uniform', danger: 'bg-danger' }[tone];
    return (
        <div
            role="progressbar"
            aria-label={label}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(v * 100)}
            className={`px-well relative h-3 bg-paper-sunk ${className}`}
        >
            <div className={`h-full ${fill}`} style={{ width: `${v * 100}%` }} />
            {mark !== undefined && (
                <div className="absolute -top-1 -bottom-1 w-[2px] bg-ink" style={{ left: `${mark * 100}%` }} aria-hidden />
            )}
        </div>
    );
}

/** 상태를 알리는 작은 꼬리표. 색만으로 구분하지 않도록 글자를 꼭 넣는다. */
export function Chip({ tone = 'neutral', children, className = '' }: {
    tone?: 'neutral' | 'ok' | 'sun' | 'danger' | 'uniform';
    children: ReactNode;
    className?: string;
}) {
    const tones = {
        neutral: 'bg-paper-sunk text-ink-soft border-line',
        ok: 'bg-ok-soft text-ok border-ok',
        sun: 'bg-sun-soft text-ink border-sun-deep',
        danger: 'bg-danger-soft text-danger border-danger',
        uniform: 'bg-uniform-soft text-uniform border-uniform',
    };
    return (
        <span className={`inline-flex items-center gap-1 whitespace-nowrap border-2 px-2 py-0.5 font-pixel text-[12px] font-bold leading-none ${tones[tone]} ${className}`}>
            {children}
        </span>
    );
}

/** 레벨 표시. 모자 색 네모 + 'Lv.2' + (선택) 모자 이름. */
export function LevelBadge({ level, showName = false, className = '' }: { level: number; showName?: boolean; className?: string }) {
    const info = levelInfo(level);
    return (
        <span className={`inline-flex items-center gap-1.5 whitespace-nowrap font-pixel text-[13px] font-bold leading-none ${className}`}>
            <span className="inline-block h-3 w-3 border-2 border-ink" style={{ background: info.color }} aria-hidden />
            {info.label}
            {showName && <span className="font-normal text-ink-soft">{info.hatName}</span>}
        </span>
    );
}

/** 이름표가 붙은 입력란. 오류 문장은 입력란 바로 아래에 뜬다. */
export function Field({ label, hint, error, className = '', ...rest }: InputHTMLAttributes<HTMLInputElement> & {
    label: string;
    /** 입력 규칙 안내. 오류가 있으면 오류 문장이 대신 보인다 */
    hint?: string;
    error?: string | null;
}) {
    const id = useId();
    const msgId = `${id}-msg`;
    return (
        <div className={className}>
            <label htmlFor={id} className="mb-1.5 block font-pixel text-[14px] font-bold">{label}</label>
            <input
                id={id}
                aria-invalid={error ? true : undefined}
                aria-describedby={error || hint ? msgId : undefined}
                className="px-well block h-11 w-full bg-white px-3 text-[15px] text-ink placeholder:text-ink-faint focus-visible:outline-offset-4"
                {...rest}
            />
            {(error || hint) && (
                <p id={msgId} className={`mt-2 text-[13px] leading-snug ${error ? 'font-bold text-danger' : 'text-ink-soft'}`}>
                    {error || hint}
                </p>
            )}
        </div>
    );
}

/** 화면 안에 끼워 넣는 알림 줄. 오류에는 무엇이 잘못됐고 어떻게 하면 되는지를 적는다. */
export function Notice({ tone = 'info', children, action, className = '' }: {
    tone?: 'info' | 'ok' | 'warn' | 'danger';
    children: ReactNode;
    /** 오른쪽에 두는 버튼 (예: 다시 시도) */
    action?: ReactNode;
    className?: string;
}) {
    const tones = {
        info: 'bg-uniform-soft border-uniform text-ink',
        ok: 'bg-ok-soft border-ok text-ink',
        warn: 'bg-sun-soft border-sun-deep text-ink',
        danger: 'bg-danger-soft border-danger text-ink',
    };
    return (
        <div
            role={tone === 'danger' ? 'alert' : 'status'}
            className={`flex items-center justify-between gap-3 border-l-[6px] px-3 py-2.5 text-[14px] leading-snug ${tones[tone]} ${className}`}
        >
            <div className="min-w-0">{children}</div>
            {action && <div className="shrink-0">{action}</div>}
        </div>
    );
}

/** 키보드 키 모양. 조작 안내에 쓴다. */
export function Kbd({ children }: { children: ReactNode }) {
    return (
        <kbd className="inline-flex min-w-6 items-center justify-center border-2 border-b-4 border-ink bg-white px-1.5 py-0.5 font-pixel text-[12px] font-bold leading-none text-ink">
            {children}
        </kbd>
    );
}

/** 기다리는 동안 보여주는 문장. 무엇을 기다리는지 적는다. */
export function Loading({ children = '불러오는 중이에요', className = '' }: { children?: ReactNode; className?: string }) {
    return (
        <p role="status" className={`flex items-center justify-center gap-2 py-8 font-pixel text-[14px] text-ink-soft ${className}`}>
            <span className="inline-block h-2.5 w-2.5 animate-[px-blink_0.8s_steps(2)_infinite] bg-ink-soft" aria-hidden />
            {children}
        </p>
    );
}
