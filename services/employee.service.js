// services/employee.service.js

import { config } from '../config/config';
import { ApiExceptions } from '../utils/APIException';

export const searchEmployeeService = async ({
  employeeId,
  token,
  navigation,
}) => {
  try {
    const response = await fetch(`${config.Base_URL}/api/employees`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        emp_id: employeeId,
      }),
    });

    if (!response.ok) {
      ApiExceptions(response, navigation, { emp_id: employeeId });
      return [];
    }

    // console.log(response.body)

    const json = await response.json();
    return json?.data || [];
  } catch (error) {
    console.error('[EmployeeService] Search error:', error);
    throw error;
  }
};
