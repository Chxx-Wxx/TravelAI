# TravelAI

TravelAI는 실제 여행 중 일정, 장소, 지도, 날씨, 준비물, 예산과 공동 정산을 한곳에서
관리하기 위한 React Native/Expo 앱이다. 현재 첫 사용 시나리오는 일본 여행이지만
도시나 인원수를 특정 값에 고정하지 않는다.

## 기술 구성

* Expo Router, React Native, TypeScript
* Express API (`server/server.js`)
* Neon PostgreSQL (`DATABASE_URL`이 없으면 개발용 in-memory fallback)
* Google Places API (New), Google Maps
* Open-Meteo 날씨 API
* AsyncStorage 기반 trip-scoped 예산/지출/정산/준비물 데이터

## 로컬 실행

루트와 서버 의존성을 설치한다.

```bash
npm install
cd server
npm install
```

프론트 `.env`에는 Express 서버 주소를 설정한다.

```env
EXPO_PUBLIC_API_URL=https://your-server-url.example
```

서버의 `server/.env`에는 필요한 환경변수를 설정한다. 실제 값은 Git에 올리지 않는다.

```env
GOOGLE_MAPS_API_KEY=YOUR_KEY
DATABASE_URL=YOUR_NEON_CONNECTION_STRING
```

PostgreSQL을 사용할 때 최초 한 번 스키마를 초기화한다.

```bash
cd server
npm run db:init
```

Express와 Expo를 각각 실행한다.

```bash
cd server
npm start
```

```bash
npx expo start
```

실기기에서 로컬 서버에 직접 접근할 수 없는 환경에서는 Express에 ngrok을 사용하고,
Expo 연결도 필요하면 `npx expo start --tunnel`을 사용한다. 두 tunnel은 역할이 다르다.

## 개발 문서

현재 구현 상태와 데이터 구조는 [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md), 작업 원칙은
[AGENTS.md](AGENTS.md)를 확인한다. 문서보다 실제 코드가 최신일 수 있으므로 변경 전 관련 코드를
먼저 확인한다.

검사는 다음 명령으로 실행한다.

```bash
npx tsc --noEmit
npm run lint
git diff --check
```
