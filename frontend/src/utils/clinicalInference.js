// clinicalInference.js — deterministic post-processing shared by online result handling and tests.
// Coordinates are always interpreted in the original image pixel space.

export const LESION_TYPES = Object.freeze({
    hemorrhage: 'hemorrhages',
    microaneurysm: 'microaneurysms',
    exudate: 'hard_exudates',
});

const emptyQuadrants = () => ({
    'Superior-Temporal': 0,
    'Superior-Nasal': 0,
    'Inferior-Nasal': 0,
    'Inferior-Temporal': 0,
});

function lesionType(name = '') {
    const value = String(name).toLowerCase();
    if (value.includes('hemorrhag')) return LESION_TYPES.hemorrhage;
    if (value.includes('microaneurysm')) return LESION_TYPES.microaneurysm;
    if (value.includes('exudate') || value.includes('cotton wool')) return LESION_TYPES.exudate;
    return null;
}

/**
 * Aggregate YOLO detections using the same pixel-space geometry as the API.
 * This deliberately accepts both [x1,y1,x2,y2] and malformed boxes safely.
 */
export function aggregateLesions(detections = [], width = 1, height = 1) {
    const foveaX = width * 0.5;
    const foveaY = height * 0.5;
    const discDiameter = Math.max(width * 0.15, 50);
    const quadrantDistribution = emptyQuadrants();
    let microaneurysms = 0;
    let hemorrhages = 0;
    let hardExudates = 0;
    let minFoveaDistDD = Infinity;

    for (const detection of detections) {
        const box = detection?.bbox;
        if (!Array.isArray(box) || box.length < 4) continue;
        const [x1, y1, x2, y2] = box.map(Number);
        if (![x1, y1, x2, y2].every(Number.isFinite)) continue;
        const cx = (x1 + x2) / 2;
        const cy = (y1 + y2) / 2;
        const quadrant = cx < foveaX && cy < foveaY ? 'Superior-Temporal'
            : cx >= foveaX && cy < foveaY ? 'Superior-Nasal'
                : cx >= foveaX && cy >= foveaY ? 'Inferior-Nasal' : 'Inferior-Temporal';
        detection.quadrant = quadrant;
        const type = lesionType(detection.class_name);
        if (type === LESION_TYPES.hemorrhage) {
            hemorrhages += 1;
            quadrantDistribution[quadrant] += 1;
        } else if (type === LESION_TYPES.microaneurysm) {
            microaneurysms += 1;
        } else if (type === LESION_TYPES.exudate) {
            hardExudates += 1;
            minFoveaDistDD = Math.min(minFoveaDistDD,
                Math.hypot(cx - foveaX, cy - foveaY) / discDiameter);
        }
    }

    return {
        microaneurysms,
        hemorrhages,
        hard_exudates: hardExudates,
        quadrant_distribution: quadrantDistribution,
        has_macular_edema: hardExudates > 0 && minFoveaDistDD <= 1,
        fovea_exudate_dist_dd: hardExudates ? Number(minFoveaDistDD.toFixed(2)) : null,
        etdrs_4_2_1_met: Object.values(quadrantDistribution).every(count => count >= 20),
    };
}

export function arbitrateGrade(nnGrade, detections, width, height) {
    const lesions = aggregateLesions(detections, width, height);
    let finalGrade = Number.isInteger(nnGrade) ? nnGrade : 0;
    let clinicalRuleApplied = 'ICDR Softmax Consensus';
    if (lesions.etdrs_4_2_1_met && finalGrade < 3) {
        finalGrade = 3;
        clinicalRuleApplied = 'ETDRS 4-2-1 Rule: ≥20 hemorrhages in all 4 quadrants (Severe NPDR)';
    } else if (finalGrade === 0 && (lesions.microaneurysms > 0 || lesions.hemorrhages > 0)) {
        finalGrade = 1;
        clinicalRuleApplied = 'ICDR Rule: Focal lesions detected in early scan (Mild NPDR)';
    }
    return {
        final_grade: finalGrade,
        is_referable: finalGrade >= 2 || lesions.has_macular_edema,
        has_macular_edema: lesions.has_macular_edema,
        fovea_exudate_dist_dd: lesions.fovea_exudate_dist_dd,
        clinical_rule_applied: clinicalRuleApplied,
        lesion_summary: lesions,
    };
}
