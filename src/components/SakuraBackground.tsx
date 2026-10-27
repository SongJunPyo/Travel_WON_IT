import React from "react";
import { View, StyleSheet } from "react-native";
import Svg, { G, Path, Circle } from "react-native-svg";

function Blossom({
  x,
  y,
  scale = 1,
  rotation = 0,
}: {
  x: number;
  y: number;
  scale?: number;
  rotation?: number;
}) {
  return (
    <G transform={`translate(${x} ${y}) rotate(${rotation}) scale(${scale})`}>
      {[0, 72, 144, 216, 288].map((angle) => (
        <Path
          key={angle}
          d="M0 2C-11-2-16-14-10-19C-6-23-2-19 0-15C2-19 6-23 10-19C16-14 11-2 0 2Z"
          transform={`rotate(${angle})`}
          fill="#EDB1C5"
          stroke="#DC95AE"
          strokeWidth={0.65}
        />
      ))}
      <Circle r={4} fill="#FFF3D9" />
      <Circle r={1.8} fill="#DAA7AE" />
    </G>
  );
}

export function SakuraBackground({
  testID = "trip-sakura-background",
}: {
  testID?: string;
}) {
  return (
    <View
      pointerEvents="none"
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID={testID}
      style={StyleSheet.absoluteFill}
    >
      <Svg width="100%" height="100%" viewBox="0 0 560 900" preserveAspectRatio="xMidYMid slice">
        <G opacity={0.32}>
          <G fill="none" stroke="#C6A5AE" strokeLinecap="round">
            <Path d="M592 35C524 53 520 112 464 145C432 164 408 170 387 200" strokeWidth={2.4} />
            <Path d="M522 94C501 88 477 90 454 73M471 140C464 118 450 105 431 101M447 157C438 181 420 200 404 208" strokeWidth={1.5} />
            <Path d="M-24 591C22 626 35 687 89 711C115 723 140 727 158 751" strokeWidth={2.4} />
            <Path d="M30 662C58 651 76 649 96 657M73 704C68 729 80 750 89 767M113 721C126 706 139 701 157 700" strokeWidth={1.5} />
          </G>
          <Blossom x={527} y={87} scale={1.1} rotation={12} />
          <Blossom x={487} y={126} scale={0.85} rotation={-18} />
          <Blossom x={454} y={73} scale={0.65} rotation={30} />
          <Blossom x={430} y={104} scale={0.85} rotation={10} />
          <Blossom x={447} y={160} scale={1.1} rotation={30} />
          <Blossom x={398} y={205} scale={0.7} rotation={-10} />
          <Blossom x={24} y={641} scale={1.05} rotation={15} />
          <Blossom x={67} y={686} scale={0.8} rotation={-20} />
          <Blossom x={97} y={654} scale={0.65} rotation={35} />
          <Blossom x={91} y={760} scale={0.9} rotation={20} />
          <Blossom x={124} y={727} scale={0.95} rotation={-8} />
          <Blossom x={159} y={699} scale={0.55} rotation={16} />
        </G>
        <G fill="#E7A4BC" opacity={0.22}>
          <Path d="M68 154Q84 144 83 162Q73 170 68 154Z" />
          <Path d="M358 286Q374 280 370 296Q360 302 358 286Z" />
          <Path d="M487 407Q505 405 496 420Q484 423 487 407Z" />
          <Path d="M169 464Q182 452 185 470Q177 480 169 464Z" />
          <Path d="M317 640Q334 634 328 651Q317 655 317 640Z" />
          <Path d="M440 800Q457 791 454 809Q444 817 440 800Z" />
          <Path d="M221 847Q236 841 232 856Q222 861 221 847Z" />
        </G>
      </Svg>
    </View>
  );
}
