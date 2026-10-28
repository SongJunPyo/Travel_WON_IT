# 여행WON해 — 영수증 기반 여행 가계부·가격 탐색 앱

영수증 한 장으로 여행 가계부를 쓰고, 다른 여행자의 영수증 기록으로 상품 가격과 매장을 살펴보는 모바일 여행 앱입니다. 영수증 사진을 AI가 읽어 매장·구매일·상품별 가격을 정리합니다. 저장한 실제 영수증은 다른 여행자의 가격 비교 데이터가 됩니다.

앱은 Expo·React Native(iOS·Android·웹), 서버는 Java 21·Spring Boot·Spring AI로 만들었습니다. 기존 서비스의 이름 **여행WON해**, 테마 색 `#0067AC`, 여행푸딩 캐릭터를 이어 씁니다. `my-hackathon`과는 독립적으로 실행하는 프로젝트이며, 기존 프로젝트의 데이터는 옮겨 오지 않습니다.

## 서비스 구성

| 탭  | 이름           | 목적                                                                      |
| --- | -------------- | ------------------------------------------------------------------------- |
| 1   | 여행 가계부    | 영수증 OCR로 지출을 기록하고, 카테고리·예산·평균 비교로 소비를 분석       |
| 2   | 주변 가격 비교 | 다른 여행자의 영수증 기록으로 상품 가격을 비교하고, 카테고리별 매장을 탐색 |

두 화면은 하단 탭으로 전환합니다.

### 1. 여행 가계부

- **영수증 등록**: "촬영하기"(앱 안 카메라) 또는 "사진 선택"(사진 보관함)으로 영수증을 올립니다. AI가 매장, 구매일, 통화, 카테고리, 상품별 이름·수량·단가, 총 결제금액을 추출합니다. 결과를 확인·수정한 뒤 저장하며, 직접 입력도 할 수 있습니다.
- **오늘 환율**: 새 영수증을 열거나 결제 통화를 바꾸면 적용 환율 칸에 한국수출입은행 매매기준율(1 외화당 원화, 예: JPY 8.3983)이 기본값으로 채워집니다. 출처와 고시일을 함께 보여 주고, 값은 직접 고칠 수 있습니다. 저장된 영수증은 그때 쓴 환율을 유지하고, 불러오지 못하면 직접 입력합니다.
- **소비 시각화**: 카테고리(숙박·쇼핑·음식·교통·관광·기타)별 도넛 차트와 비율
- **평균 비교**: 카테고리별 나의 비율, 시연 평균 비율, 그 차이(%p)
- **소비 인사이트**: 가장 많이 쓴 카테고리와 평균과의 차이를 설명하는 비율 기반 요약
- **여행 예산**: 도시·국가·기간·예산 설정, 예산 사용률·남은 예산·초과 표시
- **나의 영수증**: 최근 구매일 순 목록, 카테고리 필터, 원화·외화 금액 표시, 상세 보기·수정·삭제, 같은 영수증 중복 등록 차단

### 2. 주변 가격 비교

- **상품·매장 검색**: 서버(`GET /prices?q=`)가 상품명과 매장명을 원문(예: DORITOS, すし酒場)과 한국어(예: 도리토스, 스시)로 모두 찾습니다. 대소문자는 무시합니다. 띄어쓰기·용량 표기가 달라도 정규화해 찾습니다(코카콜라, 에비앙, 리터→ml 변환).
- **지도**: 화면 우하단의 **지도** 버튼을 누르면 지금 목록(상품 검색 결과 또는 선택한 카테고리)의 매장을 Mapbox 지도 창에 가격 마커로 보여 줍니다. 반경은 3km이고, 확대·축소와 목록·마커 선택 연동을 지원합니다. 오른쪽 위 X 버튼으로 닫습니다.
- **매장별 가격**: 같은 상품의 매장별 최신 구매가격, 구매일, 거리, 도보 추정 시간을 보여 주고 가격순·거리순으로 정렬합니다.
- **카테고리 둘러보기**: 식당·명소·화장품·의류·뷰티·웰니스·숙박·액티비티·렌트 중 하나를 고르면 매장·상품별 최근 구매가격, 최근 구매일, 구매 횟수를 보여 줍니다. 가격순·구매수·최신순으로 정렬하고, 거리순은 현재 위치 연동 후 제공합니다. 영수증 저장 화면의 **주변 가격 비교 카테고리**를 고른 영수증만 여기에 나오고, 고르지 않은 영수증은 상품·매장 검색에만 나옵니다.
- **내 위치**: 기본은 시연 위치인 **도쿄 신주쿠역** 반경 3km입니다. "내 위치"를 눌러 위치 권한을 허용하면 현재 위치 기준으로 조회합니다.
- **가격 공유**: 별도 동의 절차 없이, 시연 영수증이 아닌 영수증은 매장 위치가 있으면 공유됩니다(팀 결정, 필요하면 나중에 동의 절차 추가). 시연에서는 실제 GPS 대신 매장명·주소로 정한 신주쿠역 근처 가상 좌표를 넣습니다. 영수증 사진과 개인 결제정보는 공유하지 않습니다.

> 영수증 가격은 과거 구매가격이므로 현재 판매가격과 재고는 다를 수 있습니다. 도보 시간은 직선거리 기준 추정치입니다.

## AI 처리 흐름

| 단계 | 담당           | 내용                                                                                                                   |
| ---- | -------------- | ---------------------------------------------------------------------------------------------------------------------- |
| 입력 | 사용자         | 영수증 사진(촬영·사진 선택) 또는 직접 입력                                                                             |
| 해석 | AI             | 서버가 사진을 Spring AI `ChatClient`로 Claude에 보내 매장·구매일·통화·카테고리·상품별 수량·단가를 JSON으로 추출. 금액은 소수 문자열로 받아 서버가 최소 단위로 변환 |
| 확인 | 사용자         | 인식 결과를 확인·수정하고 가격 공유 여부를 선택                                                                        |
| 계산 | 일반 계산 엔진 | 상품 합계와 총액 일치 검증, 원화 환산, 카테고리 비율·예산, 상품명 정규화, 매장별 최신 가격·구매수 집계                 |
| 결과 | 서비스         | 가계부 시각화, 상품 가격 비교, 카테고리 둘러보기                                                                       |

AI는 영수증 해석만 맡고, 금액 계산과 검증은 프로그램이 수행합니다. 키가 없거나 인식에 실패하면 이유를 알려 주고 직접 입력으로 이어 갑니다. 실제 사진을 시연 결과로 바꿔 보여 주지 않습니다.

## 데이터와 한계

- 가계부와 여행 설정은 기기의 AsyncStorage에 저장합니다. 웹에서는 해당 주소의 브라우저 localStorage를 씁니다.
- 서버는 기기·여행·영수증·품목 4개 테이블에 저장합니다([docs/db-design.md](docs/db-design.md)). 기본은 H2 파일 DB(`data/prices.mv.db`)이고, `npm run server:mysql`로 실행하면 MySQL(`travel_won`)을 씁니다. 기기 토큰은 SHA-256 해시로만 보관합니다. PAGE 2에는 공유하고 매장 위치가 있는 영수증만 나옵니다.
- 앱은 가계부를 기기(AsyncStorage)에 먼저 저장하고, 바뀔 때마다 서버에 통째로 저장합니다(`PUT /ledger`). 시연 영수증은 서버에 저장하지 않습니다. 여행 도시·국가·기간을 정하기 전에는 서버가 여행을 받지 않으므로 기기에만 저장합니다. 서버에 연결되지 않으면 기기에만 저장하고 다음 연결 때 반영합니다.
- 금액은 최소 통화 단위 정수로 저장합니다(EUR·USD·THB는 센트, JPY·KRW는 엔·원). 적용 환율은 소수 4자리까지 받고(`travel_won` 설계는 `DECIMAL(12,4)`), 원화 환산은 금액 × 환율을 끝까지 계산한 뒤 원 단위로 반올림합니다(1000엔 × 8.3983 = 8,398원).
- 불러온 환율은 영업일마다 고시되는 한국수출입은행 매매기준율로, 참고값입니다. 실시간 환율이나 실제 카드 결제 환율과 다를 수 있습니다. 주말·공휴일·고시 전에는 가장 최근 고시일(최대 7일 전) 값을 씁니다.
- **시연 데이터**: 처음 실행하면 기본 여행과 기본 영수증 없이 빈 가계부로 시작하고, 여행 설정에서 도시·국가·기간·예산을 정합니다(예전 버전이 넣어 둔 파리·도쿄 기본 여행과 기본 시연 영수증도 불러올 때 지웁니다). 평균 소비 비율은 가상입니다. 영수증 화면의 "시연 영수증으로 체험하기"로 만든 영수증은 시연으로 표시되며 여행 설정에서 지울 수 있습니다. PAGE 2의 신주쿠 주변 매장·가격은 `travel_won`에 넣은 가데이터([sample-data/](sample-data/README.md))입니다.
- AI 상품 추천과 거리순 정렬은 아직 구현하지 않았습니다. 상품명 검색은 실제 데이터가 쌓인 뒤 다시 확인할 예정입니다.
- 서버는 로컬 해커톤용 단일 프로세스입니다. 공개 운영에는 사용자 인증, HTTPS, 운영 DB, 접근 제어·비용 한도, 데이터 보관 정책이 필요합니다.

## 로컬에서 실행하기

이 프로젝트는 **화면(앱)**과 **API 서버**를 따로 실행합니다. 화면만으로도 가계부 기록·수정·삭제, 소비 시각화, 시연 가격 비교, 카테고리 둘러보기를 쓸 수 있습니다. 사진 분석과 가격 공유를 쓸 때만 API 서버를 함께 켭니다.

| 무엇      | 명령             | 주소                                                     | 화면     |
| --------- | ---------------- | -------------------------------------------------------- | -------- |
| 웹 화면   | `npm run web`    | [http://localhost:8081](http://localhost:8081)           | 있음     |
| 휴대폰 앱 | `npm start`      | Expo Go로 QR 코드 스캔                                   | 있음     |
| API 서버  | `npm run server` | `http://localhost:8787` (상태 확인: `/health`)           | **없음** |
| API 서버 (MySQL) | `npm run server:mysql` | 위와 같음. DB만 MySQL(`travel_won`)                | **없음** |

> `npm run dev`는 이 프로젝트에 없습니다. 실행하면 `Missing script: "dev"` 오류가 납니다. `npm run dev`는 이전 프로젝트 `my-hackathon`(Vite, 5173 포트)의 명령입니다.

1. **실행 환경 확인**

   앱은 Node.js **22.13 이상**과 npm, API 서버는 **JDK 21**이 필요합니다. 다른 버전의 JDK만 설치돼 있으면 서버를 빌드할 수 없습니다. Gradle은 포함된 `./gradlew`를 쓰므로 따로 설치하지 않습니다.

   ```bash
   node --version
   npm --version
   java -version
   ```

2. **프로젝트 폴더로 이동하고 의존성 설치**

   아래 명령은 모두 프로젝트 루트인 `travel_WONIT/`에서 실행합니다. 현재 위치가 상위 `98_HACKATHON/`이라면 먼저 `cd travel_WONIT`을 실행합니다.

   ```bash
   npm ci
   ```

3. **`.env` 만들기**

   `.env`는 Git에 올라가지 않으므로 clone한 뒤 직접 만듭니다. 없어도 화면은 실행되지만, 사진 분석과 Mapbox 지도를 쓰려면 필요합니다. 키 값은 팀 안에서 따로 전달받습니다.

   ```bash
   cp .env.example .env      # Windows: copy .env.example .env
   ```

   | 변수                       | 용도                                                                                             | 필요한 경우             |
   | -------------------------- | ------------------------------------------------------------------------------------------------ | ----------------------- |
   | `ANTHROPIC_API_KEY`        | 영수증 사진 분석(Claude). 서버에서만 읽습니다                                                    | 사진 분석               |
   | `AI_MODEL`                 | 분석 모델. 기본값 `claude-haiku-5-5`                                                             | 선택                    |
   | `KOREAEXIM_API_KEY`        | 한국수출입은행 현재환율 API 인증키(적용 환율 자동 기본값). 서버에서만 읽습니다                    | 오늘 환율 채우기        |
   | `PORT`                     | API 서버 포트. 기본값 `8787`                                                                     | 선택                    |
   | `EXPO_PUBLIC_API_URL`      | 앱이 호출할 API 주소. 기본값 `http://localhost:8787`, Android 에뮬레이터는 `http://10.0.2.2:8787` | 실기기, 다른 주소       |
   | `EXPO_PUBLIC_MAPBOX_TOKEN` | Mapbox 지도 공개 토큰(`pk.`로 시작). 없으면 OpenStreetMap 지도를 씁니다                          | 선택                    |
   | `ALLOWED_ORIGINS`          | 웹에서 API를 호출할 수 있는 origin(쉼표로 구분)                                                  | 웹을 다른 주소로 열 때 |
   | `DB_URL`                   | MySQL 주소. 예: `jdbc:mysql://<호스트>:3306/travel_won?serverTimezone=Asia/Seoul&characterEncoding=UTF-8` | `npm run server:mysql` |
   | `DB_USERNAME`, `DB_PASSWORD` | MySQL 계정과 비밀번호. 팀 안에서 따로 전달받습니다                                              | `npm run server:mysql` |

   `EXPO_PUBLIC_`으로 시작하는 값은 앱 번들에 포함되어 누구나 볼 수 있으니 비밀 키를 넣지 않습니다. `EXPO_PUBLIC_` 값을 바꾸면 Expo(`npm run web`·`npm start`)를, 나머지 값을 바꾸면 API 서버를 다시 시작합니다.

4. **웹 화면 실행**

   ```bash
   npm run web
   ```

   브라우저에서 [http://localhost:8081](http://localhost:8081)을 엽니다. 위치 기능은 localhost 또는 HTTPS에서만 동작합니다.

   8081 포트를 이미 다른 프로그램이 쓰고 있으면 Expo가 다른 포트를 쓸지 묻습니다. 다른 포트로 열면 API 서버 연결이 막힙니다(CORS). 8081을 쓰는 프로그램을 끄거나, 새 주소를 `ALLOWED_ORIGINS`에 추가하고 API 서버를 다시 시작합니다.

5. **API 서버 실행** (가계부 저장·사진 분석·가격 비교·오늘 환율을 쓸 때)

   웹 화면과 **별도의 터미널**에서 실행합니다.

   ```bash
   npm run server            # macOS·Linux
   .\gradlew.bat bootRun     # Windows (npm run server는 Windows에서 동작하지 않습니다)
   ```

   처음 실행할 때는 Gradle과 라이브러리를 내려받느라 시간이 걸립니다. 터미널에 `Started TravelWonhaeApplication`이 나오면 준비된 것입니다.

   이 서버에는 **화면이 없습니다.** 브라우저로 [http://localhost:8787/health](http://localhost:8787/health)를 열어 `"ok":true`가 보이면 정상입니다. `http://localhost:8787` 자체를 열면 "요청 경로나 형식을 확인해 주세요"라는 오류가 나오는데, 이것도 정상입니다. 앱 화면은 4단계의 8081 주소에서 봅니다.

   **MySQL(`travel_won`)로 실행하기:** `.env`에 `DB_URL`·`DB_USERNAME`·`DB_PASSWORD`를 넣고 아래 명령을 실행합니다. `.env`에 DB 값이 있어도 `npm run server`는 항상 H2를 씁니다.

   ```bash
   npm run server:mysql                                            # macOS·Linux
   .\gradlew.bat bootRun --args="--spring.profiles.active=mysql"   # Windows
   ```

   이 방식에서는 테이블을 자동으로 만들거나 바꾸지 않습니다(`ddl-auto=none`). 테이블은 [docs/db-schema-mysql.sql](docs/db-schema-mysql.sql)로 만들었습니다. 앱은 아직 새 API로 바꾸기 전입니다([데이터와 한계](#데이터와-한계) 참고).

6. **휴대폰에서 실행** (선택)

   ```bash
   npm start
   ```

   휴대폰과 개발 컴퓨터를 같은 Wi-Fi에 연결하고, Expo SDK 58을 지원하는 Expo Go로 터미널의 QR 코드를 스캔합니다. 자세한 순서는 [iPhone에서 시연하기](#iphone에서-시연하기)를 참고합니다.

7. **종료**

   각 터미널에서 `Ctrl + C`를 누릅니다.

### 자주 막히는 곳

| 증상                                                         | 원인과 해결                                                                                                                                                                  |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run dev` → `Missing script: "dev"`                      | 이 프로젝트의 웹 화면 명령은 `npm run web`입니다.                                                                                                                            |
| `localhost:8787`을 열었더니 화면 대신 오류 문구(JSON)가 보임 | 정상입니다. API 서버라 화면이 없습니다. 화면은 `npm run web` → `http://localhost:8081`, 서버 상태는 `/health`로 확인합니다.                                                  |
| Windows에서 `npm run server` → `'.' is not recognized`       | Windows에서는 `.\gradlew.bat bootRun`을 실행합니다.                                                                                                                            |
| `./gradlew: Permission denied`                               | ZIP으로 받으면 실행 권한이 빠질 수 있습니다. `chmod +x gradlew`를 한 번 실행합니다.                                                                                          |
| 서버 빌드 중 Java 21을 찾지 못한다는 오류                   | JDK 21을 설치합니다. `java -version`이 다른 버전이어도 JDK 21이 설치돼 있으면 Gradle이 찾아 씁니다.                                                                          |
| `Port 8787 was already in use`                               | 다른 터미널에서 서버가 이미 실행 중입니다. 그 서버를 끄거나, `.env`의 `PORT`와 `EXPO_PUBLIC_API_URL`을 함께 바꿉니다.                                                        |
| 화면에 "서버에 연결하지 못했어요"                            | API 서버가 꺼져 있거나, 웹을 8081이 아닌 주소로 열었습니다(CORS). 서버를 켜고, 다른 주소라면 `ALLOWED_ORIGINS`에 추가한 뒤 서버를 다시 시작합니다.                           |
| 사진 분석 시 "지금은 사진 인식을 쓸 수 없어요"               | `.env`에 `ANTHROPIC_API_KEY`를 넣고 API 서버를 다시 시작합니다.                                                                                                              |
| 지도가 Mapbox가 아닌 OpenStreetMap으로 보임                  | `.env`에 `EXPO_PUBLIC_MAPBOX_TOKEN`이 없습니다. 넣은 뒤 Expo를 다시 시작합니다.                                                                                              |
| `npm run server:mysql` → `Could not resolve placeholder 'DB_URL'` | `.env`에 `DB_URL`·`DB_USERNAME`·`DB_PASSWORD`가 없습니다. 3단계 표를 참고해 넣습니다.                                                                                         |
| `npm run server:mysql` → `Access denied for user`            | `DB_USERNAME`·`DB_PASSWORD` 값을 확인합니다.                                                                                                                                 |
| 터미널 `mysql` 명령 → `Authentication plugin 'mysql_native_password' cannot be loaded` | 최신 MySQL 클라이언트에 이 인증 방식이 없습니다. MySQL 8.4 이하 클라이언트나 DBeaver·MySQL Workbench 같은 GUI 도구로 접속합니다. 앱 서버 연결에는 영향이 없습니다. |
| 휴대폰에서 서버에 연결하지 못함                              | `EXPO_PUBLIC_API_URL`이 `localhost`이면 휴대폰 자기 자신을 가리킵니다. Mac의 LAN 주소로 바꾸고 Expo를 다시 시작합니다.                                                       |

## iPhone에서 시연하기

1. App Store에서 **Expo Go**를 설치합니다.
2. `.env`의 `EXPO_PUBLIC_API_URL`을 Mac의 LAN 주소로 바꿉니다(예: `http://192.168.0.10:8787`). macOS 방화벽에서 Java가 들어오는 연결을 받을 수 있게 허용합니다.
3. `.env`에 `ANTHROPIC_API_KEY`를 넣고 `npm run server`와 `npm start`를 실행한 뒤, iPhone 카메라 앱으로 QR 코드를 스캔합니다.
4. 가계부의 **영수증 한 장으로, 기록 끝!** → **촬영하기**를 눌러 영수증을 찍습니다. 인식 결과를 확인하고 저장합니다.

- Expo Go에서는 앱 아이콘 대신 Expo Go 아이콘으로 실행됩니다. 여행WON해 아이콘의 독립 앱으로 설치하려면 Apple Developer Program에 가입하고 EAS Build나 TestFlight로 빌드해야 합니다. 독립 앱은 평문 HTTP 주소가 iOS 보안 정책에 막힐 수 있으므로 HTTPS 주소를 권장합니다.
- 서버의 사진 한도는 10MB입니다. 카메라 앱에서 고해상도(24MP 이상)로 찍은 사진을 고르면 한도를 넘을 수 있으니, 앱 안의 **촬영하기**를 권장합니다.

## API

| 메서드 | 경로      | 설명                                                                                   |
| ------ | --------- | -------------------------------------------------------------------------------------- |
| GET    | `/health` | 서버 상태와 OCR 키 설정 여부                                                           |
| POST   | `/api/receipts/ocr` | 영수증 사진 분석. multipart `file`(JPG·PNG·WEBP, 10MB 이하). IP당 시간당 20회. 오류는 `{errors:[{field, code, message}]}` |
| GET    | `/api/exchange-rates/{currency}` | 1 외화당 원화 참고 환율 `{currency, rate, date, source}`(한국수출입은행 매매기준율). 불러오지 못하면 503 `RATE_UNAVAILABLE` |
| GET    | `/ledger` | 이 기기의 가계부 `{state: {version, trip, receipts}}`. 저장한 적이 없으면 `state: null` |
| PUT    | `/ledger` | 이 기기의 가계부를 통째로 교체. 시연 영수증(`demo: true`)은 저장하지 않고, 매장 위치가 있는 영수증만 공유. 하나라도 잘못되면 아무것도 바꾸지 않음 |
| GET    | `/prices` | PAGE 2 조회. `currency`·`latitude`·`longitude` 필수, `category`·`q`(상품명)·`sort`(가격순·구매수·최신순)·`radius`(기본 3000m) 선택. 매장·상품별 최근 가격과 구매수 |

`/ledger`는 `Authorization: Bearer <기기 토큰>` 헤더가 필요합니다. 기기 토큰은 앱이 처음 실행할 때 만듭니다.

## 프로젝트 구조

[WONIT-A/05_springAI](https://github.com/WONIT-A/05_springAI)의 기술 구성(Java 21·Spring Boot·Spring AI·Spring Data JPA·Gradle)과 계층별 책임을 참고했습니다. 프런트엔드는 모바일 앱 요구에 맞춰 React·Vite 대신 Expo·React Native를 씁니다.

```text
travel_WONIT/
├── App.tsx                       하단 탭·공유 상태·기기 저장·서버 동기화
├── index.ts                      앱 진입점
├── app.config.ts                 앱 이름·아이콘·카메라·사진·위치 권한
├── assets/                       앱에서 쓰는 이미지 (여행푸딩·영수증푸딩)
├── img/                          원본 이미지와 화면 참고 자료
├── src/
│   ├── screens/
│   │   ├── Ledger.tsx            여행 가계부
│   │   └── Compare.tsx           주변 가격 비교·카테고리 둘러보기
│   ├── components/
│   │   ├── ReceiptEditor.tsx     촬영·OCR·항목 수정·공유 설정
│   │   ├── TripSettings.tsx      여행·예산·시연 기록 관리
│   │   ├── PriceMap.tsx          지도 타일과 가격 마커
│   │   └── ui.tsx                공통 UI·아이콘
│   ├── domain.mjs                금액 계산·상품 정규화·가격 비교·카테고리 집계·시연 데이터
│   ├── api.ts                    서버 요청
│   ├── types.ts                  공용 타입
│   ├── main/java/com/wonit/travel/
│   │   ├── api/                  REST 컨트롤러·CORS·오류 처리·요청 크기 제한
│   │   ├── ocr/                  Claude 영수증 리더(Spring AI ChatClient)·초안 변환
│   │   ├── ledger/               가계부: 기기·여행·영수증·품목 JPA 엔티티·저장소·서비스
│   │   ├── price/                PAGE 2 조회: 반경·카테고리·검색·정렬
│   │   └── rate/                 한국수출입은행 환율 조회·고시일 캐시
│   ├── main/resources/           Spring 설정 (기본 H2, mysql 프로필)
│   └── test/java/                JUnit 5 API·DB·OCR·환율·MySQL 프로필 테스트
├── tests/domain.test.mjs         계산·정규화·공유 동의·카테고리 테스트
├── scripts/browser-check.mjs     Chrome 사용자 흐름 검증
├── scripts/sample-data.mjs       시연용 가데이터 CSV 생성 (npm run sample-data)
├── sample-data/                  도쿄 신주쿠 가데이터 CSV (travel_won에 적재함)
├── build.gradle                  Java 21·Spring Boot·Spring AI·JPA·H2
└── docs/                         명세 원본·검토 결과·검증 기록·화면 캡처
```

`App.tsx`가 탭 전환과 공유 상태를 연결합니다. 계산은 `src/domain.mjs`, 서버 호출은 `src/api.ts`가 맡습니다. 서버는 컨트롤러 → 서비스 → JPA 저장소 순서로 책임을 나눕니다.

## 빌드와 검증

프로젝트 루트에서 실행합니다.

```bash
npm test              # 계산·정규화·카테고리 단위 테스트
npm run typecheck     # TypeScript 검사
./gradlew test        # 서버 API·DB·OCR·환율 테스트 (JUnit 5, H2라 MySQL 없이 실행)
npm run build:web     # 웹 번들 생성 (dist/)
```

브라우저 검증은 웹 번들과 서버 JAR를 빌드한 뒤, 실제 Spring Boot·JPA 서버(H2 메모리 DB)와 macOS Google Chrome으로 사용자 흐름을 확인합니다. 서버 가격 공유 확인은 앱을 새 API로 바꾼 뒤 되살립니다. 확인 항목은 예산, 영수증 등록·수정·삭제·복원, 검색, 지도 창 열기·닫기, 카테고리 정렬, 위치, 사진 선택, 공유·철회, 320·390·768px 화면입니다. Claude 연결과 위치는 테스트용 응답으로 대체하므로 실제 영수증을 외부로 보내거나 과금하지 않습니다.

```bash
npm run test:browser
```

검증 중 8787 포트를 쓰므로 실행 중인 API 서버를 먼저 종료합니다. Chrome이 다른 경로에 있으면 `CHROME_PATH`로 지정합니다. 실행하면 `docs/screenshots/`의 화면 캡처가 갱신됩니다.

iOS·Android 네이티브 번들과 Expo 호환성은 다음 명령으로 확인합니다. 서명된 설치 파일(IPA·APK)은 만들지 않습니다. 설치 파일을 만들고 배포하려면 Xcode 또는 Android SDK와 각 플랫폼의 서명 설정이 필요합니다.

```bash
npx expo export --platform ios --platform android --output-dir /tmp/wonhae-native
npx expo-doctor
```

## 관련 문서

- [db-backups/README.md](db-backups/README.md): 4개 테이블·가데이터 시점별 보관, 프로젝트 밖 사본, 안전 실행·복구 절차 (`npm run db:snapshot`, `npm run db:verify`, `npm run server:mysql:safe`)
- [SPEC.md](SPEC.md): 요구사항, 기술 버전과 근거, 테스트·작업 목록
- [docs/db-design.md](docs/db-design.md): `travel_won` DB 설계와 화면별 쿼리
- [docs/results.md](docs/results.md): 요구사항·구조 검토 결과와 결정 기록
- [docs/IMPLEMENTATION.md](docs/IMPLEMENTATION.md): 개발·검증 기록
- [docs/sub_SPEC.md](docs/sub_SPEC.md): 개편 명세 원본
