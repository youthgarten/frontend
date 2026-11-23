import { useCallback, useEffect, useState } from 'react';
import { emit, on } from './events';
import { PhaserGame } from './game/PhaserGame';
import { SessionProvider, useMe, useSession } from './session/SessionProvider';
import { AuthScreen } from './ui/auth/AuthScreen';
import { MockPanel } from './ui/dev/MockPanel';
import { ExamFlow } from './ui/exam/ExamFlow';
import { Hud } from './ui/hud/Hud';
import { Tutorial } from './ui/hud/Tutorial';
import { Loading, Notice } from './ui/kit';
import { LectureOverlay } from './ui/lecture/LectureOverlay';
import { LevelUpOverlay } from './ui/levelup/LevelUpOverlay';

export default function App() {
    return (
        <SessionProvider>
            <Root />
            {/* 모의 서버로 띄웠을 때만 보이는 검수용 조작판 */}
            {__MOCK_API__ && <MockPanel />}
        </SessionProvider>
    );
}

function Root() {
    const { connectionUnstable } = useSession();
    return (
        <>
            <Screen />
            {connectionUnstable && (
                <div className="pointer-events-none fixed inset-x-0 top-4 z-[70] flex justify-center px-4">
                    <Notice tone="warn" className="px-box-flat font-pixel">연결이 불안정해요. 다시 연결하는 중이에요.</Notice>
                </div>
            )}
        </>
    );
}

function Screen() {
    const { status } = useSession();
    if (status === 'booting') {
        return (
            <main className="flex h-full items-center justify-center">
                <Loading>청년 유치원에 들어가는 중이에요</Loading>
            </main>
        );
    }
    return status === 'guest' ? <AuthScreen /> : <MapScreen />;
}

// 맵 위에 뜨는 큰 창. 한 번에 하나만 뜬다.
type Overlay = { kind: 'lecture'; lectureId?: number } | { kind: 'exam' } | null;

// 로그인한 뒤의 화면 전체: 맵 한 장 + 그 위의 HUD와 창들.
// 기획서대로 화면 전환이 없다. 강의도 시험도 맵 위에 뜬다.
function MapScreen() {
    const me = useMe();
    const { reloadMe, reloadProgress } = useSession();
    const [overlay, setOverlay] = useState<Overlay>(null);
    const [helpOpen, setHelpOpen] = useState(false);
    // 첫 입장 안내를 이번 접속에서 닫았는지. "봤다"는 저장이 실패해도 안내는 닫혀야 한다.
    // 닫히지 않으면 안내 창이 버튼을 받지 않는 채로 남고 맵도 잠긴다. 저장에 실패했으면 다음 접속 때 한 번 더 뜬다.
    const [tutorialDismissed, setTutorialDismissed] = useState(false);
    // 시험 결과로 오른 레벨. 시험 창이 닫힌 뒤 맵에서 연출한다
    const [pendingLevel, setPendingLevel] = useState<number | null>(null);

    useEffect(() => on('interact', (target) => {
        setOverlay(target === 'lectures' ? { kind: 'lecture' } : { kind: 'exam' });
    }), []);

    const closeOverlay = useCallback(() => {
        setOverlay(null);
        // 창 안에서 바뀐 수강률과 통과 여부를 HUD에 반영한다
        void reloadProgress();
    }, [reloadProgress]);

    const finishLevelUp = useCallback(() => {
        if (pendingLevel !== null) emit('player-level', pendingLevel);
        setPendingLevel(null);
        void reloadMe();
    }, [pendingLevel, reloadMe]);

    const showTutorial = (!me.tutorial_seen && !tutorialDismissed) || helpOpen;
    // 큰 창(강의, 시험, 레벨업 연출, 첫 입장 안내)이 떠 있는 동안 뒤에 가려진 맵과 HUD를 Tab 순서와 클릭에서 뺀다.
    // 아래 창들은 모두 이 조건일 때만 뜬다. 감싸는 요소는 display:contents라 배치에 끼어들지 않는다
    const behindOverlay = overlay !== null || pendingLevel !== null || showTutorial;

    return (
        <>
            <div className="contents" inert={behindOverlay}>
                <PhaserGame profile={{ userId: me.id, nickname: me.nickname, level: me.level }} />
                <Hud onOpenHelp={() => setHelpOpen(true)} />
            </div>

            {overlay?.kind === 'lecture' && (
                <LectureOverlay initialLectureId={overlay.lectureId} onClose={closeOverlay} />
            )}
            {overlay?.kind === 'exam' && (
                <ExamFlow
                    onClose={closeOverlay}
                    onOpenLecture={(lectureId) => {
                        void reloadProgress();
                        setOverlay({ kind: 'lecture', lectureId });
                    }}
                    onLevelUp={setPendingLevel}
                />
            )}

            {overlay === null && pendingLevel !== null && (
                <LevelUpOverlay level={pendingLevel} onDone={finishLevelUp} />
            )}
            {overlay === null && pendingLevel === null && showTutorial && (
                <Tutorial
                    onDone={() => {
                        setHelpOpen(false);
                        setTutorialDismissed(true);
                        if (!me.tutorial_seen) void reloadMe();
                    }}
                />
            )}
        </>
    );
}
