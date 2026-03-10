import {
  enablePromise,
  openDatabase,
} from "react-native-sqlite-storage"

enablePromise(true)

export const connectToResourcesDatabase = async () => {
  return openDatabase(
    { name: "resources.db", location: "default" },
    () => {console.log("Connected to db")},
    (error) => {
      console.error(error)
      throw Error("Could not connect to database")
    }
  )
}

export const createResourcesTables = async (db) => {


    const ProjectRecords = `
        CREATE TABLE IF NOT EXISTS ProjectRecords (
            id INTEGER DEFAULT 1,
            ProjectID TEXT,
            ProjectName TEXT,
            LatLan JSON,
            SyncDate DATE,
            PRIMARY KEY(id)
        )
    `
    const SubTaskRecords = `
        CREATE TABLE IF NOT EXISTS SubTaskRecords (
            id INTEGER DEFAULT 1,
            TaskID TEXT,
            TaskName TEXT,
            SubTaskID TEXT,
            SubTaskName TEXT,
            ProjectID TEXT,
            SyncDate DATE,
            PRIMARY KEY(id)
        )
    `
    const AssetRecords = `
        CREATE TABLE IF NOT EXISTS AssetRecords (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            AssetID TEXT,
            AssetName TEXT,
            SyncDate DATE
        )
    `
    const WorkEntryRecords = `
        CREATE TABLE IF NOT EXISTS WorkEntryRecords (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        UUID TEXT,
        ProjectID TEXT,
        SubTaskID TEXT,
        WorkID TEXT,
        WorkStatus TEXT,
        WorkRecordsIDs JSON,
        LastUpdate DATE
    )
    `
    const WorkRecords = `
        CREATE TABLE IF NOT EXISTS WorkRecords (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        WorkRecordID TEXT,
        ProjectID TEXT,
        SubTaskID TEXT,
        WorkID TEXT,
        WorkRecordsIDs TEXT,
        EmpIds JSON,
        WorkStartsAt DATE,
        WorkEndsAt DATE,
        BeforeImgIDs JSON,
        AfterImgIDs JSON,
        LastUpdate DATE
    )
    `
    const WorkRecordsCheckInOut = `
        CREATE TABLE IF NOT EXISTS WorkStaffPuches (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        UUID TEXT,
        ProjectID TEXT,
        SubTaskID TEXT,
        WorkID TEXT,
        WorkRecordsID TEXT,
        EmpIds TEXT,
        WorkStartsAt DATE,
        WorkEndsAt DATE,
        Assets JSON
        )
    `
    const AssetAllocations = `
        CREATE TABLE IF NOT EXISTS AssetAllocations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        UUID TEXT,
        ProjectID TEXT,
        SubTaskID TEXT,
        WorkID TEXT,
        WorkRecordsIDs TEXT,
        EmpId TEXT,
        AllocationStartsAt DATE,
        AllocationEndsAt DATE,
        Assets JSON,
        LastUpdate DATE
    )
    `
    const ImageRecords = `
        CREATE TABLE IF NOT EXISTS ImageRecords (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        UUID TEXT,
        ImgStr TEXT,
        LastUpdate TEXT
    )
    `
    try {
        await db.executeSql(SubTaskRecords)
        await db.executeSql(AssetRecords)
        await db.executeSql(WorkEntryRecords)
        await db.executeSql(WorkRecords)
        await db.executeSql(WorkRecordsCheckInOut)
        await db.executeSql(AssetAllocations)
        await db.executeSql(ImageRecords)
        await db.executeSql(ProjectRecords)
        console.log("Success db creation")
    } catch (error) {
        console.error(error)
        throw Error(`Failed to create tables`)
    }
}

export const addProjectsRecords = async (db, data)=>{

  try{
    
    const selectQuery = `SELECT ProjectID FROM ProjectRecords WHERE ProjectID = ?`;
    const [results] = await db.executeSql(selectQuery, [data.ProjectID]);
   
    if (results.rows.length > 0) {
      // Update if exists
      const updateQuery = `
        UPDATE ProjectRecords SET ProjectID = ?, ProjectName = ?, LatLan = ?, SyncDate = ?
        WHERE ProjectID = ?
      `;
      const values = [
        data.ProjectID,
        data.ProjectName,
        data.LatLan,
        new Date().toISOString(),
        data.ProjectID,
      ];
     
      return await db.executeSql(updateQuery, values);
    } else {
      // Insert if not exists
      const insertQuery = `
        INSERT INTO ProjectRecords (ProjectID, ProjectName, LatLan, SyncDate)
        VALUES (?, ?, ?, ?)
      `;
      const values = [
         data?.ProjectID,
         data.ProjectName,
         data.LatLan,
         new Date().toISOString()
      ];

     
      let result =  await db.executeSql(insertQuery, values);
      console.log("ProjectRecords",result)
      return result;
    }
  } catch (error) {
    console.error("ssss",error);
    throw Error("Failed to insert or update staff");
  }
}

export const addSubTaskRecords = async (db, data) => {

  try{
    
    const selectQuery = `SELECT SubTaskID FROM SubTaskRecords WHERE SubTaskID = ?`;
    const [results] = await db.executeSql(selectQuery, [data.SubTaskID]);
   
    if (results.rows.length > 0) {
      // Update if exists
      const updateQuery = `
        UPDATE SubTaskRecords SET TaskID = ?, TaskName = ?, SubTaskID = ?, SubTaskName = ?, ProjectID = ?, SyncDate = ?
        WHERE SubTaskID = ?
      `;
      const values = [
        data?.TaskID,
        data.TaskName,
        data.SubTaskID,
        data.SubTaskName,
        data.ProjectID,
        new Date().toISOString(),
        data.SubTaskID,
      ];
     
      return await db.executeSql(updateQuery, values);
    } else {
      // Insert if not exists
      const insertQuery = `
        INSERT INTO SubTaskRecords (TaskID, TaskName, SubTaskID, SubTaskName, ProjectID, SyncDate)
        VALUES (?, ?, ?, ?, ?, ?)
      `;
      const values = [
         data?.TaskID,
         data.TaskName,
         data.SubTaskID,
         data.SubTaskName,
         data.ProjectID,
         new Date().toISOString()
      ];

     
      let result =  await db.executeSql(insertQuery, values);
      console.log("SubTaskRecords",result)
      return result;
    }
  } catch (error) {
    console.error("ssss",error);
    throw Error("Failed to insert or update staff");
  }
}

export const addAssetRecords = async (db, data) => {

  try{

    const selectQuery = `SELECT AssetID FROM AssetRecords WHERE AssetID = ?`;
    const [results] = await db.executeSql(selectQuery, [data.AssetID]);
   
    if (results.rows.length > 0) {
      // Update if exists
      const updateQuery = `
        UPDATE AssetRecords SET AssetID = ?, AssetName = ?, SyncDate = ?
        WHERE AssetID = ?
      `;
      const values = [
        data?.AssetID,
        data.AssetName,
        new Date().toISOString(),
        data?.AssetID,
      ];
     
      return await db.executeSql(updateQuery, values);
    } else {
      // Insert if not exists
      const insertQuery = `
        INSERT INTO AssetRecords (AssetID, AssetName, SyncDate)
        VALUES (?, ?, ?)
      `;
      const values = [
         data?.AssetID,
         data.AssetName,
         new Date().toISOString()
      ];

     
      let result =  await db.executeSql(insertQuery, values);
      console.log("AssetRecords",result)
      return result;
    }
  } catch (error) {
    console.error("ssss",error);
    throw Error("Failed to insert or update staff");
  }
}

export const addWorkEntry = async (db, data) => {

  try{

    //   CREATE TABLE IF NOT EXISTS WorkEntryRecords (
    //     id INTEGER PRIMARY KEY AUTOINCREMENT,
    //     UUID TEXT,
    //     ProjectID TEXT,
    //     SubTaskID TEXT,
    //     WorkID TEXT,
    //     WorkStatus TEXT,
    //     WorkRecordsIDs JSON,

    const selectQuery = `SELECT WorkID FROM WorkEntryRecords WHERE WorkID = ?`;
    const [results] = await db.executeSql(selectQuery, [data.WorkID]);
   
    if (results.rows.length > 0) {
      // Update if exists
      const updateQuery = `
        UPDATE WorkEntryRecords SET WorkStatus = ?, WorkRecordsIDs = ?, LastUpdate = ?
        WHERE WorkID = ?
      `;
      const values = [
        data?.WorkStatus,
        data?.WorkRecordsIDs,
        new Date().toISOString()
      ];
     
      return await db.executeSql(updateQuery, values);
    } else {
      // Insert if not exists
      const insertQuery = `
        INSERT INTO WorkEntryRecords (ProjectID, SubTaskID, WorkID, WorkStatus, WorkRecordsIDs, LastUpdate)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `;
      const values = [
         data?.ProjectID,
         data.SubTaskID,
         data.WorkID,
         data.WorkStatus,
         data.WorkRecordsIDs,
         new Date().toISOString(),
         data.WorkID,
      ];

     
      let result =  await db.executeSql(insertQuery, values);
      console.log("WorkEntryRecords",result)
      return result;
    }
  } catch (error) {
    console.error("ssss",error);
    throw Error("Failed to insert or update staff");
  }
}

export const addWorkRecords = async (db, data) => {

  try{

//    CREATE TABLE IF NOT EXISTS WorkRecords (
//         id INTEGER PRIMARY KEY AUTOINCREMENT,
//         WorkRecordID TEXT,
//         ProjectID TEXT,
//         SubTaskID TEXT,
//         WorkID TEXT,
//         WorkRecordsIDs TEXT,
//         EmpIds JSON,
//         WorkStartsAt DATE,
//         WorkEndsAt DATE,
//         BeforeImgIDs JSON,
//         AfterImgIDs JSON

    const selectQuery = `SELECT WorkRecordID FROM WorkRecords WHERE WorkRecordID = ?`;
    const [results] = await db.executeSql(selectQuery, [data.WorkRecordID]);
   
    if (results.rows.length > 0) {
      // Update if exists
      const updateQuery = `
        UPDATE WorkRecords SET EmpIds = ?, WorkStartsAt = ?, WorkEndsAt = ?, BeforeImgIDs = ?, AfterImgIDs = ?, LastUpdate = ?
        WHERE WorkRecordID = ?
      `;
      const values = [
        data?.EmpIds,
        data?.WorkStartsAt,
        data?.WorkEndsAt,
        data?.BeforeImgIDs,
        data?.AfterImgIDs,
        new Date().toISOString()
      ];
     
      return await db.executeSql(updateQuery, values);
    } else {
      // Insert if not exists
      const insertQuery = `
        INSERT INTO WorkEntryRecords (ProjectID, SubTaskID, WorkID, WorkRecordsIDs, EmpIds, WorkStartsAt, BeforeImgIDs, LastUpdate)
        VALUES (?, ?, ?, ?, ?, ?)
      `;
      const values = [
         data?.ProjectID,
         data.SubTaskID,
         data.WorkID,
         data.WorkRecordsIDs,
         data.EmpIds,
        new Date().toISOString(),
        data.BeforeImgIDs,
        new Date().toISOString(),
      ];

     
      let result =  await db.executeSql(insertQuery, values);
      console.log("WorkEntryRecords",result)
      return result;
    }
  } catch (error) {
    console.error("ssss",error);
    throw Error("Failed to insert or update staff");
  }
}

export const addWorkRecordCheckInOut = async (db, data) => {

  try{

    // //     CREATE TABLE IF NOT EXISTS WorkStaffPuches (
    //         id INTEGER PRIMARY KEY AUTOINCREMENT,
    //         UUID TEXT,
    //         ProjectID TEXT,
    //         SubTaskID TEXT,
    //         WorkID TEXT,
    //         WorkRecordsID TEXT,
    //         EmpIds TEXT,
    //         WorkStartsAt DATE,
    //         WorkEndsAt DATE,
    //         Assets JSON,

    const selectQuery = `SELECT UUID FROM WorkStaffPuches WHERE UUID = ?`;
    const [results] = await db.executeSql(selectQuery, [data.UUID]);
   
    if (results.rows.length > 0) {
      // Update if exists
      const updateQuery = `
        UPDATE WorkStaffPuches SET  ProjectID = ?, SubTaskID = ?, WorkID = ?, WorkRecordsID = ?, EmpId = ?, WorkStartsAt = ?, WorkEndsAt = ?, Assets = ?,  LastUpdate = ?
        WHERE UUID = ?
      `;
      const values = [
        data?.ProjectID,
        data?.SubTaskID,
        data?.WorkID,
        data?.WorkRecordsID,
        data?.EmpId,
        data?.WorkStartsAt,
        data?.WorkEndsAt,
        data?.Assets,
        new Date().toISOString(),
        data?.UUID
      ];
     
      return await db.executeSql(updateQuery, values);
    } else {
      // Insert if not exists
      const insertQuery = `
        INSERT INTO WorkStaffPuches (ProjectID, SubTaskID, WorkID, WorkRecordsID, EmpIds, WorkStartsAt, Assets, LastUpdate)
        VALUES (?, ?, ?, ?, ?, ?)
      `;
      const values = [
         data?.ProjectID,
         data.SubTaskID,
         data.WorkID,
         data.WorkRecordsID,
         data.EmpIds,
         data?.Assets,
         new Date().toISOString(),
      ];

     
      let result =  await db.executeSql(insertQuery, values);
      console.log("WorkEntryRecords",result)
      return result;
    }
  } catch (error) {
    console.error("ssss",error);
    throw Error("Failed to insert or update staff");
  }
}

export const assetAllocations = async (db, data) => {

  try{

        //   CREATE TABLE IF NOT EXISTS AssetAllocations (
        // id INTEGER PRIMARY KEY AUTOINCREMENT,
        // UUID TEXT,
        // ProjectID TEXT,
        // SubTaskID TEXT,
        // WorkID TEXT,
        // WorkRecordsIDs TEXT,
        // EmpId TEXT,
        // AllocationStartsAt DATE,
        // AllocationEndsAt DATE,
        // Assets JSON,

    const selectQuery = `SELECT UUID FROM AssetAllocations WHERE UUID = ?`;
    const [results] = await db.executeSql(selectQuery, [data.UUID]);
   
    if (results.rows.length > 0) {
      // Update if exists
      const updateQuery = `
        UPDATE AssetAllocations SET  ProjectID = ?, SubTaskID = ?, WorkID = ?, WorkRecordsID = ?, EmpId = ?, AllocationStartsAt = ? , AllocationEndsAt = ?, Assets = ?,  LastUpdate = ?
        WHERE UUID = ?
      `;
      const values = [
        data?.ProjectID,
        data?.SubTaskID,
        data?.WorkID,
        data?.WorkRecordsID,
        data?.EmpId,
        data?.AllocationStartsAt,
        data?.AllocationEndsAt,
        data?.Assets,
        new Date().toISOString(),
        data?.UUID
      ];
     
      return await db.executeSql(updateQuery, values);
    } else {
      // Insert if not exists
      const insertQuery = `
        INSERT INTO AssetAllocations (ProjectID, SubTaskID, WorkID, WorkRecordsID, EmpId, WorkStartsAt, Assets, LastUpdate)
        VALUES (?, ?, ?, ?, ?, ?)
      `;
      const values = [
         data?.ProjectID,
         data.SubTaskID,
         data.WorkID,
         data.WorkRecordsID,
         data.EmpId,
         new Date().toISOString(),
         data?.Assets,
         new Date().toISOString(),
      ];

     
      let result =  await db.executeSql(insertQuery, values);
      console.log("AssetAllocations",result)
      return result;
    }
  } catch (error) {
    console.error("AssetAllocations",error);
    throw Error("Failed to insert or update staff");
  }
}

export const addImages = async (db, data) => {

  try{

        //    CREATE TABLE IF NOT EXISTS ImageRecords (
        // id INTEGER PRIMARY KEY AUTOINCREMENT,
        // UUID TEXT,
        // ImgStr TEXT,
        // LastUpdate TEXT

    const selectQuery = `SELECT UUID FROM AssetAllocations WHERE UUID = ?`;
    const [results] = await db.executeSql(selectQuery, [data.UUID]);
   
    if (results.rows.length > 0) {
      // Update if exists
      const updateQuery = `
        UPDATE ImageRecords SET  ImgStr = ?,  LastUpdate = ?
        WHERE UUID = ?
      `;
      const values = [
        data?.ImgStr,
        new Date().toISOString(),
        data?.UUID
      ];
     
      return await db.executeSql(updateQuery, values);
    } else {
      // Insert if not exists
      const insertQuery = `
        INSERT INTO ImageRecords (UUID, ImgStr, LastUpdate)
        VALUES (?, ?, ?)
      `;
      const values = [
         data?.UUID,
         data.ImgStr,
         new Date().toISOString(),
      ];

     
      let result =  await db.executeSql(insertQuery, values);
      console.log("ImageRecords",result)
      return result;
    }
  } catch (error) {
    console.error("ImageRecords",error);
    throw Error("Failed to insert or update staff");
  }
}

export const searchSubTaskRecords = async (db, searchKey) => {
  try {
    const query = `
      SELECT * FROM SubTaskRecords
      WHERE SubTaskID LIKE ? OR SubTaskName LIKE ?
    `;

    // Add % for partial matching
    const likeKey = `%${searchKey}%`;

    const [results] = await db.executeSql(query, [likeKey, likeKey]);

    let data = [];
    for (let i = 0; i < results.rows.length; i++) {
      data.push(results.rows.item(i));
    }

    return data; // returns array of matched rows
  } catch (error) {
    console.error("Error searching SubTaskRecords:", error);
    throw Error("Failed to search SubTaskRecords");
  }
};

export const getDynamicRecords = async (db, searchData) => {
  try {
    // Search by SubTaskID (number) or SubTaskName (string)
    const query = `
      SELECT * FROM ${searchData.tableName}
      WHERE ${searchData.fieldeName }= ?
    `;

    const [results] = await db.executeSql(query, [searchKey, searchData.fieldeValue]);

    let data = [];
    for (let i = 0; i < results.rows.length; i++) {
      data.push(results.rows.item(i));
    }

    return data; // returns array of matched rows
  } catch (error) {
    console.error("Error fetching SubTaskRecords:", error);
    throw Error("Failed to fetch SubTaskRecords");
  }
};
