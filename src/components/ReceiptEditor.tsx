import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Image,
  Switch,
  Platform,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import {
  CATEGORIES,
  CURRENCIES,
  parseMoney,
  minorText,
  money,
  validateReceipt,
  toWon,
  won,
} from "../domain.mjs";
import { request } from "../api";
import { Sheet, Button, Field, Label, Chip, Icon, colors } from "./ui";
import type { Coordinate, Receipt, TravelState } from "../types";

type ItemDraft = { name: string; quantity: string; price: string };
const today = () =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(
    new Date(),
  );
export function ReceiptEditor({
  visible,
  trip,
  initial,
  onClose,
  onSave,
  onDelete,
}: {
  visible: boolean;
  trip: TravelState["trip"];
  initial: Receipt | null;
  onClose: () => void;
  onSave: (r: Receipt) => void;
  onDelete: (id: string) => void;
}) {
  const [store, setStore] = useState(initial?.store || ""),
    [date, setDate] = useState(initial?.date || today()),
    [category, setCategory] = useState(initial?.category || "음식");
  const [currency, setCurrency] = useState(initial?.currency || trip.currency),
    [rate, setRate] = useState(String(initial?.rate || trip.rate));
  const [items, setItems] = useState<ItemDraft[]>(
    initial?.items.map((i) => ({
      name: i.name,
      quantity: String(i.quantity),
      price: minorText(i.unitMinor, initial.currency),
    })) || [{ name: "", quantity: "1", price: "" }],
  );
  const [total, setTotal] = useState(
    initial ? minorText(initial.totalMinor, initial.currency) : "",
  );
  const [share, setShare] = useState(initial?.shareConsent || false),
    [location, setLocation] = useState<Coordinate | null>(
      initial?.location || null,
    ),
    [address, setAddress] = useState(initial?.address || "");
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [locating, setLocating] = useState(false),
    [image, setImage] = useState<string | null>(null),
    [demo, setDemo] = useState(initial?.demo || false),
    [deleteConfirm, setDeleteConfirm] = useState(false),
    [source, setSource] = useState(
      initial ? "등록 내역을 수정할 수 있어요." : "",
    );
  function updateItem(index: number, key: keyof ItemDraft, value: string) {
    setItems((prev) =>
      prev.map((i, n) => (n === index ? { ...i, [key]: value } : i)),
    );
  }
  function applyData(data: any, isDemo: boolean) {
    setStore(data.store || "");
    setDate(data.date || today());
    setCurrency(data.currency || trip.currency);
    setCategory(
      CATEGORIES.some((c) => c.name === data.category) ? data.category : "기타",
    );
    setItems(
      data.items.map((i: any) => ({
        name: i.name,
        quantity: String(i.quantity),
        price: minorText(i.unitMinor, data.currency),
      })),
    );
    setTotal(minorText(data.totalMinor, data.currency));
    setDemo(isDemo);
    setShare(false);
    setLocation(null);
    setAddress("");
    setRate(data.currency === trip.currency ? String(trip.rate) : "");
    setSource(
      isDemo
        ? "시연 예시예요. 실제 사진의 인식 결과가 아니에요."
        : "AI 인식 결과예요. 구매일·단가·합계를 꼭 확인해 주세요.",
    );
  }
  async function pick(camera: boolean) {
    setError("");
    setBusy(true);
    try {
      if (camera && Platform.OS !== "web") {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted)
          throw new Error(
            "카메라 권한이 필요해요. 사진 선택이나 직접 입력도 가능해요.",
          );
      }
      const options: ImagePicker.ImagePickerOptions = {
        mediaTypes: ["images"],
        base64: true,
        quality: 0.75,
        allowsEditing: false,
        exif: false,
      };
      const result = camera
        ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync(options);
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset.base64)
        throw new Error(
          "사진을 읽지 못했어요. JPG 또는 PNG 사진을 선택해 주세요.",
        );
      if (asset.base64.length > 8_000_000)
        throw new Error("사진이 너무 커요. 6MB 이하의 사진을 선택해 주세요.");
      setImage(asset.uri);
      // 네이티브 picker는 원본이 HEIC여도 base64를 JPEG로 반환할 수 있어요.
      const mime = asset.base64.startsWith("/9j/")
        ? "image/jpeg"
        : asset.base64.startsWith("iVBORw0KGgo")
          ? "image/png"
          : asset.base64.startsWith("UklGR")
            ? "image/webp"
            : asset.mimeType;
      const resultData = await request("/ocr", {
        method: "POST",
        body: JSON.stringify({
          image: `data:${mime || "image/jpeg"};base64,${asset.base64}`,
        }),
      });
      applyData(resultData.receipt, false);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message.includes("fetch") || e.message.includes("Network")
            ? "분석 서버에 연결하지 못했어요. 서버 실행 상태를 확인하거나 직접 입력해 주세요."
            : e.message
          : "사진 분석에 실패했어요. 직접 입력할 수 있어요.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function storeLocation() {
    setLocating(true);
    setError("");
    try {
      const result = await Location.requestForegroundPermissionsAsync();
      if (result.status !== "granted")
        throw new Error(
          "위치 권한을 허용해 주세요. 가격 공유 없이도 영수증은 저장할 수 있어요.",
        );
      const point = await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
        new Promise<never>((_, reject) =>
          setTimeout(
            () =>
              reject(
                new Error("위치 확인 시간이 초과됐어요. 다시 시도해 주세요."),
              ),
            15000,
          ),
        ),
      ]);
      setLocation({
        latitude: point.coords.latitude,
        longitude: point.coords.longitude,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "위치 확인에 실패했어요.");
    } finally {
      setLocating(false);
    }
  }
  function save() {
    setError("");
    try {
      if (!/^\d+$/.test(rate))
        throw new Error("적용 환율을 1 이상 정수로 입력해 주세요.");
      const parsedItems = items.map((i) => ({
        name: i.name.trim(),
        quantity: /^\d+$/.test(i.quantity) ? Number(i.quantity) : 0,
        unitMinor: parseMoney(i.price, currency),
      }));
      const receipt: Receipt = {
        id:
          initial?.id ||
          `receipt-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        store: store.trim(),
        date,
        category,
        currency,
        rate: Number(rate),
        items: parsedItems,
        totalMinor: parseMoney(total, currency),
        shareConsent: share && !demo,
        demo,
        address: address.trim(),
        location,
        recordedAt: new Date().toISOString(),
      };
      validateReceipt(receipt);
      if (share && !demo && (!location || !address.trim()))
        throw new Error(
          "가격을 공유하려면 매장 주소와 매장 위치를 확인해 주세요.",
        );
      onSave(receipt);
    } catch (e) {
      setError(e instanceof Error ? e.message : "입력한 값을 확인해 주세요.");
    }
  }
  function sumItems() {
    try {
      const sum = items.reduce(
        (sum, i) => sum + parseMoney(i.price, currency) * Number(i.quantity),
        0,
      );
      setTotal(minorText(sum, currency));
      setError("");
    } catch {
      setError("상품 가격과 수량을 먼저 입력해 주세요.");
    }
  }
  return (
    <Sheet
      visible={visible}
      title={initial ? "영수증 상세" : "새로운 여행의 기록"}
      subtitle={
        initial
          ? "상품별 내역과 가격 공유 설정을 확인해요"
          : "사진으로 간편하게, 직접 입력으로 꼼꼼하게"
      }
      onClose={onClose}
    >
      {!initial && (
        <View style={s.upload}>
          <View style={s.uploadHeading}>
            <Icon name="scan" color={colors.primary} size={23} />
            <Text style={s.uploadTitle}>AI 영수증 분석</Text>
          </View>
          <Text style={s.uploadText}>
            사진 선택 시 AI 분석 서버로 전송돼요.{`\n`}사진 원본과 카드정보는
            서버에 저장하지 않아요.
          </Text>
          <View style={s.row}>
            <Button
              title="사진 선택"
              icon="image"
              onPress={() => {
                void pick(false);
              }}
              variant="outline"
              disabled={busy}
              style={{ flex: 1 }}
            />
            <Button
              title="촬영하기"
              icon="camera"
              onPress={() => {
                void pick(true);
              }}
              variant="soft"
              loading={busy}
              style={{ flex: 1 }}
            />
          </View>
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            testID="sample-receipt"
            onPress={() => {
              applyData(
                {
                  store: "마르셰 A · 시연 매장",
                  date: today(),
                  currency: "EUR",
                  category: "음식",
                  totalMinor: 600,
                  items: [
                    { name: "코카콜라 500ml", quantity: 2, unitMinor: 180 },
                    { name: "에비앙 500ml", quantity: 2, unitMinor: 120 },
                  ],
                },
                true,
              );
              setImage(null);
              setError("");
            }}
            style={{ paddingTop: 14 }}
          >
            <Text style={s.sampleText}>먼저 시연 영수증으로 체험하기 →</Text>
          </Pressable>
        </View>
      )}
      {image && (
        <Image source={{ uri: image }} resizeMode="contain" style={s.preview} />
      )}
      {source ? <Text style={s.source}>{source}</Text> : null}
      <Field
        label="매장명"
        value={store}
        onChangeText={setStore}
        placeholder="예: 마르셰 A"
        testID="receipt-store"
      />
      <Field
        label="구매일"
        value={date}
        onChangeText={setDate}
        placeholder="YYYY-MM-DD"
        testID="receipt-date"
      />
      <Label>카테고리</Label>
      <View style={s.chips}>
        {CATEGORIES.map((c) => (
          <Chip
            key={c.name}
            title={c.name}
            active={category === c.name}
            onPress={() => setCategory(c.name)}
          />
        ))}
      </View>
      <Label>결제 통화</Label>
      <View style={s.chips}>
        {Object.keys(CURRENCIES).map((c) => (
          <Chip
            key={c}
            title={c}
            active={currency === c}
            onPress={() => {
              setCurrency(c);
              setRate(
                c === trip.currency
                  ? String(trip.rate)
                  : c === "KRW"
                    ? "1"
                    : "",
              );
            }}
          />
        ))}
      </View>
      <Field
        label={`적용 환율 · 1 ${currency}당 원화 (직접 확인)`}
        value={rate}
        onChangeText={setRate}
        keyboardType="number-pad"
        placeholder="예: 1600"
      />
      <View style={s.itemsHeading}>
        <Text style={s.itemsTitle}>구매 상품</Text>
        <Text style={s.itemsNote}>가격은 개당 가격이에요</Text>
      </View>
      {items.map((item, index) => (
        <View key={index} style={s.itemCard}>
          <View style={s.itemNumberRow}>
            <Text style={s.itemNumber}>
              ITEM {String(index + 1).padStart(2, "0")}
            </Text>
            {items.length > 1 && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`상품 ${index + 1} 삭제`}
                onPress={() => setItems(items.filter((_, n) => n !== index))}
                style={{ padding: 6 }}
              >
                <Icon name="close" size={15} color={colors.muted} />
              </Pressable>
            )}
          </View>
          <Field
            label="상품명 · 용량 포함"
            value={item.name}
            onChangeText={(v) => updateItem(index, "name", v)}
            placeholder="예: 코카콜라 500ml"
            testID={`item-name-${index}`}
          />
          <View style={s.row}>
            <Field
              label="수량"
              value={item.quantity}
              onChangeText={(v) => updateItem(index, "quantity", v)}
              keyboardType="number-pad"
              testID={`item-quantity-${index}`}
            />
            <Field
              label={`개당 가격 (${currency})`}
              value={item.price}
              onChangeText={(v) => updateItem(index, "price", v)}
              keyboardType="decimal-pad"
              placeholder="0.00"
              testID={`item-price-${index}`}
            />
          </View>
        </View>
      ))}
      <Button
        title="상품 추가"
        icon="plus"
        variant="outline"
        onPress={() =>
          setItems([...items, { name: "", quantity: "1", price: "" }])
        }
      />
      <View style={{ marginTop: 20 }}>
        <Field
          label={`총 결제금액 (${currency})`}
          value={total}
          onChangeText={setTotal}
          keyboardType="decimal-pad"
          testID="receipt-total"
          placeholder="0.00"
        />
        <Pressable
          accessibilityRole="button"
          onPress={sumItems}
          style={{ alignSelf: "flex-end", padding: 8, marginTop: -13 }}
        >
          <Text style={s.sumLink}>상품 합계로 채우기 ↗</Text>
        </Pressable>
        <Text style={s.totalNote}>
          할인·세금은 상품별 가격에 반영해 합계를 맞춰 주세요.
        </Text>
      </View>
      <View style={s.consent}>
        <View style={s.consentTop}>
          <View style={{ flex: 1 }}>
            <Text style={s.consentTitle}>상품 가격을 다른 여행자와 공유</Text>
            <Text style={s.consentOptional}>
              선택 사항 · 언제든 변경할 수 있어요
            </Text>
          </View>
          <Switch
            accessibilityLabel="상품 가격 공유 동의"
            testID="share-consent"
            value={share}
            onValueChange={setShare}
            disabled={demo}
            trackColor={{ false: "#DDE6EE", true: "#85BDE4" }}
            thumbColor={share ? colors.primary : "#fff"}
          />
        </View>
        <Text style={s.consentText}>
          {demo
            ? "시연 영수증은 실제 가격 데이터로 공유되지 않아요."
            : "동의하면 매장명·주소·위치·상품명·개당 가격·구매일만 공유해요. 사진, 개인 결제정보, 원화 환산액은 공유하지 않아요."}
        </Text>
        {share && !demo && (
          <View style={{ marginTop: 18 }}>
            <Field
              label="매장 주소"
              testID="store-address"
              value={address}
              onChangeText={setAddress}
              placeholder="영수증의 매장 주소를 입력해 주세요"
            />
            <Button
              title={
                location
                  ? "매장 위치 다시 확인"
                  : "매장에 있다면 현재 위치 사용"
              }
              icon="location"
              variant="outline"
              loading={locating}
              onPress={() => {
                void storeLocation();
              }}
            />
            <Text style={s.totalNote}>
              {location
                ? `확인된 위치: ${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)}`
                : "매장에 있을 때만 위치를 등록해 주세요. 위치가 없으면 공유할 수 없어요."}
            </Text>
          </View>
        )}
      </View>
      {error ? (
        <Text accessibilityRole="alert" testID="receipt-error" style={s.error}>
          {error}
        </Text>
      ) : null}
      <Button
        title={initial ? "변경사항 저장" : "가계부에 저장하기"}
        icon="check"
        onPress={save}
        disabled={busy || locating}
        testID="save-receipt"
      />
      {initial && (
        <View style={{ marginTop: 12 }}>
          <Button
            title={
              deleteConfirm
                ? "삭제할게요 · 가계부와 공유 가격에서 삭제"
                : "이 영수증 삭제"
            }
            icon="trash"
            variant="danger"
            onPress={() => {
              if (deleteConfirm) onDelete(initial.id);
              else setDeleteConfirm(true);
            }}
            testID="delete-receipt"
          />
        </View>
      )}
    </Sheet>
  );
}
const s = StyleSheet.create({
  row: { flexDirection: "row", gap: 12 },
  upload: {
    backgroundColor: "#F0F6FC",
    borderRadius: 17,
    padding: 17,
    marginBottom: 22,
  },
  uploadHeading: { flexDirection: "row", alignItems: "center", gap: 9 },
  uploadTitle: { color: colors.primary, fontWeight: "700", fontSize: 14 },
  uploadText: {
    color: "#7B92A7",
    fontSize: 11,
    lineHeight: 19,
    marginTop: 9,
    marginBottom: 16,
  },
  sampleText: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: "600",
    textAlign: "center",
  },
  preview: { width: "100%", height: 150, borderRadius: 12, marginBottom: 15 },
  source: {
    fontSize: 11,
    lineHeight: 18,
    color: colors.primary,
    marginBottom: 18,
    backgroundColor: "#EAF4FD",
    padding: 12,
    borderRadius: 10,
  },
  chips: { flexDirection: "row", gap: 7, flexWrap: "wrap", marginBottom: 20 },
  itemsHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  itemsTitle: { color: colors.ink, fontSize: 15, fontWeight: "700" },
  itemsNote: { fontSize: 10, color: colors.muted },
  itemCard: {
    backgroundColor: "#F8FAFC",
    borderRadius: 15,
    padding: 15,
    marginBottom: 12,
  },
  itemNumberRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  itemNumber: {
    color: "#8BA2B7",
    letterSpacing: 1,
    fontSize: 9,
    fontWeight: "700",
  },
  sumLink: { color: colors.primary, fontSize: 11, fontWeight: "600" },
  totalNote: {
    fontSize: 10,
    color: colors.muted,
    lineHeight: 17,
    marginTop: 8,
  },
  consent: {
    backgroundColor: "#F3F7FA",
    borderRadius: 16,
    padding: 17,
    marginVertical: 22,
  },
  consentTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  consentTitle: { color: colors.ink, fontSize: 12, fontWeight: "700" },
  consentOptional: { color: colors.muted, fontSize: 9, marginTop: 6 },
  consentText: {
    color: "#8096A9",
    fontSize: 10,
    lineHeight: 18,
    marginTop: 12,
  },
  error: {
    fontSize: 12,
    lineHeight: 20,
    padding: 12,
    borderRadius: 10,
    color: "#B05445",
    backgroundColor: "#FFF1ED",
    marginBottom: 16,
  },
});
