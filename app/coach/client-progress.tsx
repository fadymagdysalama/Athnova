import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  Modal,
  StatusBar,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useProgressStore } from '../../src/stores/progressStore';
import { useProgramStore } from '../../src/stores/programStore';
import { useDocumentStore } from '../../src/stores/documentStore';
import { supabase } from '../../src/lib/supabase';
import { colors, spacing, fontSize, borderRadius } from '../../src/constants/theme';

type Section = 'measurements' | 'strength' | 'photos' | 'programs' | 'documents';

interface ProgramProgressItem {
  programId: string;
  programTitle: string;
  totalDays: number;
  currentDay: number;
  clientVisible: boolean;
  days: Array<{ id: string; day_number: number }>;
  completedDayIds: string[];
  feedbacks: Array<{ day_id: string; text: string | null }>;
}

function SparkChart({ data, color = colors.primary }: { data: number[]; color?: string }) {
  if (data.length < 2) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const HEIGHT = 48;
  const BAR_W = 7;

  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: HEIGHT, gap: 3 }}>
      {data.map((v, i) => {
        const h = Math.max(4, ((v - min) / range) * HEIGHT);
        const isLast = i === data.length - 1;
        return (
          <View
            key={i}
            style={{
              width: BAR_W,
              height: h,
              backgroundColor: isLast ? color : `${color}55`,
              borderRadius: 2,
            }}
          />
        );
      })}
    </View>
  );
}

export default function ClientProgressScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { clientId, clientName, clientMode, coachId } = useLocalSearchParams<{
    clientId: string;
    clientName: string;
    clientMode?: string;
    coachId?: string;
  }>();

  const { measurements, strengthLogs, photos, fetchMeasurements, fetchStrengthLogs, fetchPhotos, isLoading } =
    useProgressStore();
  const { myPrograms, fetchMyPrograms, assignProgram, unassignProgram, updateAssignmentVisibility } = useProgramStore();
  const { clientDocuments, fetchClientDocuments, previewDocument, openDocument } = useDocumentStore();

  const [section, setSection] = useState<Section>('programs');
  const [fullscreenPhoto, setFullscreenPhoto] = useState<{ url: string; label: string; date: string } | null>(null);
  const [programsProgress, setProgramsProgress] = useState<ProgramProgressItem[]>([]);
  const [programsLoading, setProgramsLoading] = useState(false);
  const [isDataReady, setIsDataReady] = useState(false);

  // Program picker state
  const [showProgramPicker, setShowProgramPicker] = useState(false);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [pickerAssignedIds, setPickerAssignedIds] = useState<string[]>([]);
  const [pickerToggling, setPickerToggling] = useState<string | null>(null);
  const [visibilityToggling, setVisibilityToggling] = useState<string | null>(null);

  const loadProgramsProgress = async () => {
    if (!clientId) return;
    setProgramsLoading(true);
    const { data: assignments } = await supabase
      .from('program_assignments')
      .select('id, program_id, current_day, client_visible, program:programs(id, title, duration_days)')
      .eq('client_id', clientId)
      .order('started_at', { ascending: false });

    if (!assignments || assignments.length === 0) {
      setProgramsProgress([]);
      setProgramsLoading(false);
      return;
    }

    const results = await Promise.all(
      (assignments as any[])
        .filter((a) => a.program != null)
        .map(async (a) => {
          const [daysRes, logsRes, feedbackRes] = await Promise.all([
            supabase.from('program_days').select('id, day_number').eq('program_id', a.program_id).order('day_number', { ascending: true }),
            supabase.from('workout_logs').select('day_id').eq('client_id', clientId).eq('program_id', a.program_id),
            supabase.from('client_feedback').select('day_id, text').eq('client_id', clientId).eq('program_id', a.program_id),
          ]);
          return {
            programId: a.program_id as string,
            programTitle: a.program.title as string,
            totalDays: a.program.duration_days as number,
            currentDay: a.current_day as number,
            clientVisible: (a.client_visible ?? true) as boolean,
            days: (daysRes.data ?? []) as Array<{ id: string; day_number: number }>,
            completedDayIds: (logsRes.data ?? []).map((l: any) => l.day_id as string),
            feedbacks: (feedbackRes.data ?? []) as Array<{ day_id: string; text: string | null }>,
          };
        })
    );
    setProgramsProgress(results);
    setProgramsLoading(false);
  };

  const handleVisibilityToggle = async (prog: ProgramProgressItem) => {
    if (!clientId) return;
    setVisibilityToggling(prog.programId);
    await updateAssignmentVisibility(prog.programId, clientId, !prog.clientVisible);
    setVisibilityToggling(null);
    loadProgramsProgress();
  };

  useEffect(() => {
    if (!clientId) return;
    setIsDataReady(false);
    const load = async () => {
      await Promise.all([
        fetchMeasurements(clientId),
        fetchStrengthLogs(clientId),
        fetchPhotos(clientId),
        loadProgramsProgress(),
      ]);
      setIsDataReady(true);
    };
    load();
  }, [clientId]);

  useFocusEffect(useCallback(() => {
    if (clientId && coachId) fetchClientDocuments(coachId, clientId);
  }, [clientId, coachId]));

  const sections: { key: Section; label: string }[] = [
    { key: 'programs', label: t('progress.programs') },
    { key: 'documents', label: 'Documents' },
    { key: 'measurements', label: t('progress.measurements') },
    { key: 'strength', label: t('progress.strength') },
    { key: 'photos', label: t('progress.photos') },
  ];

  const labelKey = (label: string) =>
    `progress.label${label.charAt(0).toUpperCase()}${label.slice(1)}` as any;

  // Derived data
  const latest = measurements[0] ?? null;
  const weights = measurements
    .slice()
    .reverse()
    .map((m) => m.weight_kg)
    .filter((v): v is number => v != null);

  const exercises = Array.from(new Set(strengthLogs.map((l) => l.exercise_name)));
  const [selectedExercise, setSelectedExercise] = useState<string | null>(null);
  const activeExercise = selectedExercise ?? exercises[0] ?? null;
  const chartWeights = strengthLogs
    .filter((l) => l.exercise_name === activeExercise)
    .slice()
    .reverse()
    .map((l) => l.weight_kg);
  const prs = exercises
    .map((ex) => strengthLogs.find((l) => l.exercise_name === ex && l.is_pr))
    .filter(Boolean);

  const handleTabChange = (tab: Section) => {
    setSection(tab);
    if (tab === 'programs') {
      loadProgramsProgress();
    }
  };

  const openProgramPicker = async () => {
    setShowProgramPicker(true);
    setPickerLoading(true);
    await fetchMyPrograms();
    const { data } = await supabase
      .from('program_assignments')
      .select('program_id')
      .eq('client_id', clientId);
    setPickerAssignedIds((data ?? []).map((r: any) => r.program_id));
    setPickerLoading(false);
  };

  const handlePickerToggle = async (programId: string) => {
    if (!clientId) return;
    setPickerToggling(programId);
    const isAssigned = pickerAssignedIds.includes(programId);
    if (isAssigned) {
      const { error } = await unassignProgram(programId, clientId);
      if (!error) {
        setPickerAssignedIds((ids) => ids.filter((id) => id !== programId));
        loadProgramsProgress();
      }
    } else {
      const { error } = await assignProgram(programId, clientId);
      if (!error) {
        setPickerAssignedIds((ids) => [...ids, programId]);
        loadProgramsProgress();
      }
    }
    setPickerToggling(null);
  };

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      {/* Fullscreen photo viewer */}
      <Modal
        visible={fullscreenPhoto !== null}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setFullscreenPhoto(null)}
      >
        <View style={styles.modalOverlay}>
          <StatusBar hidden />
          <TouchableOpacity style={styles.modalClose} onPress={() => setFullscreenPhoto(null)}>
            <Text style={styles.modalCloseText}>✕</Text>
          </TouchableOpacity>
          {fullscreenPhoto && (
            <>
              <Image
                source={{ uri: fullscreenPhoto.url }}
                style={styles.fullscreenImage}
                resizeMode="contain"
              />
              <View style={styles.modalMeta}>
                <Text style={styles.modalLabel}>{t(labelKey(fullscreenPhoto.label))}</Text>
                <Text style={styles.modalDate}>{fullscreenPhoto.date}</Text>
              </View>
            </>
          )}
        </View>
      </Modal>

      {/* ── Program Picker Modal ── */}
      <Modal
        visible={showProgramPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowProgramPicker(false)}
      >
        <View style={styles.pickerOverlay}>
          <View style={styles.pickerSheet}>
            <Text style={styles.pickerTitle}>Assign / Change Program</Text>
            <Text style={styles.pickerSub}>Tap a program to assign or remove.</Text>
            {pickerLoading ? (
              <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.lg }} />
            ) : myPrograms.length === 0 ? (
              <Text style={styles.pickerSub}>
                No programs yet. Create one in the Programs tab.
              </Text>
            ) : (
              <ScrollView style={{ maxHeight: 340 }} showsVerticalScrollIndicator={false}>
                {myPrograms
                  .map((prog) => {
                    const isAssigned = pickerAssignedIds.includes(prog.id);
                    const isBusy = pickerToggling === prog.id;
                    return (
                      <TouchableOpacity
                        key={prog.id}
                        style={[styles.pickerRow, isAssigned && styles.pickerRowActive]}
                        onPress={() => handlePickerToggle(prog.id)}
                        disabled={!!isBusy}
                        activeOpacity={0.8}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={styles.pickerRowName}>{prog.title}</Text>
                          <Text style={styles.pickerRowSub}>{prog.duration_days} days</Text>
                        </View>
                        {isBusy ? (
                          <ActivityIndicator size="small" color={colors.primary} />
                        ) : isAssigned ? (
                          <View style={styles.pickerAssignedBadge}>
                            <Text style={styles.pickerAssignedText}>Assigned ✓</Text>
                          </View>
                        ) : (
                          <View style={styles.pickerUnassignedBadge}>
                            <Text style={styles.pickerUnassignedText}>Assign</Text>
                          </View>
                        )}
                      </TouchableOpacity>
                    );
                  })}
              </ScrollView>
            )}
            <TouchableOpacity
              style={styles.pickerDoneBtn}
              onPress={() => setShowProgramPicker(false)}
            >
              <Text style={styles.pickerDoneBtnText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Header */}
      <View style={styles.navbar}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <Text style={styles.backIcon}>‹</Text>
        </TouchableOpacity>
        <View style={styles.navCenter}>
          <Text style={styles.navTitle}>{clientName ?? t('progress.clientProgress')}</Text>
          <Text style={styles.navSubtitle}>
            {t('progress.clientProgress')}
            {clientMode === 'offline' ? '  ·  On Ground' : ''}
          </Text>
        </View>
        {coachId && clientId ? (
          <TouchableOpacity
            style={styles.chatHeaderBtn}
            onPress={() => router.push({
              pathname: '/chat/conversation',
              params: { coachId, clientId, otherName: clientName },
            })}
            activeOpacity={0.7}
          >
            <Text style={styles.chatHeaderIcon}>💬</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ width: 40 }} />
        )}
      </View>

      {/* Scrollable pill tab bar */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.pillScroll}
        contentContainerStyle={styles.tabBarContent}
      >
        {sections.map((s) => (
          <TouchableOpacity
            key={s.key}
            style={[styles.tabPill, section === s.key && styles.tabPillActive]}
            onPress={() => handleTabChange(s.key)}
            activeOpacity={0.75}
          >
            <Text style={[styles.tabPillText, section === s.key && styles.tabPillTextActive]}>
              {s.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView contentContainerStyle={styles.content} style={styles.contentScroll}>
        {!isDataReady ? (
          <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: spacing['3xl'] ?? 48 }} />
        ) : null}
        {/* ─── Measurements ─────────────────────────────────────────────── */}
        {isDataReady && section === 'measurements' && (
          <View>
            {isLoading && measurements.length === 0 ? (
              <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} />
            ) : measurements.length === 0 ? (
              <View style={styles.emptyState}>
                <View style={styles.emptyIconWrap}><Text style={styles.emptyIcon}>⚖️</Text></View>
                <Text style={styles.emptyText}>{t('progress.noMeasurements')}</Text>
              </View>
            ) : (
              <>
                {latest && (
                  <View style={styles.statsCard}>
                    <Text style={styles.statsCardTitle}>{t('progress.latest')}</Text>
                    <View style={styles.statRow}>
                      {latest.weight_kg != null && (
                        <View style={styles.statItem}>
                          <Text style={styles.statValue}>{latest.weight_kg}</Text>
                          <Text style={styles.statLabel}>{t('progress.weightKg')} kg</Text>
                        </View>
                      )}
                      {latest.weight_kg != null && latest.body_fat_pct != null && <View style={styles.statDivider} />}
                      {latest.body_fat_pct != null && (
                        <View style={styles.statItem}>
                          <Text style={styles.statValue}>{latest.body_fat_pct}%</Text>
                          <Text style={styles.statLabel}>{t('progress.bodyFat')}</Text>
                        </View>
                      )}
                      {latest.body_fat_pct != null && latest.muscle_mass_kg != null && <View style={styles.statDivider} />}
                      {latest.muscle_mass_kg != null && (
                        <View style={styles.statItem}>
                          <Text style={styles.statValue}>{latest.muscle_mass_kg}</Text>
                          <Text style={styles.statLabel}>{t('progress.muscleMass')} kg</Text>
                        </View>
                      )}
                    </View>
                  </View>
                )}

                {weights.length >= 2 && (
                  <View style={styles.chartCard}>
                    <Text style={styles.chartLabel}>{t('progress.weightTrend')}</Text>
                    <SparkChart data={weights} color={colors.primary} />
                    <View style={styles.chartRange}>
                      <Text style={styles.chartMin}>{Math.min(...weights)} kg</Text>
                      <Text style={styles.chartMax}>{Math.max(...weights)} kg</Text>
                    </View>
                  </View>
                )}

                {measurements.map((m) => (
                  <View key={m.id} style={styles.logRow}>
                    <View style={styles.logAccentBar} />
                    <View style={styles.logInfo}>
                      <Text style={styles.logDate}>{m.date}</Text>
                      <View style={styles.logStats}>
                        {m.weight_kg != null && <View style={styles.logStatChip}><Text style={styles.logStat}>{m.weight_kg} kg</Text></View>}
                        {m.body_fat_pct != null && <View style={styles.logStatChip}><Text style={styles.logStat}>{m.body_fat_pct}% fat</Text></View>}
                        {m.muscle_mass_kg != null && <View style={styles.logStatChip}><Text style={styles.logStat}>{m.muscle_mass_kg} kg muscle</Text></View>}
                      </View>
                      {m.notes ? <Text style={styles.logNotes}>{m.notes}</Text> : null}
                    </View>
                  </View>
                ))}
              </>
            )}
          </View>
        )}

        {/* ─── Strength ─────────────────────────────────────────────────── */}
        {isDataReady && section === 'strength' && (
          <View>
            {isLoading && strengthLogs.length === 0 ? (
              <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} />
            ) : strengthLogs.length === 0 ? (
              <View style={styles.emptyState}>
                <View style={styles.emptyIconWrap}><Text style={styles.emptyIcon}>🏋️</Text></View>
                <Text style={styles.emptyText}>{t('progress.noStrength')}</Text>
              </View>
            ) : (
              <>
                {prs.length > 0 && (
                  <View style={styles.prBanner}>
                    <Text style={styles.prBannerTitle}>🏆 {t('progress.personalRecords')}</Text>
                    {prs.map((pr) => pr && (
                      <View key={pr.id} style={styles.prBannerRow}>
                        <Text style={styles.prBannerExercise}>{pr.exercise_name}</Text>
                        <Text style={styles.prBannerWeight}>{pr.weight_kg} kg</Text>
                      </View>
                    ))}
                  </View>
                )}

                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.exercisePicker}
                  contentContainerStyle={{ gap: spacing.sm }}
                >
                  {exercises.map((ex) => (
                    <TouchableOpacity
                      key={ex}
                      style={[
                        styles.exerciseChip,
                        activeExercise === ex && styles.exerciseChipActive,
                      ]}
                      onPress={() => setSelectedExercise(ex)}
                    >
                      <Text
                        style={[
                          styles.exerciseChipText,
                          activeExercise === ex && styles.exerciseChipTextActive,
                        ]}
                      >
                        {ex}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                {chartWeights.length >= 2 && (
                  <View style={styles.chartCard}>
                    <Text style={styles.chartLabel}>{t('progress.strengthTrend')}</Text>
                    <SparkChart data={chartWeights} color={colors.success} />
                    <View style={styles.chartRange}>
                      <Text style={styles.chartMin}>{Math.min(...chartWeights)} kg</Text>
                      <Text style={styles.chartMax}>{Math.max(...chartWeights)} kg</Text>
                    </View>
                  </View>
                )}

                {strengthLogs
                  .filter((l) => l.exercise_name === activeExercise)
                  .map((log) => (
                    <View
                      key={log.id}
                      style={[styles.logRow, log.is_pr && styles.logRowPR]}
                    >
                      <View style={[styles.logAccentBar, { backgroundColor: log.is_pr ? colors.warning : colors.success }]} />
                      <View style={styles.logInfo}>
                        <View style={styles.logRowHeader}>
                          <Text style={styles.logDate}>{log.date}</Text>
                          {log.is_pr && (
                            <View style={styles.prBadgeContainer}>
                              <Text style={styles.prBadgeText}>{t('progress.prBadge')}</Text>
                            </View>
                          )}
                        </View>
                        <View style={styles.logStatChip}>
                          <Text style={styles.logStat}>
                            {log.weight_kg} kg · {log.sets} × {log.reps}
                          </Text>
                        </View>
                      </View>
                    </View>
                  ))}
              </>
            )}
          </View>
        )}

        {/* ─── Documents ─────────────────────────────────────────────────────────────────── */}
        {isDataReady && section === 'documents' && (
          <View>
            {clientDocuments.length === 0 ? (
              <View style={styles.emptyState}>
                <View style={styles.emptyIconWrap}><Text style={styles.emptyIcon}>📄</Text></View>
                <Text style={styles.emptyText}>No documents shared with this client yet.</Text>
              </View>
            ) : (
              <View style={{ gap: spacing.sm }}>
                {clientDocuments.map((doc) => (
                  <TouchableOpacity
                    key={doc.id}
                    style={styles.docCard}
                    activeOpacity={0.8}
                    onPress={() => previewDocument(doc)}
                  >
                    <View style={styles.docIconBox}>
                      <Text style={{ fontSize: 20 }}>📄</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.docCardTitle} numberOfLines={1}>{doc.title}</Text>
                      {!!doc.description && (
                        <Text style={styles.docCardDesc} numberOfLines={2}>{doc.description}</Text>
                      )}
                      <Text style={styles.docCardMeta}>Tap to preview</Text>
                    </View>
                    <TouchableOpacity
                      hitSlop={{ top: 8, bottom: 8, left: 12, right: 8 }}
                      onPress={() => openDocument(doc, doc.coach_id)}
                      activeOpacity={0.7}
                    >
                      <Text style={{ fontSize: 20 }}>⬆️</Text>
                    </TouchableOpacity>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        )}

        {/* ─── Photos ───────────────────────────────────────────────────── */}
        {isDataReady && section === 'photos' && (
          <View>
            {isLoading && photos.length === 0 ? (
              <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} />
            ) : photos.length === 0 ? (
              <View style={styles.emptyState}>
                <View style={styles.emptyIconWrap}><Text style={styles.emptyIcon}>📸</Text></View>
                <Text style={styles.emptyText}>{t('progress.noPhotos')}</Text>
              </View>
            ) : (
              <View style={styles.photoGrid}>
                {photos.map((p) => (
                  <TouchableOpacity
                    key={p.id}
                    style={styles.photoCard}
                    onPress={() => setFullscreenPhoto({ url: p.photo_url, label: p.label, date: p.date })}
                    activeOpacity={0.85}
                  >
                    <Image
                      source={{ uri: p.photo_url }}
                      style={styles.photoImage}
                      resizeMode="cover"
                    />
                    <View style={styles.photoMeta}>
                      <Text style={styles.photoLabel}>{t(labelKey(p.label))}</Text>
                      <Text style={styles.photoDate}>{p.date}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        )}

        {/* ─── Programs ─────────────────────────────────────────────────── */}
        {isDataReady && section === 'programs' && (
          <View>
            <TouchableOpacity style={styles.assignProgramBtn} onPress={openProgramPicker}>
              <Text style={styles.assignProgramBtnText}>Assign / Change Program</Text>
            </TouchableOpacity>
            {programsLoading ? (
              <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} />
            ) : programsProgress.length === 0 ? (
              <View style={styles.emptyState}>
                <View style={styles.emptyIconWrap}><Text style={styles.emptyIcon}>📋</Text></View>
                <Text style={styles.emptyText}>{t('progress.noProgramsAssigned')}</Text>
              </View>
            ) : (
              programsProgress.map((prog) => {
                const donePct = Math.min(
                  (prog.completedDayIds.length / Math.max(prog.totalDays, 1)) * 100,
                  100,
                );
                return (
                  <TouchableOpacity
                    key={prog.programId}
                    style={styles.progCard}
                    onPress={() => router.push({ pathname: '/programs/detail', params: { id: prog.programId } })}
                    activeOpacity={0.8}
                  >
                    <View style={styles.progCardHeader}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.progCardTitle} numberOfLines={1}>
                          {prog.programTitle}
                        </Text>
                        <Text style={styles.progCardMeta}>
                          {t('progress.completedOf', { done: prog.completedDayIds.length, total: prog.totalDays })}
                        </Text>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <TouchableOpacity
                          onPress={() => handleVisibilityToggle(prog)}
                          disabled={visibilityToggling === prog.programId}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          activeOpacity={0.7}
                        >
                          {visibilityToggling === prog.programId
                            ? <ActivityIndicator size="small" color={colors.primary} />
                            : <View style={[styles.visBadge, prog.clientVisible ? styles.visBadgeOn : styles.visBadgeOff]}>
                                <Text style={[styles.visBadgeText, prog.clientVisible ? styles.visBadgeTextOn : styles.visBadgeTextOff]}>
                                  {prog.clientVisible ? '👁 Visible' : '🔒 Hidden'}
                                </Text>
                              </View>}
                        </TouchableOpacity>
                        <Text style={styles.progCardChevron}>›</Text>
                      </View>
                    </View>
                    <View style={styles.progressTrack}>
                      <View style={[styles.progressFill, { width: `${Math.round(donePct)}%` as any }]} />
                    </View>
                    <View style={styles.daysList}>
                      {prog.days.map((day) => {
                        const done = prog.completedDayIds.includes(day.id);
                        const feedback = prog.feedbacks.find((f) => f.day_id === day.id);
                        return (
                          <View key={day.id} style={styles.dayRow}>
                            <View style={[styles.dayDot, done && styles.dayDotDone]} />
                            <View style={{ flex: 1 }}>
                              <Text style={[styles.dayRowText, done && styles.dayRowTextDone]}>
                                Day {day.day_number}{done ? '  ✓' : ''}
                              </Text>
                              {feedback?.text ? (
                                <Text style={styles.dayFeedback} numberOfLines={2}>
                                  "{feedback.text}"
                                </Text>
                              ) : null}
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  </TouchableOpacity>
                );
              })
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },

  // ── Navbar ───────────────────────────────────────────────────────────────
  navbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing['2xl'],
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
    backgroundColor: colors.background,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.accentFaded,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backIcon: { fontSize: 26, color: colors.primary, fontWeight: '600', lineHeight: 30, marginLeft: -2 },
  navCenter: { flex: 1, alignItems: 'center' },
  navTitle: { fontSize: fontSize.lg, fontWeight: '800', color: colors.text, letterSpacing: -0.3 },
  navSubtitle: { fontSize: fontSize.xs, color: colors.textMuted, fontWeight: '500', marginTop: 1 },
  chatHeaderBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatHeaderIcon: { fontSize: 18 },

  // ── Tab pills ─────────────────────────────────────────────────────────────
  pillScroll: { flexGrow: 0, flexShrink: 0 },
  tabBarContent: {
    flexDirection: 'row',
    paddingHorizontal: spacing['2xl'],
    paddingBottom: spacing.md,
    gap: spacing.sm,
    alignItems: 'center',
  },
  tabPill: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    backgroundColor: colors.background,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  tabPillActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabPillText: { fontSize: fontSize.sm, fontWeight: '600', color: colors.textMuted },
  tabPillTextActive: { color: '#fff', fontWeight: '700' },

  // ── Content ──────────────────────────────────────────────────────────────
  contentScroll: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing['2xl'], paddingBottom: 60, paddingTop: spacing.sm },

  // ── Empty state ───────────────────────────────────────────────────────────
  emptyState: { alignItems: 'center', paddingVertical: spacing['4xl'] },
  emptyIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.accentFaded,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  emptyIcon: { fontSize: 32 },
  emptyText: { fontSize: fontSize.md, color: colors.textMuted, textAlign: 'center', fontWeight: '500' },

  // ── Stats card (navy background) ─────────────────────────────────────────
  statsCard: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.xl,
    padding: spacing.xl,
    marginBottom: spacing.md,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 10,
    elevation: 4,
  },
  statsCardTitle: {
    fontSize: fontSize.xs,
    color: 'rgba(255,255,255,0.6)',
    fontWeight: '700',
    marginBottom: spacing.md,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  statRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around' },
  statItem: { alignItems: 'center', flex: 1 },
  statDivider: { width: 1, height: 36, backgroundColor: 'rgba(255,255,255,0.2)' },
  statValue: { fontSize: fontSize['2xl'], fontWeight: '800', color: '#fff', letterSpacing: -0.5 },
  statLabel: { fontSize: fontSize.xs, color: 'rgba(255,255,255,0.6)', marginTop: 2, fontWeight: '600' },

  // ── Chart card ─────────────────────────────────────────────────────────────
  chartCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.xl,
    borderWidth: 1.5,
    borderColor: colors.border,
    marginBottom: spacing.md,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  chartLabel: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: spacing.md,
  },
  chartRange: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.sm },
  chartMin: { fontSize: fontSize.xs, color: colors.textMuted, fontWeight: '500' },
  chartMax: { fontSize: fontSize.xs, color: colors.primary, fontWeight: '700' },

  // ── Log rows (accent bar style) ────────────────────────────────────────
  logRow: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
    flexDirection: 'row',
    overflow: 'hidden',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  logRowPR: { borderColor: colors.warning },
  logAccentBar: { width: 4, backgroundColor: colors.primary },
  logInfo: { flex: 1, padding: spacing.md, gap: spacing.xs },
  logRowHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  logDate: { fontSize: fontSize.sm, fontWeight: '700', color: colors.text },
  logStats: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  logStatChip: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  logStat: { fontSize: fontSize.sm, color: colors.textSecondary, fontWeight: '600' },
  logNotes: { fontSize: fontSize.xs, color: colors.textMuted, fontStyle: 'italic' },

  // ── PR ──────────────────────────────────────────────────────────────────
  prBadgeContainer: {
    backgroundColor: colors.warning,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  prBadgeText: { color: '#fff', fontSize: fontSize.xs, fontWeight: '800' },
  prBanner: {
    backgroundColor: colors.warningFaded,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    borderWidth: 1.5,
    borderColor: `${colors.warning}55`,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  prBannerTitle: { fontSize: fontSize.md, fontWeight: '800', color: colors.warning },
  prBannerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  prBannerExercise: { fontSize: fontSize.sm, color: colors.text, fontWeight: '500' },
  prBannerWeight: { fontSize: fontSize.sm, fontWeight: '800', color: colors.text },

  // ── Exercise picker ───────────────────────────────────────────────────────
  exercisePicker: { marginBottom: spacing.md },
  exerciseChip: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  exerciseChipActive: { backgroundColor: colors.success, borderColor: colors.success },
  exerciseChipText: { fontSize: fontSize.sm, color: colors.textMuted, fontWeight: '600' },
  exerciseChipTextActive: { color: '#fff', fontWeight: '700' },

  // ── Photo grid ────────────────────────────────────────────────────────────
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  photoCard: {
    width: '47.5%',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  photoImage: { width: '100%', aspectRatio: 0.85 },
  photoMeta: { padding: spacing.sm, gap: 2 },
  photoLabel: { fontSize: fontSize.sm, color: colors.text, fontWeight: '700', textTransform: 'capitalize' },
  photoDate: { fontSize: fontSize.xs, color: colors.textMuted },

  // ── Fullscreen photo modal ───────────────────────────────────────────────
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalClose: {
    position: 'absolute',
    top: 60,
    right: spacing['2xl'],
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  modalCloseText: { fontSize: 18, color: '#fff', fontWeight: '700' },
  fullscreenImage: {
    width: Dimensions.get('window').width,
    height: Dimensions.get('window').height * 0.72,
  },
  modalMeta: { position: 'absolute', bottom: 60, left: 0, right: 0, alignItems: 'center' },
  modalLabel: { fontSize: fontSize.md, color: '#fff', fontWeight: '600' },
  modalDate: { fontSize: fontSize.sm, color: 'rgba(255,255,255,0.7)', marginTop: 4 },

  // ── Programs ──────────────────────────────────────────────────────────────
  progCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    marginBottom: spacing.md,
    gap: spacing.sm,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  progCardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  progCardTitle: { fontSize: fontSize.md, fontWeight: '800', color: colors.text, letterSpacing: -0.2 },
  progCardMeta: { fontSize: fontSize.sm, fontWeight: '700', color: colors.accent },
  progCardChevron: { fontSize: 22, color: colors.textMuted, fontWeight: '300', marginLeft: spacing.xs },
  progressTrack: {
    height: 8,
    backgroundColor: colors.surfaceLight,
    borderRadius: 4,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  progressFill: { height: '100%', backgroundColor: colors.primary, borderRadius: 4 },
  daysList: { gap: spacing.sm, marginTop: spacing.xs },
  dayRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  dayDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: colors.border,
    marginTop: 3,
    flexShrink: 0,
  },
  dayDotDone: { backgroundColor: colors.success, borderColor: colors.success },
  dayRowText: { fontSize: fontSize.sm, color: colors.textSecondary },
  dayRowTextDone: { color: colors.text, fontWeight: '600' },
  dayFeedback: { fontSize: fontSize.xs, color: colors.textMuted, fontStyle: 'italic', marginTop: 2 },

  // ── Assign / Change Program button ────────────────────────────────────────
  assignProgramBtn: {
    backgroundColor: colors.primary + '14',
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: colors.primary + '44',
    marginBottom: spacing.md,
  },
  assignProgramBtnText: { fontSize: fontSize.sm, fontWeight: '700', color: colors.primary },

  // ── Program Picker Modal ──────────────────────────────────────────────────
  pickerOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  pickerSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: spacing['2xl'],
    paddingBottom: 40,
    gap: spacing.md,
  },
  pickerTitle: { fontSize: fontSize.xl, fontWeight: '800', color: colors.text },
  pickerSub: { fontSize: fontSize.sm, color: colors.textMuted, marginTop: -spacing.sm },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    marginBottom: spacing.xs,
  },
  pickerRowActive: { borderColor: colors.primary, backgroundColor: colors.primary + '08' },
  pickerRowName: { fontSize: fontSize.md, fontWeight: '600', color: colors.text },
  pickerRowSub: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },
  pickerAssignedBadge: {
    backgroundColor: colors.success + '18',
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  pickerAssignedText: { fontSize: fontSize.xs, fontWeight: '700', color: colors.success },
  pickerUnassignedBadge: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  pickerUnassignedText: { fontSize: fontSize.xs, fontWeight: '700', color: '#fff' },
  pickerDoneBtn: {
    paddingVertical: spacing.md,
    alignItems: 'center',
    borderRadius: borderRadius.full,
    borderWidth: 1.5,
    borderColor: colors.border,
    marginTop: spacing.xs,
  },
  pickerDoneBtnText: { fontSize: fontSize.md, fontWeight: '600', color: colors.textMuted },

  visBadge: { borderRadius: borderRadius.sm, paddingHorizontal: 8, paddingVertical: 3 },
  visBadgeOn: { backgroundColor: `${colors.success}22` },
  visBadgeOff: { backgroundColor: `${colors.textMuted}22` },
  visBadgeText: { fontSize: 11, fontWeight: '700' },
  visBadgeTextOn: { color: colors.success },
  visBadgeTextOff: { color: colors.textMuted },

  docCard: {
    backgroundColor: colors.card, borderRadius: borderRadius.md,
    borderWidth: 1, borderColor: colors.border,
    flexDirection: 'row', alignItems: 'center',
    padding: spacing.md, gap: spacing.md,
    marginBottom: spacing.sm,
  },
  docIconBox: {
    width: 40, height: 40, borderRadius: borderRadius.sm,
    backgroundColor: colors.accentFaded, alignItems: 'center', justifyContent: 'center',
  },
  docCardTitle: { fontSize: fontSize.sm, fontWeight: '700', color: colors.text },
  docCardDesc: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },
  docCardMeta: { fontSize: fontSize.xs, color: colors.primary, marginTop: 2, fontWeight: '600' },
});
