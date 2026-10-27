import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDemo } from "../src/domain.mjs";

// 실행 중인 Expo 미리보기를 새 Chrome 프로필에서 검증합니다.
// 기존 브라우저의 여행 기록과 실행 중인 서버는 건드리지 않습니다.
const origin = process.env.PREVIEW_URL || "http://localhost:8082";
const folder = await mkdtemp(join(tmpdir(), "wonhae-trip-settings-"));
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const pending = new Map();
const errors = [];
let chrome, ws, sequence = 0, passed = 0;

try {
  chrome = spawn(
    process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    ["--headless=new", "--no-first-run", "--no-default-browser-check", "--remote-debugging-port=0", `--user-data-dir=${folder}`, "about:blank"],
    { stdio: "ignore" },
  );
  let port;
  for (let i = 0; i < 80; i++) {
    try {
      port = (await readFile(join(folder, "DevToolsActivePort"), "utf8")).split("\n")[0];
      break;
    } catch {
      await pause(100);
    }
  }
  assert.ok(port, "Chrome 시작 실패. CHROME_PATH를 확인해 주세요.");
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  ws = new WebSocket(targets.find((target) => target.type === "page").webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  ws.onmessage = ({ data }) => {
    const message = JSON.parse(data);
    if (message.id) {
      const request = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) request?.reject(new Error(message.error.message));
      else request?.resolve(message.result);
    } else if (message.method === "Runtime.exceptionThrown") {
      errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
    }
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async (expression) => {
    const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true, userGesture: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.result.value;
  };
  const element = (id) => `document.querySelector('[data-testid="${id}"]')`;
  const check = async (expression, message) => {
    for (let i = 0; i < 100; i++) {
      if (await evaluate(expression)) { passed++; return; }
      await pause(100);
    }
    throw new Error(message);
  };
  const click = async (id) => {
    await check(`!!${element(id)}`, `요소 없음: ${id}`);
    await evaluate(`${element(id)}.click()`);
  };
  const setField = async (id, value) => {
    await evaluate(`(() => {
      const input = ${element(id)};
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(value)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
  };
  const setBudget = (value) => setField("trip-budget", value);
  const saved = `JSON.parse(localStorage.getItem('travel-wonhae-mobile-v1'))`;
  await send("Runtime.enable");
  await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await send("Page.navigate", { url: origin });
  await click("trip-settings");
  await check(`${element("trip-country")}?.value === '프랑스' && !${element("trip-city")}`, "도시 대신 기존 여행 나라 표시");
  await check(`${element("trip-budget")}.value === '1,000,000'`, "기존 예산 쉼표 표시");
  await setBudget("10000");
  await check(`${element("trip-budget")}.value === '10,000'`, "예산 입력 중 쉼표 표시");
  await setBudget("");
  await check(`${element("trip-budget")}.value === ''`, "예산 전체 지우기");
  await setBudget("0010000");
  await check(`${element("trip-budget")}.value === '10,000'`, "예산 앞자리 0 정리");
  await click("trip-start");
  await click("calendar-previous-month");
  await click("calendar-previous-month");
  await click("calendar-day-2026-08-21");
  await click("trip-end");
  await click("calendar-previous-month");
  await click("calendar-previous-month");
  await check(`${element("calendar-day-2026-08-20")}?.getAttribute('aria-disabled') === 'true'`, "시작일 이전 종료일 비활성화");
  await check(`${element("calendar-previous-month")}.getAttribute('aria-disabled') === 'true'`, "시작일 이전 달 이동 차단");
  await click("calendar-day-2026-08-20");
  await check(`!!${element("trip-calendar")}`, "비활성 날짜를 눌러도 선택되지 않음");
  await click("calendar-day-2026-08-21");
  await check(`${element("trip-end")}.textContent.includes('2026.08.21')`, "종료일로 시작일 당일 선택");
  await click("save-settings");
  await check(`${saved}.trip.start === '2026-08-21' && ${saved}.trip.end === '2026-08-21' && ${saved}.trip.budget === 10000`, "당일 여행과 정수 예산 저장");
  await click("trip-settings");
  await check(`${element("trip-budget")}.value === '10,000'`, "다시 열어도 예산 쉼표 유지");
  await click("trip-start");
  await click("calendar-next-month");
  await click("calendar-day-2026-09-01");
  await check(`${element("trip-end")}.textContent.includes('2026.09.01')`, "시작일이 늦어지면 종료일 자동 조정");
  await click("trip-end");
  await click("calendar-day-2026-09-05");
  await click("save-settings");
  await check(`${saved}.trip.start === '2026-09-01' && ${saved}.trip.end === '2026-09-05'`, "시작일 이후 종료일 저장");
  await send("Page.reload");
  await click("trip-settings");
  await check(`${element("trip-end")}.textContent.includes('2026.09.05') && ${element("trip-budget")}.value === '10,000'`, "새로고침 후 날짜와 예산 유지");
  await click("trip-start");
  for (let i = 0; i < 7; i++) await click("calendar-previous-month");
  await check(`!${element("calendar-day-2026-02-29")} && !!${element("calendar-day-2026-02-28")}`, "평년 2월 일수");
  for (let i = 0; i < 24; i++) await click("calendar-next-month");
  await check(`!!${element("calendar-day-2028-02-29")}`, "윤년 2월 29일 선택 가능");
  await click("calendar-day-2028-02-29");
  await click("trip-end");
  await check(`${element("calendar-day-2028-02-28")}?.getAttribute('aria-disabled') === 'true'`, "윤년에도 시작일 이전 선택 차단");
  for (const width of [320, 390, 768]) {
    await send("Emulation.setDeviceMetricsOverride", { width, height: 844, deviceScaleFactor: 1, mobile: width < 500 });
    await check(`(() => {
      const rect = ${element("trip-calendar")}.getBoundingClientRect();
      return document.documentElement.scrollWidth <= ${width} && rect.left >= 0 && rect.right <= ${width};
    })()`, `${width}px에서 달력 가로 넘침 없음`);
  }
  await click("trip-end");
  await setField("trip-country", "   ");
  await click("save-settings");
  await check(`document.body.textContent.includes('여행 나라를 입력해 주세요.') && !!${element("trip-country")}`, "빈 여행 나라 저장 차단");
  await setField("trip-country", "일본");
  await check(`${element("trip-country-flag")}.textContent === '🇯🇵'`, "입력 중 일본 국기 표시");
  await click("save-settings");
  await check(`${saved}.trip.country === '일본' && ${element("trip-flag")}.textContent === '🇯🇵' && !!${element("trip-sakura-background")}`, "일본 저장 시 국기와 벚꽃 배경 적용");
  await send("Page.reload");
  await check(`${element("trip-flag")}?.textContent === '🇯🇵' && !!${element("trip-sakura-background")}`, "새로고침 후 일본 테마 유지");
  await click("trip-settings");
  await setField("trip-country", "France");
  await click("save-settings");
  await check(`${saved}.trip.country === '프랑스' && ${element("trip-flag")}.textContent === '🇫🇷' && !${element("trip-sakura-background")}`, "다른 나라로 변경 시 국기 변경과 벚꽃 제거");
  await click("trip-settings");
  await setField("trip-country", "테스트 여행지");
  await click("save-settings");
  await check(`${element("trip-flag")}.textContent === '🌐' && !${element("trip-sakura-background")}`, "등록되지 않은 나라에 잘못된 국기나 일본 배경을 표시하지 않음");
  await click("trip-settings");
  await setField("trip-country", "  JAPAN  ");
  await click("save-settings");
  await check(`${saved}.trip.country === '일본' && ${element("trip-flag")}.textContent === '🇯🇵' && !!${element("trip-sakura-background")}`, "영문 나라 이름과 앞뒤 공백 처리");
  for (const width of [320, 390, 1440]) {
    await send("Emulation.setDeviceMetricsOverride", { width, height: 1000, deviceScaleFactor: 1, mobile: width < 500 });
    await check(`document.documentElement.scrollWidth <= ${width}`, `${width}px에서 일본 테마 가로 넘침 없음`);
  }
  const fixture = createDemo();
  fixture.trip = { ...fixture.trip, country: "일본", start: "2026-11-13", end: "2026-11-15" };
  const makeReceipt = (id, store, date, category, amount) => ({
    ...fixture.receipts[0], id, store, date, category,
    currency: "KRW", rate: 1, totalMinor: amount,
    items: [{ name: "테스트 항목", quantity: 1, unitMinor: amount }],
  });
  fixture.receipts = [
    makeReceipt("daily-before", "일정 밖 기록", "2026-11-12", "교통", 7000),
    makeReceipt("daily-food", "첫날 식사", "2026-11-13", "음식", 10000),
    makeReceipt("daily-shop", "첫날 쇼핑", "2026-11-13", "쇼핑", 25000),
    makeReceipt("daily-last", "마지막날 이동", "2026-11-15", "교통", 5000),
  ];
  await evaluate(`localStorage.setItem('travel-wonhae-mobile-v1', ${JSON.stringify(JSON.stringify(fixture))})`);
  await send("Page.reload");
  await check(`${element("spending-day-2026-11-13")}?.textContent.includes('11/13 소비') && ${element("spending-day-2026-11-13")}.textContent.includes('35,000원')`, "여행 첫날 소비 금액 표시");
  await check(`${element("spending-day-2026-11-14")}.textContent.includes('0원') && ${element("spending-day-2026-11-15")}.textContent.includes('5,000원')`, "빈 날짜와 마지막날 소비 표시");
  await check(`!${element("spending-day-2026-11-12")} && ${element("receipt-count")}.textContent === '4'`, "기간 밖 날짜 카드는 없고 전체 조회에는 기존 영수증 보존");
  await click("spending-day-2026-11-13");
  await check(`!!${element("receipt-daily-food")} && !!${element("receipt-daily-shop")} && !${element("receipt-daily-last")} && ${element("receipt-count")}.textContent === '2'`, "날짜 선택 시 해당 날짜 영수증만 표시");
  await click("receipt-category-음식");
  await check(`!!${element("receipt-daily-food")} && !${element("receipt-daily-shop")} && ${element("receipt-count")}.textContent === '1'`, "날짜와 카테고리를 함께 필터링");
  await click("receipt-category-전체");
  await click("spending-day-2026-11-14");
  await check(`${element("receipt-count")}.textContent === '0' && ${element("receipts-list")}.textContent.includes('조건에 맞는 영수증이 없어요')`, "소비 없는 날짜의 빈 상태 표시");
  await click("spending-day-2026-11-15");
  await check(`!!${element("receipt-daily-last")} && ${element("receipt-count")}.textContent === '1'`, "여행 종료일 영수증 조회");
  await click("spending-day-all");
  await check(`${element("receipt-count")}.textContent === '4' && !!${element("receipt-daily-before")}`, "전체 선택 시 모든 영수증 복원");
  await click("toggle-comparison");
  await check(`${element("comparison-table")}.textContent.includes('사용자 평균') && !${element("comparison-table")}.textContent.includes('시연 평균') && ${element("comparison-table")}.textContent.includes('가상 데이터')`, "사용자 평균 명칭과 가상 데이터 안내");
  await click("spending-day-2026-11-13");
  await click("trip-settings");
  await click("trip-start");
  await click("calendar-day-2026-11-14");
  await click("save-settings");
  await check(`!${element("spending-day-2026-11-13")} && ${element("spending-day-all")}.getAttribute('aria-selected') === 'true' && ${element("receipt-count")}.textContent === '4'`, "여행 기간 변경 시 날짜 선택 초기화");
  for (const width of [320, 390, 1440]) {
    await send("Emulation.setDeviceMetricsOverride", { width, height: 1000, deviceScaleFactor: 1, mobile: width < 500 });
    await check(`document.documentElement.scrollWidth <= ${width}`, `${width}px에서 날짜별 소비 가로 넘침 없음`);
  }
  // 캡처에는 요청 예시의 11/13~11/15 일정과 날짜별 카드를 보여 줍니다.
  await evaluate(`localStorage.setItem('travel-wonhae-mobile-v1', ${JSON.stringify(JSON.stringify(fixture))})`);
  await send("Page.reload");
  await click("spending-day-2026-11-13");
  await evaluate(`${element("daily-spending")}.scrollIntoView({ block: 'center' })`);
  if (process.argv[2]) {
    const screenshot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    await writeFile(process.argv[2], Buffer.from(screenshot.data, "base64"));
  }
  assert.deepEqual(errors, [], "브라우저 런타임 오류");
  console.log(JSON.stringify({ passed, failed: 0, runtimeErrors: errors }));
} catch (error) {
  console.error(JSON.stringify({ passed, failed: 1, error: error.message, runtimeErrors: errors }));
  process.exitCode = 1;
} finally {
  ws?.close();
  if (chrome && chrome.exitCode === null) {
    const stopped = new Promise((resolve) => chrome.once("exit", resolve));
    chrome.kill("SIGTERM");
    await stopped;
  }
  await rm(folder, { recursive: true, force: true });
}
