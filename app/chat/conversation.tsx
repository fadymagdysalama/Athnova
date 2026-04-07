import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuthStore } from '../../src/stores/authStore';
import { supabase } from '../../src/lib/supabase';
import { colors, spacing, fontSize, borderRadius } from '../../src/constants/theme';

interface Message {
  id: string;
  sender_id: string;
  client_id: string;
  body: string;
  is_read: boolean;
  created_at: string;
}

function formatTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const isToday =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear();
  if (isToday) {
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  }
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
    ' ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

export default function ConversationScreen() {
  const router = useRouter();
  const { coachId, clientId, otherName } = useLocalSearchParams<{
    coachId: string;
    clientId: string;
    otherName: string;
  }>();
  const { profile } = useAuthStore();

  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const flatRef = useRef<FlatList<Message>>(null);

  const myId = profile?.id ?? '';

  const markRead = useCallback(async () => {
    if (!coachId || !clientId) return;
    await supabase
      .from('coach_client_messages')
      .update({ is_read: true })
      .eq('coach_id', coachId)
      .eq('client_id', clientId)
      .neq('sender_id', myId)
      .eq('is_read', false);
  }, [coachId, clientId, myId]);

  const loadMessages = useCallback(async () => {
    if (!coachId || !clientId) return;
    setLoading(true);
    const { data } = await supabase
      .from('coach_client_messages')
      .select('id, sender_id, client_id, body, is_read, created_at')
      .eq('coach_id', coachId)
      .eq('client_id', clientId)
      .order('created_at', { ascending: true });
    setMessages((data as Message[]) ?? []);
    setLoading(false);
    await markRead();
  }, [coachId, clientId, markRead]);

  useEffect(() => {
    loadMessages();

    // Realtime subscription
    const channel = supabase
      .channel(`chat:${coachId}:${clientId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'coach_client_messages',
          filter: `coach_id=eq.${coachId}`,
        },
        async (payload) => {
          const msg = payload.new as Message;
          if (msg.client_id !== clientId) return;
          setMessages((prev) => {
            if (prev.find((m) => m.id === msg.id)) return prev;
            return [...prev, msg];
          });
          // Mark incoming as read immediately (we're in the conversation)
          if (msg.sender_id !== myId) {
            await supabase
              .from('coach_client_messages')
              .update({ is_read: true })
              .eq('id', msg.id);
          }
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [coachId, clientId]);

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => flatRef.current?.scrollToEnd({ animated: false }), 80);
    }
  }, [messages.length]);

  const handleSend = async () => {
    const body = text.trim();
    if (!body || sending) return;
    setText('');
    setSending(true);
    const { data, error } = await supabase
      .from('coach_client_messages')
      .insert({
        coach_id: coachId,
        client_id: clientId,
        sender_id: myId,
        body,
        is_read: false,
      })
      .select('id, sender_id, client_id, body, is_read, created_at')
      .single();
    setSending(false);
    if (!error && data) {
      setMessages((prev) => [...prev, data as Message]);
    }
  };

  const renderMessage = ({ item, index }: { item: Message; index: number }) => {
    const isMine = item.sender_id === myId;
    const prev = messages[index - 1];
    const showTime =
      !prev ||
      new Date(item.created_at).getTime() - new Date(prev.created_at).getTime() > 5 * 60 * 1000;

    return (
      <View>
        {showTime && (
          <Text style={styles.timeLabel}>{formatTime(item.created_at)}</Text>
        )}
        <View style={[styles.bubbleRow, isMine ? styles.bubbleRowMine : styles.bubbleRowOther]}>
          <View style={[styles.bubble, isMine ? styles.bubbleMine : styles.bubbleOther]}>
            <Text style={[styles.bubbleText, isMine && styles.bubbleTextMine]}>{item.body}</Text>
          </View>
          {isMine && !item.is_read && (
            <Text style={styles.unreadTick}>✓</Text>
          )}
          {isMine && item.is_read && (
            <Text style={[styles.unreadTick, { color: colors.primary }]}>✓✓</Text>
          )}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.root}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <Text style={styles.backIcon}>‹</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <View style={styles.headerAvatar}>
            <Text style={styles.headerAvatarText}>
              {(otherName ?? '?').charAt(0).toUpperCase()}
            </Text>
          </View>
          <View>
            <Text style={styles.headerName}>{otherName}</Text>
            <Text style={styles.headerSub}>
              {profile?.role === 'coach' ? 'Client' : 'Your Coach'}
            </Text>
          </View>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : (
          <FlatList
            ref={flatRef}
            data={messages}
            keyExtractor={(m) => m.id}
            renderItem={renderMessage}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <View style={styles.emptyIcon}>
                  {/* Chat bubble icon */}
                  <View style={{ width: 28, height: 24, borderWidth: 2.5, borderColor: colors.primary, borderRadius: 10, alignItems: 'center', justifyContent: 'center' }}>
                    <View style={{ position: 'absolute', bottom: -6, left: 6, width: 10, height: 10, backgroundColor: colors.card, borderRightWidth: 2.5, borderBottomWidth: 2.5, borderColor: colors.primary, transform: [{ rotate: '45deg' }] }} />
                    <View style={{ flexDirection: 'row', gap: 4 }}>
                      <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: colors.primary }} />
                      <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: colors.primary }} />
                      <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: colors.primary }} />
                    </View>
                  </View>
                </View>
                <Text style={styles.emptyTitle}>Start the conversation</Text>
                <Text style={styles.emptySub}>Send a message to {otherName}</Text>
              </View>
            }
          />
        )}

        {/* Input bar */}
        <View style={styles.inputBar}>
          <TextInput
            style={styles.input}
            value={text}
            onChangeText={setText}
            placeholder="Type a message..."
            placeholderTextColor={colors.textMuted}
            multiline
            returnKeyType="default"
            blurOnSubmit={false}
          />
          <TouchableOpacity
            style={[styles.sendBtn, (!text.trim() || sending) && styles.sendBtnDis]}
            onPress={handleSend}
            disabled={!text.trim() || sending}
            activeOpacity={0.8}
          >
            {sending
              ? <ActivityIndicator size="small" color="#fff" />
              : (
                /* Send arrow */
                <View style={{ alignItems: 'center', justifyContent: 'center' }}>
                  <View style={{ width: 0, height: 0, borderLeftWidth: 6, borderRightWidth: 6, borderBottomWidth: 10, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: '#fff' }} />
                </View>
              )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    backgroundColor: colors.card,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.accentFaded,
    alignItems: 'center', justifyContent: 'center',
  },
  backIcon: { fontSize: 28, color: colors.primary, fontWeight: '600', lineHeight: 32, marginLeft: -2 },
  headerCenter: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  headerAvatar: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  headerAvatarText: { fontSize: 15, fontWeight: '800', color: '#fff' },
  headerName: { fontSize: fontSize.md, fontWeight: '700', color: colors.text },
  headerSub: { fontSize: fontSize.xs, color: colors.textMuted },

  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  listContent: { padding: spacing.lg, paddingBottom: spacing.md, gap: 2 },

  timeLabel: {
    fontSize: fontSize.xs, color: colors.textMuted,
    textAlign: 'center', marginVertical: spacing.sm, fontWeight: '500',
  },
  bubbleRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, marginBottom: 2 },
  bubbleRowMine: { justifyContent: 'flex-end' },
  bubbleRowOther: { justifyContent: 'flex-start' },
  bubble: {
    maxWidth: '75%',
    borderRadius: 18,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  bubbleMine: {
    backgroundColor: colors.primary,
    borderBottomRightRadius: 4,
  },
  bubbleOther: {
    backgroundColor: colors.surfaceLight,
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  bubbleText: { fontSize: fontSize.sm, lineHeight: 20, color: colors.text },
  bubbleTextMine: { color: '#fff' },
  unreadTick: { fontSize: 11, color: colors.textMuted, marginBottom: 4 },

  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: spacing.md },
  emptyIcon: {
    width: 64, height: 64, borderRadius: 18,
    backgroundColor: colors.accentFaded,
    alignItems: 'center', justifyContent: 'center',
  },
  emptyTitle: { fontSize: fontSize.md, fontWeight: '700', color: colors.text },
  emptySub: { fontSize: fontSize.sm, color: colors.textMuted },

  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    backgroundColor: colors.card,
  },
  input: {
    flex: 1,
    backgroundColor: colors.background,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: fontSize.sm,
    color: colors.text,
    maxHeight: 120,
    textAlignVertical: 'center',
  },
  sendBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  sendBtnDis: { opacity: 0.4 },
});
