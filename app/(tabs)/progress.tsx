import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fontSize, spacing, borderRadius } from '../../src/constants/theme';

export default function ProgressScreen() {
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.content}>
        <Text style={styles.title}>Progress</Text>

        {/* Body Measurements Card */}
        <View style={styles.card}>
          <Text style={styles.cardIcon}>⚖️</Text>
          <Text style={styles.cardTitle}>Body Measurements</Text>
          <Text style={styles.cardSubtext}>
            Track weight, body fat %, and muscle mass
          </Text>
        </View>

        {/* Progress Photos Card */}
        <View style={styles.card}>
          <Text style={styles.cardIcon}>📸</Text>
          <Text style={styles.cardTitle}>Progress Photos</Text>
          <Text style={styles.cardSubtext}>
            Compare before & after photos
          </Text>
        </View>

        {/* Strength Tracking Card */}
        <View style={styles.card}>
          <Text style={styles.cardIcon}>🏋️</Text>
          <Text style={styles.cardTitle}>Strength Records</Text>
          <Text style={styles.cardSubtext}>
            Track your PRs and lifting progress
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing['2xl'],
    paddingTop: spacing.xl,
  },
  title: {
    fontSize: fontSize['2xl'],
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing['2xl'],
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
    alignItems: 'center',
  },
  cardIcon: {
    fontSize: 32,
    marginBottom: spacing.sm,
  },
  cardTitle: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  cardSubtext: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    textAlign: 'center',
  },
});
