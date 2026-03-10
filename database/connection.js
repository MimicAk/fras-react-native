// database/connection.js

import { enablePromise, openDatabase } from 'react-native-sqlite-storage';

enablePromise(true);

let dbConnection = null;

export const connectToDatabase = async () => {
  if (dbConnection) return dbConnection;

  dbConnection = await openDatabase({
    name: 'fras.db',
    location: 'default',
  });

  console.log('Database connected');
  return dbConnection;
};

export const closeDatabase = async () => {
  if (dbConnection) {
    await dbConnection.close();
    dbConnection = null;
    console.log('Database closed');
  }
};
