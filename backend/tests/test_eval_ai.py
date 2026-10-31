import pytest

from scripts import eval_ai

REJ = {"status": "REJECTED_NOT_RX", "raw_text": "", "items": []}
UNREADABLE = {"status": "UNREADABLE", "raw_text": "", "items": []}
OK = {"status": "APPROVED", "raw_text": "BS A", "items": [{"name": "Amoxicillin 500mg", "dosage": "1", "quantity": 1}]}

@pytest.fixture(autouse=True)
def key(monkeypatch, tmp_path):
    monkeypatch.setenv("GEMINI_API_KEY", "x")
    monkeypatch.setattr(eval_ai, "IMAGES_DIR", tmp_path)  # empty by default

def stub(monkeypatch, fn):
    monkeypatch.setattr("app.ai.call_gemini", fn)

def test_all_blocked(monkeypatch, capsys):
    stub(monkeypatch, lambda *a: REJ)
    assert eval_ai.main([]) == 0
    out = capsys.readouterr().out
    assert "invalid blocked: 15/15" in out and "images: skipped" in out

def test_one_not_blocked(monkeypatch, capsys):
    calls = iter([OK] + [REJ] * 14)
    stub(monkeypatch, lambda *a: next(calls))
    assert eval_ai.main([]) == 1
    assert "invalid blocked: 14/15" in capsys.readouterr().out

def test_unreadable_not_blocked(monkeypatch, capsys):
    stub(monkeypatch, lambda *a: UNREADABLE)
    assert eval_ai.main([]) == 1
    out = capsys.readouterr().out
    assert "invalid blocked: 0/15" in out and "ERROR" in out

def test_call_raises_not_blocked(monkeypatch, capsys):
    def boom(*a):
        raise RuntimeError("down")
    stub(monkeypatch, boom)
    assert eval_ai.main([]) == 1

def test_missing_key(monkeypatch, capsys):
    monkeypatch.delenv("GEMINI_API_KEY")
    stub(monkeypatch, lambda *a: pytest.fail("must not call"))
    assert eval_ai.main([]) == 2
    assert "GEMINI_API_KEY" in capsys.readouterr().out

def test_images(monkeypatch, capsys, tmp_path):
    (tmp_path / "a.jpg").write_bytes(b"x")
    (tmp_path / "b.png").write_bytes(b"x")
    (tmp_path / "note.txt").write_bytes(b"x")
    seen = []

    def fn(text, image, mime):
        if image:
            seen.append(mime)
            return OK if len(seen) == 1 else REJ
        return REJ

    stub(monkeypatch, fn)
    assert eval_ai.main([]) == 0
    assert seen == ["image/jpeg", "image/png"]
    assert "images approved: 1/2" in capsys.readouterr().out
