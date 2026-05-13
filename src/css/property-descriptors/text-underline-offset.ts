import {Context} from '../../core/context';
import {IPropertyValueDescriptor, PropertyDescriptorParsingType} from '../IPropertyDescriptor';
import {CSSValue, isIdentToken} from '../syntax/parser';
import {isLengthPercentage, LengthPercentage, ZERO_LENGTH} from '../types/length-percentage';

export const textUnderlineOffset: IPropertyValueDescriptor<LengthPercentage> = {
    name: 'text-underline-offset',
    initialValue: 'auto',
    prefix: false,
    type: PropertyDescriptorParsingType.VALUE,
    parse: (_context: Context, token: CSSValue): LengthPercentage => {
        if (isIdentToken(token) && token.value === 'auto') {
            return ZERO_LENGTH;
        }

        return isLengthPercentage(token) ? token : ZERO_LENGTH;
    }
};
