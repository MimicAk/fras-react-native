// services/attendance.service.js

import {
  recordPunch,
  checkTodayPunch,
  getActiveCheckIn,
  processCheckoutAndCheckin,
} from '../database/punch.repository';

import { recognizeFaceService } from './face.service';
import RNFS from 'react-native-fs';

/* =====================================================
   HELPER: Resolve Current Project ID
===================================================== */

export const resolveProjectId = ({ nearyByProject, currentProject }) => {
  if (!nearyByProject || nearyByProject.length === 0) return null;

  if (nearyByProject.length > 1) {
    return currentProject?.guid ?? null;
  }

  return nearyByProject[0]?.guid ?? null;
};

/* =====================================================
   CHECK EMPLOYEE TODAY STATUS
===================================================== */

export const checkEmployeeTodayStatusService = async ({
  db,
  uuid,
  attendanceType,
  nearyByProject,
  currentProject,
}) => {
  const projectID = resolveProjectId({ nearyByProject, currentProject });

  return await checkTodayPunch(db, uuid, 'in', projectID, attendanceType);
};

const validateAttendanceContext = ({
  nearyByProject,
  currentProject,
  currentLocation,
  attendanceType,
  user,
}) => {
  if (!currentLocation?.latitude || !currentLocation?.longitude) {
    return {
      status: 'error',
      message: 'Location not available',
    };
  }

  const role = user?.roles?.find(r => r.guid === attendanceType);

  if (role?.attendance_logic?.project_required === true) {
    if (!nearyByProject || nearyByProject.length === 0) {
      return {
        status: 'error',
        message: 'No projects assigned to you',
      };
    }

    if (nearyByProject.length > 1 && !currentProject?.guid) {
      return {
        status: 'error',
        message: 'Please select a project',
      };
    }
  }

  return { status: 'ok' };
};

/* =====================================================
   CHECK ACTIVE CHECKIN (ANY PROJECT)
===================================================== */

export const checkActiveCheckinService = async ({
  db,
  uuid,
  attendanceType,
}) => {
  return await getActiveCheckIn(db, uuid, attendanceType);
};

/* =====================================================
   MAIN CHECK-IN SERVICE
   (Face → Attendance validation → Punch)
===================================================== */

export const processCheckInService = async ({
  db,
  faceResult,
  currentLocation,
  nearyByProject,
  currentProject,
  attendanceType,
  user,
  isManual = 0,
  userimage = null, // <-- ADDED: Accept userimage base64
}) => {
  try {
    const validation = validateAttendanceContext({
      nearyByProject,
      currentProject,
      currentLocation,
      attendanceType,
      user,
    });

    if (validation.status !== 'ok') {
      return validation;
    }

    const person = faceResult.employee;

    /* ---------------- Resolve Project ---------------- */

    const projectID = resolveProjectId({
      nearyByProject,
      currentProject,
    });

    /* ---------------- Check Duplicate Today ---------------- */

    // const alreadyCheckedIn = await checkTodayPunch(
    //   db,
    //   person.uuid,
    //   'in',
    //   projectID,
    //   attendanceType,
    // );

    // if (alreadyCheckedIn) {
    //   return {
    //     status: 'already_checkedin',
    //     message: 'Already checked in today',
    //   };
    // }

    /* ---------------- Check Active Checkin (Other Project) ---------------- */

    // const activeCheckin = await getActiveCheckIn(
    //   db,
    //   person.uuid,
    //   attendanceType,
    // );

    // if (activeCheckin) {
    //   return {
    //     status: 'active_checkin',
    //     employee: person,
    //     details: {
    //       activeCheckin,
    //       newProject: {
    //         guid: projectID,
    //       },
    //     },
    //   };
    // }

    /* ---------------- Perform Check-in ---------------- */

    await recordPunch(db, {
      uuid: person.uuid,
      punchType: 'in',
      lat: currentLocation?.latitude || '',
      lan: currentLocation?.longitude || '',
      attendanceType,
      projectID,
      punchMode: 'offline',
      isManual,
      userimage, // <-- Passed to repo
    });

    return {
      status: 'success',
      employee: person,
    };
  } catch (error) {
    return {
      status: 'error',
      message: error.message,
    };
  }
};

/* =====================================================
   MAIN CHECK-OUT SERVICE
   (Face → Validation → Checkout Punch)
===================================================== */

export const processCheckOutService = async ({
  db,
  faceResult,
  currentLocation,
  nearyByProject,
  currentProject,
  attendanceType,
  user,
  isManual = 0, // <-- ADDED
  userimage = null, // <-- ADDED
}) => {
  try {
    /* ---------------- Validate Context ---------------- */

    const validation = validateAttendanceContext({
      nearyByProject,
      currentProject,
      currentLocation,
      attendanceType,
      user,
    });

    if (validation.status !== 'ok') {
      return validation;
    }

    if (!faceResult?.employee?.uuid) {
      return {
        status: 'error',
        message: 'Face recognition failed',
      };
    }

    const person = faceResult.employee;

    const projectID = resolveProjectId({
      nearyByProject,
      currentProject,
    });

    /* ---------------- Get Active Checkin ---------------- */

    // const activeCheckin = await getActiveCheckIn(
    //   db,
    //   person.uuid,
    //   attendanceType,
    // );

    // if (!activeCheckin) {
    //   return {
    //     status: 'no_active_checkin',
    //     message: 'No active check-in found',
    //   };
    // }

    /* ---------------- Prevent Duplicate Checkout ---------------- */

    // const alreadyCheckedOut = await checkTodayPunch(
    //   db,
    //   person.uuid,
    //   'out',
    //   activeCheckin.projectid,
    //   attendanceType,
    // );

    // if (alreadyCheckedOut) {
    //   return {
    //     status: 'already_checkedout',
    //     message: 'Already checked out today',
    //   };
    // }

    /* ---------------- Perform Checkout ---------------- */

    await recordPunch(db, {
      uuid: person.uuid,
      punchType: 'out',
      lat: currentLocation?.latitude || '',
      lan: currentLocation?.longitude || '',
      attendanceType,
      projectID: projectID,
      punchMode: 'offline',
      isManual, // <-- Passed to repo
      userimage, // <-- Passed to repo
    });

    return {
      status: 'success',
      employee: person,
      checkedOutFrom: projectID,
    };
  } catch (error) {
    return {
      status: 'error',
      message: error.message,
    };
  }
};

/* =====================================================
   CHECKOUT + CHECKIN SERVICE
===================================================== */

export const processCheckoutAndCheckinService = async ({
  db,
  person,
  activeCheckinDetails,
  currentLocation,
  nearyByProject,
  currentProject,
  attendanceType,
  userimage = null, // <-- Added
}) => {
  try {
    if (!person?.uuid) {
      throw new Error('Employee data missing');
    }

    if (!activeCheckinDetails?.activeCheckin?.projectid) {
      throw new Error('Active check-in project missing');
    }

    const newProjectID = resolveProjectId({
      nearyByProject,
      currentProject,
    });

    const result = await processCheckoutAndCheckin(
      db,
      {
        uuid: person.uuid,
        lat: currentLocation?.latitude || '',
        lan: currentLocation?.longitude || '',
        attendanceType,
        projectID: activeCheckinDetails.activeCheckin.projectid,
        userimage,
      },
      {
        uuid: person.uuid,
        lat: currentLocation?.latitude || '',
        lan: currentLocation?.longitude || '',
        attendanceType,
        projectID: newProjectID,
        userimage,
      },
    );

    if (!result?.success) {
      throw new Error('Checkout & Checkin failed');
    }

    return { success: true };
  } catch (error) {
    throw new Error(error.message);
  }
};

/* =====================================================
   MANUAL ENTRY SERVICE
===================================================== */
export const manualEntryService = async ({
  db,
  manualEmpId,
  punchType,
  currentLocation,
  nearyByProject,
  currentProject,
  attendanceType,
  user,
  photo, // <-- ADDED: The photo object from vision camera
}) => {
  try {
    // Check local database for the employee
    const results = await db.executeSql(
      `SELECT * FROM facevector WHERE staffid = ? LIMIT 1`,
      [manualEmpId],
    );

    if (results[0].rows.length > 0) {
      const employee = results[0].rows.item(0);

      // --- PROCESS THE BASE64 IMAGE HERE ---
      let base64String = null;
      if (photo && photo.path) {
        // Make sure the path is properly formatted for RNFS
        const imagePath = photo.path.startsWith('file://')
          ? photo.path
          : `file://${photo.path}`;
        base64String = await RNFS.readFile(imagePath, 'base64');
      }

      let serviceResult;

      if (punchType === 'out') {
        // Delegate the check-out logic
        serviceResult = await processCheckOutService({
          db,
          faceResult: { employee: employee },
          currentLocation,
          nearyByProject,
          currentProject,
          attendanceType,
          user,
          isManual: 1,
          userimage: base64String, // <-- Passed Down
        });
      } else {
        // Delegate the check-in logic
        serviceResult = await processCheckInService({
          db,
          faceResult: { employee: employee },
          currentLocation,
          nearyByProject,
          currentProject,
          attendanceType,
          user,
          isManual: 1,
          userimage: base64String, // <-- Passed Down
        });
      }

      // Pass the employee object back along with the status
      return { ...serviceResult, employee };
    } else {
      return {
        status: 'not_found',
        message: 'Employee ID not found in the local database.',
      };
    }
  } catch (err) {
    console.error('Manual DB Error:', err);
    return { status: 'db_error', message: 'Database query failed.' };
  }
};

export const formatCheckIn = punch => ({
  guid: punch.id,
  emp_id: punch.uuid,
  project_id: punch.projectid,
  attendance_type: punch.attendancetype,
  date: punch.punchdate.split('T')[0],

  checkin_time: punch.punchdate,
  checkout_time: null,

  checkin_lat: punch.lat,
  checkin_lang: punch.lan,

  checkout_lat: null,
  checkout_lang: null,

  checkin_is_manual: punch.ismanual,
  checkout_is_manual: 0,

  checkin_image: punch.userimage,
  checkout_image: null,

  local_ids: [punch.id],
});

export const formatCheckOut = punch => ({
  guid: punch.id,
  emp_id: punch.uuid,
  project_id: punch.projectid,
  attendance_type: punch.attendancetype,
  date: punch.punchdate.split('T')[0],

  checkin_time: null,
  checkout_time: punch.punchdate,

  checkin_lat: null,
  checkin_lang: null,

  checkout_lat: punch.lat,
  checkout_lang: punch.lan,

  checkin_is_manual: 0,
  checkout_is_manual: punch.ismanual,

  checkin_image: null,
  checkout_image: punch.userimage,

  local_ids: [punch.id],
});

export const formatPair = (checkIn, checkOut) => ({
  guid: checkIn.id,
  emp_id: checkIn.uuid,
  project_id: checkIn.projectid,
  attendance_type: checkIn.attendancetype,
  date: checkIn.punchdate.split('T')[0],

  checkin_time: checkIn.punchdate,
  checkout_time: checkOut.punchdate,

  checkin_lat: checkIn.lat,
  checkin_lang: checkIn.lan,

  checkout_lat: checkOut.lat,
  checkout_lang: checkOut.lan,

  checkin_is_manual: checkIn.ismanual,
  checkout_is_manual: checkOut.ismanual,

  checkin_image: checkIn.userimage,
  checkout_image: checkOut.userimage,

  local_ids: [checkIn.id, checkOut.id],
});
