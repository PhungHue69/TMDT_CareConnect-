from scripts.crawl import normalize_drug, normalize_pharmacy

# Raw payloads recorded 2026-10-20 from api.nhathuoclongchau.com.vn (trimmed).
SHOP = {
    "shopCode": "82862",
    "shopNameDisplay": "Nhà Thuốc FPT Long Châu 209 Trần Hưng Đạo (Đối Diện Cây Xăng Mỹ Long), P. Long Xuyên, Tỉnh An Giang",
    "slugEcom": "he-thong-cua-hang/209-tran-hung-dao-p-long-xuyen-tinh-an-giang",
    "phone": "82862",  # internal shop code, not a phone number
    "location": {
        "address": "209 Trần Hưng Đạo, P. Long Xuyên, Tỉnh An Giang",
        "coordinates": {"latitude": 10.377454, "longitude": 105.440307},
    },
}

OTC = {  # POST .../product/search/cate, filter prescription=false
    "sku": "00021165",
    "name": "ADAZOL 400MG F.T 1X1",
    "image": "https://cdn.nhathuoclongchau.com.vn/v1/static/adazol.png",
    "category": [{"slug": "thuoc", "level": 1}],
    "price": {"measureUnitName": "Hộp", "price": 2800.0},
    "slug": "thuoc/adazol-400mg-ft-1x1-21507.html",
    "ingredients": "Albendazol 400mg",
    "prescription": False,  # injected by crawler from the filter used
}
RX = {  # filter prescription=true; site hides the price of Rx drugs
    "sku": "00502567",
    "name": "CLEDOMOX 625MG TENAMYD 2X7",
    "image": "https://cdn.nhathuoclongchau.com.vn/v1/static/cledomox.jpg",
    "category": [{"slug": "thuoc", "level": 1}],
    "price": {"measureUnitName": "Hộp", "price": None},
    "slug": "thuoc/cledomox-625mg-tenamyd-2x7-36828.html",
    "ingredients": "Clavulanic acid 125mg, Amoxicilina 500mg",
    "prescription": True,
}
TPCN = {
    "sku": "00010637",
    "name": "SỮA BỔ SUNG DINH DƯỠNG CHO NGƯỜI ĐÁI THÁO ĐƯỜNG GLUCERNA ABBOTT 380G",
    "image": "https://cdn.nhathuoclongchau.com.vn/v1/static/glucerna.jpg",
    "category": [{"slug": "thuc-pham-chuc-nang", "level": 1}],
    "price": {"measureUnitName": "Hộp", "price": 445000.0},
    "slug": "thuc-pham-chuc-nang/sua-abbott-glucerna-400g-16384.html",
    "prescription": False,
}


def test_pharmacy_ok():
    assert normalize_pharmacy(SHOP) == {
        "name": SHOP["shopNameDisplay"],
        "address": "209 Trần Hưng Đạo, P. Long Xuyên, Tỉnh An Giang",
        "latitude": 10.377454,
        "longitude": 105.440307,
        "phone": "18006928",
        "source_url": "https://nhathuoclongchau.com.vn/he-thong-cua-hang/209-tran-hung-dao-p-long-xuyen-tinh-an-giang",
    }


def test_pharmacy_missing_coords_or_name():
    no_coord = {**SHOP, "location": {"address": "x", "coordinates": None}}
    zero = {**SHOP, "location": {"address": "x", "coordinates": {"latitude": 0, "longitude": 0}}}
    assert normalize_pharmacy(no_coord) is None
    assert normalize_pharmacy(zero) is None
    assert normalize_pharmacy({**SHOP, "shopNameDisplay": ""}) is None


def test_drug_otc():
    d = normalize_drug(OTC)
    assert d == {
        "name": "ADAZOL 400MG F.T 1X1",
        "active_ingredient": "Albendazol 400mg",
        "category": "OTC",
        "unit": "Hộp",
        "price": 2800,
        "image_url": OTC["image"],
        "source_url": "https://nhathuoclongchau.com.vn/thuoc/adazol-400mg-ft-1x1-21507.html",
    }
    assert isinstance(d["price"], int)


def test_drug_rx_flag_wins_and_unlisted_price_is_zero():
    d = normalize_drug(RX)
    assert d["category"] == "RX"
    assert d["price"] == 0  # ponytail: Rx price hidden by site -> 0 sentinel


def test_drug_tpcn():
    d = normalize_drug(TPCN)
    assert d["category"] == "TPCN"
    assert d["price"] == 445000
    assert d["active_ingredient"] is None


def test_drug_missing_name_or_price():
    assert normalize_drug({**OTC, "name": ""}) is None
    assert normalize_drug({**OTC, "price": {"measureUnitName": "Hộp", "price": None}}) is None
    assert normalize_drug({**TPCN, "price": None}) is None

def test_drug_missing_prescription_key_fails_closed():
    raw = {k: v for k, v in OTC.items() if k != "prescription"}
    assert normalize_drug(raw) is None

def test_check_floor():
    from scripts.crawl import check_floor

    ph = [{"name": "x"}]
    ok = [{"category": c} for c in ("RX", "OTC", "TPCN")]
    assert check_floor(ph, ok) is None
    assert check_floor([], ok) is not None
    assert "RX" in check_floor(ph, ok[1:])
    assert check_floor(ph, {"u": ok[0], "v": ok[1]}) is not None
