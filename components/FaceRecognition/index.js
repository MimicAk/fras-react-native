import React, { useState, useEffect, useRef } from "react";
import {Dimensions, Platform, ScrollView, KeyboardAvoidingView, View, Text, StyleSheet, ActivityIndicator, Alert, InteractionManager, NativeModules, TextInput, TouchableOpacity} from "react-native";
import colors from "../../constants/colors";
import { useAuth } from '../../AuthContext';
import RNFS from 'react-native-fs';
import { connectToDatabase, createTables, addStaff, currentDaySyncData, getAllStaff, recordPunch, getAsyncPunchRecords} from '../db';
import { Camera, useCameraDevices } from 'react-native-vision-camera';
import { Button } from "../components/Button";
import { getFaceEmbeddingFromImage } from '../../utils/FaceRecognitionUtil';
import { ApiExceptions } from "../utils/APIException";
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useIsFocused } from '@react-navigation/native';
import { config } from "../config/config";
import SoundPlayer from "react-native-sound-player";
import { SwitchCamera } from "lucide-react-native";
import Colors from "../../constants/colors";
import { SafeAreaView } from "react-native-safe-area-context";
import NetInfo from '@react-native-community/netinfo';

const { TFLiteModule, TFLiteFaceModule, TSFModuleIOS} = NativeModules;
const { width, height } = Dimensions.get('window');
let VECTORS;
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function CheckInOut({ currentLocation, nearyByProject, punchDirection }) {
  const { user } = useAuth();
  const isFocused = useIsFocused();
  const cameraRef = useRef(null);
  const [permissionStatus, setPermissionStatus] = useState(null);
  const [base64Image, setBase64Image] = useState(null);
  const [db, setDb] = useState(null);
  const devices = useCameraDevices();
  const [intervalId, setIntervalId] = useState(null);
  const [name, setName] = useState("");
  const [workStatus,setWorkStatu] = useState(false);
  const workProgress= useRef(false);
  const [empID, setEmpID] = useState(null);
  const [currentProject, setCurrentProject] = useState(null);
  const [latlan, setLatlan] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);
  const [switchCamera,setCameraSwitch] = useState(false);
  const netInfoUnsubscribe = useRef(null);
  const [isConnected, setIsConnected] = useState(true);

    // Network connectivity setup
  useEffect(() => {
    const setupNetworkListener = () => {
      netInfoUnsubscribe.current = NetInfo.addEventListener(state => {
        setIsConnected(state.isConnected);
      });
    };

    setupNetworkListener();

    return () => {
      if (netInfoUnsubscribe.current) {
        netInfoUnsubscribe.current();
      }
    };
  }, [isConnected,isFocused]);

  useEffect(()=>{
      const storeProject = async () => {
            try {
              setCurrentProject(JSON.parse(await AsyncStorage.getItem("Project")));
              setLatlan(JSON.parse(await AsyncStorage.getItem("LatLan")));
            } catch (err) {
              console.log("Failed to store project:", err);
            }
        };
        storeProject();
  },[isFocused])

   // Camera permission
    useEffect(() => {
      const checkPermissions = async () => {
        let status = await Camera.getCameraPermissionStatus();
         console.log("permissionStatus",1,status);
        if (status !== 'granted') {         
          status = await Camera.requestCameraPermission();
        }
        setPermissionStatus(status);
      };
  
      checkPermissions();
    },[isFocused]);

    useEffect(()=>{
       console.log("IN",new Date().toISOString().toString());
      let work = null;
      const interval = setInterval(() => {
        
        if(workProgress.current ==false){
            if(isFocused == true){
                console.log("IN",new Date().toISOString().toString());
                  console.log('ThisSecondsIn',1, new Date().toISOString());
                work = InteractionManager.runAfterInteractions(() => {
                  workProgress.current =true ;
                  captureImage();
                });
            }
        }
      }, 1500); // 1000ms = 1 second

      return () => {
        clearInterval(interval);
        setWorkStatu(false);
        workProgress.current =  false;
        setEmpID(null);
        setErrorMsg(null)
        if(work != null){
          work.cancel();
        }
      }; // Cleanup on unmount

    }, [db, user, currentProject, isFocused, latlan]);
  
  const captureImage = async () => {
    try {
      const photo = await cameraRef.current.takePhoto({ flash: 'off' });
      const filePath = photo.path.startsWith('file://') ? photo.path : `file://${photo.path}`;
      const embedding = await getFaceEmbeddingFromImage(filePath, switchCamera != false ? "front" : "back",true);
      console.log('embeddingError', 1, embedding);
      if (embedding != null && !embedding.message) {
        setWorkStatu(true);
        let highCosine = 0;
        let matchingScore = 0;
        let details = null;
              console.log('embeddingError', 1, embedding);
       // console.time("PUNCHIN");

        // Optimized cosine similarity function
        const cosineSimilarity = (a, b) => {
          let dot = 0;
          let magA = 0;
          let magB = 0;
          
          // Single loop for all calculations
          for (let i = 0; i < a.length; i++) {
            dot += a[i] * b[i];
            magA += a[i] * a[i];
            magB += b[i] * b[i];
          }
          
          const magnitude = Math.sqrt(magA * magB);
          return magnitude === 0 ? 0 : dot / magnitude;
        };

        console.log("VECTORS", VECTORS?.length);
        
        // OPTIMIZED LOOP - Removed all console.log for 4x speed boost
        for (const item of VECTORS ?? []) {
          if (item.vector !== "null") {
            const vectorB = JSON.parse(item.vector);
            const similarity = cosineSimilarity(embedding, vectorB);
            if (similarity > 0.70) {
              // Found a match - update if better
              if (highCosine < similarity) {
                highCosine = similarity;
                details = item;
              }
              // Exit immediately on first high similarity match
              break;
            } else {
              // Track best non-matching score
              matchingScore = Math.max(matchingScore, similarity);
            }
          }
        }

    //    console.timeEnd("PUNCHIN");

        if (details != null && isFocused == true) {
          setErrorMsg(null);
          console.log("Match found:", details.name, "Score:", highCosine.toFixed(3));
          
          let punchMode = "online";
          try {
            await recordPunch(db, {
              uuid: details?.uuid,
              punchType: "in",
              lat: currentLocation?.latitude,
              lan: currentLocation?.longitude,
              attendanceType: attendanceType,
              projectID:  nearyByProject?.length >1 ? currentProject.guid : nearyByProject[0]?.guid ? nearyByProject[0]?.guid  : null,
              punchMode: 'offline'
            });
            
            setEmpID(details.name);
            SoundPlayer.playAsset(require("../assets/sounds/success.mp3"));

          } catch (error) {
            setErrorMsg(error.message);
            SoundPlayer.playAsset(require("../../assets/sounds/warning.mp3"));
            punchMode = "offline";
          }
        } else {
          console.log("No match found. Best score:", matchingScore.toFixed(3));
          setErrorMsg(`Face Not Matching`);
        }
      } else {
        console.log('embeddingError', 2, embedding.message);
        workProgress.current = false;
        setEmpID(null);
        setErrorMsg(embedding.message);
      }
    } catch (error) {
       console.log('embeddingError', 3, error);
      console.log('captureImage error:', error.message);
    } finally {
      setWorkStatu(false);
      if (workProgress.current == true) {
        console.log('ThisSecondsIn', 2, new Date().toISOString());
        await delay(1500);
        workProgress.current = false;
        await delay(1500);
        console.log('ThisSecondsIn', 3, new Date().toISOString());
        setErrorMsg(null);
        setEmpID(null);
        setWorkStatu(false);
      }
    }
  };

  useEffect(() => {
    const setup = async () => {
      try {
        const database = await connectToDatabase();
        setDb(database);
        const staffDatas = await getAllStaff(database);
        VECTORS = staffDatas;
        await createTables(database);
      } catch (error) {
        console.error(error);
      }
    };

    if(isFocused == true){
      setup();
    }

  }, [isFocused]);


  function getFormattedDateTime() {
        const now = new Date();

        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0'); // Months are 0-based
        const day = String(now.getDate()).padStart(2, '0');

        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');

        return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  }

  console.log("isConnected", isConnected);

  return (
    <SafeAreaView style={style.container}>
     <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={{ flex: 1 }}
    >
      <ScrollView  style={{backgroundColor:colors.primary}}>
    <View style={style.container}>
      { permissionStatus === null ?
          <View style={style.centered}>
            <Text>Checking camera permission...</Text>
          </View>
        : permissionStatus !== 'granted' ?
            <View style={style.centered}>
              <Text style={{ textAlign: 'center' }}>
                Camera permission is {permissionStatus}.
              </Text>
              <TouchableOpacity
                style={style.retryButton}
                onPress={async () => {
                  const status = await Camera.requestCameraPermission();
                  setPermissionStatus(status);
                }}
              >
                <Text style={styles.retryText}>Retry Permission</Text>
              </TouchableOpacity>
            </View>
        : !devices[1] ?
          <View style={style.centered}>
            <Text>No camera device found</Text>
          </View>
        :
        <>
          <View style={style.cameraBox}>
            <Camera
              style={StyleSheet.absoluteFill}
              device={devices[switchCamera  != false ? 1 : 0]}
              isActive={isFocused}
              photo={true}
              ref={cameraRef}
              isMirrored={false}
              enableFpsGraph={false}
              photoQualityBalance="quality"
            />
            {/* Face Position Overlay */}
            <FacePositionOverlay />
          </View>

                <View style={[style.statusHolder,{backgroundColor : errorMsg!=null || empID == null? "white" : "#288f2f"}]}>
                      <>
                        {
                            workStatus == true ?
                            <ActivityIndicator color="blue"/>
                          :  empID && errorMsg ==null ? <View style={{flexDirection:'row', justifyContent:'space-around'}}>
                                  <View style={{backgroundColor:'white', height:50, width:50, borderRadius:50, justifyContent:'center',alignSelf:'center', margin:10}}>
                                      <Text style={{color:'green', alignSelf:'center', textAlign:'center', fontSize:30}}>✓</Text>
                                  </View>
                                  <Text style={{color:'white', fontSize:20, fontWeight:'600', alignSelf:'center', marginLeft:5}}>Check In : {empID}</Text> 
                            </View> : <View style={{flexDirection:'row', justifyContent:'space-around'}}>
                                  <Text style={{color:'black', fontSize:14, fontWeight:'600', alignSelf:'center', textAlign:'center'}}>{errorMsg}</Text> 
                            </View> 
                        }
                      </>
                </View>

          {/* <View>
              <TextInput placeholder="Name" onChangeText={(e)=>{setName(e)}} style={{color:'black', alignSelf:'center', backgroundColor:'white', height:45, width:'80%'}}/>
              <View style={{flexDirection:'row', justifyContent:'space-around'}}>
                <Button 
                  title={"Compare"} 
                  onPress={()=>{captureImage()}}
                >
                </Button>
                <Button 
                  title={"Switch"} 
                  onPress={()=>{setCameraSwitch(!cameraSwitch)}}
                >
                </Button>
                <Button 
                  title={"Entry"} 
                  onPress={()=>{putEntry()}}
                >
                </Button>
              </View>
          </View> */}
        </>
          
      }
      <Text style={{ position: 'absolute',
            top: 15,
            left: 20,
            zIndex: 10,
            fontSize:14,
            fontWeight:'500',
            color:'black',
            backgroundColor:'white',
            padding:10,
        }}>{nearyByProject?.length >1 ? currentProject?.projectname : nearyByProject[0]?.projectname ? nearyByProject[0]?.projectname : 'No Projects'}</Text>
      <TouchableOpacity onPress={()=>{setCameraSwitch(!switchCamera)}} style={{
          position: 'absolute',
            top: 20,
            right: 20,
            zIndex: 10,
        }}>
        <SwitchCamera size={35} color={Colors.secondary} />
      </TouchableOpacity>
      {/* <View style={style.guideLine}>
          
      </View> */}
    </View>
    
    </ScrollView>
    </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const style = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.primary,
    justifyContent: 'center',
  },
  syncCounterContainer: {
    margin: 20,
    justifyContent: 'center',
  },
  syncCounterText: {
    fontSize: 50,
    color: 'white',
    fontWeight: '500',
    alignSelf: 'center',
  },
  syncContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  syncText: {
    fontSize: 20,
    color: 'white',
    alignSelf: 'center',
    marginLeft: 15,
  },
  syncBtn: {
    alignSelf: 'center',
    width: 320,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'white',
  },
  cameraBox: {
    width,
    height:height-250,
    backgroundColor: '#1e2a3a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  statusHolder:{
    margin:10,
    height:60,
    width:'100%',
    alignSelf:'center',
    justifyContent:'center',
    alignItems:'center',
    backgroundColor:'white'
  },
    guideLine:{
    position: 'absolute',
    width:'80%',
    height:'60%',
    marginLeft:10,
    marginRight:10,
    backgroundColor:"transparent",
    borderWidth:5,
    borderColor:"white",
    alignSelf:'center',
    borderRadius:5
  }
});

export default CheckInOut;
