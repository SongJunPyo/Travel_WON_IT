# travel_won DB 설계

- 확정일: 2026-10-27
- DB: MySQL 8.0 `travel_won`. 서버의 `mysql` 프로필로 연결합니다(`npm run server:mysql`).
- 생성 SQL: [db-schema-mysql.sql](db-schema-mysql.sql). 서버는 테이블을 자동으로 만들지 않으므로(`ddl-auto=none`) 이 파일로 만듭니다.

## 1. 시연 시나리오와 결정 사항

시연은 한국 여행자가 일본에서 쓰는 상황입니다. 사용자의 현재 위치는 실제 GPS 대신 도쿄의 고정 좌표(예: 신주쿠역 `35.6896, 139.7006`)를 씁니다.

| 결정                         | 설계에 미치는 영향                                                                                   |
| ---------------------------- | ---------------------------------------------------------------------------------------------------- |
| 가계부를 서버 DB에 저장      | 내 영수증과 가데이터를 나누기 위해 `trips`·`receipts`에 `device_id`를 둡니다. 로그인은 없습니다.    |
| 매장 좌표는 시연 위치 근처 가짜 좌표 | 새로 찍은 영수증도 `receipts.latitude`·`longitude`에 시연 위치 반경 안의 좌표를 넣습니다.    |
| PAGE 2 카테고리는 AI 추천 + 사용자 수정 | `receipts.browse_category` (영수증 단위)                                                     |
| 마스터·집계 테이블은 두지 않음 | 테이블은 `devices`, `trips`, `receipts`, `receipt_items` 4개입니다. 최근 가격·구매수는 조회할 때 계산합니다. |

## 2. 구조

```text
devices 1 ── 1 trips                          (기기당 여행 1개)
devices 1 ── N receipts N ── 0..1 trips
receipts 1 ── N receipt_items                 (영수증 삭제 시 품목도 함께 삭제)
```

공통: InnoDB, `utf8mb4`, `utf8mb4_0900_ai_ci`(대소문자 구분 없음 → "doritos"로 "DORITOS" 검색 가능).

### devices — 기기(익명 사용자)

| 컬럼       | 타입        | 키 | NULL | 설명                                                  |
| ---------- | ----------- | -- | ---- | ----------------------------------------------------- |
| id         | BIGINT      | PK | N    | 자동 증가                                             |
| token_hash | CHAR(64)    | UK | N    | 앱이 만든 무작위 기기 토큰의 SHA-256. 원문은 저장 안 함 |
| is_sample  | BOOLEAN     |    | N    | 가데이터용 "다른 여행자" 여부. 기본값 FALSE           |
| created_at | DATETIME(6) |    | N    | 처음 저장한 시각                                      |

### trips — 여행 (기기당 1개)

| 컬럼       | 타입          | 키      | NULL | 설명                              |
| ---------- | ------------- | ------- | ---- | --------------------------------- |
| id         | BIGINT        | PK      | N    | 자동 증가                         |
| device_id  | BIGINT        | FK·UK   | N    | devices.id                        |
| city       | VARCHAR(50)   |         | N    | 도시 (예: 도쿄)                   |
| country    | VARCHAR(50)   |         | N    | 국가 (예: 일본)                   |
| start_date | DATE          |         | N    | 여행 시작일                       |
| end_date   | DATE          |         | N    | 여행 종료일 (시작일 이후)         |
| budget_krw | BIGINT        |         | N    | 예산 (원)                         |
| currency   | CHAR(3)       |         | N    | 기본 통화                         |
| rate       | DECIMAL(12,4) |         | N    | 1 현지통화 = rate원 (예: JPY 9.2400) |

### receipts — 영수증

| 컬럼            | 타입          | 키  | NULL | 설명                                                          |
| --------------- | ------------- | --- | ---- | ------------------------------------------------------------- |
| id              | BIGINT        | PK  | N    | 자동 증가                                                     |
| device_id       | BIGINT        | FK  | N    | devices.id (영수증 주인)                                      |
| trip_id         | BIGINT        | FK  | Y    | trips.id. 여행이 지워지면 NULL                                |
| store_name      | VARCHAR(120)  |     | N    | 가게명                                                        |
| store_address   | VARCHAR(250)  |     | N    | 매장 주소. 없으면 빈 값                                       |
| latitude        | DOUBLE        |     | Y    | 매장 위도                                                     |
| longitude       | DOUBLE        |     | Y    | 매장 경도                                                     |
| ledger_category | VARCHAR(10)   |     | N    | PAGE 1 분류: 음식·쇼핑·교통·숙박·관광·기타                    |
| browse_category | VARCHAR(20)   |     | Y    | PAGE 2 분류: 식당·명소·화장품·의류·뷰티·웰니스·숙박·액티비티·렌트 |
| purchased_date  | DATE          |     | N    | 구매일                                                        |
| currency        | CHAR(3)       |     | N    | EUR·USD·JPY·THB·KRW                                           |
| total_minor     | BIGINT        |     | N    | 총 결제금액 (최소 통화 단위, JPY는 엔)                        |
| rate            | DECIMAL(12,4) |     | N    | 적용 환율                                                     |
| share_consent   | BOOLEAN       | IDX | N    | 가격 공유 동의. 동의하려면 좌표가 있어야 함                   |
| created_at      | DATETIME(6)   |     | N    | 저장 시각. 같은 날짜의 최근 기록을 고를 때 씁니다              |

인덱스: `(device_id, purchased_date)` — 내 가계부, `(share_consent, browse_category, currency)` — PAGE 2.

### receipt_items — 영수증 품목

| 컬럼            | 타입         | 키  | NULL | 설명                                              |
| --------------- | ------------ | --- | ---- | ------------------------------------------------- |
| id              | BIGINT       | PK  | N    | 자동 증가                                         |
| receipt_id      | BIGINT       | FK  | N    | receipts.id. 영수증 삭제 시 함께 삭제             |
| raw_name        | VARCHAR(160) |     | N    | 영수증 원문 (예: DORITOS NACHO 150G)              |
| name_ko         | VARCHAR(160) |     | Y    | 한국어 이름 (예: 도리토스 나초 150g)              |
| normalized_name | VARCHAR(200) | IDX | N    | 같은 상품을 묶는 기준. 영수증 원문을 정규화한 값  |
| quantity        | INT          |     | N    | 수량 1–999                                        |
| unit_minor      | BIGINT       |     | N    | 개당 가격 (최소 통화 단위)                        |

"상품 합계 = 총 결제금액" 검사는 서버 코드에서 합니다.

## 3. 처음 구상과 달라진 점

| 처음 구상                  | 확정                                                     | 이유                                                                                         |
| -------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `devices` (id, created_at) | `token_hash`, `is_sample` 추가                           | 앱이 이미 보내는 익명 토큰으로 "내 기기"를 찾습니다. 번호를 직접 쓰면 남의 기록을 고칠 수 있습니다. 가데이터 표시·정리용 표식도 둡니다. |
| `trips`                    | `device_id`(기기당 1개), `city`, `start_date` 추가       | 여행의 주인이 필요하고, 앱이 도시와 시작일을 씁니다.                                          |
| `categories`               | 삭제 → `receipts.ledger_category` + 허용값 검사          | 6개 고정값입니다.                                                                            |
| `stores`                   | 삭제 → `receipts`의 가게명·주소·좌표                      | 주소 없는 같은 이름의 체인점이 한 가게로 합쳐지는 문제를 피하고 저장 로직을 단순하게 합니다.   |
| `products`                 | 삭제 → `receipt_items.normalized_name`                   | "있으면 찾고 없으면 생성" 로직이 필요 없습니다.                                              |
| `store_products`           | 삭제 → 조회 쿼리                                         | 저장값이 어긋날 일이 없고, 구매수도 쿼리로 계산합니다.                                        |
| `receipts`                 | `device_id`, `browse_category`, 가게 컬럼, `created_at` 추가, `total_krw` 삭제 | 주인·PAGE 2 분류가 필요하고, 계산 가능한 값은 저장하지 않습니다.                           |
| `receipt_items`            | `product_id`, `line_minor` 삭제                          | 위와 같습니다.                                                                               |
| `rate` BIGINT              | `DECIMAL(12,4)`                                          | 1엔은 약 9원대라 정수로 저장하면 원화 환산이 약 3% 틀어집니다.                                |

## 4. 화면별 쿼리

**PAGE 1 — 내 가계부**

```sql
SELECT r.*, i.* FROM receipts r JOIN receipt_items i ON i.receipt_id = r.id
WHERE r.device_id = ? ORDER BY r.purchased_date DESC, r.created_at DESC;
```

**PAGE 2 — 카테고리 둘러보기** (반경 3km, 매장·상품별 최근 가격과 구매수)

```sql
SELECT * FROM (
  SELECT r.store_name, r.store_address, r.latitude, r.longitude,
         i.name_ko, i.raw_name, i.unit_minor, r.purchased_date,
         ROW_NUMBER() OVER w AS rn,
         COUNT(*) OVER (PARTITION BY r.store_name, r.store_address, i.normalized_name, r.currency) AS purchase_count
  FROM receipts r JOIN receipt_items i ON i.receipt_id = r.id
  WHERE r.share_consent = TRUE AND r.browse_category = ? AND r.currency = ?
    AND ST_Distance_Sphere(POINT(r.longitude, r.latitude), POINT(?, ?)) <= 3000
  WINDOW w AS (PARTITION BY r.store_name, r.store_address, i.normalized_name, r.currency
               ORDER BY r.purchased_date DESC, r.created_at DESC)
) t WHERE rn = 1
ORDER BY purchase_count DESC;   -- 가격순은 unit_minor, 최신순은 purchased_date
```

**PAGE 2 — 상품 검색**: 카테고리 조건 대신 `(i.name_ko LIKE CONCAT('%', ?, '%') OR i.raw_name LIKE CONCAT('%', ?, '%'))`를 씁니다.

서버 구현([PriceService.java](../src/main/java/com/wonit/travel/price/PriceService.java))은 H2 테스트와 같은 코드로 돌도록, DB에서는 공유 동의·통화·위치 사각형까지만 거르고 정확한 반경(하버사인 거리)·묶음·정렬은 Java에서 계산합니다. 결과는 위 쿼리와 같습니다. 검색어는 원문·한국어 이름의 부분 일치와 정규화한 이름의 부분 일치로 찾습니다.

내 영수증도 PAGE 2에 나옵니다. 시연에서 "방금 찍은 영수증이 PAGE 2에 나타난다"를 보여 주기 위해서입니다.

## 5. 운영 메모

- 2026-10-27: 이전 구조의 `shared_prices`(0행)를 삭제하고 위 4개 테이블을 만들었습니다.
- DB 계정은 서버 전체 관리자 권한을 가진 공용 계정입니다. 시연에는 가데이터와 본인 테스트 영수증만 넣습니다.
- `.env`에 DB 값을 넣은 채로 이전 버전 서버(`ddl-auto=update`)를 실행하면 `shared_prices`가 다시 생깁니다. 최신 코드를 받아 실행하세요.
- 제약조건 확인은 `SHOW CREATE TABLE`로 합니다. `information_schema.check_constraints`에서는 한글 허용값이 깨져 보이지만 표시 문제일 뿐이고, 실제 정의와 검사는 정상입니다(2026-10-27 확인).
- 2026-10-27: 서버를 새 구조로 바꾼 뒤 `npm run server:mysql`로 여행 저장, 영수증 저장·수정·삭제, PAGE 2 카테고리·검색 조회를 실제 DB에서 확인했습니다. 확인용 기기 1개만 만들고 끝난 뒤 지웠습니다(4개 테이블 0행).
- 2026-10-27 23:57: 처음 구상한 8테이블 설계로 만든 이전 서버(`ddl-auto=update`)가 `travel_won`에 연결되어, 테이블 5개(`categories`·`stores`·`products`·`store_products`·`ocr_history`)를 만들고 `receipts`·`receipt_items`에 열을 추가했습니다. 팀 회의에서 이 문서의 4개 테이블 구조를 유지하기로 정했고, 해당 팀원이 9개 테이블을 지웠습니다.
- 2026-10-28 00:36: 이 문서의 스키마 파일로 4개 테이블을 다시 만들고 가데이터를 적재했습니다([sample-data/](../sample-data/README.md)). `npm run server:mysql`로 PAGE 2 조회를 확인했습니다.
- **재발 방지:** 공용 계정이라 DB 권한으로 테이블 변경을 막을 수 없습니다. `travel_won`에는 최신 `main`을 `npm run server:mysql`(`ddl-auto=none`)로만 연결하고, `ddl-auto=update`인 코드로는 연결하지 않기로 했습니다(2026-10-28 팀 합의).
- 생성 직후 트랜잭션 안에서 시험 데이터로 확인하고 모두 되돌렸습니다: 허용값·공유 시 좌표 필수·수량 범위·기기당 여행 1개 거부, PAGE 2 쿼리(반경 3km 제외, 최근 가격, 구매수), 대소문자 무시 검색, 영수증 삭제 시 품목 함께 삭제, 환율 소수 보존 — 12개 통과.

## 6. 남은 작업

1. ~~서버: 엔티티·저장소·서비스·API를 새 구조로 교체~~ (2026-10-27 완료. API는 README 참고)
2. 앱: 가계부를 서버에서 읽고 저장, 시연 위치를 도쿄로, OCR에 PAGE 2 카테고리 추천 추가, 환율 소수 입력
3. ~~신주쿠 주변 일본(JPY) 가데이터~~ (CSV 생성, 2026-10-28 `travel_won` 적재 완료. [sample-data/](../sample-data/README.md))
