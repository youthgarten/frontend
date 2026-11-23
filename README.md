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

카탈로그의 `local:trade-delay-v1`은 `public/lecture-media/trade-delay-v1.mp4`에 있는 강의 파일을 사용합니다. Vite 개발 서버와 배포 빌드에서 같은 출처의 `/lecture-media/trade-delay-v1.mp4`로 재생합니다.
