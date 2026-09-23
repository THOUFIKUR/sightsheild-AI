# PILOT_PROTOCOL_30SEC.md
<!-- SIH26038 — Pilot Protocol for the <30-Second Ophthalmologist Review Claim -->

> [!CAUTION]
> **INFORMAL PILOT — NOT CLINICAL VALIDATION**
> This protocol is a lightweight, self-organized timing study.
> It is NOT an IRB-approved clinical trial, NOT a peer-reviewed study, and
> does NOT constitute clinical evidence of <30-second review.
> It provides honest pilot evidence to support (or refute) the claim with real data.

---

## Why This Protocol Exists

The Problem Statement states ophthalmologists can review and accept/reject a
RetinaScan AI report in <30 seconds. **No code path produces this number.**
It is a human-factors measurement that requires literally timing a real reviewer.

Presenting an unmeasured claim in front of judges is weaker than presenting
an honest small pilot with real numbers — even if the pilot shows >30 seconds.

---

## Protocol Design

### Step 1 — Generate 10 Reports

Generate exactly **10 full annotated screening reports** from the pipeline,
covering a mix of ICDR grades:

| Report # | Target Grade | Image Source |
|----------|-------------|--------------|
| 1        | Grade 0     | IDRiD sample or uploaded fundus |
| 2        | Grade 1     | IDRiD sample |
| 3        | Grade 1     | IDRiD sample |
| 4        | Grade 2     | IDRiD sample |
| 5        | Grade 2     | IDRiD sample |
| 6        | Grade 3     | IDRiD sample |
| 7        | Grade 3     | IDRiD sample |
| 8        | Grade 4     | IDRiD sample |
| 9        | Grade 4     | IDRiD sample |
| 10       | Grade 0     | IDRiD sample |

Each report must include:
- DR severity grade + confidence
- Lesion findings (MA count, hemorrhage count, exudate detection)
- OD + fovea localization (if available)
- Heatmap overlay (Grad-CAM if verified, labeled heuristic if fallback)
- Referral urgency recommendation
- Explicit Grad-CAM status label (VERIFIED / NOT VERIFIED / HEURISTIC FALLBACK)

### Step 2 — Select Reviewer

Choose one of:
- A medical doctor (any specialty)
- A senior MBBS/MD student (final year+)
- An ophthalmology resident or fellow
- A clinically-trained mentor

The reviewer must be **clinically-informed** — able to understand a DR screening report.
The reviewer must review each report **cold** (no prior knowledge of the case).

### Step 3 — Conduct Timed Review

For each report:
1. Present the report (print or screen — consistent across all 10)
2. Start a stopwatch when the reviewer begins reading
3. Stop when reviewer says "accept" or "reject" (or "needs more info")
4. Record: report number, reviewer decision (accept/reject), time in seconds

Record honestly. **Do not discard results >30 seconds.**

### Step 4 — Record Results

Fill in the table below after the pilot:

| Report # | Grade | Decision | Time (sec) |
|----------|-------|----------|-----------|
| 1        |       |          |           |
| 2        |       |          |           |
| 3        |       |          |           |
| 4        |       |          |           |
| 5        |       |          |           |
| 6        |       |          |           |
| 7        |       |          |           |
| 8        |       |          |           |
| 9        |       |          |           |
| 10       |       |          |           |

**Summary statistics (compute after pilot):**

| Metric | Value |
|--------|-------|
| Mean review time (sec) | |
| Median review time (sec) | |
| Minimum (sec) | |
| Maximum (sec) | |
| Acceptance rate (%) | |
| N reviewers | 1 (informal) |
| Reviewer qualification | |
| Date conducted | |

### Step 5 — Label Honestly in Presentation

Present the data with this exact label in your SIH submission/demo:

> **INFORMAL PILOT — NOT CLINICAL VALIDATION**
> N=10 reports, 1 clinically-informed reviewer.
> Mean review time: [X] seconds (range [min]–[max] sec).
> This is a small informal pilot providing preliminary evidence, not a clinical trial.

---

## What to Do if Results > 30 Seconds

If mean review time exceeds 30 seconds:
1. **Report the real number** — do not adjust or exclude outliers
2. Investigate why (report too long? heatmap unclear? too much text?)
3. Improve report design and re-run the pilot
4. At the demo, present the improved result with both original and revised data

A 35-second honest pilot is far stronger than an unsubstantiated <30-second claim.

---

*Generated for SIH26038 — THOUFIKUR/sih2026*
*INFORMAL PILOT — NOT CLINICAL VALIDATION*
