import { Platform } from "react-native";
import type { Price } from "./types";

export const API_URL = (
  process.env.EXPO_PUBLIC_API_URL ||
  (Platform.OS === "android" ? "http://10.0.2.2:8787" : "http://localhost:8787")
).replace(/\/$/, "");
export async function request(path: string, init: RequestInit = {}) {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    path === "/ocr" ? 65000 : 8000,
  );
  try {
    const response = await fetch(API_URL + path, {
      ...init,
      signal: controller.signal,
      headers: { "Content-Type": "application/json", ...init.headers },
    });
    const data = await response.json();
    if (!response.ok)
      throw new Error(data.error || "서버 연결을 확인해 주세요.");
    return data;
  } finally {
    clearTimeout(timer);
  }
}
export async function syncPrices(
  records: Price[],
  deviceToken: string,
): Promise<Price[]> {
  await request("/prices", {
    method: "PUT",
    headers: { Authorization: `Bearer ${deviceToken}` },
    body: JSON.stringify({ records }),
  });
  return (await request("/prices")).records;
}
