import { useCallback, useRef, useState } from 'react';
import { emit } from '../../events';
import { Dialog } from '../kit';
import { LectureDashboard } from './LectureDashboard';
import { LecturePlayerView, type FlushRef } from './LecturePlayerView';

// 칠판 앞에서 F를 누르면 열리는 강의실 창. 안에서 "강의 대시보드"와 "강의 재생" 두 화면을 오간다.
// 창을 닫거나 목록으로 돌아갈 때는 그동안 본 구간을 먼저 보고한 뒤 넘어간다.

/** 마지막 보고를 이만큼까지만 기다린다. 서버가 느려도 창이 닫히지 않는 일은 없게 한다 */
const FLUSH_WAIT_MS = 2500;

export function LectureOverlay({ onClose, initialLectureId }: { onClose: () => void; initialLectureId?: number }) {
    // null이면 대시보드, 숫자면 그 강의의 재생 화면
    const [playing, setPlaying] = useState<number | null>(initialLectureId ?? null);
    const flushRef: FlushRef = useRef(null);
    const closing = useRef(false);

    const flush = useCallback(async () => {
        const f = flushRef.current;
        if (!f) return;
        await Promise.race([f(), new Promise((r) => window.setTimeout(r, FLUSH_WAIT_MS))]);
    }, []);

    const close = useCallback(async () => {
        if (closing.current) return;
        closing.current = true;
        await flush();
        onClose();
    }, [flush, onClose]);

    const handleClose = useCallback(() => void close(), [close]);

    const backToList = async () => {
        await flush();
        setPlaying(null);
    };

    const guideToExam = async () => {
        await close();
        emit('goto', 'exam');
    };

    return (
        <Dialog
            title="강의실"
            description={
                playing === null
                    ? '강의를 골라 들어요. 강의를 다 들으면 그 강의와 연결된 시험을 볼 수 있어요.'
                    : '영상을 보는 동안 본 부분이 자동으로 저장돼요.'
            }
            onClose={handleClose}
            size="xl"
        >
            {playing === null ? (
                <LectureDashboard onOpen={setPlaying} />
            ) : (
                <LecturePlayerView
                    key={playing}
                    lectureId={playing}
                    flushRef={flushRef}
                    onBack={() => void backToList()}
                    onGuideToExam={() => void guideToExam()}
                />
            )}
        </Dialog>
    );
}
