# 개발·검증 기록

기준: `docs/sub_SPEC.md`. 기존 `my-hackathon`은 서비스 이름·색상·아이콘과 UI 흐름만 참고했고 수정하지 않았습니다.

## 적용한 개편

1. 기존 네 페이지를 가계부와 주변 가격 비교 두 탭으로 축소했습니다.
2. 영수증 입력을 가계부에 통합하고 상품별 이름·수량·개당 가격을 저장합니다.
3. 카메라·사진 선택을 실제 OCR API에 연결하고, 저장 전에 인식 결과를 수정합니다.
4. 영수증 상품명·용량을 정규화하고 공유에 동의한 상품만 공개 가격 저장소에 연결합니다.
5. 현재 위치·매장 좌표로 반경과 거리를 계산하고, 최신 구매기록을 가격순으로 표시합니다.
6. 가상 평균 비교·소비 비중 요약·예산 관리와 기기 저장을 제공합니다.

챗봇·ATM·환급·별도의 나의 여행 페이지는 포함하지 않았습니다. 환급 관련 상태도 새 데이터 모델에 넣지 않았습니다.

## 검증 범위

| 항목                      | 결과                                                                                                                    |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `npm test`                | 모바일 계산·상품 정규화·공유 동의·공개 필드 제한 14개 통과                                                              |
| `./gradlew test`          | JUnit 5 API·JPA·H2·OCR 구조화 출력 테스트 14개 통과                                                                     |
| `npm run typecheck`       | TypeScript 검사 통과                                                                                                    |
| `npm run build:web`       | 웹 번들 생성 성공                                                                                                       |
| iOS·Android `expo export` | 두 플랫폼 Hermes 번들 생성 성공                                                                                         |
| `expo-doctor`             | 20개 검사 통과                                                                                                          |
| Chrome 사용자 흐름        | 35개 통과: 예산, 등록·중복 방지·수정·삭제·복원, 검색·위치 유지, 공유·철회, 사진 선택·결과 검토, 320·390·768px 화면 검증 |

실제 영수증 이미지의 OCR 정확도와 과금되는 외부 API 호출은 검증하지 않았습니다. `.env`가 비어 있어 실제 키 대신 테스트 응답을 사용했습니다. 실제 기기의 카메라·앨범·위치 권한과 서명된 설치 파일은 실기기에서 별도로 확인해야 합니다. 이 환경에는 Xcode가 설치되어 있지 않아 iOS 시뮬레이터는 실행하지 않았습니다.

브라우저 검증은 실제 Java 서버·JPA·테스트용 H2를 사용합니다. 사진은 실제 입력 흐름으로 선택하고, OpenAI 네트워크 종단만 로컬 대체 응답으로 연결해 서버 요청 형식까지 확인했습니다. 참고 저장소의 로컬 체크아웃(`/Users/programming/ITStudy/05_springAI`, origin `https://github.com/WONIT-A/05_springAI.git`)에서 기술 구성과 관련 소스를 확인했습니다.

`npm audit`에서는 Expo CLI가 사용하는 Zod 3의 의존성 경로에 high 3건(원인 1건)이 보고됩니다. 런타임의 가계부·API는 Zod를 사용하지 않습니다. Expo CLI의 요구 범위를 벗어나는 강제 메이저 변경은 적용하지 않았으며, Expo의 호환 패치로 해소할 항목입니다.

## 보존한 파일

- `AGENTS.md`, `.agents/skills/`, `skills-lock.json`, 명세 원본은 수정하지 않았습니다.
- 기존 `.env`를 변경하지 않았으며, Git에서 제외했습니다.
- `img/여행푸딩_투명ver.png`를 변경하지 않았습니다. 앱에서 사용하는 `assets/travel-pudding.png`는 원본과 SHA-256이 같습니다.
- 기존 `my-hackathon`의 파일을 변경하지 않았습니다.

## 변경·추가 파일

- 모바일 앱: `App.tsx`, `index.ts`, `app.config.ts`, `src/screens/`, `src/components/`, `src/api.ts`, `src/types.ts`, `src/domain.mjs`, `assets/travel-pudding.png`
- Java 서버: `build.gradle`, `settings.gradle`, `gradlew`, `gradlew.bat`, `gradle/wrapper/`, `src/main/java/`, `src/main/resources/application.properties`
- 검증: `src/test/java/`, `tests/domain.test.mjs`, `scripts/browser-check.mjs`, `docs/screenshots/`
- 실행·문서: `package.json`, `package-lock.json`, `tsconfig.json`, `.gitignore`, `.env.example`, `README.md`, `SPEC.md`, `docs/IMPLEMENTATION.md`

보호 파일은 **안 고침**. 작업 중 사용자가 추가한 `AGENTS.md`의 변경은 그대로 보존했습니다.

## 운영 전 남은 작업

- 실제 기기에서 촬영·권한·복귀·네트워크 재연결 확인
- 실제 영수증별 OCR·할인·세금 처리 정확도 확인
- 운영용 인증·DB·삭제 정책 및 HTTPS·네트워크 배포 구성
- 실제 이용자 데이터로 도시·기간별 평균을 산출할 충분한 표본 확보
- iOS·Android 서명·앱 배포 구성

## MySQL 가계부 DB · Claude OCR 전환 (2026-10-27)

- 가계부(기기·여행·영수증·품목)를 MySQL에 저장합니다. 가게·상품·가게-상품(최근 가격)을 분리했고 구조는 `docs/schema.sql`과 같습니다. `shared_prices` 테이블과 `PUT /prices`는 없앴고, `GET /prices`는 공유 동의 품목에서 계산합니다.
- 영수증 사진 인식을 98_HACKATHON/my-hackathon과 같은 방식(Spring AI `ChatClient` + Claude, `BeanOutputConverter`, multipart `POST /api/receipts/ocr`, `ocr_history`, `{errors:[…]}` 오류 형식)으로 바꾸고, 가계부에 필요한 상품별 이름·수량·단가·통화·카테고리를 추가했습니다.
- 라이브러리: `spring-ai-model` → `spring-ai-starter-model-anthropic`, `mysql-connector-j` 추가, H2는 테스트 전용.

| 항목                   | 결과                                                                                       |
| ---------------------- | ------------------------------------------------------------------------------------------ |
| `./gradlew test`       | 22개 통과 (API·가계부 저장·가격 계산·OCR 17개, 초안 변환·리더 5개). H2 MySQL 모드          |
| 실제 DB 실행           | 서버 JAR를 MariaDB에 연결해 테이블 9개 생성, 가계부 저장·조회·가격 비교·OCR 오류 응답 확인 |
| `docs/schema.sql`      | MariaDB에서 실행해 테이블 9개 생성 확인                                                    |
| `npm test`·`typecheck` | 18개 통과 · 통과                                                                           |
| 브라우저 검증          | 42개 통과 (Chromium, MariaDB, Claude 응답은 로컬 대체)                                     |

실제 Claude 호출(과금)과 MySQL 8 서버 자체에서의 실행은 확인하지 않았습니다(호환 DB인 MariaDB로 확인).

## 한국수출입은행 환율 · 소수 환율 (2026-10-27)

- 새 영수증을 열거나 결제 통화를 바꾸거나 사진 인식 결과가 들어오면 적용 환율 칸에 오늘 환율을 기본값으로 자동으로 채웁니다(직접 고친 값은 덮어쓰지 않음, 저장된 영수증은 기존 환율 유지). 서버 `GET /api/exchange-rates/{currency}`가 한국수출입은행 현재환율 API(`data=AP01`)의 매매기준율을 돌려줍니다. 쉼표를 지우고 `JPY(100)`은 100으로 나눕니다. 오늘 고시가 없으면 최대 7일 전까지 거슬러 올라가고, 고시일 응답은 메모리에 캐시합니다(오늘 빈 응답은 10분 뒤 재조회). 키는 `KOREAEXIM_API_KEY` 환경 변수에서만 읽고, 실패하면 503 `RATE_UNAVAILABLE`입니다. 새 라이브러리는 없습니다(`RestClient`).
- 적용 환율을 소수 4자리까지 받습니다. 앱은 환율×10,000 정수와 BigInt, 서버는 `BigDecimal`, DB는 `DECIMAL(14,4)`이며 원화는 끝까지 계산한 뒤 반올림합니다(1000엔 × 8.3983 = 8,398원). 기존 정수 환율은 그대로 유효합니다.
- 기존 DB의 `rate`가 BIGINT이면 `docs/schema.sql` 끝의 ALTER 문을 한 번 실행해야 합니다. MySQL은 BIGINT 컬럼에 8.3983을 넣으면 오류 없이 8로 저장합니다(임시 테이블로 확인).

| 항목                         | 결과                                                                                                   |
| ---------------------------- | ------------------------------------------------------------------------------------------------------ |
| `./gradlew test`             | 35개 통과 (API 22개, 초안 변환 5개, 환율 서비스 8개). 외부 환율 API는 가짜 응답                       |
| `npm test`·`typecheck`       | 21개 통과 · 통과                                                                                       |
| 실제 환율 API                | 빌드한 환율 클래스로 호출: EUR 1477.87 · USD 1322.6 · JPY 8.3983 · THB 39.16 · KRW 1 (10/27 고시)      |
| 실제 MySQL                   | `.env`의 DB는 `rate`가 이미 `decimal(12,4)`. 임시 테이블로 BIGINT → `DECIMAL(14,4)` ALTER와 값 유지 확인 |
| 웹 화면 (헤드리스 Chrome)    | 새 영수증을 열면 자동 조회, 실패 시 여행 설정 환율 유지와 빨간 안내, 직접 입력 우선, 1477.87 환율 저장 후 목록 1,478원, 콘솔 오류 없음 |

브라우저 검증(`scripts/browser-check.mjs`)은 `--KOREAEXIM_API_KEY=`로 실제 환율 API를 부르지 않습니다. 새 서버 코드로 띄운 상태에서 실제 값이 자동으로 채워지는 것과, 고시 전(오전) 오늘 날짜 조회가 빈 응답인지는 확인하지 않았습니다.

## main 병합 (2026-10-28)

- main(`93387ea`까지)과 병합했습니다. DB는 main 방식입니다: 기본 실행은 H2 파일 DB, MySQL(`travel_won`)은 `mysql` 프로필(`ddl-auto=none`)에서만 씁니다. 위 두 항목의 `docs/schema.sql`·ALTER 안내는 더 이상 해당하지 않습니다.
- 서버 저장은 main의 4개 테이블 구현(`ledger/`·`LedgerController`·`price/`, [db-design.md](db-design.md))을 그대로 씁니다. 이 브랜치의 9개 테이블용 코드(`ledger/` 엔티티·`CategorySeeder`·지오코딩, `price/`, OCR 이력 `ocr_history`, `docs/schema.sql`)는 지웠습니다.
- OCR은 이 브랜치의 Claude(`POST /api/receipts/ocr`)를 유지하고 main의 OpenAI `OcrService`(`POST /ocr`)는 지웠습니다. 오늘 환율(`GET /api/exchange-rates/{currency}`)도 이 브랜치 그대로입니다.
- 앱은 아직 `PUT /ledger`(가계부 전체 저장)로 동기화해 main의 새 API(`PUT /trip`·`POST /receipts` 등)와 맞지 않습니다(405). 앱을 새 API로 바꾸기 전까지는 기기 기록만 표시합니다. 또 앱은 동의 절차 없이 공유하지만 서버 설계는 선택 동의·매장 위치 필수라, 앱 전환 때 맞춰야 합니다.
- 공용 `travel_won`은 이 브랜치 서버가 `ddl-auto=update`로 테이블 5개·컬럼 9개를 추가한 상태였습니다. 백업한 뒤 테이블 9개를 모두 지워 비워 두었으며, `db-schema-mysql.sql`로 다시 만들어야 합니다.
- 브라우저 검증은 H2 메모리 DB로 서버를 띄우고, 서버 가격 공유(`/prices`)·주소 좌표 변환 확인 2개는 앱을 새 API로 바꾼 뒤 되살립니다.

| 항목                   | 결과                                                                                                   |
| ---------------------- | ------------------------------------------------------------------------------------------------------ |
| `./gradlew test`       | 33개 통과 (API 19개: 가계부·가격 13·OCR 4·환율 2, 초안 변환 5개, 환율 8개, MySQL 프로필 1개)              |
| `npm test`·`typecheck` | 21개 통과 · 통과                                                                                       |
| 기본 실행(H2 파일 JAR) | 새 기기 `/ledger` 빈 가계부, `POST /receipts` 환율 8.3983 저장, `/prices` 1건, 실제 환율(EUR 1477.87), `/ocr` 404, 앱의 `PUT /ledger` 405 |

`npm run test:browser`는 실행하지 않았습니다.
