import React, { useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { colors, Icon } from "./ui";

const weekdays = ["일", "월", "화", "수", "목", "금", "토"];

export function Calendar({
  value,
  minDate,
  label,
  onSelect,
}: {
  value: string;
  minDate?: string;
  label: string;
  onSelect: (date: string) => void;
}) {
  const [month, setMonth] = useState(value.slice(0, 7));
  const first = new Date(`${month}-01T00:00:00Z`);
  const last = new Date(first);
  last.setUTCMonth(last.getUTCMonth() + 1, 0);
  const offset = first.getUTCDay();
  const cells = Array.from(
    { length: Math.ceil((offset + last.getUTCDate()) / 7) * 7 },
    (_, index) => {
      const day = index - offset + 1;
      return day > 0 && day <= last.getUTCDate() ? day : null;
    },
  );
  const previousDisabled =
    month === "0000-01" || (!!minDate && month <= minDate.slice(0, 7));

  function moveMonth(amount: number) {
    const date = new Date(first);
    date.setUTCMonth(date.getUTCMonth() + amount);
    setMonth(date.toISOString().slice(0, 7));
  }

  return (
    <View style={s.calendar} testID="trip-calendar" accessibilityLabel={`${label} 달력`}>
      <Text style={s.label}>{label} 선택</Text>
      <View style={s.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="이전 달"
          disabled={previousDisabled}
          accessibilityState={{ disabled: previousDisabled }}
          testID="calendar-previous-month"
          onPress={() => moveMonth(-1)}
          style={[s.navigation, previousDisabled && s.disabled]}
        >
          <View style={{ transform: [{ rotate: "180deg" }] }}>
            <Icon name="chevron" size={18} />
          </View>
        </Pressable>
        <Text style={s.month} accessibilityRole="header" testID="calendar-month">
          {Number(month.slice(0, 4))}년 {Number(month.slice(5))}월
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="다음 달"
          disabled={month === "9999-12"}
          accessibilityState={{ disabled: month === "9999-12" }}
          testID="calendar-next-month"
          onPress={() => moveMonth(1)}
          style={[s.navigation, month === "9999-12" && s.disabled]}
        >
          <Icon name="chevron" size={18} />
        </Pressable>
      </View>
      <View style={s.row}>
        {weekdays.map((day) => (
          <Text key={day} style={s.weekday}>
            {day}
          </Text>
        ))}
      </View>
      {Array.from({ length: cells.length / 7 }, (_, week) => (
        <View key={week} style={s.row}>
          {cells.slice(week * 7, week * 7 + 7).map((day, index) => {
            if (day === null) return <View key={index} style={s.day} />;
            const date = `${month}-${String(day).padStart(2, "0")}`;
            const disabled = !!minDate && date < minDate;
            const selected = date === value;
            return (
              <Pressable
                key={index}
                accessibilityRole="button"
                accessibilityLabel={`${Number(month.slice(0, 4))}년 ${Number(month.slice(5))}월 ${day}일`}
                accessibilityState={{ disabled, selected }}
                disabled={disabled}
                testID={`calendar-day-${date}`}
                onPress={() => onSelect(date)}
                style={({ pressed }) => [
                  s.day,
                  selected && s.selected,
                  disabled && s.disabled,
                  pressed && !disabled && { opacity: 0.65 },
                ]}
              >
                <Text style={[s.dayText, selected && s.selectedText]}>{day}</Text>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  calendar: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 16,
    padding: 12,
    marginBottom: 18,
    backgroundColor: "#fff",
    gap: 4,
  },
  label: { color: colors.muted, fontSize: 12, marginBottom: 2 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  navigation: { padding: 12, borderRadius: 12, backgroundColor: colors.bg },
  month: { fontSize: 15, fontWeight: "700", color: colors.ink },
  row: { flexDirection: "row", gap: 3 },
  weekday: { flex: 1, textAlign: "center", paddingVertical: 8, fontSize: 12, color: colors.muted },
  day: { flex: 1, minHeight: 40, alignItems: "center", justifyContent: "center", borderRadius: 10 },
  dayText: { fontSize: 14, color: colors.ink },
  selected: { backgroundColor: colors.primary },
  selectedText: { color: "#fff", fontWeight: "700" },
  disabled: { opacity: 0.25 },
});
