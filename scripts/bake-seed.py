"""Developer-only fixture bake: reads the cached values of the reference workbook into lib/data/seed/*.json,
tests/fixtures/*.json and public/samples/*. The app never reads the workbook at runtime.

Usage: python scripts/bake-seed.py "<path to workbook.xlsx>"
"""

import datetime as dt
import json
import os
import re
import sys

import openpyxl
from openpyxl.utils import column_index_from_string as col
from openpyxl.worksheet.formula import ArrayFormula

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SEED = os.path.join(ROOT, "lib", "data", "seed")
FIXTURES = os.path.join(ROOT, "tests", "fixtures")
SAMPLES = os.path.join(ROOT, "public", "samples")
CHAIN_SHEETS = ["May26", "Jun26", "Jul26", "Sep26", "Dec26"]


def iso(v):
    if isinstance(v, dt.datetime):
        return v.date().isoformat()
    if isinstance(v, dt.date):
        return v.isoformat()
    return None


def num(v):
    if isinstance(v, bool):
        return None
    if isinstance(v, (int, float)):
        return float(v)
    if isinstance(v, str):
        try:
            return float(v.replace(",", ""))
        except ValueError:
            return None
    return None


def text(v):
    if v is None:
        return None
    s = str(v).strip()
    return s or None


def cell(row, letter):
    i = col(letter) - 1
    return row[i] if i < len(row) else None


def slug(name):
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def dump(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(data, fh, separators=(",", ":"), ensure_ascii=False)
    print("wrote", os.path.relpath(path, ROOT), os.path.getsize(path), "bytes")


def formulas(src):
    """Hard-coded expiry fixings inside the leg formula, and the surface vol formula (for the docs)."""
    wb = openpyxl.load_workbook(src, read_only=True, data_only=False)
    lop = wb["List of Products"]
    rows = list(lop.iter_rows(min_row=1, max_row=4, values_only=True))
    header_dates = {}
    for r_index, row in enumerate(rows, start=1):
        for c_index, v in enumerate(row, start=1):
            if isinstance(v, dt.datetime):
                header_dates[(openpyxl.utils.get_column_letter(c_index), r_index)] = iso(v)
    ax = cell(rows[2], "AX")
    ax = ax.text if isinstance(ax, ArrayFormula) else str(ax)
    fixings = {}
    for ref_col, ref_row, level in re.findall(r"\$U3=\$?([A-Z]+)\$(\d+),IF\(\$?Q3=\"call\",0,IF\(\$?R3<([\d.]+)", ax) + re.findall(
        r"U3=\$?([A-Z]+)\$(\d+),IF\(Q3=\"call\",0,IF\(R3<([\d.]+)", ax
    ):
        date = header_dates.get((ref_col, int(ref_row)))
        if date:
            fixings[date] = float(level)
    px = wb["Px. Comput"]
    at = None
    for row in px.iter_rows(min_row=5, max_row=5, values_only=True):
        v = cell(row, "AT")
        at = v.text if isinstance(v, ArrayFormula) else str(v)
    wb.close()
    return fixings, ax, at


def main(src):
    hard_fixings, ax_formula, at_formula = formulas(src)
    print("hard-coded expiry fixings", hard_fixings)
    wb = openpyxl.load_workbook(src, read_only=True, data_only=True)

    # Summary: global inputs and the book list.
    summary = list(wb["Summary"].iter_rows(min_row=1, max_row=400, max_col=12, values_only=True))
    valuation_date = iso(summary[0][5])
    current_nifty = num(summary[0][6])
    assumed_nifty = num(summary[0][7])
    summary_rows = []
    seen = set()
    for row in summary[2:]:
        name = text(row[1])
        # The Summary lists some products twice; the desk counts each product once.
        if not name or name in seen:
            continue
        seen.add(name)
        summary_rows.append(
            {
                "name": name,
                "pendingObservations": num(row[2]),
                "actualTarget": num(row[3]),
                "residualTarget": num(row[4]),
                "maxIrr": num(row[5]),
                "currentIrr": num(row[6]),
                "assumedIrr": num(row[7]),
                "mobilisationCrore": num(row[8]),
                "exitValueCurrentCrore": num(row[9]),
                "exitValueAssumedCrore": num(row[10]),
            }
        )
    book_names = {r["name"] for r in summary_rows}

    # Calculator: per-product inputs and cached outputs.
    calc = {}
    alias = {}
    for row in wb["Calculator"].iter_rows(min_row=3, max_row=2000, max_col=col("BJ"), values_only=True):
        name = text(cell(row, "B"))
        if not name:
            continue
        if text(cell(row, "A")):
            alias[text(cell(row, "A"))] = name
        obs = [iso(cell(row, c)) for c in ["Y", "Z", "AA", "AB", "AC", "AD", "AE"]]
        calc[name] = {
            "allotmentDate": iso(cell(row, "C")),
            "mobilisation": num(cell(row, "D")),
            "marginPct": num(cell(row, "M")),
            "ib": num(cell(row, "N")),
            "tranCost": num(cell(row, "O")),
            "issuanceCost": num(cell(row, "P")),
            "prodRate": num(cell(row, "Q")),
            "premRate": num(cell(row, "R")),
            "marginRate": num(cell(row, "S")),
            "faceValue": num(cell(row, "T")),
            "observationDates": [d for d in obs if d],
            "actualTarget": num(cell(row, "AR")),
            "coupon": num(cell(row, "BE")),
            "tenorDays": num(cell(row, "BF")),
            "golden": {
                "netMobilisation": num(cell(row, "E")),
                "grownMobilisation": num(cell(row, "F")),
                "premium": num(cell(row, "G")),
                "grownPremium": num(cell(row, "H")),
                "margin": num(cell(row, "I")),
                "grownMargin": num(cell(row, "J")),
                "premiumOutflow": num(cell(row, "K")),
                "unwindPrice": num(cell(row, "L")),
                "unwindIrr": num(cell(row, "U")),
                "assumedPremiumOutflow": num(cell(row, "V")),
                "assumedUnwindPrice": num(cell(row, "W")),
                "assumedIrr": num(cell(row, "X")),
                "fixings": [num(cell(row, c)) for c in ["AG", "AH", "AI", "AJ", "AK", "AL", "AM"]],
                "averageSoFar": num(cell(row, "AN")),
                "doneObservations": num(cell(row, "AO")),
                "totalObservations": num(cell(row, "AP")),
                "status": text(cell(row, "AQ")),
                "residualTarget": num(cell(row, "AS")),
                "pendingObservations": num(cell(row, "AT")),
                "maxIrr": num(cell(row, "BG")),
                "exitValueCurrent": num(cell(row, "BH")),
                "pendingMonths": text(cell(row, "BI")),
                "exitValueAssumed": num(cell(row, "BJ")),
            },
        }
    for r in summary_rows:
        if r["name"] not in calc and r["name"] in alias:
            r["calculatorName"] = alias[r["name"]]

    # List of Products: one row per leg.
    legs = {}
    meta = {}
    for row in wb["List of Products"].iter_rows(min_row=3, max_row=20000, max_col=col("BB"), values_only=True):
        name = text(cell(row, "B"))
        if not name:
            continue
        key_name = name
        if key_name not in book_names and not any(r.get("calculatorName") == key_name for r in summary_rows):
            continue
        meta.setdefault(
            key_name,
            {
                "tradeDate": iso(cell(row, "C")),
                "productCode": text(cell(row, "D")),
                "initialNifty": num(cell(row, "G")),
                "contingentLevel": num(cell(row, "H")),
                "allotmentDate": iso(cell(row, "J")),
                "tenorDays": num(cell(row, "K")),
                "maturityDate": iso(cell(row, "L")),
                "prodRate": num(cell(row, "M")),
                "premRate": num(cell(row, "N")),
                "coupon": num(cell(row, "P")),
                "ib": num(cell(row, "AB")),
                "tranCost": num(cell(row, "AD")),
                "issuanceCost": num(cell(row, "AE")),
                "marginPct": num(cell(row, "AP")),
                "marginRate": num(cell(row, "AR")),
                "faceValue": num(cell(row, "AS")),
                "mobilisation": num(cell(row, "E")),
            },
        )
        option = text(cell(row, "Q"))
        strike = num(cell(row, "R"))
        expiry = iso(cell(row, "U"))
        qty = num(cell(row, "V"))
        if not option or strike is None or not expiry or qty is None:
            continue
        legs.setdefault(key_name, []).append(
            {
                "optionType": "Call" if option.lower().startswith("c") else "Put",
                "strike": strike,
                "side": "Sell" if (text(cell(row, "T")) or "").lower().startswith("s") else "Buy",
                "expiry": expiry,
                "quantity": qty,
                "prdPrice": num(cell(row, "X")),
                "prdPremium": num(cell(row, "Y")),
                "golden": {
                    "intrinsicPrice": num(cell(row, "AX")),
                    "premiumOutflow": num(cell(row, "AY")),
                    "grownOutflow": num(cell(row, "AZ")),
                    "assumedPrice": num(cell(row, "BA")),
                    "assumedOutflow": num(cell(row, "BB")),
                },
            }
        )

    # Pricing keys: model prices, vols and add-in deltas for the golden suite.
    pricing = {}
    for row in wb["Px. Comput"].iter_rows(min_row=5, max_row=40000, max_col=col("AT"), values_only=True):
        key = text(cell(row, "A"))
        if not key:
            continue
        pricing[key] = {
            "optionType": text(cell(row, "B")),
            "strike": num(cell(row, "C")),
            "expiry": iso(cell(row, "D")),
            "lowerStrike": num(cell(row, "E")),
            "upperStrike": num(cell(row, "F")),
            "lowerPrice": num(cell(row, "G")),
            "upperPrice": num(cell(row, "H")),
            "modelPrice": num(cell(row, "I")),
            "vol": num(cell(row, "K")),
            "delta": num(cell(row, "L")),
            "assumedPrice": num(cell(row, "M")),
            "side": text(cell(row, "N")),
            "baseVol": num(cell(row, "AT")),
        }

    # Bid ask spreads and the index history.
    spreads, fixings = [], {}
    for row in wb["Bid Ask"].iter_rows(min_row=2, max_row=1000, max_col=11, values_only=True):
        if iso(row[0]) and num(row[1]) is not None:
            spreads.append({"expiry": iso(row[0]), "spread": num(row[1])})
        if iso(row[9]) and num(row[10]):
            fixings[iso(row[9])] = num(row[10])
    for d, level in hard_fixings.items():
        fixings.setdefault(d, level)

    # Surface.
    srows = list(wb["Surface"].iter_rows(min_row=1, max_row=40, max_col=23, values_only=True))
    label = re.sub(r"(?i)^vol surface", "Volatility Surface", text(srows[1][0]) or "Volatility Surface")
    moneyness = [num(v) / 100 for v in srows[2][1:22] if num(v) is not None]
    reference = num(srows[3][10])
    expiries, vols = [], []
    for row in srows[4:]:
        if not iso(row[0]):
            continue
        expiries.append(iso(row[0]))
        vols.append([num(v) for v in row[1 : 1 + len(moneyness)]])
    surface = {
        "label": label,
        "referenceLevel": reference,
        "moneyness": moneyness,
        "expiries": expiries,
        "volsPercent": vols,
    }

    # Option chains.
    chains = []
    spread_expiries = sorted({s["expiry"] for s in spreads})
    for sheet in CHAIN_SHEETS:
        if sheet not in wb.sheetnames:
            continue
        month = dt.datetime.strptime(sheet, "%b%y")
        expiry = next((e for e in spread_expiries if e.startswith(month.strftime("%Y-%m"))), None)
        rows = []
        for row in wb[sheet].iter_rows(min_row=3, max_row=1000, max_col=22, values_only=True):
            strike = num(row[11])
            if strike is None:
                continue
            rows.append(
                {
                    "strike": strike,
                    "callBid": num(row[8]),
                    "callAsk": num(row[9]),
                    "callLast": num(row[5]),
                    "putBid": num(row[13]),
                    "putAsk": num(row[14]),
                    "putLast": num(row[17]),
                }
            )
        chains.append({"month": month.strftime("%Y-%m"), "expiry": expiry, "rows": rows})

    # One-product sheet.
    one = list(wb["715"].iter_rows(min_row=1, max_row=6, max_col=11, values_only=True))
    one_product = {
        "date": iso(one[1][7]),
        "levels": [num(v) for v in one[2][7:11]],
        "name": text(one[3][1]),
        "pendingMonths": text(one[3][2]),
        "actualTarget": num(one[3][3]),
        "residualTarget": num(one[3][4]),
        "maxIrr": num(one[3][5]),
        "currentIrr": num(one[3][6]),
        "irrAtLevels": [num(v) for v in one[3][7:11]],
        "currentQuote": num(one[4][6]),
        "quotesAtLevels": [num(v) for v in one[4][7:11]],
    }
    wb.close()

    # Assemble the book.
    products, golden_products, golden_legs = [], [], {}
    used_keys = set()
    for s in summary_rows:
        name = s.get("calculatorName", s["name"])
        c = calc.get(name)
        m = meta.get(name) or meta.get(s["name"])
        if not c or not m:
            print("skip (no calculator or legs):", s["name"])
            continue
        product_legs = legs.get(name) or legs.get(s["name"]) or []
        pid = slug(s["name"])
        products.append(
            {
                "id": pid,
                "name": s["name"],
                "productCode": m["productCode"],
                "tradeDate": m["tradeDate"],
                "allotmentDate": c["allotmentDate"] or m["allotmentDate"],
                "maturityDate": m["maturityDate"],
                "tenorDays": c["tenorDays"] if c["tenorDays"] else m["tenorDays"],
                "mobilisation": c["mobilisation"],
                "initialNifty": m["initialNifty"],
                "contingentLevel": m["contingentLevel"],
                "faceValue": c["faceValue"] or m["faceValue"],
                "coupon": c["coupon"],
                "actualTarget": c["actualTarget"],
                "marginPct": c["marginPct"],
                "ib": c["ib"],
                "tranCost": c["tranCost"],
                "issuanceCost": c["issuanceCost"],
                "prodRate": c["prodRate"],
                "premRate": c["premRate"],
                "marginRate": c["marginRate"],
                "observationDates": c["observationDates"],
                "legs": [{k: v for k, v in leg.items() if k != "golden"} for leg in product_legs],
            }
        )
        golden_products.append({"id": pid, "summary": s, "calculator": c["golden"], "legs": [leg["golden"] for leg in product_legs]})
        for leg in product_legs:
            from_serial = (dt.date.fromisoformat(leg["expiry"]) - dt.date(1899, 12, 30)).days
            used_keys.add(f"{int(leg['strike'])}{from_serial}{leg['side']}")
    for key in used_keys:
        if key in pricing:
            golden_legs[key] = pricing[key]

    book = {
        "asOf": {"valuationDate": valuation_date, "currentNifty": current_nifty, "assumedNifty": assumed_nifty},
        "bidAsk": spreads,
        "products": products,
    }
    dump(os.path.join(SEED, "book.json"), book)
    dump(os.path.join(SEED, "surface.json"), surface)
    dump(os.path.join(SEED, "chains.json"), chains)
    dump(os.path.join(SEED, "fixings.json"), [{"date": d, "close": fixings[d]} for d in sorted(fixings)])
    dump(
        os.path.join(FIXTURES, "workbook-golden.json"),
        {
            "asOf": book["asOf"],
            "products": golden_products,
            "pricing": golden_legs,
            "oneProduct": one_product,
            "hardCodedFixings": hard_fixings,
        },
    )
    with open(os.path.join(FIXTURES, "workbook-formulas.txt"), "w", encoding="utf-8") as fh:
        fh.write("Leg intrinsic formula (List of Products AX3):\n" + ax_formula + "\n\nSurface vol formula (Px. Comput AT5):\n" + str(at_formula) + "\n")
    print("products", len(products), "legs", sum(len(p["legs"]) for p in products), "pricing keys", len(golden_legs))

    write_samples(book, surface, chains, fixings)


def write_samples(book, surface, chains, fixings):
    os.makedirs(SAMPLES, exist_ok=True)
    wb = openpyxl.Workbook(write_only=True)
    ws = wb.create_sheet("Product Master")
    headers = [
        "Product Name", "Product Code", "Trade Date", "Allotment Date", "Maturity Date", "Tenor Days", "Mobilisation",
        "Initial Nifty Level", "Contingent Level", "Face Value", "Coupon", "Actual Target", "Margin Percent", "IB",
        "Transaction Cost", "Issuance Cost", "Product Rate", "Premium Rate", "Margin Rate",
        "Observation Date 1", "Observation Date 2", "Observation Date 3", "Observation Date 4", "Observation Date 5",
        "Observation Date 6", "Observation Date 7", "Option Type", "Strike", "Side", "Expiry", "Quantity", "Product Price",
        "Product Premium",
    ]
    ws.append(headers)
    for p in book["products"]:
        obs = (p["observationDates"] + [None] * 7)[:7]
        head = [
            p["name"], p["productCode"], p["tradeDate"], p["allotmentDate"], p["maturityDate"], p["tenorDays"], p["mobilisation"],
            p["initialNifty"], p["contingentLevel"], p["faceValue"], p["coupon"], p["actualTarget"], p["marginPct"], p["ib"],
            p["tranCost"], p["issuanceCost"], p["prodRate"], p["premRate"], p["marginRate"], *obs,
        ]
        for leg in p["legs"]:
            ws.append(head + [leg["optionType"], leg["strike"], leg["side"], leg["expiry"], leg["quantity"], leg["prdPrice"], leg["prdPremium"]])
    wb.save(os.path.join(SAMPLES, "product-master-sample.xlsx"))

    wb = openpyxl.Workbook(write_only=True)
    ws = wb.create_sheet("Volatility Surface")
    ws.append(["Reference Level", surface["referenceLevel"]])
    ws.append(["Expiry"] + [round(m * 100, 4) for m in surface["moneyness"]])
    for e, row in zip(surface["expiries"], surface["volsPercent"]):
        ws.append([e] + row)
    wb.save(os.path.join(SAMPLES, "vol-surface-sample.xlsx"))

    if chains:
        c = chains[0]
        with open(os.path.join(SAMPLES, "option-chain-sample.csv"), "w", encoding="utf-8") as fh:
            fh.write("CALLS,,,,,,,,,,,PUTS\n,OI,CHNG IN OI,VOLUME,IV,LTP,CHNG,BID QTY,BID,ASK,ASK QTY,STRIKE,BID QTY,BID,ASK,ASK QTY,CHNG,LTP,IV,VOLUME,CHNG IN OI,OI\n")
            for r in c["rows"]:
                f = lambda v: "-" if v is None else f"{v:g}"
                fh.write(f",-,-,-,-,{f(r['callLast'])},-,-,{f(r['callBid'])},{f(r['callAsk'])},-,{f(r['strike'])},-,{f(r['putBid'])},{f(r['putAsk'])},-,-,{f(r['putLast'])},-,-,-,-\n")
    with open(os.path.join(SAMPLES, "fixings-sample.csv"), "w", encoding="utf-8") as fh:
        fh.write("Date,Close\n")
        for d in sorted(fixings):
            fh.write(f"{d},{fixings[d]}\n")
    print("samples written")


def samples_from_seed():
    """Rewrite public/samples from the committed seed, without the workbook."""
    load = lambda name: json.load(open(os.path.join(SEED, name), encoding="utf-8"))
    book = load("book.json")
    fixings = {f["date"]: f["close"] for f in load("fixings.json")}
    write_samples(book, load("surface.json"), load("chains.json"), fixings)


if __name__ == "__main__":
    if sys.argv[1] == "--samples-only":
        samples_from_seed()
    else:
        main(sys.argv[1])
