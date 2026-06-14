/**
 * Session Drawer — the slide-in navigation panel: a profile header, a flame
 * "New chat" button, a WORKSPACE function list (Skills, MCP servers, Files,
 * Tasks), and a RECENT chat history list. Presented as a transparent modal so
 * the dimmed "peek" of the underlying screen shows on the right. Pixel-faithful
 * to the Pencil `Screen · Session Drawer` node.
 */
import { useRouter } from 'expo-router';
import {
    Bolt,
    Code,
    Folder,
    Plus,
    Clock as ScheduleIcon,
    Search,
    Server,
    Settings,
    Table,
    Languages as TranslateIcon,
    TrendingUp,
    type LucideIcon,
} from 'lucide-react-native';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FlameMark } from '@/components/chat/FlameMark';
import { Candle, CandleFontFamilies } from '@/constants/theme';

interface FnRow {
  icon: LucideIcon;
  label: string;
  route?: string;
  badge?: number;
}

const FUNCTIONS: FnRow[] = [
  { icon: Bolt, label: 'Skills', route: '/skills', badge: 3 },
  { icon: Server, label: 'MCP servers', route: '/mcp-servers', badge: 2 },
  { icon: Folder, label: 'Files', route: '/files' },
  { icon: ScheduleIcon, label: 'Tasks', route: '/tasks' },
];

interface ChatRow {
  icon: LucideIcon;
  title: string;
  time: string;
}

const RECENT: ChatRow[] = [
  { icon: Search, title: 'AI startup funding in SEA', time: '2m' },
  { icon: Code, title: 'Refactor the auth module', time: '1h' },
  { icon: TrendingUp, title: 'Quarterly revenue dashboard', time: 'Yesterday' },
  { icon: TranslateIcon, title: 'Translate docs to Burmese', time: 'Mon' },
  { icon: Table, title: 'Scrape competitor pricing', time: 'Sun' },
];

export default function SessionDrawerScreen() {
  const router = useRouter();

  const go = (route?: string) => {
    router.back();
    if (route) {
      // Defer navigation until the drawer dismiss begins.
      requestAnimationFrame(() => router.push(route as never));
    }
  };

  return (
    <View style={styles.root}>
      {/* Drawer panel */}
      <View style={styles.drawer}>
        <SafeAreaView edges={['top', 'bottom']} style={styles.safe}>
          {/* Profile */}
          <View style={styles.profile}>
            <FlameMark size={52} radius={26} shadow />
            <View style={styles.profileTexts}>
              <Text style={styles.profileName}>Aung Min</Text>
              <Text style={styles.profilePlan}>Candle Pro</Text>
            </View>
            <Pressable
              style={styles.cog}
              hitSlop={8}
              onPress={() => go('/settings')}
              accessibilityRole="button"
              accessibilityLabel="Settings"
            >
              <Settings size={20} color={Candle.textSecondary} />
            </Pressable>
          </View>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.body}
            showsVerticalScrollIndicator={false}
          >
            {/* New chat */}
            <Pressable
              style={styles.newChat}
              onPress={() => go('/')}
              accessibilityRole="button"
              accessibilityLabel="New chat"
            >
              <Plus size={22} color={Candle.textOnAccent} />
              <Text style={styles.newChatLabel}>New chat</Text>
            </Pressable>

            {/* Workspace */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>WORKSPACE</Text>
              {FUNCTIONS.map((fn) => {
                const Icon = fn.icon;
                return (
                  <Pressable
                    key={fn.label}
                    style={styles.fnRow}
                    onPress={() => go(fn.route)}
                    accessibilityRole="button"
                    accessibilityLabel={fn.label}
                  >
                    <Icon size={22} color={Candle.textSecondary} />
                    <Text style={styles.fnLabel}>{fn.label}</Text>
                    {fn.badge ? (
                      <View style={styles.badge}>
                        <Text style={styles.badgeLabel}>{fn.badge}</Text>
                      </View>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>

            {/* Recent */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>RECENT</Text>
              {RECENT.map((chat, index) => {
                const Icon = chat.icon;
                const tint = index === 0 ? Candle.flameDeep : Candle.textTertiary;
                return (
                  <Pressable
                    key={chat.title}
                    style={styles.chatRow}
                    onPress={() => go('/')}
                    accessibilityRole="button"
                    accessibilityLabel={chat.title}
                  >
                    <Icon size={22} color={tint} />
                    <Text style={styles.chatTitle} numberOfLines={1}>
                      {chat.title}
                    </Text>
                    <Text style={styles.chatTime}>{chat.time}</Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
        </SafeAreaView>
      </View>

      {/* Dimmed peek — tap to dismiss */}
      <Pressable
        style={styles.peek}
        onPress={() => router.back()}
        accessibilityRole="button"
        accessibilityLabel="Close drawer"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#2A201A66',
  },
  drawer: {
    width: 388,
    backgroundColor: Candle.bgCanvas,
    shadowColor: '#2A201A',
    shadowOpacity: 0.25,
    shadowRadius: 40,
    shadowOffset: { width: 8, height: 0 },
    elevation: 16,
  },
  safe: {
    flex: 1,
  },
  profile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    paddingTop: 8,
    paddingBottom: 14,
    paddingHorizontal: 20,
  },
  profileTexts: {
    flex: 1,
    gap: 3,
  },
  profileName: {
    fontFamily: CandleFontFamilies.interBold,
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.4,
    color: Candle.textPrimary,
  },
  profilePlan: {
    fontFamily: CandleFontFamilies.interSemiBold,
    fontSize: 13.5,
    fontWeight: '600',
    color: Candle.flameDeep,
  },
  cog: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    flex: 1,
  },
  body: {
    paddingHorizontal: 18,
    paddingBottom: 24,
    gap: 26,
  },
  newChat: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    height: 52,
    borderRadius: 26,
    backgroundColor: Candle.flame,
    shadowColor: Candle.flameDeep,
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  newChatLabel: {
    fontFamily: CandleFontFamilies.interBold,
    fontSize: 16,
    fontWeight: '700',
    color: Candle.textOnAccent,
  },
  section: {
    gap: 2,
  },
  sectionLabel: {
    fontFamily: CandleFontFamilies.interBold,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    color: Candle.textTertiary,
    paddingHorizontal: 4,
    paddingBottom: 8,
  },
  fnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 15,
    paddingVertical: 13,
    paddingHorizontal: 4,
  },
  fnLabel: {
    flex: 1,
    fontFamily: CandleFontFamilies.interSemiBold,
    fontSize: 16,
    fontWeight: '600',
    color: Candle.textPrimary,
  },
  badge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Candle.flame,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  badgeLabel: {
    fontFamily: CandleFontFamilies.interBold,
    fontSize: 12,
    fontWeight: '700',
    color: Candle.textOnAccent,
  },
  chatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 15,
    paddingVertical: 13,
    paddingHorizontal: 4,
  },
  chatTitle: {
    flex: 1,
    fontFamily: CandleFontFamilies.interMedium,
    fontSize: 15,
    fontWeight: '500',
    color: Candle.textPrimary,
  },
  chatTime: {
    fontFamily: CandleFontFamilies.inter,
    fontSize: 12.5,
    fontWeight: '500',
    color: Candle.textTertiary,
  },
  peek: {
    flex: 1,
  },
});
