from uuid import uuid4
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.patient import Patient, Consent
from app.models.intake import IntakeSession, IntakeAnswer
from app.models.document import Document
from app.models.fact import ClinicalFact
from app.models.timeline import TimelineEvent
from app.schemas.patient import PatientCreate, PatientOut, ConsentCreate

router = APIRouter(prefix="/patients", tags=["patients"])


@router.post("", response_model=PatientOut)
def create_patient(payload: PatientCreate, db: Session = Depends(get_db)):
    existing = db.query(Patient).filter_by(synthetic_id=payload.synthetic_id).first()
    if existing:
        raise HTTPException(400, "synthetic_id already exists")
    p = Patient(
        id=str(uuid4()),
        synthetic_id=payload.synthetic_id,
        preferred_language=payload.preferred_language,
    )
    db.add(p)
    db.commit()
    db.refresh(p)
    return p


@router.get("")
def list_patients(db: Session = Depends(get_db)):
    rows = db.query(Patient).order_by(Patient.created_at.desc()).limit(50).all()
    return [
        {
            "id": p.id,
            "synthetic_id": p.synthetic_id,
            "preferred_language": p.preferred_language,
            "created_at": p.created_at,
        }
        for p in rows
    ]


@router.get("/stats")
def list_patients_with_stats(db: Session = Depends(get_db)):
    """Return each patient with a counts summary for the dashboard."""
    rows = db.query(Patient).order_by(Patient.created_at.desc()).limit(50).all()
    out = []
    for p in rows:
        sessions = db.query(func.count(IntakeSession.id)).filter_by(patient_id=p.id).scalar() or 0
        answers = (
            db.query(func.count(IntakeAnswer.id))
            .join(IntakeSession, IntakeAnswer.session_id == IntakeSession.id)
            .filter(IntakeSession.patient_id == p.id)
            .scalar() or 0
        )
        documents = db.query(func.count(Document.id)).filter_by(patient_id=p.id).scalar() or 0
        facts = db.query(func.count(ClinicalFact.id)).filter_by(patient_id=p.id).scalar() or 0
        timeline_events = db.query(func.count(TimelineEvent.id)).filter_by(patient_id=p.id).scalar() or 0
        needs_review = (
            db.query(func.count(TimelineEvent.id))
            .filter(TimelineEvent.patient_id == p.id,
                    TimelineEvent.needs_review == True)  # noqa: E712
            .scalar() or 0
        )
        verified = (
            db.query(func.count(TimelineEvent.id))
            .filter(TimelineEvent.patient_id == p.id,
                    TimelineEvent.verification_status == "verified")
            .scalar() or 0
        )
        out.append({
            "id": p.id,
            "synthetic_id": p.synthetic_id,
            "preferred_language": p.preferred_language,
            "created_at": p.created_at,
            "stats": {
                "sessions": sessions,
                "answers": answers,
                "documents": documents,
                "facts": facts,
                "timeline_events": timeline_events,
                "needs_review": needs_review,
                "verified": verified,
            },
        })
    return out


def _resolve_patient(db: Session, patient_id: str) -> Patient:
    p = db.get(Patient, patient_id)
    if not p:
        p = db.query(Patient).filter(Patient.synthetic_id.ilike(patient_id)).first()
    if not p:
        raise HTTPException(404, "patient not found")
    return p


@router.get("/{patient_id}", response_model=PatientOut)
def get_patient(patient_id: str, db: Session = Depends(get_db)):
    return _resolve_patient(db, patient_id)


@router.get("/{patient_id}/biomarkers")
def get_patient_biomarkers_endpoint(patient_id: str, db: Session = Depends(get_db)):
    """Return longitudinal biomarker trends, trajectory slopes, and clinical thresholds."""
    from app.services.biomarker_trends import get_patient_biomarkers
    try:
        return get_patient_biomarkers(db, patient_id)
    except ValueError:
        raise HTTPException(404, "patient not found")


@router.get("/{patient_id}/export")
def export_patient_data(patient_id: str, db: Session = Depends(get_db)):
    """Export complete patient data package for DPDP Act data portability."""
    import json
    from datetime import datetime
    from fastapi.responses import JSONResponse
    from app.models.summary_draft import SummaryDraft

    p = _resolve_patient(db, patient_id)
    real_id = p.id

    consents = db.query(Consent).filter_by(patient_id=real_id).all()
    events = (
        db.query(TimelineEvent)
        .filter_by(patient_id=real_id)
        .order_by(TimelineEvent.event_date.asc().nullslast())
        .all()
    )
    docs = db.query(Document).filter_by(patient_id=real_id).all()
    facts = db.query(ClinicalFact).filter_by(patient_id=real_id).all()
    drafts = (
        db.query(SummaryDraft)
        .filter_by(patient_id=real_id)
        .order_by(SummaryDraft.version.desc())
        .all()
    )

    data = {
        "export_metadata": {
            "format": "MediGraph-DPDP-Export-v1",
            "exported_at": datetime.utcnow().isoformat() + "Z",
            "jurisdiction": "Digital Personal Data Protection Act 2023 (India)",
        },
        "patient": {
            "id": p.id,
            "synthetic_id": p.synthetic_id,
            "preferred_language": p.preferred_language,
            "created_at": p.created_at.isoformat() if p.created_at else None,
        },
        "consents": [
            {
                "id": c.id,
                "purpose": c.purpose,
                "granted": c.granted,
                "notes": c.notes,
                "created_at": c.created_at.isoformat() if c.created_at else None,
                "revoked_at": c.revoked_at.isoformat() if c.revoked_at else None,
            }
            for c in consents
        ],
        "timeline_events": [
            {
                "id": e.id,
                "date": e.event_date.isoformat() if e.event_date else None,
                "kind": e.kind,
                "label": e.label,
                "value": e.value,
                "normalized": json.loads(e.normalized_json or "{}"),
                "source": e.source,
                "confidence": e.confidence,
                "verification_status": e.verification_status,
            }
            for e in events
        ],
        "documents": [
            {
                "id": d.id,
                "filename": d.filename,
                "file_type": d.file_type,
                "status": d.status,
                "created_at": d.created_at.isoformat() if d.created_at else None,
            }
            for d in docs
        ],
        "clinical_facts_count": len(facts),
        "summary_drafts": [
            {
                "version": dr.version,
                "status": dr.status,
                "actor": dr.actor,
                "narrative": dr.narrative,
                "notes": dr.notes,
                "created_at": dr.created_at.isoformat() if dr.created_at else None,
            }
            for dr in drafts
        ],
    }

    filename = f"medigraph-export-{p.synthetic_id}.json"
    return JSONResponse(
        content=data,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/{patient_id}/consents")
def add_consent(patient_id: str, payload: ConsentCreate, db: Session = Depends(get_db)):
    p = _resolve_patient(db, patient_id)
    c = Consent(
        id=str(uuid4()),
        patient_id=p.id,
        purpose=payload.purpose,
        granted=payload.granted,
        notes=payload.notes,
    )
    db.add(c)
    db.commit()
    db.refresh(c)
    return {"id": c.id, "purpose": c.purpose, "granted": c.granted}


@router.get("/{patient_id}/prescription")
def get_patient_prescription_endpoint(patient_id: str, db: Session = Depends(get_db)):
    """Return structured clinical prescription and care plan JSON for preview."""
    from app.services.prescription_service import extract_patient_prescription_data
    try:
        return extract_patient_prescription_data(db, patient_id)
    except ValueError:
        raise HTTPException(404, "patient not found")


@router.get("/{patient_id}/prescription/pdf")
def get_patient_prescription_pdf_endpoint(patient_id: str, db: Session = Depends(get_db)):
    """Generate and download ABDM & DPDP Act compliant bilingual prescription PDF."""
    from fastapi.responses import Response
    from app.services.prescription_service import (
        extract_patient_prescription_data,
        generate_prescription_pdf,
    )
    try:
        data = extract_patient_prescription_data(db, patient_id)
    except ValueError:
        raise HTTPException(404, "patient not found")

    pdf_bytes = generate_prescription_pdf(data)
    filename = f"Prescription-{data.get('synthetic_id', 'Patient')}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
