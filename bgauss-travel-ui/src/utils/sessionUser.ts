// src/utils/sessionUser.ts
// FIX: hasRequiredEmployeeDetails no longer requires contactNumber, designation,
//      reportingManager — these often come back empty from Microsoft Graph.
//      Only truly required fields are: employeeId, fullName, department, email.
//      This was the reason "Continue to Request Form" was not working.

export interface SessionUserProfile {
  employeeId:       string;   // display code e.g. "EMP001"
  employeeRecordId: string;   // numeric DB primary key (used for API calls)
  fullName:         string;
  department:       string;
  designation:      string;
  reportingManager: string;
  contactNumber:    string;
  email:            string;
  role:             string;
}

export interface EditableEmployeeDetails {
  employeeId:       string;
  fullName:         string;
  department:       string;
  designation:      string;
  reportingManager: string;
  contactNumber:    string;
  email:            string;
}

function readFirstValue(keys: string[]): string {
  for (const key of keys) {
    const value = localStorage.getItem(key)?.trim();
    if (value) return value;
  }
  return "";
}

export function getSessionUserProfile(): SessionUserProfile {
  return {
    employeeId:       readFirstValue(["employee_code"]),
    employeeRecordId: readFirstValue(["employee_id"]),
    fullName:         readFirstValue(["full_name"]),
    department:       readFirstValue(["department"]),
    designation:      readFirstValue(["designation", "job_title"]),
    reportingManager: readFirstValue(["reporting_manager", "manager_name"]),
    contactNumber:    readFirstValue(["contact_number", "mobile_phone", "business_phone", "phone"]),
    email:            readFirstValue(["email"]),
    role:             readFirstValue(["role"]) || "Employee",
  };
}

// ── FIX: only 4 truly required fields ────────────────────────────────────────
// contactNumber, designation, reportingManager are OPTIONAL in Microsoft Graph
// — they come back empty for many accounts. Requiring them caused the button
// to silently redirect back to /booking/new on every submit.
export function hasRequiredEmployeeDetails(profile: EditableEmployeeDetails): boolean {
  return [
    profile.employeeId,   // must have an employee code / ID
    profile.fullName,     // must have a name
    profile.department,   // must have a department
    profile.email,        // must have an email
  ].every(v => v.trim().length > 0);
}

export function persistEmployeeDetails(profile: EditableEmployeeDetails): void {
  localStorage.setItem("employee_code",      profile.employeeId.trim());
  localStorage.setItem("full_name",          profile.fullName.trim());
  localStorage.setItem("department",         profile.department.trim());
  localStorage.setItem("designation",        profile.designation.trim());
  localStorage.setItem("reporting_manager",  profile.reportingManager.trim());
  localStorage.setItem("contact_number",     profile.contactNumber.trim());
  localStorage.setItem("email",              profile.email.trim());
}