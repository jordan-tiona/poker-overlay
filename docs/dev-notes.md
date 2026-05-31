# Dev Notes

## OCR / Dealer-Chip Position Detection

Table is always 9-max on Ignition. Overlay and game are on the SAME screen. Ignition uses
DirectX so window thumbnail is a black frame — capture falls back to screen source (1920×1080).
Game window is 1920×1039, so yScale = 1039/1080 = 0.962 is applied to all y-coordinates.

**Capture chain:**
- Main process finds "$X/$Y No Limit Hold'em" window → thumbnail is black (GPU barrier)
- Falls back to first non-black screen source
- Passes windowHeight (1039) so renderer can compute yScale

**Calibration anchor (ground truth from gto-capture.png):**
- D chip at seat 9 (lower-right visual = position 7 clockwise from hero going LEFT)
- Screen pixel: (1060, 441) in 1920×1080 capture
- Calibrated: x_cal=0.552, y_cal=441/1039=0.424
- Region: { x: 0.525, y: 0.404, w: 0.065, h: 0.048 } — index 7 in DEALER_CHIP_SEATS_9MAX

**Position mapping (9-max clockwise from hero, going LEFT on screen):**
0=BTN, 1=CO, 2=HJ, 3=LJ, 4=UTG+2, 5=UTG+1, 6=UTG, 7=BB, 8=SB

**Known false-positive sources in D-chip detection:**
- Index 0 (hero=BTN): hero hole-card white faces score as silver chips
- Index 5 (top-right): orange active-player indicator for that seat bleeds in
- 6-max regions: not calibrated for 9-max, sometimes beat 9-max scores coincidentally

**Seats 1–6, 8: estimated only (15% of seat→centre vector). Need ground-truth screenshots.**
Workflow: Ctrl+Shift+D saves gto-capture.png to Desktop. Drop in chat with actual position.

**Card OCR behaviour:**
- Face-up cards: Tesseract takes ~200-500ms/call, returns rank+suit
- Face-down cards (hero folded, pre-deal): Tesseract returns instantly (~2ms) with empty string → cards=— is correct
- Suit detection uses 4-color pixel sampling; may still misclassify some suits
- Board reading works; hero card regions at y_cal≈0.468, w=0.052, h=0.090
