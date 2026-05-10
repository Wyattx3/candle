import React from 'react';
import { View, Text } from 'react-native';

interface ChatBubbleProps {
  message: string;
}

export function UserBubble({ message }: ChatBubbleProps) {
  return (
    <View className="flex-row justify-end mb-8 px-6 w-full">
      <View className="bg-[#F3F4F6] rounded-[18px] px-5 py-4 max-w-[85%] border border-[#E5E7EB]/50">
        <Text className="text-[#1A1A1A] text-[16px] leading-[24px] font-medium tracking-tight">
          {message}
        </Text>
      </View>
    </View>
  );
}

export function AgentBubble({ message }: ChatBubbleProps) {
  return (
    <View className="flex-row justify-start mb-8 px-6 w-full">
      {/* 
        Manus Style: 
        No avatar. Just clean, highly legible text flush left. 
        Large line height, dark charcoal color for maximum readability.
      */}
      <View className="flex-1 max-w-[95%]">
        <Text className="text-[#1A1A1A] text-[16px] leading-[28px] tracking-tight">
          {message}
        </Text>
      </View>
    </View>
  );
}
