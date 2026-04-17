import {IPropertyValueDescriptor, PropertyDescriptorParsingType} from '../IPropertyDescriptor';
import {CSSValue, isNumberToken} from '../syntax/parser';
import {Context} from '../../core/context';

export const webkitLineClamp: IPropertyValueDescriptor<number> = {
    name: '-webkit-line-clamp',
    initialValue: 'none',
    prefix: false,
    type: PropertyDescriptorParsingType.VALUE,
    parse: (_context: Context, token: CSSValue): number => {
        if (isNumberToken(token)) {
            return Math.round(token.number);
        }
        // 'none' or any non-numeric value → no clamping
        return 0;
    }
};
