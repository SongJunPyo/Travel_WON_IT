import http from "node:http";
import assert from "node:assert/strict";
import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { extname, resolve, join } from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createDemo } from "../src/domain.mjs";

const root = fileURLToPath(new URL("../dist/", import.meta.url));
const folder = await mkdtemp(join(tmpdir(), "wonhae-browser-"));
const screenshotFolder = process.env.SCREENSHOT_DIR || fileURLToPath(
  new URL("../docs/screenshots/", import.meta.url),
);
const { mkdir } = await import("node:fs/promises");
await mkdir(screenshotFolder, { recursive: true });
let chrome, ws, staticServer, provider, javaProcess;
const javaLogs = [];
const onboardingOnly = process.env.ONBOARDING_ONLY === "1";
let ocrRequests = 0;
const pending = new Map(),
  errors = [];
let seq = 0,
  checks = 0;
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const sampleOcr = {
  store: "테스트 사진 매장",
  date: "2026-10-27",
  currency: "EUR",
  category: "음식",
  totalMinor: 360,
  items: [{ name: "코카콜라 500ml", quantity: 2, unitMinor: 180 }],
};
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
    let raw = "";
    for await (const chunk of req) raw += chunk;
    const payload = JSON.parse(raw);
    assert.equal(payload.store, false);
    assert.equal(payload.text.format.strict, true);
    assert.equal(payload.input[0].content[1].type, "input_image");
    ocrRequests++;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        output: [
          {
            content: [{ type: "output_text", text: JSON.stringify(sampleOcr) }],
          },
        ],
      }),
    );
  });
  await new Promise((r) => provider.listen(0, "127.0.0.1", r));
  if (!onboardingOnly) {
  javaProcess = spawn(
    "java",
    [
      "-jar",
      "build/libs/travel-wonhae-1.0.0.jar",
      "--server.port=8787",
      "--spring.datasource.url=jdbc:h2:mem:browser-tests",
      "--spring.jpa.hibernate.ddl-auto=create-drop",
      "--app.openai-api-key=test-only",
      `--app.allowed-origins=${origin}`,
      `--app.openai-responses-url=http://127.0.0.1:${provider.address().port}/v1/responses`,
    ],
    {
      cwd: fileURLToPath(new URL("../", import.meta.url)),
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  javaProcess.stdout.on("data", (data) => javaLogs.push(data.toString()));
  javaProcess.stderr.on("data", (data) => javaLogs.push(data.toString()));
  let apiReady = false;
  for (let i = 0; i < 200; i++) {
    if (javaProcess.exitCode !== null) throw new Error(javaLogs.join(""));
    try {
      apiReady = (await (await fetch("http://localhost:8787/health")).json())
        .ok;
      if (apiReady) break;
    } catch {}
    await pause(100);
  }
  if (!apiReady) throw new Error("Spring API 시작 실패\n" + javaLogs.join(""));
  }
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
    } else if (data.method === "Runtime.exceptionThrown")
      errors.push(
        data.params.exceptionDetails.exception?.description ||
          data.params.exceptionDetails.text,
      );
  };
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++seq;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`Chrome 응답 시간 초과: ${method}`));
      }, 15000);
      pending.set(id, {
        resolve: (result) => { clearTimeout(timer); resolve(result); },
        reject: (error) => { clearTimeout(timer); reject(error); },
      });
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
  const check = async (expression, message, count = true) => {
    for (let i = 0; i < 50; i++) {
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
  await check(bodyHas("어디로 떠나시나요?"), "첫 실행 여행 설정 표시");
  await send("Emulation.setDeviceMetricsOverride", { width: 320, height: 844, deviceScaleFactor: 1, mobile: true });
  await check("document.documentElement.scrollWidth<=320", "첫 설정 320px 가로 넘침 없음");
  await screenshot("trip-setup");
  await click("save-settings");
  await check(bodyHas("여행 국가를 선택하거나 입력해 주세요."), "국가 필수 검증");
  await click("country-일본");
  await set("trip-city", "도쿄");
  await set("trip-start", "2026-11-10");
  await set("trip-end", "2026-11-09");
  await set("trip-budget", "500000");
  await click("save-settings");
  await check(bodyHas("여행 기간을 YYYY-MM-DD 형식으로 확인해 주세요."), "여행 기간 검증");
  await set("trip-end", "2026-11-12");
  await click("save-settings");
  await check(`${saved}?.trip.country==='일본'&&${saved}.trip.city==='도쿄'&&${saved}.trip.budget===500000&&${saved}.receipts.length===0`, "여행 설정 저장과 빈 가계부");
  await send("Page.reload");
  await check(`${bodyHas("도쿄 여행")} && !document.querySelector('[data-testid="trip-country"]')`, "재실행 시 저장한 여행 표시");
  await click("trip-settings");
  await set("trip-country", "캐나다");
  await click("save-settings");
  await check(`${saved}.trip.country==='캐나다'`, "기존 설정에서 국가 수정");
  await evaluate(`localStorage.setItem('travel-wonhae-mobile-v1', ${JSON.stringify(JSON.stringify(createDemo()))})`);
  await send("Page.reload");
  await check(`${saved}?.receipts.length===6`, "시연 영수증 초기 상태");
  await check(bodyHas("665,120"), "원화 총지출 표시");
  if (!onboardingOnly) {
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1050, deviceScaleFactor: 1, mobile: false });
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
  await check(bodyHas("시연 평균 ·"), "평균 비교 표 시연 표시");
  await click("trip-settings");
  await set("trip-budget", "600000");
  await click("save-settings");
  await check(bodyHas("65,120원 초과"), "예산 초과 상태 표시");
  await click("add-receipt");
  await click("sample-receipt");
  await click("save-receipt");
  await check(`${saved}.receipts.length===7`, "시연 영수증 등록");
  await check(
    `${saved}.receipts.at(-1).demo===true&&${saved}.receipts.at(-1).shareConsent===false`,
    "시연 영수증 공유 금지",
  );
  await click("add-receipt");
  await click("sample-receipt");
  await click("save-receipt");
  await check(bodyHas("같은 매장·구매일·금액"), "중복 영수증 저장 차단");
  await clickLabel("창 닫기");
  await click("add-receipt");
  await set("receipt-store", "직접 입력 테스트");
  await set("item-name-0", "코카콜라 500ml");
  await set("item-price-0", "2.10");
  await set("item-quantity-0", "2");
  await set("receipt-total", "4.20");
  await click("save-receipt");
  await check(
    `${saved}.receipts.length===8&&${saved}.receipts.at(-1).totalMinor===420`,
    "직접 입력 단가와 수량 저장",
  );
  await check(
    `${saved}.receipts.at(-1).shareConsent===false`,
    "직접 입력 공유 기본 해제",
  );
  const manualId = await evaluate(`${saved}.receipts.at(-1).id`);
  await click("receipt-" + manualId);
  await set("receipt-store", "수정된 매장");
  await click("save-receipt");
  await check(
    `${saved}.receipts.length===8&&${saved}.receipts.at(-1).store==='수정된 매장'`,
    "수정 시 중복 생성 없이 반영",
  );
  await click("receipt-" + manualId);
  await click("delete-receipt");
  await click("delete-receipt");
  await check(`${saved}.receipts.length===7`, "영수증 삭제");
  await send("Page.reload");
  await check(
    `${saved}.receipts.length===7&&${saved}.trip.budget===600000`,
    "재시작 후 데이터 복원",
  );
  await click("tab-compare");
  await check(
    `document.querySelectorAll('[data-testid^=store-]').length===3`,
    "시연 상품 매장 세 개 검색",
  );
  await screenshot("mobile-compare");
  const mapShown = `!!document.querySelector('[aria-label="주변 매장 지도"]')`;
  await check(`!${mapShown}`, "지도는 버튼을 누르기 전까지 숨김");
  await click("store-price-b");
  await click("map-open");
  await check(
    `${mapShown}&&document.querySelectorAll('[aria-label="주변 매장 지도"] [aria-label*="€"]').length===3&&${bodyHas("시티 마켓 B · €2.10")}`,
    "지도 버튼으로 목록 매장 표시와 선택 연결",
  );
  await clickLabel("창 닫기");
  await check(`!${mapShown}`, "X 버튼으로 지도 닫기");
  await set("product-search", "COKE 0.5L");
  await click("search-submit");
  await check(
    `document.querySelectorAll('[data-testid^=store-]').length===3`,
    "상품 약어와 용량 정규화 검색",
  );
  await set("product-search", "없는 상품");
  await click("search-submit");
  await check(bodyHas("아직 주변 구매 기록이 없어요"), "검색 빈 상태");
  await set("product-search", "에비앙 500ml");
  await click("search-submit");
  await check(
    `document.querySelectorAll('[data-testid^=store-]').length===3`,
    "다른 상품 검색",
  );
  const firstBrowse = `document.querySelector('[data-testid^=browse-purchase-]')?.textContent||''`;
  await click("category-식당");
  await check(
    `document.querySelectorAll('[data-testid^=browse-purchase-]').length===3&&${firstBrowse}.includes('카페 C')`,
    "카테고리 선택 시 거래 기록을 가격순으로 표시",
  );
  await click("browse-sort-구매수");
  await check(`${firstBrowse}.includes('구매 5회')`, "카테고리 구매수 정렬");
  await click("browse-sort-최신순");
  await check(`${firstBrowse}.includes('비스트로 A')`, "카테고리 최신순 정렬");
  await check(
    `document.querySelector('[data-testid="browse-sort-거리순"]').getAttribute('aria-disabled')==='true'`,
    "거리순 필터는 비활성",
  );
  await click("category-식당");
  await check(
    `document.querySelectorAll('[data-testid^=store-]').length===3`,
    "카테고리 해제 후 상품 검색 결과 복귀",
  );
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
  await set("receipt-store", "공유 테스트 매장");
  await set("item-name-0", "코카콜라 500ml");
  await set("item-price-0", "1.50");
  await set("receipt-total", "1.50");
  await click("share-consent");
  await pause(150);
  await set("store-address", "테스트 매장 주소");
  await clickLabel("매장에 있다면 현재 위치 사용");
  await check(bodyHas("확인된 위치:"), "매장 좌표를 명시적으로 확인");
  await click("save-receipt");
  await check(
    `${saved}.receipts.at(-1).shareConsent===true`,
    "명시적 동의 영수증 저장",
  );
  await check(
    `fetch('http://localhost:8787/prices').then(r=>r.json()).then(d=>d.records.length===1)`,
    "가격 공유 서버 동기화",
  );
  const sharedId = await evaluate(`${saved}.receipts.at(-1).id`);
  await click("tab-compare");
  await check(
    `document.querySelector('[data-testid="product-search"]').value==='에비앙 500ml'`,
    "탭 이동 후 검색어 유지",
  );
  await check(bodyHas("현재 위치 · 반경 3km"), "탭 이동 후 위치 유지");
  await set("product-search", "코카콜라 500ml");
  await click("search-submit");
  await clickLabel("현재 위치 사용");
  await check(
    bodyHas("공유 테스트 매장"),
    "PAGE 1 영수증이 PAGE 2 가격 비교로 연결",
  );
  await click("tab-ledger");
  await click("receipt-" + sharedId);
  await click("share-consent");
  await click("save-receipt");
  await check(
    `fetch('http://localhost:8787/prices').then(r=>r.json()).then(d=>d.records.length===0)`,
    "공유 동의 철회 시 공개 기록 삭제",
  );
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
    bodyHas("AI 인식 결과예요"),
    "사진 업로드 후 OCR 결과 검토 (서버 대체 응답)",
  );
  await click("save-receipt");
  await check(
    `${saved}.receipts.at(-1).store==='테스트 사진 매장'&&!${saved}.receipts.at(-1).demo`,
    "사진 분석 상품 내역 저장",
  );
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
  assert.equal(ocrRequests, 1, "실제 Spring AI 구조화 출력 요청 한 번");
  }
  assert.deepEqual(errors, [], "브라우저 런타임 오류");
  console.log(
    JSON.stringify(
      {
        passed: checks,
        runtimeErrors: errors,
        screenshots: screenshotFolder,
        note: onboardingOnly ? "첫 여행 설정 흐름만 검사 (API 서버 없이 실행)." : "실제 Spring Boot·JPA·H2 서버 사용. OpenAI 공급자만 로컬 응답으로 대체.",
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
