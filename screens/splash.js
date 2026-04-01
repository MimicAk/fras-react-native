import React, {useEffect} from "react";
import { View, Text } from "react-native";
import { useAuth } from '../AuthContext';
import colors from "../constants/colors";
import AsyncStorage from '@react-native-async-storage/async-storage';

function Splash({navigation}){
    const { user } = useAuth();
    useEffect(() => {
        const timer = setTimeout(() => {
            checkUserDetails();
        }, 3000);
        return () => clearTimeout(timer);
    }, [user]);

       async function checkUserDetails(){
            try {
                let role = await AsyncStorage.getItem("AttendanceType");
                if(user && user.token != undefined && role != undefined ){
                    navigation.replace("LandingPage")
                }else{
                    if(user && user.token != undefined && role == undefined){
                        navigation.replace("RoleSelection")
                    }else{
                        navigation.replace("Login")
                    }
                }
            } catch (error) {
                console.error('Error in checkUserDetails:', error);
                navigation.replace("Login");
            }
        }

    return (
        <View style={{flex:1, justifyContent:'center', alignItems:'center', backgroundColor:colors.background}}>
            <View style={{ width: 120, height: 120, borderRadius: 20, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center' }}>
                <Text style={{ color: colors.textLight, fontSize: 24, fontWeight: 'bold' }}>FRAS</Text>
            </View>
        </View>
    );
}

export default Splash;