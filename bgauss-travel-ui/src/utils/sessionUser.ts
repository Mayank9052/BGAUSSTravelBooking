export interface SessionUserProfile {
  employeeId: string;
  employeeRecordId: string;
  fullName: string;
  department: string;
  designation: string;
  reportingManager: string;
  contactNumber: string;
  email: string;
  role: string;
}

export interface EditableEmployeeDetails {
  employeeId: string;
  fullName: string;
  department: string;
  designation: string;
  reportingManager: string;
  contactNumber: string;
  email: string;
}

function readFirstValue(keys: string[]): string {
  for (const key of keys) {
    const value = localStorage.getItem(key)?.trim();
    if (value) {
      return value;
    }
  }

  return "";
}

export function getSessionUserProfile(): SessionUserProfile {
  return {
    employeeId: readFirstValue(["employee_code", "employee_id"]),
    employeeRecordId: readFirstValue(["employee_id"]),
    fullName: readFirstValue(["full_name"]),
    department: readFirstValue(["department"]),
    designation: readFirstValue(["designation", "job_title"]),
    reportingManager: readFirstValue(["reporting_manager", "manager_name"]),
    contactNumber: readFirstValue([
      "contact_number",
      "mobile_phone",
      "business_phone",
      "phone",
    ]),
    email: readFirstValue(["email"]),
    role: readFirstValue(["role"]) || "Employee",
  };
}

export function hasRequiredEmployeeDetails(profile: EditableEmployeeDetails): boolean {
  return [
    profile.employeeId,
    profile.fullName,
    profile.department,
    profile.designation,
    profile.reportingManager,
    profile.contactNumber,
    profile.email,
  ].every((value) => value.trim().length > 0);
}

export function persistEmployeeDetails(profile: EditableEmployeeDetails): void {
  localStorage.setItem("employee_code", profile.employeeId.trim());
  localStorage.setItem("full_name", profile.fullName.trim());
  localStorage.setItem("department", profile.department.trim());
  localStorage.setItem("designation", profile.designation.trim());
  localStorage.setItem("reporting_manager", profile.reportingManager.trim());
  localStorage.setItem("contact_number", profile.contactNumber.trim());
  localStorage.setItem("email", profile.email.trim());
}
