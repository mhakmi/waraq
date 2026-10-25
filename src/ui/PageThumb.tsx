import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import type { Rotation } from '../scan/batch';
import { useColors } from '../theme';

type PageThumbProps = {
  uri: string;
  width: number;
  height: number;
  rotation: Rotation;
  maxHeight: number;
  maxWidth?: number;
};

export function PageThumb({ uri, width, height, rotation, maxHeight, maxWidth = Infinity }: PageThumbProps) {
  const colors = useColors();
  const sideways = rotation === 90 || rotation === 270;
  const shownWidth = sideways ? height : width;
  const shownHeight = sideways ? width : height;
  const scale = Math.min(maxHeight / shownHeight, maxWidth / shownWidth);
  const boxWidth = shownWidth * scale;
  const boxHeight = shownHeight * scale;
  const imageWidth = sideways ? boxHeight : boxWidth;
  const imageHeight = sideways ? boxWidth : boxHeight;
  return (
    <View
      style={[
        styles.box,
        { width: boxWidth, height: boxHeight, backgroundColor: colors.paper, borderColor: colors.line },
      ]}
    >
      <Image
        source={{ uri }}
        contentFit="cover"
        style={{ width: imageWidth, height: imageHeight, transform: [{ rotate: `${rotation}deg` }] }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  box: { overflow: 'hidden', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: 2 },
});
