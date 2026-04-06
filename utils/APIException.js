// getFaceEmbeddingFromImage.js
import { Alert } from "react-native";
import { config } from "../config/config";

export const ApiExceptions = async (apiData, navigation, payload) => {

  if (apiData.status === 401) {
    Alert.alert("Session Expired", "Please login again", [
      { text: "OK", onPress: () => navigation.navigate("Login") }
    ]);
  }

  if (apiData.status === 500) {
    Alert.alert("Internal Server Error");
    logPayload();
  }
};


export async function logPayload(payload){
  let response =  await fetch(`${config.Base_URL}/api/add_payload`, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        add_payload:payload
      }),
    });
    response = await response?.json();
    console.log("logPayload",response)
}