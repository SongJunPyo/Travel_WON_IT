// 확정 스키마와 가데이터의 파일 보관본입니다. DB 접속·.env 읽기·SQL 실행은 하지 않습니다.
import { createHash } from "node:crypto";
import { cp, mkdir, readFile, writeFile, access, rm } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { dirname, resolve, basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync, gunzipSync } from "node:zlib";
import {
  normalizeProduct,
  distanceMeters,
  rateUnits,
  validDate,
} from "../src/domain.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
export const TABLES = ["devices", "trips", "receipts", "receipt_items"];
const FILES = [
  "docs/db-schema-mysql.sql",
  "docs/db-design.md",
  "sample-data/README.md",
  ...TABLES.map((t) => `sample-data/${t}.csv`),
  "scripts/sample-data.mjs",
  "scripts/db-snapshot.mjs",
  "src/domain.mjs",
  "src/main/resources/application.properties",
  "src/main/resources/application-mysql.properties",
];
const digest = (data) => createHash("sha256").update(data).digest("hex");
const assert = (ok, message) => {
  if (!ok) throw new Error(message);
};
const idSet = (rows) => new Set(rows.map((r) => r.id));

// 따옴표 안의 쉼표·줄바꿈·큰따옴표를 보존합니다. 빈 칸은 NULL, ""는 빈 문자열입니다.
export function parseCsv(text) {
  const lines = [];
  let row = [],
    value = "",
    quoted = false,
    inQuote = false,
    closed = false;
  const endCell = () => {
    row.push(value === "" && !quoted ? null : value);
    value = "";
    quoted = false;
    closed = false;
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuote) {
      if (c === '"' && text[i + 1] === '"') {
        value += '"';
        i++;
      } else if (c === '"') {
        inQuote = false;
        closed = true;
      } else value += c;
    } else if (c === '"') {
      assert(!value && !closed, "CSV 따옴표 위치 오류");
      inQuote = true;
      quoted = true;
    } else if (c === ",") endCell();
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      endCell();
      lines.push(row);
      row = [];
    } else {
      assert(!closed, "CSV 닫힌 따옴표 뒤의 값 오류");
      value += c;
    }
  }
  assert(!inQuote, "CSV 따옴표가 닫히지 않았어요.");
  if (value || row.length || quoted) {
    endCell();
    lines.push(row);
  }
  const columns = lines.shift();
  assert(
    columns?.length &&
      columns.every((c) => typeof c === "string" && /^[a-z_]+$/.test(c)),
    "CSV 열 이름 오류",
  );
  assert(new Set(columns).size === columns.length, "CSV 열 이름 중복");
  return {
    columns,
    rows: lines.map((cells, index) => {
      assert(
        cells.length === columns.length,
        `CSV ${index + 2}행의 열 개수 오류`,
      );
      return Object.fromEntries(columns.map((key, n) => [key, cells[n]]));
    }),
  };
}

export function parseSchema(sql) {
  assert(
    !/^\s*(DROP|ALTER|TRUNCATE|DELETE|UPDATE|USE|INSERT|REPLACE)\b/im.test(sql),
    "기준 스키마에 변경·삭제 SQL이 있어요.",
  );
  const schema = {};
  for (const match of sql.matchAll(
    /CREATE TABLE\s+([a-z_]+)\s*\(([\s\S]*?)\) ENGINE=/g,
  )) {
    const columns = {};
    for (const line of match[2].split("\n")) {
      const c = line.match(
        /^\s+([a-z_]+)\s+(BIGINT|INT|BOOLEAN|DOUBLE|DECIMAL|VARCHAR|CHAR|DATETIME|DATE)\b(.*)/,
      );
      if (c)
        columns[c[1]] = {
          type: c[2],
          nullable: !/NOT NULL/.test(c[3]),
          defaulted: /DEFAULT|AUTO_INCREMENT/.test(c[3]),
        };
    }
    assert(!schema[match[1]], "기준 스키마의 테이블 이름 중복");
    schema[match[1]] = columns;
  }
  assert(
    Object.keys(schema).sort().join() === [...TABLES].sort().join(),
    "기준 테이블은 devices·trips·receipts·receipt_items 4개여야 해요.",
  );
  return schema;
}

export function validateData(schema, data) {
  const numeric = new Set(["BIGINT", "INT", "BOOLEAN", "DOUBLE", "DECIMAL"]);
  for (const table of TABLES) {
    const { columns, rows } = data[table];
    assert(rows.length > 0, `${table}: 가데이터가 비었어요.`);
    assert(
      columns.every((c) => schema[table][c]),
      `${table}: 스키마에 없는 CSV 열`,
    );
    for (const [column, info] of Object.entries(schema[table]))
      assert(
        columns.includes(column) || info.nullable || info.defaulted,
        `${table}.${column}: 필수 CSV 열 누락`,
      );
    assert(idSet(rows).size === rows.length, `${table}: id 중복`);
    for (const row of rows)
      for (const [column, value] of Object.entries(row)) {
        const info = schema[table][column];
        assert(
          value !== null || info.nullable,
          `${table}.${column}: NULL 불가`,
        );
        if (value === null) continue;
        if (numeric.has(info.type)) {
          const pattern = ["BIGINT", "INT", "BOOLEAN"].includes(info.type)
            ? /^-?\d+$/
            : /^-?\d+(\.\d+)?$/;
          assert(pattern.test(value), `${table}.${column}: 숫자 형식 오류`);
          if (info.type === "BOOLEAN")
            assert(
              value === "0" || value === "1",
              `${table}.${column}: 불리언 오류`,
            );
        }
      }
    assert(
      rows.every((r) => /^\d+$/.test(r.id) && BigInt(r.id) > 0n),
      `${table}: id는 양의 정수여야 해요.`,
    );
  }
  const devices = idSet(data.devices.rows),
    trips = new Map(data.trips.rows.map((r) => [r.id, r]));
  const receipts = new Map(data.receipts.rows.map((r) => [r.id, r])),
    sums = new Map();
  assert(
    data.devices.rows.every(
      (d) => d.is_sample === "1" && /^[a-f0-9]{64}$/.test(d.token_hash),
    ),
    "가데이터 기기만 보관할 수 있어요.",
  );
  assert(
    new Set(data.devices.rows.map((d) => d.token_hash)).size === devices.size,
    "기기 토큰 해시 중복",
  );
  assert(
    new Set(data.trips.rows.map((t) => t.device_id)).size === trips.size,
    "기기당 여행 1개 제약 위반",
  );
  for (const t of trips.values()) {
    assert(devices.has(t.device_id), "trips.device_id 외래키 오류");
    assert(
      validDate(t.start_date) &&
        validDate(t.end_date) &&
        t.start_date <= t.end_date,
      "여행 기간 오류",
    );
    assert(
      BigInt(t.budget_krw) >= 0n && rateUnits(t.rate) !== null,
      "여행 예산·환율 오류",
    );
  }
  for (const i of data.receipt_items.rows) {
    assert(receipts.has(i.receipt_id), "receipt_items.receipt_id 외래키 오류");
    assert(
      BigInt(i.quantity) >= 1n &&
        BigInt(i.quantity) <= 999n &&
        BigInt(i.unit_minor) > 0n,
      "품목 수량·단가 오류",
    );
    assert(
      i.normalized_name === normalizeProduct(i.raw_name),
      "상품 정규화 불일치",
    );
    sums.set(
      i.receipt_id,
      (sums.get(i.receipt_id) || 0n) +
        BigInt(i.quantity) * BigInt(i.unit_minor),
    );
  }
  const ledger = new Set(["음식", "쇼핑", "교통", "숙박", "관광", "기타"]);
  const browse = new Set([
    "식당",
    "명소",
    "화장품",
    "의류",
    "뷰티·웰니스",
    "숙박",
    "액티비티",
    "렌트",
  ]);
  const currencies = new Set(["EUR", "USD", "JPY", "THB", "KRW"]);
  for (const r of receipts.values()) {
    assert(devices.has(r.device_id), "receipts.device_id 외래키 오류");
    const t = r.trip_id === null ? null : trips.get(r.trip_id);
    assert(
      r.trip_id === null || (t && t.device_id === r.device_id),
      "영수증 여행·기기 외래키 오류",
    );
    assert(
      validDate(r.purchased_date) &&
        (!t ||
          (r.purchased_date >= t.start_date && r.purchased_date <= t.end_date)),
      "구매일·여행 기간 오류",
    );
    assert(
      BigInt(r.total_minor) > 0n && sums.get(r.id) === BigInt(r.total_minor),
      "영수증 총액과 품목 합계 불일치",
    );
    assert(
      rateUnits(r.rate) !== null && currencies.has(r.currency),
      "영수증 통화·환율 오류",
    );
    assert(
      ledger.has(r.ledger_category) &&
        (r.browse_category === null || browse.has(r.browse_category)),
      "영수증 카테고리 오류",
    );
    assert(
      (r.latitude === null && r.longitude === null) ||
        (r.latitude !== null &&
          r.longitude !== null &&
          Math.abs(Number(r.latitude)) <= 85.0511 &&
          Math.abs(Number(r.longitude)) <= 180),
      "매장 좌표 오류",
    );
    assert(
      r.share_consent === "0" || (r.latitude !== null && r.longitude !== null),
      "공유 영수증의 좌표 누락",
    );
  }
  return Object.fromEntries(TABLES.map((t) => [t, data[t].rows.length]));
}

export function seedSql(schema, data) {
  const numeric = new Set(["BIGINT", "INT", "BOOLEAN", "DOUBLE", "DECIMAL"]);
  const sql = [
    "-- 가데이터 전용. 기준 스키마로 만든 빈 복구용 DB에만 수동 실행하세요.",
    "-- DROP / DELETE / TRUNCATE / FOREIGN_KEY_CHECKS 해제를 포함하지 않습니다.",
    "SET NAMES utf8mb4;",
    "START TRANSACTION;",
  ];
  for (const table of TABLES) {
    const { columns, rows } = data[table];
    for (let start = 0; start < rows.length; start += 200) {
      const values = rows.slice(start, start + 200).map(
        (row) =>
          "(" +
          columns
            .map((c) => {
              const value = row[c];
              if (value === null) return "NULL";
              // 정수·소수를 문자열 그대로 써서 금액과 환율의 정밀도를 보존합니다.
              if (numeric.has(schema[table][c].type)) {
                assert(/^-?\d+(\.\d+)?$/.test(value), "SQL 숫자 형식 오류");
                return value;
              }
              // SQL mode·따옴표·역슬래시·줄바꿈과 무관하게 UTF-8 텍스트를 보존합니다.
              return `CONVERT(X'${Buffer.from(value, "utf8").toString("hex")}' USING utf8mb4)`;
            })
            .join(",") +
          ")",
      );
      sql.push(
        `INSERT INTO \`${table}\` (${columns.map((c) => `\`${c}\``).join(",")}) VALUES\n${values.join(",\n")};`,
      );
    }
  }
  sql.push("COMMIT;", "");
  return sql.join("\n");
}

async function load(root) {
  const schema = parseSchema(
    await readFile(join(root, "docs/db-schema-mysql.sql"), "utf8"),
  );
  const data = Object.fromEntries(
    await Promise.all(
      TABLES.map(async (table) => [
        table,
        parseCsv(
          await readFile(join(root, `sample-data/${table}.csv`), "utf8"),
        ),
      ]),
    ),
  );
  return { schema, data, counts: validateData(schema, data) };
}
const exists = async (p) => {
  try {
    await access(p);
    return true;
  } catch (e) {
    if (e.code === "ENOENT") return false;
    throw e;
  }
};
const git = (root, args) => {
  try {
    return execFileSync("git", args, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
};
const timestamp = () =>
  new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  })
    .format(new Date())
    .replace(" ", "_")
    .replaceAll(":", "");

export async function createSnapshot({
  projectRoot = ROOT,
  label = `${timestamp()}-four-tables`,
  externalRoot = resolve(
    projectRoot,
    "..",
    `${basename(projectRoot)}-db-backups`,
  ),
} = {}) {
  assert(
    /^[A-Za-z0-9][A-Za-z0-9_-]{0,90}$/.test(label),
    "보관 이름에는 영문·숫자·하이픈·밑줄만 사용할 수 있어요.",
  );
  const target = join(projectRoot, "db-backups/snapshots", label),
    external = join(externalRoot, label);
  assert(
    !(await exists(target)) && !(await exists(external)),
    "같은 이름의 보관본이 있어요. 기존 보관본을 덮어쓰지 않습니다.",
  );
  // 검증 실패 시 폴더를 만들지 않습니다.
  const { schema, data, counts } = await load(projectRoot);
  let targetCreated = false,
    externalCreated = false;
  try {
    await mkdir(dirname(target), { recursive: true });
    await mkdir(target);
    targetCreated = true;
    for (const file of FILES) {
      await mkdir(dirname(join(target, file)), { recursive: true });
      await cp(join(projectRoot, file), join(target, file));
    }
    await mkdir(join(target, "restore"));
    await writeFile(
      join(target, "restore/sample-data.sql.gz"),
      gzipSync(seedSql(schema, data), { level: 9 }),
    );
    const captured = await load(target);
    assert(
      JSON.stringify(captured.counts) === JSON.stringify(counts),
      "보관 중 원본 데이터가 바뀌었어요.",
    );
    assert(
      gunzipSync(
        await readFile(join(target, "restore/sample-data.sql.gz")),
      ).toString() === seedSql(captured.schema, captured.data),
      "보관 중 데이터가 바뀌었어요.",
    );
    const files = {};
    for (const file of [...FILES, "restore/sample-data.sql.gz"]) {
      const bytes = await readFile(join(target, file));
      files[file] = { bytes: bytes.length, sha256: digest(bytes) };
    }
    const manifest = {
      formatVersion: 1,
      kind: "repository-schema-and-synthetic-data",
      liveDatabaseDump: false,
      label,
      createdAt: new Date().toISOString(),
      timezone: "Asia/Seoul",
      sourceBranch: git(projectRoot, ["branch", "--show-current"]),
      sourceCommit: git(projectRoot, ["rev-parse", "HEAD"]),
      workingTreeDirty: !!git(projectRoot, ["status", "--porcelain"]),
      page2: {
        center: { latitude: 35.6896, longitude: 139.7006 },
        radiusMeters: 3000,
        currency: "JPY",
        visibleReceipts: data.receipts.rows.filter(
          (r) =>
            r.share_consent === "1" &&
            r.currency === "JPY" &&
            r.latitude !== null &&
            distanceMeters(
              { latitude: 35.6896, longitude: 139.7006 },
              { latitude: Number(r.latitude), longitude: Number(r.longitude) },
            ) <= 3000,
        ).length,
        distinctNormalizedProducts: new Set(
          data.receipt_items.rows.map((i) => i.normalized_name),
        ).size,
      },
      tables: Object.fromEntries(
        TABLES.map((t) => [
          t,
          { rows: counts[t], csvColumns: data[t].columns, schema: schema[t] },
        ]),
      ),
      sourceSchemaNotes: [
        "CSV에 없는 nullable 열(store_name_ko 등)은 복구 시 기본값 NULL입니다.",
        "실제 DB의 추가 영수증·AUTO_INCREMENT·트리거·권한은 별도 라이브 덤프가 필요합니다.",
      ],
      files,
    };
    await writeFile(
      join(target, "manifest.json"),
      JSON.stringify(manifest, null, 2) + "\n",
    );
    await verifySnapshot(target);
    await mkdir(externalRoot, { recursive: true });
    await mkdir(external);
    externalCreated = true;
    for (const file of [
      ...FILES,
      "restore/sample-data.sql.gz",
      "manifest.json",
    ]) {
      await mkdir(dirname(join(external, file)), { recursive: true });
      await cp(join(target, file), join(external, file), {
        force: false,
        errorOnExist: true,
      });
    }
    await verifySnapshot(external);
    return { target, external, counts };
  } catch (error) {
    if (targetCreated) await rm(target, { recursive: true, force: true });
    if (externalCreated) await rm(external, { recursive: true, force: true });
    throw error;
  }
}

export async function verifySnapshot(target) {
  const root = resolve(target),
    manifest = JSON.parse(await readFile(join(root, "manifest.json"), "utf8"));
  assert(
    manifest.formatVersion === 1 &&
      manifest.kind === "repository-schema-and-synthetic-data" &&
      manifest.liveDatabaseDump === false,
    "지원하지 않는 보관본 형식",
  );
  for (const file of [...FILES, "restore/sample-data.sql.gz"])
    assert(manifest.files?.[file], `필수 보관 파일 누락: ${file}`);
  for (const [file, expected] of Object.entries(manifest.files)) {
    assert(
      !file.split(/[\\/]/).includes("..") &&
        !file.startsWith("/") &&
        !file.includes("\\"),
      "보관 파일 경로 오류",
    );
    const bytes = await readFile(join(root, file));
    assert(
      bytes.length === expected.bytes && digest(bytes) === expected.sha256,
      `무결성 검사 실패: ${file}`,
    );
  }
  const { schema, data, counts } = await load(root);
  assert(
    Object.keys(manifest.tables).sort().join() === [...TABLES].sort().join(),
    "보관본 테이블 목록 오류",
  );
  for (const table of TABLES)
    assert(
      counts[table] === manifest.tables[table].rows,
      `${table} 행 수 불일치`,
    );
  assert(
    gunzipSync(
      await readFile(join(root, "restore/sample-data.sql.gz")),
    ).toString() === seedSql(schema, data),
    "재적재 SQL과 CSV가 달라요.",
  );
  return counts;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const [command = "create", value] = process.argv.slice(2);
    if (command === "verify") {
      assert(value, "검증할 보관본 폴더를 지정해 주세요.");
      console.log(
        JSON.stringify(
          {
            verified: resolve(value),
            counts: await verifySnapshot(value),
            databaseConnected: false,
          },
          null,
          2,
        ),
      );
    } else if (command === "create") {
      console.log(
        JSON.stringify(
          {
            ...(await createSnapshot({ label: value })),
            databaseConnected: false,
          },
          null,
          2,
        ),
      );
    } else
      throw new Error(
        "사용법: node scripts/db-snapshot.mjs create [이름] | verify <보관본 폴더>",
      );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
