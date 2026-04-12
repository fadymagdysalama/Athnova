import { useEffect, useRef, useState } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, Text, Image, Animated, StyleSheet } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { useAuthStore } from '../src/stores/authStore';
import { colors } from '../src/constants/theme';
import { useNotifications } from '../src/hooks/useNotifications';
import '../src/i18n';

SplashScreen.preventAutoHideAsync();

function AnimatedSplash({ onDone }: { onDone: () => void }) {
  const logoScale   = useRef(new Animated.Value(0.72)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const textOpacity = useRef(new Animated.Value(0)).current;
  const textY       = useRef(new Animated.Value(18)).current;
  const screenOpacity = useRef(new Animated.Value(1)).current;
  const ready = useRef(false);

  // Called once the view is truly painted — hides native splash with no gap
  const handleLayout = () => {
    if (ready.current) return;
    ready.current = true;
    SplashScreen.hideAsync();
  };

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.spring(logoScale,   { toValue: 1,   useNativeDriver: true, tension: 38, friction: 7 }),
        Animated.timing(logoOpacity, { toValue: 1,   duration: 450,         useNativeDriver: true }),
      ]),
      Animated.delay(80),
      Animated.parallel([
        Animated.timing(textOpacity, { toValue: 1,   duration: 380,         useNativeDriver: true }),
        Animated.spring(textY,       { toValue: 0,   useNativeDriver: true, tension: 60, friction: 10 }),
      ]),
      Animated.delay(820),
      Animated.timing(screenOpacity, { toValue: 0, duration: 320, useNativeDriver: true }),
    ]).start(() => onDone());
  }, []);

  return (
    <Animated.View style={[styles.splash, { opacity: screenOpacity }]} onLayout={handleLayout}>
      <Animated.Image
        source={require('../assets/icon.png')}
        style={[styles.logo, { opacity: logoOpacity, transform: [{ scale: logoScale }] }]}
      />
      <Animated.Text
        style={[styles.wordmark, { opacity: textOpacity, transform: [{ translateY: textY }] }]}
      >
        Coachera
      </Animated.Text>
    </Animated.View>
  );
}

export default function RootLayout() {
  const { isLoading, isInitialized, initialize } = useAuthStore();
  const [animDone, setAnimDone] = useState(false);

  useEffect(() => {
    initialize();
  }, []);

  // Registers push token, subscribes to real-time notifications, and
  // sets up foreground/tap listeners. Runs only when a session exists.
  useNotifications();

  if (!animDone) {
    return <AnimatedSplash onDone={() => setAnimDone(true)} />;
  }

  if (!isInitialized || isLoading) {
    return <View style={styles.dark} />;
  }

  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
          animation: 'slide_from_right',
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    backgroundColor: '#020913',
    justifyContent: 'center',
    alignItems: 'center',
  },
  logo: {
    width: 140,
    height: 140,
    borderRadius: 28,
  },
  wordmark: {
    color: '#FFFFFF',
    fontSize: 30,
    fontWeight: '700',
    letterSpacing: 7,
    marginTop: 22,
  },
  dark: {
    flex: 1,
    backgroundColor: '#020913',
  },
});
