# 10 — Master tally

This is the tally of the eight FY Excel masters, the New Primary sheet, and the unwinding master in `lib/data/multi-products-seed.json`. The master is what the desk, MongoDB, and the sample workbooks use.

Generated 2026-10-17. Master size: **2505 products**, **79190 legs**. Blank payoff formulas: **0**.

## What each source owns

| Source | What it supplies |
| --- | --- |
| Eight FY Excel files | Product code, face value, mobilisation, coupon, cost rates, margin funding rate, margin funds, discount rates, option strikes and sides |
| New Primary sheet | Listed product name for a matched series and phase. Observation Average 1–7 is the option expiry list when it has the same number of dates as the Excel schedule |
| Swap Product master | Payoff formula text |
| Unwinding master | The book the calculator prices |

## Eight Excel files against the master

A row counts as mapped when its product code is on the master. Face, mobilisation, and the rate block (coupon, inbuilt, transaction cost, issuance cost, margin cost, margin funding rate, product discount rate, premium discount rate) are compared on that code.

| File | Products | Legs | Codes on master | Face matches | Mobilisation matches | Rate block matches |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Apr'21–Mar'22 | 364 | 7738 | 364 | 360 | 360 | 358 |
| Apr'22–Mar'23 | 469 | 10855 | 469 | 469 | 469 | 469 |
| Apr'23–Mar'24 | 618 | 19339 | 618 | 618 | 618 | 618 |
| Apr'24–Mar'25 | 546 | 18211 | 546 | 545 | 545 | 545 |
| Apr'25–Mar'26 | 160 | 7313 | 160 | 160 | 160 | 160 |
| Apr'25–Mar'26 Sensex | 248 | 11179 | 248 | 248 | 248 | 248 |
| Apr'26–Mar'27 | 22 | 938 | 22 | 22 | 22 | 22 |
| Apr'26–Mar'27 Sensex | 94 | 4025 | 94 | 94 | 94 | 94 |

Excel rows read: 2521. Codes missing from the master: **0**.

Every product code in the eight files is on the master.

### Face, mobilisation, and rates

2521 Excel rows collapse to 2505 master products because 16 series codes appear in more than one FY file. The master keeps one book per code: the copy with more option legs, and if those are equal, the larger mobilisation. A later file in the table can therefore match the master while the earlier copy of the same code does not. That is why Apr'21–Mar'22 shows 360 of 364 faces and Apr'24–Mar'25 shows 545 of 546. Every other file matches face, mobilisation, and the full rate block, including the margin funding rate, on every code.

The rows that lose that choice:

Face mismatches (first 5):

- ARG22SP12 - Series IX: Excel 125000 / master 183125
- ARG22SP25 - Series VI: Excel 125000 / master 183125
- ARG22SP30 - Series II: Excel 125000 / master 183125
- ARG22SP42 - Series III: Excel 125000 / master 183125
- ARG22SP03 - Series IV: Excel 197500 / master 125000

Mobilisation mismatches (first 5):

- ARG22SP12 - Series IX: Excel 25000000 / master 14650000
- ARG22SP25 - Series VI: Excel 11000000 / master 16115000
- ARG22SP30 - Series II: Excel 19000000 / master 7325000
- ARG22SP42 - Series III: Excel 15000000 / master 7325000
- ARG22SP03 - Series IV: Excel 12640000 / master 11000000

Rate mismatches (first 7):

- ARG22SP12 - Series IX coupon: Excel 0.465 / master 0.47
- ARG22SP25 - Series VI coupon: Excel 0.465 / master 1
- ARG22SP30 - Series II coupon: Excel 0.465 / master 0.47
- ARG22SP42 - Series III coupon: Excel 0.465 / master 0.47
- ARG23SP19 - Series I marginFundingRate: Excel 0.0575 / master 0.0705
- ARG22DMFSP06-Series 1 inbuilt: Excel 0.08838102101570777 / master 0.056
- ARG22SP03 - Series IV coupon: Excel 0.55 / master 0.58

Margin funding rate is a master field. The quote uses it. NBFC Grown Value Rupees is the amount with the NBFC compounded at the product discount rate, plus the margin funds compounded at the margin funding rate, for invested days divided by 365. It does not appear as its own Post Observation column.

## New Primary names and observation dates

Series matched on the New Primary sheet: **2116**. Unmatched: **389**. Names restored from the listed sheet: **250**.

When a matched product has the same number of option expiries as Observation Average 1–7, those averages replace the Excel dates in date order. A shorter or longer list moves a date only when an unused observation sits within 10 days. Nifty Accelerator 706 stays on 2026-03-30, 2026-06-30, 2026-09-29.

Nifty Accelerator 709 (`ARG22DMFSP07-Series 1`) is not on the New Primary sheet. Its strikes match Accelerator 706, and its three Excel dates were the old Thursday expiries. Those dates are now 2026-03-30, 2026-06-30, and 2026-09-29. At the 16 Oct 2026 Nifty close, Premium Outflow is ₹−99,00,291.94.

Nifty Magnifier 612 (`ARG22SP99 - Series II`) keeps its four observation expiries. Its strikes are 22509, 21960, 19764, 15555, 15189, and 12810, each on all four expiries. Premium Outflow at that same close is ₹−28,20,131.87.

Nifty Accelerator 814 (`ARG23SP58 Series I`) has eight strikes and four expiries: 2026-07-28, 2026-10-27, 2027-01-25, 2027-04-27. Nifty Accelerator 787 keeps its own eight strikes on 2026-05-26, 2026-08-25, 2026-11-23, and 2027-02-23.

### Names taken from New Primary where the Excel name differed

| Product code | Excel name | Master name |
| --- | --- | --- |
| ARG22SP04 - Series III | Nifty Magnifier - 499 | Nifty Magnifier - 499 (ROLLOVER PHASE 1) |
| ARG22SP06 - Series IV | Nifty Magnifier - 502 | Nifty Magnifier - 502 (ROLLOVER PHASE 1) |
| ARG22SP15 - Series VI | Nifty Magnifier - 514 | Nifty Magnifier - 514 (ROLLOVER PHASE 1) |
| ARG22SP21 - Series VII | Protected Magnifier - 87 | Protected Magnifier - 87 (ROLLOVER PHASE 1) |
| ARG22SP25 - Series V | Nifty Accelerator - 607 | Nifty Accelerator - 607 (ROLLOVER PHASE 1) |
| ARG22SP31 - Series IX | Nifty Magnifier - 531 | Nifty Magnifier - 531 (ROLLOVER PHASE 1) |
| ARG22SP34 - Series V | Nifty Magnifier - 536 | Nifty Magnifier - 536 (ROLLOVER PHASE 1) |
| ARG22SP50 - Series V | Nifty Magnifier - 557 | Nifty Magnifier - 557 (ROLLOVER PHASE 1) |
| ARG22SP51 - Series IV | Nifty Magnifier - 560 | Nifty Magnifier - 560 (ROLLOVER PHASE 1) |
| ARG22SP55 - Series III | Nifty Accelerator - 647 | Nifty Accelerator - 647 (ROLLOVER PHASE 1) |
| ARG23SP21 - Series IV | Nifty Magnifier - 639 | Nifty Magnifier - 640 |
| ARG20SP05 - Series I | Protected call - 253 Phase II | Protected call - 253 (ROLLOVER PHASE 2) |
| ARG20SP06 - Series I | Protected call - 254 Phase II | Protected call - 254 (ROLLOVER PHASE 2) |
| ARG20SP12 - Series I | Protected call - 261 Phase II | Protected call - 261 (ROLLOVER PHASE 2) |
| ARG20SP15-Series I | Protected call - 264 Phase II | Protected call - 264 (ROLLOVER PHASE 2) |
| ARG20SP20-Series III | Protected call - 270 Phase II | Protected call - 270 (ROLLOVER PHASE 2) |
| ARG20SP22-Series III | Protected Call - 272 Phase II | Protected call - 272 (ROLLOVER PHASE 2) |
| ARG20SP23 - Series IV | Protected call - 275 Phase II | Protected call - 275 (ROLLOVER PHASE 2) |
| ARG20SP24 - Series III | Protected call - 277 Phase II | Protected call - 277 (ROLLOVER PHASE 2) |
| ARG20SP32 - Series III | Protected call - 281 Phase II | Protected call - 281 (ROLLOVER PHASE 2) |
| ARG20SP33 - Series IV | Customised Protected call - 281 - Phase II | Customised Protected call - 281 - 50.1 (ROLLOVER PHASE 2) |
| ARG23SP42 Series III | Nifty Accelerator - 814 | Nifty Accelerator - 787 |
| ARG20SP38 - Series IV | Protected call - 286 Phase II | Protected call - 286 (ROLLOVER PHASE 2) |
| ARG20SP44 - Series II | Protected call - 289 Phase II | Protected call - 289 (ROLLOVER PHASE 2) |
| ARG20SP46 - Series III | Protected call - 291 Phase II | Protected call - 291 (ROLLOVER PHASE 2) |
| ARG20SP51 - Series III | Protected call - 294 Phase II | Protected call - 294 (ROLLOVER PHASE 2) |
| ARG20SP69 - Series I | Protected call - 300 Phase II | Protected call - 300 (ROLLOVER PHASE 2) |
| ARG20SP69 - Series III | Protected call - 301 Phase II | Protected call - 301 (ROLLOVER PHASE 2) |
| ARG19SP99 - Series II | Nifty Accelerator - 311 Phase II | Nifty Accelerator - 311 (ROLLOVER PHASE 2) |
| ARG19SP99 - Series III | Nifty Accelerator - 312 Phase II | Nifty Accelerator - 312 (ROLLOVER PHASE 2) |

The table shows the first 30 of 251 renamed products.

### Eight series the Excel product number did not match

These keep the Excel product code. The displayed name is the New Primary listed name for that series and phase.

| Product code | Master name | First expiries |
| --- | --- | --- |
| ARG23SP21 - SERIES IV | Nifty Magnifier - 640 | 2026-04-28, 2026-07-28, 2026-10-27 |
| ARG23SP42 SERIES III | Nifty Accelerator - 787 | 2026-05-26, 2026-07-30, 2026-08-25 |
| ARG20SP16 - SERIES III | Nifty Accelerator - 337 - (30%PP) (ROLLOVER PHASE 2) | 2026-03-30, 2026-04-28, 2026-05-26 |
| ARG23SP123 SERIES I | Nifty Accelerator - 887 | 2026-11-23, 2027-02-23, 2027-05-25 |
| ARG24SP03 SERIES I | Nifty Accelerator - 956 | 2027-02-23, 2027-05-25, 2027-08-31 |
| ARG23SP166 SERIES II | Nifty Accelerator - 945 | 2027-02-23, 2027-05-25, 2027-08-31 |
| ARG25SP13 SERIES IV | Nifty Accelerator - 1268 | 2027-12-28, 2028-03-28, 2028-06-27 |
| ARFS25SP16 SERIES III | Nifty Accelerator - 1417 | 2028-05-30, 2028-08-29, 2028-11-28 |

## Net Premium Outflow

On every product, Premium Outflow is the sum of Premium Outflow Amount on the Options Book. Each leg amount is the unwind mark times Unwind Quantity. An expired put or call uses the in-the-money price at the Yahoo close on or before that leg's expiry. Original Sell pays, so the amount is negative. Original Buy receives, so the amount is positive. Out of the money is zero. The same price is used for Unwind Buy and Unwind Sell.

The Product Book Premium Outflow card adds those leg amounts for option expiries inside the start and end dates, for products on the current tab that match the observation mode. It updates when the dates, the mode, the tab, or the search change, and when the daily quotes reload.

Checked on 10 Oct 2026 for all 2,212 live-maturity products:

- Premium Outflow equals the sum of the Options Book leg amounts on every product. Breaks: 0.
- Amount with NBFC Rupees equals mobilisation after inbuilt, transaction, issuance, and margin costs, minus the margin funds. Breaks: 0.
- NBFC Grown Value Rupees equals that amount compounded at the product discount rate, plus the margin funds compounded at the margin funding rate. Breaks: 0. Nifty Accelerator 635 uses margin funding rate 5.40% and grown value ₹2,56,32,703.61, the same figure as the screen.
- Expected Amount is the maximum value of one debenture (face times one plus the contingent coupon) times the number of debentures. NBFC PnL is Unwind Amount minus that Expected Amount. On 10 Oct 2026, Nifty Accelerator 635 was Unwind Amount ₹3,99,80,013.97 minus Expected Amount ₹4,00,00,000.00, so NBFC PnL was ₹−19,986.03.

September option expiries on the live book, and the cash on those dates:

| Option expiry | Legs | Premium Outflow |
| --- | ---: | --- |
| 30 Sep 2025 | 78 | ₹0.00 |
| 24 Sep 2026 | 20 | ₹−34,23,156.19 |
| 29 Sep 2026 | 913 | ₹−1,51,79,10,622.33 |

1 Sep through 20 Sep has no option expiry in 2024, 2025, or 2026, so the card is ₹0.00 for that window. The figure near 150 crore is the 29 Sep 2026 expiry: ₹−151.79 crore. The card on the desk shows that same rupee amount when the start and end dates are 29 Sep 2026.

Re-priced on 11 Oct 2026, all 2,212 live-maturity products. Premium Outflow still equals the Options Book leg sum (0 breaks). Amount with NBFC still matches the cost-and-margin-funds formula (0 breaks). NBFC Grown Value still compounds the margin funds at the margin funding rate (0 breaks). Nifty Accelerator 635 uses margin funding rate 5.40%. Its grown value moved from ₹2,56,32,703.61 on 10 Oct to ₹2,56,37,409.10 on 11 Oct because one more day is invested. That is the daily roll, not a second formula.

### 3 Nov 2022 through 24 Jun 2025

On the ongoing book that window sums to ₹0.00. Only 12 option legs expire inside it, all on ARG20SP84 - Series II, puts struck from 3,171 to 12,210, expiries 24 Nov 2022 and 29 Dec 2022. Nifty was far above those strikes, so every leg is out of the money and the cash is zero. There is no in-the-money put on a still-live product in that window.

Products that have already matured are on the Expired tab, not on Ongoing. The same dates on the matured book are 2,088 legs, 55 of them in the money, Premium Outflow ₹−4,90,06,154.35. That is the expired put cash for those dates. It is not on the Ongoing card because those products are no longer on that tab.

## Option positions

Strike, side, and spreads were compared to the eight Excel files on every series whose face and mobilisation match the master. 2,515 of those rows match leg for leg. The one shorter copy is ARG22DMFSP06-Series 1 in the Apr'21–Mar'22 file (18 legs). The Apr'22–Mar'23 file of the same series has the 39 legs the master keeps, including the second strike ladder. New Primary does not carry strikes or sides. It carries the observation dates already applied to those legs.

## Unwind quote against the maturity quote

Premium Outflow is still the sum of in-the-money settlement, using the Yahoo close on or before each expiry. The Post Observation unwind quote is the Product Book quote, and Unwind Amount is that quote times the debentures. Difference is Unwind Amount minus Expected Amount. Residual Tenure is the days left in the tenor as of the Asia/Kolkata date. A book that has not grown to the contingent coupon shows a negative Difference even when Premium Outflow is zero. Nifty Accelerator 671, ARG22DMFSP04-Series 1, is not on the New Primary sheet. The Apr'21–Mar'22 Excel contingent coupon is 102 percent and the tenor is 1,855 days, and the master matches both. Allotment is 27 Oct 2021 and maturity is 25 Nov 2026, so 45 days remain on 11 Oct 2026. The maturity quote is face times 2.02, which is ₹4,04,000 a debenture and ₹29,49,20,000 for the issue. On 11 Oct 2026 the Product Book unwind quote is ₹3,06,365.35 and the unwind amount is ₹22,36,46,705.91, so Difference is ₹−7,12,73,294.09. Premium Outflow is ₹0. Premium credited is 11.97 percent of mobilisation, and the grown NBFC pot plus the grown premium pot is ₹22,36,46,705.91, about 153 percent of the money raised. That is the whole gap.

## Premium Credited against the eight files

Checked on 11 Oct 2026. Premium Credited is the absolute value of the sum, over every live leg, of Product Price times negative Required Quantity. A sell quantity is negative, so the minus sign is the premium that leg brought in. A blank quantity, a zero quantity, and a "+" / "-" / "-+" / "+-" placeholder are not legs.

The eight files contain **0** placeholder quantity cells and **2,947** zero-quantity rows. Those rows are not on the master. The master has **0** zero-quantity legs.

Excel writes Premium Credited as `IF(AK>0, SUMIF(AJ:AJ, AK, Y:Y), 0)`. Column Y is that same Product Price times negative Required Quantity, after a sell has been signed negative. The master uses that same sum on every live leg it kept. A repeated row stays when the price, the spread, or the quantity differs, so Nifty Accelerator 671 contributes all four prices. An exact second paste of the same row still drops, so the sum is not doubled. **43** products keep at least one repeated strike.

The six series codes whose leg count in one FY file differs from the master are the shorter original issue. The master keeps the later book: the Apr'22–Mar'23 ladder for ARG22DMFSP06-Series 1, and the rollover books for ARG22SP12 Series IX, ARG22SP25 Series VI, ARG22SP30 Series II, ARG22SP42 Series III, and ARG22SP03 Series IV.

## What the eight Excel files do not contain

The expired in-the-money price for an original Buy, paid in as a positive Premium Outflow, is the desk rule. The reference Excel files leave an expired buy at zero. Every other quote identity checked here is the Excel one: Amount with NBFC subtracts the cost block and the margin funds, and NBFC Grown Value compounds those two pots at the product discount rate and the margin funding rate. The vol mark still interpolates Strike Change % against the month's 100% anchor. The Excel MarketData sheet can sit on a frozen absolute-strike row. That difference is unchanged.

