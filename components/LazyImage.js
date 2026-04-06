import React, { useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';

const LazyImage = ({ uri, style, placeholder }) => {
  const [loaded, setLoaded] = useState(false);

  return (
    <View style={style}>
      {!loaded || uri == null&& (
        <Image
          source={placeholder}
          style={[StyleSheet.absoluteFill, style]}
          resizeMode="cover"
        />
      )}
      <Image
        source={{ uri }}
        style={style}
        resizeMode="cover"
        onLoadEnd={() => setLoaded(true)}
      />
    </View>
  );
};

export default LazyImage;
