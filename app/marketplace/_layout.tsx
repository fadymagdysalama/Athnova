import { Stack } from 'expo-router';

export default function MarketplaceLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="detail" />
      <Stack.Screen name="subscription" />
    </Stack>
  );
}
