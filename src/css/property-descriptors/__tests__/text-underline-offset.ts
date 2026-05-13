import {strictEqual} from 'assert';
import {Context} from '../../../core/context';
import {Parser} from '../../syntax/parser';
import {DimensionToken, TokenType} from '../../syntax/tokenizer';
import {textUnderlineOffset} from '../text-underline-offset';

const textUnderlineOffsetParse = (value: string) => textUnderlineOffset.parse({} as Context, Parser.parseValue(value));

describe('property-descriptors', () => {
    describe('text-underline-offset', () => {
        it('auto', () => {
            const parsed = textUnderlineOffsetParse('auto');

            strictEqual(parsed.type, TokenType.NUMBER_TOKEN);
            strictEqual(parsed.number, 0);
        });

        it('length', () => {
            const parsed = textUnderlineOffsetParse('4px');

            strictEqual(parsed.type, TokenType.DIMENSION_TOKEN);
            strictEqual(parsed.number, 4);
            strictEqual((parsed as DimensionToken).unit, 'px');
        });

        it('negative length', () => {
            const parsed = textUnderlineOffsetParse('-2px');

            strictEqual(parsed.type, TokenType.DIMENSION_TOKEN);
            strictEqual(parsed.number, -2);
            strictEqual((parsed as DimensionToken).unit, 'px');
        });

        it('percentage', () => {
            const parsed = textUnderlineOffsetParse('25%');

            strictEqual(parsed.type, TokenType.PERCENTAGE_TOKEN);
            strictEqual(parsed.number, 25);
        });

        it('invalid', () => {
            const parsed = textUnderlineOffsetParse('invalid');

            strictEqual(parsed.type, TokenType.NUMBER_TOKEN);
            strictEqual(parsed.number, 0);
        });
    });
});
