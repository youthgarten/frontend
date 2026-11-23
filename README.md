# 청년 유치원 프론트엔드

메타버스 교육 공간의 웹 프론트엔드.

## 기술 스택

- React 19 + TypeScript + Vite
- Phaser 4 (맵, 캐릭터)
- Tailwind CSS 4

## 실행

```bash
npm install
npm run dev      # 개발 서버
npm run build    # 타입 검사 + 배포용 빌드
npm test         # 단위 테스트
```

Node 20 이상이 필요하다.

백엔드 없이도 동작한다. `npm run dev`를 실행하면 모의 서버(`mock/`)가 `/api/v1`에 응답한다.
계정과 검수용 조작은 [`docs/mock-server.md`](docs/mock-server.md)에 있다.
실제 백엔드에 연결하려면 `.env.example`을 `.env.local`로 복사해 `API_TARGET`에 주소를 적는다.

## Vercel 배포의 백엔드 연결

Vercel 프로젝트의 Production 환경 변수 `VITE_PUBLIC_BACKEND_ORIGIN`에 공개 백엔드의 HTTPS 출처를 넣고 다시 배포한다. 값에는 `/api/v1` 경로를 붙이지 않는다. `vercel.json`이 REST 요청을 백엔드로 전달해(주소가 바뀌면 이 파일도 고친다) 브라우저의 세션 쿠키는 같은 출처를 사용한다. Phaser WebSocket은 같은 공개 주소의 `wss://`에 직접 접속하므로 백엔드 `WS_ALLOWED_ORIGINS`에 `https://youthgarten.vercel.app`을 넣는다.

## 폴더 구조

```
src/
  main.tsx   진입점
  App.tsx    최상위 컴포넌트
  game/      맵, 캐릭터 이동 등 Phaser 쪽 코드
  ui/        맵 위에 뜨는 화면 (React 컴포넌트)
  api/       서버와 주고받는 코드 (사용법: docs/api-module.md)
  session/   로그인 상태와 내 정보
mock/        모의 서버 (개발 서버에서만 동작)
docs/        계획, 의도, 판단 기록, ADR
```

문서는 [`docs/direction/index.html`](docs/direction/index.html)(화면 정리)부터 읽는다.
누가 무엇을 맡는지는 [`docs/ownership.md`](docs/ownership.md)에 있다.

## 작업 방식

- `main`에 직접 올리지 않는다.
- 각자 브랜치를 만들어 작업하고, MR(PR)로 올려 확인받은 뒤 합친다.

## 로컬 강의 영상

납기 지연 회신 강의의 공식 영상은 YouTube `c9pBqlOSnx4`(697초)다. YouTube 재생이 어려울 때는 강의실에서 같은 영상의 MP4를 재생할 수 있다. 기존 카탈로그 v1도 같은 출처의 `/lecture-media/trade-delay-v1.mp4`를 사용한다.
