import React, { useCallback, useState } from 'react';
import { Keyboard, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Line, Path, Polyline } from 'react-native-svg';
import { LiquidGlass } from './LiquidGlass';

export interface InputAreaProps {
  onSubmit?: (text: string) => void;
  onVoiceInput?: () => void;
  onAttachFile?: () => void;
  initialWebSearchState?: boolean;
}

const SvgPaperclip = ({ size = 18, color = '#4F5661' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

const SvgGlobe = ({ size = 16, color = '#4F5661' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Circle cx="12" cy="12" r="10" stroke={color} strokeWidth={2} />
    <Line x1="2" y1="12" x2="22" y2="12" stroke={color} strokeWidth={2} />
    <Path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" stroke={color} strokeWidth={2} />
  </Svg>
);

const SvgArrowUp = ({ size = 18, color = '#F8FAFD' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Line x1="12" y1="19" x2="12" y2="5" stroke={color} strokeWidth={2.5} strokeLinecap="round" />
    <Polyline points="5 12 12 5 19 12" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

const SvgMic = ({ size = 18, color = '#4F5661' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M12 2a3 3 0 00-3 3v7a3 3 0 006 0V5a3 3 0 00-3-3z" stroke={color} strokeWidth={2} />
    <Path d="M19 10v2a7 7 0 01-14 0v-2" stroke={color} strokeWidth={2} strokeLinecap="round" />
    <Line x1="12" y1="19" x2="12" y2="22" stroke={color} strokeWidth={2} strokeLinecap="round" />
  </Svg>
);

export const InputArea: React.FC<InputAreaProps> = ({
  initialWebSearchState = true,
  onSubmit,
  onVoiceInput,
  onAttachFile,
}) => {
  const insets = useSafeAreaInsets();
  const [inputText, setInputText] = useState('');
  const [webSearchEnabled, setWebSearchEnabled] = useState(initialWebSearchState);

  const handleSubmit = useCallback(() => {
    if (inputText.trim().length === 0) return;
    onSubmit?.(inputText);
    setInputText('');
    Keyboard.dismiss();
  }, [inputText, onSubmit]);

  return (
    <View style={[styles.wrapper, { paddingBottom: Math.max(insets.bottom, 20) }]}>
      <LiquidGlass
        variant="thick"
        borderRadius={26}
        intensity={76}
        style={styles.composer}
        contentStyle={styles.composerContent}
      >
        <TextInput
          style={styles.textInput}
          placeholder="Ask anything..."
          placeholderTextColor="#747B86"
          multiline
          value={inputText}
          onChangeText={setInputText}
          textAlignVertical="top"
        />
        <View style={styles.toolbar}>
          <View style={styles.toolbarLeft}>
            <TouchableOpacity onPress={onAttachFile} activeOpacity={0.65} style={styles.toolBtn}>
              <SvgPaperclip />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setWebSearchEnabled(!webSearchEnabled)}
              activeOpacity={0.68}
              style={[styles.webBtn, webSearchEnabled && styles.webBtnActive]}
            >
              <SvgGlobe color={webSearchEnabled ? '#006EDB' : '#4F5661'} />
              {webSearchEnabled ? <Text style={styles.webLabel}>Web</Text> : null}
            </TouchableOpacity>
          </View>
          <View style={styles.toolbarRight}>
            {inputText.length === 0 ? (
              <TouchableOpacity onPress={onVoiceInput} activeOpacity={0.65} style={styles.toolBtn}>
                <SvgMic />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity onPress={handleSubmit} activeOpacity={0.72} style={styles.sendBtn}>
                <SvgArrowUp />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </LiquidGlass>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    paddingTop: 8,
    paddingHorizontal: 16,
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
  },
  composer: {
    minHeight: 112,
  },
  composerContent: {
    minHeight: 112,
  },
  textInput: {
    fontSize: 16,
    color: '#1C1C1E',
    paddingHorizontal: 20,
    paddingTop: 17,
    paddingBottom: 8,
    maxHeight: 142,
    minHeight: 48,
    letterSpacing: 0,
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingBottom: 12,
    paddingTop: 4,
  },
  toolbarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  toolbarRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  toolBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    backgroundColor: 'rgba(242,243,247,0.7)',
  },
  webBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 34,
    paddingHorizontal: 10,
    borderRadius: 17,
  },
  webBtnActive: {
    backgroundColor: 'rgba(0,119,230,0.08)',
  },
  webLabel: {
    color: '#006EDB',
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 5,
    letterSpacing: 0,
  },
  sendBtn: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 17,
    backgroundColor: '#0077E6',
    shadowColor: '#0077E6',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.28,
    shadowRadius: 10,
  },
});
