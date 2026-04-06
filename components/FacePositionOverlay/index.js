import React, { useState } from 'react';
import { View, StyleSheet, Text } from 'react-native';
import Svg, { Defs, Mask, Rect, Path } from 'react-native-svg';

const FacePositionOverlay = ({ guideLine = true }) => {
  const [parentDimensions, setParentDimensions] = useState({
    width: 0,
    height: 0,
  });

  const handleLayout = event => {
    const { width, height } = event.nativeEvent.layout;
    setParentDimensions({ width, height });
  };

  if (parentDimensions.width === 0 || parentDimensions.height === 0) {
    return (
      <View style={StyleSheet.absoluteFillObject} onLayout={handleLayout} />
    );
  }

  const { width: pw, height: ph } = parentDimensions;

  // ─── INCREASED REALISTIC FACE PROPORTIONS ──────────────────────────────
  // Increased width from 0.65 to 0.75 for a larger, more comfortable capture area
  const faceWidth = pw * 0.75;
  const faceHeight = faceWidth * 1.35; // Slightly adjusted ratio to prevent it from getting too tall

  const cx = pw / 2;
  const cy = ph * 0.45; // Shifted slightly above center for a natural camera angle

  // Bounding box coordinates
  const topY = cy - faceHeight / 2;
  const bottomY = cy + faceHeight / 2;
  const leftX = cx - faceWidth / 2;
  const rightX = cx + faceWidth / 2;

  // ─── BEZIER CURVE PATH FOR HUMAN HEAD SILHOUETTE ────────────────────────
  const facePath = `
    M ${cx} ${topY}
    C ${cx + faceWidth * 0.45} ${topY}, ${rightX} ${
    cy - faceHeight * 0.2
  }, ${rightX} ${cy + faceHeight * 0.05}
    C ${rightX} ${cy + faceHeight * 0.35}, ${
    cx + faceWidth * 0.22
  } ${bottomY}, ${cx} ${bottomY}
    C ${cx - faceWidth * 0.22} ${bottomY}, ${leftX} ${
    cy + faceHeight * 0.35
  }, ${leftX} ${cy + faceHeight * 0.05}
    C ${leftX} ${cy - faceHeight * 0.2}, ${
    cx - faceWidth * 0.45
  } ${topY}, ${cx} ${topY}
    Z
  `;

  // ─── EYE MARKER POSITIONS ───────────────────────────────────────────────
  // Positioned naturally halfway down the face silhouette
  const eyeWidth = faceWidth * 0.26;
  const eyeHeight = faceWidth * 0.12;
  const eyeY = cy - faceHeight * 0.06; // Vertically positioned in the "eye line"

  // Symmetrical spacing from the center
  const eyeSpacing = faceWidth * 0.06;
  const leftEyeX = cx - eyeSpacing - eyeWidth;
  const rightEyeX = cx + eyeSpacing;

  return (
    <View style={StyleSheet.absoluteFillObject} onLayout={handleLayout}>
      {guideLine && (
        <View style={styles.guidelineContainer}>
          <Text style={styles.guidelineText}>
            Align your face within the frame
          </Text>
        </View>
      )}

      <Svg
        height="100%"
        width="100%"
        style={StyleSheet.absoluteFillObject}
        pointerEvents="none"
      >
        <Defs>
          <Mask id="faceMask">
            {/* White makes the background visible, Black creates the cutout */}
            <Rect width="100%" height="100%" fill="white" />
            <Path d={facePath} fill="black" />
          </Mask>
        </Defs>

        {/* Darkened Background Overlay */}
        <Rect
          width="100%"
          height="100%"
          fill="rgba(0,0,0,0.65)"
          mask="url(#faceMask)"
        />

        {/* Premium Dashed Contour Border */}
        <Path
          d={facePath}
          fill="none"
          stroke="#ffffff"
          strokeWidth="3.5"
          strokeOpacity={0.85}
          strokeDasharray="12 8"
          strokeLinecap="round"
        />

        {/* Left Eye Target */}
        <Rect
          x={leftEyeX}
          y={eyeY}
          width={eyeWidth}
          height={eyeHeight}
          rx={eyeHeight / 2} // Perfectly rounded pill shape
          fill="none"
          stroke="#ffffff"
          strokeWidth="2.5"
          strokeOpacity={0.6}
          strokeDasharray="6 6" // Subtle dashes to match the premium theme
        />

        {/* Right Eye Target */}
        <Rect
          x={rightEyeX}
          y={eyeY}
          width={eyeWidth}
          height={eyeHeight}
          rx={eyeHeight / 2}
          fill="none"
          stroke="#ffffff"
          strokeWidth="2.5"
          strokeOpacity={0.6}
          strokeDasharray="6 6"
        />
      </Svg>
    </View>
  );
};

const styles = StyleSheet.create({
  guidelineContainer: {
    position: 'absolute',
    top: 75,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 10,
  },
  guidelineText: {
    color: 'white',
    fontSize: 15,
    fontWeight: '600',
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 30,
    overflow: 'hidden',
    letterSpacing: 0.5,
  },
});

export default FacePositionOverlay;
