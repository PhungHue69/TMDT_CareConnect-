import types

import pytest

from app.packs import allowed_packs

def _d(name):
    return types.SimpleNamespace(name=name)

CLEDO = "CLEDOMOX 625MG TENAMYD 2X7"  # 14/pack
KIPEL = "KIPEL 10MG MEGA 4X7"  # 28/pack
MIDOR = "MIDORHUM OPV 10X10"  # 100/pack
NOPACK = "FLUCONA-DENK 150MG 1V"

@pytest.mark.parametrize(
    "item,name,want",
    [
        ({"quantity": 3, "quantity_unit": "pack"}, CLEDO, 3),
        ({"quantity": 21, "quantity_unit": "unit"}, CLEDO, 2),
        ({"quantity": 14, "quantity_unit": "unit"}, CLEDO, 1),
        ({"quantity": 15, "quantity_unit": "unit"}, CLEDO, 2),
        ({"quantity": 1, "quantity_unit": "unit"}, CLEDO, 1),
        ({"quantity": 28, "quantity_unit": "unit"}, KIPEL, 1),
        ({"quantity": 29, "quantity_unit": "unit"}, KIPEL, 2),
        ({"quantity": 100, "quantity_unit": "unit"}, MIDOR, 1),
        ({"quantity": 101, "quantity_unit": "unit"}, MIDOR, 2),
        ({"quantity": 21, "quantity_unit": "unknown"}, CLEDO, 2),
        ({"quantity": 21}, CLEDO, 2),  # legacy: missing unit == unknown
        ({"quantity": 21, "quantity_unit": "garbage"}, CLEDO, 2),
        ({"quantity": 21, "quantity_unit": "unknown"}, NOPACK, 1),
        ({"quantity": 500, "quantity_unit": "unit"}, NOPACK, 1),
        ({"quantity": 2}, NOPACK, 1),
        ({"quantity": 21, "quantity_unit": "unit"}, "CLEDOMOX 2 x 7", 2),  # spaces around x
        ({"quantity": 15, "quantity_unit": "unit"}, "Cledomox 2x7", 2),  # lowercase x
        ({"quantity": 3, "quantity_unit": "pack"}, NOPACK, 3),
        ({"quantity": 21, "quantity_unit": "pack"}, CLEDO, 2),  # mislabelled units: 21 >= 14
        ({"quantity": 14, "quantity_unit": "pack"}, CLEDO, 1),
        ({"quantity": 13, "quantity_unit": "pack"}, CLEDO, 10),  # < pack size: pack count, capped
        ({"quantity": 11, "quantity_unit": "pack"}, NOPACK, 10),  # unparsable name: capped
        ({"quantity": 10, "quantity_unit": "pack"}, NOPACK, 10),
        ({"quantity": 1, "quantity_unit": "pack"}, NOPACK, 1),
        ({"quantity": 1, "quantity_unit": "pack"}, CLEDO, 1),
        ({"quantity": float("inf"), "quantity_unit": "pack"}, CLEDO, 0),  # OverflowError
        ({"quantity": float("nan")}, CLEDO, 0),
        ({"quantity": True, "quantity_unit": "pack"}, CLEDO, 0),  # bool is not a count
        ({"quantity": True}, CLEDO, 0),
        ({"quantity": "abc", "quantity_unit": "pack"}, CLEDO, 0),
        ({"quantity": "abc"}, CLEDO, 0),
        ({"quantity": 0, "quantity_unit": "unit"}, CLEDO, 0),
        ({"quantity": -5, "quantity_unit": "pack"}, CLEDO, 0),
        ({"quantity": None}, CLEDO, 0),
        ({}, CLEDO, 0),
    ],
)
def test_allowed_packs(item, name, want):
    assert allowed_packs(item, _d(name)) == want

def test_reversed_pack_notation():
    assert allowed_packs({"quantity": 15, "quantity_unit": "unit"}, _d("X 7x2")) == 2
