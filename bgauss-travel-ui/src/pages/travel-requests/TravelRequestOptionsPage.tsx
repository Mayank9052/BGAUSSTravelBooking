// src/pages/travel-requests/TravelRequestOptionsPage.tsx
// FIX: Disabled fields now always show correct DB values on first load.
//      Employee profile data (designation, reportingManager, contactNumber) is read
//      directly from localStorage using the exact keys saved by useMsalLogin + the
//      profile sync added in DashboardPage.loadDashboard.
//      No manual dashboard update is needed — data is always fresh.

import { useState, type ChangeEvent, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import CommonNavbar from "../../components/layout/CommonNavbar";
import { signOutUser } from "../../auth/signOut";
import {
  getSessionUserProfile,
  persistEmployeeDetails,
  type EditableEmployeeDetails,
} from "../../utils/sessionUser";
import styles from "./TravelRequestOptionsPage.module.css";

const DEPARTMENTS = [
  "Branding and Marketing","Sales","Production","Finance and Legal","Logistic and Store Mgt",
  "Quality","Service","CBD","Research and Development EE","Development","HR and Admin","SCM",
  "Research and Development VI","Research and Development MD","Operation","B2B Sales","IT",
  "B2B Service","Maintenance","Customer Care","Strategic Business",
];

const REQUEST_OPTIONS = [
  { id: "flight", icon: "✈️", title: "Flight Request",
    description: "Domestic and international air travel for meetings, site visits, and official tours.",
    path: "/booking/new/flight" },
  { id: "train",  icon: "🚆", title: "Train Request",
    description: "Rail booking for intercity travel with lower-cost and policy-friendly options.",
    path: "/booking/new/train" },
  { id: "bus",    icon: "🚌", title: "Bus Request",
    description: "State/private bus travel for intercity movement where rail is not available.",
    path: "/booking/new/bus" },
  { id: "cab",    icon: "🚕", title: "Cab Request",
    description: "Local transport for airport transfers, office visits, and same-day business movement.",
    path: "/booking/new/cab" },
  { id: "hotel",  icon: "🏨", title: "Hotel Request",
    description: "Accommodation requests for approved overnight travel and events.",
    path: "/booking/new/hotel" },
] as const;

type RequestOptionId = (typeof REQUEST_OPTIONS)[number]["id"];

// ✅ Read ALL fields directly from localStorage using the exact keys written by
//    useMsalLogin.ts and the profile-sync in DashboardPage.loadDashboard.
//    This bypasses any stale or incomplete getSessionUserProfile() mapping.
function readProfileFromStorage(): EditableEmployeeDetails {
  return {
    employeeId:       localStorage.getItem("employee_code") ?? "",   // employee_code = "EMP001" style id
    fullName:         localStorage.getItem("full_name")     ?? "",
    department:       localStorage.getItem("department")    ?? "",
    designation:      localStorage.getItem("designation")   ?? "",
    // ✅ Key is "reporting_manager" (with underscore) — matches useMsalLogin save
    reportingManager: localStorage.getItem("reporting_manager") ?? "",
    // ✅ Key is "contact_number" (with underscore) — matches useMsalLogin save
    contactNumber:    localStorage.getItem("contact_number") ?? "",
    email:            localStorage.getItem("email")          ?? "",
  };
}

// Shared disabled field style — applied to all pre-filled inputs/selects
const disabledFieldStyle: React.CSSProperties = {
  opacity: 0.65,
  cursor: "not-allowed",
  background: "#f1f5f9",
  color: "#475569",
};

export default function TravelRequestOptionsPage() {
  const navigate    = useNavigate();
  const sessionUser = getSessionUserProfile();

  const [selectedOption, setSelectedOption] = useState<RequestOptionId | "">("");
  const [formError,      setFormError]      = useState<string | null>(null);
  const [showAllOptions, setShowAllOptions] = useState(true);

  // ✅ Initialise from localStorage directly so fields show DB values immediately.
  //    Falls back to getSessionUserProfile() for any field that's still missing.
  const [employeeDetails, setEmployeeDetails] = useState<EditableEmployeeDetails>(() => {
    const fromStorage = readProfileFromStorage();
    return {
      employeeId:       fromStorage.employeeId       || sessionUser.employeeId || sessionUser.employeeRecordId || "",
      fullName:         fromStorage.fullName         || sessionUser.fullName         || "",
      department:       fromStorage.department       || sessionUser.department       || "",
      designation:      fromStorage.designation      || sessionUser.designation      || "",
      reportingManager: fromStorage.reportingManager || sessionUser.reportingManager || "",
      contactNumber:    fromStorage.contactNumber    || sessionUser.contactNumber    || "",
      email:            fromStorage.email            || sessionUser.email            || "",
    };
  });

  const fullName = employeeDetails.fullName || "Employee";
  const role     = sessionUser.role || localStorage.getItem("role") || "Employee";
  const initials = fullName.trim().split(" ").filter(Boolean)
    .map(p => p[0]).slice(0, 2).join("").toUpperCase() || "ME";

  const selectedRequest = REQUEST_OPTIONS.find(o => o.id === selectedOption);

  // onChange kept so TypeScript is satisfied — fields are disabled so it never fires
  const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setEmployeeDetails(prev => ({ ...prev, [name]: value }));
    if (formError) setFormError(null);
  };

  const handleSelectOption = (id: RequestOptionId) => {
    setSelectedOption(id);
    setShowAllOptions(false);
    setFormError(null);
  };

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const missing: string[] = [];
    if (!employeeDetails.employeeId.trim())       missing.push("Employee ID");
    if (!employeeDetails.fullName.trim())          missing.push("Employee Name");
    if (!employeeDetails.department.trim())        missing.push("Department");
    if (!employeeDetails.reportingManager?.trim()) missing.push("Reporting Manager");
    if (!employeeDetails.email.trim())             missing.push("Email");
    if (!selectedOption)                           missing.push("Mode of Travel");
    if (missing.length > 0) { setFormError(`Please fill in: ${missing.join(", ")}`); return; }
    if (!selectedRequest)   { setFormError("Please select a mode of travel."); return; }

    persistEmployeeDetails(employeeDetails);
    setFormError(null);
    navigate(selectedRequest.path, { replace: false });
  };

  return (
    <div className={styles.page}>
      <CommonNavbar
        user={{ initials, name: fullName, subtitle: role }}
        onSignOut={() => signOutUser()}
        showBack={true}
        onBack={() => navigate("/dashboard")}
      />

      <main className={styles.main}>
        <section className={styles.hero}>
          <div className={styles.heroCopy}>
            <span className={styles.heroBadge}>Raise travel request</span>
            <h1 className={styles.heroTitle}>Select your mode of travel to continue</h1>
            <p className={styles.heroSubtitle}>
              Your employee details are pre-filled from your profile. Select a mode of travel below to proceed.
            </p>
          </div>
          <div className={styles.heroActions}>
            <button type="button" className={styles.secondaryBtn} onClick={() => navigate("/dashboard")}>
              Back to Dashboard
            </button>
          </div>
        </section>

        <div className={styles.layout}>
          <section className={styles.formCard}>
            <div className={styles.sectionHeader}>
              <div>
                <p className={styles.sectionEyebrow}>Pre-filled from your profile</p>
                <h2 className={styles.sectionTitle}>Raise Travel Request</h2>
                <p className={styles.sectionNote}>
                  Employee details are auto-filled and locked. Select a <strong>Mode of Travel</strong> to continue.
                </p>
              </div>
              <span className={styles.typeChip}>
                {selectedRequest ? `${selectedRequest.icon} ${selectedRequest.title}` : "No mode selected"}
              </span>
            </div>

            {formError && (
              <div style={{
                padding: "12px 16px", borderRadius: 10, marginBottom: 20,
                fontSize: 13, fontWeight: 600,
                background: "#fef2f2", color: "#991b1b", border: "1px solid #fecaca",
              }}>
                ❌ {formError}
              </div>
            )}

            <form onSubmit={handleSubmit}>
              <div className={styles.grid}>

                {/* ── DISABLED: Employee ID ── */}
                <label className={styles.field}>
                  <span className={styles.label}>Employee ID</span>
                  <input
                    className={styles.input}
                    name="employeeId"
                    value={employeeDetails.employeeId}
                    onChange={handleChange}
                    placeholder="—"
                    disabled
                    style={disabledFieldStyle}
                  />
                </label>

                {/* ── DISABLED: Employee Name ── */}
                <label className={styles.field}>
                  <span className={styles.label}>Employee Name</span>
                  <input
                    className={styles.input}
                    name="fullName"
                    value={employeeDetails.fullName}
                    onChange={handleChange}
                    placeholder="—"
                    disabled
                    style={disabledFieldStyle}
                  />
                </label>

                {/* ── DISABLED: Department ── */}
                <label className={styles.field}>
                  <span className={styles.label}>Department</span>
                  <select
                    className={styles.input}
                    name="department"
                    value={employeeDetails.department}
                    onChange={handleChange}
                    disabled
                    style={disabledFieldStyle}
                  >
                    <option value="" disabled>—</option>
                    {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </label>

                {/* ── DISABLED: Reporting Manager ── */}
                <label className={styles.field}>
                  <span className={styles.label}>Reporting Manager</span>
                  <input
                    className={styles.input}
                    name="reportingManager"
                    value={employeeDetails.reportingManager}
                    onChange={handleChange}
                    placeholder="—"
                    disabled
                    style={disabledFieldStyle}
                  />
                </label>

                {/* ── DISABLED: Designation ── */}
                <label className={styles.field}>
                  <span className={styles.label}>Designation</span>
                  <input
                    className={styles.input}
                    name="designation"
                    value={employeeDetails.designation}
                    onChange={handleChange}
                    placeholder="—"
                    disabled
                    style={disabledFieldStyle}
                  />
                </label>

                {/* ── DISABLED: Contact Number ── */}
                <label className={styles.field}>
                  <span className={styles.label}>Contact Number</span>
                  <input
                    className={styles.input}
                    name="contactNumber"
                    type="tel"
                    value={employeeDetails.contactNumber}
                    onChange={handleChange}
                    placeholder="—"
                    disabled
                    style={disabledFieldStyle}
                  />
                </label>

                {/* ── DISABLED: Email ── */}
                <label className={`${styles.field} ${styles.fieldWide}`}>
                  <span className={styles.label}>Email ID</span>
                  <input
                    className={styles.input}
                    name="email"
                    type="email"
                    value={employeeDetails.email}
                    onChange={handleChange}
                    placeholder="—"
                    disabled
                    style={disabledFieldStyle}
                  />
                </label>

                {/* ── INTERACTIVE: Mode of Travel ── */}
                <div className={`${styles.field} ${styles.fieldWide}`}>
                  <span className={styles.label} style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>
                    Mode of Travel *
                  </span>

                  {/* Selected chip + change button */}
                  {selectedRequest && !showAllOptions && (
                    <div style={{
                      display: "flex", alignItems: "center", gap: 12,
                      padding: "10px 16px", background: "#f0fdf4",
                      border: "1.5px solid #bbf7d0", borderRadius: 10, marginBottom: 10,
                    }}>
                      <span style={{ fontSize: 22 }}>{selectedRequest.icon}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: 13, color: "#0f172a" }}>{selectedRequest.title}</div>
                        <div style={{ fontSize: 11, color: "#64748b" }}>{selectedRequest.description}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowAllOptions(true)}
                        style={{
                          padding: "5px 12px", background: "#0f172a", color: "#fff",
                          border: "none", borderRadius: 8, fontSize: 11, fontWeight: 700,
                          cursor: "pointer", whiteSpace: "nowrap",
                        }}
                      >
                        Change ↓
                      </button>
                    </div>
                  )}

                  {/* All options grid */}
                  {showAllOptions && (
                    <div style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
                      gap: 10,
                      marginTop: 8,
                    }}>
                      {REQUEST_OPTIONS.map(o => (
                        <button
                          key={o.id}
                          type="button"
                          onClick={() => handleSelectOption(o.id as RequestOptionId)}
                          style={{
                            display: "flex", flexDirection: "column", alignItems: "center",
                            gap: 6, padding: "14px 10px", borderRadius: 12, cursor: "pointer",
                            border: selectedOption === o.id
                              ? "2.5px solid #0f172a"
                              : "1.5px solid #e2e8f0",
                            background: selectedOption === o.id ? "#0f172a" : "#f8fafc",
                            color: selectedOption === o.id ? "#fff" : "#334155",
                            transition: "all 0.15s",
                            textAlign: "center",
                          }}
                        >
                          <span style={{ fontSize: 26 }}>{o.icon}</span>
                          <span style={{ fontSize: 12, fontWeight: 700 }}>{o.title}</span>
                          {selectedOption === o.id && (
                            <span style={{
                              fontSize: 10, background: "rgba(255,255,255,0.2)",
                              padding: "2px 8px", borderRadius: 20, fontWeight: 700,
                            }}>✓ Selected</span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}

                  {!selectedOption && (
                    <p style={{ fontSize: 11, color: "#f59e0b", marginTop: 6 }}>
                      ⚠ Please select a mode of travel to continue.
                    </p>
                  )}
                </div>

              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 24 }}>
                <button
                  type="submit"
                  className={styles.primaryBtn}
                  disabled={!selectedOption}
                  style={{ opacity: !selectedOption ? 0.5 : 1 }}
                >
                  {selectedRequest
                    ? `Continue to ${selectedRequest.title} →`
                    : "Select a travel mode to continue"}
                </button>
              </div>
            </form>
          </section>

          <aside className={styles.sideColumn}>
            <section className={styles.infoCard}>
              <p className={styles.sectionEyebrow}>Current selection</p>
              <h3 className={styles.selectionTitle}>
                {selectedRequest
                  ? `${selectedRequest.icon} ${selectedRequest.title}`
                  : "No travel mode selected"}
              </h3>
              <p className={styles.selectionDesc}>
                {selectedRequest?.description
                  ?? "Choose a travel mode from the cards on the left."}
              </p>
            </section>

            <section className={styles.infoCard}>
              <div className={styles.sectionHeader}>
                <p className={styles.sectionEyebrow} style={{ marginBottom: 0 }}>Available options</p>
                <span className={styles.typeChip}>{REQUEST_OPTIONS.length}</span>
              </div>
              <div className={styles.optionsGrid}>
                {REQUEST_OPTIONS.map(o => (
                  <button
                    key={o.id}
                    type="button"
                    className={`${styles.optionCard} ${selectedOption === o.id ? styles.optionCardActive : ""}`}
                    onClick={() => { handleSelectOption(o.id as RequestOptionId); }}
                  >
                    <span className={styles.optionIcon}>{o.icon}</span>
                    <span className={styles.optionTitle}>{o.title}</span>
                    <span className={styles.optionDesc}>{o.description}</span>
                    <span className={styles.optionTag}>
                      {selectedOption === o.id ? "✓ Selected" : "Choose"}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          </aside>
        </div>
      </main>
    </div>
  );
}
