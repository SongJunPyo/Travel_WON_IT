-- travel_won 스키마 (MySQL 8.0). 설계 설명: docs/db-design.md
-- 서버의 mysql 프로필은 테이블을 자동으로 만들지 않습니다(ddl-auto=none). 이 파일을 직접 실행해 만듭니다.

CREATE TABLE devices (
  id          BIGINT      NOT NULL AUTO_INCREMENT,
  token_hash  CHAR(64)    NOT NULL,                -- 기기 토큰의 SHA-256 (원문 저장 안 함)
  is_sample   BOOLEAN     NOT NULL DEFAULT FALSE,  -- 가데이터용 '다른 여행자'
  created_at  DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uk_devices_token (token_hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE trips (
  id          BIGINT        NOT NULL AUTO_INCREMENT,
  device_id   BIGINT        NOT NULL,
  city        VARCHAR(50)   NOT NULL,
  country     VARCHAR(50)   NOT NULL,
  start_date  DATE          NOT NULL,
  end_date    DATE          NOT NULL,
  budget_krw  BIGINT        NOT NULL,
  currency    CHAR(3)       NOT NULL,
  rate        DECIMAL(12,4) NOT NULL,              -- 1 현지통화 = rate원 (예: JPY 9.2400)
  PRIMARY KEY (id),
  UNIQUE KEY uk_trips_device (device_id),
  CONSTRAINT fk_trips_device FOREIGN KEY (device_id) REFERENCES devices (id) ON DELETE CASCADE,
  CONSTRAINT ck_trips_values CHECK (start_date <= end_date AND budget_krw >= 0 AND rate > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE receipts (
  id               BIGINT        NOT NULL AUTO_INCREMENT,
  device_id        BIGINT        NOT NULL,
  trip_id          BIGINT        NULL,
  store_name       VARCHAR(120)  NOT NULL,
  store_address    VARCHAR(250)  NOT NULL DEFAULT '',
  latitude         DOUBLE        NULL,
  longitude        DOUBLE        NULL,
  ledger_category  VARCHAR(10)   NOT NULL,         -- PAGE 1 가계부 분류
  browse_category  VARCHAR(20)   NULL,             -- PAGE 2 둘러보기 분류
  purchased_date   DATE          NOT NULL,
  currency         CHAR(3)       NOT NULL,
  total_minor      BIGINT        NOT NULL,         -- 최소 통화 단위 (JPY는 엔)
  rate             DECIMAL(12,4) NOT NULL,
  share_consent    BOOLEAN       NOT NULL DEFAULT FALSE,
  created_at       DATETIME(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY idx_receipts_device_date (device_id, purchased_date),
  KEY idx_receipts_browse (share_consent, browse_category, currency),
  CONSTRAINT fk_receipts_device FOREIGN KEY (device_id) REFERENCES devices (id) ON DELETE CASCADE,
  CONSTRAINT fk_receipts_trip   FOREIGN KEY (trip_id)   REFERENCES trips (id)   ON DELETE SET NULL,
  CONSTRAINT ck_receipts_ledger   CHECK (ledger_category IN ('음식','쇼핑','교통','숙박','관광','기타')),
  CONSTRAINT ck_receipts_browse   CHECK (browse_category IS NULL OR browse_category IN
                                   ('식당','명소','화장품','의류','뷰티·웰니스','숙박','액티비티','렌트')),
  CONSTRAINT ck_receipts_currency CHECK (currency IN ('EUR','USD','JPY','THB','KRW')),
  CONSTRAINT ck_receipts_values   CHECK (total_minor > 0 AND rate > 0),
  CONSTRAINT ck_receipts_share    CHECK (share_consent = FALSE OR (latitude IS NOT NULL AND longitude IS NOT NULL))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE receipt_items (
  id               BIGINT       NOT NULL AUTO_INCREMENT,
  receipt_id       BIGINT       NOT NULL,
  raw_name         VARCHAR(160) NOT NULL,          -- 영수증 원문 (예: DORITOS NACHO 150G)
  name_ko          VARCHAR(160) NULL,              -- 한국어 이름 (예: 도리토스 나초 150g)
  normalized_name  VARCHAR(200) NOT NULL,          -- 같은 상품 묶음 기준
  quantity         INT          NOT NULL,
  unit_minor       BIGINT       NOT NULL,
  PRIMARY KEY (id),
  KEY idx_items_receipt (receipt_id),
  KEY idx_items_normalized (normalized_name),
  CONSTRAINT fk_items_receipt FOREIGN KEY (receipt_id) REFERENCES receipts (id) ON DELETE CASCADE,
  CONSTRAINT ck_items_values CHECK (quantity BETWEEN 1 AND 999 AND unit_minor > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
