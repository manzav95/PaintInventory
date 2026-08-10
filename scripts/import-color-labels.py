#!/usr/bin/env python3
"""
Match CSV custom color # → inventory items named #NNNN,
set color_label from Color Description and hex_color from paint databases / known lookups.
"""
from __future__ import annotations

import csv
import json
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TMP = Path(__file__).resolve().parent / "tmp"
CSV_PATH = Path(
    "/Users/zavala/Downloads/PCT Custom Paint - Color Codes(Paint Color List).csv"
)
API = "http://127.0.0.1:3000"

# Web-verified hex overrides for colors missing from local colornerd dumps.
HEX_OVERRIDES = {
    # Benjamin Moore OC
    "BM OC-23 CLASSIC GRAY": "#E3E0D7",
    "BM OC-68 DISTANT GRAY": "#F2F4F1",
    "BM OC-20 PALE OAK": "#DDD9CE",
    "BM OC-17 WHITE DOVE": "#EFEEE5",
    "BM OC-15 BABY FAWN": "#D9D3C4",
    "BM OC-25 CLOUD COVER": "#E9E8E0",
    "BM OC-111 CORINTHIAN WHITE": "#F6EACA",
    "BM OC-152 SUPER WHITE": "#F1F2EE",
    # Sherwin-Williams (newer Emerald Designer Edition)
    "SW 9647 SOFT SAGE": "#BCBCAE",
    "SW 9579 TIMELESS TAUPE": "#908379",
    # Farrow & Ball / Magnolia / Little Greene
    "F&B #221 PANTALON": "#6E6656",
    "MAGNOLIA MAG073 FLOWER JAR": "#B3B9AA",
    "MAGNOLIA MAG097 EARLY RISER": "#ADB5A5",
    "LG #257 ROYAL NAVY": "#294356",
}


def norm_key(s: str) -> str:
    s = re.sub(r"\([^)]*\)", " ", s)
    s = re.sub(r"\s+", " ", s).strip().upper()
    return s


def load_book(path: Path):
    data = json.loads(path.read_text())
    by_label = {}
    by_name = {}
    for row in data:
        hexv = (row.get("hex") or "").strip()
        if not hexv:
            continue
        if not hexv.startswith("#"):
            hexv = "#" + hexv
        hexv = "#" + hexv.lstrip("#").upper()
        if not re.fullmatch(r"#[0-9A-F]{6}", hexv):
            continue
        label = str(row.get("label") or "").strip().upper()
        name = str(row.get("name") or "").strip().upper()
        if label:
            by_label[label] = hexv
            by_label[re.sub(r"[\s\-]+", "", label)] = hexv
        if name:
            by_name[name] = hexv
    return by_label, by_name


def load_books():
    books = {}
    mapping = {
        "SW": "sw.json",
        "BM": "bm.json",
        "BEHR": "behr.json",
        "DE": "de.json",
        "PPG": "ppg.json",
        "FB": "farrow-ball.json",
        "VALSPAR": "valspar.json",
    }
    for brand, fname in mapping.items():
        p = TMP / fname
        if p.exists() and p.stat().st_size > 100:
            books[brand] = load_book(p)
    return books


BOOKS = load_books()


def extract_candidates(desc: str):
    du = desc.upper()
    cands = []
    for m in re.finditer(r"\bSW\s*#?\s*(\d{3,5})\b", du):
        n = m.group(1)
        cands.append(("SW", [n, n.lstrip("0") or n]))
    for m in re.finditer(
        r"\bBM\s+(HC|OC|AF|CC|CSP)\s*-?\s*(\d{1,4}(?:-\d{1,3})?)", du
    ):
        p, n = m.group(1), m.group(2)
        cands.append(("BM", [f"{p}-{n}", f"{p}{n}", f"{p} {n}"]))
    for m in re.finditer(r"\bBM\s+(\d{2,4}(?:-\d{1,3})?)\b", du):
        n = m.group(1)
        cands.append(("BM", [n, n.replace("-", "")]))
    for m in re.finditer(r"F\s*&\s*B\s*#?\s*(\d{1,4})\b", du):
        n = m.group(1)
        cands.append(("FB", [n, n.lstrip("0") or n]))
    for m in re.finditer(r"\bDE\s*(DE)?([A-Z]?\d{3,5}[A-Z]?)\b", du):
        code = m.group(2)
        cands.append(
            ("DE", [code, "DE" + code if not code.startswith("DE") else code])
        )
    for m in re.finditer(r"\b(?:BEHR\s+)?([MNPSH]\d{2,3}-\d(?:-\d+)?)\b", du):
        cands.append(("BEHR", [m.group(1).replace(" ", "")]))
    for m in re.finditer(r"\bVALSPAR\s+([0-9A-Z\-]+)", du):
        cands.append(("VALSPAR", [m.group(1)]))
    for m in re.finditer(r"\bPPG\s*([0-9A-Z\-]+)", du):
        cands.append(("PPG", [m.group(1)]))
    return cands


def extract_color_name(desc: str) -> str:
    d2 = desc
    d2 = re.sub(r"\([^)]*\)", " ", d2)
    d2 = re.sub(
        r"^(SW|BM|F&B|DE|BEHR|VALSPAR|PPG|KM|C2|MAGNOLIA|PORTOLA PAINTS|LG)\b[\s#\-]*",
        "",
        d2,
        flags=re.I,
    )
    d2 = re.sub(r"^(HC|OC|AF|CC|CSP)[\s\-]*\d+(?:-\d+)?\s+", "", d2, flags=re.I)
    d2 = re.sub(r"^#?\d{2,5}(?:-\d{1,3})?\s+", "", d2)
    d2 = re.sub(r"^SW\s*\d+\s+", "", d2, flags=re.I)
    d2 = re.sub(r"\s*[-–—].*(Sherwin|Benjamin|Serwin|Williams).*", "", d2, flags=re.I)
    d2 = re.sub(r"\s*@\s*.*", "", d2)
    d2 = re.sub(r"\s*\d+%\s*.*", "", d2)
    d2 = re.sub(r"[,.].*", "", d2)
    d2 = re.sub(r"\s+", " ", d2).strip()
    d2 = re.sub(r"^(HC|OC|AF|CC|CSP)[\s\-]*\d+(?:-\d+)?\s+", "", d2, flags=re.I)
    d2 = re.sub(r"^#?\d{2,5}(?:-\d{1,3})?\s+", "", d2)
    return d2.strip()


def override_hex(desc: str):
    key = norm_key(desc)
    if key in HEX_OVERRIDES:
        return HEX_OVERRIDES[key], "override"
    # strip trailing notes after matching prefix keys
    for k, h in HEX_OVERRIDES.items():
        if key.startswith(k):
            return h, "override-prefix"
    return None, None


def lookup_hex(desc: str):
    h, how = override_hex(desc)
    if h:
        return h, how
    for brand, labels in extract_candidates(desc):
        by_label, by_name = BOOKS[brand]
        for lab in labels:
            for key in (
                lab.upper(),
                lab.upper().replace(" ", ""),
                re.sub(r"[\s\-]+", "", lab.upper()),
            ):
                if key in by_label:
                    return by_label[key], f"{brand}:{key}"
    cname = extract_color_name(desc).upper()
    if cname and len(cname) >= 4:
        brands_order = []
        for brand, _ in extract_candidates(desc):
            if brand not in brands_order:
                brands_order.append(brand)
        brands_order += [b for b in BOOKS if b not in brands_order]
        for brand in brands_order:
            by_label, by_name = BOOKS[brand]
            if cname in by_name:
                return by_name[cname], f"{brand}:exact-name:{cname}"
    return None, None


def load_csv():
    with open(CSV_PATH, newline="", encoding="cp1252") as f:
        rows = list(csv.reader(f))
    csv_map = {}
    for r in rows[1:]:
        if len(r) < 3:
            continue
        code = (r[1] or "").strip()
        name = (r[2] or "").strip()
        if code and name:
            csv_map[code] = name
    return csv_map


def api_get(path: str):
    with urllib.request.urlopen(f"{API}{path}") as resp:
        return json.load(resp)


def api_put(path: str, body: dict):
    data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        f"{API}{path}",
        data=data,
        method="PUT",
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req) as resp:
        return json.load(resp)


def main():
    dry = "--apply" not in sys.argv
    csv_map = load_csv()
    items = api_get("/api/items")
    if isinstance(items, dict):
        items = items.get("items") or items.get("data") or []

    plan = []
    no_csv = []
    for item in items:
        iname = str(item.get("name") or "").strip()
        m = re.match(r"^#(\d+)$", iname)
        if not m:
            continue
        code = m.group(1)
        if code not in csv_map:
            no_csv.append({"id": item["id"], "code": code})
            continue
        desc = csv_map[code]
        hexv, how = lookup_hex(desc)
        plan.append(
            {
                "id": item["id"],
                "code": code,
                "color_label": desc,
                "hex_color": hexv,
                "how": how,
                "prev_hex": item.get("hex_color"),
                "prev_label": item.get("color_label"),
            }
        )

    with_hex = sum(1 for p in plan if p["hex_color"])
    print(f"Inventory #NNNN items matched to CSV: {len(plan)}")
    print(f"  with hex: {with_hex}")
    print(f"  label only (no reliable hex): {len(plan) - with_hex}")
    print(f"  inventory #codes not in CSV: {len(no_csv)}")
    if dry:
        print("Dry run only. Re-run with --apply to write to the database.")
        out = TMP / "color_import_plan.json"
        out.write_text(json.dumps({"plan": plan, "no_csv": no_csv}, indent=2))
        print(f"Wrote plan → {out}")
        return

    ok = fail = 0
    for p in plan:
        body = {
            "color_label": p["color_label"],
            "userName": "admin-import",
        }
        if p["hex_color"]:
            body["hex_color"] = p["hex_color"]
        try:
            enc = urllib.request.quote(str(p["id"]), safe="")
            result = api_put(f"/api/items/{enc}", body)
            if result.get("success") is False:
                fail += 1
                print("FAIL", p["id"], result)
            else:
                ok += 1
                print(
                    f"OK #{p['code']} {p['hex_color'] or '—'}  {p['color_label'][:55]}"
                )
        except urllib.error.HTTPError as e:
            fail += 1
            print("HTTP", p["id"], e.read()[:200])
        except Exception as e:
            fail += 1
            print("ERR", p["id"], e)
    print(f"Done. updated={ok} failed={fail}")


if __name__ == "__main__":
    main()
