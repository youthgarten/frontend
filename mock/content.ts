// 시드 콘텐츠: 직무, 강의 5개, 과제 5개와 제공 자료.
// 기획서 2_핵심기능.md 7절 "과제와 강의" 표를 따른다. 자료 속 회사와 사람은 모두 지어낸 것이다.
// 과제마다 "AI가 자료와 다르게 말하는 사실(함정)" 하나를 둔다. 평가 항목 "답변 검증"을 검수하기 위해서다.
// 과제마다 채점 기준(ERD task.grading_rubric)과 필수 요건을 둔다. 필수 요건의 판정은 실제 서버에서는 AI가 rule을 읽고
// 하지만, 모의 서버는 judges의 정해진 규칙으로 한다.

import type { Criterion, DualRubric, LegacyRubric, RequiredCheckDef } from './store';

export interface JobDef { id: number; name: string }

export interface LectureDef {
    id: number;
    job_id: number;
    title: string;
    youtube_video_id: string;
    duration_sec: number;
    sort_order: number;
}

export interface MaterialDef { id: number; title: string; content: string }

/** AI가 섞어 말하는 틀린 사실 */
export interface TrapDef {
    /** 피드백에 쓰는 이름. 예: '새 선적 일정' */
    label: string;
    /** 자료와 다른 값 (피드백 문장용) */
    wrong: string;
    /** 자료에 있는 값 (피드백 문장용) */
    correct: string;
    /** 답안에 틀린 값이 남았는지 */
    wrongPattern: RegExp;
    /** 답안이나 질문에 올바른 값이 들어 있는지 */
    correctPattern: RegExp;
    /** 사용자가 이 주제를 지적하는지 */
    topicPattern: RegExp;
    /** 올바른 값이 있는 자료의 짧은 이름 (답변 검증 피드백에 "무엇을 어떤 자료와 대조했는지"로 쓴다) */
    source: string;
}

/** 필수 요건 하나를 최종 답안으로 판정한다. feedback은 답안과 자료에 근거한 판정 이유 */
export type CheckJudge = (answer: string) => { met: boolean; feedback: string };

/** 결과물 채점에서 보는 핵심 요소 */
export interface ElementDef { label: string; pattern: RegExp }

/** 모의 AI가 과제별로 쓰는 답변 재료. wrong이 true면 함정 값을 섞는다 */
export interface ReplyKit {
    summary: (wrong: boolean) => string;
    draft: (wrong: boolean) => string;
    fact: (wrong: boolean) => string;
    correction: string;
    translate: string;
    tone: string;
    tips: string[];
    /** 사실 질문으로 볼 낱말 (일정, 단가 등) */
    factPattern: RegExp;
}

export interface TaskDef {
    id: number;
    job_id: number;
    lecture_id: number;
    title: string;
    situation: string;
    instruction: string;
    time_limit_min: number;
    sort_order: number;
    materials: MaterialDef[];
    trap: TrapDef;
    elements: ElementDef[];
    reply: ReplyKit;
    /** 시드용: 잘 푼 응시의 질문들 (요약 → 지적 → 작성 → 다듬기) */
    seedPrompts: string[];
    /** 시드용: 잘 푼 답안 */
    seedAnswer: string;
    /** 채점 기준 (ERD task.grading_rubric). 응시를 만들 때 응시에 복사한다 */
    rubric: DualRubric;
    /** 필수 요건의 판정 규칙. check_id로 찾는다 */
    judges: Record<string, CheckJudge>;
    /** 총평에 넣는 "현업에서 다시 쓸 행동 한 가지" */
    practice: string;
}

export const JOBS: JobDef[] = [{ id: 1, name: '무역 사무' }];

export const LECTURES: LectureDef[] = [
    { id: 1, job_id: 1, title: 'AI로 영문 비즈니스 메일 쓰고 검토하기', youtube_video_id: 'c9pBqlOSnx4', duration_sec: 697, sort_order: 1 },
    { id: 2, job_id: 1, title: 'AI로 견적 조건 정리하고 견적서 만들기', youtube_video_id: 'mock:lecture-2', duration_sec: 720, sort_order: 2 },
    { id: 3, job_id: 1, title: 'AI로 신용장 조건 검토하기', youtube_video_id: 'mock:lecture-3', duration_sec: 540, sort_order: 3 },
    { id: 4, job_id: 1, title: 'AI로 선적 서류 대조하고 오류 찾기', youtube_video_id: 'mock:lecture-4', duration_sec: 600, sort_order: 4 },
    { id: 5, job_id: 1, title: 'AI로 수출입 통관 절차 조사하고 정리하기', youtube_video_id: 'mock:lecture-5', duration_sec: 480, sort_order: 5 },
];

/** 채점 항목과 소속 영역 (ERD 3절). 배점은 응시의 채점 기준 스냅샷에서 가져온다 */
export const CRITERIA = [
    { code: 'RESULT', name: '결과물', dimension: 'TASK_SOLUTION' },
    { code: 'PROMPT', name: '질문 설계', dimension: 'AI_USE' },
    { code: 'VERIFY', name: '답변 검증', dimension: 'AI_USE' },
    { code: 'IMPROVE', name: '개선 과정', dimension: 'AI_USE' },
] as const;

/** 영역 이름 (명세 7절 GET /attempts/{id}의 dimensions[].name) */
export const DIMENSIONS = [
    { code: 'TASK_SOLUTION', name: '실무 과제 해결' },
    { code: 'AI_USE', name: 'AI 활용 역량' },
] as const;

/** MVP의 DUAL_V1 배점 (ERD 3절) */
export const DUAL_MAX_SCORES: Record<Criterion, number> = { RESULT: 50, PROMPT: 15, VERIFY: 20, IMPROVE: 15 };

function dualRubric(required_checks: RequiredCheckDef[]): DualRubric {
    return {
        version: 'DUAL_V1',
        task_solution_min_score: 40,
        ai_use_min_score: 40,
        verify_min_score: 12,
        required_checks,
        criterion_max_scores: { ...DUAL_MAX_SCORES },
    };
}

/** 예전 기준. 전환 전에 시작한 응시에 채운다 (ERD attempt 표) */
export const LEGACY_RUBRIC: LegacyRubric = {
    version: 'LEGACY_TOTAL_V1',
    criterion_max_scores: { RESULT: 25, PROMPT: 25, VERIFY: 25, IMPROVE: 25 },
    min_total_score: 80,
};

/** 답안을 문장 단위로 나눈다 (마침표나 줄바꿈 기준) */
function sentences(text: string) {
    return text.split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
}

// ───────────────────────── 과제 1: 납기 지연 항의 메일 회신 ─────────────────────────

const T1_MAIL = `**From:** James Carter <j.carter@northwind-home.example>
**To:** 김하늘 (해외영업팀, Hanbit Living Co., Ltd.)
**Date:** November 12, 2026
**Subject:** URGENT – Delay of PO NW-2611

Dear Ms. Kim,

We were informed yesterday by our forwarder that PO NW-2611 (2,400 units of 500ml stainless tumblers) did not leave Busan on November 10 as agreed in our contract.

These tumblers are the key item of our holiday promotion, which starts on **December 8**. We need the goods at our Los Angeles warehouse **no later than December 5**.

Please let us know by return:

1. The exact reason for the delay
2. The new shipping date (ETD) and arrival date (ETA)
3. What compensation you will offer under the contract

Frankly, we are very disappointed that we heard about this from our forwarder and not from you. If the goods cannot arrive by December 5, we will have to consider cancelling the order.

Best regards,
James Carter
Purchasing Manager, Northwind Home Goods`;

const T1_CONTRACT = `# 수출 계약서 (발췌)

- 계약번호: HL-NW-2611
- 계약 금액: USD 48,000 (CIF Los Angeles)

**제7조 (선적)**

1. 매도인은 2026년 11월 10일까지 부산항에서 물품을 선적한다.
2. 선적이 늦어질 것으로 예상되면 매도인은 알게 된 날로부터 2영업일 안에 매수인에게 서면으로 알린다.

**제9조 (지연 배상)**

1. 매도인의 사유로 선적이 늦어지면, 늦어진 1주(7일)마다 계약 금액의 0.5%를 지체상금으로 지급한다.
2. 지체상금의 총액은 계약 금액의 5%를 넘지 않는다.
3. 지체상금은 다음 송장 금액에서 공제하는 방식으로 지급할 수 있다.

**제12조 (불가항력)**

천재지변, 전쟁, 항만 파업 등 당사자가 통제할 수 없는 사유로 인한 지연에는 제9조를 적용하지 않는다. 원자재 공급업체의 지연은 불가항력에 해당하지 않는다.`;

const T1_SCHEDULE = `# 선적 일정표 (PO NW-2611) — 11월 12일 기준

| 구분 | 당초 계획 | 변경 일정 | 비고 |
|---|---|---|---|
| 원자재(스테인리스 코일) 입고 | 10/28 | 11/06 | 공급업체 설비 고장으로 9일 지연 |
| 생산 완료 | 11/05 | 11/14 | |
| 선박 | MV Ocean Pioneer V.112 | MV Pacific Dawn V.087 | 선복 확정 |
| 출항 (ETD, 부산) | 11/10 | **11/17** | |
| 도착 (ETA, LA) | 11/24 | **12/01** | |
| 바이어 창고 입고 | 11/26 | 12/03 (예상) | 통관·내륙 운송 2일 |

- 선적 지연: 7일 → 계약 제9조 기준 1주
- 담당: 해외영업팀 김하늘`;

function t1Dates(wrong: boolean) {
    return wrong
        ? { etdKo: '11월 21일', etaKo: '12월 6일', etdEn: 'November 21', etaEn: 'December 6' }
        : { etdKo: '11월 17일', etaKo: '12월 1일', etdEn: 'November 17', etaEn: 'December 1' };
}

function t1Deadline(wrong: boolean) {
    return wrong
        ? '다만 도착이 12월 6일이라, 바이어가 원한 12월 5일 창고 입고는 맞추기 어려워 보여요.'
        : '도착 뒤 통관·내륙 운송 2일을 더해도 12월 3일 입고 예상이라, 바이어가 원한 12월 5일에 맞출 수 있어요.';
}

function t1Draft(wrong: boolean) {
    const d = t1Dates(wrong);
    const arrival = wrong
        ? `arrive at the Port of Los Angeles on ${d.etaEn}. We will do our utmost to have the goods at your warehouse as soon as possible after that.`
        : `arrive at the Port of Los Angeles on ${d.etaEn}, and we expect delivery to your warehouse by December 3, ahead of your December 5 deadline.`;
    return `Subject: RE: URGENT – Delay of PO NW-2611

Dear Mr. Carter,

Thank you for your email, and please accept our sincere apologies for the delay of PO NW-2611 and for not informing you directly and promptly.

The delay was caused by a breakdown at our raw material supplier, which delayed the delivery of stainless steel coils by nine days. Production has now been completed.

The goods have been booked on MV Pacific Dawn V.087, departing Busan on ${d.etdEn} and scheduled to ${arrival}

In accordance with Article 9 of our contract, we will compensate you for the one-week delay with 0.5% of the contract value (USD 240), which we propose to deduct from our next invoice.

We will closely monitor the shipment and keep you informed at every stage. We truly value our partnership and will take steps to prevent this from happening again.

Sincerely,
Haneul Kim
Overseas Sales, Hanbit Living Co., Ltd.`;
}

/** 과제 1: AI가 섞는 틀린 일정 */
const T1_WRONG = /(11\s*월\s*21\s*일|11\/21|nov(ember)?\.?\s*21|12\s*월\s*6\s*일|12\/0?6(?!\d)|dec(ember)?\.?\s*6(?!\d))/i;
/** 과제 1: 일정표에 "예상"으로 표시된 창고 입고일 */
const T1_WAREHOUSE = /(dec(ember)?\.?\s*0?3(?!\d)|12\/0?3(?!\d)|12\s*월\s*3\s*일)/i;
/** 확정이 아니라 예상임을 밝히는 말 */
const HEDGE = /(expect|estimat|approx|anticipat|projected|tentativ|예상|예정|목표)/i;

const TASK1: TaskDef = {
    id: 1,
    job_id: 1,
    lecture_id: 1,
    title: '바이어 납기 지연 항의 메일 회신',
    situation: '해외 바이어가 납기 지연에 항의하는 메일을 보냈다. 바이어는 연말 프로모션 때문에 12월 5일까지 물건이 꼭 필요하고, 못 받으면 주문 취소를 검토하겠다고 한다.',
    instruction: '제공 자료로 상황을 파악하고, 바이어에게 보낼 영문 회신 메일을 작성한다. 바이어가 물은 세 가지(지연 사유, 새 일정, 보상)에 모두 답한다.',
    time_limit_min: 30,
    sort_order: 1,
    materials: [
        { id: 101, title: '바이어 메일 원문', content: T1_MAIL },
        { id: 102, title: '계약서 일부', content: T1_CONTRACT },
        { id: 103, title: '선적 일정표', content: T1_SCHEDULE },
    ],
    trap: {
        label: '새 선적 일정',
        wrong: '11월 21일 출항, 12월 6일 도착',
        correct: '11월 17일 출항, 12월 1일 도착',
        wrongPattern: T1_WRONG,
        correctPattern: /(11\s*월\s*17\s*일|11\/17|nov(ember)?\.?\s*17|12\s*월\s*1\s*일|12\/0?1(?!\d)|dec(ember)?\.?\s*1(?![\d,]?\d))/i,
        topicPattern: /(일정|날짜|선적일|출항|도착|ETD|ETA|언제|며칠|스케줄)/i,
        source: '선적 일정표',
    },
    elements: [
        { label: '사과', pattern: /(apolog|sorry|regret)/i },
        { label: '지연 사유(원자재 공급 지연)', pattern: /(raw material|stainless|coil|supplier|원자재)/i },
        { label: '새 일정(11/17 출항, 12/1 도착)', pattern: /(nov(ember)?\.?\s*17|11\/17|11\s*월\s*17\s*일)/i },
        { label: '보상(지체상금 0.5%, USD 240)', pattern: /(0\.5\s*%|240|compensat|penalt|deduct)/i },
        { label: '재발 방지와 연락 약속', pattern: /(prevent|keep you (informed|updated)|update you|closely monitor|notify)/i },
    ],
    reply: {
        summary: (w) => {
            const d = t1Dates(w);
            return `자료 세 개를 바탕으로 정리해 볼게요.

**바이어 요구**
- Northwind Home Goods의 James Carter가 PO NW-2611(텀블러 2,400개)이 계약상 선적일인 11월 10일에 출항하지 않은 것에 항의하고 있어요.
- 12월 8일 프로모션 때문에 **12월 5일까지 LA 창고 입고**가 필요하고, 못 맞추면 주문 취소를 검토하겠대요.
- 요청: ① 지연 사유 ② 새 ETD·ETA ③ 계약에 따른 보상

**우리 쪽 사실관계**
- 지연 사유: 원자재(스테인리스 코일) 공급업체 설비 고장으로 입고가 9일 늦어짐. 계약 제12조상 불가항력이 아니라 지체상금 대상이에요.
- 새 일정: **${d.etdKo} 부산 출항, ${d.etaKo} LA 도착** (MV Pacific Dawn V.087)
- 보상: 지연 1주 → 계약 금액 USD 48,000의 0.5% = USD 240

${t1Deadline(w)}

회신 메일에는 사과, 사유, 새 일정, 보상, 앞으로의 연락 약속을 담으면 좋겠어요.`;
        },
        draft: (w) => `요청하신 회신 메일 초안이에요.

---
${t1Draft(w)}
---

바이어가 물은 세 가지(사유, 새 일정, 보상)에 순서대로 답하도록 구성했어요.`,
        fact: (w) => {
            const d = t1Dates(w);
            return `선적 일정표 기준으로 새 일정은 **${d.etdKo} 부산 출항(MV Pacific Dawn V.087), ${d.etaKo} LA 도착**이에요. 원래 계획(11월 10일 출항)보다 늦어졌어요. ${t1Deadline(w)}`;
        },
        correction: `확인해 주셔서 고마워요. 제가 앞에서 잘못 말씀드렸어요.

선적 일정표를 다시 보면 새 출항일은 **11월 17일**, LA 도착은 **12월 1일**이에요 (11월 21일·12월 6일이 아니에요). 통관과 내륙 운송 2일을 더하면 바이어 창고 입고는 12월 3일 예상이라, 바이어가 요청한 12월 5일에 맞출 수 있어요.

회신 메일에도 "departing Busan on November 17, arriving in Los Angeles on December 1"로 적어 주세요. 바이어가 가장 걱정하는 부분이니 "ahead of your December 5 deadline"을 함께 적으면 안심시킬 수 있어요.`,
        translate: `바이어 메일을 우리말로 옮기면 다음과 같아요.

> 김 선생님께,
> 어제 포워더에게서 PO NW-2611(500ml 스테인리스 텀블러 2,400개)이 계약대로 11월 10일 부산에서 출항하지 않았다는 이야기를 들었습니다.
> 이 텀블러는 12월 8일 시작하는 연말 프로모션의 핵심 상품이라, 늦어도 12월 5일까지 LA 창고에 도착해야 합니다.
> 다음을 바로 알려 주십시오. ① 지연의 정확한 사유 ② 새 출항일(ETD)과 도착일(ETA) ③ 계약에 따라 제시할 보상
> 솔직히 이 소식을 귀사가 아니라 포워더에게서 들어 매우 실망했습니다. 12월 5일까지 도착하지 못하면 주문 취소를 검토할 수밖에 없습니다.`,
        tone: `어조를 더 정중하게 다듬을 때는 이렇게 바꿔 보세요.

- "We are sorry for the delay." → "Please accept our sincere apologies for the inconvenience this delay has caused."
- "We will pay USD 240." → "In accordance with Article 9 of our contract, we would like to offer USD 240 as compensation."
- 끝맺음: "We truly value our partnership and appreciate your understanding."

변명처럼 들리지 않도록 사유는 한 문장으로 짧게, 해결책(새 일정과 보상)을 앞에 두는 것이 좋아요.`,
        tips: [
            '바이어가 요청한 세 가지(사유, 새 일정, 보상)에 하나씩 답하는 구조가 좋아요.',
            '계약서 제9조에 따라 지체상금은 지연 1주마다 계약 금액의 0.5%예요.',
            '바이어가 지연 소식을 포워더에게서 먼저 들었으니(제7조 2항 통지 의무), 늦게 알린 점도 사과하는 게 좋아요.',
        ],
        factPattern: /(일정|날짜|선적일|출항|도착|ETD|ETA|언제|며칠|스케줄)/i,
    },
    seedPrompts: [
        '너는 무역 회사 해외영업 담당자야. 바이어가 납기 지연에 항의하는 메일을 보냈어. 제공 자료 세 개를 바탕으로 바이어 요구와 우리 쪽 사실관계를 항목별로 정리해 줘.',
        '선적 일정표와 대조해 보니 새 출항일이 다른 것 같아. 날짜가 맞는지 다시 확인해 줘.',
        '확인한 일정으로 바이어에게 보낼 영문 회신 메일 초안을 써 줘. 조건: 사과, 사유, 새 일정, 계약 제9조 보상을 반드시 포함하고 200단어 이내 메일 형식으로.',
        '어조를 더 정중하게 다듬어 줘. 변명처럼 들리지 않게.',
    ],
    seedAnswer: t1Draft(false),
    rubric: dualRubric([
        {
            check_id: 'SHIPPING_DATE',
            label: '확정 선적일을 정확히 안내하고 미확정 일정을 확정처럼 약속하지 않기',
            rule: '최종 회신의 확정 선적일(출항 11월 17일)이 제공된 선적 일정표와 일치하고, 일정표와 다른 날짜(11월 21일 출항, 12월 6일 도착)가 없으며, 일정표에서 예상으로 표시된 창고 입고일(12월 3일)을 확정 일정이라고 약속한 문장이 없으면 충족한다.',
        },
    ]),
    judges: {
        SHIPPING_DATE: (answer) => {
            const etd = /(nov(ember)?\.?\s*17|11\/17|11\s*월\s*17\s*일)/i.test(answer);
            const wrong = T1_WRONG.test(answer);
            const promised = sentences(answer).find((s) => T1_WAREHOUSE.test(s) && !HEDGE.test(s));
            if (wrong) {
                return { met: false, feedback: '회신에 선적 일정표와 다른 날짜(11월 21일 출항이나 12월 6일 도착)가 있어요. 일정표의 확정 출항일은 11월 17일이에요.' };
            }
            if (!etd) return { met: false, feedback: '회신에서 새 출항일을 찾지 못했어요. 바이어가 물은 새 일정에는 선적 일정표의 확정 출항일(11월 17일)이 들어가야 해요.' };
            if (promised) {
                return { met: false, feedback: '출항일(11월 17일)은 일정표와 맞지만, 일정표에 "예상"으로 표시된 창고 입고일(12월 3일)을 확정된 일정처럼 약속했어요.' };
            }
            return {
                met: true,
                feedback: T1_WAREHOUSE.test(answer)
                    ? '회신의 출항일(11월 17일)이 선적 일정표와 일치하고, 창고 입고일(12월 3일)은 예상 일정으로 안내했어요.'
                    : '회신의 출항일(11월 17일)이 선적 일정표와 일치하고, 확정되지 않은 일정을 약속한 문장이 없어요.',
            };
        },
    },
    practice: '바이어에게 보내기 전에 AI 초안에 들어간 모든 날짜가 확정된 일정인지 최신 선적 일정표와 대조해 보세요.',
};

// ───────────────────────── 과제 2: 견적서 작성 ─────────────────────────

const T2_RFQ = `**From:** Lena Fischer <l.fischer@elbe-trading.example>
**Date:** November 16, 2026
**Subject:** RFQ – LED desk lamps and adapters

Dear Sir or Madam,

We are interested in the following items for our spring catalogue:

| Item | Model | Quantity |
|---|---|---|
| LED desk lamp | DL-200 | 1,000 pcs |
| LED desk lamp (wireless charging) | DL-300 | 500 pcs |
| USB-C power adapter 20W | PA-20C | 2,000 pcs |

Please quote both **FOB Busan** and **CIF Hamburg** prices in USD, together with your payment terms, delivery time and the validity of your offer.
We need the goods in Hamburg by the **end of January 2027**.

Kind regards,
Lena Fischer
Sourcing Manager, Elbe Trading GmbH`;

const T2_PRICE = `# 2026년 하반기 수출 단가표 (FOB 부산, USD)

| 모델 | 단가 | 수량 할인 |
|---|---|---|
| DL-200 | 12.00 | 1,000개 이상 5% |
| DL-300 | 18.00 | 1,000개 이상 5% |
| PA-20C | 3.20 | 없음 |

**견적 조건 기준**

- 결제: T/T 30% 선금, 잔금 70%는 선적 전 송금
- 납기: 주문 확정 후 생산 30일 + 선적 준비 5일
- 견적 유효기간: 발행일로부터 30일
- CIF 함부르크 추가 비용 (이번 물량, 20ft 컨테이너 1대 기준): 해상운임 USD 1,850, 적하보험료 USD 95
- 부산 → 함부르크 해상 운송: 약 35일`;

const T2_MEMO = `# Elbe Trading 거래 메모

- 2025년 첫 거래 (DL-200 600개). 결제 지연 없음.
- 담당자 Lena Fischer는 견적서에 **모델별 단가·금액, 합계, 무역 조건을 표로** 정리해 달라고 요청한 적이 있음.
- 할인은 단가표 기준만 적용한다. 추가 할인은 팀장 승인이 필요하며, 이번 건은 승인 없음.`;

function t2Nums(wrong: boolean) {
    return wrong
        ? { rate: '10%', unit: '10.80', amount: '10,800.00', fob: '26,200.00', cif: '28,145.00' }
        : { rate: '5%', unit: '11.40', amount: '11,400.00', fob: '26,800.00', cif: '28,745.00' };
}

function t2Quote(wrong: boolean) {
    const n = t2Nums(wrong);
    return `QUOTATION — Elbe Trading GmbH (Attn. Ms. Lena Fischer)

| Model | Q'ty | Unit Price (FOB Busan) | Amount |
|---|---|---|---|
| DL-200 LED desk lamp | 1,000 pcs | USD ${n.unit} (${n.rate} volume discount) | USD ${n.amount} |
| DL-300 LED desk lamp (wireless) | 500 pcs | USD 18.00 | USD 9,000.00 |
| PA-20C USB-C adapter 20W | 2,000 pcs | USD 3.20 | USD 6,400.00 |
| **Total FOB Busan** | | | **USD ${n.fob}** |
| Ocean freight + insurance (20ft x1) | | | USD 1,945.00 |
| **Total CIF Hamburg** | | | **USD ${n.cif}** |

- Payment: T/T 30% in advance, 70% before shipment
- Delivery: shipment within 35 days after order confirmation (approx. 35 days transit to Hamburg)
- Validity: 30 days from the date of this quotation`;
}

/** 과제 2: AI가 섞는 틀린 할인 값 */
const T2_WRONG = /(10\.80|10,800|26,200|28,145)/;

const TASK2: TaskDef = {
    id: 2,
    job_id: 1,
    lecture_id: 2,
    title: '바이어 요청에 맞춘 견적서 작성',
    situation: '독일 바이어가 LED 스탠드와 어댑터 3개 품목의 견적을 요청했다. FOB 부산과 CIF 함부르크 두 조건의 가격이 모두 필요하다.',
    instruction: '단가표와 견적 조건 기준에 맞춰 바이어에게 보낼 견적서를 작성한다. 모델별 단가와 금액, 두 조건의 합계, 결제 조건, 납기, 유효기간을 담는다.',
    time_limit_min: 30,
    sort_order: 2,
    materials: [
        { id: 201, title: '바이어 견적 요청 메일', content: T2_RFQ },
        { id: 202, title: '단가표와 견적 조건', content: T2_PRICE },
        { id: 203, title: '지난 거래 메모', content: T2_MEMO },
    ],
    trap: {
        label: 'DL-200 수량 할인',
        wrong: '10% 할인, 단가 USD 10.80',
        correct: '5% 할인, 단가 USD 11.40',
        wrongPattern: T2_WRONG,
        correctPattern: /(11\.40|11,400|26,800|28,745)/,
        topicPattern: /(할인|단가|가격|DL-200|금액|합계|총액)/i,
        source: '단가표',
    },
    elements: [
        { label: 'DL-200 할인 단가(USD 11.40)', pattern: /(11\.40|11,400)/ },
        { label: 'FOB 합계(USD 26,800)', pattern: /(26,800|26800)/ },
        { label: 'CIF 합계(USD 28,745)', pattern: /(28,745|28745)/ },
        { label: '결제 조건(T/T 30% 선금)', pattern: /(T\/T|advance|선금|deposit)/i },
        { label: '납기와 유효기간', pattern: /(validity|valid|유효)/i },
    ],
    reply: {
        summary: (w) => {
            const n = t2Nums(w);
            return `견적에 필요한 조건을 정리했어요.

| 모델 | 수량 | 적용 단가 | 금액 |
|---|---|---|---|
| DL-200 | 1,000 | USD ${n.unit} (수량 할인 ${n.rate}) | USD ${n.amount} |
| DL-300 | 500 | USD 18.00 (1,000개 미만이라 할인 없음) | USD 9,000.00 |
| PA-20C | 2,000 | USD 3.20 | USD 6,400.00 |

- **FOB 부산 합계: USD ${n.fob}**
- CIF 함부르크: FOB 합계 + 해상운임 1,850 + 보험료 95 = **USD ${n.cif}**
- 결제: T/T 30% 선금, 70% 선적 전 / 유효기간 30일
- 납기: 주문 후 35일 안에 선적, 해상 운송 약 35일 → 1월 말 도착하려면 11월 하순까지 주문 확정이 필요해요.
- 지난 거래 메모에 따라 바이어는 표 형식을 선호하고, 추가 할인은 승인이 없어요.`;
        },
        draft: (w) => `바이어에게 보낼 견적서 초안이에요.

---
${t2Quote(w)}
---

지난 거래 메모대로 모델별 단가·금액과 무역 조건을 표로 정리했어요.`,
        fact: (w) => {
            const n = t2Nums(w);
            return `단가표 기준으로 DL-200은 1,000개 이상이라 **${n.rate} 할인**이 적용돼 단가 **USD ${n.unit}**, 금액 USD ${n.amount}이에요. 그래서 FOB 합계는 USD ${n.fob}, CIF 함부르크 합계는 USD ${n.cif}가 돼요.`;
        },
        correction: `다시 확인해 보니 제가 틀렸어요. 죄송해요.

단가표의 수량 할인은 **5%**예요 (10%가 아니에요). 그래서 DL-200 단가는 12.00 × 0.95 = **USD 11.40**, 금액은 **USD 11,400.00**이에요.

- FOB 부산 합계: 11,400 + 9,000 + 6,400 = **USD 26,800.00**
- CIF 함부르크 합계: 26,800 + 1,850 + 95 = **USD 28,745.00**

지난 거래 메모에 "추가 할인은 팀장 승인 필요, 이번 건은 승인 없음"이라고 되어 있으니 5%만 적용해야 해요.`,
        translate: `바이어 메일을 우리말로 옮기면 다음과 같아요.

> 봄 카탈로그용으로 아래 품목에 관심이 있습니다: DL-200 1,000개, DL-300 500개, PA-20C 2,000개.
> FOB 부산과 CIF 함부르크 두 조건의 USD 가격을 결제 조건, 납기, 견적 유효기간과 함께 알려 주십시오.
> 물품은 2027년 1월 말까지 함부르크에 도착해야 합니다.`,
        tone: `견적서와 함께 보내는 메일은 이렇게 정중하게 시작해 보세요.

- "Thank you for your inquiry of November 16. We are pleased to submit our quotation as follows."
- 끝맺음: "We look forward to your order and will be happy to answer any questions."`,
        tips: [
            '수량 할인은 모델별로 1,000개 이상일 때만 적용돼요. DL-300은 500개라 해당하지 않아요.',
            'CIF 가격은 FOB 합계에 해상운임과 보험료를 더해 계산해요.',
            '바이어는 표 형식을 선호해요 (지난 거래 메모).',
        ],
        factPattern: /(할인|단가|가격|금액|합계|총액|얼마)/,
    },
    seedPrompts: [
        '너는 수출 견적 담당자야. 독일 바이어의 견적 요청 메일과 단가표를 보고, 모델별 적용 단가와 금액, FOB·CIF 합계를 표로 정리해 줘.',
        '단가표와 대조해 보니 DL-200 할인율이 다른 것 같아. 할인율과 금액이 맞는지 다시 확인해 줘.',
        '확인한 숫자로 바이어에게 보낼 영문 견적서를 표 형식으로 만들어 줘. 결제 조건, 납기, 유효기간을 반드시 포함해 줘.',
        '납기 문장을 더 구체적으로 고쳐 줘. 1월 말 도착 조건을 지킬 수 있다는 점이 드러나게.',
    ],
    seedAnswer: t2Quote(false),
    rubric: dualRubric([
        {
            check_id: 'QUOTE_PRICE',
            label: '단가표의 수량 할인만 적용해 모델별 단가와 두 조건의 합계를 정확히 적기',
            rule: 'DL-200 단가가 USD 11.40(5% 할인), FOB 부산 합계가 USD 26,800, CIF 함부르크 합계가 USD 28,745로 적혀 있고, 승인 없는 할인을 적용한 값(USD 10.80, 10,800, 26,200, 28,145)이 없으면 충족한다.',
        },
        {
            check_id: 'QUOTE_TERMS',
            label: '결제 조건, 납기, 견적 유효기간을 모두 밝히기',
            rule: '견적서에 결제 조건(T/T 선금), 납기(주문 후 선적 시점), 견적 유효기간이 모두 있으면 충족한다.',
        },
    ]),
    judges: {
        QUOTE_PRICE: (answer) => {
            if (T2_WRONG.test(answer)) {
                return { met: false, feedback: '견적서에 단가표에 없는 할인을 적용한 값(USD 10.80 등)이 있어요. 단가표의 수량 할인은 5%라 DL-200 단가는 USD 11.40이에요.' };
            }
            const miss = [
                /11\.40/.test(answer) ? null : 'DL-200 단가(USD 11.40)',
                /26,?800/.test(answer) ? null : 'FOB 합계(USD 26,800)',
                /28,?745/.test(answer) ? null : 'CIF 합계(USD 28,745)',
            ].filter((x): x is string => x !== null);
            if (miss.length) return { met: false, feedback: `단가표로 계산한 값 가운데 견적서에 없는 것이 있어요: ${miss.join(', ')}.` };
            return { met: true, feedback: 'DL-200 단가(USD 11.40)와 FOB·CIF 합계가 단가표의 할인율(5%)로 계산한 값과 일치해요.' };
        },
        QUOTE_TERMS: (answer) => {
            const miss = [
                /(T\/T|advance|선금|deposit|payment)/i.test(answer) ? null : '결제 조건',
                /(deliver|shipment|lead time|납기|선적)/i.test(answer) ? null : '납기',
                /(validity|valid|유효)/i.test(answer) ? null : '유효기간',
            ].filter((x): x is string => x !== null);
            if (miss.length) return { met: false, feedback: `견적서에 ${miss.join(', ')}에 관한 내용이 없어요. 단가표의 "견적 조건 기준"에 있는 값을 적어야 해요.` };
            return { met: true, feedback: '결제 조건(T/T 30% 선금), 납기, 유효기간(30일)을 모두 밝혔어요.' };
        },
    },
    practice: '견적서를 보내기 전에 AI가 계산한 단가와 합계를 단가표로 직접 다시 계산해 보세요.',
};

// ───────────────────────── 과제 3: 신용장 조건 검토 ─────────────────────────

const T3_LC = `# 취소불능 화환신용장 (MT700 발췌)

\`\`\`
:20:  Documentary Credit Number  LC-JKT-26-0458
:31C: Date of Issue              261115
:31D: Date and Place of Expiry   261210 JAKARTA
:50:  Applicant                  PT Sinar Abadi, Jakarta
:59:  Beneficiary                Daon Industrial Co., Ltd., Incheon
:32B: Amount                     USD 63,000.00
:39A: Credit Amount Tolerance    00/00
:43P: Partial Shipments          PROHIBITED
:43T: Transhipment               PROHIBITED
:44E: Port of Loading            INCHEON, KOREA
:44F: Port of Discharge          JAKARTA, INDONESIA
:44C: Latest Date of Shipment    261205
:45A: Goods                      3,000 SETS OF STAINLESS KITCHEN SINK, CIF JAKARTA
:46A: Documents Required
      1. SIGNED COMMERCIAL INVOICE IN 3 ORIGINALS
      2. FULL SET OF CLEAN ON BOARD OCEAN B/L
      3. PACKING LIST
      4. INSPECTION CERTIFICATE ISSUED AND SIGNED BY
         MR. HADI PRATAMA (APPLICANT'S REPRESENTATIVE)
:48:  Period for Presentation    5 DAYS AFTER SHIPMENT DATE
:71D: Charges                    ALL BANKING CHARGES INCLUDING ISSUING
                                 BANK'S ARE FOR BENEFICIARY'S ACCOUNT
\`\`\``;

const T3_CONTRACT = `# 매매 계약 주요 조건 (계약번호 DI-SA-2611)

| 항목 | 계약 내용 |
|---|---|
| 물품 | 스테인리스 주방 싱크 3,000세트, 세트당 USD 21.00, CIF 자카르타 |
| 수량 과부족 | ±5% 허용 |
| 최종 선적일 | 2026년 12월 20일 |
| 분할 선적 | 허용 |
| 환적 | 허용 |
| 검사 | 선적 전 SGS 검사 (비용 매도인 부담) |
| 은행 수수료 | 각자 자국 은행 수수료 부담 |
| 서류 제시 기간 | 선적 후 21일 |`;

const T3_PLAN = `# 생산·선적 계획 (11월 17일 기준)

- 생산 완료: 12월 12일 (3,000세트 중 2,000세트는 12월 3일 완료)
- 선적 예정: 12월 15일 인천 출항, **싱가포르 환적** 뒤 12월 24일 자카르타 도착
  - 인천 → 자카르타 직항 선박은 월 1회(1월 초)뿐이라 환적이 필요함
- 검사: SGS 선적 전 검사 12월 13일 예약`;

function t3Ship(wrong: boolean) {
    return wrong
        ? '최종 선적일(44C)은 **12월 25일**이라 12월 15일 선적 계획과 맞아요.'
        : '최종 선적일(44C)이 **12월 5일**이라 12월 15일 선적 계획보다 빠르고, 계약(12월 20일)과도 달라요. 가장 시급한 문제예요.';
}

function t3Memo(wrong: boolean) {
    const ship = wrong
        ? ''
        : '1. **최종 선적일 (44C)**: L/C 12월 5일 ↔ 계약 12월 20일, 선적 계획 12월 15일. → 12월 20일로 수정 요청\n';
    const n = wrong ? 1 : 2;
    const items = [
        '**유효기일 (31D)**: 12월 10일 자카르타. 선적(12월 15일) 전에 만료되고 장소도 수입국이에요. → 2027년 1월 10일, 인천(한국)으로 수정 요청',
        '**환적 (43T)**: 금지 ↔ 계약 허용, 싱가포르 환적 필요. → 허용으로 수정 요청',
        '**분할 선적 (43P)**: 금지 ↔ 계약 허용. 2,000세트를 먼저 보낼 수 없어요. → 허용으로 수정 요청',
        '**검사증명서 (46A-4)**: 수입상 대리인이 서명해야 해서 우리가 서류를 갖출 수 없어요(수입상이 서명을 안 하면 대금을 못 받음). → 계약대로 SGS 검사증명서로 수정 요청',
        '**제시 기간 (48)**: 선적 후 5일 ↔ 계약 21일. → 21일로 수정 요청',
        '**수수료 (71D)와 과부족 (39A)**: 모든 수수료 우리 부담, 금액 과부족 0% ↔ 계약은 각자 부담, ±5%. → 계약대로 수정 요청',
    ];
    return `L/C 조건 검토 결과 (LC-JKT-26-0458)

${ship}${items.map((t, i) => `${i + n}. ${t}`).join('\n')}

→ 선적 전에 수입상(PT Sinar Abadi)에게 위 항목의 L/C 수정(amendment)을 요청해야 해요.`;
}

/** 과제 3: AI가 섞는 틀린 최종 선적일과, 원문의 값 */
const T3_WRONG = /(12\s*월\s*25\s*일|12\/25|261225|dec(ember)?\.?\s*25)/i;
const T3_CORRECT = /(12\s*월\s*5\s*일|12\/0?5(?!\d)|261205|2026-12-05|dec(ember)?\.?\s*0?5(?!\d))/i;

const TASK3: TaskDef = {
    id: 3,
    job_id: 1,
    lecture_id: 3,
    title: '신용장(L/C) 조건 검토',
    situation: '인도네시아 수입상이 신용장(L/C)을 개설해 보냈다. 이대로 받아들이면 대금을 받지 못할 위험이 있는지 선적 전에 확인해야 한다.',
    instruction: 'L/C 조건을 매매 계약과 생산·선적 계획에 대조해, 문제가 될 조항과 수정 요청할 내용을 정리한다.',
    time_limit_min: 30,
    sort_order: 3,
    materials: [
        { id: 301, title: '신용장 사본 (MT700 발췌)', content: T3_LC },
        { id: 302, title: '매매 계약 주요 조건', content: T3_CONTRACT },
        { id: 303, title: '생산·선적 계획', content: T3_PLAN },
    ],
    trap: {
        label: 'L/C 최종 선적일(44C)',
        wrong: '12월 25일',
        correct: '12월 5일 (261205)',
        wrongPattern: T3_WRONG,
        correctPattern: T3_CORRECT,
        topicPattern: /(선적일|44C|선적 기한|최종 선적|날짜|기한|일정)/i,
        source: '신용장 원문',
    },
    elements: [
        { label: '최종 선적일(44C) 불일치', pattern: /(44C|12\s*월\s*5\s*일|261205)/i },
        { label: '유효기일(31D)', pattern: /(31D|유효\s*기일|expiry|만기)/i },
        { label: '환적 금지(43T)', pattern: /(43T|환적|trans-?s?hipment)/i },
        { label: '분할 선적 금지(43P)', pattern: /(43P|분할)/i },
        { label: '검사증명서 조항(46A)', pattern: /(검사\s*증명|inspection|SGS|대리인)/i },
        { label: '수정 요청(amendment)', pattern: /(수정|amend|어멘드)/i },
    ],
    reply: {
        summary: (w) => `L/C를 계약과 선적 계획에 대조해 봤어요.

- ${t3Ship(w)}
- 유효기일(31D) 12월 10일, 장소 자카르타: 선적 예정일보다 빨라요.
- 환적(43T)·분할 선적(43P) 금지: 계약은 둘 다 허용이고, 싱가포르 환적이 필요해요.
- 검사증명서(46A-4): 수입상 대리인 서명이 필요해 우리가 통제할 수 없는 조항이에요.
- 제시 기간(48) 5일, 수수료(71D) 전부 우리 부담, 과부족(39A) 0%: 모두 계약과 달라요.

수정(amendment)을 요청할 조항을 우선순위대로 정리해 드릴까요?`,
        draft: (w) => `검토 메모 초안이에요.

---
${t3Memo(w)}
---`,
        fact: (w) => `신용장 44C 기준으로 ${t3Ship(w)}`,
        correction: `다시 보니 제가 잘못 읽었어요. 죄송해요.

신용장 **44C (Latest Date of Shipment)는 261205, 즉 2026년 12월 5일**이에요 (12월 25일이 아니에요). 선적 계획은 12월 15일이고 계약은 12월 20일이라, 이대로면 **선적일을 맞출 수 없어 서류가 하자(discrepancy) 처리돼요.** 가장 먼저 12월 20일로 수정 요청해야 하는 조항이에요.

유효기일(31D) 12월 10일도 함께 늘려야 선적 뒤 서류를 제시할 수 있어요.`,
        translate: `신용장 주요 조항을 우리말로 옮기면: 31D 유효기일 2026-12-10 자카르타 / 43P 분할 선적 금지 / 43T 환적 금지 / 44C 최종 선적일 2026-12-05 / 46A-4 수입상 대리인(Hadi Pratama)이 발행·서명한 검사증명서 / 48 선적 후 5일 안에 서류 제시 / 71D 개설은행 수수료를 포함한 모든 은행 수수료는 수익자(우리) 부담.`,
        tone: `수입상에게 보내는 수정 요청은 이렇게 정중하게 써 보세요.

- "To ensure smooth shipment and payment, we kindly request the following amendments to L/C No. LC-JKT-26-0458."
- "These amendments are in line with our sales contract DI-SA-2611."`,
        tips: [
            'L/C의 날짜 조항(44C, 31D, 48)을 선적 계획과 하나씩 대조해 보세요.',
            '수익자가 통제할 수 없는 서류(수입상 서명이 필요한 서류)는 대표적인 독소 조항이에요.',
            '계약과 다른 조항은 모두 수정(amendment) 요청 대상이에요.',
        ],
        factPattern: /(선적일|44C|날짜|기한|언제|유효)/i,
    },
    seedPrompts: [
        '너는 수출 결제 담당자야. 받은 L/C를 매매 계약, 선적 계획과 대조해서 문제가 될 조항을 조항 번호와 함께 목록으로 정리해 줘.',
        '44C 선적일이 L/C 원문과 다른 것 같은데, 원문과 대조해서 맞는지 확인해 줘.',
        '확인한 내용으로 수입상에게 요청할 수정 항목을 우선순위대로 검토 메모 형식으로 써 줘. 조항 번호, 현재 조건, 요청할 조건을 반드시 포함해 줘.',
        '검사증명서 조항이 왜 위험한지 한 문장 더 보완해 줘.',
    ],
    seedAnswer: t3Memo(false),
    rubric: dualRubric([
        {
            check_id: 'LC_SHIPMENT_DATE',
            label: '신용장의 최종 선적일이 선적 계획과 맞지 않는 점을 짚고 수정을 요청하기',
            rule: '검토 결과에 L/C 44C 최종 선적일(2026년 12월 5일)이 선적 계획(12월 15일)·계약(12월 20일)과 맞지 않는다는 지적과 수정(amendment) 요청이 있고, 최종 선적일을 12월 25일로 잘못 적은 문장이 없으면 충족한다.',
        },
    ]),
    judges: {
        LC_SHIPMENT_DATE: (answer) => {
            if (T3_WRONG.test(answer)) {
                return { met: false, feedback: '검토 결과에 최종 선적일을 신용장 원문과 다르게(12월 25일) 적은 부분이 있어요. 원문의 44C는 261205, 즉 12월 5일이에요.' };
            }
            const named = /44C/i.test(answer) || T3_CORRECT.test(answer);
            if (!named) return { met: false, feedback: '최종 선적일(44C, 12월 5일)이 선적 계획(12월 15일)보다 빠르다는 점을 검토 결과에서 찾지 못했어요. 이대로면 선적일을 맞출 수 없어 대금을 받지 못할 수 있어요.' };
            if (!/(수정|amend|어멘드)/i.test(answer)) return { met: false, feedback: '최종 선적일의 문제는 짚었지만, 수입상에게 무엇으로 고쳐 달라고 할지(수정 요청)가 없어요.' };
            return { met: true, feedback: '최종 선적일(44C, 12월 5일)이 선적 계획보다 빠르다는 점을 짚고 수정을 요청했어요.' };
        },
    },
    practice: 'L/C를 받으면 날짜 조항(44C, 31D, 48)부터 계약서와 선적 계획에 한 줄씩 맞춰 보세요.',
};

// ───────────────────────── 과제 4: 선적 서류 대조 ─────────────────────────

const T4_INVOICE = `# COMMERCIAL INVOICE

- Invoice No.: MS-INV-2611 / Date: Nov. 14, 2026
- Seller: Mirae Ceramics Co., Ltd., Icheon, Korea
- Buyer / Consignee: **Sunrise Homeware Pty Ltd**, 22 Harbour St, Sydney NSW 2000, Australia
- Vessel / Voyage: **MV Coral Bay V.21S**
- Port of Loading: Busan, Korea / Port of Discharge: Sydney, Australia
- Terms: CIF Sydney

| Description | Quantity | Unit Price | Amount |
|---|---|---|---|
| Ceramic mug 350ml (MG-350) | 4,800 pcs | USD 3.00 | USD 14,400.00 |
| Ceramic plate 27cm (PL-270) | 2,400 pcs | USD 3.00 | USD 7,200.00 |
| **Total** | **7,200 pcs** | | **USD 21,600.00** |`;

const T4_PACKING = `# PACKING LIST

- Invoice No.: MS-INV-2611

| Description | Quantity | Cartons | N.W. (kg) | G.W. (kg) | Measurement |
|---|---|---|---|---|---|
| MG-350 (24 pcs/ctn) | 4,800 pcs | 200 ctns | 3,600 | 3,900 | 16.0 CBM |
| PL-270 (20 pcs/ctn) | 2,400 pcs | 120 ctns | 2,280 | 2,520 | 12.5 CBM |
| **Total** | 7,200 pcs | **320 ctns** | 5,880 | **6,420** | 28.5 CBM |

Shipping Mark: SUNRISE / SYDNEY / C/NO. 1-320 / MADE IN KOREA`;

const T4_BL = `# BILL OF LADING (초안)

- B/L No.: KMBS-77120
- Shipper: Mirae Ceramics Co., Ltd.
- Consignee: TO ORDER OF **Sunrise Homeware Ltd**
- Notify Party: Sunrise Homeware Pty Ltd, Sydney
- Vessel / Voyage: **MV Coral Bay V.12S**
- Port of Loading: Busan / Port of Discharge: Sydney
- Description: **330 CTNS** OF CERAMIC TABLEWARE (MUGS AND PLATES)
- Gross Weight: **6,240 KGS** / Measurement: 28.5 CBM
- Shipping Mark: SUNRISE / SYDNEY / C/NO. 1-320 / MADE IN KOREA
- "SHIPPED ON BOARD" Nov. 15, 2026 / FREIGHT PREPAID`;

function t4Weight(wrong: boolean) {
    return wrong
        ? '총중량(G.W.)은 포장 명세서와 B/L 모두 **6,420kg으로 일치**해요.'
        : '총중량(G.W.)이 포장 명세서는 **6,420kg**, B/L은 **6,240kg**으로 달라요 (숫자 순서가 바뀐 오기로 보여요).';
}

function t4List(wrong: boolean) {
    const rows = [
        '| 박스 수 | PL 320 ctns (C/NO. 1-320) | B/L 330 CTNS | B/L을 320 CTNS로 정정 |',
        wrong ? null : '| 총중량 | PL 6,420 kg | B/L 6,240 kg | B/L을 6,420 KGS로 정정 |',
        '| 항차 | 인보이스 V.21S | B/L V.12S | 선사 확인 후 맞는 항차로 정정 |',
        '| 수하인 이름 | 인보이스 Sunrise Homeware Pty Ltd | B/L Sunrise Homeware Ltd | B/L에 "Pty" 추가 |',
    ].filter(Boolean);
    return `선적 서류 대조 결과 (MS-INV-2611)

| 항목 | 기준 서류 | 다른 서류 | 조치 |
|---|---|---|---|
${rows.join('\n')}

- 수량(7,200 pcs), 금액(USD 21,600), 용적(28.5 CBM), 화인은 세 서류가 일치해요.
- B/L은 아직 초안이므로 선사(포워더)에 위 항목의 정정을 요청한 뒤 원본을 받아요.`;
}

/** 과제 4: AI가 섞는 틀린 사실 ("중량이 일치한다") */
const T4_WRONG = /((중량|무게|G\.?\s?W)[^\n]{0,25}(일치|같|문제\s*없)|weights? (match|are the same))/i;

const TASK4: TaskDef = {
    id: 4,
    job_id: 1,
    lecture_id: 4,
    title: '선적 서류 대조와 오류 찾기',
    situation: '호주로 도자기 식기를 수출한다. 선사에서 선하증권(B/L) 초안이 왔는데, 원본이 나오기 전에 서류끼리 맞는지 확인해야 한다.',
    instruction: '상업 송장, 포장 명세서, B/L 초안을 서로 대조해 맞지 않는 곳을 모두 찾고, 무엇을 어떻게 정정할지 정리한다.',
    time_limit_min: 30,
    sort_order: 4,
    materials: [
        { id: 401, title: '상업 송장 (Commercial Invoice)', content: T4_INVOICE },
        { id: 402, title: '포장 명세서 (Packing List)', content: T4_PACKING },
        { id: 403, title: '선하증권 초안 (B/L)', content: T4_BL },
    ],
    trap: {
        label: 'B/L 총중량',
        wrong: '세 서류 모두 6,420kg으로 일치',
        correct: 'B/L 6,240kg ↔ 포장 명세서 6,420kg',
        wrongPattern: T4_WRONG,
        correctPattern: /6,?240/,
        topicPattern: /(중량|무게|weight|G\.?\s?W|kg)/i,
        source: '포장 명세서와 B/L 초안',
    },
    elements: [
        { label: '박스 수(330 ↔ 320)', pattern: /330/ },
        { label: '총중량(6,240 ↔ 6,420)', pattern: /6,?240/ },
        { label: '항차(V.12S ↔ V.21S)', pattern: /(12S|항차|voyage)/i },
        { label: '수하인 이름(Pty 누락)', pattern: /(Pty|수하인|consignee)/i },
        { label: '정정 요청', pattern: /(정정|수정|correct|amend)/i },
    ],
    reply: {
        summary: (w) => `세 서류를 항목별로 대조해 봤어요.

- 수량 7,200 pcs, 금액 USD 21,600, 용적 28.5 CBM은 일치해요.
- 박스 수: 포장 명세서 320 ctns ↔ B/L 330 CTNS로 달라요.
- ${t4Weight(w)}
- 항차: 인보이스 V.21S ↔ B/L V.12S로 달라요.
- 수하인: 인보이스 "Sunrise Homeware Pty Ltd" ↔ B/L "Sunrise Homeware Ltd"로 "Pty"가 빠졌어요.`,
        draft: (w) => `오류 목록과 정정 요청을 정리했어요.

---
${t4List(w)}
---`,
        fact: (w) => t4Weight(w),
        correction: `다시 대조해 보니 제가 놓쳤어요. 죄송해요.

B/L 초안의 Gross Weight는 **6,240 KGS**이고, 포장 명세서의 총중량은 **6,420 kg**이에요. 숫자 4와 2의 순서가 바뀐 오기로 보여요. 이것도 B/L 정정 항목에 넣어야 해요.

정정할 곳은 모두 4가지예요: 박스 수(330 → 320), 총중량(6,240 → 6,420), 항차(V.12S ↔ V.21S 확인), 수하인 이름("Pty" 누락).`,
        translate: `B/L 초안 주요 항목을 우리말로 옮기면: 수하인 "Sunrise Homeware Ltd의 지시인", 통지처 Sunrise Homeware Pty Ltd, 선박·항차 MV Coral Bay V.12S, 품명 "도자기 식기 330박스", 총중량 6,240kg, 용적 28.5CBM, 11월 15일 본선 적재, 운임 선불.`,
        tone: `선사에 보내는 정정 요청은 이렇게 쓰면 좋아요.

- "Please find below the corrections required for the draft B/L No. KMBS-77120 before the original is issued."
- 항목마다 "Current / Should read" 두 줄로 적으면 오해가 없어요.`,
        tips: [
            '숫자 항목(박스 수, 중량, 용적)은 한 줄씩 나란히 놓고 비교해 보세요.',
            '화인의 C/NO.(박스 번호 범위)도 박스 수를 확인하는 근거가 돼요.',
            'B/L은 원본이 나오기 전에 초안 단계에서 정정해야 비용이 들지 않아요.',
        ],
        factPattern: /(중량|무게|weight|kg|박스|수량)/i,
    },
    seedPrompts: [
        '너는 수출 서류 담당자야. 상업 송장, 포장 명세서, B/L 초안을 항목별로 대조해서 서로 다른 곳을 표로 정리해 줘.',
        '포장 명세서와 B/L의 중량을 다시 대조해 줘. 숫자가 같다고 한 게 맞는지 확인하고 싶어.',
        '확인한 오류로 선사에 보낼 정정 요청 목록을 만들어 줘. 항목, 현재 값, 고칠 값 형식으로.',
        '수하인 이름 항목은 왜 고쳐야 하는지 한 줄 덧붙여 수정해 줘.',
    ],
    seedAnswer: t4List(false),
    rubric: dualRubric([
        {
            check_id: 'BL_NUMBERS',
            label: '세 서류의 숫자 항목(박스 수, 중량)을 모두 대조해 다른 곳을 정정 항목에 넣기',
            rule: '정정 항목에 B/L의 박스 수(330 CTNS ↔ 포장 명세서 320 ctns)와 총중량(6,240 KGS ↔ 6,420 kg)이 모두 있고, 중량이 서류끼리 일치한다고 적은 문장이 없으면 충족한다.',
        },
    ]),
    judges: {
        BL_NUMBERS: (answer) => {
            if (T4_WRONG.test(answer)) {
                return { met: false, feedback: '총중량이 서류끼리 일치한다고 적었어요. B/L 초안의 총중량은 6,240kg이라 포장 명세서(6,420kg)와 달라요.' };
            }
            const miss = [
                /330/.test(answer) ? null : '박스 수(B/L 330 ↔ 포장 명세서 320)',
                /6,?240/.test(answer) ? null : '총중량(B/L 6,240kg ↔ 포장 명세서 6,420kg)',
            ].filter((x): x is string => x !== null);
            if (miss.length) return { met: false, feedback: `정정 항목에서 빠진 숫자 오류가 있어요: ${miss.join(', ')}.` };
            return { met: true, feedback: '박스 수(330 ↔ 320)와 총중량(6,240 ↔ 6,420)의 차이를 모두 정정 항목에 넣었어요.' };
        },
    },
    practice: 'B/L 초안이 오면 박스 수, 중량, 항차를 송장과 포장 명세서에 나란히 놓고 한 줄씩 대조해 보세요.',
};

// ───────────────────────── 과제 5: 수출 통관 절차 정리 ─────────────────────────

const T5_MEMO = `# 요청 메모 — 해외영업팀 박선영 팀장

다음 주부터 베트남 화장품 수출 건을 신입 사원에게 맡기려고 해요.
**수출 통관 절차와 필요 서류를 한 장으로 정리**해 주세요.

- 단계별로 누가(우리, 관세사, 세관, 포워더) 무엇을 하는지
- 단계마다 필요한 서류
- 놓치기 쉬운 기한과 주의점
- 이번 건 일정(자료 3)에 맞춘 날짜`;

const T5_GUIDE = `# 수출 통관 안내 (사내 교육 자료 요약)

1. **수출신고**: 물품을 선적하기 전에 관세사를 통해 전자통관시스템(UNI-PASS)으로 수출신고를 한다. 물품이 있는 곳(공장 등)에서 신고할 수 있다.
   - 필요 서류: 상업 송장(Commercial Invoice), 포장 명세서(Packing List), 수출 계약서 또는 주문서
2. **심사와 검사**: 대부분 서류 심사만으로 수리된다. 검사 대상으로 선별되면 세관 검사를 받는다.
3. **수출신고 수리**: 수리되면 수출신고필증이 나온다. **수리일로부터 30일 안에 선적**해야 하며, 넘기면 수리가 취소될 수 있고 과태료 대상이 된다.
4. **선적**: 포워더가 컨테이너를 CY(컨테이너 야적장)에 반입하고 선적한다. 선적 뒤 선하증권(B/L)을 받는다.
5. **원산지증명서**: FTA 특혜 관세를 받으려면 원산지증명서(C/O)를 발급받아 바이어에게 보낸다. 베트남은 한-베트남 FTA와 RCEP 중 유리한 협정을 고른다.

**주의**: 수입국에서 따로 요구하는 서류가 있을 수 있으므로 바이어와 미리 확인한다.`;

const T5_SCHEDULE = `# 이번 건: 화장품 수출 (호찌민행)

| 항목 | 내용 |
|---|---|
| 바이어 | Saigon Beauty JSC, 호찌민 |
| 물품 | 기초 화장품 4종, 1,200박스 |
| 공장 출고 | 12월 8일 (화) |
| 수출신고 예정 | 12월 8일 (관세사: 한결관세사무소) |
| CY 반입 | 12월 9일 (부산 신항) |
| 출항 (ETD) | 12월 11일 |
| 도착 (ETA) | 12월 18일 |
| 원산지증명서 | 바이어가 RCEP 원산지증명서를 요청함 |`;

function t5Days(wrong: boolean) {
    return wrong ? '60일' : '30일';
}

function t5Sheet(wrong: boolean) {
    return `수출 통관 한 장 정리 (베트남 화장품 건)

| 단계 | 누가 | 무엇을 | 서류 | 이번 건 날짜 |
|---|---|---|---|---|
| 1. 서류 준비 | 우리 | 인보이스·패킹리스트 작성, 관세사에 전달 | 상업 송장, 포장 명세서, 주문서 | 12월 5일까지 |
| 2. 수출신고 | 관세사 | UNI-PASS로 수출신고 | 위 서류 | 12월 8일 |
| 3. 심사·수리 | 세관 | 서류 심사(검사 선별 시 검사), 수출신고필증 발급 | 수출신고필증 | 12월 8일 |
| 4. CY 반입·선적 | 포워더 | 부산 신항 CY 반입, 선적 | B/L | 12월 9일 반입, 12월 11일 출항 |
| 5. 원산지증명 | 우리 | RCEP 원산지증명서 발급, 바이어에 송부 | C/O | 출항 전후 |

**놓치기 쉬운 점**
- 수출신고 수리일로부터 **${t5Days(wrong)} 안에 선적**해야 해요. 넘기면 수리 취소·과태료 대상이에요.
- 바이어가 RCEP 원산지증명서를 요청했으니 한-베트남 FTA 서식으로 발급하지 않도록 주의해요.
- 베트남 쪽에서 따로 요구하는 서류가 있는지 바이어에게 미리 확인해요.`;
}

const TASK5: TaskDef = {
    id: 5,
    job_id: 1,
    lecture_id: 5,
    title: '수출 통관 절차와 필요 서류 정리',
    situation: '팀장이 다음 주부터 베트남 화장품 수출 건을 신입 사원에게 맡기려 한다. 신입이 보고 따라 할 수 있는 정리 자료가 필요하다.',
    instruction: '수출 통관 절차를 단계별로(누가, 무엇을, 어떤 서류로) 정리하고, 놓치기 쉬운 기한과 이번 건 일정을 함께 담은 한 장짜리 자료를 만든다.',
    time_limit_min: 30,
    sort_order: 5,
    materials: [
        { id: 501, title: '팀장 요청 메모', content: T5_MEMO },
        { id: 502, title: '수출 통관 사내 안내', content: T5_GUIDE },
        { id: 503, title: '이번 건 일정', content: T5_SCHEDULE },
    ],
    trap: {
        label: '수출신고 수리 뒤 선적 기한',
        wrong: '60일',
        correct: '30일',
        wrongPattern: /60\s*일/,
        correctPattern: /30\s*일/,
        topicPattern: /(기한|기간|수리일|며칠|언제까지|30|60|선적 의무)/,
        source: '사내 안내 자료',
    },
    elements: [
        { label: '수출신고(UNI-PASS)', pattern: /(수출\s*신고|UNI-?PASS)/i },
        { label: '관세사의 역할', pattern: /관세사/ },
        { label: '수리 뒤 30일 선적 기한', pattern: /30\s*일/ },
        { label: '필요 서류(송장, 포장 명세서)', pattern: /(인보이스|상업\s*송장|포장\s*명세|패킹|invoice|packing)/i },
        { label: '원산지증명서(RCEP)', pattern: /(원산지|C\/O|RCEP)/i },
        { label: '이번 건 날짜', pattern: /(12\s*월\s*(8|9|11)\s*일|12\/(0?8|0?9|11)(?!\d))/ },
    ],
    reply: {
        summary: (w) => `자료를 바탕으로 수출 통관 흐름을 정리했어요.

1. **수출신고**: 관세사가 UNI-PASS로 신고 (상업 송장, 포장 명세서, 주문서 필요)
2. **심사·검사**: 대부분 서류 심사로 끝나고, 선별되면 세관 검사
3. **수리**: 수출신고필증 발급. 수리일로부터 **${t5Days(w)} 안에 선적**해야 해요.
4. **선적**: 포워더가 CY 반입 뒤 선적, B/L 수령
5. **원산지증명서**: 이번 바이어는 RCEP C/O를 요청했어요.

이번 건은 12월 8일 신고, 12월 9일 CY 반입, 12월 11일 출항이에요.`,
        draft: (w) => `팀장님께 드릴 한 장 정리 초안이에요.

---
${t5Sheet(w)}
---`,
        fact: (w) => `수출신고가 수리되면 **수리일로부터 ${t5Days(w)} 안에** 선적해야 해요. 이번 건은 12월 8일 수리, 12월 11일 출항이라 여유가 있어요.`,
        correction: `확인해 보니 제가 틀렸어요. 죄송해요.

사내 안내 자료 3번에 따르면 **수리일로부터 30일 안에 선적**해야 해요 (60일이 아니에요). 넘기면 수리가 취소될 수 있고 과태료 대상이 돼요. 정리 자료에도 30일로 적어 주세요.`,
        translate: `RCEP는 "역내 포괄적 경제 동반자 협정"으로, 한국과 베트남이 모두 가입한 다자 FTA예요. C/O(Certificate of Origin)는 원산지증명서, CY(Container Yard)는 컨테이너 야적장이에요.`,
        tone: `신입 사원이 읽기 쉽게 하려면 이렇게 다듬어 보세요.

- 단계마다 "누가 / 무엇을 / 서류 / 날짜" 네 칸을 고정해요.
- 기한은 굵게 표시하고, 어기면 어떻게 되는지 한 줄로 덧붙여요.
- 약어(C/O, CY, B/L)는 처음 나올 때 한글 뜻을 붙여요.`,
        tips: [
            '팀장 메모의 네 가지 요구(누가·무엇을, 서류, 기한, 이번 건 날짜)를 표의 열로 쓰면 빠짐없이 담을 수 있어요.',
            '수출신고 수리 뒤 선적 기한은 사내 안내 자료 3번에 있어요.',
            '원산지증명서는 바이어가 요청한 협정(RCEP)으로 발급해야 해요.',
        ],
        factPattern: /(기한|기간|며칠|언제까지|선적 의무|수리일)/,
    },
    seedPrompts: [
        '너는 수출 통관 실무 담당자야. 신입 사원용으로 수출 통관 절차를 단계별로 누가, 무엇을, 어떤 서류로 하는지 표로 정리해 줘.',
        '수리 뒤 선적 기한이 사내 안내 자료와 다른 것 같아. 자료와 대조해서 며칠인지 확인해 줘.',
        '확인한 내용으로 팀장님께 드릴 한 장 정리를 만들어 줘. 이번 건 날짜와 놓치기 쉬운 주의점을 반드시 포함해서 표 형식으로.',
        '약어에 한글 뜻을 붙여서 신입이 읽기 쉽게 다듬어 줘.',
    ],
    seedAnswer: t5Sheet(false),
    rubric: dualRubric([
        {
            check_id: 'EXPORT_SHIP_DEADLINE',
            label: '수출신고 수리 뒤 선적해야 하는 기한을 사내 안내 자료대로 정확히 적기',
            rule: '정리 자료에 "수출신고 수리일로부터 30일 안에 선적"이 있고, 60일처럼 자료와 다른 기한이 없으면 충족한다.',
        },
    ]),
    judges: {
        EXPORT_SHIP_DEADLINE: (answer) => {
            if (/60\s*일/.test(answer)) return { met: false, feedback: '정리 자료에 선적 기한이 60일로 적혀 있어요. 사내 안내 자료 3번의 기한은 수리일로부터 30일이에요.' };
            if (!/30\s*일/.test(answer)) return { met: false, feedback: '수출신고 수리 뒤 선적 기한(30일)을 정리 자료에서 찾지 못했어요. 신입이 가장 놓치기 쉬운 기한이에요.' };
            return { met: true, feedback: '수출신고 수리일로부터 30일 안에 선적해야 한다는 기한을 사내 안내 자료대로 적었어요.' };
        },
    },
    practice: '신입용 자료를 만들 때는 AI가 말한 기한과 숫자를 사내 안내 자료 원문으로 한 번 더 확인해 보세요.',
};

export const TASKS: TaskDef[] = [TASK1, TASK2, TASK3, TASK4, TASK5];

export function findTask(id: number) {
    return TASKS.find((t) => t.id === id);
}

export function findLecture(id: number) {
    return LECTURES.find((l) => l.id === id);
}
