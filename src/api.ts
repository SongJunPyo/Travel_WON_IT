import { Platform } from "react-native";
import type { ExchangeRate, Price, TravelState } from "./types";

export const API_URL = (
  process.env.EXPO_PUBLIC_API_URL ||
  (Platform.OS === "android" ? "http://10.0.2.2:8787" : "http://localhost:8787")
).replace(/\/$/, "");
export async function request(path: string, init: RequestInit = {}) {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    path === "/api/receipts/ocr" ? 65000 : 8000,
  );
  try {
    // 사진 업로드(FormData)는 브라우저·RN이 multipart 경계를 직접 붙이도록 Content-Type을 비워 둡니다.
    const json = typeof init.body === "string";
    const response = await fetch(API_URL + path, {
      ...init,
      signal: controller.signal,
      headers: {
        ...(json ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
    });
    const data = await response.json();
    if (!response.ok)
      throw new Error(
        data.errors?.[0]?.message || data.error || "서버 연결을 확인해 주세요.",
      );
    return data;
  } finally {
    clearTimeout(timer);
  }
}
const auth = (deviceToken: string) => ({
  Authorization: `Bearer ${deviceToken}`,
});
/** 이 기기의 가계부를 서버(MySQL)에서 읽습니다. 저장한 적이 없으면 null. */
export async function loadLedger(
  deviceToken: string,
): Promise<TravelState | null> {
  return (await request("/ledger", { headers: auth(deviceToken) })).state;
}
/** 가계부 전체를 서버에 저장하고, 공유 동의한 품목으로 만든 가격 비교 기록을 받아옵니다. */
export async function syncLedger(
  state: TravelState,
  deviceToken: string,
): Promise<Price[]> {
  await request("/ledger", {
    method: "PUT",
    headers: auth(deviceToken),
    body: JSON.stringify(state),
  });
  return (await request("/prices")).records;
}
/** 적용 환율 칸에 채울 참고 환율(1 외화당 원화)과 고시일을 받습니다. */
export async function fetchExchangeRate(
  currency: string,
): Promise<ExchangeRate> {
  return request(`/api/exchange-rates/${encodeURIComponent(currency)}`);
}
/** 영수증 사진을 multipart(file)로 올려 상품별 인식 초안을 받습니다. */
export async function recognizeReceipt(photo: {
  uri: string;
  base64: string;
  mimeType: string;
}) {
  const form = new FormData();
  const name = `receipt.${photo.mimeType.split("/")[1] || "jpg"}`;
  const bytes = Uint8Array.from(atob(photo.base64), (c) => c.charCodeAt(0));
  if (Platform.OS === "web") {
    form.append("file", new Blob([bytes], { type: photo.mimeType }), name);
  } else {
    // Expo(SDK 58)가 바꿔 끼운 fetch는 RN식 { uri } 파일을 보내지 못하고, bytes()가 있는 파일 객체만 multipart로 보냅니다.
    form.append("file", {
      name,
      type: photo.mimeType,
      bytes: async () => bytes,
    } as unknown as Blob);
  }
  return (await request("/api/receipts/ocr", { method: "POST", body: form }))
    .receipt;
}
