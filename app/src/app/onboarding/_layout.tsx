import { Stack } from 'expo-router';

import { useColors } from '@/theme';

export default function OnboardingLayout() {
  const c = useColors();
  return (
    <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right', contentStyle: { backgroundColor: c.background } }}>
      <Stack.Screen name="index" options={{ animation: 'fade' }} />
      <Stack.Screen name="permissions" />
      <Stack.Screen name="profile" />
      <Stack.Screen name="car" />
      <Stack.Screen name="recovery" options={{ gestureEnabled: false }} />
      <Stack.Screen name="restore" options={{ presentation: 'modal', animation: 'default' }} />
    </Stack>
  );
}
