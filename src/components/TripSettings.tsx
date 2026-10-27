import React, { useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Sheet, Field, Button, Label, Icon, colors } from "./ui";
import { Calendar } from "./Calendar";
import { validDate, parseMoney } from "../domain.mjs";
import { countryInfo } from "../countries.mjs";
import type { TravelState } from "../types";

const formatBudget = (value: string) =>
  value.replace(/^0+(?=\d)/, "").replace(/\B(?=(\d{3})+(?!\d))/g, ",");

export function TripSettings({
  trip,
  onClose,
  onSave,
  onClear,
}: {
  trip: TravelState["trip"];
  onClose: () => void;
  onSave: (trip: TravelState["trip"]) => void;
  onClear: () => void;
}) {
  const [draft, setDraft] = useState(trip),
    [budget, setBudget] = useState(formatBudget(String(trip.budget))),
    [activeDate, setActiveDate] = useState<"start" | "end" | null>(null),
    [error, setError] = useState(""),
    [confirm, setConfirm] = useState(false);
  const country = countryInfo(draft.country);
  function save() {
    try {
      if (!country.name) throw new Error("여행 나라를 입력해 주세요.");
      if (
        !validDate(draft.start) ||
        !validDate(draft.end) ||
        draft.end < draft.start
      )
        throw new Error("여행 기간을 확인해 주세요.");
      onSave({
        ...draft,
        country: country.name,
        budget: parseMoney(budget.replace(/,/g, ""), "KRW"),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "입력값을 확인해 주세요.");
    }
  }
  return (
    <Sheet
      visible
      title="나의 여행 설정"
      subtitle="이번 여행에 맞게 예산과 기간을 정해요"
      onClose={onClose}
    >
      <Field
        label="여행 나라"
        value={draft.country}
        onChangeText={(country) => setDraft({ ...draft, country })}
        placeholder="예: 일본, 프랑스"
        autoCapitalize="none"
        testID="trip-country"
      />
      {!!country.name && (
        <View style={[s.countryPreview, country.theme === "sakura" && s.sakuraPreview]}>
          <Text
            style={s.countryFlag}
            accessibilityLabel={country.flag === "🌐" ? "여행 나라" : `${country.name} 국기`}
            testID="trip-country-flag"
          >
            {country.flag}
          </Text>
          <Text style={s.countryName}>{country.name} 여행</Text>
        </View>
      )}
      <View style={{ flexDirection: "row", gap: 12 }}>
        {(["start", "end"] as const).map((field) => {
          const label = field === "start" ? "여행 시작일" : "여행 종료일";
          return (
            <View key={field} style={s.dateField}>
              <Label>{label}</Label>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${label} ${draft[field]}`}
                accessibilityState={{ expanded: activeDate === field }}
                testID={`trip-${field}`}
                onPress={() => setActiveDate(activeDate === field ? null : field)}
                style={[s.dateButton, activeDate === field && s.dateActive]}
              >
                <Text style={s.dateText}>{draft[field].replace(/-/g, ".")}</Text>
                <Icon name="down" size={16} color={colors.muted} />
              </Pressable>
            </View>
          );
        })}
      </View>
      {activeDate && (
        <Calendar
          key={activeDate}
          value={draft[activeDate]}
          minDate={activeDate === "end" ? draft.start : undefined}
          label={activeDate === "start" ? "여행 시작일" : "여행 종료일"}
          onSelect={(date) => {
            if (activeDate === "end" && date < draft.start) return;
            setDraft((current) =>
              activeDate === "start"
                ? { ...current, start: date, end: current.end < date ? date : current.end }
                : { ...current, end: date },
            );
            setActiveDate(null);
            setError("");
          }}
        />
      )}
      <Text style={s.dateHint}>종료일은 시작일 당일부터 선택할 수 있어요.</Text>
      <Field
        label="전체 여행 예산 (원)"
        value={budget}
        onChangeText={(value) => {
          const digits = value.replace(/,/g, "");
          if (/^\d*$/.test(digits)) setBudget(formatBudget(digits));
        }}
        keyboardType="number-pad"
        testID="trip-budget"
      />
      <Text style={s.note}>
        원화 환산에는 각 영수증에 입력한 환율을 사용해요. 시연 환율 1 EUR =
        1,600원은 실시간 환율이 아니에요.
      </Text>
      {error ? (
        <Text accessibilityRole="alert" style={s.error}>
          {error}
        </Text>
      ) : null}
      <Button
        title="여행 설정 저장"
        icon="check"
        onPress={save}
        testID="save-settings"
      />
      <View style={s.divider} />
      <Text style={s.demoTitle}>나의 기록으로 시작하기</Text>
      <Text style={s.note}>
        시연 영수증만 삭제하고 직접 기록을 시작할 수 있어요. 직접 등록한
        영수증과 예산은 유지돼요.
      </Text>
      <Button
        title={confirm ? "시연 영수증을 삭제할게요" : "시연 영수증 지우기"}
        variant="outline"
        icon="trash"
        onPress={() => {
          if (confirm) onClear();
          else setConfirm(true);
        }}
        testID="clear-demo"
      />
    </Sheet>
  );
}
const s = StyleSheet.create({
  countryPreview: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: colors.bg,
    borderRadius: 12,
    marginTop: -8,
    marginBottom: 18,
  },
  sakuraPreview: { backgroundColor: "#FFF0F5" },
  countryFlag: { fontSize: 22 },
  countryName: { color: colors.ink, fontSize: 13, flexShrink: 1 },
  dateField: { flex: 1, minWidth: 0, marginBottom: 12 },
  dateButton: {
    minHeight: 49,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 12,
    backgroundColor: "#F9FBFD",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 4,
  },
  dateActive: { borderColor: colors.primary, backgroundColor: colors.soft },
  dateText: { color: colors.ink, fontSize: 13 },
  dateHint: { fontSize: 11, color: colors.muted, lineHeight: 18, marginBottom: 18 },
  note: { fontSize: 11, color: colors.muted, lineHeight: 20, marginBottom: 20 },
  error: { fontSize: 12, color: "#B05445", marginBottom: 15 },
  divider: { height: 1, backgroundColor: colors.line, marginVertical: 25 },
  demoTitle: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 9,
  },
});
