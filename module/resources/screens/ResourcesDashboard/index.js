import React, { useEffect , useState} from "react";
import { View, Text, StyleSheet} from "react-native";
import ProjectDropdown from "../../../../components/ProjectDropdown";
import {    connectToResourcesDatabase, 
            createResourcesTables, 
            addProjectsRecords, 
            addSubTaskRecords,
            addAssetRecords
} from "../../db";
import { ProjectList, Activity, AssetsList } from "../../mock";
import { Filter, Plus } from "lucide-react-native";
import GridImageCapture from "../../../../components/GridImageCapture";
import AssetScannerMultiSelect from "../../../../components/AssetScannerMultiSelect";
import CheckIn from "../../../../components/FaceRecognition";
function ResourcesDashboard(){
    
    const [dbCon, setDB] = useState(null);
    const [currentProject, setCurrentProject] = useState(null);

    useEffect(()=>{
        initDBProcess();
        
    },[])

    async function initDBProcess(){
        let tempDB  = await connectToResourcesDatabase();
        await createResourcesTables(tempDB);
        syncOfflineProject(tempDB);
        syncOfflineActivityList(tempDB);
        syncOfflineAssets(tempDB);
    }

    function syncOfflineProject  (db){
        ProjectList.forEach((ele)=>{
            addProjectsRecords(db,ele)
                console.log("syncOfflineProject",ele)
        })
    }

    function syncOfflineActivityList  (db){
        Activity.forEach((ele)=>{
            addSubTaskRecords(db,ele)
                console.log("syncOfflineActivityList",ele)
        })
    }

    function syncOfflineAssets (db){
        Activity.forEach((ele)=>{
            addAssetRecords(db,ele)
                console.log("syncOfflineActivityList",ele)
        })
    }

    console.log("currentProject", currentProject)

    return <View style={{flex:1}}>
        <View style={{margin:20}}>
            <ProjectDropdown
                projectList={ProjectList}
                setCurrentProject={setCurrentProject}
            />
        </View>
        <View style={styles.wrapper}>
            <Filter size={24} strokeWidth={2} />
            {/* small plus badge positioned top-right */}
            <View style={styles.plusWrapper}>
                <Plus size={24} strokeWidth={2} />
            </View>
        </View>
        {/* <AssetScannerMultiSelect/> */}
        {/* <GridImageCapture/> */}
        <View style={{height:600, width:400, padding:20}}>
            <CheckIn nearyByProject={[ProjectList[0]]} currentLocation={{lat:1,lan:1}}/>
        </View>
    </View>
}

const styles = StyleSheet.create({
  wrapper: {
    width: "100%",
    height: 28,
    alignItems: "center",
    flexDirection:'row',
    justifyContent:'space-between'
  },
  plusWrapper: {
    right: 0,
    top: 0,
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    // optional: background/border for badge (customize as needed)
    borderRadius: 6,
  },
});

export default ResourcesDashboard;