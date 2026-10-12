import { forwardRef, type ReactNode, useEffect } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  type ScrollViewProps,
  type StyleProp,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  type TextInputProps,
  type TextStyle,
  View,
  type ViewStyle,
} from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { t } from '@/i18n';
import { tap } from '@/ui-lib/haptics';
import { fonts, radius, space, spring, type, useColors, useIsDark } from '@/theme';

import { Icon } from './icon';
import type { IconName } from './icon-names';
import { PressableScale } from './pressable-scale';

export { tap };

type ScreenProps = ScrollViewProps & { children: ReactNode; padded?: boolean; bottomInset?: number; noHeader?: boolean };

export const Screen = forwardRef<ScrollView, ScreenProps>(function Screen(
  { children, contentContainerStyle, padded = true, bottomInset, noHeader, ...rest },
  ref,
) {
  const insets = useSafeAreaInsets();
  const c = useColors();
  const dark = useIsDark();
  return (
    <ScrollView
      ref={ref}
      contentInsetAdjustmentBehavior="automatic"
      style={{ flex: 1, backgroundColor: c.background }}
      contentContainerStyle={[
        {
          paddingTop: noHeader ? insets.top + space.md : Platform.OS === 'ios' ? space.sm : space.md,
          paddingBottom: bottomInset ?? (Platform.OS === 'ios' ? 120 : insets.bottom + 110),
        },
        padded && { paddingHorizontal: space.lg },
        contentContainerStyle,
      ]}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
      indicatorStyle={dark ? 'white' : 'black'}
      {...rest}>
      {children}
    </ScrollView>
  );
});

export function Card({
  children,
  style,
  padded = true,
  onPress,
  raised,
  accessibilityLabel,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
  onPress?: () => void;
  raised?: boolean;
  accessibilityLabel?: string;
}) {
  const c = useColors();
  const body = [
    styles.card,
    { backgroundColor: raised ? c.surfaceRaised : c.surface, borderColor: c.border },
    padded && styles.cardPadded,
    style,
  ];
  if (onPress) {
    return (
      <PressableScale
        scaleTo={0.985}
        onPress={() => {
          tap();
          onPress();
        }}
        style={body}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}>
        {children}
      </PressableScale>
    );
  }
  return <View style={body}>{children}</View>;
}

export function Label({ children, style, color }: { children: ReactNode; style?: StyleProp<TextStyle>; color?: string }) {
  const c = useColors();
  return <Text style={[type.label, { color: color ?? c.textTertiary }, style]}>{children}</Text>;
}

export function SectionTitle({ title, action, onAction, style }: { title: string; action?: string; onAction?: () => void; style?: StyleProp<ViewStyle> }) {
  const c = useColors();
  return (
    <View style={[styles.sectionTitle, style]}>
      <Label>{title}</Label>
      {action && onAction ? (
        <Pressable
          onPress={() => {
            tap();
            onAction();
          }}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={action}>
          <Text style={[type.caption, { color: c.accentStrong, fontFamily: fonts.semibold }]}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'glass' | 'club' | 'friend';

export function Button({
  title,
  onPress,
  icon,
  variant = 'primary',
  loading,
  disabled,
  style,
  compact,
  large,
}: {
  title: string;
  onPress: () => void;
  icon?: IconName;
  variant?: ButtonVariant;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  compact?: boolean;
  large?: boolean;
}) {
  const c = useColors();
  const palette = {
    primary: { bg: c.accent, fg: c.onAccent, border: 'transparent' },
    secondary: { bg: c.surfaceRaised, fg: c.text, border: c.borderStrong },
    ghost: { bg: 'transparent', fg: c.accentStrong, border: 'transparent' },
    danger: { bg: c.dangerSoft, fg: c.danger, border: 'transparent' },
    glass: { bg: 'rgba(255,255,255,0.14)', fg: '#FFFFFF', border: 'rgba(255,255,255,0.12)' },
    club: { bg: c.club, fg: '#1A1100', border: 'transparent' },
    friend: { bg: c.friend, fg: '#FFFFFF', border: 'transparent' },
  }[variant];
  return (
    <PressableScale
      onPress={() => {
        if (disabled || loading) return;
        tap();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: !!disabled, busy: !!loading }}
      style={[
        styles.button,
        compact && styles.buttonCompact,
        large && styles.buttonLarge,
        { backgroundColor: palette.bg, borderColor: palette.border, opacity: disabled ? 0.4 : 1 },
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={palette.fg} />
      ) : (
        <>
          {icon ? <Icon name={icon} size={large ? 19 : compact ? 14 : 16} color={palette.fg} /> : null}
          <Text style={[large ? type.headline : compact ? type.callout : type.bodyStrong, { color: palette.fg, fontFamily: fonts.semibold }]} numberOfLines={1}>
            {title}
          </Text>
        </>
      )}
    </PressableScale>
  );
}

export function IconButton({
  icon,
  onPress,
  label,
  tint,
  bg,
  size = 40,
  style,
  disabled,
}: {
  icon: IconName;
  onPress: () => void;
  label: string;
  tint?: string;
  bg?: string;
  size?: number;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
}) {
  const c = useColors();
  return (
    <PressableScale
      onPress={() => {
        if (disabled) return;
        tap();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      hitSlop={6}
      style={[
        { width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: bg ?? c.surfaceRaised, opacity: disabled ? 0.4 : 1 },
        style,
      ]}>
      <Icon name={icon} size={Math.round(size * 0.44)} color={tint ?? c.text} />
    </PressableScale>
  );
}

export function Row({
  icon,
  iconColor,
  iconBg,
  title,
  subtitle,
  value,
  onPress,
  right,
  left,
  destructive,
  last,
}: {
  icon?: IconName;
  iconColor?: string;
  iconBg?: string;
  title: string;
  subtitle?: string;
  value?: string;
  onPress?: () => void;
  right?: ReactNode;
  left?: ReactNode;
  destructive?: boolean;
  last?: boolean;
}) {
  const c = useColors();
  return (
    <Pressable
      onPress={
        onPress
          ? () => {
              tap();
              onPress();
            }
          : undefined
      }
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={title}
      style={({ pressed }) => [styles.row, pressed && onPress ? { backgroundColor: c.surfacePressed } : null]}>
      {left}
      {icon && !left ? (
        <View style={[styles.rowIcon, { backgroundColor: iconBg ?? (destructive ? c.dangerSoft : c.accentSoft) }]}>
          <Icon name={icon} size={16} color={iconColor ?? (destructive ? c.danger : c.accentStrong)} />
        </View>
      ) : null}
      <View style={[styles.rowBody, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.borderStrong }]}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[type.body, { color: destructive ? c.danger : c.text }]} numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={[type.caption, { color: c.textSecondary }]} numberOfLines={3}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {value ? (
          <Text style={[type.callout, { color: c.textSecondary, maxWidth: '48%' }]} numberOfLines={1}>
            {value}
          </Text>
        ) : null}
        {right}
        {onPress && !right ? <Icon name="chevronRight" size={12} color={c.textTertiary} /> : null}
      </View>
    </Pressable>
  );
}

export function Group({ children, style, title, footer, action, onAction }: { children: ReactNode; style?: StyleProp<ViewStyle>; title?: string; footer?: string; action?: string; onAction?: () => void }) {
  const c = useColors();
  return (
    <View style={[{ marginBottom: space.xl }, style]}>
      {title ? <SectionTitle title={title} action={action} onAction={onAction} /> : null}
      <View style={[styles.group, { backgroundColor: c.surface, borderColor: c.border }]}>{children}</View>
      {footer ? <Text style={[type.caption, { color: c.textTertiary, marginTop: space.sm, marginHorizontal: space.xs }]}>{footer}</Text> : null}
    </View>
  );
}

export function ToggleRow({
  title,
  subtitle,
  value,
  onChange,
  icon,
  last,
  disabled,
}: {
  title: string;
  subtitle?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  icon?: IconName;
  last?: boolean;
  disabled?: boolean;
}) {
  const c = useColors();
  return (
    <Row
      icon={icon}
      title={title}
      subtitle={subtitle}
      last={last}
      right={
        <Switch
          value={value}
          disabled={disabled}
          onValueChange={(v) => {
            tap();
            onChange(v);
          }}
          trackColor={{ true: c.accent, false: undefined }}
          thumbColor={Platform.OS === 'android' ? (value ? '#FFFFFF' : undefined) : undefined}
          accessibilityLabel={title}
        />
      }
    />
  );
}

type FieldProps = TextInputProps & {
  label?: string;
  hint?: string;
  error?: string | null;
  right?: ReactNode;
  left?: ReactNode;
  disabled?: boolean;
};

export const Field = forwardRef<TextInput, FieldProps>(function Field({ label, hint, error, right, left, disabled, style, ...rest }, ref) {
  const c = useColors();
  return (
    <View style={{ gap: 6 }}>
      {label ? <Text style={[type.caption, { color: c.textSecondary }]}>{label}</Text> : null}
      <View
        style={[
          styles.field,
          {
            backgroundColor: disabled ? c.surfaceSunken : c.surface,
            borderColor: error ? c.danger : c.borderStrong,
          },
        ]}>
        {left}
        <TextInput
          ref={ref}
          placeholderTextColor={c.textTertiary}
          editable={!disabled}
          style={[type.body, { color: disabled ? c.textSecondary : c.text, flex: 1, paddingVertical: Platform.OS === 'ios' ? 13 : 10 }, style]}
          selectionColor={c.accent}
          {...rest}
        />
        {right}
      </View>
      {error ? <Text style={[type.caption, { color: c.danger }]}>{error}</Text> : hint ? <Text style={[type.caption, { color: c.textTertiary }]}>{hint}</Text> : null}
    </View>
  );
});

export function SearchField({ value, onChangeText, placeholder, autoFocus }: { value: string; onChangeText: (v: string) => void; placeholder: string; autoFocus?: boolean }) {
  const c = useColors();
  return (
    <View style={[styles.search, { backgroundColor: c.surfaceRaised }]}>
      <Icon name="search" size={15} color={c.textTertiary} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={c.textTertiary}
        autoFocus={autoFocus}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        clearButtonMode="while-editing"
        selectionColor={c.accent}
        style={[type.body, { flex: 1, color: c.text, paddingVertical: Platform.OS === 'ios' ? 11 : 8 }]}
        accessibilityLabel={placeholder}
      />
    </View>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  style,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  style?: StyleProp<ViewStyle>;
}) {
  const c = useColors();
  return (
    <View style={[styles.segmented, { backgroundColor: c.surfaceSunken, borderColor: c.border }, style]} accessibilityRole="tablist">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => {
              if (active) return;
              tap();
              onChange(o.value);
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            style={[styles.segment, active && { backgroundColor: c.surfaceRaised, shadowColor: c.shadow, shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 }]}>
            <Text style={[type.callout, { color: active ? c.text : c.textSecondary, fontFamily: active ? fonts.semibold : fonts.medium }]} numberOfLines={1}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function ChipRow<T extends string>({
  options,
  value,
  onChange,
  color,
  style,
}: {
  options: { value: T; label: string; icon?: IconName }[];
  value: T;
  onChange: (v: T) => void;
  color?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const c = useColors();
  const tint = color ?? c.accent;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={style} contentContainerStyle={{ gap: space.sm, paddingHorizontal: space.lg }}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Chip key={o.value} label={o.label} icon={o.icon} active={active} color={tint} onPress={() => !active && onChange(o.value)} />
        );
      })}
    </ScrollView>
  );
}

export function Chip({ label, icon, active, color, onPress }: { label: string; icon?: IconName; active?: boolean; color?: string; onPress?: () => void }) {
  const c = useColors();
  const tint = color ?? c.accent;
  return (
    <PressableScale
      onPress={
        onPress
          ? () => {
              tap();
              onPress();
            }
          : undefined
      }
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
      style={[styles.chip, { backgroundColor: active ? tint : c.surfaceRaised, borderColor: active ? tint : c.border }]}>
      {icon ? <Icon name={icon} size={13} color={active ? '#FFFFFF' : c.textSecondary} /> : null}
      <Text style={[type.callout, { color: active ? (tint === c.accent ? c.onAccent : '#FFFFFF') : c.text, fontFamily: fonts.semibold }]} numberOfLines={1}>
        {label}
      </Text>
    </PressableScale>
  );
}

export function Pill({ text, color, bg, icon, style }: { text: string; color: string; bg: string; icon?: IconName; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.pill, { backgroundColor: bg }, style]}>
      {icon ? <Icon name={icon} size={10} color={color} /> : null}
      <Text style={[type.caption, { color, fontFamily: fonts.semibold, fontSize: 11.5 }]} numberOfLines={1}>
        {text}
      </Text>
    </View>
  );
}

export function Notice({
  tone = 'info',
  icon,
  title,
  body,
  action,
  onAction,
  style,
}: {
  tone?: 'info' | 'warn' | 'danger' | 'good';
  icon?: IconName;
  title: string;
  body?: string;
  action?: string;
  onAction?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const c = useColors();
  const palette = {
    info: { bg: c.surfaceRaised, icon: c.textSecondary },
    warn: { bg: c.warnSoft, icon: c.warn },
    danger: { bg: c.dangerSoft, icon: c.danger },
    good: { bg: c.accentSoft, icon: c.accentStrong },
  }[tone];
  return (
    <View style={[styles.notice, { backgroundColor: palette.bg }, style]}>
      {icon ? <Icon name={icon} size={17} color={palette.icon} style={{ marginTop: 1 }} /> : null}
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[type.callout, { color: c.text, fontFamily: fonts.semibold }]}>{title}</Text>
        {body ? <Text style={[type.caption, { color: c.textSecondary }]}>{body}</Text> : null}
      </View>
      {action && onAction ? (
        <Pressable
          onPress={() => {
            tap();
            onAction();
          }}
          hitSlop={10}
          accessibilityRole="button">
          <Text style={[type.callout, { color: c.accentStrong, fontFamily: fonts.semibold }]}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function Divider({ style }: { style?: StyleProp<ViewStyle> }) {
  const c = useColors();
  return <View style={[{ height: StyleSheet.hairlineWidth, backgroundColor: c.borderStrong }, style]} />;
}

export function ProgressBar({ value, color, track, height = 6, style }: { value: number; color?: string; track?: string; height?: number; style?: StyleProp<ViewStyle> }) {
  const c = useColors();
  const pct = Math.max(0, Math.min(1, value));
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withSpring(pct, spring.soft);
  }, [pct, progress]);
  const fill = useAnimatedStyle(() => ({ width: `${Math.max(0, progress.value) * 100}%` }));
  return (
    <View style={[{ height, borderRadius: height / 2, backgroundColor: track ?? c.surfaceSunken, overflow: 'hidden' }, style]}>
      <Animated.View style={[{ height, borderRadius: height / 2, backgroundColor: color ?? c.accent }, fill]} />
    </View>
  );
}

export function Value({
  value,
  unit,
  size = 'value',
  color,
  unitColor,
  style,
}: {
  value: string;
  unit?: string;
  size?: 'hero' | 'display' | 'value' | 'valueSmall';
  color?: string;
  unitColor?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const c = useColors();
  const unitSize = { hero: 22, display: 18, value: 14, valueSmall: 12.5 }[size];
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }, style]}>
      <Text style={[type[size], { color: color ?? c.text, flexShrink: 1 }]} numberOfLines={1} adjustsFontSizeToFit={size === 'hero' || size === 'display'} minimumFontScale={0.6}>
        {value}
      </Text>
      {unit ? <Text style={[type.unit, { fontSize: unitSize, color: unitColor ?? c.textSecondary }]}>{unit}</Text> : null}
    </View>
  );
}

export function Stat({
  label,
  value,
  unit,
  icon,
  tint,
  style,
  small,
}: {
  label: string;
  value: string;
  unit?: string;
  icon?: IconName;
  tint?: string;
  style?: StyleProp<ViewStyle>;
  small?: boolean;
}) {
  const c = useColors();
  return (
    <View style={[styles.stat, { backgroundColor: c.surface, borderColor: c.border }, style]} accessible accessibilityLabel={`${label} ${value} ${unit ?? ''}`}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        {icon ? <Icon name={icon} size={12} color={tint ?? c.textTertiary} /> : null}
        <Text style={[type.caption, { color: c.textSecondary, flexShrink: 1 }]} numberOfLines={1}>
          {label}
        </Text>
      </View>
      <Value value={value} unit={unit} size={small ? 'valueSmall' : 'value'} />
    </View>
  );
}

export function StatGrid({ children, columns = 2, style }: { children: ReactNode; columns?: 2 | 3; style?: StyleProp<ViewStyle> }) {
  const items = Array.isArray(children) ? children.flat().filter(Boolean) : [children];
  const rows: ReactNode[][] = [];
  for (let i = 0; i < items.length; i += columns) rows.push(items.slice(i, i + columns));
  return (
    <View style={[{ gap: space.sm }, style]}>
      {rows.map((row, i) => (
        <View key={i} style={{ flexDirection: 'row', gap: space.sm }}>
          {row.map((cell, j) => (
            <View key={j} style={{ flex: 1 }}>
              {cell}
            </View>
          ))}
          {row.length < columns ? Array.from({ length: columns - row.length }).map((_, k) => <View key={`f${k}`} style={{ flex: 1 }} />) : null}
        </View>
      ))}
    </View>
  );
}

export function SheetHeader({ title, onClose, closeLabel, right }: { title: string; onClose?: () => void; closeLabel?: string; right?: ReactNode }) {
  const c = useColors();
  return (
    <View style={styles.sheetHeader}>
      <Text style={[type.headline, { color: c.text, flex: 1 }]} numberOfLines={1} accessibilityRole="header">
        {title}
      </Text>
      {right}
      {onClose ? <IconButton icon="close" label={closeLabel ?? t('common.close')} onPress={onClose} size={32} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  cardPadded: { padding: space.lg },
  sectionTitle: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: space.sm, marginTop: space.xs, paddingHorizontal: space.xs },
  button: { height: 50, borderRadius: radius.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm, paddingHorizontal: space.lg, borderWidth: StyleSheet.hairlineWidth },
  buttonCompact: { height: 36, borderRadius: radius.pill, paddingHorizontal: space.md + 2 },
  buttonLarge: { height: 58, borderRadius: radius.lg - 2 },
  row: { flexDirection: 'row', alignItems: 'center', paddingLeft: space.lg, minHeight: 54 },
  rowIcon: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center', marginRight: space.md },
  rowBody: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.md, paddingRight: space.lg, minHeight: 54 },
  group: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  field: { flexDirection: 'row', alignItems: 'center', borderRadius: radius.md, borderWidth: 1, paddingHorizontal: space.md, gap: space.sm, minHeight: 50 },
  search: { flexDirection: 'row', alignItems: 'center', gap: space.sm, borderRadius: radius.md, paddingHorizontal: space.md },
  segmented: { flexDirection: 'row', borderRadius: radius.md, padding: 3, borderWidth: StyleSheet.hairlineWidth },
  segment: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 8, borderRadius: radius.sm + 1 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, height: 34, borderRadius: radius.pill, borderWidth: StyleSheet.hairlineWidth },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, alignSelf: 'flex-start' },
  notice: { flexDirection: 'row', gap: space.md, padding: space.md + 2, borderRadius: radius.md, alignItems: 'flex-start' },
  stat: { borderRadius: radius.md + 2, borderWidth: StyleSheet.hairlineWidth, padding: space.md + 2, gap: 6 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingTop: space.xl, paddingBottom: space.md },
});
