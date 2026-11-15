"use client";
import React, { useEffect, useState } from "react";

export type PrescriptionData = {
  clinic_name: string;
  clinic_sub: string;
  clinic_address: string;
  clinic_phone: string;
  patient_id: string;
  synthetic_id: string;
  preferred_language: string;
  gender: string;
  dob: string;
  rx_number: string;
  encounter_date: string;
  doctor_name: string;
  doctor_reg: string;
  department: string;
  vitals: Record<string, string>;
  allergies: string[];
  chief_complaints: string[];
  diagnoses: string[];
  medications: Array<{
    name: string;
    generic?: string;
    dose: string;
    route: string;
    frequency: string;
    timing: string;
    instructions_en: string;
    instructions_hi: string;
    duration: string;
  }>;
  care_plan: string[];
  follow_up_date: string;
};

interface PrescriptionModalProps {
  patientId: string;
  isOpen: boolean;
  onClose: () => void;
  defaultLang?: "en" | "hi";
}

export default function PrescriptionModal({
  patientId,
  isOpen,
  onClose,
  defaultLang = "en",
}: PrescriptionModalProps) {
  const [data, setData] = useState<PrescriptionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [lang, setLang] = useState<"en" | "hi">(defaultLang);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (!isOpen || !patientId) return;

    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const res = await fetch(`/api/v1/patients/${encodeURIComponent(patientId)}/prescription`);
        if (!res.ok) throw new Error("Could not retrieve prescription data");
        const json = await res.json();
        setData(json);
        if (json.preferred_language === "hi") setLang("hi");
      } catch (e: any) {
        setErr(e?.message || "Failed to load prescription");
      } finally {
        setLoading(false);
      }
    })();
  }, [isOpen, patientId]);

  if (!isOpen) return null;

  async function handleDownloadPdf() {
    try {
      setDownloading(true);
      const url = `/api/v1/patients/${encodeURIComponent(patientId)}/prescription/pdf`;
      const a = document.createElement("a");
      a.href = url;
      a.download = `Prescription-${data?.synthetic_id || patientId}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch {
      alert("Failed to download PDF. Please try again.");
    } finally {
      setDownloading(false);
    }
  }

  function handlePrint() {
    window.print();
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 print:p-0 print:bg-white print:static">
      {/* Print-specific style tag */}
      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #printable-prescription,
          #printable-prescription * {
            visibility: visible;
          }
          #printable-prescription {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            margin: 0;
            padding: 20mm;
            border: none !important;
            box-shadow: none !important;
            background: white !important;
            color: black !important;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>

      <div className="relative w-full max-w-4xl bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden my-4 flex flex-col max-h-[92vh] print:max-h-none print:border-none print:shadow-none print:rounded-none">
        {/* Top Control Bar (Hidden when printing) */}
        <div className="no-print bg-slate-50 dark:bg-slate-800/80 px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <span className="w-9 h-9 rounded-xl bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400 flex items-center justify-center text-lg font-bold">
              ℞
            </span>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                {lang === "en" ? "Official Clinical Prescription & Discharge" : "आधिकारिक चिकित्सीय पर्चा एवं डिस्चार्ज"}
              </h3>
              <p className="text-[11px] text-slate-500">
                {data?.synthetic_id} • ABDM & DPDP Act 2023 Verified
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Lang switch */}
            <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-0.5 text-xs font-medium">
              <button
                type="button"
                onClick={() => setLang("en")}
                className={`px-2.5 py-1 rounded-md transition-colors ${
                  lang === "en"
                    ? "bg-blue-600 text-white"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
                }`}
              >
                English
              </button>
              <button
                type="button"
                onClick={() => setLang("hi")}
                className={`px-2.5 py-1 rounded-md transition-colors ${
                  lang === "hi"
                    ? "bg-blue-600 text-white"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
                }`}
              >
                हिन्दी
              </button>
            </div>

            {/* Print Button */}
            <button
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-semibold transition-colors"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 6 2 18 2 18 9" />
                <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                <rect x="6" y="14" width="12" height="8" />
              </svg>
              {lang === "en" ? "Print" : "प्रिंट"}
            </button>

            {/* Download PDF Button */}
            <button
              onClick={handleDownloadPdf}
              disabled={downloading}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-colors shadow-sm disabled:opacity-50"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              {downloading ? "Generating..." : lang === "en" ? "Download PDF" : "PDF डाउनलोड"}
            </button>

            {/* Close Button */}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
              aria-label="Close"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        {/* Prescription Document Container */}
        <div className="overflow-y-auto p-6 sm:p-10 flex-1 bg-slate-100/50 dark:bg-slate-950/50 print:p-0 print:bg-white">
          {loading && (
            <div className="py-24 text-center text-slate-500 text-sm flex items-center justify-center gap-3">
              <span className="w-5 h-5 rounded-full border-2 border-slate-300 border-t-blue-500 animate-spin" />
              {lang === "en" ? "Compiling official prescription slip..." : "चिकित्सकीय पर्चा तैयार किया जा रहा है..."}
            </div>
          )}

          {err && (
            <div className="p-6 bg-red-50 dark:bg-red-950/40 rounded-2xl border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 text-center text-sm">
              {err}
            </div>
          )}

          {!loading && data && (
            <div
              id="printable-prescription"
              className="max-w-3xl mx-auto bg-white text-slate-900 rounded-2xl shadow-sm border border-slate-200 p-8 sm:p-10 space-y-6 text-sm"
              style={{ fontFamily: "'Inter', sans-serif" }}
            >
              {/* Header: Clinic Details & Prescription Number */}
              <div className="flex items-start justify-between gap-4 pb-4 border-b-2 border-blue-600">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="w-7 h-7 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold text-base">
                      +
                    </span>
                    <h1 className="text-xl font-bold tracking-tight text-slate-900">
                      {data.clinic_name}
                    </h1>
                  </div>
                  <p className="text-xs text-blue-600 font-medium">
                    {data.clinic_sub}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    {data.clinic_address}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    Phone: {data.clinic_phone}
                  </p>
                </div>

                <div className="text-right space-y-1 shrink-0">
                  <span className="inline-block px-3 py-1 rounded-md bg-blue-50 border border-blue-200 text-blue-700 font-bold text-xs uppercase tracking-wider">
                    ℞ Prescription
                  </span>
                  <p className="text-xs font-mono font-semibold text-slate-700 pt-1">
                    {data.rx_number}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    {data.encounter_date}
                  </p>
                </div>
              </div>

              {/* Patient & Doctor Demographics Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs">
                <div>
                  <span className="text-slate-400 uppercase text-[10px] font-semibold block">
                    {lang === "en" ? "Patient ID" : "रोगी पहचान"}
                  </span>
                  <span className="font-bold text-slate-900 font-mono text-sm">
                    {data.synthetic_id}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 uppercase text-[10px] font-semibold block">
                    {lang === "en" ? "Gender / Age" : "लिंग / आयु"}
                  </span>
                  <span className="font-medium text-slate-800">
                    {data.gender} / {data.dob}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 uppercase text-[10px] font-semibold block">
                    {lang === "en" ? "Doctor" : "चिकित्सक"}
                  </span>
                  <span className="font-bold text-slate-900">
                    {data.doctor_name}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 uppercase text-[10px] font-semibold block">
                    {lang === "en" ? "Reg. No" : "पंजीकरण संख्या"}
                  </span>
                  <span className="font-mono text-slate-700">
                    {data.doctor_reg}
                  </span>
                </div>
              </div>

              {/* Vitals Strip */}
              {data.vitals && Object.keys(data.vitals).length > 0 && (
                <div className="flex items-center gap-3 flex-wrap bg-blue-50/60 border border-blue-100 px-4 py-2 rounded-xl text-xs">
                  <span className="font-bold text-blue-800 flex items-center gap-1">
                    📊 {lang === "en" ? "Vitals:" : "शारीरिक माप:"}
                  </span>
                  {Object.entries(data.vitals).map(([k, v]) => (
                    <span key={k} className="inline-flex items-center gap-1 text-slate-700">
                      <span className="font-semibold text-slate-900">{k}:</span> {v}
                      <span className="text-slate-300">|</span>
                    </span>
                  ))}
                </div>
              )}

              {/* Allergies / Precautions Alert */}
              {data.allergies && data.allergies.length > 0 && (
                <div className="bg-red-50 border border-red-200 px-4 py-2.5 rounded-xl text-xs text-red-800 flex items-start gap-2">
                  <span className="text-base font-bold text-red-600">⚠️</span>
                  <div>
                    <span className="font-bold uppercase tracking-wider text-[10px] text-red-600 block">
                      {lang === "en" ? "Drug Allergy Alert" : "औषधि एलर्जी चेतावनी"}
                    </span>
                    <p className="font-medium">{data.allergies.join(", ")}</p>
                  </div>
                </div>
              )}

              {/* Clinical Assessment & Diagnosis */}
              <div className="space-y-1.5 pt-1">
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  {lang === "en" ? "Clinical Diagnosis & Findings" : "नैदानिक निष्कर्ष एवं निदान"}
                </h4>
                <div className="bg-slate-50/80 p-3 rounded-xl border border-slate-200 text-xs text-slate-700 space-y-1">
                  {data.diagnoses.map((d, i) => (
                    <p key={i} className="flex items-baseline gap-2">
                      <span className="text-blue-600 font-bold">•</span>
                      <span>{d}</span>
                    </p>
                  ))}
                </div>
              </div>

              {/* Prescribed Medications Table (Main Rx Section) */}
              <div className="space-y-2 pt-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-blue-600" />
                    {lang === "en" ? "Prescribed Medicines (Rx)" : "निर्धारित औषधियां (Rx)"}
                  </h4>
                  <span className="text-[11px] text-slate-500">
                    {data.medications.length} {lang === "en" ? "medications" : "दवाइयां"}
                  </span>
                </div>

                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-900 text-white font-semibold">
                        <th className="py-2.5 px-3 w-8">#</th>
                        <th className="py-2.5 px-3">
                          {lang === "en" ? "Medicine & Generic" : "दवा एवं जेनेरिक नाम"}
                        </th>
                        <th className="py-2.5 px-3">
                          {lang === "en" ? "Dosage" : "मात्रा"}
                        </th>
                        <th className="py-2.5 px-3">
                          {lang === "en" ? "Frequency & Time" : "समय"}
                        </th>
                        <th className="py-2.5 px-3">
                          {lang === "en" ? "Instructions" : "निर्देश"}
                        </th>
                        <th className="py-2.5 px-3 w-20">
                          {lang === "en" ? "Duration" : "अवधि"}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.medications.map((m, idx) => (
                        <tr key={idx} className={idx % 2 === 0 ? "bg-white" : "bg-slate-50/50"}>
                          <td className="py-2.5 px-3 text-slate-400 font-mono">{idx + 1}</td>
                          <td className="py-2.5 px-3">
                            <span className="font-bold text-slate-900 block">{m.name}</span>
                            {m.generic && (
                              <span className="text-[10px] text-slate-500 italic block">
                                {m.generic}
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 font-medium text-slate-700">
                            {m.dose} <span className="text-[10px] text-slate-400 block">{m.route}</span>
                          </td>
                          <td className="py-2.5 px-3 text-slate-800">
                            {m.timing}
                          </td>
                          <td className="py-2.5 px-3">
                            <span className="font-semibold text-blue-700 block">
                              {lang === "hi" ? m.instructions_hi : m.instructions_en}
                            </span>
                            <span className="text-[10px] text-slate-500 block">
                              {lang === "hi" ? m.instructions_en : m.instructions_hi}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 font-medium text-slate-700">
                            {m.duration}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Care Plan & Advice */}
              {data.care_plan && data.care_plan.length > 0 && (
                <div className="space-y-1.5 pt-2">
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                    {lang === "en" ? "Doctor's Advice & Care Plan" : "चिकित्सक परामर्श एवं निर्देश"}
                  </h4>
                  <ul className="text-xs text-slate-700 space-y-1 list-disc list-inside bg-slate-50 p-3 rounded-xl border border-slate-200">
                    {data.care_plan.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Next Appointment & Signature Footer */}
              <div className="pt-4 border-t border-slate-200 flex items-end justify-between gap-6 flex-wrap">
                <div className="space-y-1 text-xs">
                  <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">
                    {lang === "en" ? "Next Review Date" : "अगली भेंट की तिथि"}
                  </span>
                  <p className="font-bold text-blue-700 text-sm">
                    {data.follow_up_date}
                  </p>
                  <p className="text-[10px] text-slate-400 italic">
                    *Emergency helpline: 108 / Visit nearest trauma care if acute pain or dyspnea occurs.
                  </p>
                </div>

                <div className="text-right space-y-1">
                  <div className="w-40 border-b border-slate-400 ml-auto pb-8 mb-1" />
                  <p className="font-bold text-slate-900 text-xs">
                    {data.doctor_name}
                  </p>
                  <p className="text-[10px] text-slate-500 font-mono">
                    {data.doctor_reg}
                  </p>
                  <p className="text-[9px] text-slate-400 uppercase tracking-wider font-semibold">
                    Authorized Clinician Signature & Stamp
                  </p>
                </div>
              </div>

              {/* Bottom Compliance & Privacy Strip */}
              <div className="pt-3 border-t border-dashed border-slate-200 text-center text-[10px] text-slate-400 space-y-0.5">
                <p>
                  MediGraph On-Premises Clinical Intelligence System • Digital Health Mission (ABDM) Compatible
                </p>
                <p>
                  This prescription is generated in compliance with the Digital Personal Data Protection (DPDP) Act 2023.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

