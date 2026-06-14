/**
 * Memory — what Candle remembers across sessions. Mirrors the Pencil
 * `Screen · Memory` node: a TitleBar (back, "Memory", entry count pill), a
 * SubWrap caption, a search field, and a Body of grouped memory-entry lists
 * (Preferences, Project context, Facts), each entry an icon + content + age.
 */
import { useRouter } from 'expo-router';
import {
    ArrowLeft,
    Clock,
    Folder,
    Moon,
    Search,
    Terminal,
    User,
    type LucideIcon,
} from 'lucide-react-native';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Candle, CandleFontFamilies } from '@/constants/theme';

interface MemoryEntry {
  id: string;
  icon: LucideIcon;
  iconColor: string;
  content: string;
  age: string;
}

interface MemoryGroup {
  label: string;
  entries: MemoryEntry[];
}

const GROUPS: MemoryGroup[] = [
  {
    label: 'PREFERENCES',
    entries: [
      {
        id: 'p1',
        icon: User,
        iconColor: Candle.flameDeep,
        content: 'Prefers concise answers with code examples first.',
        age: '2 days ago',
      },
      {
        id: 'p2',
        icon: Moon,
        iconColor: Candle.flameDeep,
        content: 'Uses dark mode and a warm color palette in projects.',
        age: '5 days ago',
      },
    ],
  },
  {
    label: 'PROJECT CONTEXT',
    entries: [
      {
        id: 'c1',
        icon: Folder,
        iconColor: '#9B5DE5',
        content: 'Working on Candle — an Expo + LangGraph agent app.',
        age: '1 week ago',
      },
      {
        id: 'c2',
        icon: Terminal,
        iconColor: '#9B5DE5',
        content: 'Backend runs on Cloudflare Workers AI, model kimi-k2.6.',
        age: '1 week ago',
      },
    ],
  },
  {
    label: 'FACTS',
    entries: [
      {
        id: 'f1',
        icon: Clock,
        iconColor: Candle.success,
        content: 'Timezone is GMT+6:30 (Yangon).',
        age: '2 weeks ago',
      },
    ],
  },
];

function Entry({ entry, showBorder }: { entry: MemoryEntry; showBorder: boolean }) {
  const Icon = entry.icon;
  return (
    <View style={[styles.entry, showBorder ? styles.entryBorder : null]}>
      <View style={styles.entryIcon}>
        <Icon size={18} color={entry.iconColor} />
      </View>
      <View style={styles.entryTexts}>
        <Text style={styles.entryContent}>{entry.content}</Text>
        <Text style={styles.entryAge}>{entry.age}</Text>
      </View>
    </View>
  );
}

export default function MemoryScreen() {
  const router = useRouter();

  return (
    <View style={styles.root}>
      <SafeAreaView edges={['top']} style={styles.safe}>
        {/* TitleBar */}
        <View style={styles.titleBar}>
          <View style={styles.titleLeft}>
            <Pressable
              style={styles.backBtn}
              hitSlop={8}
              onPress={() => router.back()}
              accessibilityRole="button"
              accessibilityLabel="Back"
            >
              <ArrowLeft size={21} color={Candle.textPrimary} />
            </Pressable>
            <Text style={styles.title}>Memory</Text>
          </View>
          <View style={styles.countPill}>
            <Text style={styles.countLabel}>142</Text>
          </View>
        </View>

        {/* SubWrap */}
        <View style={styles.subWrap}>
          <Text style={styles.sub}>What Candle remembers across your sessions</Text>
        </View>

        {/* Search */}
        <View style={styles.searchWrap}>
          <View style={styles.search}>
            <Search size={19} color={Candle.textTertiary} />
            <Text style={styles.searchPlaceholder}>Search memory</Text>
          </View>
        </View>

        {/* Body */}
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.body}
          showsVerticalScrollIndicator={false}
        >
          {GROUPS.map((group) => (
            <View key={group.label} style={styles.group}>
              <View style={styles.labelWrap}>
                <Text style={styles.groupLabel}>{group.label}</Text>
              </View>
              <View style={styles.list}>
                {group.entries.map((entry, index) => (
                  <Entry
                    key={entry.id}
                    entry={entry}
                    showBorder={index < group.entries.length - 1}
                  />
                ))}
              </View>
            </View>
          ))}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Candle.bgCanvas,
  },
  safe: {
    flex: 1,
  },
  titleBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 8,
    paddingBottom: 4,
    paddingHorizontal: 20,
  },
  titleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Candle.surfaceSunken,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontFamily: CandleFontFamilies.interBold,
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.6,
    color: Candle.textPrimary,
  },
  countPill: {
    borderRadius: 999,
    backgroundColor: '#FFFFFFAB',
    borderWidth: 1,
    borderColor: Candle.glassBorder,
    paddingVertical: 4,
    paddingHorizontal: 11,
  },
  countLabel: {
    fontFamily: CandleFontFamilies.interSemiBold,
    fontSize: 12,
    fontWeight: '600',
    color: Candle.textSecondary,
  },
  subWrap: {
    paddingTop: 2,
    paddingHorizontal: 20,
  },
  sub: {
    fontFamily: CandleFontFamilies.inter,
    fontSize: 14,
    color: Candle.textSecondary,
  },
  searchWrap: {
    paddingHorizontal: 20,
    paddingTop: 14,
  },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 46,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Candle.hairline,
    paddingHorizontal: 14,
  },
  searchPlaceholder: {
    flex: 1,
    fontFamily: CandleFontFamilies.inter,
    fontSize: 15,
    color: Candle.textTertiary,
  },
  scroll: {
    flex: 1,
  },
  body: {
    paddingTop: 14,
    paddingBottom: 40,
    gap: 16,
  },
  group: {
    width: '100%',
  },
  labelWrap: {
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  groupLabel: {
    fontFamily: CandleFontFamilies.interBold,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: Candle.textTertiary,
  },
  list: {
    paddingHorizontal: 20,
    borderTopWidth: 1,
    borderTopColor: Candle.hairline,
  },
  entry: {
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 13,
  },
  entryBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Candle.hairline,
  },
  entryIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  entryTexts: {
    flex: 1,
    gap: 3,
  },
  entryContent: {
    fontFamily: CandleFontFamilies.interMedium,
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 14 * 1.4,
    color: Candle.textPrimary,
  },
  entryAge: {
    fontFamily: CandleFontFamilies.inter,
    fontSize: 12,
    color: Candle.textTertiary,
  },
});
