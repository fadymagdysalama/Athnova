import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, spacing, fontSize, borderRadius } from '../constants/theme';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const DAY_ABBREVS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export interface CalendarPickerProps {
  /** Currently selected date in 'YYYY-MM-DD' format */
  selectedDate: string;
  /** Year currently shown in the calendar */
  viewYear: number;
  /** Month currently shown (1-indexed) */
  viewMonth: number;
  /** Called when the user taps a date cell */
  onSelectDate?: (date: string) => void;
  /** Called when the user navigates to the previous month */
  onPrevMonth: () => void;
  /** Called when the user navigates to the next month */
  onNextMonth: () => void;
  /** Optional set of 'YYYY-MM-DD' strings to render a dot indicator */
  markedDates?: string[];
  /**
   * Earliest selectable date in 'YYYY-MM-DD' format.
   * Dates before this are rendered as non-interactive.
   */
  minDate?: string;
}

function zeroPad(n: number): string {
  return String(n).padStart(2, '0');
}

function toDateStr(year: number, month: number, day: number): string {
  return `${year}-${zeroPad(month)}-${zeroPad(day)}`;
}

function getTodayStr(): string {
  const d = new Date();
  return toDateStr(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

export function CalendarPicker({
  selectedDate,
  viewYear,
  viewMonth,
  onSelectDate,
  onPrevMonth,
  onNextMonth,
  markedDates = [],
  minDate,
}: CalendarPickerProps) {
  const todayStr = getTodayStr();
  const markedSet = new Set(markedDates);

  // Build flat array of day cells (null = empty padding cell)
  const firstDayOfWeek = new Date(viewYear, viewMonth - 1, 1).getDay();
  const totalDays = new Date(viewYear, viewMonth, 0).getDate();
  const cells: (number | null)[] = [];

  for (let i = 0; i < firstDayOfWeek; i++) cells.push(null);
  for (let d = 1; d <= totalDays; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7));
  }

  return (
    <View style={styles.container}>
      {/* Month/year navigation */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onPrevMonth} style={styles.navBtn} hitSlop={8}>
          <Text style={styles.navIcon}>‹</Text>
        </TouchableOpacity>

        <Text style={styles.monthTitle}>
          {MONTH_NAMES[viewMonth - 1]} {viewYear}
        </Text>

        <TouchableOpacity onPress={onNextMonth} style={styles.navBtn} hitSlop={8}>
          <Text style={styles.navIcon}>›</Text>
        </TouchableOpacity>
      </View>

      {/* Day-of-week headers */}
      <View style={styles.weekRow}>
        {DAY_ABBREVS.map((abbrev, i) => (
          <View key={i} style={styles.dayHeaderCell}>
            <Text style={styles.dayHeaderText}>{abbrev}</Text>
          </View>
        ))}
      </View>

      {/* Calendar grid */}
      {weeks.map((week, wi) => (
        <View key={wi} style={styles.weekRow}>
          {week.map((day, di) => {
            if (!day) {
              return <View key={di} style={styles.cell} />;
            }

            const dateStr = toDateStr(viewYear, viewMonth, day);
            const isSelected = dateStr === selectedDate;
            const isToday = dateStr === todayStr;
            const isMarked = markedSet.has(dateStr);
            const isDisabled = Boolean(minDate && dateStr < minDate);

            return (
              <TouchableOpacity
                key={di}
                style={[
                  styles.cell,
                  isSelected && styles.cellSelected,
                  isToday && !isSelected && styles.cellToday,
                  isDisabled && styles.cellDisabled,
                ]}
                onPress={() => onSelectDate?.(dateStr)}
                disabled={isDisabled || !onSelectDate}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.cellText,
                    isSelected && styles.cellTextSelected,
                    isToday && !isSelected && styles.cellTextToday,
                    isDisabled && styles.cellTextDisabled,
                  ]}
                >
                  {day}
                </Text>

                {isMarked && (
                  <View style={[styles.dot, isSelected && styles.dotSelected]} />
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const CELL_SIZE = 40;

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
    paddingHorizontal: spacing.xs,
  },
  navBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navIcon: {
    fontSize: 22,
    color: colors.primary,
    fontWeight: '600',
    lineHeight: 26,
  },
  monthTitle: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.text,
  },

  // Day headers row
  weekRow: {
    flexDirection: 'row',
  },
  dayHeaderCell: {
    flex: 1,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayHeaderText: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    color: colors.textMuted,
    textTransform: 'uppercase',
  },

  // Day cells
  cell: {
    flex: 1,
    height: CELL_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: CELL_SIZE / 2,
    marginVertical: 2,
  },
  cellSelected: {
    backgroundColor: colors.primary,
  },
  cellToday: {
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  cellDisabled: {
    opacity: 0.3,
  },
  cellText: {
    fontSize: fontSize.sm,
    color: colors.text,
    fontWeight: '500',
  },
  cellTextSelected: {
    color: colors.textInverse,
    fontWeight: '700',
  },
  cellTextToday: {
    color: colors.primary,
    fontWeight: '700',
  },
  cellTextDisabled: {
    color: colors.textMuted,
  },

  // Dot indicator for marked dates
  dot: {
    position: 'absolute',
    bottom: 3,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.primary,
  },
  dotSelected: {
    backgroundColor: colors.textInverse,
  },
});
