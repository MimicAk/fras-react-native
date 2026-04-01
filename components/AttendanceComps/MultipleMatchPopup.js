// components/MultipleMatchPopup.js

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';

import { Image } from 'react-native';

const MultipleMatchPopup = ({ visible, matches = [], onSelect, onCancel }) => {
  if (!visible || matches.length === 0) return null;

  return (
    <View style={styles.overlay}>
      <View style={styles.container}>
        <Text style={styles.title}>Multiple Matches Found</Text>

        <ScrollView style={{ width: '100%', maxHeight: 250 }}>
          {matches.map((person, index) => {
            let imageSource;
            if (person.img) {
              // Check if img is a valid URL
              if (
                typeof person.img === 'string' &&
                (person.img.startsWith('http://') ||
                  person.img.startsWith('https://'))
              ) {
                imageSource = { uri: person.img };
              } else {
                imageSource = { uri: `data:image/jpeg;base64,${person.img}` };
              }
            } else {
              imageSource = {
                uri: `https://ui-avatars.com/api/?name=${person.name}&background=random`,
              };
            }

            return (
              <TouchableOpacity
                key={index}
                style={styles.personItem}
                onPress={() => onSelect(person)}
              >
                <Image source={imageSource} style={styles.avatar} />
                <View style={{ marginLeft: 12 }}>
                  <Text style={styles.name}>{person.name}</Text>
                  <Text style={styles.staffId}>ID: {person.staffid}</Text>

                  <Text
                    style={[
                      styles.confidence,
                      person.similarity > 0.8
                        ? styles.highConfidence
                        : person.similarity > 0.65
                        ? styles.mediumConfidence
                        : styles.lowConfidence,
                    ]}
                  >
                    {(person.similarity * 100).toFixed(1)}% match
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <TouchableOpacity
          style={[styles.button, styles.cancelBtn]}
          onPress={onCancel}
        >
          <Text style={styles.buttonText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

export default MultipleMatchPopup;

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  container: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 20,
    width: '85%',
    alignItems: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 15,
  },
  personItem: {
    backgroundColor: '#f3f4f6',
    padding: 12,
    borderRadius: 10,
    marginBottom: 10,

    flexDirection: 'row', // ✅ important
    alignItems: 'center',
  },
  name: {
    fontSize: 16,
    fontWeight: '600',
  },
  staffId: {
    fontSize: 13,
    color: '#666',
  },
  button: {
    marginTop: 10,
    paddingVertical: 12,
    paddingHorizontal: 25,
    borderRadius: 10,
  },
  cancelBtn: {
    backgroundColor: '#dc2626',
  },
  buttonText: {
    color: 'white',
    fontWeight: '600',
    textAlign: 'center',
  },

  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
  },

  confidence: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: '700',
  },

  highConfidence: {
    color: '#16a34a', // green
  },

  mediumConfidence: {
    color: '#eab308', // yellow
  },

  lowConfidence: {
    color: '#dc2626', // red
  },
});
