import { Redirect } from 'expo-router';

// Library management has moved to the dedicated Library tab.
export default function ExerciseLibraryRedirect() {
  return <Redirect href="/(tabs)/library" />;
}
