"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import BiomarkerTrendVisualizer, {
  BiomarkerCategory,
} from "@/components/BiomarkerTrendVisualizer";
import PrescriptionModal from "@/components/PrescriptionModal";

type PatientInfo = {
  id: string;
  synthetic_id: string;
  preferred_language: string;
  created_at: string;
};

type TimelineEvent = {
  id: string;
  event_date: string | null;
  kind: string;
  label: string;
  value: string;
  normalized: Record<string, any>;
  source: string;
  confidence: number;
  verification_status: string;
  needs_review: boolean;
};

type SummarySection = {
  key: string;
  title: string;
  items: Array<{ event_id: string; text: string; confidence: number }>;
};

type SummaryData = {
  patient_id: string;
  draft: {
    generated_at: string;
    sections: SummarySection[];
  };
  alerts: Array<{
    rule_id: string;
    name: string;
    severity: "urgent" | "caution" | "info";
    description: string;
    source_hint: string;
  }>;
};

type DocumentItem = {
  id: string;
  filename: string;
  document_type: string;
  language: string;
  size_bytes: number;
  uploaded_at: string;
  needs_review: boolean;
  verified_confidence?: number;
};

type ConsentItem = {
  id: string;
  purpose: string;
  granted: boolean;
  granted_at: string;
  revoked_at: string | null;
};

type PillSchedule = {
  timeOfDay: "morning" | "afternoon" | "evening" | "bedtime";
  labelEn: string;
  labelHi: string;
  icon: string;
  meds: Array<{
    id: string;
    name: string;
    generic?: string;
    dose: string;
    instructions: string;
    drugClass?: string;
    frequency?: string;
  }>;
};

export default function PatientPortalDashboard({
  params,
}: {
  params: { patientId: string };
}) {
  const router = useRouter();
  const routeParams = useParams();
  const resolvedPatientId = ((routeParams?.patientId as string) || params?.patientId || "").trim();

  const [lang, setLang] = useState<"en" | "hi">("en");
  const [activeTab, setActiveTab] = useState<
    "meds" | "care_plan" | "labs" | "docs" | "privacy"
  >("meds");

  const [patient, setPatient] = useState<PatientInfo | null>(null);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [consents, setConsents] = useState<ConsentItem[]>([]);
  const [knownPatients, setKnownPatients] = useState<Array<{ id: string; synthetic_id: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // Local state for interactive pill tracker (today's checklist)
  const [takenPills, setTakenPills] = useState<Record<string, boolean>>({});

  // Document upload state
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);

  // Consent revocation modal
  const [showRevokeModal, setShowRevokeModal] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [revokeSuccess, setRevokeSuccess] = useState<string | null>(null);
  const [biomarkers, setBiomarkers] = useState<BiomarkerCategory[]>([]);
  const [showPrescriptionModal, setShowPrescriptionModal] = useState(false);

  // Load patient data
  useEffect(() => {
    if (!resolvedPatientId) return;

    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const [pRes, tRes, sRes, dRes, cRes, bRes] = await Promise.all([
          fetch(`/api/v1/patients/${encodeURIComponent(resolvedPatientId)}`),
          fetch(`/api/v1/timeline?patient_id=${encodeURIComponent(resolvedPatientId)}`),
          fetch(`/api/v1/summary/${encodeURIComponent(resolvedPatientId)}`),
          fetch(`/api/v1/documents?patient_id=${encodeURIComponent(resolvedPatientId)}`),
          fetch(`/api/v1/consents/patient/${encodeURIComponent(resolvedPatientId)}`),
          fetch(`/api/v1/patients/${encodeURIComponent(resolvedPatientId)}/biomarkers`),
        ]);

        if (!pRes.ok) {
          try {
            const listRes = await fetch("/api/v1/patients");
            if (listRes.ok) {
              const listData = await listRes.json();
              setKnownPatients(listData.slice(0, 10));
            }
          } catch {}

          if (pRes.status === 404) {
            throw new Error(
              lang === "en"
                ? `Patient identifier "${resolvedPatientId}" was not found.`
                : `रोगी पहचानकर्ता "${resolvedPatientId}" नहीं मिला।`
            );
          } else if (pRes.status >= 500) {
            throw new Error(
              lang === "en"
                ? `Backend server error (${pRes.status}). Verify FastAPI is running on port 8000.`
                : `बैकएंड सर्वर त्रुटि (${pRes.status})। कृपया सुनिश्चित करें कि FastAPI चल रहा है।`
            );
          } else {
            throw new Error(`Error loading record (HTTP ${pRes.status}).`);
          }
        }
        const pData = await pRes.json();
        setPatient(pData);
        if (pData.preferred_language === "hi") setLang("hi");

        if (tRes.ok) setTimeline(await tRes.json());
        if (sRes.ok) setSummary(await sRes.json());
        if (dRes.ok) setDocuments(await dRes.json());
        if (cRes.ok) setConsents(await cRes.json());
        if (bRes.ok) {
          const bData = await bRes.json();
          setBiomarkers(bData.categories || []);
        }

        // Load today's taken pills from localStorage
        const todayKey = `medigraph_pills_${resolvedPatientId}_${new Date().toISOString().slice(0, 10)}`;
        try {
          const saved = localStorage.getItem(todayKey);
          if (saved) setTakenPills(JSON.parse(saved));
        } catch {}
      } catch (e: any) {
        try {
          const listRes = await fetch("/api/v1/patients");
          if (listRes.ok) {
            const listData = await listRes.json();
            setKnownPatients(listData.slice(0, 10));
          }
        } catch {}
        const isConnErr = e?.message?.includes("Failed to fetch") || e?.message?.includes("NetworkError");
        if (isConnErr) {
          setErr(
            lang === "en"
              ? "Local API server (http://127.0.0.1:8000) is unreachable. Please ensure run.bat is running in your terminal."
              : "स्थानीय एपीआई सर्वर (http://127.0.0.1:8000) से संपर्क नहीं हो सका। कृपया run.bat चालू करें।"
          );
        } else {
          setErr(e?.message ?? "Failed to load patient records");
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [resolvedPatientId, lang]);

  // Toggle pill taken
  function togglePill(pillId: string) {
    setTakenPills((prev) => {
      const next = { ...prev, [pillId]: !prev[pillId] };
      const todayKey = `medigraph_pills_${params.patientId}_${new Date().toISOString().slice(0, 10)}`;
      try {
        localStorage.setItem(todayKey, JSON.stringify(next));
      } catch {}
      return next;
    });
  }

  // Parse medication events into a clean daily schedule
  const pillSchedule = useMemo<PillSchedule[]>(() => {
    const medEvents = timeline.filter((e) => e.kind === "medication");
    const morningList: PillSchedule["meds"] = [];
    const afternoonList: PillSchedule["meds"] = [];
    const eveningList: PillSchedule["meds"] = [];
    const bedtimeList: PillSchedule["meds"] = [];

    // Dedup by label/generic
    const seen = new Set<string>();
    medEvents.forEach((m, idx) => {
      const norm = m.normalized || {};
      const key = (norm.generic || m.label || "").toLowerCase();
      if (!key || seen.has(key)) return;
      seen.add(key);

      const dose = norm.dose_value ? `${norm.dose_value}${norm.dose_unit || "mg"}` : m.value || "";
      const freq = (norm.frequency || "").toUpperCase();
      const generic = norm.generic || m.label;
      const drugClass = norm.drug_class || "";

      let instructions = "Take with a glass of water";
      if (drugClass.includes("statin") || key.includes("statin")) {
        instructions = "Take at bedtime with or without food";
      } else if (drugClass.includes("nsaid") || key.includes("paracetamol") || key.includes("ibuprofen")) {
        instructions = "Take after meals to avoid stomach irritation";
      } else if (drugClass.includes("ppi") || key.includes("prazole")) {
        instructions = "Take 30 mins before morning breakfast";
      } else if (drugClass.includes("metformin")) {
        instructions = "Take with dinner or breakfast";
      }

      const item = {
        id: `med-${m.id || idx}`,
        name: m.label,
        generic: generic !== m.label ? generic : undefined,
        dose,
        instructions,
        drugClass,
        frequency: freq || "Daily",
      };

      // Slot by frequency or class
      if (freq === "BD" || freq === "BID") {
        morningList.push(item);
        eveningList.push({ ...item, id: `${item.id}-pm` });
      } else if (freq === "TDS" || freq === "TID") {
        morningList.push(item);
        afternoonList.push({ ...item, id: `${item.id}-noon` });
        eveningList.push({ ...item, id: `${item.id}-pm` });
      } else if (freq === "HS" || drugClass.includes("statin") || drugClass.includes("sedative")) {
        bedtimeList.push(item);
      } else {
        // Default once daily (OD)
        if (drugClass.includes("ppi")) {
          morningList.push(item);
        } else if (drugClass.includes("anxiolytic") || drugClass.includes("benzodiazepine")) {
          bedtimeList.push(item);
        } else {
          morningList.push(item);
        }
      }
    });

    return [
      { timeOfDay: "morning", labelEn: "Morning (Breakfast)", labelHi: "सुबह (नाश्ता)", icon: "☀️", meds: morningList },
      { timeOfDay: "afternoon", labelEn: "Afternoon (Lunch)", labelHi: "दोपहर (दोपहर का भोजन)", icon: "🌤️", meds: afternoonList },
      { timeOfDay: "evening", labelEn: "Evening (Dinner)", labelHi: "शाम (रात का खाना)", icon: "🌅", meds: eveningList },
      { timeOfDay: "bedtime", labelEn: "Bedtime (Night)", labelHi: "सोने से पहले (रात)", icon: "🌙", meds: bedtimeList },
    ];
  }, [timeline]);

  // Extract lab biomarkers & vitals
  const labMetrics = useMemo(() => {
    const labEvents = timeline.filter(
      (e) => e.kind === "lab_value" || e.kind === "observation" || e.kind === "vital"
    );

    return labEvents.map((l) => {
      const label = l.label.toLowerCase();
      let status: "normal" | "high" | "low" = "normal";
      let refRange = "Normal range";

      const valNum = parseFloat(l.value.replace(/[^0-9.]/g, ""));
      if (!isNaN(valNum)) {
        if (label.includes("glucose") || label.includes("sugar")) {
          refRange = "70 - 140 mg/dL";
          if (valNum > 140) status = "high";
          else if (valNum < 70) status = "low";
        } else if (label.includes("creatinine")) {
          refRange = "0.7 - 1.3 mg/dL";
          if (valNum > 1.3) status = "high";
        } else if (label.includes("systolic") || label.includes("bp")) {
          refRange = "90 - 120 mmHg";
          if (valNum > 130) status = "high";
        } else if (label.includes("hba1c")) {
          refRange = "< 5.7%";
          if (valNum >= 6.5) status = "high";
        }
      }

      return {
        id: l.id,
        label: l.label,
        value: l.value,
        status,
        refRange,
        date: l.event_date ? new Date(l.event_date).toLocaleDateString() : "Recent",
      };
    });
  }, [timeline]);

  // Handle uploading document
  async function handleFileUpload(file: File) {
    if (!patient) return;
    setUploading(true);
    setUploadMsg(null);
    try {
      const fd = new FormData();
      fd.append("patient_id", patient.id);
      fd.append("language", lang);
      fd.append("file", file, file.name);

      const res = await fetch("/api/v1/documents/upload", { method: "POST", body: fd });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();

      // Trigger automatic pipeline processing
      await fetch(`/api/v1/documents/${data.document_id}/process?actor=patient`, { method: "POST" });

      setUploadMsg(
        lang === "en"
          ? "Document uploaded and processed successfully!"
          : "दस्तावेज़ सफलतापूर्वक अपलोड और संसाधित हुआ!"
      );

      // Refresh documents
      const dRes = await fetch(`/api/v1/documents?patient_id=${patient.id}`);
      if (dRes.ok) setDocuments(await dRes.json());
    } catch (e: any) {
      setUploadMsg(`Error: ${e?.message ?? "Upload failed"}`);
    } finally {
      setUploading(false);
    }
  }

  // Handle Revoking Consent (DPDP Act 2023)
  async function handleRevokeConsent() {
    if (!patient || consents.length === 0) return;
    setRevoking(true);
    try {
      const activeConsent = consents.find((c) => c.granted && !c.revoked_at) || consents[0];
      const res = await fetch(`/api/v1/consents/${activeConsent.id}/revoke?actor=patient`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed to revoke consent");
      const result = await res.json();
      setRevokeSuccess(
        lang === "en"
          ? `Consent revoked. All clinical records have been purged in compliance with DPDP Act 2023.`
          : `सहमति सफलतापूर्वक रद्द की गई। आपके सभी मेडिकल रिकॉर्ड DPDP अधिनियम 2023 के तहत हटा दिए गए हैं।`
      );
      setTimeout(() => {
        router.push("/patient");
      }, 3000);
    } catch (e: any) {
      alert(e?.message || "Revocation failed");
    } finally {
      setRevoking(false);
      setShowRevokeModal(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-50 dark:bg-[#070b18] flex items-center justify-center">
        <div className="flex items-center gap-3 text-slate-500 dark:text-slate-400 text-sm">
          <span className="w-5 h-5 rounded-full border-2 border-slate-300 border-t-blue-500 animate-spin" />
          {lang === "en" ? "Loading your health records..." : "आपका स्वास्थ्य रिकॉर्ड लोड हो रहा है..."}
        </div>
      </main>
    );
  }

  if (err || !patient) {
    const isConnErr =
      err?.includes("Local API server") ||
      err?.includes("unreachable") ||
      err?.includes("run.bat");

    return (
      <main className="min-h-screen bg-slate-50 dark:bg-[#070b18] flex items-center justify-center p-6">
        <div className="max-w-lg w-full bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-8 text-center shadow-xl space-y-5">
          <div className="w-14 h-14 rounded-2xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-900 flex items-center justify-center mx-auto text-2xl font-bold">
            {isConnErr ? "🔌" : "🔍"}
          </div>

          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">
              {isConnErr
                ? lang === "en"
                  ? "Local Server Offline"
                  : "स्थानीय सर्वर बंद है"
                : lang === "en"
                ? "Patient Record Not Found"
                : "रोगी रिकॉर्ड नहीं मिला"}
            </h2>
            <p className="mt-2 text-xs text-slate-600 dark:text-slate-400 leading-relaxed font-mono bg-slate-50 dark:bg-slate-800/60 p-3 rounded-xl border border-slate-200 dark:border-slate-700">
              {err}
            </p>
          </div>

          {knownPatients.length > 0 && (
            <div className="pt-2 text-left">
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                {lang === "en"
                  ? "Available Registered Patients (Click to open):"
                  : "उपलब्ध पंजीकृत रोगी (खोलने के लिए क्लिक करें):"}
              </p>
              <div className="grid grid-cols-2 gap-2">
                {knownPatients.map((kp) => (
                  <Link
                    key={kp.id}
                    href={`/patient/${kp.id}`}
                    className="flex items-center justify-between px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-blue-950/40 border border-slate-200 dark:border-slate-700 hover:border-blue-400 text-xs font-medium text-slate-800 dark:text-slate-200 transition-colors"
                  >
                    <span className="font-semibold text-blue-600 dark:text-blue-400">
                      {kp.synthetic_id}
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      {kp.id.slice(0, 6)}...
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center justify-center gap-3 pt-2">
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-medium text-xs transition-colors"
            >
              🔄 {lang === "en" ? "Retry" : "पुनः प्रयास"}
            </button>
            <Link
              href="/patient"
              className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs transition-colors"
            >
              {lang === "en" ? "Back to Patient Lookup" : "रोगी खोज पर वापस जाएं"}
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 dark:bg-[#070b18] text-slate-900 dark:text-slate-100 pb-20">
      {/* Decorative ambient background */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 top-0 h-96 opacity-60 dark:opacity-30"
        style={{
          background: "radial-gradient(60% 60% at 50% 0%, rgba(59,130,246,0.18), rgba(99,102,241,0.06), transparent 75%)",
        }}
      />

      {/* Top Header Bar */}
      <header className="sticky top-0 z-30 bg-white/85 dark:bg-slate-900/85 backdrop-blur-md border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link
              href="/patient"
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 transition-colors"
              title={lang === "en" ? "Switch Patient" : "रोगी बदलें"}
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="19" y1="12" x2="5" y2="12" />
                <polyline points="12 19 5 12 12 5" />
              </svg>
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-900 dark:text-white text-sm sm:text-base">
                  {lang === "en" ? "My Health Portal" : "मेरा स्वास्थ्य पोर्टल"}
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-900">
                  {patient.synthetic_id}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 hidden sm:block">
                {lang === "en" ? "Local on-premises clinical records" : "स्थानीय ऑन-प्रिमाइसेस स्वास्थ्य रिकॉर्ड"}
              </p>
            </div>
          </div>

          {/* Right controls: Language + Download Prescription PDF */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowPrescriptionModal(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-xs font-semibold shadow-sm transition-all"
            >
              <span className="font-bold">℞</span>
              <span>{lang === "en" ? "Official Rx / PDF" : "मेरा पर्चा / PDF"}</span>
            </button>

            {/* Language toggle */}
            <div className="flex items-center p-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs">
              <button
                type="button"
                onClick={() => setLang("en")}
                className={`px-2.5 py-1 rounded-md font-semibold transition-all ${
                  lang === "en" ? "bg-white dark:bg-slate-900 text-blue-600 shadow-sm" : "text-slate-500"
                }`}
              >
                EN
              </button>
              <button
                type="button"
                onClick={() => setLang("hi")}
                className={`px-2.5 py-1 rounded-md font-semibold transition-all ${
                  lang === "hi" ? "bg-white dark:bg-slate-900 text-blue-600 shadow-sm" : "text-slate-500"
                }`}
              >
                हिन्दी
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-6 space-y-6">
        {/* Revoke feedback banner */}
        {revokeSuccess && (
          <div className="rounded-2xl border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/60 p-4 text-sm text-emerald-800 dark:text-emerald-200 shadow-md">
            {revokeSuccess}
          </div>
        )}

        {/* Patient Identity & Health ID Card */}
        <section className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white flex items-center justify-center text-lg font-bold shadow-md shadow-blue-500/20 shrink-0">
                {patient.synthetic_id.slice(-2)}
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-xl font-bold text-slate-900 dark:text-white">
                    {lang === "en" ? "Patient Health Card" : "रोगी स्वास्थ्य कार्ड"}
                  </h1>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900">
                    {lang === "en" ? "Active DPDP Consent" : "सक्रिय सहमति"}
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400 flex-wrap">
                  <span>
                    <strong className="text-slate-700 dark:text-slate-300">{lang === "en" ? "Patient ID" : "रोगी आईडी"}:</strong>{" "}
                    <code className="font-mono">{patient.synthetic_id}</code>
                  </span>
                  <span>•</span>
                  <span>
                    <strong className="text-slate-700 dark:text-slate-300">{lang === "en" ? "Health ID" : "हेल्थ आईडी"}:</strong>{" "}
                    <code className="font-mono">ABHA-91-{patient.synthetic_id.replace(/[^0-9]/g, "").padStart(4, "0")}-2026</code>
                  </span>
                  <span>•</span>
                  <span>
                    <strong className="text-slate-700 dark:text-slate-300">{lang === "en" ? "Registered" : "पंजीकरण"}:</strong>{" "}
                    {new Date(patient.created_at).toLocaleDateString()}
                  </span>
                </div>
              </div>
            </div>

            {/* Quick summary metrics */}
            <div className="flex items-center gap-3 border-t md:border-t-0 md:border-l border-slate-100 dark:border-slate-800 pt-4 md:pt-0 md:pl-6">
              <div className="text-center px-3">
                <div className="text-lg font-bold text-slate-900 dark:text-white">
                  {timeline.filter((e) => e.kind === "medication").length}
                </div>
                <div className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
                  {lang === "en" ? "Medications" : "दवाइयां"}
                </div>
              </div>
              <div className="w-px h-8 bg-slate-200 dark:bg-slate-800" />
              <div className="text-center px-3">
                <div className="text-lg font-bold text-slate-900 dark:text-white">
                  {labMetrics.length}
                </div>
                <div className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
                  {lang === "en" ? "Lab Tests" : "जांच"}
                </div>
              </div>
              <div className="w-px h-8 bg-slate-200 dark:bg-slate-800" />
              <div className="text-center px-3">
                <div className="text-lg font-bold text-slate-900 dark:text-white">
                  {documents.length}
                </div>
                <div className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
                  {lang === "en" ? "Docs" : "दस्तावेज़"}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Red Flag Emergency Safety Banner (if urgent alerts exist) */}
        {summary?.alerts && summary.alerts.length > 0 && (
          <section className="rounded-2xl border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/30 p-4 text-xs text-amber-900 dark:text-amber-200">
            <div className="flex items-start gap-3">
              <span className="p-1 rounded-lg bg-amber-200 dark:bg-amber-800 text-amber-900 dark:text-white text-base">
                ⚠️
              </span>
              <div>
                <h3 className="font-bold text-sm">
                  {lang === "en" ? "Clinical Safety Advisory" : "चिकित्सीय सुरक्षा परामर्श"}
                </h3>
                <p className="mt-0.5 text-amber-800 dark:text-amber-300">
                  {lang === "en"
                    ? "Our clinical safety system has flagged the following symptoms for your doctor's review. If you experience worsening breathlessness, severe chest pressure, or sudden dizziness, seek emergency medical care immediately."
                    : "हमारे सुरक्षा सिस्टम ने आपके लक्षणों की पहचान की है। यदि आपको सांस लेने में अत्यधिक कठिनाई, सीने में भारीपन या अचानक चक्कर आ रहे हों, तो तुरंत आपातकालीन चिकित्सक से संपर्क करें।"}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {summary.alerts.map((a, i) => (
                    <span
                      key={i}
                      className="px-2 py-0.5 rounded-md font-semibold bg-white/80 dark:bg-slate-900/80 border border-amber-200 dark:border-amber-800 text-[11px]"
                    >
                      {a.name}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Tab Navigation */}
        <div className="flex items-center gap-1 p-1 rounded-2xl bg-slate-200/70 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 overflow-x-auto">
          {[
            { id: "meds", labelEn: "Daily Medications", labelHi: "दैनिक दवाइयां", icon: "💊" },
            { id: "care_plan", labelEn: "Doctor's Care Plan", labelHi: "डॉक्टर परामर्श", icon: "📋" },
            { id: "labs", labelEn: "Lab Results & Vitals", labelHi: "लैब रिपोर्ट व जांच", icon: "🧪" },
            { id: "docs", labelEn: "My Documents", labelHi: "मेरे दस्तावेज़", icon: "📂" },
            { id: "privacy", labelEn: "Privacy & Consents", labelHi: "गोपनीयता व सहमति", icon: "🔒" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all whitespace-nowrap ${
                activeTab === tab.id
                  ? "bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-sm"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              <span>{tab.icon}</span>
              <span>{lang === "en" ? tab.labelEn : tab.labelHi}</span>
            </button>
          ))}
        </div>

        {/* ========================================================================= */}
        {/* TAB 1: DAILY MEDICATIONS & PILL ORGANIZER                                */}
        {/* ========================================================================= */}
        {activeTab === "meds" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                  {lang === "en" ? "Today's Medication Schedule" : "आज का दवा समय-सारणी"}
                </h2>
                <p className="text-xs text-slate-500">
                  {lang === "en"
                    ? "Check off each pill after taking it. Keep track of your daily doses."
                    : "दवा लेने के बाद उस पर सही का निशान लगाएं। अपनी दैनिक खुराक का हिसाब रखें।"}
                </p>
              </div>
              <span className="text-xs px-3 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-medium border border-emerald-200 dark:border-emerald-900">
                {Object.values(takenPills).filter(Boolean).length} {lang === "en" ? "taken today" : "दवा ली गई"}
              </span>
            </div>

            {pillSchedule.every((s) => s.meds.length === 0) ? (
              <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-10 text-center text-slate-400">
                <span className="text-3xl block mb-2">💊</span>
                <p className="text-sm font-medium">
                  {lang === "en" ? "No active medications recorded yet." : "अभी कोई दवा दर्ज नहीं है।"}
                </p>
                <p className="text-xs mt-1">
                  {lang === "en"
                    ? "Upload your prescription or complete an intake session to populate your pills."
                    : "अपनी दवाइयां जोड़ने के लिए पर्चा अपलोड करें या प्रवेश फॉर्म पूरा करें।"}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {pillSchedule.map((slot) => {
                  if (slot.meds.length === 0) return null;
                  return (
                    <div
                      key={slot.timeOfDay}
                      className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm space-y-3"
                    >
                      <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{slot.icon}</span>
                          <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                            {lang === "en" ? slot.labelEn : slot.labelHi}
                          </h3>
                        </div>
                        <span className="text-[11px] font-mono text-slate-400">
                          {slot.meds.length} {slot.meds.length === 1 ? "pill" : "pills"}
                        </span>
                      </div>

                      <div className="space-y-2.5">
                        {slot.meds.map((med) => {
                          const isTaken = !!takenPills[med.id];
                          return (
                            <div
                              key={med.id}
                              onClick={() => togglePill(med.id)}
                              className={`cursor-pointer p-3.5 rounded-2xl border transition-all flex items-start gap-3 select-none ${
                                isTaken
                                  ? "border-emerald-300 dark:border-emerald-800/80 bg-emerald-50/60 dark:bg-emerald-950/20 opacity-80"
                                  : "border-slate-200 dark:border-slate-800 hover:border-blue-400 dark:hover:border-blue-500 bg-slate-50/60 dark:bg-slate-950/40"
                              }`}
                            >
                              {/* Checkbox button */}
                              <button
                                type="button"
                                className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center shrink-0 mt-0.5 transition-colors ${
                                  isTaken
                                    ? "bg-emerald-600 border-emerald-600 text-white"
                                    : "border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900"
                                }`}
                              >
                                {isTaken && (
                                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="20 6 9 17 4 12" />
                                  </svg>
                                )}
                              </button>

                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-2">
                                  <span
                                    className={`text-sm font-bold truncate ${
                                      isTaken
                                        ? "line-through text-slate-400 dark:text-slate-500"
                                        : "text-slate-900 dark:text-white"
                                    }`}
                                  >
                                    {med.name}
                                  </span>
                                  {med.dose && (
                                    <span className="text-xs font-semibold px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-950/70 text-blue-800 dark:text-blue-300 font-mono shrink-0">
                                      {med.dose}
                                    </span>
                                  )}
                                </div>

                                {med.generic && (
                                  <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                                    Generic: {med.generic}
                                  </p>
                                )}

                                <p className="mt-1 text-xs text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
                                  <span className="text-blue-500">ℹ️</span>
                                  <span>{med.instructions}</span>
                                </p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 2: DOCTOR'S CARE PLAN & VISIT SUMMARY                                 */}
        {/* ========================================================================= */}
        {activeTab === "care_plan" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                  {lang === "en" ? "Doctor's Visit Summary & Care Plan" : "डॉक्टर परामर्श रिपोर्ट एवं देखभाल योजना"}
                </h2>
                <p className="text-xs text-slate-500">
                  {lang === "en"
                    ? "Cohesive clinical narrative prepared for your consultation."
                    : "आपकी चिकित्सा परामर्श के लिए तैयार किया गया सारांश।"}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setShowPrescriptionModal(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-colors shadow-sm"
              >
                <span className="font-bold">℞</span>
                {lang === "en" ? "View & Download Prescription" : "पर्चा देखें एवं डाउनलोड करें"}
              </button>
            </div>

            {/* Sections of the summary draft */}
            {summary?.draft?.sections && summary.draft.sections.length > 0 ? (
              <div className="space-y-4">
                {summary.draft.sections.map((sec) => (
                  <div
                    key={sec.key}
                    className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                        {sec.title}
                      </h3>
                      <span className="text-[11px] font-mono text-slate-400">
                        {sec.items.length} {lang === "en" ? "observations" : "तथ्य"}
                      </span>
                    </div>

                    <ul className="space-y-2 text-sm text-slate-700 dark:text-slate-300">
                      {sec.items.map((item, idx) => (
                        <li key={idx} className="flex items-start gap-2.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-2 shrink-0" />
                          <span className="leading-relaxed">{item.text}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-10 text-center text-slate-400">
                <p className="text-sm">
                  {lang === "en" ? "No summary draft available yet." : "अभी कोई परामर्श सारांश उपलब्ध नहीं है।"}
                </p>
                <p className="text-xs mt-1">
                  {lang === "en" ? "Complete intake or upload documents to generate a care plan." : "देखभाल योजना बनाने के लिए प्रवेश फॉर्म पूरा करें।"}
                </p>
              </div>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 3: LAB TESTS & VITALS                                                 */}
        {/* ========================================================================= */}
        {activeTab === "labs" && (
          <div className="space-y-6">
            {/* Interactive Biomarker Trend Visualizer Graph */}
            {biomarkers.length > 0 && (
              <BiomarkerTrendVisualizer
                categories={biomarkers}
                lang={lang}
                patientId={patient.id}
              />
            )}

            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                {lang === "en" ? "Recent Laboratory Readings & Vital Signs" : "हालिया प्रयोगशाला जांच व वाइटल्स"}
              </h2>
              <p className="text-xs text-slate-500">
                {lang === "en"
                  ? "Longitudinal biomarker observations extracted from verified clinic records."
                  : "सत्यापित अस्पताल रिकॉर्ड से निकाले गए परीक्षण परिणाम।"}
              </p>
            </div>

            {labMetrics.length === 0 ? (
              <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-10 text-center text-slate-400">
                <span className="text-3xl block mb-2">🧪</span>
                <p className="text-sm font-medium">
                  {lang === "en" ? "No lab reports or vitals recorded yet." : "कोई लैब रिपोर्ट या वाइटल्स दर्ज नहीं हैं।"}
                </p>
                <p className="text-xs mt-1">
                  {lang === "en"
                    ? "Upload your blood tests or clinic discharge summaries to extract biomarkers."
                    : "बायोमार्कर देखने के लिए अपने ब्लड टेस्ट या रिपोर्ट अपलोड करें।"}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {labMetrics.map((lab) => (
                  <div
                    key={lab.id}
                    className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm space-y-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider truncate">
                        {lab.label}
                      </span>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                          lab.status === "normal"
                            ? "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800"
                            : "bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800"
                        }`}
                      >
                        {lab.status}
                      </span>
                    </div>

                    <div className="text-2xl font-bold text-slate-900 dark:text-white">
                      {lab.value}
                    </div>

                    <div className="pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-500 flex items-center justify-between">
                      <span>Ref: {lab.refRange}</span>
                      <span className="font-mono">{lab.date}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 4: MY MEDICAL DOCUMENTS                                              */}
        {/* ========================================================================= */}
        {activeTab === "docs" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                  {lang === "en" ? "My Medical Documents" : "मेरे चिकित्सा दस्तावेज़"}
                </h2>
                <p className="text-xs text-slate-500">
                  {lang === "en"
                    ? "Prescriptions, discharge notes, and diagnostic scans stored securely on-device."
                    : "पर्चे, डिस्चार्ज समरी और टेस्ट रिपोर्ट जो सुरक्षित रूप से संग्रहीत हैं।"}
                </p>
              </div>
            </div>

            {/* Upload Zone */}
            <div className="rounded-3xl border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-blue-500 bg-white/60 dark:bg-slate-900/60 p-6 text-center transition-colors">
              <input
                type="file"
                id="portal-file-upload"
                className="hidden"
                accept=".jpg,.jpeg,.png,.pdf"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFileUpload(f);
                }}
              />
              <label
                htmlFor="portal-file-upload"
                className="cursor-pointer flex flex-col items-center justify-center gap-2"
              >
                <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 flex items-center justify-center text-xl">
                  📁
                </div>
                <div className="text-sm font-semibold text-slate-900 dark:text-white">
                  {uploading
                    ? (lang === "en" ? "Uploading & extracting with OCR..." : "अपलोड और विश्लेषण हो रहा है...")
                    : (lang === "en" ? "Click to upload a new prescription or lab scan" : "नया पर्चा या टेस्ट स्कैन अपलोड करने के लिए क्लिक करें")}
                </div>
                <div className="text-xs text-slate-400">
                  {lang === "en" ? "Supports JPG, PNG, and PDF up to 25MB" : "JPG, PNG और PDF (अधिकतम 25MB)"}
                </div>
              </label>

              {uploadMsg && (
                <p className="mt-3 text-xs font-semibold text-blue-600 dark:text-blue-400">
                  {uploadMsg}
                </p>
              )}
            </div>

            {/* Documents List */}
            {documents.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center text-slate-400 text-sm">
                {lang === "en" ? "No documents uploaded yet." : "अभी कोई दस्तावेज़ अपलोड नहीं किया गया है।"}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {documents.map((doc) => (
                  <div
                    key={doc.id}
                    className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm flex items-start gap-3.5"
                  >
                    <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center text-base shrink-0">
                      📄
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-sm font-bold text-slate-900 dark:text-white truncate">
                          {doc.filename}
                        </span>
                        <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500">
                          {doc.document_type || "Doc"}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        {Math.round(doc.size_bytes / 1024)} KB •{" "}
                        {new Date(doc.uploaded_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 5: PRIVACY & CONSENT (DPDP ACT 2023)                                  */}
        {/* ========================================================================= */}
        {activeTab === "privacy" && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                {lang === "en" ? "Privacy & Consent Dashboard" : "गोपनीयता और सहमति प्रबंधन"}
              </h2>
              <p className="text-xs text-slate-500">
                {lang === "en"
                  ? "Your data rights under the Digital Personal Data Protection (DPDP) Act 2023."
                  : "डिजिटल व्यक्तिगत डेटा संरक्षण (DPDP) अधिनियम 2023 के तहत आपके अधिकार।"}
              </p>
            </div>

            {/* Rights Overview Card */}
            <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm space-y-4">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span className="text-emerald-500">🛡️</span>
                {lang === "en" ? "Your Guaranteed Data Rights" : "आपके संरक्षित डेटा अधिकार"}
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800">
                  <div className="font-bold text-slate-900 dark:text-white mb-1">
                    {lang === "en" ? "1. Right to Access" : "1. देखने का अधिकार"}
                  </div>
                  <p className="text-slate-500">
                    {lang === "en"
                      ? "You can view all records and clinical observations on this dashboard at any time."
                      : "आप किसी भी समय इस पोर्टल पर अपने सभी मेडिकल रिकॉर्ड देख सकते हैं।"}
                  </p>
                </div>

                <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800">
                  <div className="font-bold text-slate-900 dark:text-white mb-1">
                    {lang === "en" ? "2. Right to Portability" : "2. डेटा डाउनलोड अधिकार"}
                  </div>
                  <p className="text-slate-500">
                    {lang === "en"
                      ? "Download your complete health file in standardized JSON or PDF format."
                      : "अपनी पूरी फाइल JSON या PDF फॉर्मेट में आसानी से डाउनलोड करें।"}
                  </p>
                </div>

                <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800">
                  <div className="font-bold text-slate-900 dark:text-white mb-1">
                    {lang === "en" ? "3. Right to Erasure" : "3. डेटा मिटाने का अधिकार"}
                  </div>
                  <p className="text-slate-500">
                    {lang === "en"
                      ? "You may revoke consent at any time to permanently purge all your clinical records."
                      : "सहमति रद्द करके आप अपना सारा मेडिकल डेटा हमेशा के लिए हटा सकते हैं।"}
                  </p>
                </div>
              </div>

              {/* Data Portability Download Button */}
              <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <div className="text-xs font-semibold text-slate-900 dark:text-white">
                    {lang === "en" ? "Download Complete Health Package (JSON)" : "पूरा स्वास्थ्य डेटा पैकेज डाउनलोड करें (JSON)"}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    {lang === "en" ? "Standardized machine-readable health export including timeline, facts, and documents metadata." : "सभी टाइमलाइन, तथ्य और दस्तावेजों का मशीन-पठनीय एक्सपोर्ट।"}
                  </div>
                </div>

                <a
                  href={`/api/v1/patients/${patient.id}/export`}
                  download
                  className="px-4 py-2 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-semibold text-xs hover:bg-slate-800 transition-colors shadow-sm inline-flex items-center gap-1.5"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  {lang === "en" ? "Export My Health Data" : "डेटा एक्सपोर्ट करें"}
                </a>
              </div>
            </div>

            {/* Active Consents List */}
            <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm space-y-4">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                {lang === "en" ? "Active Consent Status" : "सक्रिय सहमति स्थिति"}
              </h3>

              {consents.length === 0 ? (
                <p className="text-xs text-slate-400">
                  {lang === "en" ? "No consent records on file." : "कोई सहमति रिकॉर्ड नहीं मिला।"}
                </p>
              ) : (
                <div className="space-y-3">
                  {consents.map((c) => (
                    <div
                      key={c.id}
                      className="p-4 rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 flex items-center justify-between gap-4"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span
                            className={`w-2 h-2 rounded-full ${
                              c.granted && !c.revoked_at ? "bg-emerald-500" : "bg-rose-500"
                            }`}
                          />
                          <span className="text-xs font-bold text-slate-900 dark:text-white capitalize">
                            {c.purpose.replace(/_/g, " ")}
                          </span>
                        </div>
                        <p className="mt-1 text-[11px] text-slate-500">
                          {c.revoked_at
                            ? `Revoked on ${new Date(c.revoked_at).toLocaleDateString()}`
                            : `Granted on ${new Date(c.granted_at).toLocaleDateString()}`}
                        </p>
                      </div>

                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                          c.granted && !c.revoked_at
                            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                            : "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300"
                        }`}
                      >
                        {c.granted && !c.revoked_at ? "Active" : "Revoked"}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Revoke Consent Danger Zone */}
              <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-4">
                <div>
                  <h4 className="text-xs font-bold text-rose-600 dark:text-rose-400">
                    {lang === "en" ? "Revoke Consent & Delete Records" : "सहमति रद्द करें और डेटा हटाएं"}
                  </h4>
                  <p className="text-[11px] text-slate-400">
                    {lang === "en"
                      ? "Permanently purge your timeline, extracted facts, and uploaded documents."
                      : "अपनी सभी टाइमलाइन, निकाले गए तथ्य और दस्तावेज़ हमेशा के लिए मिटाएं।"}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setShowRevokeModal(true)}
                  className="px-4 py-2 rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-950 text-rose-700 dark:text-rose-300 font-semibold text-xs transition-colors"
                >
                  {lang === "en" ? "Revoke Consent" : "सहमति वापस लें"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Revocation Confirmation Modal */}
      {showRevokeModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 shadow-2xl space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 dark:bg-rose-950 dark:text-rose-400 flex items-center justify-center text-xl font-bold">
              ⚠️
            </div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">
              {lang === "en" ? "Revoke Consent & Purge Data?" : "सहमति वापस लें और डेटा हटाएं?"}
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              {lang === "en"
                ? "This will immediately revoke your consent and permanently purge all clinical timeline events, documents, and extracted facts for this patient in accordance with DPDP Act 2023. This action cannot be undone."
                : "यह DPDP अधिनियम 2023 के तहत आपकी सहमति तुरंत रद्द कर देगा और इस रोगी के सभी टाइमलाइन तथ्य व दस्तावेज़ हमेशा के लिए हटा देगा। यह क्रिया वापस नहीं की जा सकती।"}
            </p>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowRevokeModal(false)}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                {lang === "en" ? "Cancel" : "रद्द करें"}
              </button>
              <button
                type="button"
                disabled={revoking}
                onClick={handleRevokeConsent}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-xs font-semibold text-white transition-colors disabled:opacity-50"
              >
                {revoking
                  ? (lang === "en" ? "Purging records..." : "हटाया जा रहा है...")
                  : (lang === "en" ? "Yes, Purge My Data" : "हाँ, डेटा मिटाएं")}
              </button>
            </div>
          </div>
        </div>
      )}

      <PrescriptionModal
        patientId={resolvedPatientId}
        isOpen={showPrescriptionModal}
        onClose={() => setShowPrescriptionModal(false)}
        defaultLang={lang}
      />
    </main>
  );
}

