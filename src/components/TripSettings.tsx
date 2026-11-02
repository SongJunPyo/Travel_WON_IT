import React, { useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Sheet, Field, Button, Label, Icon, colors } from "./ui";
import {
  validDate,
  parseMoney,
  dateInput,
  budgetInput,
  TRIP_COUNTRIES,
  tripCountry,
} from "../domain.mjs";
import type { TravelState } from "../types";

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
  // 목록에 있는 국가면 통화를 그 나라 통화로 맞춰서 엽니다. 목록에 없으면 '선택'부터 다시 고릅니다.
  const [draft, setDraft] = useState(() => tripCountry(trip, trip.country)),
    [countryMenu, setCountryMenu] = useState(false),
    [budget, setBudget] = useState(budgetInput(trip.budget ?? "")),
    [error, setError] = useState(""),
    [confirm, setConfirm] = useState(false);
  const selected = TRIP_COUNTRIES.find((c) => c.name === draft.country);
  function save() {
    try {
      if (!draft.country) throw new Error("여행 국가를 선택해 주세요.");
      if (!draft.city.trim()) throw new Error("여행 도시를 입력해 주세요.");
      if (
        !validDate(draft.start) ||
        !validDate(draft.end) ||
        draft.end < draft.start
      )
        throw new Error("여행 기간을 확인해 주세요.");
      onSave({
        ...draft,
        city: draft.city.trim(),
        country: draft.country.trim(),
        budget: parseMoney(budget.replaceAll(",", ""), "KRW"),
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
      <View style={s.field}>
        <Label>여행 국가</Label>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="여행 국가 선택"
          accessibilityState={{ expanded: countryMenu }}
          onPress={() => setCountryMenu(!countryMenu)}
          testID="trip-country"
          style={s.picker}
        >
          <Text style={[s.pickerText, !selected && { color: "#A0AFBD" }]}>
            {selected ? selected.name : "선택"}
          </Text>
          <View
            style={{
              transform: [{ rotate: countryMenu ? "-90deg" : "90deg" }],
            }}
          >
            <Icon name="chevron" size={14} color={colors.muted} />
          </View>
        </Pressable>
        {countryMenu && (
          <View style={s.menu} testID="trip-country-menu">
            {TRIP_COUNTRIES.map((c) => (
              <Pressable
                key={c.name}
                accessibilityRole="button"
                onPress={() => {
                  setDraft(tripCountry(draft, c.name));
                  setCountryMenu(false);
                }}
                testID={`trip-country-${c.currency}`}
                style={[s.option, c === selected && s.optionActive]}
              >
                <Text
                  style={[
                    s.pickerText,
                    c === selected && { color: colors.primary },
                  ]}
                >
                  {c.name}
                </Text>
              </Pressable>
            ))}
          </View>
        )}
        {selected ? (
          <Text style={s.currency} testID="trip-currency">
            통화: {selected.unit}({selected.currency})
          </Text>
        ) : null}
      </View>
      <Field
        label="여행 도시"
        value={draft.city}
        onChangeText={(city) => setDraft({ ...draft, city })}
        placeholder="예: 도쿄"
        testID="trip-city"
      />
      <View style={{ flexDirection: "row", gap: 12 }}>
        <Field
          label="여행 시작일"
          value={draft.start}
          onChangeText={(start) =>
            setDraft({ ...draft, start: dateInput(start) })
          }
          keyboardType="number-pad"
          placeholder="YYYY-MM-DD"
          testID="trip-start"
        />
        <Field
          label="여행 종료일"
          value={draft.end}
          onChangeText={(end) =>
            setDraft({ ...draft, end: dateInput(end) })
          }
          keyboardType="number-pad"
          placeholder="YYYY-MM-DD"
          testID="trip-end"
        />
      </View>
      <Field
        label="전체 여행 예산 (원)"
        value={budget}
        onChangeText={(text) => setBudget(budgetInput(text))}
        keyboardType="number-pad"
        placeholder="예: 1,000,000"
        testID="trip-budget"
      />
      <Text style={s.note}>
        원화 환산에는 각 영수증에 입력한 적용 환율을 사용해요.
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
  field: { marginBottom: 18 },
  picker: {
    minHeight: 49,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    paddingHorizontal: 14,
    backgroundColor: "#F9FBFD",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  pickerText: { fontSize: 14, color: colors.ink },
  menu: {
    marginTop: 6,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    backgroundColor: "#fff",
    overflow: "hidden",
  },
  option: { paddingVertical: 12, paddingHorizontal: 14 },
  optionActive: { backgroundColor: colors.soft },
  currency: { fontSize: 11, color: colors.muted, marginTop: 6 },
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
