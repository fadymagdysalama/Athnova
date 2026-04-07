// Redirect to unified Sessions & Packages screen
import { useEffect } from 'react';
import { useRouter } from 'expo-router';

export default function MySessionsRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace({ pathname: '/coach/offline-client-detail', params: { viewOnly: 'true' } });
  }, []);
  return null;
}
