import { Search } from 'lucide-react-native';
import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Modal,
  Dimensions,
  Animated,
} from 'react-native';

const { width: screenWidth } = Dimensions.get('window');

// Main SearchDropdownSelector Component
const SearchDropdownSelector = ({
  data = [],
  titleField = 'title',
  valueField = 'value',
  searchFields = [],
  placeholder = 'Search and select...',
  multiSelect = true,
  maxSelections = null,
  selectedValues = [],
  onSelectionChange,
  disabled = false,
  showSearch = true,
  showSelectAll = true,
  showClearAll = true,
  showSelectedCount = true,
  dropdownHeight = 300,
  itemHeight = 50,
  searchPlaceholder = 'Search items...',
  noDataText = 'No items found',
  customItemRenderer,
  customSelectedRenderer,
  style,
  dropdownStyle,
  searchStyle,
  itemStyle,
  selectedItemStyle,
  // Styling props
  primaryColor = '#007bff',
  backgroundColor = '#fff',
  borderColor = '#dee2e6',
  textColor = '#212529',
  placeholderColor = '#6c757d',
  // Animation props
  animationDuration = 200,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedItems, setSelectedItems] = useState(selectedValues || []);
  const animatedHeight = useRef(new Animated.Value(0)).current;
  const dropdownRef = useRef(null);

  // Update internal state when external selectedValues change
  useEffect(() => {
    setSelectedItems(selectedValues || []);
  }, [selectedValues]);

  // Determine search fields - use titleField if searchFields not provided
  const fieldsToSearch = searchFields.length > 0 ? searchFields : [titleField];

  // Filter data based on search query
  const filteredData = useMemo(() => {
    if (!searchQuery.trim()) return data;
    
    return data.filter(item => {
      return fieldsToSearch.some(field => {
        const fieldValue = item[field];
        if (fieldValue === null || fieldValue === undefined) return false;
        return fieldValue.toString().toLowerCase().includes(searchQuery.toLowerCase());
      });
    });
  }, [data, searchQuery, fieldsToSearch]);

  // Check if item is selected
  const isItemSelected = (item) => {
    const itemValue = item[valueField];
    return selectedItems.some(selected => 
      (selected[valueField] || selected) === itemValue
    );
  };

  // Handle item selection
  const handleItemSelect = (item) => {
    if (disabled) return;

    const itemValue = item[valueField];
    let newSelection = [...selectedItems];

    if (multiSelect) {
      const isSelected = isItemSelected(item);
      
      if (isSelected) {
        // Remove item
        newSelection = newSelection.filter(selected => 
          (selected[valueField] || selected) !== itemValue
        );
      } else {
        // Add item (check max selections)
        if (maxSelections && newSelection.length >= maxSelections) {
          return; // Don't add if max reached
        }
        newSelection.push(item);
      }
    } else {
      // Single select
      newSelection = [item];
      setIsOpen(false);
    }

    setSelectedItems(newSelection);
    if (onSelectionChange) {
      onSelectionChange(newSelection);
    }
  };

  // Handle select all
  const handleSelectAll = () => {
    if (disabled) return;
    
    const allItems = maxSelections 
      ? filteredData.slice(0, maxSelections)
      : filteredData;
    
    setSelectedItems(allItems);
    if (onSelectionChange) {
      onSelectionChange(allItems);
    }
  };

  // Handle clear all
  const handleClearAll = () => {
    if (disabled) return;
    
    setSelectedItems([]);
    if (onSelectionChange) {
      onSelectionChange([]);
    }
  };

  // Toggle dropdown
  const toggleDropdown = () => {
    if (disabled) return;
    
    const toValue = isOpen ? 0 : dropdownHeight;
    setIsOpen(!isOpen);
    
    Animated.timing(animatedHeight, {
      toValue,
      duration: animationDuration,
      useNativeDriver: false,
    }).start();
  };

  // Get display text for selected items
  const getDisplayText = () => {
    if (selectedItems.length === 0) return placeholder;
    
    if (multiSelect) {
      if (selectedItems.length === 1) {
        return selectedItems[0][titleField];
      }
      return `${selectedItems.length} item${selectedItems.length !== 1 ? 's' : ''} selected`;
    } else {
      return selectedItems[0][titleField];
    }
  };

  // Render dropdown item
  const renderItem = ({ item, index }) => {
    if (customItemRenderer) {
      return customItemRenderer(item, index, isItemSelected(item), handleItemSelect);
    }

    const isSelected = isItemSelected(item);
    
    return (
      <TouchableOpacity
        style={[
          styles.dropdownItem,
          { height: itemHeight },
          isSelected && [styles.selectedDropdownItem, { backgroundColor: `${primaryColor}15` }],
          itemStyle,
          isSelected && selectedItemStyle,
        ]}
        onPress={() => handleItemSelect(item)}
        activeOpacity={0.7}
      >
        <View style={styles.itemContent}>
          <Text
            style={[
              styles.itemText,
              { color: isSelected ? primaryColor : textColor },
            ]}
            numberOfLines={2}
          >
            {item[titleField]}
          </Text>
          {item.subtitle && (
            <Text
              style={[
                styles.itemSubtitle,
                { color: isSelected ? primaryColor : placeholderColor },
              ]}
              numberOfLines={1}
            >
              {item.subtitle}
            </Text>
          )}
        </View>
        
        {multiSelect && (
          <View style={[
            styles.checkbox,
            { borderColor: isSelected ? primaryColor : borderColor },
            isSelected && { backgroundColor: primaryColor }
          ]}>
            {isSelected && <Text style={styles.checkmark}>✓</Text>}
          </View>
        )}
      </TouchableOpacity>
    );
  };

  // Render selected items (for multi-select)
  const renderSelectedItems = () => {
    if (!multiSelect || selectedItems.length === 0) return null;

    if (customSelectedRenderer) {
      return customSelectedRenderer(selectedItems, setSelectedItems, onSelectionChange);
    }

    return (
      <View style={styles.selectedItemsContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {selectedItems.map((item, index) => (
            <View key={`${item[valueField]}-${index}`} style={styles.selectedChip}>
              <Text style={styles.selectedChipText} numberOfLines={1}>
                {item[titleField]}
              </Text>
              <TouchableOpacity
                style={styles.removeChipButton}
                onPress={() => handleItemSelect(item)}
              >
                <Text style={styles.removeChipText}>×</Text>
              </TouchableOpacity>
            </View>
          ))}
        </ScrollView>
      </View>
    );
  };

  return (
    <View style={[styles.container, style]}>
      {/* Main Selector Button */}
      <TouchableOpacity
        style={[
          styles.selector,
          { 
            backgroundColor, 
            borderColor: isOpen ? primaryColor : borderColor,
            borderWidth: isOpen ? 2 : 1,
          },
          disabled && styles.disabledSelector,
        ]}
        onPress={toggleDropdown}
        disabled={disabled}
      >
        <Text
          style={[
            styles.selectorText,
            { color: selectedItems.length > 0 ? textColor : placeholderColor },
          ]}
          numberOfLines={1}
        >
          {getDisplayText()}
        </Text>
        
        <View style={styles.selectorRight}>
          {showSelectedCount && multiSelect && selectedItems.length > 0 && (
            <View style={[styles.countBadge, { backgroundColor: primaryColor }]}>
              <Text style={styles.countText}>{selectedItems.length}</Text>
            </View>
          )}
          <Text style={[styles.arrow, { color: isOpen ? primaryColor : placeholderColor }]}>
            {isOpen ? '▲' : '▼'}
          </Text>
        </View>
      </TouchableOpacity>

      {/* Selected Items Display */}
      {renderSelectedItems()}

      {/* Dropdown */}
      {isOpen && (
        <Animated.View
          ref={dropdownRef}
          style={[
            styles.dropdown,
            {
              height: animatedHeight,
              backgroundColor,
              borderColor: primaryColor,
            },
            dropdownStyle,
          ]}
        >
          {/* Search Input */}
          {showSearch && (
            <View style={[styles.searchContainer, { borderBottomColor: borderColor }]}>
              <TextInput
                style={[styles.searchInput, { color: textColor }, searchStyle]}
                placeholder={searchPlaceholder}
                placeholderTextColor={placeholderColor}
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoCapitalize="none"
              />
            </View>
          )}

          {/* Action Buttons */}
          {multiSelect && (showSelectAll || showClearAll) && (
            <View style={[styles.actionButtons, { borderBottomColor: borderColor }]}>
              {showSelectAll && (
                <TouchableOpacity
                  style={[styles.actionButton, { borderColor: primaryColor }]}
                  onPress={handleSelectAll}
                  disabled={filteredData.length === 0}
                >
                  <Text style={[styles.actionButtonText, { color: primaryColor }]}>
                    Select All {filteredData.length > 0 && `(${filteredData.length})`}
                  </Text>
                </TouchableOpacity>
              )}
              
              {showClearAll && selectedItems.length > 0 && (
                <TouchableOpacity
                  style={[styles.actionButton, { borderColor: '#dc3545' }]}
                  onPress={handleClearAll}
                >
                  <Text style={[styles.actionButtonText, { color: '#dc3545' }]}>
                    Clear All
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* Items List */}
          <FlatList
            data={filteredData}
            renderItem={renderItem}
            keyExtractor={(item, index) => `${item[valueField]}-${index}`}
            style={styles.itemsList}
            showsVerticalScrollIndicator={true}
            nestedScrollEnabled={true}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text style={[styles.emptyText, { color: placeholderColor }]}>
                  {noDataText}
                </Text>
              </View>
            }
          />
        </Animated.View>
      )}
    </View>
  );
};

export default SearchDropdownSelector;