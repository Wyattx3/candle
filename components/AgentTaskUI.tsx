import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleProp, ViewStyle, ScrollView } from 'react-native';
import Svg, { Path, Circle, Polyline, Line, Rect } from 'react-native-svg';

/**
 * ============================================================================
 * INTERFACES & TYPES
 * ============================================================================
 */

export interface KimiTaskStep {
  id: string;
  type: 'read' | 'search' | 'list' | 'write' | 'execute';
  actionName: string;
  targetName: string;
}

export interface KimiTaskBlock {
  id: string;
  thoughtTitle: string;
  agentMessage: string;
  steps: KimiTaskStep[];
}

export interface AgentTaskUIProps {
  progressText?: string;
  blocks: KimiTaskBlock[];
  containerStyle?: StyleProp<ViewStyle>;
}

/**
 * ============================================================================
 * SVG ICONS
 * ============================================================================
 */

const SvgChevronRight: React.FC<{ size?: number; color?: string; rotation?: number }> = ({ size = 16, color = "#9CA3AF", rotation = 0 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ transform: [{ rotate: `${rotation}deg` }] }}>
    <Path d="M9 18L15 12L9 6" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

const SvgGreenDot: React.FC<{ size?: number }> = ({ size = 16 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Circle cx="12" cy="12" r="8" stroke="#E5E7EB" strokeWidth={2} fill="#FFFFFF" />
    <Circle cx="12" cy="12" r="4" fill="#10B981" />
  </Svg>
);

const SvgFolder: React.FC<{ size?: number; color?: string }> = ({ size = 16, color = "#374151" }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M22 19C22 20.1046 21.1046 21 20 21H4C2.89543 21 2 20.1046 2 19V5C2 3.89543 2.89543 3 4 3H9L11 5H20C21.1046 5 22 5.89543 22 7V19Z" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

const SvgSquareFrame: React.FC<{ size?: number; color?: string }> = ({ size = 16, color = "#374151" }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Rect x="3" y="3" width="18" height="18" rx="2" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    <Path d="M3 9H21" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    <Path d="M9 21V9" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

const SvgLightBulb: React.FC<{ size?: number; color?: string }> = ({ size = 16, color = "#6B7280" }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M9 18H15M10 21H14M12 3C7.58172 3 4 6.58172 4 11C4 13.5264 5.17185 15.7766 6.99446 17.2026C7.63273 17.702 8 18.4735 8 19.2891V19C8 19.5523 8.44772 20 9 20H15C15.5523 20 16 19.5523 16 19V19.2891C16 18.4735 16.3673 17.702 17.0055 17.2026C18.8281 15.7766 20 13.5264 20 11C20 6.58172 16.4183 3 12 3Z" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

const SvgDocument: React.FC<{ size?: number; color?: string }> = ({ size = 16, color = "#6B7280" }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M14 2H6C4.89543 2 4 2.89543 4 4V20C4 21.1046 4.89543 22 6 22H18C19.1046 22 20 21.1046 20 20V8L14 2Z" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    <Path d="M14 2V8H20" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    <Line x1="16" y1="13" x2="8" y2="13" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    <Line x1="16" y1="17" x2="8" y2="17" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    <Line x1="10" y1="9" x2="8" y2="9" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

const SvgSearchIcon: React.FC<{ size?: number; color?: string }> = ({ size = 16, color = "#6B7280" }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Circle cx="11" cy="11" r="8" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    <Line x1="21" y1="21" x2="16.65" y2="16.65" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

const SvgListIcon: React.FC<{ size?: number; color?: string }> = ({ size = 16, color = "#6B7280" }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Line x1="8" y1="6" x2="21" y2="6" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    <Line x1="8" y1="12" x2="21" y2="12" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    <Line x1="8" y1="18" x2="21" y2="18" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    <Line x1="3" y1="6" x2="3.01" y2="6" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    <Line x1="3" y1="12" x2="3.01" y2="12" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    <Line x1="3" y1="18" x2="3.01" y2="18" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

/**
 * ============================================================================
 * HELPER FUNCTIONS
 * ============================================================================
 */

const getStepIcon = (type: string) => {
  switch (type) {
    case 'read': return SvgDocument;
    case 'write': return SvgDocument;
    case 'search': return SvgSearchIcon;
    case 'list': return SvgListIcon;
    default: return SvgDocument;
  }
};

/**
 * ============================================================================
 * SUB-COMPONENTS
 * ============================================================================
 */

const TaskProgressPill: React.FC<{ text: string }> = ({ text }) => (
  <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 24, borderWidth: 1, borderColor: '#E5E7EB', alignSelf: 'flex-start', marginBottom: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 1 }}>
    <SvgGreenDot size={16} />
    <Text style={{ color: '#374151', fontSize: 13, fontWeight: '500', marginLeft: 8, marginRight: 16 }}>{text}</Text>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <SvgFolder size={16} color="#4B5563" />
      <SvgSquareFrame size={16} color="#4B5563" />
    </View>
  </View>
);

const TaskListCard: React.FC<{ steps: KimiTaskStep[] }> = ({ steps }) => {
  if (!steps || steps.length === 0) return null;
  
  return (
    <View style={{ backgroundColor: '#FFFFFF', borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', overflow: 'hidden', marginVertical: 12 }}>
      {steps.map((step, index) => {
        const Icon = getStepIcon(step.type);
        const isLast = index === steps.length - 1;
        return (
          <View key={step.id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: isLast ? 0 : 1, borderBottomColor: '#F3F4F6' }}>
            <Icon size={16} color="#6B7280" />
            <Text style={{ color: '#4B5563', fontSize: 13, marginLeft: 12 }}>{step.actionName}</Text>
            <Text style={{ color: '#D1D5DB', fontSize: 13, marginHorizontal: 8 }}>|</Text>
            <Text style={{ color: '#9CA3AF', fontSize: 13, flex: 1 }} numberOfLines={1} ellipsizeMode="tail">{step.targetName}</Text>
            <SvgChevronRight size={16} color="#D1D5DB" />
          </View>
        );
      })}
    </View>
  );
};

const ThoughtBlockUI: React.FC<{ thoughtTitle: string }> = ({ thoughtTitle }) => (
  <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: '#F3F4F6', alignSelf: 'flex-start', marginBottom: 12 }}>
    <SvgLightBulb size={14} color="#6B7280" />
    <Text style={{ color: '#6B7280', fontSize: 13, fontWeight: '400', marginLeft: 8, marginRight: 8 }}>{thoughtTitle}</Text>
    <SvgChevronRight size={14} color="#9CA3AF" />
  </View>
);

/**
 * ============================================================================
 * MAIN COMPONENT EXPORT
 * ============================================================================
 */

export const AgentTaskUI: React.FC<AgentTaskUIProps> = ({ 
  progressText = "Task progress 4/4",
  blocks 
}) => {
  return (
    <View style={{ width: '100%', marginBottom: 24, paddingHorizontal: 16 }}>
      {/* 1. Progress Pill */}
      <TaskProgressPill text={progressText} />

      {/* 2. Map through Blocks of thoughts and tasks */}
      {blocks && blocks.map((block) => (
        <View key={block.id} style={{ marginBottom: 16 }}>
          {/* Thought Header (e.g. Read PDF...) */}
          {block.thoughtTitle && <ThoughtBlockUI thoughtTitle={block.thoughtTitle} />}
          
          {/* Agent Message Text (e.g. I'll research Myanmar...) */}
          {block.agentMessage && (
            <Text style={{ color: '#1A1A1A', fontSize: 15, lineHeight: 24, marginBottom: 8 }}>
              {block.agentMessage}
            </Text>
          )}

          {/* Task Steps Card */}
          <TaskListCard steps={block.steps} />
        </View>
      ))}
    </View>
  );
};
