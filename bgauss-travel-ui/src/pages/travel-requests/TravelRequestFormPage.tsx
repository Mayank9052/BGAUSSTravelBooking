// src/pages/travel-requests/TravelRequestFormPage.tsx
// Added: LocationCapture component after destination fields
// Submit sends location fields to POST /api/Booking

import { useState, type ChangeEvent, type FormEvent } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { useMsalLogin } from "../../auth/useMsalLogin";
import CommonNavbar from "../../components/layout/CommonNavbar";
import { LocationCapture } from "../../components/LocationCapture";
import type { CapturedLocation } from "../../components/LocationCapture";
import { getSessionUserProfile, hasRequiredEmployeeDetails } from "../../utils/sessionUser";
import { bookingService } from "../../services/bookingService";
import { ApiError } from "../../services/apiClient";
import styles from "./TravelRequestFormPage.module.css";

// ── Page config ───────────────────────────────────────────────────────────────
const REQUEST_PAGE_CONFIG = {
  flight: {
    icon: "✈️", title: "Flight Booking Request",
    subtitle: "Raise an air travel request for domestic or international business movement.",
    routeLabel: "Flight", transportType: "Flight",
    fieldLabels: { from: "Departure City", to: "Arrival City", date1: "Departure Date", date2: "Return Date", option1: "Trip Type", option2: "Cabin Preference" },
    option1Values: ["One Way", "Round Trip", "Multi City"],
    option2Values: ["Economy", "Premium Economy", "Business"],
    policyPoints: ["Book flights only for approved business travel.", "Choose the most cost-effective fare within policy.", "Attach meeting details for customer or plant visits."],
    documents: ["Travel agenda", "Approval mail", "Customer or plant visit note"],
  },
  train: {
    icon: "🚆", title: "Train Booking Request",
    subtitle: "Raise a rail booking request for intercity official travel.",
    routeLabel: "Train", transportType: "Train",
    fieldLabels: { from: "Boarding Station", to: "Destination Station", date1: "Journey Date", date2: "Return Date", option1: "Journey Type", option2: "Coach Preference" },
    option1Values: ["One Way", "Round Trip"],
    option2Values: ["Sleeper", "3A", "2A", "Chair Car"],
    policyPoints: ["Use train travel when practical and policy-friendly.", "Mention reporting time when same-day travel is needed.", "Add return details if round-trip booking is required."],
    documents: ["Visit purpose note", "Approval mail", "Travel timeline"],
  },
  cab: {
    icon: "🚕", title: "Cab Booking Request",
    subtitle: "Raise a request for office visits, airport transfers, or local business travel.",
    routeLabel: "Cab", transportType: "Cab",
    fieldLabels: { from: "Pickup Location", to: "Drop Location", date1: "Travel Date", date2: "Return/Pickup Back Date", option1: "Cab Type", option2: "Usage Window" },
    option1Values: ["Sedan", "SUV", "Premium"],
    option2Values: ["One Way", "Round Trip", "Full Day"],
    policyPoints: ["Use cab requests for business movement only.", "Mention airport transfer separately if tied to a flight.", "Provide exact pickup timing to avoid delays."],
    documents: ["Meeting schedule", "Approval mail", "Airport or office timing"],
  },
  hotel: {
    icon: "🏨", title: "Hotel Booking Request",
    subtitle: "Raise an accommodation request for approved overnight travel and events.",
    routeLabel: "Hotel", transportType: "Hotel",
    fieldLabels: { from: "City of Stay", to: "Preferred Area/Property", date1: "Check-in Date", date2: "Check-out Date", option1: "Room Type", option2: "Stay Category" },
    option1Values: ["Standard", "Executive", "Twin Sharing"],
    option2Values: ["Single Stay", "Extended Stay", "Event Stay"],
    policyPoints: ["Hotel bookings must align with approved travel duration.", "Choose business-approved properties wherever available.", "Mention late check-in or event venue requirements clearly."],
    documents: ["Travel approval", "Event or meeting details", "Guest stay requirement note"],
  },
} as const;

type RequestType = keyof typeof REQUEST_PAGE_CONFIG;

interface FormState {
  from: string; to: string; date1: string; date2: string;
  option1: string; option2: string; travelPurpose: string; notes: string;
}

const EMPTY_FORM: FormState = { from: "", to: "", date1: "", date2: "", option1: "", option2: "", travelPurpose: "", notes: "" };

export default function TravelRequestFormPage() {
  const navigate       = useNavigate();
  const { signOut }    = useMsalLogin();
  const { requestType } = useParams<{ requestType: string }>();
  const config          = requestType ? REQUEST_PAGE_CONFIG[requestType as RequestType] : undefined;
  const sessionUser     = getSessionUserProfile();

  const fullName   = sessionUser.fullName || "Employee";
  const role       = sessionUser.role     || "Employee";
  const initials   = fullName.trim().split(" ").filter(Boolean).map(p => p[0]).slice(0, 2).join("").toUpperCase() || "ME";

  const [form,       setForm]       = useState<FormState>(EMPTY_FORM);
  const [location,   setLocation]   = useState<CapturedLocation | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitMsg,  setSubmitMsg]  = useState<{ type: "success" | "error"; text: string } | null>(null);

  const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [e.target.name]: e.target.value }));

  const validate = (): string | null => {
    if (!config) return "Invalid request type.";
    if (!form.from.trim())          return `${config.fieldLabels.from} is required.`;
    if (!form.to.trim())            return `${config.fieldLabels.to} is required.`;
    if (!form.date1)                return `${config.fieldLabels.date1} is required.`;
    if (!form.date2)                return `${config.fieldLabels.date2} is required.`;
    if (form.date2 < form.date1)    return "End date cannot be before start date.";
    if (!form.option1)              return `${config.fieldLabels.option1} is required.`;
    if (!form.travelPurpose.trim()) return "Travel Purpose is required.";
    return null;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!config) return;
    const err = validate();
    if (err) { setSubmitMsg({ type: "error", text: err }); return; }

    setSubmitting(true);
    setSubmitMsg(null);
    try {
      const destination    = `${form.from.trim()} → ${form.to.trim()}`;
      const purposeWithOpts = `${form.travelPurpose.trim()}\n${config.fieldLabels.option1}: ${form.option1}${form.option2 ? ` | ${config.fieldLabels.option2}: ${form.option2}` : ""}`;

      const result = await bookingService.create({
        employeeId:      Number(localStorage.getItem("employee_id") ?? "0"),
        travelPurpose:   purposeWithOpts,
        destination,
        departureDate:   form.date1,
        returnDate:      form.date2,
        transportType:   config.transportType,
        notes:           form.notes.trim() || undefined,
        // ── Location fields ──────────────────────────────────────────────────
        originLatitude:     location?.latitude     ?? undefined,
        originLongitude:    location?.longitude    ?? undefined,
        originAddress:      location?.address      ?? undefined,
        locationCapturedAt: location?.capturedAt   ?? undefined,
      });

      setSubmitMsg({ type: "success", text: `✅ Request submitted! Code: ${result.requestCode}` });
      setForm(EMPTY_FORM);
      setLocation(null);
      setTimeout(() => navigate("/dashboard"), 2000);
    } catch (ex) {
      const msg = ex instanceof ApiError ? ex.message : (ex instanceof Error ? ex.message : "Submission failed.");
      setSubmitMsg({ type: "error", text: `❌ ${msg}` });
    } finally { setSubmitting(false); }
  };

  // ── Guards ────────────────────────────────────────────────────────────────
  if (!config) return <Navigate to="/booking/new" replace />;
  const empDetails = {
    employeeId: sessionUser.employeeId || sessionUser.employeeRecordId,
    fullName: sessionUser.fullName, department: sessionUser.department,
    designation: sessionUser.designation, reportingManager: sessionUser.reportingManager,
    contactNumber: sessionUser.contactNumber, email: sessionUser.email,
  };
  if (!hasRequiredEmployeeDetails(empDetails)) return <Navigate to="/booking/new" replace />;

  return (
    <div className={styles.page}>
      <CommonNavbar user={{ initials, name: fullName, subtitle: role }} onSignOut={async () => signOut()} />

      <main className={styles.main}>
        {/* Hero */}
        <section className={styles.hero}>
          <div className={styles.heroCopy}>
            <span className={styles.heroBadge}>{config.routeLabel} Request</span>
            <h1 className={styles.heroTitle}><span className={styles.heroIcon}>{config.icon}</span>{config.title}</h1>
            <p className={styles.heroSubtitle}>{config.subtitle}</p>
          </div>
          <div className={styles.heroActions}>
            <button type="button" className={styles.secondaryBtn} onClick={() => navigate("/booking/new")}>Back to Options</button>
            <button type="button" className={styles.primaryBtn}   onClick={() => navigate("/dashboard")}>Back to Dashboard</button>
          </div>
        </section>

        <div className={styles.layout}>

          {/* ── Form card ────────────────────────────────────────── */}
          <section className={styles.formCard}>
            <div className={styles.sectionHeader}>
              <div>
                <p className={styles.sectionEyebrow}>Request details</p>
                <h2 className={styles.sectionTitle}>Employee Travel Submission</h2>
                <p className={styles.sectionNote}>Fields marked * are required.</p>
              </div>
              <span className={styles.typeChip}>{config.routeLabel}</span>
            </div>

            {submitMsg && (
              <div style={{
                padding: "12px 16px", borderRadius: 10, marginBottom: 20, fontSize: 13, fontWeight: 600,
                background: submitMsg.type === "success" ? "#dcfce7" : "#fef2f2",
                color:      submitMsg.type === "success" ? "#166534"  : "#991b1b",
                border: `1px solid ${submitMsg.type === "success" ? "#86efac" : "#fecaca"}`,
              }}>{submitMsg.text}</div>
            )}

            <form onSubmit={e => void handleSubmit(e)}>
              <div className={styles.grid}>

                <label className={styles.field}>
                  <span className={styles.label}>{config.fieldLabels.from} *</span>
                  <input className={styles.input} name="from" value={form.from} onChange={handleChange}
                    placeholder={`Enter ${config.fieldLabels.from.toLowerCase()}`} required />
                </label>

                <label className={styles.field}>
                  <span className={styles.label}>{config.fieldLabels.to} *</span>
                  <input className={styles.input} name="to" value={form.to} onChange={handleChange}
                    placeholder={`Enter ${config.fieldLabels.to.toLowerCase()}`} required />
                </label>

                {/* ── Location capture ── */}
                <div className={`${styles.field} ${styles.fieldWide}`}>
                  <span className={styles.label}>📍 Origin Location (Optional)</span>
                  <LocationCapture
                    captured={location}
                    onCapture={setLocation}
                    onClear={() => setLocation(null)}
                  />
                </div>

                <label className={styles.field}>
                  <span className={styles.label}>{config.fieldLabels.date1} *</span>
                  <input className={styles.input} name="date1" type="date" value={form.date1}
                    onChange={handleChange} min={new Date().toISOString().slice(0, 10)} required />
                </label>

                <label className={styles.field}>
                  <span className={styles.label}>{config.fieldLabels.date2} *</span>
                  <input className={styles.input} name="date2" type="date" value={form.date2}
                    onChange={handleChange} min={form.date1 || new Date().toISOString().slice(0, 10)} required />
                </label>

                <label className={styles.field}>
                  <span className={styles.label}>{config.fieldLabels.option1} *</span>
                  <select className={styles.input} name="option1" value={form.option1} onChange={handleChange} required>
                    <option value="" disabled>Select {config.fieldLabels.option1.toLowerCase()}</option>
                    {config.option1Values.map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                </label>

                <label className={styles.field}>
                  <span className={styles.label}>{config.fieldLabels.option2}</span>
                  <select className={styles.input} name="option2" value={form.option2} onChange={handleChange}>
                    <option value="">Select {config.fieldLabels.option2.toLowerCase()}</option>
                    {config.option2Values.map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                </label>

                <label className={`${styles.field} ${styles.fieldWide}`}>
                  <span className={styles.label}>Travel Purpose *</span>
                  <textarea className={`${styles.input} ${styles.textarea}`} name="travelPurpose"
                    value={form.travelPurpose} onChange={handleChange} rows={3}
                    placeholder="Describe the business purpose, location, and travel justification." required />
                </label>

                <label className={`${styles.field} ${styles.fieldWide}`}>
                  <span className={styles.label}>Additional Notes</span>
                  <textarea className={`${styles.input} ${styles.textarea}`} name="notes"
                    value={form.notes} onChange={handleChange} rows={2}
                    placeholder="Mention reporting time, preferred vendors, event details, or approval references." />
                </label>

              </div>

              {/* Actions */}
              <div style={{ display: "flex", gap: 12, marginTop: 24, justifyContent: "flex-end" }}>
                <button type="button" className={styles.secondaryBtn}
                  onClick={() => { setForm(EMPTY_FORM); setLocation(null); setSubmitMsg(null); }}
                  disabled={submitting}>
                  Clear Form
                </button>
                <button type="submit" className={styles.primaryBtn} disabled={submitting}
                  style={{ minWidth: 180, opacity: submitting ? 0.7 : 1, cursor: submitting ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                  {submitting
                    ? <><span style={{ width: 14, height: 14, border: "2px solid rgba(255,255,255,0.4)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.7s linear infinite", display: "inline-block" }} />Submitting…</>
                    : `Submit ${config.routeLabel} Request`}
                </button>
              </div>
            </form>
          </section>

          {/* ── Sidebar ──────────────────────────────────────────── */}
          <aside className={styles.sideColumn}>
            <section className={styles.infoCard}>
              <p className={styles.sectionEyebrow}>Employee info</p>
              <div className={styles.profileBlock}>
                <div className={styles.profileAvatar}>{initials}</div>
                <div>
                  <p className={styles.profileName}>{fullName}</p>
                  <p className={styles.profileMeta}>{role} · {sessionUser.department || "BGauss"}</p>
                  <p className={styles.profileMeta}>Code: {empDetails.employeeId || "N/A"}</p>
                  <p className={styles.profileMeta}>Designation: {sessionUser.designation || "—"}</p>
                  <p className={styles.profileMeta}>Manager: {sessionUser.reportingManager || "—"}</p>
                  <p className={styles.profileMeta}>Contact: {sessionUser.contactNumber || "—"}</p>
                  <p className={styles.profileMeta}>Email: {sessionUser.email || "—"}</p>
                </div>
              </div>
            </section>

            <section className={styles.infoCard}>
              <p className={styles.sectionEyebrow}>Policy checklist</p>
              <ul className={styles.list}>{config.policyPoints.map(p => <li key={p}>{p}</li>)}</ul>
            </section>

            <section className={styles.infoCard}>
              <p className={styles.sectionEyebrow}>Recommended documents</p>
              <ul className={styles.list}>{config.documents.map(d => <li key={d}>{d}</li>)}</ul>
            </section>
          </aside>

        </div>
      </main>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}