import {CSSParsedDeclaration} from '../css/index';
import {TextContainer} from './text-container';
import {Bounds, parseBounds} from '../css/layout/bounds';
import {isHTMLElementNode} from './node-parser';
import {Context} from '../core/context';
import {DebuggerType, isDebugging} from '../core/debugger';
import {contains} from '../core/bitwise';
import {DISPLAY} from '../css/property-descriptors/display';

export const enum FLAGS {
    CREATES_STACKING_CONTEXT = 1 << 1,
    CREATES_REAL_STACKING_CONTEXT = 1 << 2,
    IS_LIST_OWNER = 1 << 3,
    DEBUG_RENDER = 1 << 4
}

export class ElementContainer {
    readonly styles: CSSParsedDeclaration;
    readonly textNodes: TextContainer[] = [];
    readonly elements: ElementContainer[] = [];
    bounds: Bounds;
    flags = 0;
    // For pure inline elements that wrap across multiple lines, stores each line box
    // rect individually so that background is painted per line rather than as a single
    // bounding rectangle (which would cover empty space between lines).
    inlineClientRects?: Bounds[];

    constructor(protected readonly context: Context, element: Element) {
        if (isDebugging(element, DebuggerType.PARSE)) {
            debugger;
        }

        this.styles = new CSSParsedDeclaration(context, window.getComputedStyle(element, null));

        if (isHTMLElementNode(element)) {
            if (this.styles.animationDuration.some((duration) => duration > 0)) {
                element.style.animationDuration = '0s';
            }

            if (this.styles.transform !== null) {
                // getBoundingClientRect takes transforms into account
                element.style.transform = 'none';
            }
        }

        this.bounds = parseBounds(this.context, element);

        // For pure inline elements (display: inline), getBoundingClientRect() returns the
        // overall bounding box which spans empty space between line breaks.  getClientRects()
        // returns one rect per line box, which is what CSS mandates for background painting.
        if (contains(this.styles.display, DISPLAY.INLINE)) {
            const rects = element.getClientRects();
            if (rects.length > 1) {
                this.inlineClientRects = Array.from(rects).map(
                    (rect) =>
                        new Bounds(
                            rect.left + context.windowBounds.left,
                            rect.top + context.windowBounds.top,
                            rect.width,
                            rect.height
                        )
                );
            }
        }

        if (isDebugging(element, DebuggerType.RENDER)) {
            this.flags |= FLAGS.DEBUG_RENDER;
        }
    }
}
