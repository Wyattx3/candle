/**
 * ToolRow — one tool activity line in the agent stream: a colored tool icon,
 * the action name + target, and a trailing status icon (spinning Loader while
 * running, success check when done).
 */
import { CircleCheck, Code, Globe, Loader, Search, Terminal, type LucideIcon } from 'lucide-react-native';
import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
    cancelAnimation,
    Easing,
    useAnimatedStyle,
    useSharedValue,
    withRepeat,
    withTiming,
} from 'react-native-reanimated';

import { Candle, CandleFontFamilies } from '@/constants/theme';
import type { ToolNode } from '@/hooks/chat-types';

const PURPLE = '#9B5DE5';

/** Pick the leading icon + tint for a given action name. */
function leadingIcon(actionName: string): { Icon: LucideIcon; color: string } {
  switch (actionName) {
    case 'Search':
    case 'Browse':
    case 'Browser':
      return { Icon: Search, color: Candle.flame };
    case 'Python':
      return { Icon: Code, color: PURPLE };
    case 'Terminal':
      return { Icon: Terminal, color: PURPLE };
    default:
      return { Icon: Globe, color: Candle.flame };
  }
}

function Spinner() {
  const rotation = useSharedValue(0);

  useEffect(() => {
    rotation.value = withRepeat(
      withTiming(360, { duration: 900, easing: Easing.linear }),
      -1,
      false,
    );
    return () => cancelAnimation(rotation);
  }, [rotation]);

  const style = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  return (
    <Animated.View style={style}>
      <Loader size={16} color={Candle.flame} />
    </Animated.View>
  );
}

interface ToolRowProps {
  node: ToolNode;
}

export function ToolRow({ node }: ToolRowProps) {
  const { Icon, color } = leadingIcon(node.actionName);
  return (
    <View style={styles.row}>
      <View style={styles.iconWell}>
        <Icon size={15} color={color} />
      </View>
      <View style={styles.texts}>
        <Text style={styles.action}>{node.actionName}</Text>
        {node.targetName ? <Text style={styles.target}>{node.targetName}</Text> : null}
      </View>
      {node.status === 'running' ? (
        <Spinner />
      ) : (
        <CircleCheck size={16} color={Candle.success} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
  },
  iconWell: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  texts: {
    flex: 1,
    gap: 6,
  },
  action: {
    fontFamily: CandleFontFamilies.interSemiBold,
    fontSize: 13,
    fontWeight: '600',
    color: Candle.textPrimary,
  },
  target: {
    fontFamily: CandleFontFamilies.inter,
    fontSize: 12,
    color: Candle.textTertiary,
  },
});
