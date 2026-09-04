# TravelAI - Codex 개발 지침

## 1. 프로젝트 개요

이 저장소는 **TravelAI** 프로젝트다.

TravelAI는 실제 일본 여행에서 사용할 개인용 여행 비서 앱을 목표로 개발 중이다.

단순 포트폴리오용 데모가 아니라 실제 여행 중 사용할 수 있는 실용성이 우선이다.

현재 첫 실제 사용 대상은 일본 도쿄 여행이지만, 구조를 불필요하게 도쿄나 일본에만 고정하지 않는다.

향후 다음과 같은 확장을 고려한다.

* 다른 일본 도시
* 국내 여행
* 여러 명이 함께 가는 여행
* 친구나 다른 사용자도 사용할 수 있는 구조

사용자가 명시적으로 요청하지 않는 이상 대규모 상용 서비스 수준으로 과도하게 설계하지 않는다.

---

## 2. 개발 기본 원칙

작업할 때 다음 규칙을 지킨다.

* 새 Codex 세션에서는 `PROJECT_CONTEXT.md`와 `AGENTS.md`를 먼저 읽고, 실제 작업 대상 코드를 다시 확인한다.
* 수정 전에 관련 기존 파일을 먼저 읽는다.
* 현재 프로젝트 구조를 최대한 유지한다.
* 필요 없는 파일까지 수정하지 않는다.
* 작동 중인 기능을 단순화 목적으로 제거하지 않는다.
* 기존 타입, 서비스, 헬퍼, 컴포넌트를 재사용할 수 있으면 재사용한다.
* 작은 기능 때문에 불필요하게 구조 전체를 리팩터링하지 않는다.
* 사용자에게 필요하지 않은 복잡한 추상화는 피한다.
* 새로운 상태관리 라이브러리, UI 라이브러리, 백엔드 프레임워크, 데이터베이스 등을 함부로 도입하지 않는다.
* 기존 기술 스택만으로 깔끔하게 구현할 수 있으면 현재 스택을 사용한다.
* 변경 전후 동작이 어떻게 달라지는지 파악한다.

큰 수정 전에는:

1. 관련 파일 확인
2. 수정할 파일 범위 파악
3. 가장 작은 변경 범위 선택

수정 후에는:

1. TypeScript 오류 확인
2. 문법 오류 확인
3. 가능한 경우 lint 또는 타입 체크 실행
4. 수정한 파일 목록 정리
5. 중요한 동작 변경만 짧게 설명

---

## 3. 현재 기술 스택

현재 프로젝트는 다음 기술을 사용한다.

* React Native 0.86.3
* Expo SDK 57 (`expo` 57.0.20)
* React 19.2.3
* TypeScript 6.0.3
* Expo Router 57.0.19 기반 구조
* AsyncStorage
* expo-location
* Node.js
* Express
* PostgreSQL (Neon)
* dotenv
* cors
* Google Places API (New)
* react-native-maps 1.27.2
* Google Routes API (WALK, 비일본 TRANSIT)
* NAVITIME Route(totalnavi) via RapidAPI (일본 TRANSIT)
* Open-Meteo Geocoding / Forecast API
* Git
* GitHub

저장소 코드에서 변경된 사실이 확인되지 않는 이상 위 구조를 기준으로 한다.

현재 Expo Go SDK 57을 기준으로 개발한다. SDK 57 호환을 위해 적용된
`expo-router/react-navigation`, `expo-router/js-tabs` import를 과거 직접
`@react-navigation/*` import로 되돌리지 않는다. React Compiler/TypeScript 6 호환 수정과
`app.json`에서 제거된 `newArchEnabled`, `android.edgeToEdgeEnabled`도 실제 문제 근거 없이
복원하지 않는다.

---

## 4. 주요 프로젝트 구조

현재 프로젝트에는 다음과 같은 폴더가 있다.

* `app/`
* `assets/`
* `components/`
* `constants/`
* `hooks/`
* `lib/`
* `services/`
* `server/`
* `types/`
* `scripts/`

주요 파일:

* `package.json`
* `app.json`
* `tsconfig.json`
* `server/server.js`
* `AGENTS.md`
* `PROJECT_CONTEXT.md`

문서보다 실제 코드가 더 최신일 수 있으므로 항상 현재 저장소를 먼저 확인한다.

---

## 5. 백엔드 규칙

현재 백엔드는:

`server/server.js`

에서 실행되는 Express 서버다.

기본 개발 포트는:

`4000`

이다.

현재 서버는 다음 기능을 포함한다.

* Google Places 검색
* 여행 API
* 일정 API
* 사용자 identity와 여행 멤버 API
* Google Routes WALK와 provider별 TRANSIT 경로 API (`POST /routes/compute`)

`DATABASE_URL`이 있으면 Neon PostgreSQL의 `trips`, `schedules`, `users`,
`trip_members` 테이블을 사용한다. 환경변수가 없으면 개발 편의를 위해 동일 기능을
in-memory 저장소로 fallback하며, 이 모드에서는 서버 재시작 시 데이터가 사라질 수 있다.

route API는 `server/route-service.js`에서 입력과 좌표를 검증하고 provider 공통 응답을 만든다.
WALK는 항상 Google Routes, 일본 TRANSIT은 NAVITIME Route(totalnavi), 비일본 TRANSIT은
Google Routes를 사용한다. route 결과는 최대 500개의 process memory cache와 같은 key의
in-flight Promise 공유를 사용하며 DB에는 저장하지 않는다. WALK TTL은 24시간, TRANSIT TTL은
15분이다. cache key에는 mode, provider와 TRANSIT departureTime도 포함되고 서버 재시작 시
cache가 사라진다. Google은 `GOOGLE_MAPS_API_KEY`, NAVITIME은 `NAVITIME_RAPIDAPI_KEY`와
선택 값인 `NAVITIME_RAPIDAPI_HOST`를 서버에서만 사용한다.

예산, 지출, 정산, 준비물은 서버 API나 DB에 저장하지 않고 현재 tripId별
AsyncStorage에 저장한다. `expense`, `settlement`, `packing` 테이블이 있다고 가정하지 않는다.

현재 여행 snapshot이 로컬에 있으나 서버 조회가 404이면 홈, 일정, 일정 생성/수정,
지출 화면에서 서버 여행을 자동 복구할 수 있다. 네트워크 오류나 500에서는 복구하지 않으며,
사라진 일정은 자동 복구하지 않는다. 같은 여행의 동시 복구는 single-flight로 합치고
삭제 중인 여행을 되살리지 않는 보호 로직을 유지한다.

사용자가 요청하지 않는 이상 임의로 DB 구조로 변경하지 않는다.

---

## 6. Google Places 규칙

장소 검색은 프론트에서 Google API를 직접 호출하지 않고 백엔드에서 수행한다.

백엔드는 다음 API를 사용한다.

`https://places.googleapis.com/v1/places:searchText`

API 키는 다음 환경변수에서 읽는다.

`process.env.GOOGLE_MAPS_API_KEY`

API 키를 소스 코드에 직접 작성하지 않는다.

현재 Places 응답에서 주로 사용하는 값:

* 장소 ID
* 장소명
* 주소
* 위도
* 경도

도쿄 중심 고정 bias는 사용하지 않는다. 수정 중인 일정 좌표, 선택 날짜의 가까운 일정,
기기 현재 위치, 여행 대표 도시 순으로 검색 기준 좌표를 정하고, 좌표가 있으면 서버에서
20km 원형 `locationBias`를 적용한다. 이는 검색 결과를 제한하는 `locationRestriction`이 아니다.

---

## 7. 환경변수 규칙

비밀키와 환경별 URL은 코드에 직접 넣지 않는다.

### 프론트엔드

프론트의 백엔드 주소는:

`EXPO_PUBLIC_API_URL`

에서 읽는다.

예:

```env
EXPO_PUBLIC_API_URL=https://xxxxx.ngrok-free.dev
```

프론트 서비스 코드에서 `/places/search` 같은 경로를 뒤에 붙인다.

따라서 아래처럼 작성하지 않는다.

```env
EXPO_PUBLIC_API_URL=https://xxxxx.ngrok-free.dev/places/search
```

### 백엔드

서버의 Google API 키는:

`GOOGLE_MAPS_API_KEY`

를 사용한다.

위치:

`server/.env`

예:

```env
GOOGLE_MAPS_API_KEY=YOUR_KEY
NAVITIME_RAPIDAPI_KEY=YOUR_KEY
NAVITIME_RAPIDAPI_HOST=navitime-route-totalnavi.p.rapidapi.com
DATABASE_URL=YOUR_NEON_CONNECTION_STRING
```

실제 키는 절대 Git에 올리지 않는다.

---

## 8. 개발 서버 실행 방식

기본 개발 환경은 집 Windows PC의 `C:\projects\TravelAI`이며, Git Bash에서는
`cd /c/projects/TravelAI`를 사용한다. 일반적으로 터미널 3개를 사용할 수 있다.

### 터미널 1 - Express 서버

```bash
cd /c/projects/TravelAI/server
npm start
```

`npm start`는 `node server.js`와 동일하다. 기본 포트는 `4000`이며, PostgreSQL 개발 모드에서는
다음 로그를 함께 확인한다.

```text
TravelAI storage: PostgreSQL
TravelAI server running on port 4000
```

포트 로그만 확인하지 말고 `DATABASE_URL`이 적용된 PostgreSQL mode인지 확인한다.

### 터미널 2 - ngrok

```bash
ngrok http 4000
```

로컬 구성에 따라 `npx ngrok http 4000`을 사용할 수도 있다.

ngrok에서 생성된 HTTPS 주소를 프론트 `.env`에 넣는다.

예:

```env
EXPO_PUBLIC_API_URL=https://xxxxx.ngrok-free.dev
```

### 터미널 3 - Expo

먼저 다음 명령을 사용한다.

```bash
npx expo start
```

집 네트워크에서 직접 연결되지 않을 때만:

```bash
npx expo start --tunnel
```

중요:

* Expo tunnel = iPhone Expo Go와 Metro/Expo 개발 서버 연결
* ngrok = React Native 앱과 Express 서버 4000 포트 연결

둘은 역할이 다르다.

---

## 9. 집 PC에서 개발 재개

앞으로 기본 개발은 현재 집 PC 한 대에서 진행한다. 세션 시작 시:

1. `cd /c/projects/TravelAI`
2. `git status`
3. `git pull origin main`
4. lockfile 또는 의존성이 바뀌었으면 루트에서 `npm install`
5. `server`에서도 별도로 `npm install`
6. 루트 `.env`와 `server/.env` 확인
7. backend, 필요 시 ngrok, Expo 순으로 실행

루트와 `server`는 각각 `package.json`을 사용한다. backend dependency는 `server` 폴더에서
별도로 설치해야 하며, 루트 `npm install`만으로 `pg` 같은 서버 모듈이 보장되지 않는다.

Git으로 자동 동기화되지 않는 항목:

* `.env`
* API 키
* ngrok 인증 설정
* 글로벌 설치 프로그램
* VS Code 확장
* 로컬 네트워크 설정

새 라이브러리나 별도 설치 도구가 추가되면 어느 폴더에서 설치해야 하는지 사용자에게 알려준다.

---

## 10. Git 작업 규칙

일반 작업 시작:

```bash
git status
git pull origin main
```

작업 중에는 실제 동작을 확인하고 변경 범위에 맞는 TypeScript, ESLint 등의 검사를 실행한다.
테스트하지 않은 변경을 자동으로 commit/push하지 않는다.

작업 종료 전:

```bash
git status
git add .
git commit -m "작업 내용"
git push
```

사용자가 명확하게 요청하지 않는 이상 Codex가 임의로 `git commit` 또는 `git push`를 실행하지 않는다.
긴 개발 세션에서는 사용자와 합의한 기능 단위의 안정된 시점에 중간 커밋을 권장할 수 있다.

절대로 커밋하면 안 되는 것:

* API 키
* `.env`
* 인증 토큰
* 비밀정보

커밋 전에 환경파일이 포함되지 않았는지 확인한다.

---

## 11. 사용자와 작업하는 방식

사용자는 구현 중심의 빠른 진행을 선호한다.

기능 요청을 받으면:

* 관련 코드 확인
* 실제 수정
* 불필요한 장황한 설명 최소화
* 수정 파일 명확히 표시
* 필요한 설치 작업이 있으면 알려주기
* 다른 PC에서도 설치/설정이 필요한지 알려주기

복잡한 변경은 짧은 계획을 먼저 제시할 수 있다.

단순한 변경은 설명만 길게 하고 실제 작업을 늦추지 않는다.

---

## 12. 일정 UX 핵심 규칙

일반 여행 일정에는 **완료 체크 기능을 넣지 않는다.**

이유:

여행 일정은 실제 여행 중 계속 변경될 수 있고,
일정 화면은 할 일 목록보다는 오늘 어디를 갈지 확인하는 용도에 가깝다.

따라서 일반 일정 항목을 체크리스트처럼 다루지 않는다.

방문 도장/방문 기록 기능은 현재 계획에서 제외되어 있으므로 TODO로 다시 추가하지 않는다.

일정 목록의 날짜 섹션 순서는 항상 여행 1일차부터 유지한다. 최초 진입 시에만 기기 로컬 오늘을
여행 범위에 clamp한 날짜로 자동 scroll하고, 이후 사용자의 수동 scroll을 다시 덮어쓰지 않는다.
UTC `toISOString()` 날짜로 바꾸거나 지도와 다른 초기 날짜 정책을 만들지 않는다.

일정 생성·수정은 Safe Area/키보드를 고려한 하단 고정 저장 CTA, React saving state와 동기
`useRef` lock을 유지한다. 유효 좌표가 없는 일정은 오류가 아니며 안내와 `위치 없이 저장할까요?`
확인을 거쳐 저장할 수 있어야 한다. 기존 linked 일정의 장소 텍스트를 바꾸지 않은 경우 위치 연결을
보존하는 정책과 `hasValidScheduleLocation` 판별을 재사용한다.

---

## 13. 계획 제외 사항

방문 도장/방문 기록은 현재 개발 계획에서 제외되어 있다. 사용자의 새 요청 없이 일정 완료
체크나 방문 기록 기능을 추가하지 않는다.

---

## 14. 준비물 체크리스트 방향

여행 준비 체크리스트는 구현되어 있다.

이 기능은 메인 하단 탭이 아니라 홈 화면의 진입 요소를 누르면
전체 체크리스트 화면으로 이동하는 구조다.
데이터는 tripId별 AsyncStorage에 저장하며 여행 삭제 시 해당 여행 데이터만 정리한다.

예상 용도:

* 준비물
* 예약 확인
* 출발 전 할 일
* 여행 준비 작업

이 체크리스트는 실제 할 일이므로 완료 체크를 사용할 수 있다.

일반 여행 일정과 혼동하지 않는다.

---

## 15. 홈 화면 방향

홈 화면은 여행 중 빠르게 상황을 확인하는 화면이다.

현재 주요 요소:

* 현재 여행 정보와 삭제
* 오늘 일정 개수와 미리보기
* 다음 일정 예보와 여행 도시 현재 날씨
* 예산 요약
* 준비물 화면 진입
* AI 추천 안내

`오늘 일정 · N개`와 Open-Meteo 기반 홈 날씨 UI/데이터 연동은 구현되어 있다.
다음 일정 예보와 여행 대표 도시의 현재 날씨는 서로 다른 fallback 규칙을 사용하므로
수정 전 실제 코드를 확인한다.

---

## 16. 지도/동선 방향

지도에서는 하루 이동 흐름과 현재 일정 순서의 인접 구간별 추천 이동수단을 보여준다.

현재 구현된 기능:

* 일정 장소 marker와 전체 시간순 일정 기준 번호
* 선택 날짜의 시간순 이동 순서와 체류시간
* WALK는 Google Routes, 일본 TRANSIT은 NAVITIME Route(totalnavi), 비일본 TRANSIT은 Google Routes
* WALK 거리·시간, TRANSIT 시간과 양쪽 Polyline, TRANSIT 노선·환승·운임 표시
* segment별 WALK/TRANSIT `loading | available | unavailable` availability
* WALK no-route와 TRANSIT walk-only를 unusable로 처리하는 대칭 fallback
* 시간·운임·환승·TRANSIT 내부 도보량을 비교하는 AUTO 기본 추천
* 주요 도쿄·오사카 노선 한국어 display mapping과 NFKC 원문 fallback
* backend cache/in-flight 공유와 frontend 후보 cache
* 좌표가 없는 일정의 목록 유지와 미등록 안내
* 기기 로컬 오늘을 여행 범위에 clamp한 최초 날짜 선택과 같은 여행 내 사용자 선택 유지

canonical WALK 결과는 항상 Google Routes다. TRANSIT 결과에 실제 transit leg가 없으면 NAVITIME의
도보 시간·거리를 WALK로 쓰지 않고 TRANSIT unavailable로 처리한다. 한 mode만 가능하면 자동
선택하고 unavailable chip은 비활성화한다. 둘 다 가능할 때만 수동 변경할 수 있으며 사용자의
직접 선택을 AUTO가 다시 덮어쓰지 않는다. 둘 다 불가능할 때만 공통 unavailable 상태를 표시한다.

AUTO 점수의 1차 기준은 다음과 같다.

* WALK = 총 도보시간
* TRANSIT = 실제시간 + 탑승 기본 4분 + 환승당 5분 + 운임 60엔당 1분 + 내부도보 1km당 2분

점수와 추천 이유는 UI에 노출하지 않는다. 상수는 `lib/route-recommendation.ts`에 두고 실제 사용
사례를 바탕으로 조정한다. 이 AUTO는 **현재 일정 순서 안에서 segment의 이동수단을 선택**할 뿐,
장소나 일정 순서를 재배열하는 Route 순서 최적화가 아니다.

route segment는 전체 시간순 일정의 **인접 pair**만 대상으로 한다. 중간에 unlinked 일정이 있으면
해당 일정 앞뒤 구간을 계산하지 않고 다음 linked 일정으로 건너뛰어 연결하지 않는다. linked 상태가
바뀌면 최신 schedule 데이터와 좌표 signature에서 marker와 route를 다시 파생한다. marker 번호는
linked 일정끼리 재번호화하지 않는다.

segment별 `AbortController`, request version/signature, 사용자 선택 version과 stale response
검사를 유지한다. AUTO resolution은 mode별 후보를 최대 한 번만 요청해 재귀 fallback loop를 막고,
한 segment의 결과 변경이 다른 segment를 재로딩하거나 지우지 않게 한다.

iOS `react-native-maps` native crash 방어 구조는 회귀시키지 않는다. `selectedDate`와
`renderedMapDate` 분리, native 전환 직렬화/coalescing, 마지막 pending 날짜, map generation과
`onMapReady` gate, stale callback 무시, 날짜+schedule signature snapshot 일치 검사를 유지한다.
Polyline에는 finite/range-valid한 2~2,000개 좌표만 전달하고 route geometry를
`fitToCoordinates`에 섞지 않는다. viewport는 유효 marker 좌표만 사용한다.

일본 노선명 localization은 원본 `transitSummary.lineNames`를 바꾸지 않고 표시 직전에만 적용한다.
검증된 exact mapping이 없으면 억지로 번역하지 않고 NFKC 정규화 원문을 표시한다. 일반 도시철도는
IC 운임, 신칸센 포함 경로는 `운임 약 N엔` 형식을 유지한다.

장소 저장 시 `placeId`, 장소명, 위도, 경도와 주소를 가능하면 유지하고 Places API에서 받은
좌표나 placeId를 불필요하게 버리지 않는다.

향후 작업:

* 일본 BUS 실제 경로 실데이터 검증
* AUTO 추천 점수 실사용 기반 미세조정
* trip countryCode/timezone 정식 모델
* 복수 TRANSIT 후보 자체 최적화
* Route/일정 순서 최적화 preview/apply
* 영업시간, 막차, 실시간 지연 반영

---

## 17. 장소 검색 방향

앱은 유명 관광지만 검색하는 구조가 아니다.

향후 다음과 같은 장소를 폭넓게 찾을 수 있어야 한다.

* 관광지
* 음식점
* 카페
* 소규모 가게
* 인기 장소
* 주변 추천 장소
* 예상하지 못했던 새로운 장소

사용자는 모든 장소를 미리 저장하는 것보다 실제 여행 중 실시간 발견 기능도 중요하게 생각한다.

현재 일부 도쿄 장소에 들어간 fallback 검색은 테스트/호환용 임시 구현이다.

---

## 18. 지출 기능 방향

지출/예산 화면에는 여행 자금, 현금/카드, 잔액, 다중 통화와 환율 snapshot,
개인/공동 지출, 대여금, 최종 정산과 완료 취소가 구현되어 있다.
금액 출력과 여행 자금 입력에는 천 단위 쉼표가 적용된다.

새 지출/정산 데이터는 이름이 아니라 `tripMemberId`를 기준으로 결제자, 참여자,
대여자, 차용자와 송금 방향을 구분한다. `currentMemberId`로 UI의 `나`를 판단한다.
이름 기반 legacy 데이터는 호환 읽기를 유지하되 임의로 memberId에 귀속시키지 않는다.

예산, 지출, 정산은 tripId별 AsyncStorage에 저장되며 아직 서버 DB에 동기화하지 않는다.

memberId 기반 공동 지출은 결제자를 제외한 각 `participant → payer`, 대여는
`borrower → lender`를 `ExpenseSettlementRelation`으로 계산한다. 실제 송금 완료는 별도
`SettlementPayment`로 저장하며, 개별 대여 완료는 `source: "loan"`, 최종 정산은
`source: "final"`을 사용한다. `resolvedRelations`로 어떤 원본 관계가 해소됐는지 연결하므로
최종 정산과 개별 기록의 정산 상태는 독립적이지 않다.

다인원 공동 지출은 relation 단위로 미정산/일부 정산/정산 완료를 표시한다.
정산 완료를 취소하면 해당 payment가 해결한 relation만 다시 미정산으로 계산한다.
이름 기반 legacy payment나 대여는 source/resolvedRelations가 없을 수 있으며 기존
`loanSettled` 호환 경로를 유지한다.

사용자가 요청하지 않은 기능까지 한 번에 구현하지 않는다.

---

## 19. 여러 명 여행

현재 실제 사용 계획은 2인 여행이다.

향후 더 많은 인원도 고려할 수 있다.

사용자 identity인 `users.id`와 여행별 멤버 identity인 `trip_members.id`를 구분하고,
지출/정산/멤버 구조를 2명에 고정하지 않는다. 로그인 없는 현재 단계에서는 기기별 userId를
AsyncStorage에 유지하고 placeholder member claim으로 개발 검증한다.
실제 로그인/OAuth나 초대 링크를 사용자가 요청하기 전에 확대 구현하지 않는다.

---

## 20. AI 기능 방향

현재 AI 탭은 여행/일정 미리보기, 빠른 질문, 채팅 형태 UI까지 구현된 부분 구현 상태다.
답변은 키워드별 고정 안내 문구이며 실제 AI API, 모델 호출, 일정 자동 변경은 구현되지 않았다.

향후 AI 기능으로 고려하는 항목:

* 일정 추천
* 일정 재구성
* 이동 순서 변경
* 대체 일정 추천
* 주변 장소 추천
* 갑작스러운 지역 변경 대응
* 여행 비서 역할

예:

예정된 장소를 못 가게 되었거나 다른 지역으로 이동했을 때,
AI가 새로운 동선을 제안할 수 있는 방향을 고려한다.

AI를 단순 앱 로직으로 해결 가능한 모든 기능에 억지로 사용하지 않는다.

---

## 21. 여행 종료 기능

여행 종료 기능은 아직 미구현이다. 향후 방향은 사용자가 회고문을 직접 작성하는 별도 기능이 아니라,
이미 저장된 여행 기간·일정·지출·정산 등의 데이터를 이용해 자동 통계와 요약 리포트를 만드는 것이다.
방문 도장이나 별도 방문 기록을 전제로 설계하지 않는다. 최종 통계 항목과 화면은 아직 확정되지 않았다.

---

## 22. 라이트/다크 모드 방향

향후 라이트/다크 테마 모두 지원하는 방향을 고려한다.

현재 navigation theme provider와 시스템 자동 테마 설정은 있지만 주요 TravelAI 화면은
라이트 색상을 직접 사용하므로 완전한 다크 모드는 미구현이다.

UI 수정 시 다음을 주의한다.

* TextInput 글자색
* placeholder 색
* 배경색
* 테두리 대비
* 텍스트 대비

예전에 흰 배경에 흰 글자가 보여서 읽기 어려웠던 문제가 있었으므로 같은 문제를 반복하지 않는다.

---

## 23. 현재 우선순위

과거 우선순위였던 홈 일정 개수, 홈 날씨, 지출 금액 표시, WALK/TRANSIT provider 연결과
segment AUTO 추천은 구현되어 있다. 고정된 다음 작업을 문서만 보고 시작하지 말고 사용자의 최신
요청과 현재 저장소 상태를 먼저 확인한다.

현재 남은 주요 방향:

1. 일본 BUS 실데이터 검증과 AUTO 점수 실사용 기반 미세조정
2. trip countryCode/timezone 정식 모델
3. 복수 TRANSIT 후보 자체 최적화
4. AUTO 이동수단 선택과 별개인 Route/일정 순서 최적화 preview/apply
5. 실제 AI 연동
6. 실초대·인증·멀티디바이스와 expense/settlement 서버 동기화
7. multi-trip/history, 자동 여행 종료 통계 리포트와 offline/network robustness
8. production backend·rate limit·quota·Cloud Run 및 EAS·TestFlight·최종 polish

최적화가 기존 schedule time을 직접 바꿀지 별도 `sortOrder`를 사용할지, 결과를 preview/apply하는
UX는 아직 결정되지 않았다. 구현 전에 설계를 확정하고 DB schema나 일정 의미를 임의로 바꾸지 않는다.

---

## 24. 정보 우선순위

작업 시 다음 순서로 신뢰한다.

1. 현재 사용자의 명확한 요청
2. 현재 저장소 코드
3. `PROJECT_CONTEXT.md`
4. `AGENTS.md`

문서와 실제 코드가 충돌하면:

* 코드를 확인한다.
* 문서가 오래된 것인지 판단한다.
* 필요하면 사용자에게 차이를 알려준다.
* 근거 없이 추측하지 않는다.
