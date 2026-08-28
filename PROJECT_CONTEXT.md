# TravelAI 프로젝트 컨텍스트

## 1. 프로젝트 목적

**TravelAI**는 실제 여행에서 사용할 개인용 여행 비서 앱이다.

현재 첫 실제 사용 목표는 일본 도쿄 여행이다.

단순 졸업작품이나 데모를 위한 앱이 아니라,
실제로 여행 중 사용할 수 있는 기능을 만드는 것이 우선이다.

잘 만들어지면 이후:

* 친구
* 다른 여행 그룹
* 다른 일본 도시
* 국내 여행

등에도 사용할 수 있도록 확장할 수 있다.

포트폴리오 활용 가능성도 있지만 실사용성이 우선이다.

---

## 2. 현재 여행 계획

현재 알려진 실제 여행 계획:

* 국가: 일본
* 도시: 도쿄
* 예상 시기: 2월
* 여행 기간: 약 4박 5일
* 인원: 2명
* 사용자 + 친구 1명

실제 여행 날짜는 친구 일정 등의 이유로 나중에 최종 확정될 수 있다.

개발 중 사용한 8월 날짜들은 테스트 데이터일 수 있으므로 실제 여행 날짜로 간주하지 않는다.

---

## 3. 개발 환경

현재 개발 방식:

* Windows PC
* VS Code
* Git
* GitHub
* Node.js
* React Native
* Expo
* TypeScript

모바일 테스트:

* iPhone
* Expo Go

여러 PC에서 개발한다.

주로:

* 집 PC
* 학교 PC
* 추가 학교 PC

등을 사용할 수 있다.

---

## 4. 새 PC 개발 환경 준비

새 PC에서는 대체로 다음 설치가 필요하다.

* Git
* Node.js
* VS Code
* ngrok
* 필요 시 Codex VS Code 확장

저장소는 GitHub에서 clone한다.

예:

```bash
git clone <TravelAI 저장소 주소>
```

그다음 프로젝트 루트에서:

```bash
npm install
```

필요하면 서버에서도:

```bash
cd server
npm install
```

Git 사용자 설정도 새 PC에서는 필요할 수 있다.

```bash
git config --global user.name "이름"
git config --global user.email "GitHub 이메일"
```

---

## 5. 멀티 PC Git 작업 방식

기존 PC에서 작업 시작 전:

```bash
git pull
```

작업 종료 전:

```bash
git add .
git commit -m "작업 내용"
git push
```

장시간 개발 시 기능 단위로 중간 커밋을 하는 것이 좋다.

다른 PC에서 새 라이브러리를 사용해야 하는 경우 설치가 필요한지 사용자에게 알려준다.

---

## 6. Git으로 자동 동기화되지 않는 것

다음 항목들은 GitHub clone만으로 복구되지 않을 수 있다.

* `.env`
* Google API 키
* ngrok 인증
* VS Code 확장
* 글로벌 도구
* PC별 네트워크 설정

새 PC에서는 별도로 복구해야 한다.

---

## 7. 프론트엔드 환경변수

프론트엔드는 백엔드 URL을:

`EXPO_PUBLIC_API_URL`

환경변수에서 읽는다.

예:

```ts
const API_URL =
  process.env.EXPO_PUBLIC_API_URL;
```

Places 검색은:

```ts
`${API_URL}/places/search`
```

형태로 요청한다.

따라서 프로젝트 루트 `.env` 예시는:

```env
EXPO_PUBLIC_API_URL=https://xxxxx.ngrok-free.dev
```

이다.

`/places/search`는 환경변수에 넣지 않는다.

---

## 8. 서버 환경변수

서버는:

`server/.env`

에서 Google API 키와 PostgreSQL 연결 정보를 읽는다.

사용 변수:

```env
GOOGLE_MAPS_API_KEY=...
DATABASE_URL=...
```

`DATABASE_URL`이 설정되어 있으면 Neon PostgreSQL을 사용하고,
없으면 로컬 개발을 위한 In-memory development mode로 fallback한다.

실제 API 키와 `DATABASE_URL` 값은 문서나 소스 코드에 기록하지 않고
GitHub에도 올리지 않는다.

---

## 9. 백엔드 구조

백엔드 메인 파일:

```text
server/server.js
```

Express 기반이다.

기본 포트:

```text
4000
```

서버 실행:

```bash
cd server
node server.js
```

정상 실행 시:

```text
TravelAI storage: PostgreSQL
TravelAI server running on port 4000
```

또는 DATABASE_URL이 없을 때:

```text
TravelAI storage: In-memory development mode
TravelAI server running on port 4000
```

형태의 메시지가 출력된다.

현재 백엔드는 로컬 Express 서버와 ngrok을 통해 사용한다.
Cloud Run 배포는 아직 완료되지 않았으며 향후 작업이다.

---

## 10. 현재 서버 API

현재 서버에는 크게 다음 기능이 있다.

### 장소 검색

```text
POST /places/search
```

### 여행

```text
POST /trips
GET /trips
GET /trips/:id
PUT /trips/:id
DELETE /trips/:id
```

### 사용자/여행 멤버

```text
POST /users/ensure
GET /trips/:id/members
POST /trips/:tripId/members/:memberId/claim
```

`/users/ensure`는 로그인 도입 전 기기별 user identity를 서버에 보장한다.
member claim은 이름이 아니라 `tripId + memberId + userId`로 처리한다.

### 일정

```text
POST /schedules
GET /schedules
GET /schedules/:id
PUT /schedules/:id
DELETE /schedules/:id
```

일정 조회는 `tripId`를 기준으로 특정 여행 일정만 가져올 수 있다.

---

## 11. 현재 데이터 저장 방식

여행과 일정 저장소는 `DATABASE_URL` 설정 여부에 따라 자동 선택된다.

### PostgreSQL 모드

`DATABASE_URL`이 설정되어 있으면 Neon PostgreSQL에 영구 저장한다.

현재 Neon 프로젝트 리전:

```text
Singapore
```

완료 및 검증된 항목:

* `npm run db:init`을 통한 스키마 초기화
* `trips` 테이블 생성
* `users` 테이블 생성
* `trip_members` 테이블 생성
* `schedules` 테이블 생성
* 여행 REST CRUD
* 일정 REST CRUD
* 존재하지 않는 여행에 일정 생성 차단
* 여행 삭제 시 소속 일정 `ON DELETE CASCADE`
* 여행 삭제 시 소속 `trip_members`도 `ON DELETE CASCADE`
* 사용자 삭제 시 `trip_members.user_id`는 `ON DELETE SET NULL`
* Express 서버 재시작 후 여행/일정 데이터 유지

실제 `DATABASE_URL` 값은 문서와 코드에 기록하지 않는다.

### In-memory development fallback

`DATABASE_URL`이 없으면 메모리 기반 `trips` / `schedules` / `users` /
`trip_members` 저장 방식으로
fallback하며 서버 실행을 중단하지 않는다.

이 모드에서는 서버를 종료하면 여행과 일정 데이터가 사라진다.
AsyncStorage에 현재 여행 정보가 남아 있고 서버에서 해당 여행 ID가 404이면,
앱이 로컬 여행 정보로 서버 여행을 한 번 자동 복구하고 새 ID를 저장한다.
현재 기기의 userId가 복구 여행의 owner로 연결되며 새 tripMemberId에 맞춰
current member mapping도 갱신된다.

서버 재시작으로 사라진 일정은 자동 복구하지 않는다.
네트워크 오류나 500 응답에서는 여행을 재생성하지 않는다.
동일 여행의 중복 복구는 shared promise/single-flight로 막고,
삭제가 시작되면 진행 중인 복구 결과가 현재 여행을 다시 덮어쓰지 않도록 무효화한다.
PostgreSQL mode에서는 드문 상황이지만 local/server mismatch 보호용으로 유지한다.

### 앱 내부 저장 위치

현재 앱 전체 데이터는 한 저장소에 통합되어 있지 않다.

* 여행: Express 서버에 저장하고 현재 여행 정보는 AsyncStorage에도 저장
* 일정: Express 서버의 PostgreSQL 또는 메모리 저장소에서 조회/생성/수정/삭제
* 지출/예산/정산: tripId별 AsyncStorage
* 준비물 체크리스트: tripId별 AsyncStorage
* 일정 로컬 저장 helper: tripId별 envelope지만 화면의 완성된 오프라인 읽기 캐시는 아직 아님

trip-scoped envelope 적용 대상:

* 예산/여행 자금 설정
* 지출
* 정산 완료 기록
* 준비물
* 일정 캐시

구형 전역 값은 최초 접근 시 당시 current trip 항목으로 자동 이전한다.

일정의 AsyncStorage 오프라인 읽기 캐시는 아직 구현되지 않았다.
따라서 서버 또는 네트워크에 연결할 수 없을 때 기존 일정을 읽는 기능은 향후 작업이다.

홈의 `여행 삭제`는 서버의 `DELETE /trips/:id` 성공 또는 기존 정책상
404 already-deleted 응답 후 해당 tripId의 current trip, 일정 캐시, 예산,
지출, 정산, 준비물, current member mapping만 삭제한다.
다른 여행의 로컬 데이터와 `@travelai_user_id`는 유지하며
`AsyncStorage.clear()`는 사용하지 않는다. 네트워크 오류나 500에서는 로컬 cleanup을 하지 않는다.
PostgreSQL에서는 선택한 여행의 일정과 trip_members만 CASCADE로 삭제되고,
서버의 users와 다른 여행의 trip_members는 유지된다.

서버 API는 여러 여행을 저장하고 조회할 수 있지만,
현재 프론트엔드는 AsyncStorage에 저장된 한 개의 현재 여행을 사용한다.
여러 여행 선택/관리 UI와 여행 수정 UI는 아직 연결되지 않았다.

---

## 12. 여행 데이터

현재 서버 여행 데이터에는 다음 항목이 포함될 수 있다.

* id
* tripName
* country
* city
* startDate
* endDate
* people
* members
* tripMembers

여행 생성 기능은 이미 테스트되었다.

### 사용자와 여행 멤버 identity

로그인 전 단계의 기기별 영구 userId는 AsyncStorage의
`@travelai_user_id`에 저장된다.

* `users.id`: 실제 사용자 identity
* `trip_members.id`: 여행별 멤버 identity
* `trip_members.user_id`: 사용자와 여행 멤버의 연결

한 사용자는 여행마다 서로 다른 tripMemberId를 갖는다. 이름 문자열은 identity가 아니다.
UI의 `나`는 `trip_members.user_id === currentUserId`인 멤버로 판단하며,
이름이나 첫 번째 배열 항목을 기준으로 판단하지 않는다.

새 여행에서는 owner가 현재 userId에 연결된 `active` 상태로 생성되고
`joined_at`이 설정된다. 나머지 동행자는 `user_id = null`, `role = member`,
`status = placeholder`로 생성된다. 인원수는 2명에 고정되지 않는다.

identity/status/role/userId의 source of truth는 `trip_members`다.
`trips.members` JSONB는 기존 화면 호환용 legacy snapshot으로 유지한다.

### Member claim과 여행 참여

claim API는 여행과 멤버 소속을 검증하고 placeholder만 연결한다.
동일 user와 동일 member의 재요청은 idempotent하며, 이미 다른 user에게 연결된
멤버 또는 같은 여행의 다른 active 멤버에 연결된 user는 409를 반환한다.
성공 시 `active`와 `joined_at`을 설정하며 PostgreSQL transaction과
in-memory fallback에 같은 정책을 적용한다.

프론트의 `joinTripAsMember(tripId, memberId)` 흐름은 user ensure, claim,
최신 trip과 trip members 재조회, user/member 연결 검증을 마친 뒤에만
current trip과 `tripId → currentMemberId` mapping을 배치 저장한다.
개발용 join 화면은 실제 초대 UX가 아니라 Expo Go 검증용 `__DEV__` 화면이다.

아직 인증은 없으므로 tripId와 memberId를 아는 클라이언트가 claim을 시도할 수 있다.
실제 초대 링크, QR, 초대 token, 로그인/OAuth 기반 권한 검증은 미구현이다.

---

## 13. 일정 데이터

현재 일정에는 다음 정보가 포함될 수 있다.

* id
* tripId
* title
* location
* address
* latitude
* longitude
* placeId
* category
* durationMinutes
* date
* time
* memo

Google Places에서 장소를 선택하면 가능하면:

* placeId
* 주소
* 좌표

까지 유지한다.

일정의 기본 정보와 정확한 위치 연결은 분리되어 있다.
`location` 문자열만으로도 일정을 저장할 수 있으며,
`placeId`, `address`, `latitude`, `longitude`는 위치를 연결한 경우에만 저장되는 nullable 값이다.
위치 없이 저장한 기존 일정도 그대로 조회하고 나중에 수정 화면에서 Places 검색으로 다시 연결할 수 있다.

---

## 14. 일정 날짜 검증

일정 추가 시 여행 기간 밖의 날짜를 선택하지 못하게 하는 검증이 구현된 적이 있다.

예:

여행 기간이:

```text
8/17 ~ 8/29
```

이라면 범위 밖 날짜를 막는다.

경고 문구 형태:

```text
-부터 -사이에만 추가할 수 있습니다
```

정확한 현재 구현은 저장소 코드를 확인한다.

---

## 15. 여행 일차 표시

여행 날짜를 기준으로:

* 1일차
* 2일차
* 3일차

형태로 표시하는 기능이 구현되어 있다.

테스트에서는:

* 17일 1일차
* 18일 2일차
* 25일 9일차

등이 정상 표시된 적이 있다.

---

## 16. 일정 입력 항목

일정 추가 화면에서 사용한 항목에는 다음이 포함된다.

* 장소
* 장소 종류
* 예상 소요시간
* 날짜
* 시간
* 메모

과거에는 저장 후 일부 값이 상세 화면에 안 보이는 문제가 있었지만 이후 수정된 적이 있다.

현재 상태는 코드를 확인한다.

현재 일정 생성/수정 화면의 장소 입력 동작:

* 장소명을 직접 입력하고 위치 없이 저장할 수 있다.
* 2글자 이상 입력하면 400ms debounce 후 Places 자동완성을 실행한다.
* 늦게 도착한 이전 검색 응답은 최신 결과를 덮어쓰지 않는다.
* 명확한 지역, 역, 유일한 관광 POI는 장소 유형과 이름 일치도를 확인한 뒤 자동 연결할 수 있다.
* 브랜드 다중 지점과 일반 카테고리는 첫 결과를 임의로 자동 연결하지 않는다.
* 자동완성 후보는 처음 5개를 표시하고 `더 보기`로 최대 10개까지 확인한다.
* 저장 시 후보를 고르지 않았으면 최종 검색을 한 번 실행하고, 명확하면 자동 연결하며 애매하면 후보 선택 또는 위치 없이 저장을 제공한다.
* 일정 수정에서는 기존 장소명과 같으면 기존 `placeId`, 주소, 좌표를 재사용한다.
* 다른 장소로 바꾸려면 `다시 검색` 후 새 후보를 선택한다.

일정 생성/수정 저장은 React state와 동기 `useRef` 잠금을 함께 사용한다.
저장 요청이 진행 중이면 추가 탭을 즉시 무시하고 저장 버튼을 비활성화하며
요청 lifecycle 동안 버튼 문구를 `저장 중...`으로 표시한다.
따라서 아주 빠르게 연타해도 생성 POST 또는 수정 PUT 요청은 한 번만 실행된다.

---

## 17. 일정에 완료 체크를 넣지 않는 이유

일반 여행 일정에는 완료 체크를 넣지 않는다.

이 결정은 의도적인 UX 방향이다.

여행 중에는:

* 일정 변경
* 장소 건너뛰기
* 순서 변경
* 즉흥 방문

이 자연스럽게 발생할 수 있다.

그래서 일정은:

`할 일 목록`

보다는:

`오늘 어디를 갈지 확인하는 계획표`

에 가깝게 유지한다.

---

## 18. 방문 도장 기능

향후 실제 방문한 장소는 별도 `방문 도장` 기능으로 관리하는 방향을 고려한다.

방문 도장의 목적:

* 실제 방문 기록
* 여행 추억
* 여행 종료 요약
* 방문 장소 통계

일정 완료 여부와는 별개로 관리한다.

---

## 19. 지도 기능 현재 상태

Google Map은 현재 별도 `지도` 하단 탭에서 표시된다.

현재 코드에 구현된 기능:

* 지도 표시
* 일정 날짜 선택
* 선택 날짜의 좌표가 있는 일정 마커 표시
* 마커에 시간순 번호 표시
* 여러 일정 좌표에 맞춘 지도 영역 조정
* 선택 날짜의 이동 순서 목록 표시
* 좌표가 없는 일정 안내
* 좌표가 없는 일정은 일정 자체를 숨기지 않고 지도 Marker와 지도 맞춤 좌표에서만 제외

개발 중 테스트 장소로:

* 도쿄 스카이트리 근처
* 센소지

등을 사용했다.

현재 미완성인 지도 기능:

* 홈 화면 내부 지도
* 실제 이동 경로 선
* 장소 간 이동 시간/거리 표시
* 경로 자동 최적화
* 일정 변경에 따른 경로 재계산

지도 화면의 `오늘의 이동 순서` 문구는 현재 실제 오늘 날짜가 아니라
사용자가 선택한 날짜의 일정을 표시한다.

---

## 20. Google Places API

Google Cloud에서 TravelAI 프로젝트를 만들었다.

Places API (New)를 활성화했다.

API 키를 생성했고 제한 설정도 적용했다.

Places 검색은 실제로 성공한 적이 있다.

예:

```text
Sensoji Tokyo
```

검색 결과에서:

* place id
* 주소
* 위도
* 경도

가 정상 반환되었다.

---

## 21. Places 검색 설정

현재 서버는 Google Places API의:

```text
places:searchText
```

를 사용한다.

현재 설정:

```text
languageCode: ko
regionCode: JP
```

도쿄 중심 고정 `locationBias`는 제거되었다.
검색 기준 위치는 다음 순서로 결정한다.

1. 수정 중인 일정에 이미 연결된 좌표
2. 선택 날짜에서 입력 시간과 가장 가까운 기존 일정 좌표
3. 실제 기기의 현재 위치
4. 여행 대표 도시 좌표
5. 모두 없으면 location bias 없이 검색

기준 좌표가 있으면 서버가 반경 20km의 원형 `locationBias`로 전달한다.
이는 검색 결과를 해당 지역에 가깝게 유도하는 설정이지 결과를 반경 안으로 제한하는
`locationRestriction`이 아니므로, 구체적인 원거리 장소 검색 결과도 나올 수 있다.

위치 권한은 앱 시작 시 요청하지 않고 장소 자동완성이 실제로 필요할 때만 요청한다.
권한이 거부되거나 현재 위치 조회에 실패해도 일정/여행 도시 기준으로 fallback하며,
장소 검색과 위치 없는 일정 저장은 계속 동작한다.

후보 좌표까지의 거리는 별도 유료 API 없이 Haversine 직선거리로 계산한다.
1km 미만은 m, 1km 이상은 소수점 한 자리 km로 표시한다.
Google 검색 관련성을 우선하고 이름 일치 수준이 같은 후보 사이에서만 거리를 보조 정렬 기준으로 사용한다.

동일한 `placeId`가 반복된 검색 결과만 하나로 제거한다.
이름이나 좌표가 비슷하더라도 `placeId`가 다르면 실제로 다른 시설일 수 있으므로 임의로 제거하지 않는다.

사용자가 후보를 탭하면 즉시 위치를 확정하지 않고 공통 장소 확인 모달을 연다.
모달은 선택한 후보 하나에 대해서만 `react-native-maps` 미니 지도와 고정 Marker를 렌더링한다.
사용자가 지도를 이동하거나 확대해도 Places 후보의 실제 좌표는 변경되지 않으며,
`이 장소 선택`을 눌러야 `location`, `placeId`, `address`, `latitude`, `longitude`가 최종 연결된다.
명확한 지역/역/POI 자동 연결과 수정 중인 기존 위치 재사용은 이 확인 모달을 강제로 거치지 않는다.
미니 지도는 기존 검색 결과를 그대로 사용하므로 추가 Places 또는 Place Details API 호출이 없다.

---

## 22. Places fallback 검색

현재 일부 한국어/일본어 검색어에 대해 영문 fallback 검색이 구현되어 있다.

예:

* 센소지 → Sensoji Tokyo
* 도쿄 스카이트리 → Tokyo Skytree
* 시부야 스카이 → Shibuya Sky Tokyo
* 도쿄 타워 → Tokyo Tower
* 메이지 신궁 → Meiji Jingu Tokyo

이 기능은 검색 안정성을 위한 현재 임시 로직이다.

최종 구조에서 모든 장소를 하드코딩해서 처리하려는 목적이 아니다.

---

## 23. 장소 검색 확장 방향

향후 검색은 유명 관광지만 대상으로 하지 않는다.

대상:

* 음식점
* 카페
* 작은 가게
* 관광지
* 인기 장소
* 근처 추천 장소

사용자는 여행 중 새로운 장소를 실시간으로 찾는 기능을 중요하게 생각한다.

모든 장소를 사전에 저장하는 구조만으로 만들지 않는다.

---

## 24. 홈 화면 현재 방향

현재 홈 화면에 구현된 요소:

* 현재 여행 정보
* 여행 삭제 버튼
* 오늘 날씨 카드
* `오늘 일정 · N개` 표시
* 오늘 일정 최대 3개 미리보기
* 전체 일정/일정 상세 화면 이동
* 예산 요약
* 준비물 화면 진입 버튼
* AI 추천 예정 안내 카드

다음 기능은 현재 홈 화면에 없다.

* 홈 화면 내부 지도
* 홈 화면 내부 오늘 이동 순서

`오늘 일정 · N개` 기능은 구현 완료 상태다.

홈 화면이 포커스를 받을 때 현재 여행 ID로 서버 일정을 조회하고,
기기 로컬 날짜와 같은 일정을 필터링한 뒤 시간순으로 정렬한다.

제목에는 전체 오늘 일정 개수를 표시하고,
본문에는 최대 3개까지 미리보기로 보여준다.

서버/ngrok 연결이 끊겼거나 서버 재시작으로 일정 데이터가 사라진 경우에는
오늘 일정이 표시되지 않을 수 있다.

---

## 25. 홈 날씨 기능

홈 날씨 UI와 실제 날씨 데이터 연동은 모두 구현 완료 상태다.

현재 사용하는 서비스:

* Open-Meteo Geocoding API
* Open-Meteo Forecast API

홈 날씨의 우선 기준은 대표 도시가 아니라 다음 일정이다.
오늘 일정 중 아직 시작하지 않은 가장 가까운 일정을 고르고,
해당 일정의 `latitude`, `longitude`, `date`, `time`으로 Open-Meteo hourly forecast를 조회한다.

다음 일정 카드에는 장소, 일정 시간, 해당 시간대 기온, 강수확률,
날씨 코드 기반 한글 설명과 아이콘을 표시한다.
좌표가 없는 일정은 좌표 기반 예보 대상에서 제외하며 홈 전체 오류를 만들지 않는다.
일정이 없으면 여행 대표 도시의 현재 날씨를 별도 홈 카드로 사용할 수 있다.
다음 일정이 있지만 좌표가 없거나 과거 일정이거나 Open-Meteo의 최대 16일 예보 범위 밖이면
그 일정의 예보를 현재 날씨로 대체하지 않고 원인을 알 수 있는 비가용 상태를 표시한다.

현재 날씨 요청은 Express 서버를 거치지 않고 프론트엔드에서
Open-Meteo API를 직접 호출한다.

동일 좌표와 날짜의 hourly forecast 요청은 좌표를 소수점 넷째 자리로 반올림한 키와 날짜를 사용해
10분 캐시로 재사용한다.

---

## 26. 오늘 이동 순서

`오늘의 이동 순서` UI는 현재 홈 화면이 아니라 지도 탭에 구현되어 있다.

선택한 날짜의 일정을 시간순으로 보여주는 형태다.

향후 지도 동선과 함께 더 발전시킬 수 있다.

현재는 경로 최적화 결과가 아니라 일정 시간순 표시이며,
지도 화면에도 `자동 최적화 예정`으로 안내된다.

---

## 27. 경로 최적화

향후 중요한 기능 중 하나다.

목표:

* 오늘 방문할 장소 파악
* 효율적인 이동 순서 계산
* 지도에 경로 표시
* 일정 변경 시 재계산

AI 또는 일반 알고리즘을 상황에 맞게 활용할 수 있다.

---

## 28. AI 여행 비서 방향

TravelAI의 장기 핵심 기능 중 하나다.

현재는 `AI` 하단 탭과 채팅 형태 UI가 구현되어 있다.

현재 AI 화면에서 가능한 것:

* 현재 여행 정보 표시
* 저장된 일정 최대 3개 미리보기
* 빠른 질문 버튼
* 사용자 메시지와 임시 답변 표시

하지만 실제 AI API는 아직 연결되지 않았다.
현재 답변은 질문에 `동선`, `맛집`, `비`, `예산` 같은 단어가 포함되었는지에 따라
미리 작성된 안내 문구를 반환하는 임시 구현이다.

예상 사용 상황:

* 갑자기 일정이 바뀜
* 특정 장소를 못 감
* 이동 순서를 바꾸고 싶음
* 갑자기 다른 지역으로 이동함
* 근처에서 새로운 곳을 찾고 싶음

이때 AI가:

* 대체 일정
* 새로운 장소
* 효율적인 순서
* 주변 추천

등을 제공하는 방향이다.

---

## 29. 지출 화면

지출 기능은 다음 범위까지 구현되어 있다.

* 오늘 지출 합계와 건수
* 현금/카드별 오늘 지출
* 총 여행 예산과 현금/카드 자금
* 전체/현금/카드 잔액
* KRW, JPY, USD, EUR 통화 선택
* 수동 환율 저장과 원화 환산
* 개인 지출
* 공동 지출과 참여자 선택
* 대여금 기록과 정산 상태
* 최종 정산 계산
* 정산 완료 및 완료 취소
* 전체 기록과 삭제

지출, 예산 설정, 정산 완료 내역은 현재 tripId별 AsyncStorage에 저장된다.
서버 DB에는 아직 동기화하지 않는다.

### 지출 멤버 identity

새 지출 데이터는 이름이 아니라 여행 멤버 ID를 사용한다.

* 공동 지출 결제자: `paidByMemberId`
* 공동 지출 참여자: `participantMemberIds`
* 대여금 대여자/차용자: `lenderMemberId`, `borrowerMemberId`
* 정산 송금 방향: `fromMemberId`, `toMemberId`

선택 가능한 멤버의 기준은 서버의 `trip_members`이며 placeholder도 참여자로 선택할 수 있다.
현재 기기의 `currentMemberId`와 비교해 UI의 `나`를 결정하고, `removed` 상태이거나 더 이상 존재하지 않는
멤버는 새 기록의 선택지에서 제외한다. 이름은 표시용일 뿐 identity로 사용하지 않는다.

기존 데이터의 이름 기반 필드는 호환 읽기를 위해 유지한다. 새 memberId 기반 ledger와 legacy ledger는
별도로 계산하며, 불확실한 이름을 임의로 특정 memberId로 변환하지 않는다.

### 환율 snapshot과 표시

외화 지출은 저장 당시의 `localAmount`, `currency`, `exchangeRate`, `krwAmount`를 snapshot으로 보존한다.
JPY 환율 입력은 100엔당 원화 기준이다. 원화 기록에서는 같은 원화 금액과 환율 설명을 반복하지 않고,
외화 기록에서만 원화 환산액과 저장 당시 환율을 보조 정보로 표시한다.

### 지출/정산 UI

공동 지출은 결제자, 참여자별 몫과 총액을 구분해 표시하고, 대여금은 `currentMemberId` 관점에서
누가 누구에게 빌려줬는지 자연어로 표시한다. 기록 삭제는 주요 액션보다 작게 배치한다.

최종 정산 카드는 현재 사용자 관점의 송금/수령 방향과 최종 금액을 한 번 강하게 표시한다.
계산 근거가 하나뿐이고 최종 금액과 같으면 작은 단일 근거만 보여주며, 실제 가감 관계가 있을 때만
여러 breakdown 행과 최종 행을 표시한다. 버튼 문구는 금액을 반복하지 않고 `정산 완료`를 사용한다.
이 표현 개선은 기존 balance/settlement 계산 의미를 변경하지 않는다.

최종 정산 완료 기록에는 필요한 경우 어떤 원본 관계를 해결했는지 나타내는 `source`와
`resolvedRelations`가 함께 저장된다. 공동 지출의 참여자→결제자 및 대여금의 차용자→대여자 관계를
memberId 쌍 단위로 연결해 개별 기록의 미정산/일부 정산/정산 완료 표시와 동기화한다.
정산 완료를 취소하면 그 완료 기록이 해결한 관계만 다시 미정산 상태로 돌아간다.

금액 요약과 잔액 출력에는 천 단위 쉼표가 적용되어 있다.

`여행 자금` 영역의 다음 입력창에도 입력 중 천 단위 쉼표가 적용되어 있다.

* 총 여행 예산
* 현금으로 준비한 금액
* 카드에 사용할 금액

따라서 기존 수정 예정 항목은 부분 완료 상태다.

예:

```text
1000000
```

→

```text
1,000,000
```

특히 `여행 자금` 영역에서 적용한다.

---

## 30. 지출 기능 장기 방향

향후 고려 기능:

* 지출/정산의 서버 동기화와 DB persistence
* 여러 기기에서 같은 여행 지출을 안전하게 공유하는 충돌 처리
* 정식 인증과 권한 검증
* 여행 종료 후 지출 요약/리포트

실제 여행 중 빠르게 확인할 수 있는 형태가 중요하다.

---

## 31. 준비물 체크리스트

준비물 체크리스트는 구현 완료 상태다.

메인 하단 탭으로 만들지 않는 방향이다.

현재 구조:

```text
홈 화면의 준비물 버튼
↓
전체 준비물 화면
```

현재 구현된 기능:

* 준비물 추가
* 완료 체크
* 제거
* 미완료 항목을 위로 자동 정렬
* AsyncStorage 저장

일정과 달리 준비물은 실제 할 일이므로 완료 체크를 사용한다.

기존 계획에 있던 `숨기기` 기능은 아직 구현되지 않았다.

---

## 32. 여행 종료 화면

향후:

```text
여행 종료!
```

버튼 또는 흐름을 고려한다.

여행 완료 후 다음 정보를 보여줄 수 있다.

예:

```text
🇯🇵 도쿄 여행 완료!

4박 5일
방문 장소 수
총 지출
가장 많이 머문 지역
방문한 식당 수
사진
메모
```

방문 도장 데이터와 연결될 수 있다.

---

## 33. 여러 명 여행

현재 첫 실제 사용 시나리오는 2명이지만 멤버/지출 구조는 2명에 고정하지 않는다.
한 사용자는 여행마다 별도의 `trip_members.id`를 가지며, 공동 지출과 정산도 memberId 배열/관계로
여러 명을 표현한다. 개발용 claim 흐름까지 구현되어 있으나 실제 초대 링크/QR, 초대 token,
로그인/OAuth와 서버 권한 검증은 아직 구현되지 않았다.

---

## 34. API 비용 관련 방향

사용자는 API 과금을 중요하게 생각한다.

이미 다음을 고려한 적이 있다.

* Google Places API 사용량
* 월별 API 호출
* Google Cloud 무료 크레딧
* OpenAI 사용량
* 무료 한도 초과 시 비용

초기 서비스는 개인/소수 사용을 목표로 한다.

따라서 불필요한 API 호출은 피한다.

단, 비용 절감을 위해 핵심 여행 기능의 실용성을 크게 희생하지 않는다.

---

## 35. Google Cloud 상태

Google Cloud에서 TravelAI 프로젝트 생성 완료.

확인된 사항:

* 결제 계정 연결
* 무료 체험 크레딧 확인
* Places API (New) 활성화
* API Key 생성
* API Key 제한 설정
* Places 요청 정상 동작

기존 프로젝트와 키를 재사용할 수 있으면 새 프로젝트를 만들지 않는다.

---

## 36. 학교 PC 네트워크 특징

학교 네트워크에서는 개발 환경 제약이 있었다.

과거 발생한 문제:

* Expo LAN 연결 불안정
* 터널 연결 지연
* ngrok 관련 차단/오류
* 학교 보안 프로그램/네트워크 제한

현재 학교에서는 Expo 실행 시 우선:

```bash
npx expo start --tunnel
```

방식을 사용한다.

---

## 37. ngrok 사용 방식

Express 서버를 아이폰에서 접근하기 위해 ngrok을 사용한다.

실행:

```bash
ngrok http 4000
```

예:

```text
Forwarding
https://xxxxx.ngrok-free.dev
-> http://localhost:4000
```

이 HTTPS 주소를:

```env
EXPO_PUBLIC_API_URL=...
```

에 넣는다.

새 PC에서는 ngrok 인증이 필요할 수 있다.

```bash
ngrok config add-authtoken ...
```

---

## 38. Expo 실행

학교:

```bash
npx expo start --tunnel
```

집:

```bash
npx expo start
```

상황에 따라 tunnel을 사용할 수 있다.

Expo와 Express 서버는 서로 다른 프로세스다.

---

## 39. 개발 시작 루틴

기존 PC에서는 코딩 시작 전:

```bash
git pull
```

그다음 필요한 경우:

터미널 1:

```bash
cd server
node server.js
```

터미널 2:

```bash
ngrok http 4000
```

터미널 3:

```bash
npx expo start --tunnel
```

---

## 40. 개발 종료 루틴

작업 종료 시:

```bash
git add .
git commit -m "작업 내용"
git push
```

사용자는 이 과정을 잊지 않도록 알려주는 것을 선호한다.

긴 작업에서는 기능 단위로 중간 커밋도 권장한다.

---

## 41. 설치 항목 동기화 주의

Git으로 코드가 동기화되어도 PC별로 따로 설치해야 하는 것이 있을 수 있다.

예:

* 새 npm 패키지
* 글로벌 프로그램
* ngrok
* 환경변수
* API 키
* VS Code 확장

새 항목을 추가하면 다른 PC에서 무엇을 해야 하는지 알려준다.

---

## 42. 라이트/다크 테마

Expo/React Navigation의 테마 Provider와 자동 시스템 테마 설정은 존재한다.

하지만 주요 TravelAI 화면의 배경색, 글자색, 입력창 색상은
대부분 라이트 테마 값으로 직접 작성되어 있다.

따라서 라이트 모드는 구현되어 있지만 실제 다크 모드 지원은 미완성이다.

UI 개발 시:

* 글자색
* 배경
* placeholder
* 입력창
* 경계선

등의 대비를 고려한다.

과거 달력에서 흰 배경에 흰 글자가 겹치는 문제가 있었고 수정된 적이 있다.

---

## 43. UI 방향

TravelAI는 여행 중 자주 보는 앱이므로:

* 빠르게 읽히는 화면
* 핵심 정보 우선
* 필요 이상으로 복잡하지 않은 UI
* 지도와 일정의 연계
* 오늘 해야 할 이동 파악

을 중요하게 본다.

일반 생산성 앱처럼 만들지 않는다.

---

## 44. 현재 알려진 다음 작업

이전 개발 우선순위였던 다음 항목은 구현 완료되었다.

* 홈 `오늘 일정 · N개`
* 홈 날씨 UI
* Open-Meteo 날씨 데이터/API 연동
* 준비물 체크리스트

현재 코드 기준 미완성 항목:

* 실제 초대 링크/QR 및 초대 token
* 로그인/회원가입, OAuth, 인증과 서버 권한 검증
* shared expense의 여러 기기 간 서버 동기화
* 지출/정산/준비물의 DB persistence
* 지도 경로 선, 이동 거리/시간, 라우팅과 경로 최적화
* 대중교통/도보 routing
* 주변 장소 발견/추천
* 실제 AI API 연동
* Cloud Run 백엔드 배포
* 일정 AsyncStorage 오프라인 읽기 캐시의 화면 연동 완성
* 여러 여행 선택/관리 UX
* 방문 도장/방문 기록
* 여행 종료, 기록 보관, 요약/리포트
* 전체 화면의 라이트/다크 모드 마감

우선순위는 사용자의 새 요청이 있으면 그 요청을 먼저 따른다.

---

## 45. 현재 상태를 판단하는 방법

이 문서는 개발 맥락을 보존하기 위한 문서다.

실제 구현 상태는 항상 현재 Git 저장소를 기준으로 확인한다.

Codex는 새로운 작업을 시작할 때:

1. `AGENTS.md` 읽기
2. `PROJECT_CONTEXT.md` 읽기
3. 현재 코드 확인
4. 이미 구현된 기능인지 확인
5. 필요한 파일만 수정

순서로 진행한다.

문서에 `미완료`라고 되어 있어도 코드에 이미 구현되어 있다면 다시 구현하지 않는다.

---

## 46. Codex에게 처음 줄 권장 명령

새 Codex 세션에서는 다음과 같이 시작한다.

```text
AGENTS.md와 PROJECT_CONTEXT.md를 먼저 전부 읽어줘.

그다음 현재 TravelAI 저장소 구조와 실제 코드를 확인해서
문서 내용과 현재 구현 상태를 비교해줘.

아직 코드는 수정하지 말고,

1. 현재 구현된 기능
2. 미완료 기능
3. 문서와 코드가 다른 부분
4. 다음에 작업하면 좋은 항목

을 정리해줘.

추측하지 말고 실제 코드 기준으로 판단해줘.
```

이후 작업은 그 분석 결과를 보고 진행한다.

---

## 47. 가장 중요한 원칙

TravelAI의 목적은:

**실제 여행에서 편하게 쓰는 것**

이다.

새 기능을 추가할 때 항상:

* 여행 중 진짜 필요한가?
* 화면이 더 복잡해지지는 않는가?
* 사용자가 빠르게 확인할 수 있는가?
* 일정 변경에 유연한가?
* 기존 기능을 망가뜨리지 않는가?

를 기준으로 판단한다.
