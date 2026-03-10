// database/helpers.js

export const execute = async (db, query, params = []) => {
  const [result] = await db.executeSql(query, params);
  return result;
};

export const fetchAll = async (db, query, params = []) => {
  const result = await execute(db, query, params);
  const rows = [];
  for (let i = 0; i < result.rows.length; i++) {
    rows.push(result.rows.item(i));
  }
  return rows;
};

export const fetchOne = async (db, query, params = []) => {
  const result = await execute(db, query, params);
  if (result.rows.length > 0) {
    return result.rows.item(0);
  }
  return null;
};

export const today = () => new Date().toISOString().split('T')[0];
export const now = () => new Date().toISOString();

export const transaction = async (db, callback) => {
  try {
    await execute(db, 'BEGIN TRANSACTION');
    await callback();
    await execute(db, 'COMMIT');
  } catch (error) {
    await execute(db, 'ROLLBACK');
    throw error;
  }
};
