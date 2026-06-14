/**
 * Composer — the bottom dock input pill present on both screens. Shows a Mic
 * button when empty and a flame Send button when the user has typed. The "…"
 * lead button toggles the Pencil `Attach Menu · icon strip`: a row of attach
 * tiles (Photo / File / Skill / MCP / Deep research) that appears inline
 * directly above the input pill, and the lead button morphs into an accent-soft
 * close (✕) affordance while open. The surrounding dock padding differs
 * slightly between Home and Chat (see the `variant` prop).
 */
import {
    ArrowUp,
    Bolt,
    FolderOpen,
    Image as ImageIcon,
    Mic,
    MoreHorizontal,
    Puzzle,
    Search,
    X,
    type LucideIcon,
} from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Candle, CandleFontFamilies } from '@/constants/theme';

interface ComposerProps {
  onSend: (text: string) => void;
  onVoice?: () => void;
  variant?: 'home' | 'chat';
}

interface AttachOption {
  id: string;
  icon: LucideIcon;
  iconColor: string;
  label: string;
}

const ATTACH_OPTIONS: AttachOption[] = [
  { id: 'photo', icon: ImageIcon, iconColor: '#0A84FF', label: 'Photo' },
  { id: 'file', icon: FolderOpen, iconColor: '#3E9D5B', label: 'File' },
  { id: 'skill', icon: Bolt, iconColor: '#FF9500', label: 'Skill' },
  { id: 'mcp', icon: Puzzle, iconColor: '#9B5DE5', label: 'MCP' },
  { id: 'research', icon: Search, iconColor: '#E8930F', label: 'Deep research' },
];

export function Composer({ onSend, onVoice, variant = 'home' }: ComposerProps) {
  const [value, setValue] = useState('');
  const [attachOpen, setAttachOpen] = useState(false);
  const hasText = value.trim().length > 0;

  const submit = () => {
    const text = value.trim();
    if (!text) return;
    onSend(text);
    setValue('');
  };

  return (
    <View style={[styles.dock, variant === 'home' ? styles.dockHome : styles.dockChat]}>
      {/* Inline attach icon strip — appears directly above the input pill. */}
      {attachOpen ? (
        <View style={styles.strip}>
          {ATTACH_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            return (
              <Pressable
                key={opt.id}
                style={styles.tile}
                onPress={() => setAttachOpen(false)}
                accessibilityRole="button"
                accessibilityLabel={opt.label}
              >
                <Icon size={24} color={opt.iconColor} />
                <Text style={styles.tileLabel} numberOfLines={1}>
                  {opt.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      <View style={styles.pill}>
        <Pressable
          style={[styles.leadBtn, attachOpen ? styles.leadBtnOpen : null]}
          hitSlop={6}
          onPress={() => setAttachOpen((v) => !v)}
          accessibilityRole="button"
          accessibilityLabel={attachOpen ? 'Close attach menu' : 'Attach'}
        >
          {attachOpen ? (
            <X size={20} color={Candle.flame} />
          ) : (
            <MoreHorizontal size={20} color={Candle.textSecondary} />
          )}
        </Pressable>

        <TextInput
          style={styles.input}
          value={value}
          onChangeText={setValue}
          placeholder="Ask anything…"
          placeholderTextColor={Candle.textTertiary}
          multiline
          onSubmitEditing={submit}
          returnKeyType="send"
          blurOnSubmit
        />

        {hasText ? (
          <Pressable
            style={styles.sendBtn}
            hitSlop={6}
            onPress={submit}
            accessibilityRole="button"
            accessibilityLabel="Send"
          >
            <ArrowUp size={20} color={Candle.textOnInk} />
          </Pressable>
        ) : (
          <Pressable
            style={styles.micBtn}
            hitSlop={6}
            onPress={onVoice}
            accessibilityRole="button"
            accessibilityLabel="Voice input"
          >
            <Mic size={20} color={Candle.textSecondary} />
          </Pressable>
        )}
      </View>
    </View>
  );
}

Composer.displayName = 'Composer';

const styles = StyleSheet.create({
  dock: {
    paddingHorizontal: 20,
    gap: 10,
  },
  dockHome: {
    paddingTop: 14,
    paddingBottom: 40,
  },
  dockChat: {
    paddingTop: 12,
    paddingBottom: 40,
  },
  strip: {
    flexDirection: 'row',
    gap: 8,
  },
  tile: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 14,
    backgroundColor: Candle.bgCanvas,
    borderWidth: 1,
    borderColor: Candle.hairline,
    paddingVertical: 14,
    paddingHorizontal: 4,
  },
  tileLabel: {
    fontFamily: CandleFontFamilies.interSemiBold,
    fontSize: 10.5,
    fontWeight: '600',
    color: Candle.textSecondary,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 56,
    borderRadius: 28,
    backgroundColor: Candle.glassThick,
    borderWidth: 1,
    borderColor: Candle.glassBorder,
    paddingHorizontal: 8,
    shadowColor: '#C8A06E',
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  leadBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Candle.surfaceSunken,
    alignItems: 'center',
    justifyContent: 'center',
  },
  leadBtnOpen: {
    backgroundColor: Candle.accentSoft,
  },
  input: {
    flex: 1,
    fontFamily: CandleFontFamilies.inter,
    fontSize: 15,
    color: Candle.textPrimary,
    paddingVertical: 8,
    maxHeight: 120,
  },
  micBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Candle.surfaceSunken,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Candle.flame,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
