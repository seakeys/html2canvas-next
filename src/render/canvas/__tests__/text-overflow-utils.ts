import {deepStrictEqual, strictEqual} from 'assert';
import {TextBounds} from '../../../css/layout/text';
import {Bounds} from '../../../css/layout/bounds';
import {filterValidBounds, groupBoundsIntoLines} from '../text-overflow-utils';

// Shorthand: create a TextBounds with explicit geometry.
const tb = (text: string, left: number, top: number, width: number, height: number): TextBounds =>
    new TextBounds(text, new Bounds(left, top, width, height));

// Extract just the text strings from each line for readable assertions.
const lineTexts = (lines: TextBounds[][]): string[][] => lines.map((line) => line.map((b) => b.text));

// ─────────────────────────────────────────────────────────────────────────────
// filterValidBounds
// ─────────────────────────────────────────────────────────────────────────────
describe('filterValidBounds', () => {
    it('passes through a bound with positive width and height', () => {
        const b = tb('a', 10, 8, 8, 14);
        deepStrictEqual(filterValidBounds([b]), [b]);
    });

    it('passes through a bound with positive height but zero width (zero-width joiner etc.)', () => {
        const b = tb('\u200b', 10, 8, 0, 14);
        deepStrictEqual(filterValidBounds([b]), [b]);
    });

    it('passes through a bound with positive width but zero height', () => {
        const b = tb('x', 10, 8, 8, 0);
        deepStrictEqual(filterValidBounds([b]), [b]);
    });

    it('removes a Bounds.EMPTY (width=0, height=0)', () => {
        const empty = tb('x', 0, 0, 0, 0);
        const real = tb('a', 10, 8, 8, 14);
        deepStrictEqual(filterValidBounds([empty, real]), [real]);
    });

    it('removes multiple empty bounds mixed in with real ones', () => {
        const empties = [tb('p', 0, 0, 0, 0), tb('q', 0, 0, 0, 0)];
        const reals = [tb('a', 10, 8, 8, 14), tb('b', 18, 8, 8, 14)];
        deepStrictEqual(filterValidBounds([empties[0], reals[0], empties[1], reals[1]]), reals);
    });

    it('returns an empty array when every bound is empty', () => {
        deepStrictEqual(filterValidBounds([tb('x', 0, 0, 0, 0), tb('y', 0, 0, 0, 0)]), []);
    });

    it('returns an empty array for empty input', () => {
        deepStrictEqual(filterValidBounds([]), []);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// groupBoundsIntoLines
// ─────────────────────────────────────────────────────────────────────────────
describe('groupBoundsIntoLines', () => {
    it('returns an empty array for empty input', () => {
        deepStrictEqual(groupBoundsIntoLines([]), []);
    });

    it('puts a single bound in its own line', () => {
        const lines = groupBoundsIntoLines([tb('a', 0, 8, 8, 14)]);
        strictEqual(lines.length, 1);
        deepStrictEqual(lineTexts(lines), [['a']]);
    });

    it('groups bounds at exactly the same top into one line', () => {
        const bounds = [tb('a', 0, 8, 8, 14), tb('b', 8, 8, 8, 14), tb('c', 16, 8, 8, 14)];
        deepStrictEqual(lineTexts(groupBoundsIntoLines(bounds)), [['a', 'b', 'c']]);
    });

    // ── Regression: Math.round(8.4)=8 and Math.round(8.6)=9 split the same
    //    visual line into two entries. Tolerance-based grouping merges them.
    it('groups CJK characters whose tops straddle a 0.5 px rounding boundary (regression)', () => {
        const bounds = [
            tb('这', 0, 8.4, 14, 14),
            tb('是', 14, 8.6, 14, 14),
            tb('一', 28, 8.1, 14, 14),
            tb('段', 42, 8.9, 14, 14)
        ];
        const lines = groupBoundsIntoLines(bounds);
        strictEqual(lines.length, 1, 'all four characters should be on the same visual line');
    });

    it('groups characters with sub-pixel top variation (< height/2) into one line', () => {
        // height=14 → tolerance=7; all tops within 0–1 px of each other → same line
        const bounds = [tb('x', 0, 8.0, 8, 14), tb('y', 8, 8.3, 8, 14), tb('z', 16, 7.8, 8, 14)];
        strictEqual(groupBoundsIntoLines(bounds).length, 1);
    });

    it('splits two visual lines separated by a full line-height gap (line-height: 1.6, font-size: 14px)', () => {
        // gap = 22.4 px; tolerance = 14 * 0.5 = 7 → 22.4 > 7 → new line
        const line1 = [tb('a', 0, 8, 8, 14), tb('b', 8, 8, 8, 14)];
        const line2 = [tb('c', 0, 30.4, 8, 14), tb('d', 8, 30.4, 8, 14)];
        const lines = groupBoundsIntoLines([...line1, ...line2]);
        strictEqual(lines.length, 2);
        deepStrictEqual(lineTexts(lines), [['a', 'b'], ['c', 'd']]);
    });

    it('correctly separates three visual lines (regression: clamp=2 showed only 1 line)', () => {
        // Mirrors the -webkit-line-clamp: 2 scenario with a third overflow line
        const bounds = [
            tb('L1a', 0, 8, 24, 14), tb('L1b', 24, 8, 24, 14),
            tb('L2a', 0, 30.4, 24, 14), tb('L2b', 24, 30.4, 24, 14),
            tb('L3a', 0, 52.8, 24, 14)
        ];
        const lines = groupBoundsIntoLines(bounds);
        strictEqual(lines.length, 3);
        deepStrictEqual(lineTexts(lines), [['L1a', 'L1b'], ['L2a', 'L2b'], ['L3a']]);
    });

    it('sorts lines top-to-bottom regardless of input order', () => {
        // Line 2 is given before line 1 in the input
        const bounds = [
            tb('L2', 0, 30.4, 8, 14),
            tb('L1a', 0, 8, 8, 14),
            tb('L1b', 8, 8, 8, 14)
        ];
        const lines = groupBoundsIntoLines(bounds);
        strictEqual(lines.length, 2);
        deepStrictEqual(lineTexts(lines)[0], ['L1a', 'L1b']); // line 1 comes first
        deepStrictEqual(lineTexts(lines)[1], ['L2']);
    });

    it('sorts bounds within each line left-to-right regardless of input order', () => {
        // Bounds given right-to-left
        const bounds = [tb('c', 16, 8, 8, 14), tb('a', 0, 8, 8, 14), tb('b', 8, 8, 8, 14)];
        deepStrictEqual(lineTexts(groupBoundsIntoLines(bounds)), [['a', 'b', 'c']]);
    });

    it('works with line-height: 1.0 (tight spacing: gap = font-size = 14 px)', () => {
        // tolerance = 7; gap = 14 > 7 → still splits correctly
        const bounds = [
            tb('a', 0, 0, 8, 14),
            tb('b', 0, 14, 8, 14)
        ];
        strictEqual(groupBoundsIntoLines(bounds).length, 2);
    });

    it('works with large line-height: 2.0 (gap = 28 px)', () => {
        // height from getClientRects may equal lineHeight (28), tolerance = 14; gap 28 > 14 → splits
        const bounds = [
            tb('a', 0, 0, 8, 28),
            tb('b', 0, 28, 8, 28)
        ];
        strictEqual(groupBoundsIntoLines(bounds).length, 2);
    });

    it('filters out zero-area phantom bounds before grouping when used with filterValidBounds', () => {
        // Regression for -webkit-line-clamp: phantom Bounds.EMPTY had top=0 and
        // consumed a renderLineCount slot, making the last visible line disappear.
        const phantom = tb('hidden', 0, 0, 0, 0);
        const line1 = [tb('L1a', 0, 8, 24, 14), tb('L1b', 24, 8, 24, 14)];
        const line2 = [tb('L2a', 0, 30.4, 24, 14)];

        const input = [phantom, ...line1, ...line2];
        const lines = groupBoundsIntoLines(filterValidBounds(input));
        strictEqual(lines.length, 2, 'phantom bound must not create a third line entry');
        deepStrictEqual(lineTexts(lines), [['L1a', 'L1b'], ['L2a']]);
    });
});
