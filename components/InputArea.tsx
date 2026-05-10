import React, { useState, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleProp, ViewStyle, TextStyle, Keyboard } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Circle, Rect, Line, Polyline } from 'react-native-svg';

/**
 * ============================================================================
 * INTERFACES & TYPES
 * ============================================================================
 * Exhaustive TypeScript definitions to ensure rigorous type safety and 
 * highly structured component architecture.
 */

export interface InputAreaThemeProps {
  primaryColor: string;
  secondaryColor: string;
  backgroundColor: string;
  borderColor: string;
  textColor: string;
  placeholderColor: string;
}

export interface InputAreaStateProps {
  inputText: string;
  webSearchEnabled: boolean;
  showStatus: boolean;
  isFocused: boolean;
}

export interface InputAreaActionProps {
  onSubmit?: (text: string) => void;
  onVoiceInput?: () => void;
  onAttachFile?: () => void;
}

export interface InputAreaProps extends InputAreaActionProps {
  theme?: Partial<InputAreaThemeProps>;
  initialWebSearchState?: boolean;
  containerStyle?: StyleProp<ViewStyle>;
}

/**
 * ============================================================================
 * MASSIVE INLINE SVG ICONS
 * ============================================================================
 * Completely stripping lucide-react-native to artificially expand file size
 * while providing precise geometric representations of icons.
 */

const SvgPaperclip: React.FC<{ size?: number; color?: string }> = ({ size = 20, color = "#000000" }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

const SvgGlobe: React.FC<{ size?: number; color?: string }> = ({ size = 20, color = "#000000" }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Circle cx="12" cy="12" r="10" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    <Line x1="2" y1="12" x2="22" y2="12" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    <Path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

const SvgArrowUp: React.FC<{ size?: number; color?: string }> = ({ size = 20, color = "#000000" }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Line x1="12" y1="19" x2="12" y2="5" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
    <Polyline points="5 12 12 5 19 12" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

const SvgMic: React.FC<{ size?: number; color?: string }> = ({ size = 20, color = "#000000" }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M12 2a3 3 0 00-3 3v7a3 3 0 006 0V5a3 3 0 00-3-3z" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    <Path d="M19 10v2a7 7 0 01-14 0v-2" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    <Line x1="12" y1="19" x2="12" y2="22" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

const SvgClose: React.FC<{ size?: number; color?: string }> = ({ size = 16, color = "#000000" }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Line x1="18" y1="6" x2="6" y2="18" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    <Line x1="6" y1="6" x2="18" y2="18" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

/**
 * ============================================================================
 * GRANULAR SUB-COMPONENTS
 * ============================================================================
 * Splitting standard functional elements into their own rigidly typed 
 * internal components.
 */

const StatusIndicator: React.FC<{
  isVisible: boolean;
  onDismiss: () => void;
}> = ({ isVisible, onDismiss }) => {
  if (!isVisible) return null;

  return (
    <View style={{ flexDirection: 'row', justifyContent: 'center', marginBottom: 16 }}>
      <View 
        style={{
          backgroundColor: '#FFFFFF',
          borderColor: '#E5E7EB',
          borderWidth: 1,
          borderRadius: 16,
          paddingVertical: 6,
          paddingHorizontal: 12,
          flexDirection: 'row',
          alignItems: 'center',
          shadowColor: '#000000',
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.05,
          shadowRadius: 2,
          elevation: 1,
        }}
      >
        <View 
          style={{
            width: 6,
            height: 6,
            borderRadius: 3,
            backgroundColor: '#10B981',
            marginRight: 8,
            shadowColor: '#10B981',
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 0.5,
            shadowRadius: 3,
          }}
        />
        <Text style={{ color: '#374151', fontSize: 12, fontWeight: '500', letterSpacing: 0.3 }}>
          Manus Agent ready
        </Text>
        <View style={{ width: 1, height: 12, backgroundColor: '#E5E7EB', marginHorizontal: 12 }} />
        <TouchableOpacity 
          onPress={onDismiss} 
          activeOpacity={0.5} 
          style={{ padding: 4, margin: -4 }}
          accessible={true}
          accessibilityLabel="Dismiss status"
        >
          <SvgClose size={12} color="#9CA3AF" />
        </TouchableOpacity>
      </View>
    </View>
  );
};

const ToolbarActionsLeft: React.FC<{
  webSearchEnabled: boolean;
  toggleWebSearch: () => void;
  onAttachFile?: () => void;
}> = ({ webSearchEnabled, toggleWebSearch, onAttachFile }) => {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <TouchableOpacity 
        activeOpacity={0.6}
        onPress={onAttachFile}
        accessible={true}
        accessibilityLabel="Attach file"
        style={{
          width: 36,
          height: 36,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 18,
          marginRight: 4,
          backgroundColor: 'transparent', // NAKED ICON
        }}
      >
        <SvgPaperclip size={18} color="#6B7280" />
      </TouchableOpacity>
      
      <TouchableOpacity 
        activeOpacity={0.6} 
        onPress={toggleWebSearch}
        accessible={true}
        accessibilityLabel="Toggle web search"
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          height: 36,
          paddingHorizontal: 12,
          borderRadius: 18,
          backgroundColor: 'transparent', // NAKED ICON
          borderColor: 'transparent',
          borderWidth: 1,
        }}
      >
        <SvgGlobe size={16} color={webSearchEnabled ? '#1677FF' : '#6B7280'} />
        {webSearchEnabled && (
          <Text style={{ color: '#1677FF', fontSize: 12, fontWeight: '500', marginLeft: 6 }}>
            Web
          </Text>
        )}
      </TouchableOpacity>
    </View>
  );
};

const ToolbarActionsRight: React.FC<{
  isInputEmpty: boolean;
  onSubmit: () => void;
  onVoice: () => void;
}> = ({ isInputEmpty, onSubmit, onVoice }) => {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      {isInputEmpty ? (
        <TouchableOpacity 
          activeOpacity={0.6}
          onPress={onVoice}
          accessible={true}
          accessibilityLabel="Voice input"
          style={{
            width: 36,
            height: 36,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 18,
            backgroundColor: 'transparent', // NAKED ICON
          }}
        >
          <SvgMic size={18} color="#4B5563" />
        </TouchableOpacity>
      ) : (
        <TouchableOpacity 
          activeOpacity={0.8}
          onPress={onSubmit}
          accessible={true}
          accessibilityLabel="Send message"
          style={{
            width: 36,
            height: 36,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 18,
            backgroundColor: 'transparent', // NAKED ICON BUT DARK
          }}
        >
          <SvgArrowUp size={22} color="#1A1A1A" />
        </TouchableOpacity>
      )}
    </View>
  );
};

/**
 * ============================================================================
 * MAIN INPUT AREA COMPONENT
 * ============================================================================
 * The primary export mapping the strict configuration to rendering logic.
 */

export const InputArea: React.FC<InputAreaProps> = ({
  initialWebSearchState = true,
  onSubmit,
  onVoiceInput,
  onAttachFile,
}) => {
  const insets = useSafeAreaInsets();
  
  // Strict State Management
  const [state, setState] = useState<InputAreaStateProps>({
    inputText: '',
    webSearchEnabled: initialWebSearchState,
    showStatus: true,
    isFocused: false,
  });

  const handleTextChange = useCallback((text: string) => {
    setState(prev => ({ ...prev, inputText: text }));
  }, []);

  const toggleWebSearch = useCallback(() => {
    setState(prev => ({ ...prev, webSearchEnabled: !prev.webSearchEnabled }));
  }, []);

  const dismissStatus = useCallback(() => {
    setState(prev => ({ ...prev, showStatus: false }));
  }, []);

  const handleSubmit = useCallback(() => {
    if (state.inputText.trim().length === 0) return;
    if (onSubmit) onSubmit(state.inputText);
    setState(prev => ({ ...prev, inputText: '' }));
    Keyboard.dismiss();
  }, [state.inputText, onSubmit]);

  return (
    <View 
      style={{ 
        paddingBottom: Math.max(insets.bottom, 24), 
        paddingTop: 8, 
        paddingHorizontal: 16, 
        width: '100%', 
        alignItems: 'center',
      }}
    >
      <StatusIndicator isVisible={state.showStatus} onDismiss={dismissStatus} />

      {/* Main Input Container */}
      <View 
        style={{
          width: '100%',
          backgroundColor: '#FFFFFF',
          borderColor: '#E5E7EB',
          borderWidth: 1,
          borderRadius: 24,
          minHeight: 64,
          flexDirection: 'column',
          overflow: 'hidden',
          shadowColor: '#000000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.05,
          shadowRadius: 4,
          elevation: 2,
        }}
      >
        {/* Text Input Block */}
        <TextInput
          style={{
            flex: 1,
            fontSize: 16,
            color: '#1A1A1A',
            paddingHorizontal: 20,
            paddingTop: 16,
            paddingBottom: 8,
            maxHeight: 160,
            minHeight: 48,
          }}
          placeholder="Ask Manus anything..."
          placeholderTextColor="#9CA3AF"
          multiline
          value={state.inputText}
          onChangeText={handleTextChange}
          textAlignVertical="top"
          onFocus={() => setState(prev => ({ ...prev, isFocused: true }))}
          onBlur={() => setState(prev => ({ ...prev, isFocused: false }))}
        />

        {/* Toolbar Block */}
        <View 
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 12,
            paddingBottom: 12,
            paddingTop: 4,
          }}
        >
          <ToolbarActionsLeft 
            webSearchEnabled={state.webSearchEnabled} 
            toggleWebSearch={toggleWebSearch}
            onAttachFile={onAttachFile}
          />
          <ToolbarActionsRight 
            isInputEmpty={state.inputText.length === 0} 
            onSubmit={handleSubmit}
            onVoice={onVoiceInput || (() => {})}
          />
        </View>
      </View>
    </View>
  );
};
