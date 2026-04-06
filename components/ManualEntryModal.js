import React, { useState } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, StyleSheet, FlatList, ActivityIndicator, Image } from 'react-native';
import { User } from 'lucide-react-native';

const ManualEntryModal = ({ visible, onClose, onSelect, onSearch, searchResults, loading }) => {
  const [searchText, setSearchText] = useState('');

  const handleSearch = (text) => {
    setSearchText(text);
    if (text.length > 0) {
      onSearch(text);
    }
  };

  const handleSelect = (person) => {
    setSearchText('');
    onSelect(person);
  };

  const handleClose = () => {
    setSearchText('');
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.overlay}>
        <View style={styles.container}>
          <Text style={styles.title}>Manual Entry</Text>
          
          <TextInput
            style={styles.input}
            placeholder="Search by Staff ID or Name"
            placeholderTextColor={"#ccc"}
            value={searchText}
            onChangeText={handleSearch}
            autoFocus
          />

          {loading ? (
            <ActivityIndicator size="large" color="#007AFF" style={styles.loader} />
          ) : (
            <FlatList
              data={searchResults}
              keyExtractor={(item) => item.uuid}
              renderItem={({ item }) => (
                <View style={styles.item}>
                  {item.image ? (
                    <Image source={{uri: item.image}} style={styles.image} />
                  ) : (
                    <View style={styles.imagePlaceholder}>
                      <User size={24} color="#999" />
                    </View>
                  )}
                  <View style={styles.itemText}>
                    <Text style={styles.name}>{item.name}</Text>
                    <Text style={styles.staffId}>ID: {item.staffid}</Text>
                  </View>
                  <TouchableOpacity style={styles.selectBtn} onPress={() => handleSelect(item)}>
                    <Text style={styles.selectBtnText}>Select</Text>
                  </TouchableOpacity>
                </View>
              )}
              ListEmptyComponent={
                searchText.length > 0 ? (
                  <Text style={styles.empty}>No results found</Text>
                ) : (
                  <Text style={styles.empty}>Start typing to search</Text>
                )
              }
            />
          )}

          <TouchableOpacity style={styles.closeBtn} onPress={handleClose}>
            <Text style={styles.closeBtnText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    width: '90%',
    maxHeight: '80%',
    backgroundColor: 'white',
    borderRadius: 10,
    padding: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 15,
    textAlign: 'center',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 15,
    color:'#000'
  },
  loader: {
    marginVertical: 20,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    backgroundColor: '#f9f9f9',
    marginBottom: 8,
    borderRadius: 8,
  },
  image: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#ddd',
  },
  imagePlaceholder: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#e0e0e0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  itemText: {
    marginLeft: 12,
    flex: 1,
  },
  name: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  staffId: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  selectBtn: {
    backgroundColor: '#007AFF',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
  },
  selectBtnText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  empty: {
    textAlign: 'center',
    color: '#999',
    marginVertical: 30,
  },
  closeBtn: {
    marginTop: 15,
    padding: 12,
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    alignItems: 'center',
  },
  closeBtnText: {
    fontSize: 16,
    color: '#333',
  },
});

export default ManualEntryModal;
