import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';

export const adminUpsertStudent = httpsCallable(functions, 'adminUpsertStudent');
export const adminCreateAdmission = httpsCallable(functions, 'adminCreateAdmission');
export const setUserRole = httpsCallable(functions, 'setUserRole');
export const updateStudentMarks = httpsCallable(functions, 'updateStudentMarks');
export const addStudentRemark = httpsCallable(functions, 'addStudentRemark');
export const updateFees = httpsCallable(functions, 'updateFees');
export const addStatisticsEntry = httpsCallable(functions, 'addStatisticsEntry');
