import React, { useEffect, useRef, useState } from "react";
import { View, StyleSheet, TextInput as RNTextInput } from "react-native";
import { Card, Text, useTheme, ActivityIndicator } from "react-native-paper";
import AppButton from "./ui/AppButton";
import { answerReportQuestion, REPORT_CHAT_PROMPTS } from "../utils/reportAdvisor";

export default function ReportChat({ summary, loadItems, rangeKey = "" }) {
  const theme = useTheme();
  const itemsRef = useRef(null);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    itemsRef.current = null;
  }, [rangeKey]);
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      text: "Ask about the numbers on this page. I only use the usage, prices, and on-hand quantities already in the report.",
    },
  ]);

  const ask = async (text) => {
    const question = String(text || "").trim();
    if (!question || busy) return;
    setDraft("");
    setMessages((current) => [...current, { role: "user", text: question }]);
    setBusy(true);
    try {
      if (!itemsRef.current && loadItems) itemsRef.current = await loadItems();
      const items = itemsRef.current || [];
      const answer = answerReportQuestion(question, { summary, items });
      setMessages((current) => [...current, { role: "assistant", text: answer }]);
    } catch (error) {
      setMessages((current) => [
        ...current,
        { role: "assistant", text: error?.message || "I couldn't read the report numbers." },
      ]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card
      mode="outlined"
      style={[styles.card, { borderColor: theme.colors.outlineVariant, backgroundColor: theme.colors.surface }]}
    >
      <Card.Content>
        <Text style={[styles.title, { color: theme.colors.onSurface }]}>Ask about these reports</Text>
        <View style={styles.prompts}>
          {REPORT_CHAT_PROMPTS.map((prompt) => (
            <AppButton key={prompt} compact mode="outlined" onPress={() => ask(prompt)}>
              {prompt}
            </AppButton>
          ))}
        </View>
        {messages.map((message, index) => (
          <Text
            key={`${message.role}-${index}`}
            style={{
              color: message.role === "user" ? theme.colors.primary : theme.colors.onSurface,
              marginTop: 10,
              lineHeight: 20,
            }}
          >
            {message.role === "user" ? `You: ${message.text}` : message.text}
          </Text>
        ))}
        {busy ? <ActivityIndicator style={{ marginTop: 12 }} /> : null}
        <View style={styles.row}>
          <RNTextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Ask about cost, paint vs stain, or stock"
            placeholderTextColor={theme.colors.onSurfaceVariant}
            onSubmitEditing={() => ask(draft)}
            style={[
              styles.input,
              {
                color: theme.colors.onSurface,
                borderColor: theme.colors.outlineVariant,
                backgroundColor: theme.colors.background,
              },
            ]}
          />
          <AppButton mode="contained" onPress={() => ask(draft)} disabled={busy}>
            Ask
          </AppButton>
        </View>
      </Card.Content>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: 16 },
  title: { fontSize: 18, fontWeight: "800" },
  prompts: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
  row: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12 },
  input: {
    flex: 1,
    minHeight: 44,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
});
