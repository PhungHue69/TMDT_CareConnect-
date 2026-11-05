from app.models import MasterDrug, Order, Prescription


def _id(db, name):
    return db.query(MasterDrug).filter_by(name=name).one().id


def _rx(db, drug_id, qty=2, input_type="IMAGE", status="APPROVED"):
    p = Prescription(
        patient_id=1,
        input_type=input_type,
        ai_validation_status=status,
        items_json=[{"name": "x", "dosage": "", "quantity": qty, "quantity_unit": "pack", "matched_drug_id": drug_id}],
    )
    db.add(p)
    db.commit()
    return p.id


def _post(client, items, pid=None, **extra):
    return client.post(
        "/orders", json={"pharmacy_id": 1, "prescription_id": pid, "items": items, **extra}
    )


def test_otc_order_ok_and_server_price(client, db):
    para, vitc = _id(db, "Paracetamol 500mg"), _id(db, "Vitamin C 1000mg")
    r = _post(
        client,
        [{"drug_id": para, "quantity": 2, "price": 1}, {"drug_id": vitc, "quantity": 1}],
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["total_amount"] == 15000 * 2 + 80000
    assert body["status"] == "PLACED"
    assert db.get(Order, body["id"]).total_amount == 110000


def test_otc_order_ignores_prescription(client, db):
    para, amox = _id(db, "Paracetamol 500mg"), _id(db, "Amoxicillin 500mg")
    pid = _rx(db, amox)
    assert _post(client, [{"drug_id": para, "quantity": 1}], pid).status_code == 201
    db.expire_all()
    assert db.get(Prescription, pid).used_order_id is None


def test_rx_without_prescription_403(client, db):
    assert _post(client, [{"drug_id": _id(db, "Amoxicillin 500mg"), "quantity": 1}]).status_code == 403


def test_rx_with_text_prescription_403(client, db):
    amox = _id(db, "Amoxicillin 500mg")
    r = _post(client, [{"drug_id": amox, "quantity": 1}], _rx(db, amox, input_type="TEXT"))
    assert r.status_code == 403


def test_rx_with_rejected_prescription_403(client, db):
    amox = _id(db, "Amoxicillin 500mg")
    r = _post(client, [{"drug_id": amox, "quantity": 1}], _rx(db, amox, status="REJECTED_NOT_RX"))
    assert r.status_code == 403


def test_rx_not_on_prescription_403(client, db):
    amox = _id(db, "Amoxicillin 500mg")
    r = _post(client, [{"drug_id": amox, "quantity": 1}], _rx(db, _id(db, "Paracetamol 500mg")))
    assert r.status_code == 403


def test_ai_approved_photo_cannot_directly_create_rx_order_without_pharmacist_review(client, db):
    amox = _id(db, "Amoxicillin 500mg")
    pid = _rx(db, amox)
    r = _post(client, [{"drug_id": amox, "quantity": 1}], pid)
    assert r.status_code == 403
    assert "dược sĩ" in r.json()["detail"].lower()


def test_rx_quantity_over_403(client, db):
    amox = _id(db, "Amoxicillin 500mg")
    r = _post(client, [{"drug_id": amox, "quantity": 3}], _rx(db, amox, qty=2))
    assert r.status_code == 403


def test_unknown_prescription_cannot_authorize_direct_rx_order(client, db):
    amox = _id(db, "Amoxicillin 500mg")
    assert _post(client, [{"drug_id": amox, "quantity": 1}], 9999).status_code == 403


def test_rx_image_cannot_create_order_or_consume_prescription(client, db):
    amox = _id(db, "Amoxicillin 500mg")
    pid = _rx(db, amox, qty=2)
    items = [{"drug_id": amox, "quantity": 2}]
    assert _post(client, items, pid).status_code == 403
    db.expire_all()
    assert db.get(Prescription, pid).used_order_id is None
    assert db.query(Order).count() == 0


def test_unknown_drug_404(client):
    assert _post(client, [{"drug_id": 99999, "quantity": 1}]).status_code == 404


def test_out_of_stock_product_cannot_be_ordered(client, db):
    from app.models import PharmacyStock
    para = _id(db, "Paracetamol 500mg")
    db.query(PharmacyStock).filter_by(pharmacy_id=1, drug_id=para).delete()
    db.commit()
    assert _post(client, [{"drug_id": para, "quantity": 1}]).status_code == 409


def test_unknown_pharmacy_404(client, db):
    r = client.post(
        "/orders",
        json={"pharmacy_id": 99999, "items": [{"drug_id": _id(db, "Paracetamol 500mg"), "quantity": 1}]},
    )
    assert r.status_code == 404


def test_bad_quantity_422(client, db):
    assert _post(client, [{"drug_id": _id(db, "Paracetamol 500mg"), "quantity": 0}]).status_code == 422

def test_quantity_over_max_422(client, db):
    assert _post(client, [{"drug_id": _id(db, "Paracetamol 500mg"), "quantity": 1001}]).status_code == 422

def test_rx_same_drug_two_lines_sum_over_403(client, db):
    amox = _id(db, "Amoxicillin 500mg")
    pid = _rx(db, amox, qty=3)
    r = _post(client, [{"drug_id": amox, "quantity": 2}, {"drug_id": amox, "quantity": 2}], pid)
    assert r.status_code == 403
    db.expire_all()
    assert db.get(Prescription, pid).used_order_id is None

def test_rx_same_drug_two_lines_within_old_limit_still_requires_pharmacist(client, db):
    amox = _id(db, "Amoxicillin 500mg")
    pid = _rx(db, amox, qty=3)
    r = _post(client, [{"drug_id": amox, "quantity": 1}, {"drug_id": amox, "quantity": 1}], pid)
    assert r.status_code == 403

def test_rx_nonnumeric_item_quantity_authorises_nothing(client, db):
    amox = _id(db, "Amoxicillin 500mg")
    pid = _rx(db, amox, qty="abc")
    assert _post(client, [{"drug_id": amox, "quantity": 1}], pid).status_code == 403

# --- pack-based Rx quantity (spec 2026-10-20-ui-redesign section 6) ---

def _packed(db, name="CLEDOMOX 625MG TENAMYD 2X7"):
    d = MasterDrug(name=name, category="RX", unit="hộp", price=0)
    db.add(d)
    db.commit()
    return d.id

def _rx_items(db, *items):
    p = Prescription(patient_id=1, input_type="IMAGE", ai_validation_status="APPROVED", items_json=list(items))
    db.add(p)
    db.commit()
    return p.id

def test_rx_units_converted_to_packs_ok(client, db):
    d = _packed(db)  # 14/pack: 21 units -> 2 packs
    pid = _rx_items(db, {"name": "x", "quantity": 21, "quantity_unit": "unit", "matched_drug_id": d})
    assert _post(client, [{"drug_id": d, "quantity": 2}], pid).status_code == 403

def test_rx_units_converted_to_packs_over_403(client, db):
    d = _packed(db)
    pid = _rx_items(db, {"name": "x", "quantity": 21, "quantity_unit": "unit", "matched_drug_id": d})
    assert _post(client, [{"drug_id": d, "quantity": 3}], pid).status_code == 403

def test_rx_pack_unit_allows_quantity(client, db):
    d = _packed(db)
    pid = _rx_items(db, {"name": "x", "quantity": 3, "quantity_unit": "pack", "matched_drug_id": d})
    assert _post(client, [{"drug_id": d, "quantity": 3}], pid).status_code == 403

def test_rx_pack_unit_over_403(client, db):
    d = _packed(db)
    pid = _rx_items(db, {"name": "x", "quantity": 3, "quantity_unit": "pack", "matched_drug_id": d})
    assert _post(client, [{"drug_id": d, "quantity": 4}], pid).status_code == 403

def test_rx_legacy_item_without_unit_is_unknown(client, db):
    d = _packed(db)
    pid = _rx_items(db, {"name": "x", "quantity": 21, "matched_drug_id": d})
    assert _post(client, [{"drug_id": d, "quantity": 3}], pid).status_code == 403
    assert _post(client, [{"drug_id": d, "quantity": 2}], pid).status_code == 403

def test_rx_unparsable_name_unit_allows_one_pack(client, db):
    d = _packed(db, "FLUCONA-DENK 150MG 1V")
    pid = _rx_items(db, {"name": "x", "quantity": 7, "quantity_unit": "unit", "matched_drug_id": d})
    assert _post(client, [{"drug_id": d, "quantity": 2}], pid).status_code == 403
    assert _post(client, [{"drug_id": d, "quantity": 1}], pid).status_code == 403

def test_rx_pack_duplicate_lines_summed(client, db):
    d = _packed(db)
    pid = _rx_items(db, {"name": "x", "quantity": 21, "quantity_unit": "unit", "matched_drug_id": d})
    over = [{"drug_id": d, "quantity": 2}, {"drug_id": d, "quantity": 1}]
    assert _post(client, over, pid).status_code == 403
    ok = [{"drug_id": d, "quantity": 1}, {"drug_id": d, "quantity": 1}]
    assert _post(client, ok, pid).status_code == 403

def test_rx_two_prescription_items_same_drug_sum_packs(client, db):
    d = _packed(db)
    pid = _rx_items(
        db,
        {"name": "x", "quantity": 14, "quantity_unit": "unit", "matched_drug_id": d},
        {"name": "x", "quantity": 1, "quantity_unit": "pack", "matched_drug_id": d},
    )
    assert _post(client, [{"drug_id": d, "quantity": 3}], pid).status_code == 403
    assert _post(client, [{"drug_id": d, "quantity": 2}], pid).status_code == 403

def test_rx_pack_label_with_unit_count_is_converted(client, db):
    d = _packed(db)  # Gemini mislabelled "21 viên" as pack: 21 >= 14/pack -> 2 packs
    pid = _rx_items(db, {"name": "x", "quantity": 21, "quantity_unit": "pack", "matched_drug_id": d})
    assert _post(client, [{"drug_id": d, "quantity": 3}], pid).status_code == 403
    assert _post(client, [{"drug_id": d, "quantity": 2}], pid).status_code == 403
