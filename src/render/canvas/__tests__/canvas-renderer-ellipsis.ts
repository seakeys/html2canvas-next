/**
 * Integration tests for the text-overflow / -webkit-line-clamp rendering path
 * in CanvasRenderer.
 *
 * Strategy
 * --------
 * • Supply TextBounds whose `bounds` (left/top/width/height) come from
 *   a "DOM layout" we control directly — no real browser layout needed.
 * • Mock ctx.measureText() to return intentionally *different* widths than
 *   the DOM bounds; this is exactly the condition that triggered Bug 1
 *   (canvas drift cutting off "over") and Bug 2 (tolerance including "long").
 * • Spy on ctx.fillText() to collect every text fragment actually painted,
 *   then assert inclusion / exclusion of specific words and "…".
 *
 * The two jest.mock() calls below break the circular ElementContainer ↔
 * node-parser dependency that would otherwise cause a "Class extends undefined"
 * error in jsdom; the same technique is used in src/__tests__/index.ts.
 */

// Must appear before any imports that load the affected modules.
jest.mock('../../../dom/node-parser', () => ({
    isHTMLElementNode: jest.fn().mockReturnValue(true),
    isBodyElement: jest.fn().mockReturnValue(false),
    isHTMLElement: jest.fn().mockReturnValue(false)
}));

jest.mock('../../../render/stacking-context', () => ({
    parseStackingContexts: jest.fn(),
    StackingContext: jest.fn()
}));

import {TextBounds} from '../../../css/layout/text';
import {Bounds} from '../../../css/layout/bounds';
import {CanvasRenderer, RenderConfigurations} from '../canvas-renderer';
import {CSSParsedDeclaration, TEXT_OVERFLOW} from '../../../css';
import {Context} from '../../../core/context';
import {ElementContainer} from '../../../dom/element-container';
import {PAINT_ORDER_LAYER} from '../../../css/property-descriptors/paint-order';
import {DIRECTION} from '../../../css/property-descriptors/direction';
import {pack} from '../../../css/types/color';
import {ZERO_LENGTH} from '../../../css/types/length-percentage';
import {TokenType, FLAG_INTEGER} from '../../../css/syntax/tokenizer';

// ─── helpers ─────────────────────────────────────────────────────────────────

const tb = (text: string, left: number, top: number, width: number, height: number): TextBounds =>
    new TextBounds(text, new Bounds(left, top, width, height));

/** Build the minimal style object needed by renderTextNodesWithEllipsis. */
const makeStyles = (overrides: Record<string, unknown> = {}): CSSParsedDeclaration =>
    ({
        // font (needed by createFontStyle)
        fontStyle: 'normal',
        fontVariant: [],
        fontWeight: 400,
        fontSize: {type: TokenType.DIMENSION_TOKEN, flags: FLAG_INTEGER, number: 14, unit: 'px'},
        fontFamily: ['sans-serif'],
        // layout
        letterSpacing: 0,
        direction: DIRECTION.LTR,
        // overflow / clamp (set per test via overrides)
        textOverflow: TEXT_OVERFLOW.ELLIPSIS,
        webkitLineClamp: 0,
        // paint (needed by renderTextBoundWithStyles)
        paintOrder: [PAINT_ORDER_LAYER.FILL],
        color: pack(0, 0, 0, 1),
        textShadow: [],
        textDecorationLine: [],
        textDecorationColor: pack(0, 0, 0, 1),
        webkitTextStrokeWidth: 0,
        webkitTextStrokeColor: pack(0, 0, 0, 1),
        // padding / border (used by contentBox — all zero → contentBox = container.bounds)
        paddingLeft: ZERO_LENGTH,
        paddingRight: ZERO_LENGTH,
        paddingTop: ZERO_LENGTH,
        paddingBottom: ZERO_LENGTH,
        borderLeftWidth: 0,
        borderRightWidth: 0,
        borderTopWidth: 0,
        borderBottomWidth: 0,
        ...overrides
    } as unknown as CSSParsedDeclaration);

/** Minimal container mock. textNodeGroups is one array per textNode. */
const makeContainer = (
    textNodeGroups: TextBounds[][],
    containerBounds: Bounds,
    styles: CSSParsedDeclaration
): ElementContainer =>
    ({
        bounds: containerBounds,
        styles,
        textNodes: textNodeGroups.map((textBounds) => ({textBounds}))
    } as unknown as ElementContainer);

// ─── test setup ──────────────────────────────────────────────────────────────

/**
 * Create a CanvasRenderer whose measureText returns a DIFFERENT width than
 * what the DOM bounds carry. This simulates the canvas ↔ DOM measurement drift
 * that caused Bugs 1 and 2.
 *
 * canvasCharWidth : pixels returned by ctx.measureText per character
 * ellipsisCanvasWidth : pixels returned for the "…" glyph
 *
 * jsdom does NOT implement HTMLCanvasElement.getContext('2d') — it returns null.
 * We therefore build a fully-mocked 2D context object and wrap it in a mock
 * canvas so CanvasRenderer.constructor receives a usable ctx without needing
 * the `canvas` npm package.
 */
function makeRenderer(canvasCharWidth: number, ellipsisCanvasWidth: number): {
    renderer: CanvasRenderer;
    drawnTexts: string[];
} {
    const drawnTexts: string[] = [];

    // Build a mock CanvasRenderingContext2D.
    // Only properties/methods actually touched by CanvasRenderer constructor
    // and the renderTextNodesWithEllipsis → renderTextBoundWithStyles call chain
    // need to be present; everything else can be omitted.
    const mockCtx = {
        // Settable state properties (plain writable values — no jest.fn needed)
        font: '',
        direction: 'ltr' as CanvasDirection,
        textAlign: 'left' as CanvasTextAlign,
        textBaseline: 'bottom' as CanvasTextBaseline,
        fillStyle: '' as string | CanvasGradient | CanvasPattern,
        strokeStyle: '' as string | CanvasGradient | CanvasPattern,
        shadowColor: '',
        shadowOffsetX: 0,
        shadowOffsetY: 0,
        shadowBlur: 0,
        lineWidth: 0,
        lineJoin: 'miter' as CanvasLineJoin,
        globalAlpha: 1,
        // Method stubs (called by constructor + rendering helpers)
        scale: jest.fn(),
        translate: jest.fn(),
        transform: jest.fn(),
        save: jest.fn(),
        restore: jest.fn(),
        clip: jest.fn(),
        beginPath: jest.fn(),
        moveTo: jest.fn(),
        lineTo: jest.fn(),
        closePath: jest.fn(),
        fillRect: jest.fn(),
        strokeText: jest.fn(),
        drawImage: jest.fn(),
        arc: jest.fn(),
        fill: jest.fn(),
        stroke: jest.fn(),
        // The two methods under test — controlled implementations:
        measureText: jest.fn().mockImplementation((text: string): TextMetrics => {
            const width = text === '\u2026' ? ellipsisCanvasWidth : text.split('').length * canvasCharWidth;
            return {width} as TextMetrics;
        }),
        fillText: jest.fn().mockImplementation((text: string) => {
            drawnTexts.push(text);
        })
    } as unknown as CanvasRenderingContext2D;

    // Wrap the mock ctx in a mock canvas so the constructor's
    // `this.ctx = this.canvas.getContext('2d')` receives our object.
    const mockCanvas = {
        getContext: jest.fn().mockReturnValue(mockCtx),
        width: 600,
        height: 300,
        style: {}
    } as unknown as HTMLCanvasElement;

    const context = {
        logger: {debug: jest.fn(), error: jest.fn(), warn: jest.fn()},
        windowBounds: new Bounds(0, 0, 2000, 2000)
    } as unknown as Context;

    const options: RenderConfigurations = {
        scale: 1,
        x: 0,
        y: 0,
        width: 600,
        height: 300,
        backgroundColor: pack(255, 255, 255, 1),
        canvas: mockCanvas
    };

    const renderer = new CanvasRenderer(context, options);
    return {renderer, drawnTexts};
}

// Expose private method for testing.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const callEllipsis = (renderer: CanvasRenderer, container: ElementContainer, styles: CSSParsedDeclaration) =>
    (renderer as any).renderTextNodesWithEllipsis(container, styles);

// ─── single-line ellipsis ────────────────────────────────────────────────────

describe('CanvasRenderer — single-line text-overflow: ellipsis', () => {
    afterEach(() => jest.restoreAllMocks());

    /**
     * Bug 1 regression — "over" was cut off when canvas measurements for
     * preceding words accumulated to a larger sum than the DOM reported.
     *
     * Setup (content box 0→200, ellipsis=10 → availableRight=190):
     *   DOM positions:       "fox "(0→32)  "jumps "(32→80)  "over"(80→108)  " the..."(108→...)
     *   canvas char width:   15 px  (inflated vs DOM's 8 px/char)
     *
     * OLD code: accumulated canvas widths for "fox "(60) + "jumps "(90) = 150;
     *           150 + canvas("over")=60 = 210 > 190 → "over" EXCLUDED.
     * NEW code: domBoundRight("over") = 108 ≤ 190 → "over" INCLUDED ✓
     */
    it('includes a word whose DOM right edge fits even when canvas drift would have cut it off (Bug 1)', async () => {
        const styles = makeStyles();
        const {renderer, drawnTexts} = makeRenderer(15, 10); // canvas 15px/char, ellipsis 10px

        // Content box: left=0, width=200 → contentRight=200, availableRight=190
        const container = makeContainer(
            [[
                tb('fox ', 0, 8, 32, 14),    // 4 chars × 8px DOM = 32px; right=32  ≤ 190 ✓
                tb('jumps ', 32, 8, 48, 14),  // 6 chars; right=80  ≤ 190 ✓
                tb('over', 80, 8, 28, 14),    // 4 chars; right=108 ≤ 190 ✓  ← key word
                tb(' the', 108, 8, 32, 14),   // right=140 ≤ 190 ✓ (also fits, but next…)
                tb(' lazy', 140, 8, 40, 14),  // right=180 ≤ 190 ✓
                tb(' dog', 180, 8, 200, 14)   // right=380 > 190 → triggers overflow/truncation
            ]],
            new Bounds(0, 0, 200, 22),
            styles
        );

        await callEllipsis(renderer, container, styles);

        expect(drawnTexts).toContain('over');
        expect(drawnTexts).toContain('\u2026');
    });

    /**
     * Bug 2 regression — a word that overflows by a fraction of a pixel must
     * NOT be included as a whole word.
     *
     * Setup (content box 0→100, ellipsis=10 → availableRight=90):
     *   "AB"(0→18)  " "(18→26)  "CD"(26→44)  " "(44→52)  "EF"(52→70)
     *   "GH"(70→90.3)  ← domBoundRight=90.3 > availableRight=90 → must be truncated
     *
     * OLD code with +0.5 tolerance: 90.3 ≤ 90.5 → "GH" included whole (wrong).
     * NEW code with strict ≤:       90.3 > 90.0 → "GH" truncated ✓
     */
    it('truncates a word whose DOM right edge exceeds availableRight by a sub-pixel (Bug 2)', async () => {
        const styles = makeStyles();
        // canvasCharWidth=15px, ellipsis=10px → availableRight=90
        // 'GH' DOM right=90.3 → truncation path; remaining=90-70=20px.
        // G(15) fits (15≤20) but H does not (30>20) → truncatedText='G' ≠ 'GH'.
        // OLD code (domBoundRight ≤ availableRight + 0.5): 90.3 ≤ 90.5 → 'GH' included whole.
        // NEW code (strict ≤):                             90.3 > 90   → truncation → 'G'.
        const {renderer, drawnTexts} = makeRenderer(15, 10);

        const container = makeContainer(
            [[
                tb('AB', 0, 8, 18, 14),
                tb(' ', 18, 8, 8, 14),
                tb('CD', 26, 8, 18, 14),
                tb(' ', 44, 8, 8, 14),
                tb('EF', 52, 8, 18, 14),          // right=70 ≤ 90 → fits whole
                tb('GH', 70, 8, 20.3, 14),         // right=90.3 > 90 → must truncate
                tb('IJ', 90.3, 8, 200, 14)         // way beyond → irrelevant
            ]],
            new Bounds(0, 0, 100, 22),
            styles
        );

        await callEllipsis(renderer, container, styles);

        expect(drawnTexts).toContain('EF');
        // "GH" as a whole word must NOT appear; only the truncated prefix 'G' is allowed
        expect(drawnTexts).not.toContain('GH');
        expect(drawnTexts).toContain('G'); // truncated prefix
        expect(drawnTexts).toContain('\u2026');
    });

    it('renders nothing when no bounds overflow the container', async () => {
        // All words fit; lineRight ≤ contentRight → no ellipsis line detected
        const styles = makeStyles();
        const {renderer, drawnTexts} = makeRenderer(8, 10);

        const container = makeContainer(
            [[tb('Hi', 0, 8, 16, 14)]],
            new Bounds(0, 0, 200, 22),
            styles
        );

        await callEllipsis(renderer, container, styles);

        expect(drawnTexts).toContain('Hi');
        expect(drawnTexts).not.toContain('\u2026');
    });

    it('renders nothing when allBounds is empty after filtering', async () => {
        const styles = makeStyles();
        const {renderer, drawnTexts} = makeRenderer(8, 10);

        // Only a Bounds.EMPTY (phantom bound — filtered out)
        const container = makeContainer(
            [[new TextBounds('x', new Bounds(0, 0, 0, 0))]],
            new Bounds(0, 0, 200, 22),
            styles
        );

        await callEllipsis(renderer, container, styles);

        expect(drawnTexts).toHaveLength(0);
    });
});

// ─── -webkit-line-clamp ──────────────────────────────────────────────────────

describe('CanvasRenderer — -webkit-line-clamp', () => {
    afterEach(() => jest.restoreAllMocks());

    /**
     * Bug 3 regression — with clamp=2 the canvas only showed one visual line.
     *
     * Root cause: Bounds.EMPTY (top=0) was sorted first and created a phantom
     * lines[0] that consumed one renderLineCount slot; real line 2 was never
     * reached.
     *
     * With the fix (filterValidBounds + groupBoundsIntoLines), both visual
     * lines are rendered and the ellipsis appears at the end of line 2.
     */
    it('renders clampCount=2 visual lines and appends ellipsis at line 2 (Bug 3 regression)', async () => {
        const styles = makeStyles({textOverflow: TEXT_OVERFLOW.CLIP, webkitLineClamp: 2});
        const {renderer, drawnTexts} = makeRenderer(8, 10);

        // line 1: top=8    line 2: top=30.4    line 3 (overflow): top=52.8
        // phantom Bounds.EMPTY at (0,0,0,0) simulates webkit-line-clamp layout-absent text
        const container = makeContainer(
            [[
                new TextBounds('phantom', new Bounds(0, 0, 0, 0)), // must be filtered
                tb('L1a', 0, 8, 24, 14),
                tb('L1b', 24, 8, 24, 14),
                tb('L2a', 0, 30.4, 24, 14),
                tb('L2b', 24, 30.4, 24, 14),
                tb('L3a', 0, 52.8, 24, 14)  // overflow — renderLineCount=2 stops before here
            ]],
            new Bounds(0, 0, 200, 50),
            styles
        );

        await callEllipsis(renderer, container, styles);

        // Both visible lines must have been drawn
        expect(drawnTexts).toContain('L1a');
        expect(drawnTexts).toContain('L1b');
        expect(drawnTexts).toContain('L2a');
        // Overflow line must NOT be drawn
        expect(drawnTexts).not.toContain('L3a');
        // Ellipsis must appear (placed at end of line 2)
        expect(drawnTexts).toContain('\u2026');
    });

    it('renders clampCount=3 and stops before overflow line 4', async () => {
        const styles = makeStyles({textOverflow: TEXT_OVERFLOW.CLIP, webkitLineClamp: 3});
        const {renderer, drawnTexts} = makeRenderer(8, 10);

        const container = makeContainer(
            [[
                tb('L1', 0, 8, 16, 14),
                tb('L2', 0, 30.4, 16, 14),
                tb('L3', 0, 52.8, 16, 14),
                tb('L4', 0, 75.2, 16, 14)  // overflow
            ]],
            new Bounds(0, 0, 200, 75),
            styles
        );

        await callEllipsis(renderer, container, styles);

        expect(drawnTexts).toContain('L1');
        expect(drawnTexts).toContain('L2');
        expect(drawnTexts).toContain('L3');
        expect(drawnTexts).not.toContain('L4');
        expect(drawnTexts).toContain('\u2026');
    });

    it('does NOT add an ellipsis when text fits within clampCount lines (no overflow)', async () => {
        // lines.length (2) is NOT > clampCount (3) → hasLineClamp=false → no ellipsis
        const styles = makeStyles({textOverflow: TEXT_OVERFLOW.CLIP, webkitLineClamp: 3});
        const {renderer, drawnTexts} = makeRenderer(8, 10);

        const container = makeContainer(
            [[
                tb('L1', 0, 8, 16, 14),
                tb('L2', 0, 30.4, 16, 14)
            ]],
            new Bounds(0, 0, 200, 75),
            styles
        );

        await callEllipsis(renderer, container, styles);

        expect(drawnTexts).toContain('L1');
        expect(drawnTexts).toContain('L2');
        expect(drawnTexts).not.toContain('\u2026');
    });

    it('phantom Bounds.EMPTY bounds do not create extra line slots', async () => {
        // Two phantoms + two real visual lines + one overflow line.
        // Without filtering: lines[0]=phantom, lines[1]=phantom, renderLineCount=2 →
        //   L1 and L2 never rendered.
        // With filtering: lines[0]=L1, lines[1]=L2, renderLineCount=2 → both rendered ✓
        const styles = makeStyles({textOverflow: TEXT_OVERFLOW.CLIP, webkitLineClamp: 2});
        const {renderer, drawnTexts} = makeRenderer(8, 10);

        const container = makeContainer(
            [[
                new TextBounds('p1', new Bounds(0, 0, 0, 0)),
                new TextBounds('p2', new Bounds(0, 0, 0, 0)),
                tb('L1', 0, 8, 16, 14),
                tb('L2', 0, 30.4, 16, 14),
                tb('L3', 0, 52.8, 16, 14)
            ]],
            new Bounds(0, 0, 200, 50),
            styles
        );

        await callEllipsis(renderer, container, styles);

        expect(drawnTexts).toContain('L1');
        expect(drawnTexts).toContain('L2');
        expect(drawnTexts).not.toContain('p1');
        expect(drawnTexts).not.toContain('p2');
        expect(drawnTexts).not.toContain('L3');
    });

    it('truncates the clamped last line when its content exceeds availableRight', async () => {
        // Line 2 has words that overflow the available width; only the fitting
        // portion should be drawn, followed by "…".
        const styles = makeStyles({textOverflow: TEXT_OVERFLOW.CLIP, webkitLineClamp: 2});
        // canvas 10px/char, ellipsis 10px → availableRight = 100 - 10 = 90
        // 'toolong' starts at left=32; remaining = 90-32 = 58.
        // Per-char width=10: t(10),o(20),o(30),l(40),o(50) fit (≤58); n(60)>58 → result='toolo'.
        // So drawnTexts contains 'toolo', NOT 'toolong'.
        const {renderer, drawnTexts} = makeRenderer(10, 10);

        const container = makeContainer(
            [[
                tb('L1', 0, 8, 80, 14),                 // line 1 fully fits
                tb('fits', 0, 30.4, 32, 14),             // line 2: right=32 ≤ 90 → renders
                tb('toolong', 32, 30.4, 200, 14),        // line 2: right=232 > 90 → truncated
                tb('L3', 0, 52.8, 50, 14)                // overflow → skipped
            ]],
            new Bounds(0, 0, 100, 50),
            styles
        );

        await callEllipsis(renderer, container, styles);

        expect(drawnTexts).toContain('L1');
        expect(drawnTexts).toContain('fits');
        expect(drawnTexts).not.toContain('toolong'); // too long — only a prefix may appear
        expect(drawnTexts).not.toContain('L3');
        expect(drawnTexts).toContain('\u2026');
    });
});
