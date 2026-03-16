// screens/SyncData.js

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import colors from '../constants/colors';
import { Button } from '../components/Button';
import { useAuth } from '../AuthContext';
import {
  pullVectorsService,
  pushVectorsService,
} from '../services/sync.service';
import { loadVectorsService } from '../services/face.service';

export default function SyncData({ navigation }) {
  const { user } = useAuth();

  const [progress, setProgress] = useState(0);
  const [total, setTotal] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [completed, setCompleted] = useState(false);

  const startSync = async () => {
    try {
      setIsSyncing(true);
      setCompleted(false);

      await pushVectorsService({ token: user?.token });

      const result = await pullVectorsService({
        token: user?.token,
        userGuid: user?.guid,
        onProgress: (current, totalCount) => {
          setProgress(current);
          setTotal(totalCount);
        },
      });

      setCompleted(true);
    } catch (error) {
      Alert.alert('Sync Failed', error.message);
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {!isSyncing && !completed && (
        <Button
          title="Sync Now"
          size="large"
          onPress={startSync}
          style={styles.syncBtn}
        />
      )}

      {isSyncing && (
        <>
          <Text style={styles.counter}>
            {progress} / {total}
          </Text>
          <View style={styles.row}>
            <ActivityIndicator size="large" color="white" />
            <Text style={styles.text}>Syncing...</Text>
          </View>
        </>
      )}

      {completed && (
        <>
          <Text style={styles.text}>Sync Completed</Text>
          <TouchableOpacity
            style={styles.goBack}
            onPress={() => navigation.navigate('LandingPage')}
          >
            <Text>Go Back</Text>
          </TouchableOpacity>
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  counter: {
    fontSize: 50,
    color: 'white',
    fontWeight: '500',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 15,
  },
  text: {
    fontSize: 20,
    color: 'white',
    marginLeft: 15,
  },
  syncBtn: {
    width: 320,
    borderWidth: 1,
    borderColor: 'white',
  },
  goBack: {
    marginTop: 20,
    backgroundColor: 'white',
    padding: 12,
    borderRadius: 20,
  },
});
