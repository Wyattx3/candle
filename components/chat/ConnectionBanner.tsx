/**
 * ConnectionBanner — a small pill shown only when the WebSocket is
 * reconnecting or disconnected. Tapping it forces a reconnect.
 */
import { RefreshCw } from 'lucide-react-native';
import { Pressable, StyleSheet, Text } from 'react-native';

import { Candle, CandleFontFamilies } from '@/constants/theme';
import type { WsConnectionState } from '@/hooks/useStableWebSocket';

interface ConnectionBannerProps {
  state: WsConnectionState;
  onReconnect: () => void;
}

export function ConnectionBanner({ state, onReconnect }: ConnectionBannerProps) {
  if (state !== 'reconnecting' && state !== 'disconnected') return null;

  const label = state === 'reconnecting' ? 'Reconnecting…' : 'Offline — tap to retry';

  return (
    <Pressable
      style={styles.pill}
      onPress={onReconnect}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <RefreshCw size={13} color={Candle.textOnInk} />
      <Text style={styles.text}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    alignSelf: 'center',
    borderRadius: 16,
    paddingVertical: 7,
    paddingHorizontal: 14,
    backgroundColor: Candle.ink,
  },
  text: {
    fontFamily: CandleFontFamilies.interMedium,
    fontSize: 12.5,
    fontWeight: '500',
    color: Candle.textOnInk,
  },
});
