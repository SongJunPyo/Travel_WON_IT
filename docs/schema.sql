-- =========================================================
-- 여행WON해 MySQL 스키마 (MySQL 8.0+, utf8mb4)
-- 서버는 JPA(ddl-auto=update)로 같은 구조를 자동 생성합니다.
-- 이 파일은 구조 확인 · 수동 생성용입니다. 금액은 최소 통화 단위 정수(EUR 1.80 → 180)입니다.
-- =========================================================
CREATE DATABASE IF NOT EXISTS travel_wonhae DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE travel_wonhae;

-- 사용자: 로그인이 없으므로 기기 토큰의 SHA-256 해시로만 구분 (토큰 원문은 저장하지 않음)
CREATE TABLE devices (
  id          BIGINT      NOT NULL AUTO_INCREMENT PRIMARY KEY,
  token_hash  VARCHAR(64) NOT NULL UNIQUE,
  created_at  DATETIME(6) NOT NULL
) ENGINE=InnoDB;

-- 카테고리: 서버 시작 시 1~6으로 채움
CREATE TABLE categories (
  id    INT         NOT NULL PRIMARY KEY,
  name  VARCHAR(20) NOT NULL UNIQUE
) ENGINE=InnoDB;
INSERT IGNORE INTO categories VALUES (1,'음식'),(2,'쇼핑'),(3,'교통'),(4,'숙박'),(5,'관광'),(6,'기타');

-- 여행: 기기마다 1개 (예산 · 평균 비교 기준)
CREATE TABLE trips (
  id          BIGINT      NOT NULL AUTO_INCREMENT PRIMARY KEY,
  device_id   BIGINT      NOT NULL UNIQUE,
  country     VARCHAR(50) NOT NULL,
  city        VARCHAR(50) NOT NULL,
  start_date  DATE        NOT NULL,
  end_date    DATE        NOT NULL,
  budget_krw  BIGINT      NOT NULL,
  currency    VARCHAR(3)  NOT NULL,
  rate        DECIMAL(14,4) NOT NULL,                    -- 적용 환율 (1 현지통화 = rate원, 소수 4자리까지. 예: JPY 8.3983)
  FOREIGN KEY (device_id) REFERENCES devices(id)
) ENGINE=InnoDB;

-- 가게 (가게명 / 위치 / 면세여부): 같은 가게명·주소는 한 행
CREATE TABLE stores (
  id           BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name         VARCHAR(120) NOT NULL,
  address      VARCHAR(250) NOT NULL,
  latitude     DOUBLE       NULL,
  longitude    DOUBLE       NULL,
  is_tax_free  BIT(1)       NOT NULL DEFAULT b'0',
  UNIQUE KEY uq_store (name, address),
  KEY idx_store_geo (latitude, longitude)
) ENGINE=InnoDB;

-- 상품 (정규화된 품목명 / 카테고리): 'COKE 0.5L'과 '코카콜라 500ml'은 같은 상품
CREATE TABLE products (
  id               BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
  normalized_name  VARCHAR(200) NOT NULL UNIQUE,
  name             VARCHAR(160) NOT NULL,
  category_id      INT          NOT NULL,
  FOREIGN KEY (category_id) REFERENCES categories(id)
) ENGINE=InnoDB;

-- 가게-상품 (가격): 공유 영수증에서 계산한 매장별 최근 구매가격
CREATE TABLE store_products (
  id                   BIGINT     NOT NULL AUTO_INCREMENT PRIMARY KEY,
  store_id             BIGINT     NOT NULL,
  product_id           BIGINT     NOT NULL,
  currency             VARCHAR(3) NOT NULL,
  latest_unit_minor    BIGINT     NOT NULL,
  last_purchased_date  DATE       NOT NULL,
  purchase_count       INT        NOT NULL,
  UNIQUE KEY uq_store_product (store_id, product_id, currency),
  FOREIGN KEY (store_id)   REFERENCES stores(id),
  FOREIGN KEY (product_id) REFERENCES products(id)
) ENGINE=InnoDB;

-- 영수증 (헤더): client_id는 앱이 만든 영수증 id
CREATE TABLE receipts (
  id              BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
  device_id       BIGINT       NOT NULL,
  trip_id         BIGINT       NULL,
  store_id        BIGINT       NOT NULL,
  category_id     INT          NOT NULL,
  client_id       VARCHAR(150) NOT NULL,
  purchased_date  DATE         NOT NULL,
  currency        VARCHAR(3)   NOT NULL,
  total_minor     BIGINT       NOT NULL,
  rate            DECIMAL(14,4) NOT NULL,                -- 적용 환율 (소수 4자리까지)
  total_krw       BIGINT       NOT NULL,                 -- total_minor × rate를 끝까지 계산한 뒤 원 단위로 사사오입
  share_consent   BIT(1)       NOT NULL,                 -- 가격 비교 공유 여부 (동의 절차 없이 항상 demo의 반대)
  demo            BIT(1)       NOT NULL,                 -- 시연 기록은 공유하지 않음
  latitude        DOUBLE       NULL,
  longitude       DOUBLE       NULL,
  recorded_at     VARCHAR(35)  NOT NULL,
  UNIQUE KEY uq_receipt_client (device_id, client_id),
  KEY idx_receipt_share (share_consent, demo),
  FOREIGN KEY (device_id)   REFERENCES devices(id),
  FOREIGN KEY (trip_id)     REFERENCES trips(id),
  FOREIGN KEY (store_id)    REFERENCES stores(id),
  FOREIGN KEY (category_id) REFERENCES categories(id)
) ENGINE=InnoDB;

-- 영수증 품목: raw_name은 입력 그대로, product_id는 정규화로 연결한 상품
CREATE TABLE receipt_items (
  id          BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
  receipt_id  BIGINT       NOT NULL,
  product_id  BIGINT       NULL,
  line_no     INT          NOT NULL,
  raw_name    VARCHAR(160) NOT NULL,                     -- 영수증 원어 그대로
  name_ko     VARCHAR(160) NULL,                         -- 한국어 번역 (상품 정규화는 이 이름 우선)
  quantity    INT          NOT NULL,
  unit_minor  BIGINT       NOT NULL,
  line_minor  BIGINT       NOT NULL,
  KEY idx_item_product (product_id),
  FOREIGN KEY (receipt_id) REFERENCES receipts(id),
  FOREIGN KEY (product_id) REFERENCES products(id)
) ENGINE=InnoDB;

-- 사진 인식 이력: 사진 · 카드번호는 저장하지 않음
CREATE TABLE ocr_history (
  id             BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
  requested_at   DATETIME(6)  NOT NULL,
  model          VARCHAR(50)  NOT NULL,
  file_type      VARCHAR(50)  NULL,
  file_size      BIGINT       NULL,
  result         VARCHAR(30)  NOT NULL,                  -- OK · INVALID_FILE · OCR_FAILED · OCR_UNAVAILABLE
  store          VARCHAR(120) NULL,
  store_address  VARCHAR(250) NULL,
  purchase_date  VARCHAR(10)  NULL,
  currency       VARCHAR(3)   NULL,
  total_minor    BIGINT       NULL,
  item_count     INT          NULL
) ENGINE=InnoDB;

-- =========================================================
-- 기존 DB 변경 (2026-10-27, 소수 환율): 환율이 BIGINT로 만들어진 DB에서 한 번만 실행합니다.
-- ddl-auto=update는 컬럼 형식을 바꾸지 않아, 실행하지 않으면 8.3983 같은 환율이 정수로 저장됩니다.
-- 기존 정수 환율 값은 그대로 유지됩니다(1600 → 1600.0000).
-- =========================================================
-- ALTER TABLE trips    MODIFY rate DECIMAL(14,4) NOT NULL;
-- ALTER TABLE receipts MODIFY rate DECIMAL(14,4) NOT NULL;
