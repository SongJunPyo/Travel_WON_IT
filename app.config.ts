import type { ExpoConfig } from "expo/config";

const config: ExpoConfig = {
  name: "여행WON해",
  slug: "travel-wonhae",
  version: "1.0.0",
  orientation: "portrait",
  userInterfaceStyle: "light",
  scheme: "travelwonhae",
  icon: "./assets/travel-pudding.png",
  ios: { supportsTablet: true, bundleIdentifier: "com.wonit.travelwonhae" },
  android: {
    package: "com.wonit.travelwonhae",
    adaptiveIcon: {
      foregroundImage: "./assets/travel-pudding.png",
      backgroundColor: "#EAF5FF",
    },
  },
  web: {
    name: "여행WON해",
    favicon: "./assets/travel-pudding.png",
    bundler: "metro",
  },
  plugins: [
    "expo-status-bar",
    [
      "expo-image-picker",
      {
        photosPermission: "영수증 사진을 선택해 여행 지출을 기록해요.",
        cameraPermission: "영수증을 촬영해 여행 지출을 기록해요.",
        microphonePermission: false,
      },
    ],
    [
      "expo-location",
      {
        locationWhenInUsePermission: "동의하면 주변 매장과의 거리를 계산해요.",
      },
    ],
  ],
};
export default config;
