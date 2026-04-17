// src/pages/travel-requests/TravelRequestOptionsPage.tsx
// CHANGES:
//  1. Department is now a dropdown with BGauss departments
//  2. Back button in navbar (showBack=true)

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

// ── BGauss departments ────────────────────────────────────────────────────────
const DEPARTMENTS = [
  "Branding and Marketing", "Sales", "Production", "Finance and Legal", "Logistic and Store Mgt",
  "Quality", "Service", "CBD", "Research and Development EE", "Development", "HR and Admin", "SCM",
  "Research and Development VI", "Research and Development MD", "Operation", "B2B Sales", "IT", "B2B Service", "Maintenance","Customer Care","Strategic Business",
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

export default function TravelRequestOptionsPage() {
  const navigate    = useNavigate();
  const sessionUser = getSessionUserProfile();

  const [selectedOption, setSelectedOption] = useState<RequestOptionId | "">("");
  const [formError,      setFormError]       = useState<string | null>(null);

  const [employeeDetails, setEmployeeDetails] = useState<EditableEmployeeDetails>({
    employeeId:       sessionUser.employeeId       || sessionUser.employeeRecordId || "",
    fullName:         sessionUser.fullName         || "",
    department:       sessionUser.department       || "",
    designation:      sessionUser.designation      || "",
    reportingManager: sessionUser.reportingManager || "",
    contactNumber:    sessionUser.contactNumber    || "",
    email:            sessionUser.email            || "",
  });

  const fullName = employeeDetails.fullName || "Employee";
  const role     = sessionUser.role || "Employee";
  const initials = fullName.trim().split(" ").filter(Boolean)
    .map(p => p[0]).slice(0, 2).join("").toUpperCase() || "ME";

  const selectedRequest = REQUEST_OPTIONS.find(o => o.id === selectedOption);

  const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setEmployeeDetails(prev => ({ ...prev, [name]: value }));
    if (formError) setFormError(null);
  };

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const missing: string[] = [];
    if (!employeeDetails.employeeId.trim())  missing.push("Employee ID");
    if (!employeeDetails.fullName.trim())    missing.push("Employee Name");
    if (!employeeDetails.department.trim())  missing.push("Department");
    if (!employeeDetails.email.trim())       missing.push("Email");
    if (!selectedOption)                      missing.push("Mode of Travel");
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
            <h1 className={styles.heroTitle}>Complete employee details before travel mode selection</h1>
            <p className={styles.heroSubtitle}>
              Fill in the required employee details, choose the mode of travel, and continue to the request form.
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
                <p className={styles.sectionEyebrow}>Required fields</p>
                <h2 className={styles.sectionTitle}>Raise Travel Request</h2>
                <p className={styles.sectionNote}>Employee ID, Name, Department and Email are required.</p>
              </div>
              <span className={styles.typeChip}>
                {selectedRequest ? selectedRequest.title : "No mode selected"}
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

                <label className={styles.field}>
                  <span className={styles.label}>Employee ID *</span>
                  <input className={styles.input} name="employeeId"
                    value={employeeDetails.employeeId} onChange={handleChange}
                    placeholder="Enter employee ID" required />
                </label>

                <label className={styles.field}>
                  <span className={styles.label}>Employee Name *</span>
                  <input className={styles.input} name="fullName"
                    value={employeeDetails.fullName} onChange={handleChange}
                    placeholder="Enter full name" required />
                </label>

                {/* ── Department — dropdown ── */}
                <label className={styles.field}>
                  <span className={styles.label}>Department *</span>
                  <select className={styles.input} name="department"
                    value={employeeDetails.department} onChange={handleChange} required>
                    <option value="" disabled>Select department</option>
                    {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </label>

                <label className={styles.field}>
                  <span className={styles.label}>Designation</span>
                  <input className={styles.input} name="designation"
                    value={employeeDetails.designation} onChange={handleChange}
                    placeholder="Enter designation (optional)" />
                </label>

                <label className={styles.field}>
                  <span className={styles.label}>Reporting Manager</span>
                  <input className={styles.input} name="reportingManager"
                    value={employeeDetails.reportingManager} onChange={handleChange}
                    placeholder="Enter reporting manager (optional)" />
                </label>

                <label className={styles.field}>
                  <span className={styles.label}>Contact Number</span>
                  <input className={styles.input} name="contactNumber" type="tel"
                    value={employeeDetails.contactNumber} onChange={handleChange}
                    placeholder="Enter contact number (optional)" />
                </label>

                <label className={`${styles.field} ${styles.fieldWide}`}>
                  <span className={styles.label}>Email ID *</span>
                  <input className={styles.input} name="email" type="email"
                    value={employeeDetails.email} onChange={handleChange}
                    placeholder="Enter email ID" required />
                </label>

                <label className={`${styles.field} ${styles.fieldWide}`}>
                  <span className={styles.label}>Mode of Travel *</span>
                  <select className={styles.input}
                    value={selectedOption}
                    onChange={e => setSelectedOption(e.target.value as RequestOptionId)}
                    required>
                    <option value="" disabled>Select mode of travel</option>
                    {REQUEST_OPTIONS.map(o => (
                      <option key={o.id} value={o.id}>{o.icon} {o.title}</option>
                    ))}
                  </select>
                </label>

              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 24 }}>
                <button type="submit" className={styles.primaryBtn}>
                  {selectedRequest ? `Continue to ${selectedRequest.title} →` : "Continue to Request Form →"}
                </button>
              </div>
            </form>
          </section>

          <aside className={styles.sideColumn}>
            <section className={styles.infoCard}>
              <p className={styles.sectionEyebrow}>Current selection</p>
              <h3 className={styles.selectionTitle}>
                {selectedRequest ? `${selectedRequest.icon} ${selectedRequest.title}` : "No travel mode selected"}
              </h3>
              <p className={styles.selectionDesc}>
                {selectedRequest?.description ?? "Choose a travel mode from the dropdown or the cards below."}
              </p>
            </section>

            <section className={styles.infoCard}>
              <div className={styles.sectionHeader}>
                <p className={styles.sectionEyebrow} style={{ marginBottom: 0 }}>Available options</p>
                <span className={styles.typeChip}>{REQUEST_OPTIONS.length}</span>
              </div>
              <div className={styles.optionsGrid}>
                {REQUEST_OPTIONS.map(o => (
                  <button key={o.id} type="button"
                    className={`${styles.optionCard} ${selectedOption === o.id ? styles.optionCardActive : ""}`}
                    onClick={() => { setSelectedOption(o.id); setFormError(null); }}>
                    <span className={styles.optionIcon}>{o.icon}</span>
                    <span className={styles.optionTitle}>{o.title}</span>
                    <span className={styles.optionDesc}>{o.description}</span>
                    <span className={styles.optionTag}>{selectedOption === o.id ? "✓ Selected" : "Choose"}</span>
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