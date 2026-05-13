import {strictEqual} from 'assert';
import {Context} from '../../../core/context';
import {Parser} from '../../syntax/parser';
import {DimensionToken, TokenType} from '../../syntax/tokenizer';
import {textDecorationThickness} from '../text-decoration-thickness';

const textDecorationThicknessParse = (value: string) =>
    textDecorationThickness.parse({} as Context, Parser.parseValue(value));

describe('property-descriptors', () => {
    describe('text-decoration-thickness', () => {
        it('auto', () => {
            const parsed = textDecorationThicknessParse('auto');

            strictEqual(parsed.type, TokenType.NUMBER_TOKEN);
            strictEqual(parsed.number, 1);
        });

        it('from-font', () => {
            const parsed = textDecorationThicknessParse('from-font');

            strictEqual(parsed.type, TokenType.NUMBER_TOKEN);
            strictEqual(parsed.number, 1);
        });

        it('length', () => {
            const parsed = textDecorationThicknessParse('3px');

            strictEqual(parsed.type, TokenType.DIMENSION_TOKEN);
            strictEqual(parsed.number, 3);
            strictEqual((parsed as DimensionToken).unit, 'px');
        });

        it('percentage', () => {
            const parsed = textDecorationThicknessParse('10%');

            strictEqual(parsed.type, TokenType.PERCENTAGE_TOKEN);
            strictEqual(parsed.number, 10);
        });

        it('negative length', () => {
            const parsed = textDecorationThicknessParse('-2px');

            strictEqual(parsed.type, TokenType.NUMBER_TOKEN);
            strictEqual(parsed.number, 1);
        });

        it('invalid', () => {
            const parsed = textDecorationThicknessParse('invalid');

            strictEqual(parsed.type, TokenType.NUMBER_TOKEN);
            strictEqual(parsed.number, 1);
        });
    });
});
