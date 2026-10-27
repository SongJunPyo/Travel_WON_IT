import React, { useState } from "react";
import {
  View,
  Image,
  Text,
  Pressable,
  StyleSheet,
  Linking,
} from "react-native";
import { colors, Icon } from "./ui";
import { money, storeLabel } from "../domain.mjs";
import type { Coordinate, Price } from "../types";

// Mapbox 공개 토큰(pk.)이 있으면 Mapbox 타일을, 없으면 OpenStreetMap 타일을 사용합니다.
const MAPBOX_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN || "";
const tileUrl = (zoom: number, x: number, y: number) =>
  MAPBOX_TOKEN
    ? `https://api.mapbox.com/styles/v1/mapbox/streets-v12/tiles/256/${zoom}/${x}/${y}@2x?access_token=${MAPBOX_TOKEN}`
    : `https://tile.openstreetmap.org/${zoom}/${x}/${y}.png`;
// Web Mercator: 지도 타일과 모든 마커에 동일한 좌표 변환을 적용합니다.
function project(point: Coordinate, zoom: number) {
  const scale = 256 * 2 ** zoom;
  const latitude = Math.max(-85.0511, Math.min(85.0511, point.latitude));
  const sin = Math.sin((latitude * Math.PI) / 180);
  return {
    x: ((point.longitude + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale,
  };
}
export function PriceMap({
  center,
  prices,
  selected,
  onSelect,
}: {
  center: Coordinate;
  prices: Price[];
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  const [width, setWidth] = useState(360),
    [zoom, setZoom] = useState(14),
    [failed, setFailed] = useState(false);
  const height = 360,
    selectedPrice = prices.find((p) => p.id === selected),
    origin = project(selectedPrice || center, zoom),
    left = origin.x - width / 2,
    top = origin.y - height / 2;
  const userPoint = project(center, zoom);
  const tiles = [];
  for (
    let x = Math.floor(left / 256);
    x <= Math.floor((left + width) / 256);
    x++
  ) {
    for (
      let y = Math.floor(top / 256);
      y <= Math.floor((top + height) / 256);
      y++
    ) {
      const wrappedX = ((x % 2 ** zoom) + 2 ** zoom) % 2 ** zoom;
      if (y >= 0 && y < 2 ** zoom)
        tiles.push(
          <Image
            key={`${zoom}-${x}-${y}`}
            source={{ uri: tileUrl(zoom, wrappedX, y) }}
            onError={() => setFailed(true)}
            style={{
              position: "absolute",
              left: x * 256 - left,
              top: y * 256 - top,
              width: 256,
              height: 256,
            }}
          />,
        );
    }
  }
  return (
    <View
      accessibilityLabel="주변 매장 지도"
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={s.map}
    >
      {tiles}
      {failed && (
        <View style={s.failed}>
          <Text style={s.failedText}>
            지도를 불러오지 못했어요. 아래 매장 목록을 확인해 주세요.
          </Text>
        </View>
      )}
      <View
        pointerEvents="none"
        style={[
          s.youHalo,
          { left: userPoint.x - left - 19, top: userPoint.y - top - 19 },
        ]}
      >
        <View style={s.you} />
      </View>
      {prices.map((p, i) => {
        const pos = project(p, zoom);
        const active = p.id === selected;
        return (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${storeLabel(p)} ${money(p.unitMinor, p.currency)}`}
            key={p.id}
            onPress={() => onSelect(p.id)}
            style={[
              s.marker,
              {
                left: pos.x - left - 29,
                top: pos.y - top - 31,
                backgroundColor: active || i === 0 ? colors.primary : "#fff",
                zIndex: active ? 8 : 3,
              },
            ]}
          >
            <Text
              style={[s.markerText, (active || i === 0) && { color: "#fff" }]}
            >
              {money(p.unitMinor, p.currency)}
            </Text>
            <View
              style={[
                s.markerTip,
                { borderTopColor: active || i === 0 ? colors.primary : "#fff" },
              ]}
            />
          </Pressable>
        );
      })}
      <View style={s.zoom}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="지도 확대"
          onPress={() => setZoom((z) => Math.min(17, z + 1))}
          style={s.zoomButton}
        >
          <Icon name="plus" size={18} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="지도 축소"
          onPress={() => setZoom((z) => Math.max(12, z - 1))}
          style={s.zoomButton}
        >
          <Text style={{ fontSize: 23, color: colors.ink }}>−</Text>
        </Pressable>
      </View>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={
          MAPBOX_TOKEN ? "Mapbox 저작권 정보" : "OpenStreetMap 저작권 정보"
        }
        onPress={() =>
          Linking.openURL(
            MAPBOX_TOKEN
              ? "https://www.mapbox.com/about/maps/"
              : "https://www.openstreetmap.org/copyright",
          )
        }
        style={s.credit}
      >
        <Text style={{ fontSize: 9, color: "#345367" }}>
          {MAPBOX_TOKEN
            ? "© Mapbox © OpenStreetMap"
            : "© OpenStreetMap contributors"}
        </Text>
      </Pressable>
    </View>
  );
}
const s = StyleSheet.create({
  map: {
    height: 360,
    backgroundColor: "#E6EEF3",
    borderRadius: 20,
    overflow: "hidden",
  },
  youHalo: {
    position: "absolute",
    width: 38,
    height: 38,
    borderRadius: 25,
    backgroundColor: "#0067AC22",
    alignItems: "center",
    justifyContent: "center",
  },
  you: {
    width: 15,
    height: 15,
    borderWidth: 3,
    borderColor: "#fff",
    borderRadius: 12,
    backgroundColor: "#2687D2",
  },
  marker: {
    position: "absolute",
    paddingHorizontal: 10,
    height: 31,
    minWidth: 58,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 10,
    boxShadow: "0px 3px 8px #183A5625",
  },
  markerText: { fontSize: 12, fontWeight: "800", color: colors.primary },
  markerTip: {
    position: "absolute",
    bottom: -6,
    borderTopWidth: 7,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
  },
  zoom: {
    position: "absolute",
    bottom: 30,
    right: 12,
    borderRadius: 12,
    backgroundColor: "#fff",
    overflow: "hidden",
  },
  zoomButton: {
    height: 34,
    width: 35,
    justifyContent: "center",
    alignItems: "center",
  },
  credit: {
    position: "absolute",
    bottom: 0,
    right: 0,
    padding: 4,
    backgroundColor: "#FFFFFFDF",
  },
  failed: {
    position: "absolute",
    top: 12,
    left: 12,
    right: 12,
    backgroundColor: "#fff",
    padding: 8,
    borderRadius: 8,
    zIndex: 9,
  },
  failedText: { fontSize: 11, color: colors.muted },
});
