import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useT } from '@/i18n';
import { avatarColors, fonts, space, type, useColors } from '@/theme';
import { failure } from '@/ui-lib/haptics';
import { type Me, remote } from '@/ui-lib/remote';

import { Avatar, readableOn } from './avatar';
import { Icon } from './icon';
import { PressableScale } from './pressable-scale';
import { errorCode, isOfflineError } from './states';
import { Field, Label, tap } from './ui';

const USERNAME = /^[a-z0-9_.]+$/;

export function usernameIssue(v: string): 'usernameShort' | 'usernameLong' | 'usernameChars' | null {
  if (v.length > 0 && !USERNAME.test(v)) return 'usernameChars';
  if (v.length > 20) return 'usernameLong';
  if (v.length < 3) return 'usernameShort';
  return null;
}

export function Swatches({
  colors,
  value,
  onChange,
  size = 40,
}: {
  colors: readonly { hex: string; label: string }[];
  value: string;
  onChange: (hex: string) => void;
  size?: number;
}) {
  const c = useColors();
  return (
    <View style={styles.swatches} accessibilityRole="radiogroup">
      {colors.map((o) => {
        const active = o.hex.toLowerCase() === value.toLowerCase();
        return (
          <PressableScale
            key={o.hex}
            scaleTo={0.88}
            onPress={() => {
              tap();
              onChange(o.hex);
            }}
            accessibilityRole="radio"
            accessibilityLabel={o.label}
            accessibilityState={{ selected: active }}
            style={[styles.swatchRing, { width: size + 8, height: size + 8, borderRadius: (size + 8) / 2, borderColor: active ? c.text : 'transparent' }]}>
            <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: o.hex, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: c.borderStrong }}>
              {active ? <Icon name="check" size={size * 0.4} color={readableOn(o.hex)} /> : null}
            </View>
          </PressableScale>
        );
      })}
    </View>
  );
}

export type ProfileDraft = ReturnType<typeof useProfileDraft>;
export type SaveResult = 'ok' | 'offline' | 'invalid' | 'error';

export function useProfileDraft(me: Me | null, opts: { withCity?: boolean } = {}) {
  const [seeded, setSeeded] = useState(!!me);
  const [username, setUsernameRaw] = useState(me?.username ?? '');
  const [displayName, setDisplayName] = useState(me?.displayName ?? '');
  const [avatarColor, setAvatarColor] = useState<string>(me?.avatarColor ?? avatarColors[0]);
  const [homeCity, setHomeCity] = useState(me?.homeCity ?? '');
  const [serverError, setServerError] = useState<{ field: 'username' | 'displayName'; key: 'usernameTaken' | 'usernameInappropriate' | 'displayNameInappropriate' } | null>(null);
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);

  if (!seeded && me) {
    setSeeded(true);
    setUsernameRaw(me.username);
    setDisplayName(me.displayName);
    setAvatarColor(me.avatarColor);
    setHomeCity(me.homeCity ?? '');
  }

  const setUsername = (v: string) => {
    setUsernameRaw(v.toLowerCase().replace(/\s+/g, ''));
    setTouched(true);
    if (serverError?.field === 'username') setServerError(null);
  };

  const issue = usernameIssue(username);
  const nameTrimmed = displayName.trim();
  const valid = !issue && nameTrimmed.length > 0;
  const dirty =
    !me ||
    username !== me.username ||
    nameTrimmed !== me.displayName ||
    avatarColor !== me.avatarColor ||
    (opts.withCity === true && homeCity.trim() !== (me.homeCity ?? ''));

  async function save(): Promise<SaveResult> {
    setTouched(true);
    if (!valid) {
      failure();
      return 'invalid';
    }
    if (me && !dirty) return 'ok';
    setSaving(true);
    try {
      await remote.updateMe({
        ...(!me || username !== me.username ? { username } : {}),
        displayName: nameTrimmed,
        avatarColor,
        ...(opts.withCity ? { homeCity: homeCity.trim() || null } : {}),
      });
      return 'ok';
    } catch (e) {
      const code = errorCode(e);
      if (code === 'username_taken') {
        setServerError({ field: 'username', key: 'usernameTaken' });
        failure();
        return 'invalid';
      }
      if (code === 'inappropriate_name') {
        const usernameChanged = !me || username !== me.username;
        setServerError(usernameChanged ? { field: 'username', key: 'usernameInappropriate' } : { field: 'displayName', key: 'displayNameInappropriate' });
        failure();
        return 'invalid';
      }
      failure();
      return isOfflineError(e) ? 'offline' : 'error';
    } finally {
      setSaving(false);
    }
  }

  return {
    username,
    setUsername,
    displayName,
    setDisplayName: (v: string) => {
      setDisplayName(v);
      if (serverError?.field === 'displayName') setServerError(null);
    },
    avatarColor,
    setAvatarColor,
    homeCity,
    setHomeCity,
    issue: touched || username.length > 0 ? issue : null,
    serverError,
    valid,
    dirty,
    saving,
    save,
  };
}

export function ProfileFields({ draft, withCity }: { draft: ProfileDraft; withCity?: boolean }) {
  const c = useColors();
  const { t } = useT();
  const shownName = draft.displayName.trim() || draft.username || '?';
  const usernameError = draft.serverError?.field === 'username' ? t(`profile.form.${draft.serverError.key}`) : draft.issue && draft.username.length > 0 ? t(`profile.form.${draft.issue}`) : null;
  const nameError = draft.serverError?.field === 'displayName' ? t(`profile.form.${draft.serverError.key}`) : null;
  return (
    <View style={{ gap: space.xl }}>
      <View style={styles.preview}>
        <Avatar name={shownName} color={draft.avatarColor} size={92} ring={c.accent} />
        <View style={{ alignItems: 'center', gap: 2 }}>
          <Text style={[type.headline, { color: c.text }]} numberOfLines={1}>
            {shownName}
          </Text>
          {draft.username ? <Text style={[type.mono, { color: c.textSecondary }]}>@{draft.username}</Text> : null}
        </View>
      </View>
      <Field
        label={t('profile.form.username')}
        value={draft.username}
        onChangeText={draft.setUsername}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="username"
        maxLength={24}
        error={usernameError}
        hint={t('profile.form.usernameHint')}
        left={<Text style={[type.bodyStrong, { color: c.textTertiary, fontFamily: fonts.semibold }]}>@</Text>}
        right={!draft.issue && !draft.serverError && draft.username.length >= 3 ? <Icon name="checkCircle" size={17} color={c.accentStrong} /> : null}
        returnKeyType="next"
      />
      <Field
        label={t('profile.form.displayName')}
        value={draft.displayName}
        onChangeText={draft.setDisplayName}
        placeholder={t('profile.form.displayNamePlaceholder')}
        autoComplete="name"
        maxLength={40}
        error={nameError}
        returnKeyType={withCity ? 'next' : 'done'}
      />
      {withCity ? (
        <Field
          label={t('profile.form.homeCity')}
          value={draft.homeCity}
          onChangeText={draft.setHomeCity}
          placeholder={t('profile.form.homeCityPlaceholder')}
          hint={t('profile.form.homeCityHint')}
          autoComplete="postal-address-locality"
          maxLength={60}
          returnKeyType="done"
        />
      ) : null}
      <View style={{ gap: space.md }}>
        <Label>{t('profile.form.color')}</Label>
        <Swatches
          colors={avatarColors.map((hex, i) => ({ hex, label: t('profile.form.colorA11y', { n: i + 1 }) }))}
          value={draft.avatarColor}
          onChange={draft.setAvatarColor}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  swatchRing: { borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  preview: { alignItems: 'center', gap: space.md, paddingTop: space.sm },
});
