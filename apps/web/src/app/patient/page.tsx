"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type ExistingPatient = {
  id: string;
  synthetic_id: string;
  preferred_language: string;
  created_at: string;
  stats?: {
    documents: number;
    timeline_events: number;
    sessions: number;
  };
};

export default function PatientPortalEntryPage() {
  const router = useRouter();
  const [lang, setLang] = useState<"en" | "hi">("en");
  const [inputId, setInputId] = useState("");
  const [patients, setPatients] = useState<ExistingPatient[]>([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/v1/patients/stats");
        if (res.ok) {
          const list = await res.json();
          setPatients(list);
        }
      } catch (e: any) {
        console.error("Failed to load patients list", e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function handleLookup(e?: React.FormEvent) {
    if (e) e.preventDefault();
    const idToSearch = inputId.trim();
    if (!idToSearch) return;

    setSearching(true);
    setErr(null);
    try {
      const res = await fetch(`/api/v1/patients/${encodeURIComponent(idToSearch)}`);
      if (!res.ok) {
        throw new Error(
          lang === "en"
            ? "Patient ID not found. Please verify the identifier on your clinic card."
            : "रोगी पहचानकर्ता नहीं मिला। कृपया अपने अस्पताल कार्ड पर आईडी जांचें।"
        );
      }
      const p = await res.json();
      router.push(`/patient/${p.id}`);
    } catch (err: any) {
      setErr(err?.message || "Failed to find patient");
    } finally {
      setSearching(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 dark:bg-[#070b18] text-slate-900 dark:text-slate-100 py-12 px-4 sm:px-6">
      {/* Ambient decorative gradient */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 top-0 h-96 opacity-60 dark:opacity-40"
        style={{
          background: "radial-gradient(60% 60% at 50% 0%, rgba(59,130,246,0.18), rgba(99,102,241,0.08), transparent 75%)",
        }}
      />

      <div className="relative max-w-4xl mx-auto space-y-8">
        {/* Top bar: Back to Home + Language Toggle */}
        <div className="flex items-center justify-between gap-4">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-xs font-medium text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="12" x2="5" y2="12" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
            {lang === "en" ? "Home" : "होम"}
          </Link>

          {/* Lang switch */}
          <div className="inline-flex items-center p-1 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
            <button
              type="button"
              onClick={() => setLang("en")}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                lang === "en"
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
              }`}
            >
              English
            </button>
            <button
              type="button"
              onClick={() => setLang("hi")}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                lang === "hi"
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
              }`}
            >
              हिन्दी
            </button>
          </div>
        </div>

        {/* Hero Card */}
        <div className="rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl p-8 sm:p-10 shadow-xl shadow-slate-200/40 dark:shadow-none text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-900 text-blue-700 dark:text-blue-300 text-xs font-medium mb-4">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            {lang === "en" ? "Self-Service Health Portal" : "रोगी स्वास्थ्य सेवा पोर्टल"}
          </div>

          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 dark:text-white">
            {lang === "en" ? "Welcome to Your Patient Dashboard" : "अपने रोगी डैशबोर्ड में आपका स्वागत है"}
          </h1>
          <p className="mt-3 text-sm sm:text-base text-slate-600 dark:text-slate-400 max-w-xl mx-auto">
            {lang === "en"
              ? "Access your active medication schedule, doctor visit instructions, lab results, prescriptions, and manage your health privacy."
              : "अपनी सक्रिय दवाओं की सूची, डॉक्टर के परामर्श निर्देश, लैब परीक्षण परिणाम देखें और अपनी स्वास्थ्य गोपनीयता प्रबंधित करें।"}
          </p>

          {/* Search box */}
          <form onSubmit={handleLookup} className="mt-8 max-w-md mx-auto">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <svg
                  className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  type="text"
                  value={inputId}
                  onChange={(e) => setInputId(e.target.value)}
                  placeholder={lang === "en" ? "Enter Patient ID (e.g. SYN-0001)" : "रोगी आईडी दर्ज करें (उदा. SYN-0001)"}
                  className="w-full pl-10 pr-4 py-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm font-medium text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <button
                type="submit"
                disabled={searching || !inputId.trim()}
                className="px-6 py-3 rounded-2xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold text-sm transition-all shadow-md shadow-blue-500/25 active:scale-[0.98]"
              >
                {searching ? (
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin inline-block" />
                ) : lang === "en" ? (
                  "Open"
                ) : (
                  "खोलें"
                )}
              </button>
            </div>
            {err && (
              <p className="mt-3 text-xs text-rose-600 dark:text-rose-400 text-left font-medium">
                {err}
              </p>
            )}
          </form>

          {/* New Patient Intake prompt */}
          <div className="mt-6 pt-6 border-t border-slate-100 dark:border-slate-800/80 flex flex-wrap items-center justify-center gap-4 text-xs text-slate-500">
            <span>{lang === "en" ? "First time here or need to submit new symptoms?" : "पहली बार आए हैं या नए लक्षण दर्ज करने हैं?"}</span>
            <Link
              href="/intake"
              className="font-semibold text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1"
            >
              {lang === "en" ? "Start Patient Intake →" : "नया रोगी प्रवेश शुरू करें →"}
            </Link>
          </div>
        </div>

        {/* Existing Patients Quick-Select (Demo & Patient convenience) */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              {lang === "en" ? "Or Select a Recent Patient Record" : "या हाल ही के रोगी रिकॉर्ड में से चुनें"}
            </h2>
            <span className="text-xs text-slate-400">
              {patients.length} {lang === "en" ? "records found" : "रिकॉर्ड"}
            </span>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12 text-slate-400 gap-3 text-sm">
              <span className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              {lang === "en" ? "Loading registered patients..." : "रोगी लोड हो रहे हैं..."}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {patients.slice(0, 9).map((p) => (
                <button
                  key={p.id}
                  onClick={() => router.push(`/patient/${p.id}`)}
                  className="group p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 hover:border-blue-500 dark:hover:border-blue-500 hover:shadow-md transition-all text-left flex items-start gap-3.5"
                >
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center text-xs font-bold shrink-0 shadow-sm">
                    {p.synthetic_id.slice(-2)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-sm font-bold text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                        {p.synthetic_id}
                      </span>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500">
                        {p.preferred_language.toUpperCase()}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500 truncate">
                      {p.stats ? `${p.stats.timeline_events} events • ${p.stats.documents} docs` : `Registered ${new Date(p.created_at).toLocaleDateString()}`}
                    </p>
                  </div>
                  <svg
                    className="w-4 h-4 text-slate-300 group-hover:text-blue-500 transition-colors shrink-0 mt-2"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* DPDP Compliance & Privacy Footer Pill */}
        <div className="rounded-2xl border border-emerald-200/80 dark:border-emerald-900/60 bg-emerald-50/50 dark:bg-emerald-950/20 p-4 text-xs text-emerald-800 dark:text-emerald-300 flex items-center gap-3">
          <svg className="w-5 h-5 shrink-0 text-emerald-600 dark:text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            <polyline points="9 12 11 14 15 10" />
          </svg>
          <div>
            <span className="font-semibold">
              {lang === "en" ? "DPDP Act 2023 & Clinical Privacy Compliant" : "DPDP अधिनियम 2023 और गोपनीयता संरक्षित"}:
            </span>{" "}
            {lang === "en"
              ? "All your records and AI analysis are processed on-premises. You maintain complete control to export or permanently purge your health records at any time."
              : "आपका सारा डेटा स्थानीय रूप से संसाधित होता है। आप किसी भी समय अपने रिकॉर्ड डाउनलोड कर सकते हैं या सहमति रद्द करके हटा सकते हैं।"}
          </div>
        </div>
      </div>
    </main>
  );
}

