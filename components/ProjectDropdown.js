import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, Modal, FlatList, StyleSheet, } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { ChevronDown } from "lucide-react-native";
import Colors from "../constants/colors";
import AsyncStorage from '@react-native-async-storage/async-storage';

const ProjectDropdown = ({projectList, setCurrentProject}) => {
  const [selected, setSelected] = useState(null);
  const [visible, setVisible] = useState(false);



  useEffect(()=>{

    console.log("projectList",projectList);
    const storeProject = async () => {
      let ProjectID = await AsyncStorage.getItem("Project");
      if(ProjectID == null ||ProjectID == undefined){
        if(projectList?.length == 1){
           setSelected(projectList[0])
        }else{
            setVisible(true);
        }
      }else{
      let tempData = JSON.parse(ProjectID);
        if(projectList?.length == 1){
           setSelected(projectList[0])
        }else{
            let temp = projectList?.filter((data)=>{return data?.guid == tempData?.guid});
            setSelected(temp[0])
        }
      }
    }
    storeProject()
  },[])
  useEffect(() => {
    const storeProject = async () => {
      if (selected != null) {
        try {
          setVisible(false);
          setCurrentProject(selected);
          await AsyncStorage.setItem("Project", JSON.stringify(selected));
          await AsyncStorage.setItem("LatLan", JSON.stringify({
            lat:String(selected?.latitude),
            lan:String(selected?.longitude)
          }));
        } catch (err) {
          console.log("Failed to store project:", err);
        }
      }
    };
  
    storeProject();
  }, [selected]);

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.dropdown} onPress={() => setVisible(true)}>
        <Text style={styles.location}>{selected?.projectname}</Text>
        <ChevronDown size={24} color={Colors.text} />
      </TouchableOpacity>

      <Modal transparent visible={visible && projectList?.length>0} animationType="fade">
        <TouchableOpacity style={styles.overlay} onPress={() => setVisible(false)}>
          <View style={styles.modal}>
            <Text style={{margin:10}}>Select Project</Text>
            <FlatList
              data={projectList}
              keyExtractor={(item) => item}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.item}
                  onPress={async() => {
                    await AsyncStorage.setItem("Project", JSON.stringify(item));
                    setSelected(item);
                    setVisible(false);
                  }}
                >
                  <Text style={styles.text}>{item.projectname}</Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { margin: 2.5 },
  dropdown: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 15,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  location: {
    fontSize: 20,
    fontWeight: "bold",
    color: Colors.text,
  },
  text: { fontSize: 16, color: '#0a0a0a' },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.2)',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  modal: {
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingVertical: 10,
    elevation: 5,
  },
  item: {
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
});

export default ProjectDropdown;
