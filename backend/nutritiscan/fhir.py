from .database import new_id


def normalized_observation(item):
    """Convert only known equivalent units. Unknown units retain separate series."""
    value = item.model_dump(mode="json") if hasattr(item, "model_dump") else dict(item)
    name = value["name"].strip()
    unit = value["unit"].strip()
    folded = name.casefold()
    if folded in ("hemoglobin", "haemoglobin", "hb", "hgb"):
        name = "Hemoglobin"
        if unit.casefold() in ("g/l", "g/litre", "g/liter"):
            value["value"] /= 10
            for bound in ("reference_low", "reference_high"):
                if value.get(bound) is not None:
                    value[bound] /= 10
            unit = "g/dL"
        elif unit.casefold() == "g/dl":
            unit = "g/dL"
    value.update(name=name, unit=unit)
    return value


def observation(item, owner, source_id=None, resource_id=None):
    v = normalized_observation(item)
    result = {
        "resourceType": "Observation",
        "id": resource_id or new_id(),
        "status": "final",
        "subject": {"reference": f"Patient/{owner}"},
        "code": {"text": v["name"]},
        "effectiveDateTime": v["measured_at"],
        "valueQuantity": {"value": v["value"], "unit": v["unit"]},
        "note": [
            {
                "text": "Patient-confirmed transcription; not clinically validated."
                if source_id
                else "Patient-entered measurement; not clinically validated."
            }
        ],
    }
    if v.get("reference_low") is not None or v.get("reference_high") is not None:
        result["referenceRange"] = [
            {
                k: {"value": v[field], "unit": v["unit"]}
                for k, field in (("low", "reference_low"), ("high", "reference_high"))
                if v.get(field) is not None
            }
        ]
    if source_id:
        result["derivedFrom"] = [{"reference": f"DocumentReference/{source_id}"}]
    return result


def record(item, owner):
    resource_id = new_id()
    subject = {"reference": f"Patient/{owner}"}
    kind = {
        "condition": "Condition",
        "allergy": "AllergyIntolerance",
        "medication": "MedicationStatement",
        "visit": "Encounter",
        "nutrition": "Observation",
    }[item.kind]
    result = {
        "resourceType": kind,
        "id": resource_id,
        "subject" if kind != "AllergyIntolerance" else "patient": subject,
    }
    if kind == "MedicationStatement":
        result.update(
            status="recorded",
            medication={"concept": {"text": item.title}},
            effectiveDateTime=item.date.isoformat(),
        )
    elif kind == "Encounter":
        result.update(
            status="completed",
            actualPeriod={"start": item.date.isoformat()},
            reason=[{"value": [{"concept": {"text": item.title}}]}],
        )
    elif kind == "Observation":
        result.update(
            status="final",
            code={"text": item.title},
            effectiveDateTime=item.date.isoformat(),
            valueString=item.notes or item.title,
        )
    else:
        result.update(code={"text": item.title}, recordedDate=item.date.isoformat())
        if kind == "Condition":
            result["clinicalStatus"] = {
                "coding": [
                    {
                        "system": "http://terminology.hl7.org/CodeSystem/condition-clinical",
                        "code": "active",
                    }
                ]
            }
            result["verificationStatus"] = {
                "coding": [
                    {
                        "system": "http://terminology.hl7.org/CodeSystem/condition-ver-status",
                        "code": "unconfirmed",
                    }
                ]
            }
    result["note"] = [
        {"text": item.notes or "Patient-entered history; not clinically validated."}
    ]
    return result


def label(resource):
    return (
        resource.get("code", {}).get("text")
        or resource.get("medication", {}).get("concept", {}).get("text")
        or resource.get("reason", [{}])[0]
        .get("value", [{}])[0]
        .get("concept", {})
        .get("text")
        or resource["resourceType"]
    )


def resource_date(resource):
    return (
        resource.get("effectiveDateTime")
        or resource.get("recordedDate")
        or resource.get("actualPeriod", {}).get("start")
        or ""
    )
