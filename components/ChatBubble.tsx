import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LiquidGlass } from './LiquidGlass';

interface ChatBubbleProps {
  message: string;
}

export function UserBubble({ message }: ChatBubbleProps) {
  return (
    <View style={styles.userRow}>
      <LiquidGlass
        variant="regular"
        borderRadius={21}
        intensity={66}
        style={styles.userGlass}
        contentStyle={styles.userContent}
      >
        <Text style={styles.userText}>{message}</Text>
      </LiquidGlass>
    </View>
  );
}

export function AgentBubble({ message }: ChatBubbleProps) {
  return (
    <View style={styles.agentRow}>
      <View style={styles.agentContent}>
        <Text style={styles.agentText}>{message}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  userRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: 8,
    paddingHorizontal: 20,
    width: '100%',
  },
  userGlass: {
    maxWidth: '85%',
  },
  userContent: {
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  userText: {
    color: '#1C1C1E',
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '500',
    letterSpacing: 0,
  },
  agentRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    marginBottom: 8,
    paddingHorizontal: 20,
    width: '100%',
  },
  agentContent: {
    flex: 1,
    maxWidth: '95%',
  },
  agentText: {
    color: '#1C1C1E',
    fontSize: 16,
    lineHeight: 26,
    letterSpacing: 0,
  },
});
