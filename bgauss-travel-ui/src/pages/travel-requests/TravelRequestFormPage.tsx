// src/pages/travel-requests/TravelRequestFormPage.tsx
// CHANGES:
//  1. Date dependency: return date only shown when trip type needs it
//  2. Location capture removed (as requested)
//  3. Bus travel type added
//  4. Back button in navbar (showBack=true)
//  5. Realistic autocomplete options for from/to fields per travel type

import { useState, type ChangeEvent, type FormEvent } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import CommonNavbar from "../../components/layout/CommonNavbar";
import { signOutUser } from "../../auth/signOut";
import { getSessionUserProfile, hasRequiredEmployeeDetails } from "../../utils/sessionUser";
import { bookingService } from "../../services/bookingService";
import { ApiError } from "../../services/apiClient";
import styles from "./TravelRequestFormPage.module.css";

// ── Data lists ────────────────────────────────────────────────────────────────
const AIRPORTS = [
  "Mumbai (BOM)", "Delhi (DEL)", "Bangalore (BLR)", "Hyderabad (HYD)",
  "Chennai (MAA)", "Kolkata (CCU)", "Pune (PNQ)", "Ahmedabad (AMD)",
  "Goa (GOI)", "Kochi (COK)", "Jaipur (JAI)", "Lucknow (LKO)",
  "Nagpur (NAG)", "Chandigarh (IXC)", "Bhopal (BHO)", "Indore (IDR)",
  "Coimbatore (CJB)", "Visakhapatnam (VTZ)", "Surat (STV)", "Patna (PAT)",
];

const TRAIN_STATIONS = [
  "Mumbai CST (CSTM)", "Mumbai Central (BCT)", "Dadar (DR)",
  "New Delhi (NDLS)", "Delhi Junction (DLI)", "Hazrat Nizamuddin (NZM)",
  "Bangalore City (SBC)", "Yeshwanthpur (YPR)",
  "Hyderabad Deccan (HYB)", "Secunderabad (SC)",
  "Chennai Central (MAS)", "Chennai Egmore (MS)",
  "Howrah (HWH)", "Sealdah (SDAH)",
  "Pune (PUNE)", "Shivajinagar (SHV)",
  "Ahmedabad (ADI)", "Surat (ST)", "Vadodara (BRC)",
  "Jaipur (JP)", "Lucknow (LKO)", "Nagpur (NGP)", "Indore (INDB)", "Bhopal (BPL)",
];

const BUS_STANDS = [
  "Mumbai - Dadar Bus Stand", "Mumbai - Borivali Bus Stand", "Mumbai - Thane Bus Stand",
  "Pune - Swargate MSRTC", "Pune - Shivajinagar Bus Stand",
  "Nashik CBS", "Aurangabad Central Bus Stand",
  "Bangalore - Majestic (KSRTC)", "Bangalore - Shivajinagar",
  "Hyderabad - MGBS", "Hyderabad - Jubilee Bus Stand",
  "Delhi - ISBT Kashmere Gate", "Delhi - Anand Vihar ISBT",
  "Ahmedabad - Geeta Mandir ST Bus Stand",
  "Surat - Sarthana Bus Stand",
  "Nagpur Central Bus Stand",
  "Indore - Navlakha Bus Stand",
  "Jaipur - Sindhi Camp Bus Stand",
];

const INDIAN_CITIES = [
  "Mumbai", "Delhi", "Bangalore", "Hyderabad", "Chennai", "Kolkata",
  "Pune", "Ahmedabad", "Jaipur", "Surat", "Lucknow", "Nagpur",
  "Indore", "Thane", "Bhopal", "Visakhapatnam", "Vadodara",
  "Coimbatore", "Patna", "Ranchi", "Nashik", "Aurangabad", "Goa",
];

// ── Config ────────────────────────────────────────────────────────────────────
// showReturnDate(option1): controls whether return date field is shown
const REQUEST_PAGE_CONFIG = {
  flight: {
    icon: "✈️", title: "Flight Booking Request",
    subtitle: "Raise an air travel request for domestic or international business movement.",
    routeLabel: "Flight", transportType: "Flight",
    fieldLabels: { from: "Departure Airport", to: "Arrival Airport",
      date1: "Departure Date", date2: "Return Date",
      option1: "Trip Type", option2: "Cabin Class" },
    fromSuggestions: AIRPORTS,
    toSuggestions:   AIRPORTS,
    option1Values: ["One Way", "Round Trip"],
    option2Values: ["Economy","Business Class"],
    // Only Round Trip and Multi City need a return date
    showReturnDate: (o1: string) => o1 === "Round Trip" || o1 === "Multi City",
    policyPoints: [
      "Book flights only for approved business travel.",
      "Choose the most cost-effective fare within policy.",
      "Book at least 3 days in advance wherever possible.",
    ],
    documents: ["Travel agenda", "Approval mail", "Customer or plant visit note"],
  },
  train: {
    icon: "🚆", title: "Train Booking Request",
    subtitle: "Raise a rail booking request for intercity official travel.",
    routeLabel: "Train", transportType: "Train",
    fieldLabels: { from: "Boarding Station", to: "Destination Station",
      date1: "Journey Date", date2: "Return Date",
      option1: "Journey Type", option2: "Coach Class" },
    fromSuggestions: TRAIN_STATIONS,
    toSuggestions:   TRAIN_STATIONS,
    option1Values: ["One Way", "Round Trip"],
    option2Values: [
      "AC First Class (1A)", "AC 2 Tier (2A)", "AC 3 Tier (3A)",
      "AC 3 Tier Economy (3E)", "Executive Chair Car (EC)",
      "AC Chair Car (CC)", "Sleeper Class (SL)", "Second Seating (2S)",
    ],
    showReturnDate: (o1: string) => o1 === "Round Trip",
    policyPoints: [
      "Prefer train for distances where flight is not cost-effective.",
      "Use AC classes for official travel.",
      "Mention exact reporting and arrival time for coordination.",
    ],
    documents: ["Travel purpose / client meeting details", "Manager / HR approval email", "Travel itinerary"],
  },
  bus: {
    icon: "🚌", title: "Bus Booking Request",
    subtitle: "Raise a request for intercity bus travel on official work.",
    routeLabel: "Bus", transportType: "Bus",
    fieldLabels: { from: "Boarding Bus Stand", to: "Destination Bus Stand",
      date1: "Journey Date", date2: "Return Date",
      option1: "Journey Type", option2: "Bus Type" },
    fromSuggestions: BUS_STANDS,
    toSuggestions:   BUS_STANDS,
    option1Values: ["One Way", "Round Trip"],
    option2Values: ["MSRTC / State Bus", "Semi-Sleeper", "Sleeper", "AC Sleeper", "Volvo AC", "Private Bus"],
    showReturnDate: (o1: string) => o1 === "Round Trip",
    policyPoints: [
      "Use bus travel for short–medium intercity distances.",
      "Prefer government (MSRTC/KSRTC/TSRTC) buses where available.",
      "State your boarding point and drop point precisely.",
    ],
    documents: ["Travel purpose note", "Approval email", "Journey timeline"],
  },
  cab: {
    icon: "🚕", title: "Cab Booking Request",
    subtitle: "Raise a request for office visits, airport transfers, or local business travel.",
    routeLabel: "Cab", transportType: "Cab",
    fieldLabels: { from: "Pickup Location", to: "Drop Location",
      date1: "Travel Date", date2: "Return Date",
      option1: "Trip Type", option2: "Cab Type" },
    fromSuggestions: INDIAN_CITIES,
    toSuggestions:   INDIAN_CITIES,
    option1Values: ["One Way", "Round Trip", "Full Day"],
    option2Values: ["Hatchback", "Sedan", "SUV", "Premium Sedan", "Tempo Traveller"],
    showReturnDate: (o1: string) => o1 === "Round Trip" || o1 === "Full Day",
    policyPoints: [
      "Use cab requests for business movement only.",
      "Mention airport transfer separately if tied to a flight.",
      "Provide exact pickup timing to avoid delays.",
    ],
    documents: ["Meeting schedule", "Approval mail", "Airport or office timing"],
  },
  hotel: {
    icon: "🏨", title: "Hotel Booking Request",
    subtitle: "Raise an accommodation request for approved overnight travel and events.",
    routeLabel: "Hotel", transportType: "Hotel",
    fieldLabels: { from: "City of Stay", to: "Preferred Area/Property", 
    date1: "Check-in Date", date2: "Check-out Date", option1: "Room Type", option2: "Stay Category" },
    fromSuggestions: INDIAN_CITIES,
    toSuggestions:   [] as string[],
   option1Values: ["Standard", "Executive", "Twin Sharing"],
    option2Values: ["Single Stay", "Extended Stay", "Event Stay", "Conference Stay"],
    showReturnDate: (_: string) => true, // check-out always needed
    policyPoints: [
      "Hotel bookings must align with approved travel duration.",
      "Choose business-approved properties wherever available.",
      "Mention late check-in or event venue requirements clearly.",
    ],
    documents: ["Travel approval", "Event or meeting details", "Guest stay requirement note"],
  },
} as const;

type RequestType = keyof typeof REQUEST_PAGE_CONFIG;

interface FormState {
  from: string; to: string; date1: string; date2: string;
  option1: string; option2: string; travelPurpose: string; notes: string;
}

const EMPTY_FORM: FormState = {
  from: "", to: "", date1: "", date2: "",
  option1: "", option2: "", travelPurpose: "", notes: "",
};

// ── Autocomplete input ────────────────────────────────────────────────────────
function AutoInput({ name, value, onChange, placeholder, suggestions }: {
  name: string; value: string; onChange: (e: ChangeEvent<HTMLInputElement>) => void;
  placeholder: string; suggestions: readonly string[];
}) {
  const [open, setOpen] = useState(false);
  const filtered = value.length > 0
    ? suggestions.filter(s => s.toLowerCase().includes(value.toLowerCase())).slice(0, 6)
    : [];

  return (
    <div style={{ position: "relative" }}>
      <input
        className={styles.input} name={name} value={value}
        onChange={e => { onChange(e); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder} autoComplete="off" required />
      {open && filtered.length > 0 && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0,
          background: "#fff", border: "1.5px solid #e2e8f0", borderRadius: 10,
          boxShadow: "0 8px 24px rgba(0,0,0,0.12)", zIndex: 100, overflow: "hidden",
        }}>
          {filtered.map(s => (
            <div key={s}
              onMouseDown={() => {
                onChange({ target: { name, value: s } } as ChangeEvent<HTMLInputElement>);
                setOpen(false);
              }}
              style={{
                padding: "9px 14px", fontSize: 13, color: "#0f172a",
                cursor: "pointer", borderBottom: "1px solid #f1f5f9",
              }}
              onMouseEnter={e => (e.currentTarget.style.background = "#f1f5f9")}
              onMouseLeave={e => (e.currentTarget.style.background = "")}>
              {s}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function TravelRequestFormPage() {
  const navigate        = useNavigate();
  const { requestType } = useParams<{ requestType: string }>();

  const config = requestType ? REQUEST_PAGE_CONFIG[requestType as RequestType] : undefined;
  if (!config) return <Navigate to="/booking/new" replace />;

  const sessionUser = getSessionUserProfile();
  const empDetails = {
    employeeId:       sessionUser.employeeId || sessionUser.employeeRecordId,
    fullName:         sessionUser.fullName,
    department:       sessionUser.department,
    designation:      sessionUser.designation,
    reportingManager: sessionUser.reportingManager,
    contactNumber:    sessionUser.contactNumber,
    email:            sessionUser.email,
  };
  if (!hasRequiredEmployeeDetails(empDetails)) return <Navigate to="/booking/new" replace />;

  const fullName = sessionUser.fullName || "Employee";
  const role     = sessionUser.role     || "Employee";
  const initials = fullName.trim().split(" ").filter(Boolean)
    .map(p => p[0]).slice(0, 2).join("").toUpperCase() || "ME";

  const [form,       setForm]       = useState<FormState>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [submitMsg,  setSubmitMsg]  = useState<{ type: "success" | "error"; text: string } | null>(null);

  const needsReturnDate = config.showReturnDate(form.option1);

  const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setForm(f => {
      const next = { ...f, [name]: value };
      // When trip type changes to One Way, clear return date
      if (name === "option1" && !config.showReturnDate(value)) {
        next.date2 = "";
      }
      return next;
    });
  };

  const validate = (): string | null => {
    if (!form.from.trim())          return `${config.fieldLabels.from} is required.`;
    if (!form.to.trim())            return `${config.fieldLabels.to} is required.`;
    if (!form.date1)                return `${config.fieldLabels.date1} is required.`;
    if (needsReturnDate && !form.date2) return `${config.fieldLabels.date2} is required.`;
    if (needsReturnDate && form.date2 < form.date1) return "Return date cannot be before departure date.";
    if (!form.option1)              return `${config.fieldLabels.option1} is required.`;
    if (!form.travelPurpose.trim()) return "Travel Purpose is required.";
    return null;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const err = validate();
    if (err) { setSubmitMsg({ type: "error", text: err }); return; }

    setSubmitting(true);
    setSubmitMsg(null);

    try {
      const employeeId = Number(localStorage.getItem("employee_id") ?? "0");
      const destination = `${form.from.trim()} → ${form.to.trim()}`;
      const purposeWithOpts = `${form.travelPurpose.trim()}\n${config.fieldLabels.option1}: ${form.option1}${form.option2 ? ` | ${config.fieldLabels.option2}: ${form.option2}` : ""}`;
      const department = localStorage.getItem("department") ?? "";
      const result = await bookingService.create({
        employeeId,
        department,
        travelPurpose:  purposeWithOpts,
        destination,
        departureDate:  form.date1,
        returnDate:     needsReturnDate ? form.date2 : form.date1,
        transportType:  config.transportType,
        notes:          form.notes.trim() || undefined,
      });

      setSubmitMsg({ type: "success", text: `✅ Request submitted! Code: ${result.requestCode}` });
      setForm(EMPTY_FORM);
      setTimeout(() => navigate("/dashboard"), 2000);
    } catch (ex) {
      const msg = ex instanceof ApiError ? ex.message : ex instanceof Error ? ex.message : "Submission failed.";
      setSubmitMsg({ type: "error", text: `❌ ${msg}` });
    } finally { setSubmitting(false); }
  };

  return (
    <div className={styles.page}>
      <CommonNavbar
        user={{ initials, name: fullName, subtitle: role }}
        onSignOut={() => signOutUser()}
        showBack={true}
        onBack={() => navigate("/booking/new")}
      />

      <main className={styles.main}>
        <section className={styles.hero}>
          <div className={styles.heroCopy}>
            <span className={styles.heroBadge}>{config.routeLabel} Request</span>
            <h1 className={styles.heroTitle}>
              <span className={styles.heroIcon}>{config.icon}</span>
              {config.title}
            </h1>
            <p className={styles.heroSubtitle}>{config.subtitle}</p>
          </div>
          <div className={styles.heroActions}>
            <button type="button" className={styles.secondaryBtn} onClick={() => navigate("/booking/new")}>
              Back to Options
            </button>
            <button type="button" className={styles.primaryBtn} onClick={() => navigate("/dashboard")}>
              Dashboard
            </button>
          </div>
        </section>

        <div className={styles.layout}>
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
                padding: "12px 16px", borderRadius: 10, marginBottom: 20,
                fontSize: 13, fontWeight: 600,
                background: submitMsg.type === "success" ? "#dcfce7" : "#fef2f2",
                color:      submitMsg.type === "success" ? "#166534"  : "#991b1b",
                border: `1px solid ${submitMsg.type === "success" ? "#86efac" : "#fecaca"}`,
              }}>{submitMsg.text}</div>
            )}

            <form onSubmit={e => void handleSubmit(e)}>
              <div className={styles.grid}>

                {/* Trip type first so it controls date visibility */}
                <label className={styles.field}>
                  <span className={styles.label}>{config.fieldLabels.option1} *</span>
                  <select className={styles.input} name="option1" value={form.option1}
                    onChange={handleChange} required>
                    <option value="" disabled>Select {config.fieldLabels.option1.toLowerCase()}</option>
                    {config.option1Values.map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                </label>

                <label className={styles.field}>
                  <span className={styles.label}>{config.fieldLabels.option2}</span>
                  <select className={styles.input} name="option2" value={form.option2}
                    onChange={handleChange}>
                    <option value="">Select {config.fieldLabels.option2.toLowerCase()}</option>
                    {config.option2Values.map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                </label>

                <label className={styles.field}>
                  <span className={styles.label}>{config.fieldLabels.from} *</span>
                  <AutoInput name="from" value={form.from} onChange={handleChange}
                    placeholder={`Enter ${config.fieldLabels.from.toLowerCase()}`}
                    suggestions={config.fromSuggestions} />
                </label>

                <label className={styles.field}>
                  <span className={styles.label}>{config.fieldLabels.to} *</span>
                  <AutoInput name="to" value={form.to} onChange={handleChange}
                    placeholder={`Enter ${config.fieldLabels.to.toLowerCase()}`}
                    suggestions={config.toSuggestions.length > 0 ? config.toSuggestions : INDIAN_CITIES} />
                </label>

                <label className={styles.field}>
                  <span className={styles.label}>{config.fieldLabels.date1} *</span>
                  <input className={styles.input} name="date1" type="date" value={form.date1}
                    onChange={handleChange} min={new Date().toISOString().slice(0, 10)} required />
                </label>

                {/* Return date — only shown when trip type requires it */}
                {needsReturnDate && (
                  <label className={styles.field}>
                    <span className={styles.label}>{config.fieldLabels.date2} *</span>
                    <input className={styles.input} name="date2" type="date" value={form.date2}
                      onChange={handleChange}
                      min={form.date1 || new Date().toISOString().slice(0, 10)} required />
                  </label>
                )}

                <label className={`${styles.field} ${styles.fieldWide}`}>
                  <span className={styles.label}>Travel Purpose *</span>
                  <textarea className={`${styles.input} ${styles.textarea}`}
                    name="travelPurpose" value={form.travelPurpose}
                    onChange={handleChange} rows={3}
                    placeholder="Describe the business purpose, meeting details, and travel justification."
                    required />
                </label>

                <label className={`${styles.field} ${styles.fieldWide}`}>
                  <span className={styles.label}>Additional Notes</span>
                  <textarea className={`${styles.input} ${styles.textarea}`}
                    name="notes" value={form.notes}
                    onChange={handleChange} rows={2}
                    placeholder="Vendor preferences, reporting time, event details, approval references…" />
                </label>

              </div>

              {/* One Way hint */}
              {form.option1 && !needsReturnDate && requestType !== "hotel" && (
                <div style={{
                  margin: "12px 0 0", padding: "8px 14px", borderRadius: 8,
                  background: "#eff6ff", border: "1px solid #bfdbfe",
                  fontSize: 12, color: "#1e40af",
                }}>
                  ℹ️ <strong>{form.option1}</strong> — no return date required.
                </div>
              )}

              <div style={{ display: "flex", gap: 12, marginTop: 24, justifyContent: "flex-end" }}>
                <button type="button" className={styles.secondaryBtn}
                  onClick={() => { setForm(EMPTY_FORM); setSubmitMsg(null); }}
                  disabled={submitting}>
                  Clear Form
                </button>
                <button type="submit" className={styles.primaryBtn} disabled={submitting}
                  style={{ minWidth: 180, opacity: submitting ? 0.7 : 1,
                    cursor: submitting ? "not-allowed" : "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                  {submitting ? (
                    <><span style={{ width: 14, height: 14, border: "2px solid rgba(255,255,255,0.4)",
                        borderTopColor: "#fff", borderRadius: "50%",
                        animation: "spin 0.7s linear infinite", display: "inline-block" }} />Submitting…</>
                  ) : `Submit ${config.routeLabel} Request`}
                </button>
              </div>
            </form>
          </section>

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