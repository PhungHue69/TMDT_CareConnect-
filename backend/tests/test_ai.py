from app.models import Prescription

URL = "/prescriptions/analyze"
APPROVED = {
    "status": "APPROVED",
    "raw_text": "BS Nguyen - Amoxicillin 500mg",
    "items": [
        {"name": "Amoxicillin 500mg", "dosage": "2 vien/ngay", "quantity": 2},
        {"name": "Thuốc XYZ không tồn tại", "dosage": "1 vien", "quantity": 1},
    ],
}
JPG = ("d.jpg", b"\xff\xd8\xff\xe0data", "image/jpeg")


def test_reject_symptom_request(client, fake_gemini):
    fake_gemini({"status": "REJECTED_NOT_RX", "raw_text": "", "items": []})
    r = client.post(URL, data={"text": "Sốt cao đau họng kê kháng sinh giúp em"}).json()
    assert r["status"] == "REJECTED_NOT_RX" and r["redirect"] == "DOCTOR" and r["items"] == []
    assert r["message"] == "Theo Luật Dược, chúng tôi không thể kê đơn. Vui lòng tư vấn Bác sĩ."
    assert r["can_unlock_rx"] is False and not r.get("otc_hint")


def test_reject_otc_hint(client, fake_gemini):
    fake_gemini({"status": "REJECTED_NOT_RX", "raw_text": "", "items": [], "otc_hint": True})
    r = client.post(URL, data={"text": "đau đầu mua Panadol"}).json()
    assert r["otc_hint"] is True
    assert r["message"].endswith(" Bạn cũng có thể xem danh mục thuốc không kê đơn.")


def test_otc_hint_ignored_unless_rejected(client, fake_gemini):
    fake_gemini({**APPROVED, "otc_hint": True})
    r = client.post(URL, files={"image": JPG}).json()
    assert not r.get("otc_hint")


def test_rejected_items_forced_empty(client, fake_gemini):
    fake_gemini({"status": "REJECTED_NOT_RX", "raw_text": "", "items": APPROVED["items"]})
    assert client.post(URL, data={"text": "x"}).json()["items"] == []


def test_gemini_error_fails_closed(client, fake_gemini):
    fake_gemini(RuntimeError("boom"))
    r = client.post(URL, data={"text": "x"}).json()
    assert r["status"] == "UNREADABLE" and r["can_unlock_rx"] is False
    assert r["message"] == "Không đọc được đơn thuốc. Vui lòng chụp lại rõ hơn."


def test_garbage_json_fails_closed(client, fake_gemini):
    fake_gemini({"status": "MAYBE"})
    assert client.post(URL, data={"text": "x"}).json()["status"] == "UNREADABLE"


def test_non_dict_fails_closed(client, fake_gemini):
    fake_gemini(["APPROVED"])
    assert client.post(URL, files={"image": JPG}).json()["status"] == "UNREADABLE"


def test_approved_without_items_fails_closed(client, fake_gemini):
    fake_gemini({"status": "APPROVED", "raw_text": "", "items": []})
    assert client.post(URL, files={"image": JPG}).json()["can_unlock_rx"] is False


def test_text_approved_cannot_unlock(client, fake_gemini):
    fake_gemini(APPROVED)
    r = client.post(URL, data={"text": "Amoxicillin 500mg x2"}).json()
    assert r["status"] == "APPROVED" and r["input_type"] == "TEXT"
    assert r["can_unlock_rx"] is False
    assert r["message"] == "Cần tải ảnh đơn thuốc để mua thuốc kê đơn."


def test_image_approved_unlocks_and_matches(client, fake_gemini):
    fake_gemini(APPROVED)
    r = client.post(URL, files={"image": JPG}).json()
    assert r["can_unlock_rx"] is True and r["input_type"] == "IMAGE"
    assert r["items"][0]["matched_drug_id"] is not None
    assert r["items"][1]["matched_drug_id"] is None


def test_image_wins_over_text(client, fake_gemini):
    fake_gemini(APPROVED)
    r = client.post(URL, data={"text": "abc"}, files={"image": JPG}).json()
    assert r["input_type"] == "IMAGE"


def test_bad_inputs_400(client):
    assert client.post(URL, data={"text": "  "}).status_code == 400
    assert client.post(URL).status_code == 400
    assert client.post(URL, files={"image": ("a.txt", b"hi", "text/plain")}).status_code == 400
    big = ("a.jpg", b"0" * (10 * 1024 * 1024 + 1), "image/jpeg")
    assert client.post(URL, files={"image": big}).status_code == 400


def test_prescription_persisted(client, db, fake_gemini):
    fake_gemini(APPROVED)
    r = client.post(URL, files={"image": JPG}).json()
    rows = db.query(Prescription).all()
    assert len(rows) == 1 and rows[0].id == r["id"]
    assert rows[0].ai_validation_status == "APPROVED" and rows[0].input_type == "IMAGE"
    assert rows[0].patient_id == 1
    assert rows[0].items_json[0]["matched_drug_id"] is not None


def _m(name, drugs):
    from app import ai

    return ai.match_drugs([{"name": name}], drugs)[0]["matched_drug_id"]


def test_match_requires_same_strength(db):
    from app.models import MasterDrug

    drugs = db.query(MasterDrug).all()
    assert _m("Amoxicillin 250mg", drugs) is None
    assert _m("Paracetamol 650mg", drugs) is None
    assert _m("Amoxicillin", drugs) is None  # no strength vs catalog with strength
    assert _m("amoxicillin  500 mg", drugs) is not None


def test_match_no_digits_and_duplicates():
    from types import SimpleNamespace as D

    drugs = [D(id=7, name="Vitamin C", active_ingredient=None), D(id=3, name="vitamin c", active_ingredient=None),
             D(id=9, name="Zinc 10mg", active_ingredient=None)]
    assert _m("Vitamin  C", drugs) == 3  # no digits: fuzzy as before; dup -> lowest id
    assert _m("Zinc 10 mg", drugs) == 9
    assert _m("Zinc 20mg", drugs) is None


# --- quantity_unit / max_packs (spec 2026-10-20-ui-redesign section 6) ---

def _gem(items):
    return {"status": "APPROVED", "raw_text": "r", "items": items}

def test_prompt_and_schema_mention_quantity_unit():
    from app import ai

    assert "quantity_unit" in ai.SYSTEM_PROMPT
    props = ai.RESPONSE_SCHEMA["properties"]["items"]["items"]["properties"]
    assert set(props["quantity_unit"]["enum"]) == {"pack", "unit", "unknown"}

def test_result_has_max_packs_and_unit(client, db, fake_gemini):
    from app.models import MasterDrug

    d = MasterDrug(name="CLEDOMOX 625MG TENAMYD 2X7", category="RX", unit="hộp", price=0)
    db.add(d)
    db.commit()
    fake_gemini(_gem([
        {"name": "CLEDOMOX 625MG TENAMYD 2X7", "dosage": "", "quantity": 21, "quantity_unit": "unit"},
        {"name": "Thuốc XYZ không tồn tại", "dosage": "", "quantity": 1, "quantity_unit": "pack"},
    ]))
    r = client.post(URL, files={"image": JPG}).json()
    a, b = r["items"]
    assert a["matched_drug_id"] == d.id and a["quantity_unit"] == "unit" and a["max_packs"] == 2
    assert b["matched_drug_id"] is None and b["quantity_unit"] == "pack" and b["max_packs"] is None
    assert db.query(Prescription).one().items_json[0]["quantity_unit"] == "unit"

def test_pack_unit_max_packs_is_quantity(client, fake_gemini):
    fake_gemini(_gem([{"name": "Amoxicillin 500mg", "dosage": "", "quantity": 3, "quantity_unit": "pack"}]))
    assert client.post(URL, files={"image": JPG}).json()["items"][0]["max_packs"] == 3

def test_missing_quantity_unit_defaults_unknown(client, fake_gemini):
    fake_gemini(APPROVED)  # items carry no quantity_unit
    r = client.post(URL, files={"image": JPG}).json()
    assert r["status"] == "APPROVED"
    assert [i["quantity_unit"] for i in r["items"]] == ["unknown", "unknown"]
    assert r["items"][0]["max_packs"] == 1  # Amoxicillin 500mg: no NxM -> 1 pack

def test_invalid_quantity_unit_defaults_unknown(client, fake_gemini):
    fake_gemini(_gem([{"name": "Amoxicillin 500mg", "dosage": "", "quantity": 2, "quantity_unit": "viên nang"}]))
    r = client.post(URL, files={"image": JPG}).json()
    assert r["status"] == "APPROVED" and r["items"][0]["quantity_unit"] == "unknown"

def test_null_quantity_unit_defaults_unknown(client, fake_gemini):
    fake_gemini(_gem([{"name": "Amoxicillin 500mg", "dosage": "", "quantity": 2, "quantity_unit": None}]))
    r = client.post(URL, files={"image": JPG}).json()
    assert r["status"] == "APPROVED" and r["items"][0]["quantity_unit"] == "unknown"

def test_gemini_failure_is_logged(client, fake_gemini, caplog):
    fake_gemini(RuntimeError("quota"))
    client.post(URL, data={"text": "x"})
    assert "failing closed" in caplog.text


def test_match_drugs_unit(db):
    from app import ai
    from app.models import MasterDrug

    out = ai.match_drugs(
        [{"name": "AMOXICILLIN 500MG"}, {"name": "zzz"}], db.query(MasterDrug).all()
    )
    assert out[0]["matched_drug_id"] is not None and out[1]["matched_drug_id"] is None

def test_text_too_long_400(client):
    assert client.post(URL, data={"text": "a" * 4001}).status_code == 400
    assert client.post(URL, data={"text": "a" * 4000}).status_code == 200  # UNREADABLE (no key), not rejected

# --- real catalog (backend/data/drugs.json) ---
def _real():
    import json
    from pathlib import Path
    from types import SimpleNamespace as D

    rows = json.loads((Path(__file__).parent.parent / "data" / "drugs.json").read_text(encoding="utf-8"))
    return [D(id=i, **r) for i, r in enumerate(rows, 1)]

def _rname(i):
    return next(d.name for d in _real() if d.id == i)

def test_real_catalog_prescription_names_match():
    drugs = _real()
    assert _rname(_m("Cledomox 625mg", drugs)) == "CLEDOMOX 625MG TENAMYD 2X7"
    assert _rname(_m("Kipel 10mg", drugs)) == "KIPEL 10MG MEGA 4X7"
    assert _rname(_m("Zanimex 500mg", drugs)) == "ZANIMEX 500MG IMEXPHARM 2X5"
    assert _rname(_m("Zanimex 250 mg", drugs)) == "ZANIMEX 250MG IMEXPHARM 2X5"
    assert _rname(_m("Flucona-Denk 150mg", drugs)) == "FLUCONA-DENK 150MG 1V"

def test_real_catalog_generic_name_matches_single_ingredient():
    drugs = _real()
    assert _rname(_m("Levofloxacin 500mg", drugs)) == "LECIFEX 500MG ABBOTT 2X10"
    assert _rname(_m("Fluconazole 150mg", drugs)) == "FLUCONA-DENK 150MG 1V"
    assert _rname(_m("Montelukast 10mg", drugs)) == "KIPEL 10MG MEGA 4X7"

def test_real_catalog_wrong_or_missing_strength_none():
    drugs = _real()
    assert _m("Cledomox 250mg", drugs) is None
    assert _m("Cledomox", drugs) is None
    assert _m("Levofloxacin 750mg", drugs) is None

def test_similar_drug_names_do_not_cross_match():
    from types import SimpleNamespace as D

    drugs = [D(id=1, name="Ampicillin 500mg", active_ingredient="Ampicillin")]
    assert _m("Amoxicillin 500mg", drugs) is None

def test_mg_vs_g_and_pack_sizes():
    from types import SimpleNamespace as D

    drugs = [D(id=1, name="Foo 5g 2x7", active_ingredient=None)]
    assert _m("Foo 5mg", drugs) is None
    assert _m("Foo 5g", drugs) == 1
    assert _m("Foo 5,0 g", drugs) == 1

def test_combination_strengths_order_insensitive():
    from types import SimpleNamespace as D

    drugs = [D(id=4, name="Combi 875mg/125mg 2X7", active_ingredient="A 875mg, B 125mg")]
    assert _m("Combi 125mg/875mg", drugs) == 4
    assert _m("Combi 875mg", drugs) is None

def test_ambiguous_generic_is_none():
    from types import SimpleNamespace as D

    drugs = [D(id=1, name="Aaa 500mg", active_ingredient="Cefuroxime 500mg"),
             D(id=2, name="Bbb 500mg", active_ingredient="Cefuroxime 500mg")]
    assert _m("Cefuroxime 500mg", drugs) is None

# --- full-name matching (probes from re-review) ---
def _cat(*pairs):
    from types import SimpleNamespace as D

    return [D(id=i, name=n, active_ingredient=a) for i, (n, a) in enumerate(pairs, 1)]

def test_similar_names_never_cross_match():
    probes = [
        ("Acid folic 5mg", ("Acid fusidic 5mg", "Acid fusidic 5mg")),
        ("Vitamin B 500mg", ("Vitamin C 500mg", "Ascorbic acid 500mg")),
        ("Co-trimoxazole 480mg", ("Co-Amoxiclav 480mg", None)),
        ("Amoxicillin 500mg", ("Amoxicillin + Sulbactam 500mg", None)),
        ("Tobramycin 0.3%", ("Tobramycin Dexamethason 0.3%", None)),
        ("Prednisone 5mg", ("Prednisolone 5mg", "Prednisolone 5mg")),
        ("Omeprazole 20mg", ("Esomeprazole 20mg", "Esomeprazole 20mg")),
        ("Amoxicillin 500mg", ("Amoxicillin Clavulanate 500mg", "Amoxicillin 500mg")),
    ]
    for item, entry in probes:
        assert _m(item, _cat(entry)) is None, (item, entry)

def test_full_name_positive_cases():
    drugs = _cat(
        ("Amoxicillin + Sulbactam 500mg", None),
        ("Amoxicillin 500mg Stada 2X10", "Amoxicillin 500mg"),
        ("Tobramycin Dexamethason 0.3%", None),
        ("Tobramycin 0.3% Traphaco 6ML", "Tobramycin 0.3%"),
        ("Vitamin B 500mg", None),
        ("Vitamin C 500mg", None),
    )
    assert _m("Amoxicillin 500mg", drugs) == 2
    assert _m("Tobramycin 0.3%", drugs) == 4
    assert _m("vitamin b 500 mg", drugs) == 5
    assert _m("Vitamin C 500mg", drugs) == 6

def test_real_catalog_more_generics():
    drugs = _real()
    assert _rname(_m("Cefuroxime 250mg", drugs)) == "ZANIMEX 250MG IMEXPHARM 2X5"
    assert _rname(_m("Salbutamol 5mg", drugs)) == "VINSALMOL 5MG/2.5ML VINPHACO 2X5 ỐNG"
    assert _rname(_m("Salbutamol 2.5mg", drugs)) == "VINSALMOL 2.5MG/2.5ML VINPHACO 2X5 ỐNG"
    assert _m("Salbutamol 50mg", drugs) is None
