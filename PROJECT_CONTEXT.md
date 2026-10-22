# TravelAI 프로젝트 컨텍스트

이 문서는 새 개발자가 현재 저장소의 구조와 구현 범위를 빠르게 파악하기 위한 현황 문서다.
마지막 코드 대조일은 2026-09-05이며, 문서보다 현재 소스코드와 사용자의 최신 요청을 우선한다.
이 대조는 `main` 브랜치의 현재 working tree를 기준으로 했다.

## 1. 프로젝트 목적

TravelAI는 실제 여행 중 일정, 장소, 지도, 날씨, 준비물, 예산과 공동 정산을 관리하기 위한
개인용 여행 비서 앱이다. 첫 사용 시나리오는 일본 도쿄 여행이지만, 여행·멤버·지출 데이터
구조를 도쿄 또는 2명에 고정하지 않는다. 실제 여행에서 빠르게 확인하고 수정할 수 있는
실용성을 우선하며, 요청 없이 대규모 상용 서비스 수준으로 확대하지 않는다.

## 2. 현재 기술과 실행 구조

### 프론트엔드

* Expo SDK 57 (`expo` 57.0.20), React Native 0.86.3, React 19.2.3, TypeScript 6.0.3
* Expo Router 57.0.19의 file-based routing
* 하단 탭: 일정, 지도, 홈, 지출, AI
* `react-native-maps` 1.27.2 기반 지도
* `expo-location` 기반 foreground 현재 위치
* `@react-native-async-storage/async-storage` 기반 로컬 저장
* `@react-native-community/datetimepicker` 기반 날짜/시간 입력

현재 Expo Go SDK 57을 기준으로 개발·실기기 검증한다. SDK 57 호환을 위해 React Navigation
연동 import는 `expo-router/react-navigation`, tab 관련 type/component import는
`expo-router/js-tabs`를 사용한다. React Compiler와 TypeScript 6에서 안전하도록 render 중 state
변경을 피하고 타입을 좁혀 사용한다. `app.json`에는 더 이상 불필요한 `newArchEnabled`,
`android.edgeToEdgeEnabled` 옵션이 없으며 typed routes와 React Compiler experiment는 유지한다.

주요 화면:

```text
app/(tabs)/schedule.tsx   일정 목록
app/(tabs)/map.tsx        날짜별 지도와 이동 순서
app/(tabs)/index.tsx      홈
app/(tabs)/expense.tsx    예산·지출·대여·정산
app/(tabs)/ai.tsx         AI 형태의 임시 UI
app/schedule/create.tsx   일정 생성
app/schedule/[id].tsx     일정 상세·수정
app/trip/create.tsx       여행 생성
app/trip/join-dev.tsx     개발 전용 멤버 claim 화면
app/packing/index.tsx     준비물 체크리스트
```

### 백엔드

* `server/server.js`에서 실행하는 Express 5 서버
* 기본 포트 `4000`, `PORT`가 있으면 해당 값 사용
* `pg`를 통한 PostgreSQL 연결
* `DATABASE_URL`이 있으면 PostgreSQL, 없으면 in-memory development fallback
* Google Places API (New)의 Text Search를 프론트 대신 호출
* Google Routes WALK와 provider별 TRANSIT 경로를 공통 응답으로 정규화
* 지출·정산·준비물 API는 없음

### 외부 API

* Google Places API (New): Express 서버 경유
* Google Routes API: 모든 WALK와 일본 외 TRANSIT에 사용
* NAVITIME Route(totalnavi): RapidAPI를 통해 일본 TRANSIT에 사용
* Open-Meteo Geocoding/Forecast API: 앱에서 직접 호출
* 실제 AI API: 연결되지 않음

## 3. 설치, 환경변수, 실행

기본 개발 환경은 집 Windows PC 한 대이며 프로젝트 경로는 다음과 같다.

```text
C:\projects\TravelAI
```

Git Bash에서는 다음 경로를 사용한다.

```bash
cd /c/projects/TravelAI
```

루트와 서버는 각각 `package.json`을 사용하므로 의존성도 각각 설치해야 한다.

```bash
npm install
```

```bash
cd server
npm install
```

백엔드에서 `Cannot find module 'pg'` 같은 모듈 누락 오류가 발생하면 루트 설치 여부만 보지 말고
`server` 폴더의 의존성을 별도로 설치했는지 확인한다.

루트 `.env`:

```env
EXPO_PUBLIC_API_URL=https://your-server-url.example
```

`EXPO_PUBLIC_API_URL`에는 origin만 넣는다. `/places/search`, `/trips` 같은 경로는 서비스
코드가 붙인다.

`server/.env`:

```env
GOOGLE_MAPS_API_KEY=YOUR_KEY
NAVITIME_RAPIDAPI_KEY=YOUR_KEY
NAVITIME_RAPIDAPI_HOST=navitime-route-totalnavi.p.rapidapi.com
DATABASE_URL=YOUR_NEON_CONNECTION_STRING
PORT=4000
```

`PORT`는 선택 값이며 없으면 4000을 사용한다. `DATABASE_URL`은 Neon connection string이고,
없으면 서버가 in-memory fallback으로 실행된다. 비밀값은 코드·문서·Git에 넣지 않는다.
PostgreSQL을 처음 사용할 때:

```bash
cd server
npm run db:init
```

서버와 Expo 실행:

```bash
cd server
npm start
```

```bash
npx expo start
```

`npm start`와 `node server.js`는 현재 동일한 서버를 실행한다. PostgreSQL 개발 모드라면 다음 두
로그를 함께 확인한다. 포트 로그만 보지 말고 storage mode가 PostgreSQL인지 확인한다.

```text
TravelAI storage: PostgreSQL
TravelAI server running on port 4000
```

Express는 기본적으로 `localhost:4000`에서 실행된다. iPhone에서 직접 접근할 수 없으면
`ngrok http 4000` 또는 로컬 사용 방식에 따라 `npx ngrok http 4000`을 실행하고, 생성된 HTTPS
origin을 루트 `.env`의 `EXPO_PUBLIC_API_URL`에 넣는다. Expo는 먼저 `npx expo start`를 사용하고
집 네트워크에서 직접 연결되지 않을 때만 `npx expo start --tunnel`을 사용한다.

* ngrok: React Native 앱 → Express backend
* Expo tunnel: iPhone Expo Go → Metro/Expo development server

### 개발 세션 재개 체크리스트

1. `cd /c/projects/TravelAI`
2. `git status`
3. `git pull origin main`
4. 새 환경이거나 lockfile/의존성이 바뀌었으면 루트와 `server`에서 각각 `npm install`
5. 루트 `.env`와 `server/.env` 확인
6. `server`에서 backend 실행 후 PostgreSQL mode 로그 확인
7. 필요할 때만 ngrok 실행 후 `EXPO_PUBLIC_API_URL` 갱신
8. Expo 실행

## 4. 데이터 저장 위치

| 데이터 | 현재 source of truth | 상태 |
| --- | --- | --- |
| 여행 | Express의 PostgreSQL 또는 in-memory 저장소 | 서버 CRUD 완료 |
| 사용자·여행 멤버 | Express의 `users`, `trip_members` | ensure/list/claim 완료, 인증은 없음 |
| 일정 | Express의 PostgreSQL 또는 in-memory 저장소 | 서버 CRUD 완료 |
| 현재 여행 | AsyncStorage `@travelai_trip` | 한 개의 현재 여행만 사용 |
| 기기 userId | AsyncStorage `@travelai_user_id` | 앱 재실행 후 유지 |
| 현재 멤버 | AsyncStorage `@travelai_current_member_ids` | `tripId -> tripMemberId` mapping |
| 예산·여행 자금 | tripId별 AsyncStorage | 로컬 완료, 서버 동기화 없음 |
| 지출 | tripId별 AsyncStorage | 로컬 완료, 서버 동기화 없음 |
| 정산 완료 기록 | tripId별 AsyncStorage | 로컬 완료, 서버 동기화 없음 |
| 준비물 | tripId별 AsyncStorage | 로컬 완료, 서버 동기화 없음 |
| 일정 로컬 helper | tripId별 AsyncStorage envelope | helper만 존재, 화면 읽기/쓰기 캐시로 연결되지 않음 |

예산 설정, 지출, 정산 완료 기록, 준비물, 일정 helper는 `{ version: 1, byTrip }` envelope를
사용한다. 구형 전역 AsyncStorage 값은 최초 접근한 현재 tripId 아래로 이전된다. 따라서
지출 데이터가 모든 여행에서 공유되는 전역 구조라는 설명은 현재 코드와 다르다.

일정 화면·지도·홈·AI는 일정을 서버에서 읽는다. 일정용 로컬 helper가 있어도 현재 화면은
오프라인 일정 캐시로 사용하지 않으므로, 서버나 네트워크 없이 기존 일정을 보는 기능은 없다.
예산·지출·정산·준비물은 로컬 저장 기능 자체는 사용할 수 있지만 앱 전체 offline-first 흐름이나
서버 재연결 동기화는 구현되지 않았다.

## 5. PostgreSQL 스키마와 in-memory fallback

`server/schema.sql`의 현재 테이블은 네 개다.

### `trips`

* `id`, `trip_name`, `country`, `city`, `start_date`, `end_date`, `people`
* `members JSONB`: 기존 화면 호환용 legacy snapshot

### `users`

* UUID `id`
* 향후 인증용 nullable `auth_provider`, `auth_subject`
* `display_name`, `email`, timestamps

현재는 인증 provider를 사용하지 않고 앱이 만든 기기 userId를 ensure한다.

### `trip_members`

* UUID `id`, `trip_id`, nullable `user_id`, `display_name`
* `role`: `owner | member`
* `status`: `placeholder | active | removed`
* `legacy_member_id`, `created_at`, `joined_at`
* 여행 삭제 시 `ON DELETE CASCADE`
* 사용자 삭제 시 `user_id`는 `ON DELETE SET NULL`
* 같은 여행에서 삭제되지 않은 한 user는 한 멤버에만 연결되도록 unique index 적용

멤버 identity·role·status·user 연결의 source of truth는 `trip_members`다. `trips.members`는
legacy snapshot이며, 현재 `PUT /trips/:id`에서 `members`를 바꿔도 `trip_members`까지 함께
동기화하는 로직은 없다. 현재 프론트에는 여행 수정 UI가 연결되어 있지 않다.

### `schedules`

* `id`, `trip_id`, `title`, `location`, `address`
* nullable `latitude`, `longitude`, `place_id`
* `category`, `duration_minutes`, `date`, `time`, `memo`
* 여행 삭제 시 `ON DELETE CASCADE`

`DATABASE_URL`이 없으면 서버가 동일 API를 프로세스 메모리의 `trips`, `users`,
`tripMembers`, `schedules` 배열로 제공한다. 서버는 실행되지만 재시작하면 네 배열이 모두
사라진다. expense/settlement/packing 테이블은 존재하지 않는다.

## 6. 현재 서버 API

```text
GET    /
POST   /places/search
POST   /routes/compute

POST   /users/ensure

POST   /trips
GET    /trips
GET    /trips/:id
PUT    /trips/:id
DELETE /trips/:id

GET    /trips/:id/members
POST   /trips/:tripId/members/:memberId/claim

POST   /schedules
GET    /schedules?tripId=...
GET    /schedules/:id
PUT    /schedules/:id
DELETE /schedules/:id
```

PostgreSQL과 in-memory 모드 모두 여행·일정 CRUD와 user ensure/member claim을 제공한다.
PostgreSQL 일정 생성은 foreign key로, in-memory 일정 생성은 배열 조회로 존재하지 않는 여행을
차단한다. `GET /schedules`는 `tripId`가 없으면 전체 일정도 반환할 수 있지만 프론트는 현재
여행 ID를 전달한다.

`POST /routes/compute`는 `tripId`, 날짜, 국가, 출발·도착 좌표, `WALK | TRANSIT` mode와 TRANSIT
출발시간을 검증한다. provider abstraction은 WALK를 항상 Google Routes로 보내고, TRANSIT은
여행 국가가 일본이면 NAVITIME Route(totalnavi), 그 외에는 Google Routes를 사용한다. 거리,
소요시간, geometry와 TRANSIT 노선·환승·운임·내부 도보량을 공통 응답으로 정규화한다. Google
encoded polyline과 NAVITIME geometry는 모두 유효 좌표 2~2,000개 범위로 방어한다. WALK의
직선거리 5m 이내 좌표는 Google 호출 없이 직접 경로를 반환하며 route 결과는 DB에 저장하지 않는다.

서버 route cache key에는 `tripId`, 날짜, 소수점 5자리로 반올림한 출발·도착 좌표, mode,
provider와 TRANSIT departureTime이 포함된다. 프로세스 메모리 cache의 최대 크기는 500개이고
WALK TTL은 24시간, TRANSIT TTL은 15분이다. 같은 key의 진행 중 요청은 Promise를 공유한다.
서버 재시작 시 cache는 사라지며 개발 console의 route 조회 로그와 실제 upstream API 호출 수는
같지 않을 수 있다.

## 7. 사용자 identity와 여행 멤버

### persistent userId

`services/current-user.ts`는 로그인 대신 `expo-crypto` UUID를 만들고
`@travelai_user_id`에 영구 저장한다. `/users/ensure`로 같은 UUID의 서버 행을 보장한다.
동시 호출은 shared promise로 합쳐진다. 이 값은 현재 기기 식별자일 뿐 인증 또는 권한 증명이 아니다.

### 여행 생성

여행 생성 화면은 현재 userId를 `ownerUserId`로 보낸다. 서버는 첫 멤버를
`role=owner`, `status=active`, 해당 `user_id`, `joined_at`으로 생성한다. 나머지 멤버는
`role=member`, `status=placeholder`, `user_id=null`이다. 서버 응답의 owner memberId를
`tripId -> currentMemberId`로 저장한다. 멤버 수는 2명에 고정되지 않는다.

### placeholder claim과 개발용 join

claim API는 다음을 검사한다.

* tripId에 실제로 속한 memberId인지
* `removed`가 아닌지
* 아직 placeholder이거나 이미 같은 user에게 연결된 멤버인지
* 같은 user가 그 여행의 다른 삭제되지 않은 멤버에 연결되어 있지 않은지

성공하면 `user_id`, `active`, `joined_at`을 설정한다. 같은 user/member 재요청은 허용되고,
다른 user가 이미 가진 멤버 또는 같은 여행의 중복 연결은 409다. PostgreSQL에서는 transaction과
row lock을 사용한다.

`joinTripAsMember`는 user ensure → claim → 최신 trip/members 재조회 → 정확히 한 멤버 연결 검증을
마친 뒤 현재 여행과 currentMemberId mapping을 `AsyncStorage.multiSet`으로 함께 저장한다.
`app/trip/join-dev.tsx`는 `__DEV__`에서 tripId와 placeholder memberId를 직접 입력하는 검증용
화면일 뿐 실제 초대 UX가 아니다.

현재 실제 초대 링크/QR/token, 로그인·OAuth, 세션, 서버 권한 검증은 미구현이다. tripId와
memberId를 아는 클라이언트가 claim을 호출할 수 있다.

## 8. current-trip recovery와 여행 삭제

### 현재 여행 복구

홈, 일정 목록, 일정 생성/수정, 지출 화면은 `getCurrentTripWithRecovery()`를 사용한다.
AsyncStorage에 현재 여행이 있으나 서버 `GET /trips/:id`가 404일 때만 로컬 snapshot으로
서버 여행을 다시 만든다.

복구 동작:

1. persistent userId를 ensure하고 복구 여행의 owner에 연결한다.
2. 같은 로컬 tripId의 동시 복구는 하나의 Promise를 공유해 중복 POST를 막는다.
3. 새 서버 tripId로 예산 설정·지출·정산 완료 기록·준비물을 이동한다.
4. 일정 helper의 오래된 캐시는 복구하지 않고 원래 tripId 항목을 삭제한다.
5. 현재 여행 snapshot과 새 currentMemberId mapping을 갱신한다.
6. 복구 중 사용자가 여행을 삭제하거나 바꾸면 revision 검사로 되살리기를 막고, 이미 생성된
   불필요한 복구 여행은 서버에서 정리하려고 시도한다.

네트워크 오류나 500은 복구 조건이 아니며 로컬 여행을 유지한다. in-memory 재시작으로 사라진
일정은 복구하지 않는다. 지도와 AI 탭은 현재 `getTrip()`을 직접 사용하므로 자체적으로 recovery를
시작하지 않지만, 다른 recovery 사용 화면에서 갱신한 현재 여행 snapshot은 읽는다.

### 여행 삭제 cleanup

홈의 여행 삭제는 서버 삭제를 먼저 요청한다. 404는 이미 삭제된 최종 상태로 취급하고 로컬 정리를
계속하지만, 네트워크 오류나 500에서는 로컬 데이터를 지우지 않는다. 성공 후 해당 tripId의:

* 현재 여행 snapshot(그 trip이 현재 여행일 때)
* currentMemberId mapping
* 일정 helper 데이터
* 예산 설정
* 지출
* 정산 완료 기록
* 준비물

만 제거한다. `AsyncStorage.clear()`는 사용하지 않으며 persistent userId와 다른 tripId의 envelope
데이터는 유지한다. PostgreSQL에서는 `trips` 삭제가 해당 `schedules`, `trip_members`를 cascade로
지우지만 `users`와 다른 여행은 유지한다.

## 9. 일정 기능

일정 목록·생성·상세/수정·삭제 CRUD는 서버와 연결되어 있다. 일정은 날짜와 시간순으로 정렬하고
여행 시작일 기준 `N일차`로 그룹화한다. 시간, 예상 소요시간, 다음 일정과의 여유/겹침도 표시한다.
일반 일정에는 의도적으로 완료 체크가 없다.

일정 목록은 여행 전체 날짜를 1일차부터 끝까지 기존 순서로 렌더링한다. 최초 진입 때만 기기 로컬
오늘 날짜를 여행 범위에 맞춰 clamp한 target day가 화면 상단 부근에 오도록 자동 scroll한다.
여행 전이면 시작일, 여행 중이면 오늘, 여행 후면 종료일이 target이며 UTC `toISOString()` 날짜를
사용하지 않는다. 최초 배치 후 사용자가 직접 scroll한 위치는 다시 오늘로 강제 이동하지 않는다.

생성·수정 화면은 다음을 검증한다.

* 제목과 장소명 필수
* 현재 여행과 tripId 필요
* 선택 날짜가 여행 시작일과 종료일 사이인지 확인

저장 중 React state와 동기 `useRef` 잠금을 함께 사용한다. 연타된 호출을 즉시 무시하고 버튼을
비활성화하므로 같은 화면에서 생성 POST 또는 수정 PUT이 중복 전송되는 것을 막는다.

생성·수정 화면의 저장 CTA는 Safe Area와 키보드를 고려한 하단 고정 action 영역에 있고, form
ScrollView에는 가림 방지 여백이 있다. 저장 중에는 disabled와 `저장 중...`을 표시한다. 장소명은
있지만 유효 좌표가 없는 경우 입력부에 위치 미연결 안내를 표시하고, 저장 시 `위치 없이 저장할까요?`
확인창에서 `장소 연결하기` 또는 `위치 없이 저장`을 고른다. 확인창 전에는 저장 lock을 획득하지
않으므로 장소 연결로 돌아간 뒤에도 저장할 수 있다. 메모성 unlinked 일정은 오류가 아니며 확인 후
정상 저장된다.

### linked / unlinked location

`location`은 사람이 읽는 필수 문자열이다. `placeId`, `address`, `latitude`, `longitude`는
Google 후보를 연결했을 때만 있는 선택 값이다.

* linked: 지도 marker와 일정 좌표 기반 날씨에 사용 가능
* unlinked: 일정 CRUD와 목록 표시는 가능하지만 지도 marker·일정 좌표 날씨에는 사용 불가
* 수정 화면에서 기존 장소명을 유지하면 기존 연결 정보를 재사용
* 장소명을 바꾸면 오래된 주소·좌표·placeId를 지우고 다시 검색
* 검색 실패·무결과·애매한 결과에서는 확인 후 위치 없이 저장 가능

## 10. Places autocomplete와 확인 모달

프론트는 Google을 직접 호출하지 않고 `POST /places/search`를 사용한다. 서버는
`https://places.googleapis.com/v1/places:searchText`에 다음 field를 요청한다.

* id, displayName, formattedAddress, location
* primaryType, types

현재 서버 요청은 `pageSize=10`, `languageCode=ko`, `regionCode=JP`다. `regionCode`는 현재 일본
사용 시나리오의 검색 힌트로 남아 있다. 도쿄 고정 좌표 bias나 50km bias는 없다.

### dynamic 20km locationBias

검색 기준 좌표 우선순위:

1. 수정 중인 일정의 기존 연결 좌표
2. 선택 날짜에서 입력 시간과 가장 가까운 다른 일정 좌표
3. foreground 권한으로 얻은 기기 현재 위치
4. Open-Meteo geocoding으로 얻은 여행 대표 도시 좌표
5. 모두 실패하면 bias 없음

좌표가 있으면 서버가 반경 20,000m 원형 `locationBias`를 보낸다. 이는 반경 밖 결과를 막는
`locationRestriction`이 아니다. 현재 위치 권한은 자동완성 맥락에 필요할 때 요청하며 거부되어도
도시 fallback 또는 bias 없는 검색과 unlinked 저장이 가능하다.

후보 거리는 Haversine 직선거리로 계산하며 추가 유료 거리 API를 호출하지 않는다. 이름 일치도를
우선하고 같은 일치 rank 안에서 거리를 보조 정렬 기준으로 사용한다. 중복은 같은 placeId만 제거한다.

### 자동완성과 선택

* 2글자부터 400ms debounce
* 검색어와 기준 좌표별 메모리 cache 및 in-flight request 공유
* request version으로 늦게 온 이전 응답이 최신 결과를 덮지 않게 처리
* 처음 5개, `더 보기` 후 최대 10개 표시
* 지역·역·유일한 POI처럼 이름/유형 기준이 충분히 명확할 때만 자동 연결
* 일반 카테고리나 여러 지점이 가능한 브랜드는 첫 결과를 임의로 자동 연결하지 않음

후보를 직접 누르면 공통 `PlaceConfirmationModal`이 장소명·주소·거리와 미니 지도의 고정 marker를
보여준다. 지도를 움직여도 저장 좌표는 바뀌지 않으며 `이 장소 선택`을 눌러야 연결된다. 모달은
이미 받은 후보로만 렌더링하므로 Place Details 추가 호출은 없다. 보수적인 자동 연결과 수정 화면의
기존 위치 재사용은 이 수동 확인 모달을 거치지 않는다.

서버에는 센소지, 도쿄 스카이트리, 시부야 스카이, 도쿄 타워, 메이지 신궁의 1차 결과가 없을 때만
사용하는 영문 fallback query가 남아 있다. 이는 제한적인 호환 로직이며 nearby discovery가 아니다.

## 11. 지도와 동선

지도 하단 탭에 구현 완료된 범위:

* 서버 일정을 날짜/시간순으로 로드
* 일정이 있는 날짜 선택과 기기 로컬 오늘 기준 최초 날짜 선택
* 선택 날짜의 유효 좌표 일정만 번호 marker로 표시하되 전체 시간순 일정의 원래 번호 유지
* 한 marker에는 확대, 여러 marker에는 marker 좌표만으로 `fitToCoordinates`
* 좌표 없는 일정도 순서 목록에는 유지하고 `지도 위치 미등록` 표시
* 선택 날짜의 일정 시간순 이동 목록과 체류시간 표시
* 모든 WALK는 Google Routes, 일본 TRANSIT은 NAVITIME Route(totalnavi), 비일본 TRANSIT은 Google Routes 사용
* WALK 거리·예상시간, TRANSIT 예상시간과 양쪽 Polyline, TRANSIT 노선·환승·운임 표시
* 도쿄·오사카 주요 노선명은 한국어 display mapping을 적용하고 미등록 노선은 NFKC 원문으로 표시
* 일반 도시철도는 IC 운임, 신칸센 포함 경로는 `운임 약 N엔` 형식으로 표시
* 일정 갱신 시 최신 linked/unlinked 상태와 좌표에서 marker와 route를 다시 파생

현재 지도 initial region은 도쿄 좌표지만 일정 좌표가 있으면 해당 좌표들로 맞춘다. 화면의
`오늘의 이동 순서`는 실제 오늘이 아니라 선택한 날짜의 시간순 목록이며 최적화 결과가 아니다.

최초 선택 날짜는 기기 로컬 날짜를 여행 범위에 clamp한다. 여행 전에는 시작일, 여행 중에는 오늘,
여행 후에는 종료일을 선택한다. 같은 여행에서 사용자가 날짜를 바꾼 뒤 focus reload가 일어나도 그
선택을 유지하고, 현재 여행이 바뀔 때 새 여행 기준으로 초기화한다.

route는 linked 일정만 따로 압축해 연결하지 않고 **전체 시간순 일정의 인접 pair**로 만든다. 따라서
`1 linked, 2 linked, 3 unlinked, 4 linked`이면 `1→2`만 계산하고 `2→4`로 건너뛰지 않는다.
3번에 위치를 연결하면 최신 일정 기준으로 `1→2`, `2→3`, `3→4`가 자동 생성되고 다시 연결을
제거하면 3번 marker와 관련 구간이 사라진다. marker 번호도 linked subset을 재번호화하지 않는다.

### 이동수단 availability와 fallback

각 segment는 WALK와 TRANSIT 각각 `loading | available | unavailable` availability를 가진다.
`WALK_ROUTE_NOT_FOUND`는 WALK unavailable이고, TRANSIT 응답에 실제 transit leg가 없으면
walk-only로 판단해 usable TRANSIT에서 제외한다. canonical WALK 거리·시간·geometry는 항상
Google Routes 결과다.

한 mode만 usable하면 해당 mode를 자동 선택하고 다른 chip은 흐리게 비활성화한다. WALK no-route와
usable TRANSIT 조합은 TRANSIT으로, TRANSIT walk-only와 usable WALK 조합은 WALK로 전환한다.
양쪽 모두 unavailable일 때만 `사용 가능한 이동 경로를 찾지 못했어요`를 표시한다. 한 resolution에서
mode별 요청은 최대 한 번뿐이므로 WALK↔TRANSIT 재귀 fallback loop가 생기지 않는다.

### WALK / TRANSIT AUTO 추천

AUTO는 **현재 일정 순서의 각 인접 segment에서 이동수단을 고르는 기능**이며, 장소 방문 순서나
schedule 순서를 재배열하는 경로 최적화와 별개다. frontend에 저장된 성공·unavailable 후보를 먼저
복원하고 없는 후보만 조회한다. 둘 다 available이면 `lib/route-recommendation.ts`의 pure helper가
다음 1차 점수를 비교해 낮은 쪽을 초기 선택한다.

* WALK = 총 도보시간
* TRANSIT = 실제시간 + 탑승 기본 4분 + 환승당 5분 + 운임 60엔당 1분 + 내부도보 1km당 2분

점수와 추천 이유는 UI에 표시하지 않고 추천 결과에만 작은 별 표시를 사용한다. 두 mode가 모두
available일 때만 사용자가 chip으로 바꿀 수 있으며, 같은 route identity에서 사용자가 직접 고른
mode는 이후 AUTO 비동기 결과가 덮어쓰지 않는다. 점수 상수는 실제 사용 사례를 보고 조정할 예정이다.

각 segment는 자체 `AbortController`, request version/signature와 사용자 선택 version을 사용한다.
날짜·여행·일정 좌표·TRANSIT departureTime이 달라진 stale 응답은 버리고 다른 segment의 정상
결과는 보존한다. frontend 후보 cache와 backend route cache/in-flight Promise 공유로 같은 후보를
불필요하게 다시 호출하지 않는다.

iOS Expo Go에서 Polyline이 있는 날짜와 없는 날짜를 빠르게 전환할 때 JS 오류 없이 종료되던 native
MapView lifecycle 문제를 다음 invariant로 방어하며 실기기 일반·빠른 연속 전환을 검증했다.

* 즉시 반응하는 `selectedDate`와 실제 native map에 반영된 `renderedMapDate` 분리
* MapView 날짜 전환 직렬화와 빠른 연타 중 마지막 pending 날짜만 적용
* map generation/version, instance key와 `onMapReady` gate로 stale callback 무시
* 현재 map 날짜와 schedule signature가 모두 맞는 snapshot의 Polyline만 렌더
* Google/NAVITIME Polyline 좌표는 2~2,000개이며 모두 finite이고 위도 -90~90, 경도 -180~180일 때만 전달
* route geometry는 viewport 계산에서 제외하고 marker 좌표만 사용

지도·동선의 향후 작업:

* 일본 BUS 경로의 실제 provider 데이터 검증
* AUTO 점수의 실사용 기반 미세조정
* trip의 정식 `countryCode`와 timezone 모델
* 복수 TRANSIT 후보 사이의 자체 최적화
* Route/일정 순서 최적화 preview/apply
* 영업시간, 막차와 실시간 운행 지연 반영

## 12. 홈과 Open-Meteo 날씨

홈 구현 범위:

* 현재 여행 정보와 삭제
* 오늘 일정 전체 개수 및 최대 3개 미리보기
* 다음 일정 시간대 예보
* 일정 예보를 사용할 수 없을 때 여행 대표 도시 현재 날씨를 별도 fallback 카드로 표시
* 예산·지출 요약
* 준비물 화면 진입
* AI 기능 안내

기기 로컬 날짜와 같은 일정만 오늘 일정으로 사용한다. 그중 현재 시각 이후 가장 가까운 일정을
선택하고, 일정 좌표·날짜·시간으로 Open-Meteo hourly forecast의 가장 가까운 hour를 찾는다.
기온, 강수확률, weather code 설명과 아이콘을 표시한다.

일정 시간이 지났거나 좌표가 없거나 16일 예보 범위 밖이거나 응답이 불완전하면 일정 카드에는
각 비가용 상태를 표시한다. 이어서 여행 도시를 geocoding해 현재 기온과 당일 최고/최저·최대
강수확률을 별도 fallback 카드로 요청한다. hourly 요청은 좌표 소수점 넷째 자리와 날짜 기준으로
10분간 in-memory cache한다.

Open-Meteo는 프론트에서 직접 호출한다. 과거 날씨, 장기 예보 저장, 오프라인 날씨는 없다.

## 13. 준비물

준비물은 홈에서 별도 전체 화면으로 들어간다. 구현 완료 범위:

* 추가
* 완료/미완료 toggle
* 삭제
* 미완료 위·완료 아래 자동 정렬과 구분선
* tripId별 AsyncStorage 저장
* 여행 삭제 cleanup

일정과 달리 실제 할 일이므로 체크를 사용한다. 준비물 숨기기, 서버 공유·동기화는 없다.

## 14. 예산, 지출, 대여와 환율

지출 탭의 구현 완료 범위:

* 총 여행 예산, 현금 준비금, 카드 사용 예정금
* 전체·현금·카드 잔액과 대여금을 반영한 실제 보유금
* 오늘 지출 합계·건수, 현금/카드 구분
* 개인 지출, 공동 지출, 대여금
* KRW/JPY/USD/EUR와 수동 환율
* 기록 삭제
* 최종 정산 계산, 완료, 완료 취소

대여금은 소비가 아니므로 일반 총지출과 오늘 지출에서 제외하고 보유금 계산에 별도로 반영한다.
금액 출력과 여행 자금 입력에는 천 단위 쉼표가 적용된다.

### memberId 기반 새 데이터

새 기록은 이름이 아닌 `trip_members.id`를 사용한다.

```text
공동 지출 결제자     paidByMemberId
공동 지출 참여자     participantMemberIds[]
대여자/차용자        lenderMemberId / borrowerMemberId
정산 송금 방향       fromMemberId / toMemberId
```

새 기록 선택지는 `removed`를 제외한 현재 여행 멤버이며 placeholder도 선택 가능하다. UI의 `나`는
이름이나 배열 순서가 아니라 persistent userId와 연결된 멤버를 찾아 얻은 `currentMemberId`로 판단한다.
삭제되었거나 현재 목록에 없는 멤버는 신규 선택에서 제외하되 과거 기록 표시는 전체 멤버 목록을 쓴다.

### legacy 이름 기반 호환

기존 `payer`, `participants`, `lender`, `borrower`, `from`, `to` 필드는 읽기 호환을 유지한다.
legacy 이름 ledger와 memberId ledger를 별도 key namespace로 계산하며 이름을 임의의 memberId로
마이그레이션하지 않는다. 현재 사용자와 이름이 유일하게 일치하는 legacy 대여만 `나` 관점 표시에
사용한다. 따라서 이름 기반 과거 데이터는 보이지만 새 identity 모델과 완전히 합쳐지지는 않는다.

### 환율 snapshot

새 지출은 `localAmount`, `currency`, 저장 시점의 `exchangeRate`, 반올림한 `krwAmount`를 함께
저장한다. 이후 설정 환율이 바뀌어도 기존 지출을 재계산하지 않는다. JPY 입력은 100엔당 원화이며
저장 snapshot은 1엔당 원화 값이다.

구형 기록에 snapshot이 없으면 저장된 숫자 값을 우선하고, 부족한 값은 당시 앱에 저장된 환율 또는
기본값으로 보완한 뒤 다시 저장한다. 이는 live 환율 조회가 아니라 legacy 보정이다. 실제 환율 API나
자동 환율 갱신은 없다.

## 15. 정산 모델과 개별 기록 동기화

### 원본 relation

memberId 기반 원본 채무를 `ExpenseSettlementRelation`으로 표현한다.

* 공동 지출: 결제자를 제외한 각 `participant -> payer` relation 하나씩
* 대여금: `borrower -> lender` relation 하나
* relation id: kind, expenseId, fromMemberId, toMemberId 조합

공동 지출의 1인 몫은 총 원화 금액을 중복 제거한 참여자 수로 나눈 값이다. 결제자가 참여자에
포함되어 있으면 본인 몫은 채무 relation을 만들지 않는다. 이 구조는 2명에 고정되지 않는다.

### `SettlementPayment`

실제 송금 완료 기록은 별도 `SettlementPayment` 배열에 저장한다.

```text
source: "final" | "loan"
fromMemberId / toMemberId
amountKrw / date / memo
resolvedRelations[]
```

* 개별 대여 완료: `source: "loan"`, 해당 대여 relation 하나를 `resolvedRelations`에 저장
* 최종 정산 완료: `source: "final"`, 그 멤버 쌍 사이에서 아직 해소되지 않은 공동지출·대여
  relations를 `resolvedRelations`에 저장
* 이름 기반 legacy payment는 memberId와 source/resolvedRelations가 없을 수 있음
* 이름 기반 legacy 대여는 relation을 만들 수 없으므로 기존 `loanSettled` 필드를 계속 사용

최종 정산 금액은 모든 공동 지출, 미정산 대여금, 이전 SettlementPayment를 balance에 반영해
채권자와 채무자를 상계한 결과다. payment를 추가하면 잔액에서도 빠지고, 연결된 relation id가
개별 기록 상태에도 반영된다. 따라서 최종 정산과 개별 기록은 현재 서로 독립적이지 않다.

### 다인원, 일부 정산, 취소

공동 지출은 participant별 relation 상태를 별도로 표시한다. 예를 들어 한 payer에게 빚진 여러
참여자 중 일부의 pair 정산만 완료되면 원본 공동 지출은 `일부 정산`, 모두 해소되면 `정산완료`다.
대여 relation이 최종 정산에 포함되면 개별 대여 카드도 정산완료로 표시하고, 그 카드에서 별도로
취소하지 못하게 하며 해당 최종 정산 완료 기록에서 취소하도록 안내한다.

정산 취소는 해당 `SettlementPayment`를 삭제한다. 그러면 그 payment의 금액 반영이 사라지고
`resolvedRelations`에 있던 관계만 다시 미정산으로 계산된다. 다른 payment가 해결한 relation에는
영향을 주지 않는다. 직접 완료한 legacy 대여는 `loanSettled`를 되돌린다.

현재 정산은 전체 balance를 계산한 뒤 제안된 송금 한 건을 완결하는 방식이다. 임의 금액을 입력해
한 relation을 여러 번 나누어 송금하는 UI는 없다. 여기서 `일부 정산`은 주로 다인원 공동 지출의
participant→payer relation 일부가 완료된 상태를 뜻한다.

지출·정산은 tripId별 로컬 데이터이며 여러 기기 간 공유, conflict 처리, 서버 DB persistence는
미구현이다.

## 16. AI 기능 현재 상태

AI 하단 탭의 화면 자체는 구현되어 있다.

* 현재 여행과 서버 일정 로드
* 일정 최대 3개 미리보기
* 빠른 질문 버튼
* 채팅 형태의 로컬 메시지 표시

응답은 `동선`, `맛집`, `비`, `예산` 키워드에 따라 고정 안내 문구를 반환한다. 모델 호출,
서버 AI endpoint, tool use, 일정 자동 변경은 없다. 따라서 AI UI는 부분 구현이고 실제 AI 기능은
미구현이다. 날씨 API가 이미 홈에 연결되어 있어도 AI 응답에는 아직 사용하지 않는다.

## 17. 완료/부분 구현/미구현 요약

### 완료된 주요 기능

* Expo Router 기반 주요 화면과 5개 하단 탭
* PostgreSQL/in-memory 양쪽의 여행·일정 REST CRUD
* PostgreSQL `trips`, `users`, `trip_members`, `schedules` schema
* persistent device userId와 server user ensure
* owner/placeholder 생성, member claim, 개발용 join 검증 흐름
* currentMemberId mapping과 memberId 기반 `나` 판단
* 404 current-trip recovery, single-flight, recovery/delete race 보호
* tripId별 예산·지출·정산·준비물 저장과 여행 삭제 cleanup
* 일정 CRUD, 여행 기간 검증, 저장 연타 중복 방지
* 일정 최초 진입 시 로컬 오늘 기준 target day 자동 scroll과 이후 수동 scroll 유지
* 일정 생성/수정의 하단 고정 저장 CTA와 unlinked 안내·저장 확인
* Places autocomplete, linked/unlinked 저장, 확인 모달, dynamic 20km bias
* 날짜별 일정 marker, 전체 일정 순번 유지와 시간순 이동 목록
* Google WALK·비일본 Google TRANSIT·일본 NAVITIME TRANSIT provider 분기와 공통 route 응답
* segment별 WALK/TRANSIT availability, 대칭 fallback, AUTO 추천과 수동 선택 우선권
* TRANSIT Polyline·노선·환승·운임, 주요 일본 노선 한국어 표시와 NFKC 원문 fallback
* MapView 날짜 전환 직렬화·stale snapshot 차단·좌표 검증 등 iOS native crash 방어
* 다음 일정 좌표·시간 기반 Open-Meteo 예보와 도시 현재 날씨 fallback
* 개인/공동 지출, 대여, 환율 snapshot, 최종 정산과 취소
* SettlementPayment source/resolvedRelations 기반 개별 기록 상태 동기화
* 다인원 공동지출 participant→payer relation별 일부/전체 정산 표시
* 준비물 추가·체크·삭제

### 부분 구현

* 다인원 여행: 데이터 모델과 개발용 claim은 있으나 실제 초대·인증·공유 UX 없음
* 여러 여행: 서버는 여러 여행을 저장·조회하지만 앱은 현재 여행 한 개만 사용
* offline: 일부 로컬 데이터는 유지되지만 일정 offline cache와 재연결 동기화 없음
* 지도/동선: 이동수단 AUTO까지 완료됐으나 BUS 실데이터와 추천 점수는 추가 검증·조정 필요
* 테마: navigation provider와 `userInterfaceStyle: automatic`은 있으나 주요 화면 색상이 light로 고정
* AI: UI와 임시 키워드 응답만 존재

### 미구현

* 실제 초대 링크·QR·token, 로그인·인증·서버 권한 검증과 멀티디바이스 동기화
* expense/settlement 서버 동기화와 관련 DB persistence
* 일본 BUS 실제 경로 실데이터 검증과 AUTO 추천 점수 미세조정
* trip countryCode/timezone 정식 모델과 복수 TRANSIT 후보 자체 최적화
* Route/일정 순서 최적화 preview/apply, 영업시간 고려, 막차·실시간 지연
* nearby discovery/recommendation
* real AI API와 실제 일정 추천·재구성
* 여러 여행 선택·history UX
* 기존 여행 데이터 기반 자동 종료 통계·요약 리포트
* offline/network robustness
* production backend, rate limit, quota와 Cloud Run 배포
* EAS·TestFlight 배포와 완전한 dark mode를 포함한 최종 UI polish

## 18. 현재 코드에서 주의할 불일치와 한계

* 프로젝트 방향은 도시 일반화를 지향하지만 Places 요청의 `regionCode`는 현재 `JP`, 지도 기본
  initial region은 도쿄이며 일부 도쿄 명소 영문 fallback이 남아 있다. 동적 bias 자체는 도쿄
  고정이 아니고 20km다.
* `trips.members`와 `trip_members`가 함께 존재한다. identity는 `trip_members`가 기준이지만
  여행 PUT의 legacy members 변경은 trip_members를 동기화하지 않는다.
* 일정 AsyncStorage helper는 있지만 실제 일정 화면의 offline read/write path에 연결되지 않는다.
* 홈·일정·지출은 current-trip recovery를 사용하지만 지도·AI는 현재 로컬 snapshot을 직접 읽는다.
* route cache는 backend 프로세스 메모리 전용이며 서버 재시작 시 사라지고 DB persistence는 없다.
  WALK TTL은 24시간, TRANSIT TTL은 15분이고 frontend 후보 cache도 앱 프로세스 생명주기 안에서만 유지된다.
* `GET /trips`는 구현되어 있어도 현재 프론트에는 여러 여행 선택/관리 화면이 없다.
* app 설정은 시스템 테마를 허용하지만 대부분의 실제 화면 스타일은 라이트 색상 상수다.
* 서버 package의 `test` script는 실제 테스트가 아니라 실패하는 placeholder이고, 저장소에 자동화된
  기능 테스트 suite는 보이지 않는다. 구현 상태는 코드 경로와 정적 검사로 확인해야 한다.

## 19. 작업 원칙

변경 전 관련 코드부터 확인한다. 특히 문서의 완료/TODO 목록만 보고 이미 구현된 기능을 다시 만들지
않는다. 일정은 할 일 체크리스트로 바꾸지 않는다. 방문 도장 기능은 현재 계획에서 제외되어 있다.
비밀키를 커밋하지 않으며, 사용자가 요청하지 않으면 package·DB·인증·배포 범위를 확대하지 않는다.

검사 명령:

```bash
npx tsc --noEmit
npm run lint
git diff --check
```
