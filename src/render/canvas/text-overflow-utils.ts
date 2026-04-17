import {TextBounds} from '../../css/layout/text';

/**
 * Remove zero-area TextBounds before line-grouping.
 *
 * `Bounds.EMPTY` (width=0, height=0) is returned by `fromDOMRectList` when
 * `getClientRects()` yields only zero-width rects — e.g. collapsed whitespace
 * or text in a `-webkit-line-clamp` area the browser marks as layout-absent.
 * Their `top=0` sorts them before all real content, producing a phantom
 * `lines[0]` that wastes one `renderLineCount` slot and causes the last
 * visible clamp-line to disappear.
 */
export const filterValidBounds = (bounds: TextBounds[]): TextBounds[] =>
    bounds.filter((b) => b.bounds.width > 0 || b.bounds.height > 0);

/**
 * Group an array of TextBounds into visual lines.
 *
 * Bounds are sorted top-to-bottom first. A new line begins when the `top`
 * coordinate jumps by more than **half the character height** — well below
 * the inter-line gap (≈ lineHeight) but well above sub-pixel top variation
 * within a single visual line.
 *
 * `Math.round(top)` as a grouping key is unreliable: CJK characters on the
 * same visual line can have tops such as 8.4 and 8.6 that round to different
 * integers, falsely splitting one visual line into two entries and misplacing
 * the ellipsis for `-webkit-line-clamp`.
 *
 * Bounds within each line are sorted left-to-right.
 */
export const groupBoundsIntoLines = (bounds: TextBounds[]): TextBounds[][] => {
    const sorted = bounds.slice().sort((a, b) => a.bounds.top - b.bounds.top || a.bounds.left - b.bounds.left);
    const lines: TextBounds[][] = [];
    for (const bound of sorted) {
        const lastLine = lines[lines.length - 1];
        const tolerance = bound.bounds.height * 0.5;
        if (!lastLine || bound.bounds.top - lastLine[0].bounds.top > tolerance) {
            lines.push([bound]);
        } else {
            lastLine.push(bound);
        }
    }
    lines.forEach((line) => line.sort((a, b) => a.bounds.left - b.bounds.left));
    return lines;
};
