import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMsalLogin } from "../auth/useMsalLogin";
import CommonNavbar from "../components/layout/CommonNavbar";
import styles from "./TravelRequestOptionsPage.module.css";

const REQUEST_OPTIONS = [
  {
    id: "flight",
    icon: "✈️",
    title: "Flight Request",
    description: "Domestic and international air travel for meetings, site visits, and official tours.",
    path: "/booking/new/flight",
  },
  {
    id: "train",
    icon: "🚂",
    title: "Train Request",
    description: "Rail booking for intercity travel with lower-cost and policy-friendly options.",
    path: "/booking/new/train",
  },
  {
    id: "cab",
    icon: "🚕",
    title: "Cab Request",
    description: "Local transport for airport transfers, office visits, and same-day business movement.",
    path: "/booking/new/cab",
  },
  {
    id: "hotel",
    icon: "🏨",
    title: "Hotel Request",
    description: "Accommodation requests for approved overnight business travel and events.",
    path: "/booking/new/hotel",
  },
] as const;

export default function TravelRequestOptionsPage() {
  const navigate = useNavigate();
  const { signOut } = useMsalLogin();
  const [selectedOption, setSelectedOption] = useState<string>(REQUEST_OPTIONS[0].id);

  const fullName = localStorage.getItem("full_name") ?? "Employee";
  const role = localStorage.getItem("role") ?? "Employee";

  const initials =
    fullName
      .trim()
      .split(" ")
      .filter(Boolean)
      .map((part) => part[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "ME";

  const handleSignOut = async () => {
    await signOut();
  };

  const selectedRequest = REQUEST_OPTIONS.find((option) => option.id === selectedOption);

  return (
    <div className={styles.page}>
      <CommonNavbar
        user={{ initials, name: fullName, subtitle: role }}
        onSignOut={handleSignOut}
      />

      <main className={styles.main}>
        <section className={styles.hero}>
          <div>
            <p className={styles.eyebrow}>Travel request options</p>
            <h1 className={styles.title}>Choose how you want to raise the request</h1>
            <p className={styles.subtitle}>
              Select the booking type that matches your travel need for flight, train, cab,
              or hotel requests.
            </p>
          </div>

          <div className={styles.heroActions}>
            <button type="button" className={styles.secondaryBtn} onClick={() => navigate("/dashboard")}>
              Back to Dashboard
            </button>
            <button
              type="button"
              className={styles.primaryBtn}
              onClick={() => selectedRequest && navigate(selectedRequest.path)}
            >
              {selectedRequest ? `Open ${selectedRequest.title}` : "Choose Request Type"}
            </button>
          </div>
        </section>

        <section className={styles.optionsSection}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Available Request Types</h2>
            <span className={styles.sectionMeta}>{REQUEST_OPTIONS.length} options</span>
          </div>

          <div className={styles.optionsGrid}>
            {REQUEST_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                className={`${styles.optionCard} ${selectedOption === option.id ? styles.optionCardActive : ""}`}
                onClick={() => setSelectedOption(option.id)}
              >
                <span className={styles.optionIcon}>{option.icon}</span>
                <span className={styles.optionTitle}>{option.title}</span>
                <span className={styles.optionDescription}>{option.description}</span>
                <span className={styles.optionTag}>
                  {selectedOption === option.id ? "Ready to Open" : "Choose"}
                </span>
              </button>
            ))}
          </div>
        </section>

        <section className={styles.selectionPanel}>
          <div className={styles.selectionCard}>
            <p className={styles.selectionLabel}>Current selection</p>
            <h3 className={styles.selectionTitle}>{selectedRequest?.title}</h3>
            <p className={styles.selectionDescription}>{selectedRequest?.description}</p>
          </div>
        </section>
      </main>
    </div>
  );
}
