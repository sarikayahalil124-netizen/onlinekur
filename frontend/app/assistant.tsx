import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  View, Text, StyleSheet, FlatList, TextInput, Pressable, ActivityIndicator,
  KeyboardAvoidingView, Platform, ScrollView, Linking,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAudioRecorder, AudioModule, RecordingPresets, setAudioModeAsync, createAudioPlayer } from "expo-audio";
import { useTheme } from "@/src/theme/ThemeContext";
import { useAlarms } from "@/src/context/AlarmsContext";
import { api } from "@/src/api/client";
import { getDeviceId } from "@/src/utils/device";

const ttsPlayer = createAudioPlayer();

interface Msg {
  role: "user" | "assistant";
  content: string;
}

const QUICK = [
  { label: "Bugünkü piyasa yorumu", commentary: true },
  { label: "Dolar bugün ne durumda?", commentary: false },
  { label: "Altın mı döviz mi almalıyım?", commentary: false },
];

export default function AssistantScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [initing, setIniting] = useState(true);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [speakingIdx, setSpeakingIdx] = useState<number | null>(null);
  const [ttsLoadingIdx, setTtsLoadingIdx] = useState<number | null>(null);
  const listRef = useRef<FlatList<Msg>>(null);
  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const { refresh: refreshAlarms } = useAlarms();

  useEffect(() => {
    const sub = ttsPlayer.addListener("playbackStatusUpdate", (status: any) => {
      if (status?.didJustFinish) setSpeakingIdx(null);
    });
    return () => {
      sub?.remove?.();
      try {
        ttsPlayer.pause();
      } catch {}
    };
  }, []);

  const speak = useCallback(
    async (idx: number, text: string) => {
      // toggle off if this message is already speaking
      if (speakingIdx === idx) {
        try {
          ttsPlayer.pause();
        } catch {}
        setSpeakingIdx(null);
        return;
      }
      setTtsLoadingIdx(idx);
      try {
        const { url } = await api.aiTts(text);
        await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
        ttsPlayer.replace({ uri: url });
        ttsPlayer.play();
        setSpeakingIdx(idx);
      } catch {
        // silent fail; user still has the text
      } finally {
        setTtsLoadingIdx(null);
      }
    },
    [speakingIdx],
  );

  useEffect(() => {
    (async () => {
      try {
        const deviceId = await getDeviceId();
        const res = await api.aiMessages(deviceId);
        setMessages((res.items || []).map((m: any) => ({ role: m.role, content: m.content })));
      } catch {}
      setIniting(false);
    })();
  }, []);

  const scrollDown = useCallback(() => {
    requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
  }, []);

  const send = useCallback(
    async (text: string, autoSpeak = false) => {
      const t = text.trim();
      if (!t || sending) return;
      setInput("");
      setMessages((prev) => [...prev, { role: "user", content: t }]);
      setSending(true);
      scrollDown();
      try {
        const deviceId = await getDeviceId();
        const r = await api.aiChat(deviceId, t);
        setMessages((prev) => {
          const next = [...prev, { role: "assistant" as const, content: r.reply }];
          if (autoSpeak && r.reply) {
            const idx = next.length - 1;
            setTimeout(() => speak(idx, r.reply), 250);
          }
          return next;
        });
        if (r.alarmCreated) refreshAlarms();
      } catch (e: any) {
        setMessages((prev) => [...prev, { role: "assistant", content: "⚠️ " + (e?.message || "Yanıt alınamadı. Lütfen tekrar deneyin.") }]);
      } finally {
        setSending(false);
        scrollDown();
      }
    },
    [sending, scrollDown, refreshAlarms, speak],
  );

  const startRecording = useCallback(async () => {
    try {
      const perm = await AudioModule.getRecordingPermissionsAsync();
      let status = perm;
      if (!perm.granted) {
        if (!perm.canAskAgain) {
          Linking.openSettings();
          return;
        }
        status = await AudioModule.requestRecordingPermissionsAsync();
      }
      if (!status.granted) return;
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await audioRecorder.prepareToRecordAsync();
      audioRecorder.record();
      setRecording(true);
    } catch {
      setRecording(false);
    }
  }, [audioRecorder]);

  const stopAndTranscribe = useCallback(async () => {
    setRecording(false);
    setTranscribing(true);
    try {
      await audioRecorder.stop();
      const uri = audioRecorder.uri;
      if (!uri) throw new Error("Kayıt bulunamadı");
      let res: { text: string };
      if (Platform.OS === "web") {
        const blob = await (await fetch(uri)).blob();
        res = await api.aiTranscribeBlob(blob, "recording.webm");
      } else {
        res = await api.aiTranscribe(uri, "audio/m4a", "recording.m4a");
      }
      const text = (res.text || "").trim();
      if (text) {
        setInput("");
        await send(text, true);
      }
    } catch {
      // silent — user can type instead
    } finally {
      setTranscribing(false);
    }
  }, [audioRecorder, send]);

  const toggleRecord = useCallback(() => {
    if (transcribing || sending) return;
    if (recording) stopAndTranscribe();
    else startRecording();
  }, [recording, transcribing, sending, startRecording, stopAndTranscribe]);

  const sendCommentary = useCallback(async () => {
    if (sending) return;
    setMessages((prev) => [...prev, { role: "user", content: "Bugünkü piyasa yorumu" }]);
    setSending(true);
    scrollDown();
    try {
      const r = await api.aiCommentary();
      setMessages((prev) => [...prev, { role: "assistant", content: r.commentary }]);
    } catch (e: any) {
      setMessages((prev) => [...prev, { role: "assistant", content: "⚠️ " + (e?.message || "Yorum alınamadı.") }]);
    } finally {
      setSending(false);
      scrollDown();
    }
  }, [sending, scrollDown]);

  const clear = useCallback(async () => {
    setMessages([]);
    try {
      const deviceId = await getDeviceId();
      await api.aiClear(deviceId);
    } catch {}
  }, []);

  const renderMsg = ({ item, index }: { item: Msg; index: number }) => {
    const isUser = item.role === "user";
    return (
      <View
        testID={`ai-msg-${item.role}`}
        style={[
          styles.bubble,
          isUser
            ? { alignSelf: "flex-end", backgroundColor: colors.gold, borderBottomRightRadius: 4 }
            : { alignSelf: "flex-start", backgroundColor: colors.card, borderColor: colors.border, borderWidth: StyleSheet.hairlineWidth, borderBottomLeftRadius: 4 },
        ]}
      >
        <Text style={{ color: isUser ? colors.onGold : colors.text, fontSize: 14.5, lineHeight: 21 }}>
          {item.content}
        </Text>
        {!isUser && (
          <Pressable
            testID={`ai-speak-${index}`}
            onPress={() => speak(index, item.content)}
            hitSlop={8}
            style={[styles.speakBtn, { borderTopColor: colors.border }]}
          >
            {ttsLoadingIdx === index ? (
              <ActivityIndicator size="small" color={colors.gold} />
            ) : (
              <Ionicons name={speakingIdx === index ? "stop-circle" : "volume-high"} size={16} color={colors.gold} />
            )}
            <Text style={[styles.speakTxt, { color: colors.gold }]}>
              {speakingIdx === index ? "Durdur" : "Sesli oku"}
            </Text>
          </Pressable>
        )}
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      {/* Custom header */}
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border, backgroundColor: colors.bg }]}>
        <Pressable testID="assistant-back" onPress={() => router.back()} hitSlop={10} style={styles.hBtn}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[styles.hTitle, { color: colors.text }]}>AI Danışman</Text>
          <Text style={[styles.hSub, { color: colors.textSecondary }]}>Altın & döviz asistanınız</Text>
        </View>
        {messages.length > 0 && (
          <Pressable testID="assistant-clear" onPress={clear} hitSlop={10} style={styles.hBtn}>
            <Ionicons name="trash-outline" size={20} color={colors.textSecondary} />
          </Pressable>
        )}
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={0}
      >
        {initing ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.gold} />
          </View>
        ) : messages.length === 0 ? (
          <ScrollView contentContainerStyle={styles.emptyWrap} keyboardShouldPersistTaps="handled">
            <View style={[styles.heroIcon, { backgroundColor: colors.goldSoft }]}>
              <Ionicons name="sparkles" size={30} color={colors.gold} />
            </View>
            <Text style={[styles.heroTitle, { color: colors.text }]}>Merhaba! 👋</Text>
            <Text style={[styles.heroTxt, { color: colors.textSecondary }]}>
              Güncel altın ve döviz fiyatlarına göre size yardımcı olabilirim. Bir şey sorun ya da hızlı başlayın:
            </Text>
            <View style={{ gap: 10, marginTop: 20, width: "100%" }}>
              {QUICK.map((q) => (
                <Pressable
                  key={q.label}
                  testID={`ai-quick-${q.label}`}
                  onPress={() => (q.commentary ? sendCommentary() : send(q.label))}
                  style={[styles.quick, { backgroundColor: colors.card, borderColor: colors.border }]}
                >
                  <Ionicons name={q.commentary ? "newspaper-outline" : "chatbubble-ellipses-outline"} size={18} color={colors.gold} />
                  <Text style={[styles.quickTxt, { color: colors.text }]}>{q.label}</Text>
                  <Ionicons name="arrow-forward" size={16} color={colors.textTertiary} />
                </Pressable>
              ))}
            </View>
          </ScrollView>
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(_, i) => String(i)}
            renderItem={renderMsg}
            contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 16 }}
            onContentSizeChange={scrollDown}
            keyboardShouldPersistTaps="handled"
            ListFooterComponent={
              sending ? (
                <View style={[styles.bubble, { alignSelf: "flex-start", backgroundColor: colors.card, borderColor: colors.border, borderWidth: StyleSheet.hairlineWidth, flexDirection: "row", gap: 8, alignItems: "center" }]}>
                  <ActivityIndicator size="small" color={colors.gold} />
                  <Text style={{ color: colors.textSecondary, fontSize: 13.5 }}>yazıyor...</Text>
                </View>
              ) : null
            }
          />
        )}

        {/* Input bar */}
        <View style={[styles.inputBar, { paddingBottom: insets.bottom + 10, borderTopColor: colors.border, backgroundColor: colors.bg }]}>
          <Pressable
            testID="ai-mic"
            onPress={toggleRecord}
            disabled={transcribing || sending}
            style={[styles.micBtn, { backgroundColor: recording ? colors.down : colors.card2, borderColor: recording ? colors.down : colors.border }]}
          >
            {transcribing ? (
              <ActivityIndicator size="small" color={colors.gold} />
            ) : (
              <Ionicons name={recording ? "stop" : "mic"} size={20} color={recording ? "#fff" : colors.text} />
            )}
          </Pressable>
          <TextInput
            testID="ai-input"
            value={input}
            onChangeText={setInput}
            placeholder={recording ? "Dinliyorum..." : transcribing ? "Metne çevriliyor..." : "Bir soru yazın..."}
            placeholderTextColor={colors.textTertiary}
            editable={!recording && !transcribing}
            style={[styles.input, { backgroundColor: colors.card2, borderColor: colors.border, color: colors.text }]}
            multiline
            onSubmitEditing={() => send(input)}
            returnKeyType="send"
          />
          <Pressable
            testID="ai-send"
            onPress={() => send(input)}
            disabled={!input.trim() || sending}
            style={[styles.sendBtn, { backgroundColor: input.trim() && !sending ? colors.gold : colors.border }]}
          >
            <Ionicons name="arrow-up" size={20} color={input.trim() && !sending ? colors.onGold : colors.textTertiary} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  hBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  hTitle: { fontSize: 18, fontWeight: "800", letterSpacing: -0.3 },
  hSub: { fontSize: 12, marginTop: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  emptyWrap: { flexGrow: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  heroIcon: { width: 64, height: 64, borderRadius: 20, alignItems: "center", justifyContent: "center", marginBottom: 16 },
  heroTitle: { fontSize: 22, fontWeight: "800" },
  heroTxt: { fontSize: 14, textAlign: "center", lineHeight: 21, marginTop: 8, paddingHorizontal: 8 },
  quick: { flexDirection: "row", alignItems: "center", gap: 10, padding: 14, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth },
  quickTxt: { flex: 1, fontSize: 14.5, fontWeight: "600" },
  bubble: { maxWidth: "85%", paddingHorizontal: 14, paddingVertical: 10, borderRadius: 18 },
  speakBtn: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 8, paddingTop: 7, borderTopWidth: StyleSheet.hairlineWidth },
  speakTxt: { fontSize: 12, fontWeight: "700" },
  inputBar: { flexDirection: "row", alignItems: "flex-end", gap: 8, paddingHorizontal: 12, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
  micBtn: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", borderWidth: StyleSheet.hairlineWidth },
  input: { flex: 1, maxHeight: 120, minHeight: 44, fontSize: 15, paddingHorizontal: 14, paddingTop: 11, paddingBottom: 11, borderRadius: 22, borderWidth: StyleSheet.hairlineWidth },
  sendBtn: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
});
