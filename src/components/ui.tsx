import React from "react";
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  type TextInputProps,
  type ViewStyle,
} from "react-native";
import Svg, { Path, Circle, Rect } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export const colors = {
  primary: "#0067AC",
  ink: "#183A56",
  muted: "#73869A",
  bg: "#F4F8FC",
  line: "#E7EEF5",
  soft: "#EAF4FD",
  mint: "#67C7C1",
};
const paths: Record<string, string> = {
  wallet: "M3 6h16v4M3 6v13h18V9H5a2 2 0 0 1 0-4h13M16 13h5v4h-5z",
  pin: "M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0zM12 7v6M9 10h6",
  receipt: "M5 3h14v19l-3-2-4 2-4-2-3 2V3zM8 8h8M8 12h8M8 16h4",
  scan: "M8 3H3v5M16 3h5v5M21 16v5h-5M8 21H3v-5M7 12h10M8 7h8v10H8z",
  plus: "M12 5v14M5 12h14",
  search: "M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0",
  chevron: "M9 5l7 7-7 7",
  down: "M6 9l6 6 6-6",
  close: "M6 6l12 12M18 6 6 18",
  sparkles:
    "M12 3l2.6 6.4L21 12l-6.4 2.6L12 21l-2.6-6.4L3 12l6.4-2.6L12 3zM20 2v4M18 4h4",
  arrow: "M4 12h16M14 6l6 6-6 6",
  edit: "M14 5l5 5M4 20l5-1L21 7l-4-4L5 15l-1 5z",
  check: "M5 12l4 4L19 6",
  location:
    "M12 2v3M12 19v3M2 12h3M19 12h3M18 12a6 6 0 1 1-12 0 6 6 0 0 1 12 0",
  bed: "M3 18V6M3 11h18v7M3 16h18M7 11V7h6v4M13 11V7h6v4",
  bag: "M4 7h16l-1 14H5L4 7zM8 8V6a4 4 0 0 1 8 0v2",
  food: "M5 3v7a3 3 0 0 0 6 0V3M8 3v18M18 3c-4 4-4 9 0 9h1M19 3v18",
  train: "M6 18l-2 4M18 18l2 4M5 4h14v14H5V4zM5 11h14M12 4v7M8 15h.1M16 15h.1",
  ticket:
    "M3 5h18v5a2 2 0 0 0 0 4v5H3v-5a2 2 0 0 0 0-4V5zM15 5v3M15 11v2M15 16v3",
  more: "M5 12h.1M12 12h.1M19 12h.1",
  info: "M12 10v7M12 7h.1M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0",
  camera: "M3 7h4l2-3h6l2 3h4v14H3V7zM16 13a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
  image: "M3 3h18v18H3V3zM3 17l6-6 5 5 3-3 4 4M16 7h.1",
  trash: "M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7",
  globe:
    "M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0M2 12h20M12 2c-6 5-6 15 0 20 6-5 6-15 0-20",
  landmark: "M3 21h18M5 21V10M9 21V10M15 21V10M19 21V10M2 10l10-6 10 6H2z",
  shirt: "M8 3L3 6l2 4 3-1v12h8V9l3 1 2-4-5-3a4 4 0 0 1-8 0z",
  leaf: "M5 19C5 10 11 5 20 5c0 9-5 15-14 15M5 19l7-7",
  mountain: "M2 20l7-12 5 8 3-4 5 8H2z",
  car: "M3 13l2-6h14l2 6v5H3v-5zM3 13h18M7 18v2M17 18v2M7 15.5h.1M17 15.5h.1",
};
export function Icon({
  name,
  size = 22,
  color = colors.ink,
  strokeWidth = 1.7,
}: {
  name: string;
  size?: number;
  color?: string;
  strokeWidth?: number;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d={paths[name] || paths.receipt}
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
export function Label({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: any;
}) {
  return <Text style={[s.label, style]}>{children}</Text>;
}
export function Button({
  title,
  onPress,
  icon,
  variant = "primary",
  disabled,
  loading,
  testID,
  style,
}: {
  title: string;
  onPress: () => void;
  icon?: string;
  variant?: "primary" | "soft" | "outline" | "danger";
  disabled?: boolean;
  loading?: boolean;
  testID?: string;
  style?: ViewStyle;
}) {
  const primary = variant === "primary";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      testID={testID}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        s.button,
        variant === "soft" && s.softButton,
        variant === "outline" && s.outlineButton,
        variant === "danger" && s.dangerButton,
        { opacity: disabled ? 0.45 : pressed ? 0.75 : 1 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={primary ? "#fff" : colors.primary} />
      ) : (
        icon && (
          <Icon
            name={icon}
            color={
              primary
                ? "#fff"
                : variant === "danger"
                  ? "#C05A57"
                  : colors.primary
            }
            size={19}
          />
        )
      )}
      <Text
        style={[
          s.buttonText,
          !primary && {
            color: variant === "danger" ? "#C05A57" : colors.primary,
          },
        ]}
      >
        {title}
      </Text>
    </Pressable>
  );
}
export function Field({ label, ...props }: TextInputProps & { label: string }) {
  return (
    <View style={s.field}>
      <Label>{label}</Label>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor="#A0AFBD"
        {...props}
        style={[s.input, props.style]}
      />
    </View>
  );
}
export function Chip({
  title,
  active,
  onPress,
  testID,
  disabled,
}: {
  title: string;
  active?: boolean;
  onPress?: () => void;
  testID?: string;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ selected: !!active, disabled: !!disabled }}
      onPress={onPress}
      disabled={disabled}
      testID={testID}
      style={[s.chip, active && s.chipActive, disabled && { opacity: 0.45 }]}
    >
      <Text
        style={[
          s.chipText,
          active && { color: colors.primary, fontWeight: "700" },
        ]}
      >
        {title}
      </Text>
    </Pressable>
  );
}
export function Sheet({
  visible,
  title,
  subtitle,
  onClose,
  children,
}: {
  visible: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={s.backdrop}
      >
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityLabel="닫기"
        />
        <View
          style={[
            s.sheet,
            { paddingBottom: Math.max(insets.bottom, 20), maxHeight: "92%" },
          ]}
        >
          <View style={s.handle} />
          <View style={s.sheetHeader}>
            <View style={{ flex: 1 }}>
              <Text style={s.sheetTitle}>{title}</Text>
              {subtitle && <Text style={s.subtitle}>{subtitle}</Text>}
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="창 닫기"
              onPress={onClose}
              style={s.close}
            >
              <Icon name="close" />
            </Pressable>
          </View>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 16 }}
            showsVerticalScrollIndicator={false}
          >
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
export function Empty({
  title,
  detail,
  icon = "receipt",
}: {
  title: string;
  detail: string;
  icon?: string;
}) {
  return (
    <View style={s.empty}>
      <View style={s.emptyIcon}>
        <Icon name={icon} color={colors.primary} size={28} />
      </View>
      <Text style={s.emptyTitle}>{title}</Text>
      <Text style={s.emptyDetail}>{detail}</Text>
    </View>
  );
}
const s = StyleSheet.create({
  label: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.muted,
    marginBottom: 8,
  },
  button: {
    minHeight: 51,
    borderRadius: 15,
    backgroundColor: colors.primary,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 16,
  },
  buttonText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  softButton: { backgroundColor: colors.soft },
  outlineButton: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: colors.line,
  },
  dangerButton: { backgroundColor: "#FFF1EF" },
  field: { marginBottom: 18, flex: 1 },
  input: {
    minHeight: 49,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    backgroundColor: "#F9FBFD",
    color: colors.ink,
  },
  chip: {
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderRadius: 24,
    backgroundColor: "#F2F5F8",
    borderWidth: 1,
    borderColor: "transparent",
  },
  chipActive: { backgroundColor: "#EAF4FD", borderColor: "#D6E9FA" },
  chipText: { fontSize: 12, color: colors.muted, fontWeight: "500" },
  backdrop: {
    flex: 1,
    backgroundColor: "#102B4659",
    justifyContent: "flex-end",
    alignItems: "center",
  },
  sheet: {
    backgroundColor: "#fff",
    width: "100%",
    maxWidth: 560,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
  },
  handle: {
    height: 4,
    width: 34,
    borderRadius: 3,
    backgroundColor: "#DCE5ED",
    alignSelf: "center",
    marginTop: 12,
  },
  sheetHeader: {
    padding: 24,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  sheetTitle: {
    fontSize: 21,
    letterSpacing: -0.7,
    fontWeight: "800",
    color: colors.ink,
  },
  subtitle: { fontSize: 12, lineHeight: 19, color: colors.muted, marginTop: 6 },
  close: { padding: 10, borderRadius: 30, backgroundColor: colors.bg },
  empty: { alignItems: "center", padding: 30, gap: 12 },
  emptyIcon: { backgroundColor: colors.soft, padding: 16, borderRadius: 50 },
  emptyTitle: { color: colors.ink, fontWeight: "700", fontSize: 15 },
  emptyDetail: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 20,
    textAlign: "center",
  },
});
