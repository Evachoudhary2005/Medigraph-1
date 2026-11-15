"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import BiomarkerTrendVisualizer, {
  BiomarkerCategory,
} from "@/components/BiomarkerTrendVisualizer";
import PrescriptionModal from "@/components/PrescriptionModal";

type Patient = {
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
  source_excerpt: string;
  confidence: number;
  needs_review: boolean;
  verification_status: string;
};

type Alert = {
  rule_id: string;
  name: string;
  severity: "urgent" | "caution" | "info";
  description: string;
  source_hint: string;
  evidence?: any[];
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
  alerts: Alert[];
  events_count: number;
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

export default function ClinicianPatient360Page({
  params,
}: {
  params: { patientId: string };
}) {
  const router = useRouter();
  const routeParams = useParams();
  const resolvedPatientId = ((routeParams?.patientId as string) || params?.patientId || "").trim();

  const [patient, setPatient] = useState<Patient | null>(null);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [biomarkers, setBiomarkers] = useState<BiomarkerCategory[]>([]);
  const [knownPatients, setKnownPatients] = useState<Array<{ id: string; synthetic_id: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [generatingAi, setGeneratingAi] = useState(false);
  const [showPrescriptionModal, setShowPrescriptionModal] = useState(false);

  useEffect(() => {
    if (!resolvedPatientId) return;

    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const [pRes, tRes, sRes, dRes, bRes] = await Promise.all([
          fetch(`/api/v1/patients/${encodeURIComponent(resolvedPatientId)}`),
          fetch(`/api/v1/timeline?patient_id=${encodeURIComponent(resolvedPatientId)}`),
          fetch(`/api/v1/summary/${encodeURIComponent(resolvedPatientId)}`),
          fetch(`/api/v1/documents?patient_id=${encodeURIComponent(resolvedPatientId)}`),
          fetch(`/api/v1/patients/${encodeURIComponent(resolvedPatientId)}/biomarkers`),
        ]);

        if (!pRes.ok) {
          // Attempt to load known registered patients so user can pick one immediately
          try {
            const listRes = await fetch("/api/v1/patients");
            if (listRes.ok) {
              const listData = await listRes.json();
              setKnownPatients(listData.slice(0, 10));
            }
          } catch {}

          if (pRes.status === 404) {
            throw new Error(`Patient identifier "${resolvedPatientId}" was not found in database.`);
          } else if (pRes.status >= 500) {
            throw new Error(`Backend API error (${pRes.status}). Verify that the FastAPI server is running on port 8000.`);
          } else {
            throw new Error(`Failed to load patient (HTTP ${pRes.status}).`);
          }
        }
        setPatient(await pRes.json());
        if (tRes.ok) setTimeline(await tRes.json());
        if (sRes.ok) setSummary(await sRes.json());
        if (dRes.ok) setDocuments(await dRes.json());
        if (bRes.ok) {
          const bData = await bRes.json();
          setBiomarkers(bData.categories || []);
        }
      } catch (e: any) {
        // Attempt to load known registered patients if network or other failure
        try {
          const listRes = await fetch("/api/v1/patients");
          if (listRes.ok) {
            const listData = await listRes.json();
            setKnownPatients(listData.slice(0, 10));
          }
        } catch {}
        const isConnErr = e?.message?.includes("Failed to fetch") || e?.message?.includes("NetworkError");
        if (isConnErr) {
          setErr("Local API server (http://127.0.0.1:8000) is unreachable. Please ensure run.bat is running in your terminal.");
        } else {
          setErr(e?.message ?? "Failed to load patient records");
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [resolvedPatientId]);

  // Extract Demographics (gender, age/dob)
  const demographics = useMemo(() => {
    const demoEvents = timeline.filter((e) => e.kind === "demographic" || e.kind === "date");
    let gender = "Unspecified";
    let dob = "";
    for (const d of demoEvents) {
      if (d.label.toLowerCase().includes("gender")) gender = d.value;
      if (d.label.toLowerCase().includes("birth") || d.label.toLowerCase().includes("dob")) {
        dob = d.value;
      }
    }
    return { gender, dob };
  }, [timeline]);

  // Extract Active Medications with full normalized details
  const medications = useMemo(() => {
    const medEvents = timeline.filter((e) => e.kind === "medication");
    const seen = new Set<string>();
    const list: Array<{
      id: string;
      brand: string;
      generic: string;
      dose: string;
      frequency: string;
      drugClass: string;
      confidence: number;
      suspicious: boolean;
      suspiciousReason?: string;
    }> = [];

    for (const m of medEvents) {
      const norm = m.normalized || {};
      const key = (norm.generic || m.label || "").toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);

      list.push({
        id: m.id,
        brand: norm.brand || m.label,
        generic: norm.generic || m.label,
        dose: norm.dose_value ? `${norm.dose_value}${norm.dose_unit || "mg"}` : m.value,
        frequency: norm.frequency || "OD",
        drugClass: norm.drug_class || "General",
        confidence: m.confidence || 0.9,
        suspicious: !!norm.suspicious_dose,
        suspiciousReason: norm.suspicious_reason,
      });
    }
    return list;
  }, [timeline]);

  // Extract Lab Values & Vitals
  const labAndVitals = useMemo(() => {
    return timeline
      .filter((e) => e.kind === "lab_value" || e.kind === "vital" || e.kind === "observation")
      .map((e) => {
        let flag: "normal" | "abnormal" = "normal";
        const valNum = parseFloat(e.value.replace(/[^0-9.]/g, ""));
        const lbl = e.label.toLowerCase();
        if (!isNaN(valNum)) {
          if (lbl.includes("glucose") && valNum > 140) flag = "abnormal";
          if (lbl.includes("creatinine") && valNum > 1.3) flag = "abnormal";
          if (lbl.includes("bp") && valNum > 130) flag = "abnormal";
        }
        return {
          id: e.id,
          label: e.label,
          value: e.value,
          date: e.event_date ? new Date(e.event_date).toLocaleDateString() : "Recent",
          flag,
          confidence: e.confidence,
        };
      });
  }, [timeline]);

  // Generate AI Summary Narrative
  async function handleGenerateAi() {
    if (!patient) return;
    setGeneratingAi(true);
    try {
      const res = await fetch(`/api/v1/summary/${patient.id}/generate?actor=clinician`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("AI generation failed");
      router.push(`/clinician/${patient.id}/summary`);
    } catch (e: any) {
      alert(`Error generating AI draft: ${e?.message}`);
    } finally {
      setGeneratingAi(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center">
        <div className="flex items-center gap-3 text-slate-500 text-sm">
          <span className="w-5 h-5 rounded-full border-2 border-slate-300 border-t-blue-500 animate-spin" />
          Loading patient 360 overview...
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
      <main className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-6">
        <div className="max-w-lg w-full bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-8 text-center shadow-xl space-y-5">
          <div className="w-14 h-14 rounded-2xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-900 flex items-center justify-center mx-auto text-2xl font-bold">
            {isConnErr ? "🔌" : "🔍"}
          </div>

          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">
              {isConnErr ? "Backend Server Offline" : "Patient Record Not Found"}
            </h2>
            <p className="mt-2 text-xs text-slate-600 dark:text-slate-400 leading-relaxed font-mono bg-slate-50 dark:bg-slate-800/60 p-3 rounded-xl border border-slate-200 dark:border-slate-700">
              {err}
            </p>
          </div>

          {knownPatients.length > 0 && (
            <div className="pt-2 text-left">
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                Available Registered Patients (Click to open):
              </p>
              <div className="grid grid-cols-2 gap-2">
                {knownPatients.map((kp) => (
                  <Link
                    key={kp.id}
                    href={`/clinician/${kp.id}`}
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
              🔄 Retry
            </button>
            <Link
              href="/clinician"
              className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs transition-colors"
            >
              Back to Clinician List
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const urgentAlerts = summary?.alerts?.filter((a) => a.severity === "urgent") || [];
  const cautionAlerts = summary?.alerts?.filter((a) => a.severity === "caution") || [];

  return (
    <main className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 pb-24">
      {/* Top Breadcrumb & Patient Navigation Header */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <Link
                href="/clinician"
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="19" y1="12" x2="5" y2="12" />
                  <polyline points="12 19 5 12 12 5" />
                </svg>
              </Link>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
                    {patient.synthetic_id}
                  </h1>
                  <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-semibold">
                    {patient.preferred_language.toUpperCase()}
                  </span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-semibold border border-emerald-200 dark:border-emerald-900">
                    DPDP Consent Active
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-3 text-xs text-slate-500">
                  <span>UUID: <code className="font-mono">{patient.id.slice(0, 8)}</code></span>
                  <span>•</span>
                  <span>Registered: {new Date(patient.created_at).toLocaleDateString()}</span>
                  <span>•</span>
                  <span>Gender: {demographics.gender}</span>
                </div>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="flex items-center gap-2 flex-wrap">
              <Link
                href={`/patient/${patient.id}`}
                target="_blank"
                className="px-3.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5 shadow-sm transition-all"
              >
                <svg className="w-3.5 h-3.5 text-blue-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                  <polyline points="15 3 21 3 21 9" />
                  <line x1="10" y1="14" x2="21" y2="3" />
                </svg>
                Open Patient Portal View
              </Link>

              <a
                href={`/api/v1/summary/${patient.id}/pdf`}
                download
                className="px-3.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5 shadow-sm transition-all"
              >
                <svg className="w-3.5 h-3.5 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                Export PDF Note
              </a>

              <button
                type="button"
                onClick={() => setShowPrescriptionModal(true)}
                className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 shadow-sm shadow-blue-500/20 transition-all"
              >
                <span className="font-bold text-sm">℞</span>
                Official Rx & Discharge PDF
              </button>

              <button
                type="button"
                onClick={handleGenerateAi}
                disabled={generatingAi}
                className="px-4 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-xs font-semibold text-white inline-flex items-center gap-1.5 shadow-sm shadow-blue-500/20 transition-all"
              >
                {generatingAi ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Generating Note...
                  </>
                ) : (
                  <>
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                    </svg>
                    Run AI Note Generator
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Sub Navigation Tabs */}
          <nav className="mt-4 flex items-center gap-2 border-t border-slate-100 dark:border-slate-800 pt-3 text-xs font-semibold overflow-x-auto">
            <Link
              href={`/clinician/${patient.id}`}
              className="px-3 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-bold"
            >
              360 Overview
            </Link>
            <Link
              href={`/clinician/${patient.id}/summary`}
              className="px-3 py-1.5 rounded-lg text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              Clinical Summary & CDS
            </Link>
            <Link
              href={`/clinician/${patient.id}/timeline`}
              className="px-3 py-1.5 rounded-lg text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              Patient Timeline
            </Link>
            <Link
              href={`/clinician/${patient.id}/documents`}
              className="px-3 py-1.5 rounded-lg text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              Document OCR Review
            </Link>
            <Link
              href={`/clinician/${patient.id}/orchestrate`}
              className="px-3 py-1.5 rounded-lg text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              Pipeline Orchestrator
            </Link>
          </nav>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-6 space-y-6">
        {/* Critical Alerts Banner */}
        {urgentAlerts.length > 0 && (
          <div className="rounded-3xl border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/30 p-5 space-y-3">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping" />
              <h2 className="text-sm font-bold text-rose-900 dark:text-rose-200 uppercase tracking-wide">
                Critical Red-Flag Alerts ({urgentAlerts.length})
              </h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {urgentAlerts.map((a) => (
                <div
                  key={a.rule_id}
                  className="p-3.5 rounded-2xl border border-rose-200/80 dark:border-rose-900/40 bg-white/80 dark:bg-slate-900/80 shadow-sm"
                >
                  <div className="font-bold text-xs text-rose-800 dark:text-rose-300">
                    {a.name}
                  </div>
                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                    {a.description}
                  </p>
                  <p className="mt-1.5 text-[11px] font-mono text-rose-700 dark:text-rose-400">
                    Rationale: {a.source_hint}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Longitudinal Biomarker Trend Curves */}
        {biomarkers.length > 0 && (
          <BiomarkerTrendVisualizer
            categories={biomarkers}
            lang={patient.preferred_language === "hi" ? "hi" : "en"}
            patientId={patient.id}
          />
        )}

        {/* 2-Column Clinical Cockpit */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column (2 Cols wide): Clinical Summary Note + Active Medications */}
          <div className="lg:col-span-2 space-y-6">
            {/* Clinical Summary Note Snapshot */}
            <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-slate-900 dark:text-white">
                    Clinical Impression & Care Plan Note
                  </h2>
                  <p className="text-xs text-slate-500">
                    Deterministic synthesis of complaints, timeline events, and OCR documents.
                  </p>
                </div>
                <Link
                  href={`/clinician/${patient.id}/summary`}
                  className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1"
                >
                  Edit / Sign Off →
                </Link>
              </div>

              {summary?.draft?.sections && summary.draft.sections.length > 0 ? (
                <div className="space-y-4 pt-2">
                  {summary.draft.sections.map((sec) => (
                    <div
                      key={sec.key}
                      className="p-4 rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/40 space-y-2"
                    >
                      <h3 className="text-xs font-bold uppercase tracking-wider text-blue-700 dark:text-blue-300">
                        {sec.title}
                      </h3>
                      <ul className="space-y-1.5 text-xs text-slate-700 dark:text-slate-300">
                        {sec.items.map((it, idx) => (
                          <li key={idx} className="flex items-start gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-400 mt-1.5 shrink-0" />
                            <span className="leading-relaxed">{it.text}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-8 text-center text-xs text-slate-400 rounded-2xl bg-slate-50 dark:bg-slate-950">
                  No clinical summary draft generated yet. Click "Run AI Note Generator" above.
                </div>
              )}
            </div>

            {/* Active Medications & Dosage Safety */}
            <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-slate-900 dark:text-white">
                    Active Medications & Dosing Profile
                  </h2>
                  <p className="text-xs text-slate-500">
                    Cross-referenced brand-to-generic resolution with typical dosage verification.
                  </p>
                </div>
                <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300">
                  {medications.length} Active
                </span>
              </div>

              {medications.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400 rounded-2xl bg-slate-50 dark:bg-slate-950">
                  No medications extracted for this patient.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 uppercase tracking-wider">
                        <th className="pb-3 font-semibold">Drug / Brand</th>
                        <th className="pb-3 font-semibold">Generic (INN)</th>
                        <th className="pb-3 font-semibold">Dose</th>
                        <th className="pb-3 font-semibold">Frequency</th>
                        <th className="pb-3 font-semibold">Drug Class</th>
                        <th className="pb-3 font-semibold">Safety</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {medications.map((m) => (
                        <tr key={m.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                          <td className="py-3 font-bold text-slate-900 dark:text-white">
                            {m.brand}
                          </td>
                          <td className="py-3 font-mono text-slate-600 dark:text-slate-300">
                            {m.generic}
                          </td>
                          <td className="py-3 font-mono font-semibold text-blue-600 dark:text-blue-400">
                            {m.dose}
                          </td>
                          <td className="py-3 uppercase font-mono text-slate-500">
                            {m.frequency}
                          </td>
                          <td className="py-3 text-slate-500 capitalize">
                            {m.drugClass}
                          </td>
                          <td className="py-3">
                            {m.suspicious ? (
                              <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 font-semibold text-[10px]">
                                Verify Dose
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-semibold text-[10px]">
                                Verified
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* Right Column (1 Col wide): Vitals, Documents, & Recent Timeline */}
          <div className="space-y-6">
            {/* Lab & Vitals Observations */}
            <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Biomarkers & Vitals
                </h3>
                <span className="text-[11px] font-mono text-slate-400">
                  {labAndVitals.length} recorded
                </span>
              </div>

              {labAndVitals.length === 0 ? (
                <p className="text-xs text-slate-400 py-4 text-center">
                  No vital signs or lab facts recorded.
                </p>
              ) : (
                <div className="space-y-2">
                  {labAndVitals.slice(0, 6).map((l) => (
                    <div
                      key={l.id}
                      className="p-3 rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/40 flex items-center justify-between gap-3"
                    >
                      <div>
                        <div className="font-semibold text-xs text-slate-900 dark:text-white">
                          {l.label}
                        </div>
                        <div className="text-[10px] text-slate-400">{l.date}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs font-bold font-mono text-slate-900 dark:text-white">
                          {l.value}
                        </div>
                        <span
                          className={`text-[9px] uppercase font-bold px-1.5 py-0.5 rounded ${
                            l.flag === "abnormal"
                              ? "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300"
                              : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                          }`}
                        >
                          {l.flag}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Document Gallery */}
            <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Processed Clinical Documents
                </h3>
                <Link
                  href={`/clinician/${patient.id}/documents`}
                  className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                >
                  Review All →
                </Link>
              </div>

              {documents.length === 0 ? (
                <p className="text-xs text-slate-400 py-4 text-center">
                  No clinical documents on file.
                </p>
              ) : (
                <div className="space-y-2">
                  {documents.map((d) => (
                    <div
                      key={d.id}
                      className="p-3 rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/40 flex items-start gap-2.5"
                    >
                      <span className="text-base mt-0.5">📄</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                          {d.filename}
                        </div>
                        <div className="text-[10px] text-slate-400 flex items-center gap-2 mt-0.5">
                          <span>{d.document_type || "Document"}</span>
                          <span>•</span>
                          <span>{Math.round(d.size_bytes / 1024)} KB</span>
                        </div>
                      </div>
                      {d.needs_review ? (
                        <span className="text-[9px] uppercase font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                          Review
                        </span>
                      ) : (
                        <span className="text-[9px] uppercase font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                          Verified
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Recent Timeline Stream */}
            <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Recent Chronological Activity
                </h3>
                <Link
                  href={`/clinician/${patient.id}/timeline`}
                  className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                >
                  Full Timeline →
                </Link>
              </div>

              <div className="space-y-2">
                {timeline.slice(0, 5).map((e) => (
                  <div
                    key={e.id}
                    className="p-3 rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/40 text-xs"
                  >
                    <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1">
                      <span className="uppercase font-mono font-semibold">{e.kind}</span>
                      <span>{e.event_date ? new Date(e.event_date).toLocaleDateString() : "Undated"}</span>
                    </div>
                    <div className="font-semibold text-slate-800 dark:text-slate-200">
                      {e.label}: <span className="font-normal text-slate-600 dark:text-slate-400">{e.value}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <PrescriptionModal
        patientId={resolvedPatientId}
        isOpen={showPrescriptionModal}
        onClose={() => setShowPrescriptionModal(false)}
      />
    </main>
  );
}

