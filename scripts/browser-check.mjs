import http from "node:http";
import assert from "node:assert/strict";
import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { extname, resolve, join } from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../dist/", import.meta.url));
const folder = await mkdtemp(join(tmpdir(), "wonhae-browser-"));
const screenshotFolder =
  process.env.SCREENSHOT_DIR ||
  fileURLToPath(new URL("../docs/screenshots/", import.meta.url));
const { mkdir } = await import("node:fs/promises");
await mkdir(screenshotFolder, { recursive: true });
let chrome, ws, staticServer, provider, javaProcess;
const javaLogs = [];
let ocrRequests = 0,
  rankRequests = 0,
  insightRequests = 0;
const pending = new Map(),
  delayedPriceRequests = [],
  errors = [];
let seq = 0,
  checks = 0;
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
// Claude가 돌려주는 형식(금액은 소수 문자열). 서버가 최소 단위(180)로 바꿔 앱에 줍니다.
const sampleOcr = {
  store: "テスト写真店",
  storeKo: "테스트 사진 매장",
  address: "도쿄 신주쿠구 테스트 주소 1-1",
  date: "2026-10-27",
  currency: "JPY",
  category: "음식",
  total: "320",
  items: [
    {
      name: "DORITOS ナチョチーズ 60G",
      nameKo: "도리토스 나초치즈 60g",
      quantity: 2,
      unitPrice: "160",
    },
  ],
};
// PAGE 2 확인용: 다른 여행자의 공유 영수증입니다(신주쿠역 근처 가상 매장, 오사카 1곳은 반경 밖).
const seedReceipt = (
  id,
  store,
  date,
  browseCategory,
  name,
  nameKo,
  unitMinor,
  latitude,
  longitude,
) => ({
  id,
  store,
  address: `${store} (가상 주소)`,
  location: { latitude, longitude },
  category: browseCategory === "식당" ? "음식" : "쇼핑",
  browseCategory,
  date,
  currency: "JPY",
  rate: 9.24,
  totalMinor: unitMinor,
  shareConsent: true,
  demo: false,
  recordedAt: `${date}T10:00:00Z`,
  items: [{ name, nameKo, quantity: 1, unitMinor }],
});
const doritos = ["DORITOS ナチョチーズ 60G", "도리토스 나초치즈 60g"],
  hadaLabo = ["肌ラボ 極潤 ヒアルロン液 170ML", "하다라보 고쿠쥰 로션 170ml"];
const seedReceipts = [
  seedReceipt(
    "s1",
    "데일리마트 A",
    "2026-10-27",
    null,
    ...doritos,
    158,
    35.6905,
    139.701,
  ),
  seedReceipt(
    "s2",
    "산고 스토어 B",
    "2026-10-26",
    null,
    ...doritos,
    148,
    35.693,
    139.704,
  ),
  seedReceipt(
    "s3",
    "모닝마트 C",
    "2026-10-25",
    null,
    ...doritos,
    168,
    35.688,
    139.699,
  ),
  seedReceipt(
    "s4",
    "오사카 매장",
    "2026-10-27",
    null,
    ...doritos,
    100,
    34.7025,
    135.4959,
  ),
  seedReceipt(
    "s5",
    "웰케어 드럭 A",
    "2026-10-27",
    "화장품",
    ...hadaLabo,
    1078,
    35.6915,
    139.703,
  ),
  seedReceipt(
    "s6",
    "하나 드럭 B",
    "2026-10-26",
    "화장품",
    ...hadaLabo,
    998,
    35.695,
    139.702,
  ),
  ...["2026-10-24", "2026-10-25", "2026-10-26"].map((date, i) =>
    seedReceipt(
      `s7-${i}`,
      "라멘 소라 A",
      date,
      "식당",
      "醤油ラーメン",
      "쇼유 라멘",
      950,
      35.692,
      139.695,
    ),
  ),
  seedReceipt(
    "s8",
    "규동 미나토 B",
    "2026-10-24",
    "식당",
    "牛丼 並盛",
    "규동 보통",
    468,
    35.701,
    139.7,
  ),
  ...["2026-10-26", "2026-10-27"].map((date, i) =>
    seedReceipt(
      `s9-${i}`,
      "카페 모쿠 C",
      date,
      "식당",
      "カフェラテ",
      "카페라테",
      580,
      35.683,
      139.702,
    ),
  ),
  // '더 보기' 확인용: 관광 카테고리 매장 7곳.
  ...Array.from({ length: 7 }, (_, i) => ({
    ...seedReceipt(
      `s10-${i}`,
      `전망대 ${i + 1}`,
      "2026-10-26",
      null,
      "展望台 入場券",
      "전망대 입장권",
      1000 + i * 100,
      35.69 + i * 0.001,
      139.7,
    ),
    category: "관광",
  })),
];
// 8787을 다른 서버가 쓰고 있으면 API_PORT로 바꿉니다. 웹 빌드도 EXPO_PUBLIC_API_URL로 같은 주소를 써야 합니다.
const apiPort = process.env.API_PORT || "8787";
const api = `http://localhost:${apiPort}`;
const nearPrices = async (q) =>
  (
    await (
      await fetch(
        `${api}/prices?currency=JPY&latitude=35.6896&longitude=139.7006&q=${encodeURIComponent(q)}`,
      )
    ).json()
  ).records;
try {
  staticServer = http.createServer(async (req, res) => {
    try {
      const pathname = decodeURIComponent(
        new URL(req.url, "http://localhost").pathname,
      );
      const path = resolve(
        root,
        "." + (pathname === "/" ? "/index.html" : pathname),
      );
      if (!path.startsWith(root)) {
        res.writeHead(403).end();
        return;
      }
      const body = await readFile(path);
      res.setHeader(
        "Content-Type",
        {
          ".html": "text/html; charset=utf-8",
          ".js": "text/javascript; charset=utf-8",
          ".png": "image/png",
          ".ico": "image/x-icon",
        }[extname(path)] || "application/octet-stream",
      );
      res.end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise((r) => staticServer.listen(0, "127.0.0.1", r));
  const origin = `http://localhost:${staticServer.address().port}`;
  provider = http.createServer(async (req, res) => {
    // 한국수출입은행 현재환율 API 대체 응답(1엔 = 9.24원). 실제 API는 부르지 않습니다.
    if (req.url.startsWith("/exchangeJSON")) {
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify([
          { result: 1, cur_unit: "JPY(100)", deal_bas_r: "924" },
          { result: 1, cur_unit: "EUR", deal_bas_r: "1,600" },
          { result: 1, cur_unit: "USD", deal_bas_r: "1,400" },
          { result: 1, cur_unit: "THB", deal_bas_r: "40" },
        ]),
      );
      return;
    }
    let raw = "";
    for await (const chunk of req) raw += chunk;
    // Anthropic Messages API 대체 응답. 사진(image 블록)이 오면 영수증 인식, 아니면 소비 인사이트나 추천순 재정렬입니다.
    const payload = JSON.parse(raw);
    const content = payload.messages[0].content;
    const blocks = Array.isArray(content)
      ? content
      : [{ type: "text", text: content }];
    const reply = (id, text) => {
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          id,
          type: "message",
          role: "assistant",
          model: payload.model,
          content: [{ type: "text", text }],
          stop_reason: "end_turn",
          usage: { input_tokens: 1, output_tokens: 1 },
        }),
      );
    };
    if (!blocks.some((block) => block.type === "image")) {
      const text = blocks.map((block) => block.text || "").join("\n");
      // 소비 인사이트: 서버가 계산한 숫자(facts)가 왔는지 확인하고, 숫자 없는 문장으로 답합니다.
      if (text.includes('"dailyAverage"')) {
        assert.ok(text.includes('"usedPct"') && !text.includes("데일리마트"));
        insightRequests++;
        reply(
          "msg_browser_insight",
          JSON.stringify({
            headline: "테스트 AI 인사이트",
            body: "테스트 AI 분석 문장이에요.",
            tip: null,
          }),
        );
        return;
      }
      // 추천순: 받은 후보 순서에서 앞의 두 개만 바꾸고 이유를 붙여, AI 순서가 화면에 반영되는지 확인합니다.
      const ids = [...text.matchAll(/"id":"([^"]+)"/g)].map((m) => m[1]);
      assert.ok(ids.length >= 2 && text.includes("budgetLeftPct"));
      [ids[0], ids[1]] = [ids[1], ids[0]];
      rankRequests++;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          id: "msg_browser_rank",
          type: "message",
          role: "assistant",
          model: payload.model,
          content: [
            {
              type: "text",
              text: JSON.stringify({
                picks: ids.map((id, i) => ({
                  id,
                  reason: `테스트 AI 이유 ${i + 1}`,
                })),
              }),
            },
          ],
          stop_reason: "end_turn",
          usage: { input_tokens: 1, output_tokens: 1 },
        }),
      );
      return;
    }
    ocrRequests++;
    // 분석을 기다리는 로딩 화면을 확인할 수 있게 잠시 늦게 응답합니다.
    await pause(1500);
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        id: "msg_browser_check",
        type: "message",
        role: "assistant",
        model: payload.model,
        content: [{ type: "text", text: JSON.stringify(sampleOcr) }],
        stop_reason: "end_turn",
        usage: { input_tokens: 1, output_tokens: 1 },
      }),
    );
  });
  await new Promise((r) => provider.listen(0, "127.0.0.1", r));
  javaProcess = spawn(
    "java",
    [
      "-jar",
      "build/libs/travel-wonhae-1.0.0.jar",
      `--server.port=${apiPort}`,
      // 검증 중에는 H2 메모리 DB를 씁니다(로컬 파일·MySQL을 건드리지 않음).
      "--spring.datasource.url=jdbc:h2:mem:browser-check",
      "--ANTHROPIC_API_KEY=test-only",
      `--app.allowed-origins=${origin}`,
      `--spring.ai.anthropic.base-url=http://127.0.0.1:${provider.address().port}`,
      // 한국수출입은행 API 대신 위 가짜 환율 응답을 씁니다(키는 시험용).
      "--KOREAEXIM_API_KEY=test-only",
      `--app.exchange-rate.url=http://127.0.0.1:${provider.address().port}/exchangeJSON`,
    ],
    {
      cwd: fileURLToPath(new URL("../", import.meta.url)),
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  javaProcess.stdout.on("data", (data) => javaLogs.push(data.toString()));
  javaProcess.stderr.on("data", (data) => javaLogs.push(data.toString()));
  let apiReady = false;
  // 느린 PC에서는 서버가 뜨는 데 20초 넘게 걸려, 최대 약 60초까지 기다립니다.
  for (let i = 0; i < 600; i++) {
    if (javaProcess.exitCode !== null) throw new Error(javaLogs.join(""));
    try {
      apiReady = (await (await fetch(`${api}/health`)).json()).ok;
      if (apiReady) break;
    } catch {}
    await pause(100);
  }
  if (!apiReady) throw new Error("Spring API 시작 실패\n" + javaLogs.join(""));
  const seeded = await fetch(`${api}/ledger`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + "s".repeat(64),
    },
    body: JSON.stringify({
      version: 1,
      trip: {
        city: "도쿄",
        country: "일본",
        start: "2026-10-24",
        end: "2026-10-30",
        budget: 1000000,
        currency: "JPY",
        rate: 9.24,
      },
      receipts: seedReceipts,
    }),
  });
  assert.equal(seeded.status, 200, "다른 여행자 공유 영수증 서버 저장");
  chrome = spawn(
    process.env.CHROME_PATH ||
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    [
      "--headless=new",
      "--no-first-run",
      "--no-default-browser-check",
      "--remote-debugging-port=0",
      "--user-data-dir=" + folder,
      "about:blank",
    ],
    { stdio: "ignore" },
  );
  let devPort;
  for (let i = 0; i < 80; i++) {
    try {
      devPort = (
        await readFile(join(folder, "DevToolsActivePort"), "utf8")
      ).split("\n")[0];
      break;
    } catch {
      await pause(100);
    }
  }
  if (!devPort)
    throw new Error("Chrome을 실행하지 못했어요. CHROME_PATH를 확인해 주세요.");
  const targets = await (
    await fetch(`http://127.0.0.1:${devPort}/json/list`)
  ).json();
  ws = new WebSocket(
    targets.find((t) => t.type === "page").webSocketDebuggerUrl,
  );
  await new Promise((r, j) => {
    ws.onopen = r;
    ws.onerror = j;
  });
  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.id) {
      const promise = pending.get(data.id);
      pending.delete(data.id);
      data.error
        ? promise?.reject(new Error(data.error.message))
        : promise?.resolve(data.result);
    } else if (data.method === "Fetch.requestPaused") {
      delayedPriceRequests.push(data.params.requestId);
    } else if (data.method === "Runtime.exceptionThrown")
      errors.push(
        data.params.exceptionDetails.exception?.description ||
          data.params.exceptionDetails.text,
      );
  };
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++seq;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  const evaluate = async (expression) => {
    const r = await send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
      userGesture: true,
    });
    if (r.exceptionDetails)
      throw new Error(
        r.exceptionDetails.exception?.description || r.exceptionDetails.text,
      );
    return r.result.value;
  };
  const screenshot = async (name) => {
    const r = await send("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: false,
    });
    await writeFile(
      join(screenshotFolder, name + ".png"),
      Buffer.from(r.data, "base64"),
    );
  };
  const check = async (expression, message, count = true, tries = 50) => {
    for (let i = 0; i < tries; i++) {
      if (await evaluate(expression)) {
        if (count) checks++;
        return;
      }
      await pause(100);
    }
    await screenshot("failure");
    throw new Error(message + "\n" + expression);
  };
  const click = async (id) => {
    await check(
      `!!document.querySelector('[data-testid=${JSON.stringify(id)}]')`,
      "요소 대기: " + id,
      false,
    );
    return evaluate(
      `(()=>{const el=document.querySelector('[data-testid=${JSON.stringify(id)}]');(el.querySelector('input[role="switch"]')||el).click();})()`,
    );
  };
  const clickLabel = async (label) => {
    await check(
      `!!document.querySelector('[aria-label=${JSON.stringify(label)}]')`,
      "요소 대기: " + label,
      false,
    );
    return evaluate(
      `document.querySelector('[aria-label=${JSON.stringify(label)}]').click()`,
    );
  };
  // 통화를 고르면 오늘 환율이 적용 환율 칸에 자동으로 채워질 때까지 기다립니다.
  const rateFilled = (value) =>
    check(
      `document.querySelector('[data-testid="receipt-rate"]')?.value===${JSON.stringify(value)}`,
      "오늘 환율 자동 채움: " + value,
    );
  const set = async (id, value) => {
    await check(
      `!!document.querySelector('input[data-testid=${JSON.stringify(id)}]')`,
      "입력 대기: " + id,
      false,
    );
    return evaluate(
      `(()=>{const el=document.querySelector('[data-testid=${JSON.stringify(id)}]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true}));return true;})()`,
    );
  };
  const bodyHas = (text) =>
    `document.body.textContent.includes(${JSON.stringify(text)})`;
  const saved = `JSON.parse(localStorage.getItem('travel-wonhae-mobile-v1'))`;
  await send("Runtime.enable");
  await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 1050,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await send("Page.navigate", { url: origin });
  await check(`${saved}?.receipts.length===0`, "기본 영수증 없이 빈 가계부로 시작");
  await check(bodyHas("아직 기록이 없어요"), "빈 영수증 목록 안내");
  await check(bodyHas("첫 영수증을 올리면 여행이 정해져요"), "여행 기본값 없이 시작");
  await check(
    `document.querySelectorAll('[role=tab]').length===2`,
    "핵심 메뉴 두 개",
  );
  await screenshot("desktop");
  await send("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await check(
    `document.documentElement.scrollWidth<=390`,
    "390px 가로 넘침 없음",
  );
  await screenshot("mobile-ledger");
  await click("toggle-comparison");
  await check(
    `!!document.querySelector('[data-testid="comparison-chart"]')&&!!document.querySelector('[data-testid="bar-me"]')&&` +
      bodyHas("누적 지출") +
      "&&" +
      bodyHas("5명 이상 모이면"),
    "다른 여행자 비교: 누적 지출 막대 (여행자 5명 미만이면 평균 대신 안내)",
  );
  await click("compare-day");
  await click("compare-day-0");
  await check(
    `document.querySelector('[data-testid="compare-day"]').textContent.includes('0일차 · 출발 전')&&!document.querySelector('[data-testid="compare-day-menu"]')`,
    "비교 일차 드롭다운 선택",
  );
  // 여행을 직접 입력하지 않아도 첫 실제 영수증의 통화·구매일로 여행이 채워집니다.
  await click("add-receipt");
  await click("currency-JPY");
  await rateFilled("9.24");
  await set("receipt-store", "여행 자동 설정 테스트");
  await set("item-name-0", "녹차 500ml");
  await set("item-price-0", "150");
  await set("receipt-total", "150");
  await click("save-receipt");
  await check(
    `${saved}.receipts.length===1&&${saved}.trip.country==='일본'&&${saved}.trip.currency==='JPY'&&${saved}.trip.start===${saved}.receipts[0].date&&${saved}.trip.end===${saved}.receipts[0].date`,
    "첫 실제 영수증으로 여행 지역·기간·통화 자동 설정",
  );
  await check(
    bodyHas("일본 여행") + "&&" + bodyHas("영수증으로 여행 정보를 채웠어요"),
    "자동으로 정한 여행 표시와 안내",
  );
  // 가계부 CSV 내보내기: 웹에서는 파일로 내려받습니다.
  await evaluate(
    `window.__csv=null;const _c=URL.createObjectURL;URL.createObjectURL=(b)=>{window.__csv=b;return _c.call(URL,b)}`,
  );
  await click("export-csv");
  await check(
    bodyHas("파일로 내보냈어요") + `&&window.__csv&&window.__csv.size>0`,
    "가계부 CSV 내보내기",
  );
  await check(
    `window.__csv.arrayBuffer().then(b=>{const u=new Uint8Array(b);const t=new TextDecoder().decode(u);return u[0]===0xEF&&u[1]===0xBB&&u[2]===0xBF&&t.startsWith('구매일,')&&t.includes('녹차 500ml')})`,
    "CSV에 품목 줄과 한글 BOM 포함",
  );
  const autoTripId = await evaluate(`${saved}.receipts[0].id`);
  await click("receipt-" + autoTripId);
  await click("delete-receipt");
  await click("delete-receipt");
  await check(`${saved}.receipts.length===0`, "자동 설정 확인용 영수증 삭제");
  await click("trip-settings");
  await set("trip-city", "도쿄");
  await set("trip-country", "일본");
  await set("trip-start", "2026-10-24");
  await set("trip-end", "2026-10-30");
  await set("trip-budget", "600000");
  await click("save-settings");
  await check(bodyHas("도쿄 여행"), "여행 설정 후 도시 표시");
  await check(bodyHas("앞으로 600,000원 더 사용할 수 있어요"), "예산 변경 후 남은 예산 표시");
  await click("add-receipt");
  await click("sample-receipt");
  await rateFilled("9.24");
  await click("save-receipt");
  await check(`${saved}.receipts.length===1`, "시연 영수증 등록");
  // 소비 인사이트: 여행을 정하고 첫 영수증을 기록하면, 서버가 계산한 근거 숫자(칩)와
  // (가짜) AI가 그 숫자로 쓴 문장과 'AI 분석' 배지를 보여 줍니다.
  await check(
    `(()=>{const card=document.querySelector('[data-testid="insight-card"]');return !!card&&card.textContent.includes('AI 분석')&&card.textContent.includes('테스트 AI 인사이트')&&card.textContent.includes('% 사용')&&!!card.querySelector('[data-testid="insight-facts"]')})()`,
    "소비 인사이트: 서버 계산 숫자와 AI 분석 문장 표시",
  );
  await check(
    `${saved}.receipts.at(-1).demo===true&&${saved}.receipts.at(-1).shareConsent===false`,
    "시연 영수증 공유 금지",
  );
  await click("add-receipt");
  await click("sample-receipt");
  await rateFilled("9.24");
  await click("save-receipt");
  await check(bodyHas("같은 매장·구매일·금액"), "중복 영수증 저장 차단");
  await clickLabel("창 닫기");
  await click("add-receipt");
  await click("currency-JPY");
  await rateFilled("9.24");
  await set("receipt-store", "직접 입력 테스트");
  await set("item-name-0", "코카콜라 500ml");
  await set("item-price-0", "210");
  await set("item-quantity-0", "2");
  await set("receipt-total", "420");
  await click("save-receipt");
  await check(
    `${saved}.receipts.length===2&&${saved}.receipts.at(-1).totalMinor===420`,
    "직접 입력 단가와 수량 저장",
  );
  await check(
    `${saved}.receipts.at(-1).shareConsent===true&&!document.querySelector('[data-testid="share-consent"]')`,
    "동의 절차 없이 실제 영수증은 공유 대상",
  );
  await check(
    `${saved}.receipts.at(-1).currency==='JPY'&&Math.abs(${saved}.receipts.at(-1).location.latitude-35.6896)<0.02`,
    "새 영수증에 신주쿠 근처 시연용 매장 좌표",
  );
  const manualId = await evaluate(`${saved}.receipts.at(-1).id`);
  await click("receipt-" + manualId);
  await set("receipt-store", "수정된 매장");
  await click("save-receipt");
  await check(
    `${saved}.receipts.length===2&&${saved}.receipts.at(-1).store==='수정된 매장'`,
    "수정 시 중복 생성 없이 반영",
  );
  await click("receipt-" + manualId);
  await click("delete-receipt");
  await click("delete-receipt");
  await check(`${saved}.receipts.length===1`, "영수증 삭제");
  await send("Page.reload");
  await check(
    `${saved}.receipts.length===1&&${saved}.trip.budget===600000`,
    "재시작 후 데이터 복원",
  );
  await click("tab-compare");
  const storeCards = `document.querySelectorAll('[data-testid^=store-]')`;
  const noSearchResults = `${storeCards}.length===0&&![...document.querySelectorAll('div')].some((el)=>el.textContent==='주변 매장')&&!${bodyHas("아직 주변 구매 기록이 없어요")}&&!document.querySelector('[data-testid="prices-loading"]')`;
  await check(
    `document.querySelector('[data-testid="product-search"]').value===''&&${noSearchResults}`,
    "최초 진입 시 기본 검색어와 자동 검색 결과 없음",
  );
  await click("category-음식");
  await check(
    `document.querySelectorAll('[data-testid^=browse-]:not([data-testid^=browse-sort])').length===3`,
    "검색어 없이도 카테고리 둘러보기 가능",
  );
  await click("category-음식");
  await check(noSearchResults, "검색 전 카테고리 해제 시 결과 숨김");
  await send("Fetch.enable", {
    patterns: [{ urlPattern: "*/prices?*", requestStage: "Request" }],
  });
  await click("quick-search-도리토스");
  await check(
    `!!document.querySelector('[data-testid="prices-loading"]')&&${bodyHas("검색 중입니다")}&&document.querySelector('[data-testid="search-loading-image"] img')?.naturalWidth>0&&!${bodyHas("아직 주변 구매 기록이 없어요")}`,
    "가격 조회 중 푸딩 이미지와 검색 중 안내 표시, 빈 결과 숨김",
  );
  await screenshot("mobile-search-loading");
  for (let i = 0; i < 50 && !delayedPriceRequests.length; i++) await pause(100);
  assert.ok(
    delayedPriceRequests.length,
    "가격 조회 요청을 기다리는 동안 로딩 표시",
  );
  await send("Fetch.continueRequest", {
    requestId: delayedPriceRequests.shift(),
  });
  await send("Fetch.disable");
  await check(
    `${storeCards}.length===3&&document.querySelector('[data-testid="product-search"]').value==='도리토스'&&!document.querySelector('[data-testid="prices-loading"]')`,
    "조회 완료 후 검색 안내를 닫고 빠른검색 결과 표시",
  );
  await send("Fetch.enable", {
    patterns: [{ urlPattern: "*/prices?*", requestStage: "Request" }],
  });
  await click("search-submit");
  await check(
    `!!document.querySelector('[data-testid="prices-loading"]')&&${bodyHas("검색 중입니다")}`,
    "같은 검색어를 다시 검색해도 검색 중 표시",
  );
  await click("tab-ledger");
  await check(
    `!document.querySelector('[data-testid="prices-loading"]')`,
    "가계부 탭에서는 조회 중이어도 검색 안내 숨김",
  );
  await click("tab-compare");
  await check(
    `!!document.querySelector('[data-testid="prices-loading"]')`,
    "조회 중인 가격 비교 탭으로 돌아오면 검색 안내 표시",
  );
  for (let i = 0; i < 50 && !delayedPriceRequests.length; i++) await pause(100);
  assert.ok(delayedPriceRequests.length, "같은 검색어 재조회 요청");
  await send("Fetch.fulfillRequest", {
    requestId: delayedPriceRequests.shift(),
    responseCode: 503,
    responseHeaders: [
      { name: "Content-Type", value: "application/json" },
      { name: "Access-Control-Allow-Origin", value: origin },
    ],
    body: Buffer.from(JSON.stringify({ error: "테스트 조회 실패" })).toString(
      "base64",
    ),
  });
  await send("Fetch.disable");
  await check(
    `!!document.querySelector('[data-testid="prices-error"]')&&!document.querySelector('[data-testid="prices-loading"]')&&!${bodyHas("아직 주변 구매 기록이 없어요")}`,
    "조회 실패 시 검색 안내를 닫고 오류 표시",
  );
  await set("product-search", "   ");
  await click("search-submit");
  await check(noSearchResults, "공백 검색 시 결과와 로딩 숨김");
  await set("product-search", "도리토스");
  await click("search-submit");
  // 기본 정렬은 추천순: 점수는 데일리마트 A > 산고 스토어 B > 모닝마트 C이고, (가짜) AI가 앞의 두 개를 바꿉니다.
  await check(
    `${storeCards}.length===3&&${storeCards}[0].textContent.includes('산고 스토어 B')&&${storeCards}[1].textContent.includes('데일리마트 A')&&${storeCards}[0].textContent.includes('AI 추천')&&${storeCards}[0].textContent.includes('테스트 AI 이유 1')`,
    "상품 검색 기본 정렬은 AI 추천순이고 AI 추천 이유 표시",
  );
  await click("search-sort-가격순");
  await check(
    `${storeCards}.length===3&&${storeCards}[0].textContent.includes('산고 스토어 B')&&!document.querySelector('[data-testid^=reason-]')`,
    "서버 조회: 반경 안 도리토스 매장 세 곳을 가격순으로 표시",
  );
  await screenshot("mobile-compare");
  const mapShown = `!!document.querySelector('[aria-label="주변 매장 지도"]')`;
  await check(`!${mapShown}`, "지도는 버튼을 누르기 전까지 숨김");
  await click(
    await evaluate(
      `[...${storeCards}].find((e)=>e.textContent.includes('산고 스토어 B')).dataset.testid`,
    ),
  );
  await click("map-open");
  await check(
    `${mapShown}&&document.querySelectorAll('[aria-label="주변 매장 지도"] [aria-label*="¥"]').length===3&&${bodyHas("산고 스토어 B · ¥148")}`,
    "지도 버튼으로 목록 매장 표시와 선택 연결",
  );
  await clickLabel("창 닫기");
  await check(`!${mapShown}`, "X 버튼으로 지도 닫기");
  await set("product-search", "doritos");
  await click("search-submit");
  await check(
    `${storeCards}.length===3`,
    "영수증 원문(영문) 대소문자 무시 검색",
  );
  await set("product-search", "없는 상품");
  await click("search-submit");
  await check(bodyHas("아직 주변 구매 기록이 없어요"), "검색 빈 상태");
  await set("product-search", "하다라보");
  await click("search-submit");
  await check(`${storeCards}.length===2`, "다른 상품 검색");
  const firstBrowse = `document.querySelector('[data-testid^=browse-]:not([data-testid^=browse-sort])')?.textContent||''`;
  await click("category-음식");
  await check(
    `document.querySelectorAll('[data-testid^=browse-]:not([data-testid^=browse-sort])').length===3&&${firstBrowse}.includes('카페 모쿠 C')&&${firstBrowse}.includes('AI 추천')`,
    "카테고리 기본 정렬은 AI 추천순(점수 1위 라멘 소라 A와 2위 카페 모쿠 C를 AI가 바꿈)",
  );
  await click("browse-sort-가격순");
  await check(
    `${firstBrowse}.includes('규동 미나토 B')`,
    "카테고리 가격순 정렬",
  );
  await check(
    `!!(document.querySelector('[data-testid="category-쇼핑"]').compareDocumentPosition(document.querySelector('[data-testid="category-results"]'))&Node.DOCUMENT_POSITION_FOLLOWING)&&!!(document.querySelector('[data-testid="category-results"]').compareDocumentPosition(document.querySelector('[data-testid="category-숙박"]'))&Node.DOCUMENT_POSITION_FOLLOWING)`,
    "카테고리 결과는 고른 타일 줄 바로 아래 표시",
  );
  await click("browse-sort-구매수");
  await check(`${firstBrowse}.includes('구매 3회')`, "카테고리 구매수 정렬");
  await click("browse-sort-최신순");
  await check(`${firstBrowse}.includes('카페 모쿠 C')`, "카테고리 최신순 정렬");
  await click("browse-sort-거리순");
  await check(
    `(()=>{const d=[...document.querySelectorAll('[data-testid^=card-distance-]')].map(e=>{const m=e.textContent.match(/([\\d.]+)(km|m)/);return m?parseFloat(m[1])*(m[2]==='km'?1000:1):NaN});return d.length===3&&d.every((v,i)=>!isNaN(v)&&(i===0||d[i-1]<=v))})()`,
    "카테고리 거리순 정렬 (가까운 매장부터)",
  );
  await click("category-음식");
  await check(
    `${storeCards}.length===2`,
    "카테고리 해제 후 상품 검색 결과 복귀",
  );
  const browseCards = `document.querySelectorAll('[data-testid^=browse-]:not([data-testid^=browse-sort])')`;
  await click("category-관광");
  await check(
    `${browseCards}.length===5&&!!document.querySelector('[data-testid="show-more"]')`,
    "결과는 5개만 보이고 더 보기 버튼 표시",
  );
  // (가짜) AI가 후보 7개를 모두 돌려줘도 'AI 추천' 배지는 맨 위 3개에만 붙습니다.
  // 앞에서 고른 정렬(최신순)이 남아 있으므로 추천순으로 바꿉니다.
  await click("browse-sort-추천순");
  await check(
    `(()=>{const cards=[...${browseCards}];return cards.slice(0,3).every((e)=>e.textContent.includes('AI 추천'))&&!cards.slice(3).some((e)=>e.textContent.includes('AI 추천'))})()`,
    "AI 추천 배지는 맨 위 3개에만 표시",
  );
  await click("show-more");
  await check(
    `${browseCards}.length===7&&!document.querySelector('[data-testid="show-more"]')`,
    "더 보기를 누르면 남은 결과 표시",
  );
  await click("category-관광");
  await click("category-관광");
  await check(
    `${browseCards}.length===5&&!!document.querySelector('[data-testid="show-more"]')`,
    "카테고리를 다시 고르면 처음 5개부터 표시",
  );
  await click("category-관광");
  await send("Browser.grantPermissions", {
    origin,
    permissions: ["geolocation"],
  });
  await send("Emulation.setGeolocationOverride", {
    latitude: 48.8584,
    longitude: 2.347,
    accuracy: 5,
  });
  await clickLabel("현재 위치 사용");
  await check(bodyHas("현재 위치 · 반경 3km"), "위치 권한 동의 후 실위치 모드");
  await check(
    bodyHas("아직 주변 구매 기록이 없어요"),
    "실제 위치에서 시연 매장 혼합 방지",
  );
  await click("tab-ledger");
  await click("add-receipt");
  await click("currency-JPY");
  await rateFilled("9.24");
  await set("receipt-store", "공유 테스트 매장");
  await set("item-name-0", "코카콜라 500ml");
  await set("item-price-0", "150");
  await set("receipt-total", "150");
  await set("store-address", "테스트 매장 주소");
  await check(
    `!!document.querySelector('[data-testid="share-notice"]')&&!document.querySelector('[data-testid="share-notice"] [role="button"]')`,
    "영수증 화면에 위치 버튼 없음",
  );
  await click("save-receipt");
  await check(
    `${saved}.receipts.at(-1).shareConsent===true&&!!${saved}.receipts.at(-1).location`,
    "주소와 시연용 좌표로 영수증 저장",
  );
  // 앱이 가계부를 서버에 통째로 저장하면, 다른 사람의 PAGE 2 조회에도 나옵니다.
  let shared = false;
  for (let i = 0; i < 50 && !shared; i++) {
    shared = (await nearPrices("코카콜라")).some(
      (r) => r.store === "공유 테스트 매장",
    );
    if (!shared) await pause(100);
  }
  assert.ok(shared, "앱에서 저장한 영수증이 서버 PAGE 2 조회에 나옴");
  checks++;
  await click("tab-compare");
  await check(
    `document.querySelector('[data-testid="product-search"]').value==='하다라보'`,
    "탭 이동 후 검색어 유지",
  );
  await check(bodyHas("현재 위치 · 반경 3km"), "탭 이동 후 위치 유지");
  await set("product-search", "코카콜라 500ml");
  await click("search-submit");
  await clickLabel("현재 위치 사용");
  await click("tab-ledger");
  await click("trip-settings");
  await click("clear-demo");
  await click("clear-demo");
  await check(
    `${saved}.receipts.length===1&&!${saved}.receipts[0].demo`,
    "시연 데이터 삭제가 실제 기록 보존",
  );
  await click("add-receipt");
  await send("Page.setInterceptFileChooserDialog", { enabled: true });
  await clickLabel("사진 선택");
  await check(
    `!!document.querySelector('input[type=file]')`,
    "사진 선택 입력 준비",
    false,
  );
  const { root: domRoot } = await send("DOM.getDocument");
  const { nodeId: fileInput } = await send("DOM.querySelector", {
    nodeId: domRoot.nodeId,
    selector: "input[type=file]",
  });
  assert.ok(fileInput, "사진 선택 입력");
  await send("DOM.setFileInputFiles", {
    nodeId: fileInput,
    files: [
      fileURLToPath(new URL("../assets/travel-pudding.png", import.meta.url)),
    ],
  });
  await check(
    `!!document.querySelector('[data-testid="ocr-loading"]')&&document.body.innerText.includes('AI가 영수증을 읽고 있어요')`,
    "분석을 기다리는 동안 로딩 화면 표시",
  );
  // 서버를 띄운 뒤 첫 AI 요청은 준비 시간 때문에 5초를 넘길 수 있어 더 기다립니다.
  await check(
    bodyHas("AI 인식 결과예요"),
    "사진 업로드 후 OCR 결과 검토 (서버 대체 응답)",
    true,
    300,
  );
  await check(
    `!document.querySelector('[data-testid="ocr-loading"]')`,
    "분석이 끝나면 로딩 화면 닫힘",
  );
  await check(
    `document.querySelector('[data-testid="item-name-0"]').value==='DORITOS ナチョチーズ 60G'&&document.querySelector('[data-testid="item-name-ko-0"]').value==='도리토스 나초치즈 60g'`,
    "상품명 원어·한국어 번역 두 칸 채움",
  );
  await check(
    `document.querySelector('[data-testid="store-address"]').value==='도쿄 신주쿠구 테스트 주소 1-1'`,
    "영수증 매장 주소 자동 입력",
  );
  await check(
    `document.querySelector('[data-testid="receipt-store"]').value==='テスト写真店'&&document.querySelector('[data-testid="receipt-store-ko"]').value==='테스트 사진 매장'`,
    "매장명 원문·한국어 번역 두 칸 채움",
  );
  await rateFilled("9.24");
  await click("save-receipt");
  await check(
    `${saved}.receipts.at(-1).store==='テスト写真店'&&${saved}.receipts.at(-1).storeKo==='테스트 사진 매장'&&!${saved}.receipts.at(-1).demo&&${saved}.receipts.at(-1).items[0].nameKo==='도리토스 나초치즈 60g'&&${saved}.receipts.at(-1).address==='도쿄 신주쿠구 테스트 주소 1-1'`,
    "사진 분석 상품 내역 저장",
  );
  // 다른 여행자 화면: 한국어 매장명으로 검색되고, 가계부 카테고리(음식) 둘러보기에도 나옵니다.
  let found = false;
  for (let i = 0; i < 50 && !found; i++) {
    const byName = await nearPrices("테스트 사진");
    const byCategory = (
      await (
        await fetch(
          `${api}/prices?currency=JPY&latitude=35.6896&longitude=139.7006&category=${encodeURIComponent("음식")}`,
        )
      ).json()
    ).records;
    found =
      byName.some(
        (r) => r.store === "テスト写真店" && r.storeKo === "테스트 사진 매장",
      ) && byCategory.some((r) => r.store === "テスト写真店");
    if (!found) await pause(100);
  }
  assert.ok(found, "한국어 매장명 검색과 카테고리 둘러보기에 새 영수증 표시");
  checks++;
  for (const width of [320, 768]) {
    await send("Emulation.setDeviceMetricsOverride", {
      width,
      height: 844,
      deviceScaleFactor: 1,
      mobile: width < 500,
    });
    for (const tab of ["ledger", "compare"]) {
      await click("tab-" + tab);
      await check(
        `document.documentElement.scrollWidth<=${width}`,
        `${width}px ${tab} 가로 넘침 없음`,
      );
    }
  }
  assert.deepEqual(errors, [], "브라우저 런타임 오류");
  assert.equal(ocrRequests, 1, "실제 Spring AI 구조화 출력 요청 한 번");
  assert.ok(rankRequests > 0, "추천순 AI 재정렬 요청");
  assert.ok(insightRequests > 0, "소비 인사이트 AI 요청");
  console.log(
    JSON.stringify(
      {
        passed: checks,
        runtimeErrors: errors,
        screenshots: screenshotFolder,
        note: "실제 Spring Boot·JPA 서버(H2 메모리 DB) 사용. Claude(Anthropic) 공급자만 로컬 응답으로 대체.",
      },
      null,
      2,
    ),
  );
} finally {
  ws?.close();
  chrome?.kill("SIGTERM");
  if (javaProcess && javaProcess.exitCode === null) {
    const stopped = new Promise((r) => javaProcess.once("exit", r));
    javaProcess.kill("SIGTERM");
    await stopped;
  }
  await Promise.all([
    staticServer && new Promise((r) => staticServer.close(r)),
    provider && new Promise((r) => provider.close(r)),
  ]);
  await pause(300);
  await rm(folder, { recursive: true, force: true });
}
