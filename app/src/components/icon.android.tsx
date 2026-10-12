import { MaterialSymbols_400Regular_Filled } from '@expo-google-fonts/material-symbols/400Regular_Filled';
import { MaterialSymbols_500Medium } from '@expo-google-fonts/material-symbols/500Medium';
import { SymbolView, type SymbolWeight } from 'expo-symbols';
import type { ColorValue, StyleProp, ViewStyle } from 'react-native';

import { filledOnAndroid, icons, type IconName } from './icon-names';

const filled = { name: 'MaterialSymbols_400Regular_Filled', font: MaterialSymbols_400Regular_Filled };
const medium = { name: 'MaterialSymbols_500Medium', font: MaterialSymbols_500Medium };

type Props = {
  name: IconName;
  size?: number;
  color: ColorValue;
  weight?: SymbolWeight;
  style?: StyleProp<ViewStyle>;
};

export function Icon({ name, size = 22, color, style }: Props) {
  return (
    <SymbolView
      name={{ android: icons[name].android }}
      size={size}
      tintColor={color}
      weight={{ ios: 'regular', android: filledOnAndroid[name] ? filled : medium }}
      style={[{ width: size, height: size }, style]}
    />
  );
}
