"""Deterministic clinical entity extraction from verified OCR text."""
from __future__ import annotations

import re
from datetime import datetime
from typing import Optional

from app.services.drug_resolver import resolve_many

FREQ_MAP = {
    "od": "OD", "qd": "OD", "once daily": "OD", "00": "OD",
    "bd": "BD", "bid": "BD", "twice daily": "BD",
    "tds": "TDS", "tid": "TDS", "ttd": "TDS", "thrice daily": "TDS",
    "qid": "QID", "four times daily": "QID",
    "hs": "HS", "at bedtime": "HS",
    "sos": "SOS", "prn": "SOS",
    "stat": "STAT",
}

MED_CHUNK = re.compile(
    r"^\s*(?:-?\s*(?:T|Tab|Cap|Syp|Inj)\.?\s+)?"
    r"([A-Z][a-zA-Z]{2,})\s+"
    r"(\d+(?:\.\d+)?)\s*"
    r"(mg|mcg|g|ml|my|mgs?)\b"
    r"(.*)$",
    re.IGNORECASE,
)

_SPLIT_LOOKAHEAD = re.compile(
    r"\s+(?=(?:-?\s*(?:T|Tab|Cap|Syp|Inj)\.?\s+)?"
    r"[A-Z][a-zA-Z]{2,}\s+\d+(?:\.\d+)?\s*(?:mg|mcg|g|ml|my|mgs?)\b)"
)

_TYPICAL_MG = {
    "Metoprolol": (25, 200), "Oxprenolol": (20, 320), "Atenolol": (25, 100),
    "Propranolol": (10, 320), "Cimetidine": (200, 800), "Ranitidine": (75, 300),
    "Omeprazole": (10, 40), "Pantoprazole": (20, 80), "Etizolam": (0.25, 1.5),
    "Clonazepam": (0.25, 2), "Alprazolam": (0.25, 2), "Metformin": (250, 2000),
    "Amlodipine": (2.5, 10), "Atorvastatin": (5, 80), "Paracetamol": (325, 1000),
    "Ibuprofen": (200, 800), "Azithromycin": (250, 500), "Cetirizine": (5, 20),
    "Dorzolamide": (5, 20), "Etizolam": (0.25, 1.5),
    "Dexmedetomidine": (0.1, 1.5),  # mcg/kg, flag anything above
}


def _norm_unit(u: str) -> str:
    u = u.lower()
    return "mg" if u in ("my", "mgs") else u


def _extract_freq(tail: str) -> tuple[Optional[str], Optional[str]]:
    t = " " + tail.lower() + " "
    freq = None
    for k, v in FREQ_MAP.items():
        if re.search(rf"(?<![a-z]){re.escape(k)}(?![a-z])", t):
            freq = v
            break
    dur = None
    m = re.search(r"(?:ÃƒÆ’Ã¢â‚¬â€|x|for)\s*(\d+)\s*(day|days|week|weeks|month|months)", t)
    if m:
        dur = f"{m.group(1)} {m.group(2)}"
    return freq, dur


def _sanity(generic: str, val: float, unit: str) -> tuple[bool, Optional[str]]:
    if unit != "mg":
        return False, None
    rng = _TYPICAL_MG.get(generic)
    if rng and not (rng[0] <= val <= rng[1]):
        return True, f"{generic} {val}{unit} outside typical {rng[0]}-{rng[1]} mg"
    return False, None


def _split_med_chunks(text: str) -> list[str]:
    """Split single-line or multi-line med text into one-med chunks."""
    if not text:
        return []
    text = text.replace("\r", "")
    chunks: list[str] = []
    for line in text.split("\n"):
        if not line.strip():
            continue
        parts = _SPLIT_LOOKAHEAD.split(line)
        for p in parts:
            if p.strip():
                chunks.append(p.strip())
    return chunks


def extract_medications(text: str) -> list[dict]:
    chunks = _split_med_chunks(text or "")
    matches = []
    for chunk in chunks:
        m = MED_CHUNK.match(chunk)
        if m:
            matches.append((m, chunk))
    if not matches:
        return []

    brands = [m.group(1) for m, _ in matches]
    resolved = resolve_many(brands)

    facts = []
    for m, chunk in matches:
        raw = m.group(1)
        val = float(m.group(2))
        unit = _norm_unit(m.group(3))
        freq, dur = _extract_freq(m.group(4) or "")

        r = resolved.get(raw.strip().lower(), {})
        generic = r.get("generic") or raw
        dclass = r.get("class")
        conf = r.get("confidence", 0.5)
        source = r.get("source", "unknown")

        susp, reason = _sanity(generic, val, unit)
        is_brand = generic.lower() != raw.lower()

        facts.append({
            "kind": "medication",
            "label": generic,
            "value": f"{val}{unit}" + (f" {freq}" if freq else "") +
                     (f" ÃƒÆ’Ã¢â‚¬â€ {dur}" if dur else ""),
            "unit": unit,
            "normalized": {
                "brand": raw if is_brand else None,
                "generic": generic if is_brand else None,
                "dose_value": val, "dose_unit": unit,
                "frequency": freq, "duration": dur, "drug_class": dclass,
                "resolved_by": source,
                "suspicious_dose": susp, "suspicious_reason": reason,
            },
            "source_text": chunk,
            "confidence": 0.5 if susp else conf,
            "needs_review": susp or conf < 0.9 or source == "unknown",
        })
    return facts


def extract_demographics(text: str) -> list[dict]:
    facts = []
    m = re.search(r"\bage\b[^\d]{0,8}(\d{1,3})", text or "", re.IGNORECASE)
    if m:
        age = int(m.group(1))
        if 0 < age <= 120:
            facts.append({"kind": "demographic", "label": "age", "value": str(age),
                          "normalized": {"age": age}, "source_text": m.group(0),
                          "confidence": 0.9, "needs_review": False})
    m = re.search(r"\b(male|female|man|woman)\b", text or "", re.IGNORECASE)
    if m:
        g = m.group(1).lower()
        gender = "male" if g in ("male", "man") else "female"
        facts.append({"kind": "demographic", "label": "gender", "value": gender,
                      "normalized": {"gender": gender}, "source_text": m.group(0),
                      "confidence": 0.85, "needs_review": False})
    return facts


def extract_date(text: str) -> Optional[dict]:
    for pat, kind in (
        (r"\b(\d{4})-(\d{2})-(\d{2})\b", "ymd"),
        (r"\b(\d{2})[-/](\d{2})[-/](\d{4})\b", "dmy"),
        (r"\b(\d{2})[-/](\d{2})[-/](\d{2})\b", "dmy2"),
        (r"\b(\d{8})\b", "dmy8"),
    ):
        m = re.search(pat, text or "")
        if not m:
            continue
        try:
            if kind == "ymd":
                y, mo, d = m.groups()
                dt = datetime(int(y), int(mo), int(d))
            elif kind == "dmy":
                d, mo, y = m.groups()
                dt = datetime(int(y), int(mo), int(d))
            elif kind == "dmy2":
                d, mo, y = m.groups()
                yi = int(y)
                yi = 2000 + yi if yi < 50 else 1900 + yi
                dt = datetime(yi, int(mo), int(d))
            else:
                s = m.group(1)
                dt = datetime(int(s[4:]), int(s[2:4]), int(s[:2]))
            if 1990 <= dt.year <= 2030:
                return {"kind": "date", "label": "issue_date",
                        "value": dt.strftime("%Y-%m-%d"),
                        "normalized": {"iso": dt.strftime("%Y-%m-%d"),
                                       "raw": m.group(0)},
                        "source_text": m.group(0), "confidence": 0.9,
                        "needs_review": False, "fact_date": dt}
        except ValueError:
            continue
    return None


def extract_labs_and_vitals(text: str) -> list[dict]:
    """Extract clinical biomarkers & vital signs from verified OCR text."""
    facts = []
    t = text or ""

    # Blood Pressure: 130/85, BP 120/80
    bp_m = re.search(r"\b(?:bp|blood\s*pressure)\s*[:=-]?\s*(\d{2,3})\s*[/xX]\s*(\d{2,3})\s*(?:mm\s*hg)?\b", t, re.I)
    if bp_m:
        sys_val = int(bp_m.group(1))
        dia_val = int(bp_m.group(2))
        facts.append({
            "kind": "vital",
            "label": "Blood Pressure",
            "value": f"{sys_val}/{dia_val} mmHg",
            "normalized": {"systolic": sys_val, "diastolic": dia_val, "unit": "mmHg"},
            "source_text": bp_m.group(0),
            "confidence": 0.95,
            "needs_review": False,
        })

    # Glucose / Sugar: FBS 110 mg/dL, Blood Sugar: 140
    glu_m = re.search(r"\b(?:fbs|rbs|ppbs|blood\s*sugar|glucose)\s*[:=-]?\s*(\d{2,3}(?:\.\d+)?)\s*(?:mg\s*/\s*dl)?\b", t, re.I)
    if glu_m:
        g_val = float(glu_m.group(1))
        facts.append({
            "kind": "lab_value",
            "label": "Fasting Blood Glucose",
            "value": f"{g_val} mg/dL",
            "normalized": {"value": g_val, "unit": "mg/dL"},
            "source_text": glu_m.group(0),
            "confidence": 0.92,
            "needs_review": False,
        })

    # Serum Creatinine: S. Creatinine 1.2 mg/dL
    cr_m = re.search(r"\b(?:s\.?\s*creatinine|serum\s*creatinine|creatinine)\s*[:=-]?\s*(\d{1,2}(?:\.\d+)?)\s*(?:mg\s*/\s*dl)?\b", t, re.I)
    if cr_m:
        cr_val = float(cr_m.group(1))
        facts.append({
            "kind": "lab_value",
            "label": "Serum Creatinine",
            "value": f"{cr_val} mg/dL",
            "normalized": {"value": cr_val, "unit": "mg/dL"},
            "source_text": cr_m.group(0),
            "confidence": 0.92,
            "needs_review": False,
        })

    # Total Cholesterol
    chol_m = re.search(r"\b(?:total\s*cholesterol|cholesterol)\s*[:=-]?\s*(\d{2,3})\s*(?:mg\s*/\s*dl)?\b", t, re.I)
    if chol_m:
        ch_val = int(chol_m.group(1))
        facts.append({
            "kind": "lab_value",
            "label": "Total Cholesterol",
            "value": f"{ch_val} mg/dL",
            "normalized": {"value": ch_val, "unit": "mg/dL"},
            "source_text": chol_m.group(0),
            "confidence": 0.90,
            "needs_review": False,
        })

    # Pulse / Heart rate: Pulse: 78 bpm
    pulse_m = re.search(r"\b(?:pulse|heart\s*rate|hr)\s*[:=-]?\s*(\d{2,3})\s*(?:bpm|/min)?\b", t, re.I)
    if pulse_m:
        p_val = int(pulse_m.group(1))
        facts.append({
            "kind": "vital",
            "label": "Pulse Rate",
            "value": f"{p_val} bpm",
            "normalized": {"value": p_val, "unit": "bpm"},
            "source_text": pulse_m.group(0),
            "confidence": 0.92,
            "needs_review": False,
        })

    return facts


def extract_all(text: str) -> list[dict]:
    facts = []
    facts.extend(extract_medications(text))
    facts.extend(extract_demographics(text))
    facts.extend(extract_labs_and_vitals(text))
    d = extract_date(text)
    if d:
        facts.append(d)
    return facts