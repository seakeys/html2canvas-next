import {Context} from '../../core/context';
import {IPropertyValueDescriptor, PropertyDescriptorParsingType} from '../IPropertyDescriptor';
import {CSSValue, isIdentToken} from '../syntax/parser';
import {FLAG_INTEGER, NumberValueToken, TokenType} from '../syntax/tokenizer';
import {isLengthPercentage, LengthPercentage} from '../types/length-percentage';

const AUTO_THICKNESS: NumberValueToken = {
    type: TokenType.NUMBER_TOKEN,
    number: 1,
    flags: FLAG_INTEGER
};

export const textDecorationThickness: IPropertyValueDescriptor<LengthPercentage> = {
    name: 'text-decoration-thickness',
    initialValue: 'auto',
    prefix: false,
    type: PropertyDescriptorParsingType.VALUE,
    parse: (_context: Context, token: CSSValue): LengthPercentage => {
        if (isIdentToken(token) && (token.value === 'auto' || token.value === 'from-font')) {
            return AUTO_THICKNESS;
        }

        return isLengthPercentage(token) && token.number >= 0 ? token : AUTO_THICKNESS;
    }
};
