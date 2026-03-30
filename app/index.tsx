import { Redirect } from 'expo-router';
import { useAuthStore } from '../src/stores/authStore';

export default function Index() {
  const { session, profile } = useAuthStore();

  if (!session) {
    return <Redirect href="/auth/login" />;
  }

  if (!profile) {
    return <Redirect href="/auth/setup-profile" />;
  }

  return <Redirect href="/(tabs)" />;
}
