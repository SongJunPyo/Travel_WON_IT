-- 읽기 전용 점검 SQL. 현재 선택한 DB가 맞는지 첫 결과부터 확인하세요.
-- 이 파일은 테이블을 만들거나 바꾸지 않습니다. 실제 DB에 자동 실행하지 않습니다.
SELECT DATABASE() AS selected_database, VERSION() AS server_version;

-- 확정 구조의 BASE TABLE은 4개입니다. VIEW는 별도로 표시됩니다.
SELECT TABLE_NAME, TABLE_TYPE, ENGINE
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
ORDER BY TABLE_NAME;

-- 추가 테이블: 결과가 비어 있어야 합니다.
SELECT TABLE_NAME AS unexpected_table
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE'
  AND TABLE_NAME NOT IN ('devices', 'trips', 'receipts', 'receipt_items');

-- 빠진 테이블: 결과가 비어 있어야 합니다.
SELECT expected.table_name AS missing_table
FROM (SELECT 'devices' AS table_name UNION ALL SELECT 'trips'
      UNION ALL SELECT 'receipts' UNION ALL SELECT 'receipt_items') expected
LEFT JOIN information_schema.TABLES actual
  ON actual.TABLE_SCHEMA = DATABASE() AND actual.TABLE_NAME = expected.table_name
WHERE actual.TABLE_NAME IS NULL;

-- 테이블 개수가 4개여도 컬럼·타입·NULL·기본값이 달라질 수 있으므로 함께 비교합니다.
SELECT TABLE_NAME, ORDINAL_POSITION, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, EXTRA
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME IN ('devices', 'trips', 'receipts', 'receipt_items')
ORDER BY TABLE_NAME, ORDINAL_POSITION;

SELECT TABLE_NAME, CONSTRAINT_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
FROM information_schema.KEY_COLUMN_USAGE
WHERE TABLE_SCHEMA = DATABASE()
ORDER BY TABLE_NAME, CONSTRAINT_NAME, ORDINAL_POSITION;

-- 위에서 4개 테이블이 존재함을 확인한 뒤에만 아래 구문을 실행하세요.
SHOW CREATE TABLE devices;
SHOW CREATE TABLE trips;
SHOW CREATE TABLE receipts;
SHOW CREATE TABLE receipt_items;

-- 샘플 기준은 300 / 300 / 8152 / 17262입니다.
-- 사용자가 영수증을 추가한 DB의 전체 행 수는 기준보다 많을 수 있습니다.
SELECT 'devices' AS table_name, COUNT(*) AS total_rows FROM devices
UNION ALL SELECT 'trips', COUNT(*) FROM trips
UNION ALL SELECT 'receipts', COUNT(*) FROM receipts
UNION ALL SELECT 'receipt_items', COUNT(*) FROM receipt_items;

SELECT 'devices' AS table_name, COUNT(*) AS sample_rows FROM devices WHERE is_sample = TRUE
UNION ALL SELECT 'trips', COUNT(*) FROM trips t JOIN devices d ON d.id = t.device_id WHERE d.is_sample = TRUE
UNION ALL SELECT 'receipts', COUNT(*) FROM receipts r JOIN devices d ON d.id = r.device_id WHERE d.is_sample = TRUE
UNION ALL SELECT 'receipt_items', COUNT(*) FROM receipt_items i JOIN receipts r ON r.id = i.receipt_id
  JOIN devices d ON d.id = r.device_id WHERE d.is_sample = TRUE;
