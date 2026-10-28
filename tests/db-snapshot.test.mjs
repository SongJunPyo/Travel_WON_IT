import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  cp,
  rm,
  access,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseCsv,
  parseSchema,
  validateData,
  seedSql,
  createSnapshot,
  verifySnapshot,
  TABLES,
} from "../scripts/db-snapshot.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const schemaText = await readFile(
  join(root, "docs/db-schema-mysql.sql"),
  "utf8",
);
const schema = parseSchema(schemaText);
const fixture = () => {
  const rows = {
    devices: [
      {
        id: "1",
        token_hash: "a".repeat(64),
        is_sample: "1",
        created_at: "2026-10-10 09:00:00.123456",
      },
    ],
    trips: [
      {
        id: "1",
        device_id: "1",
        city: "도쿄",
        country: "일본",
        start_date: "2026-10-10",
        end_date: "2026-10-15",
        budget_krw: "1000000",
        currency: "JPY",
        rate: "9.3277",
      },
    ],
    receipts: [
      {
        id: "1",
        device_id: "1",
        trip_id: "1",
        store_name: "테스트 매장",
        store_address: "가상 주소",
        latitude: "35.6896",
        longitude: "139.7006",
        ledger_category: "음식",
        browse_category: null,
        purchased_date: "2026-10-10",
        currency: "JPY",
        total_minor: "360",
        rate: "9.3277",
        share_consent: "1",
        created_at: "2026-10-10 12:00:00.123456",
      },
    ],
    receipt_items: [
      {
        id: "1",
        receipt_id: "1",
        raw_name: "COKE 500ml",
        name_ko: "코카콜라 500ml",
        normalized_name: "코카콜라500ml",
        quantity: "2",
        unit_minor: "180",
      },
    ],
  };
  return Object.fromEntries(
    TABLES.map((t) => [t, { columns: Object.keys(rows[t][0]), rows: rows[t] }]),
  );
};
const csv = ({ columns, rows }) =>
  [
    columns.join(","),
    ...rows.map((row) =>
      columns
        .map((c) => {
          if (row[c] === null) return "";
          const v = row[c];
          return /[",\r\n]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v;
        })
        .join(","),
    ),
  ].join("\n") + "\n";

test("백업 CSV는 쉼표·줄바꿈·따옴표·NULL과 빈 문자열을 구분한다", () => {
  const result = parseCsv(
    'name,note,empty,missing\r\n"매장, A","첫 줄\n""둘째 줄""", "",\r\n'.replace(
      ', ""',
      ',""',
    ),
  );
  assert.deepEqual(result.rows[0], {
    name: "매장, A",
    note: '첫 줄\n"둘째 줄"',
    empty: "",
    missing: null,
  });
  assert.throws(() => parseCsv('a,b\n"닫히지 않은 값'), /닫히지/);
  assert.throws(() => parseCsv("a,b\n1,2,3"), /열 개수/);
});
test("4개 확정 테이블만 보관하고 추가 테이블·삭제 SQL을 거부한다", () => {
  assert.equal(Object.keys(schema).length, 4);
  assert.throws(
    () =>
      parseSchema(
        schemaText +
          "\nCREATE TABLE products (\n id BIGINT NOT NULL\n) ENGINE=InnoDB;",
      ),
    /4개/,
  );
  assert.throws(
    () => parseSchema("DROP TABLE receipts;\n" + schemaText),
    /변경·삭제/,
  );
});
test("복구 전 외래키·기기당 여행·영수증 합계·공유 좌표를 확인한다", () => {
  assert.deepEqual(validateData(schema, fixture()), {
    devices: 1,
    trips: 1,
    receipts: 1,
    receipt_items: 1,
  });
  let data = fixture();
  data.receipt_items.rows[0].receipt_id = "999";
  assert.throws(() => validateData(schema, data), /외래키/);
  data = fixture();
  data.receipts.rows[0].total_minor = "999";
  assert.throws(() => validateData(schema, data), /합계/);
  data = fixture();
  data.receipts.rows[0].latitude = null;
  data.receipts.rows[0].longitude = null;
  assert.throws(() => validateData(schema, data), /좌표/);
  data = fixture();
  data.trips.rows.push({ ...data.trips.rows[0], id: "2" });
  assert.throws(() => validateData(schema, data), /기기당 여행/);
});
test("가데이터 외 기록과 잘못된 금액·정규화를 거부한다", () => {
  let data = fixture();
  data.devices.rows[0].is_sample = "0";
  assert.throws(() => validateData(schema, data), /가데이터 기기/);
  data = fixture();
  data.receipt_items.rows[0].unit_minor = "180.5";
  assert.throws(() => validateData(schema, data), /숫자 형식/);
  data = fixture();
  data.receipt_items.rows[0].normalized_name = "다른 상품";
  assert.throws(() => validateData(schema, data), /정규화/);
});
test("재적재 SQL은 텍스트를 안전하게 인코딩하고 금액·소수 환율을 보존한다", () => {
  const data = fixture();
  const value = "가상 매장'); DROP TABLE receipts;--\\\n日本語";
  data.receipts.rows[0].store_name = value;
  const sql = seedSql(schema, data);
  assert.ok(
    sql.indexOf("INSERT INTO `devices`") < sql.indexOf("INSERT INTO `trips`"),
  );
  assert.ok(sql.includes(Buffer.from(value).toString("hex")));
  assert.equal(sql.includes(value), false);
  assert.ok(sql.includes(",9.3277"));
  assert.ok(sql.includes(",2,180)"));
  assert.equal(/^\s*(DROP|DELETE|TRUNCATE|ALTER)\b/im.test(sql), false);
  assert.equal(sql.includes("FOREIGN_KEY_CHECKS="), false);
});
test("현재 가데이터 전체의 관계·합계와 4개 테이블을 검증한다", async () => {
  const data = Object.fromEntries(
    await Promise.all(
      TABLES.map(async (t) => [
        t,
        parseCsv(await readFile(join(root, `sample-data/${t}.csv`), "utf8")),
      ]),
    ),
  );
  const counts = validateData(schema, data);
  assert.ok(Object.values(counts).every((n) => n > 0));
});
test("보관본은 프로젝트 밖에도 복사되고 비밀 파일을 제외하며 변조·덮어쓰기를 감지한다", async () => {
  const temp = await mkdtemp(join(tmpdir(), "wonhae-backup-")),
    project = join(temp, "project"),
    external = join(temp, "outside");
  try {
    const files = [
      "docs/db-schema-mysql.sql",
      "docs/db-design.md",
      "scripts/sample-data.mjs",
      "scripts/db-snapshot.mjs",
      "src/domain.mjs",
      "src/main/resources/application.properties",
      "src/main/resources/application-mysql.properties",
    ];
    for (const file of files) {
      await mkdir(dirname(join(project, file)), { recursive: true });
      await cp(join(root, file), join(project, file));
    }
    await mkdir(join(project, "sample-data"));
    const data = fixture();
    for (const t of TABLES)
      await writeFile(join(project, `sample-data/${t}.csv`), csv(data[t]));
    await writeFile(
      join(project, "sample-data/README.md"),
      "테스트용 가데이터",
    );
    await writeFile(
      join(project, ".env"),
      "DB_PASSWORD=fixture-private-value\n",
    );
    const result = await createSnapshot({
      projectRoot: project,
      externalRoot: external,
      label: "test-four-tables",
    });
    assert.deepEqual(await verifySnapshot(result.target), result.counts);
    assert.deepEqual(await verifySnapshot(result.external), result.counts);
    assert.equal(
      await readFile(join(result.target, "manifest.json"), "utf8").then((v) =>
        v.includes("fixture-private-value"),
      ),
      false,
    );
    await assert.rejects(access(join(result.target, ".env")));
    await assert.rejects(
      createSnapshot({
        projectRoot: project,
        externalRoot: external,
        label: "test-four-tables",
      }),
      /덮어쓰지/,
    );
    await writeFile(join(result.target, "sample-data/devices.csv"), "changed");
    await assert.rejects(verifySnapshot(result.target), /무결성/);
    assert.deepEqual(await verifySnapshot(result.external), result.counts);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
