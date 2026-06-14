/**
 * Skills — procedural memory Candle has learned. Pixel-faithful to the Pencil
 * `Screen · Skills` node: a pending-review suggestion card with dismiss/approve
 * actions, an installed skill row with usage tags, and an MCP server row with a
 * connected status and an on toggle. Cards blend into the canvas with hairlines.
 */
import { useRouter } from 'expo-router';
import { Bolt, Check, Flame, MoreVertical, Puzzle } from 'lucide-react-native';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Candle, CandleFontFamilies } from '@/constants/theme';

const INSTALLED_TAGS = ['research', 'chart'];

export default function SkillsScreen() {
  const router = useRouter();

  return (
    <View style={styles.root}>
      <SafeAreaView edges={['top']} style={styles.safe}>
        {/* Title */}
        <View style={styles.titleBar}>
          <Text style={styles.title}>Skills</Text>
          <Text style={styles.subtitle}>Procedural memory Candle has learned</Text>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.body}
          showsVerticalScrollIndicator={false}
        >
          {/* Pending review */}
          <View style={styles.suggested}>
            <View style={styles.labelWrap}>
              <Text style={styles.sectionLabel}>PENDING REVIEW</Text>
            </View>
            <View style={styles.skillCard}>
              <View style={styles.skillHead}>
                <View style={styles.skillWell}>
                  <Flame size={20} color={Candle.flame} />
                </View>
                <View style={styles.skillHeadTexts}>
                  <Text style={styles.skillTitle}>Funding research → chart</Text>
                  <Text style={styles.skillDesc}>
                    Search rounds, rank by growth, render a chart.
                  </Text>
                </View>
              </View>
              <View style={styles.actions}>
                <Pressable
                  style={styles.dismissBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Dismiss skill"
                >
                  <Text style={styles.dismissLabel}>Dismiss</Text>
                </Pressable>
                <Pressable
                  style={styles.approveBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Approve skill"
                >
                  <Check size={16} color="#FFFDF8" />
                  <Text style={styles.approveLabel}>Approve skill</Text>
                </Pressable>
              </View>
            </View>
          </View>

          {/* Installed */}
          <View style={styles.installed}>
            <View style={styles.labelWrap}>
              <Text style={styles.sectionLabel}>INSTALLED</Text>
            </View>

            {/* Installed skill */}
            <Pressable
              style={styles.installedSkill}
              onPress={() => router.push('/skill-detail')}
              accessibilityRole="button"
              accessibilityLabel="Funding research skill"
            >
              <View style={styles.installedHead}>
                <Bolt size={22} color={Candle.flame} />
                <View style={styles.installedTexts}>
                  <Text style={styles.installedName}>Funding research</Text>
                  <Text style={styles.installedSub}>Used 7 times</Text>
                </View>
                <MoreVertical size={18} color={Candle.textTertiary} />
              </View>
              <View style={styles.tags}>
                {INSTALLED_TAGS.map((tag) => (
                  <View key={tag} style={styles.tag}>
                    <Text style={styles.tagLabel}>{tag}</Text>
                  </View>
                ))}
              </View>
            </Pressable>

            {/* MCP server */}
            <View style={styles.mcp}>
              <View style={styles.installedHead}>
                <Puzzle size={22} color="#9B5DE5" />
                <View style={styles.installedTexts}>
                  <Text style={styles.installedName}>aws-docs</Text>
                  <Text style={styles.installedSub}>uvx · 12 tools</Text>
                </View>
                <View style={styles.toggleOn}>
                  <View style={styles.toggleKnob} />
                </View>
              </View>
              <View style={styles.status}>
                <View style={styles.statusDot} />
                <Text style={styles.statusLabel}>Connected</Text>
              </View>
            </View>
          </View>
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
    paddingTop: 8,
    paddingBottom: 4,
    paddingHorizontal: 20,
    gap: 4,
  },
  title: {
    fontFamily: CandleFontFamilies.interBold,
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.6,
    color: Candle.textPrimary,
  },
  subtitle: {
    fontFamily: CandleFontFamilies.inter,
    fontSize: 14,
    color: Candle.textSecondary,
  },
  scroll: {
    flex: 1,
  },
  body: {
    paddingTop: 16,
    paddingBottom: 32,
    gap: 18,
  },
  suggested: {
    gap: 11,
  },
  labelWrap: {
    paddingHorizontal: 20,
  },
  sectionLabel: {
    fontFamily: CandleFontFamilies.interBold,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: Candle.textTertiary,
  },
  skillCard: {
    backgroundColor: 'transparent',
    padding: 16,
    gap: 12,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: Candle.hairline,
  },
  skillHead: {
    flexDirection: 'row',
    gap: 12,
  },
  skillWell: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  skillHeadTexts: {
    flex: 1,
    gap: 3,
  },
  skillTitle: {
    fontFamily: CandleFontFamilies.interBold,
    fontSize: 15,
    fontWeight: '700',
    color: Candle.textPrimary,
  },
  skillDesc: {
    fontFamily: CandleFontFamilies.inter,
    fontSize: 13,
    lineHeight: 13 * 1.4,
    color: Candle.textSecondary,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
  dismissBtn: {
    height: 38,
    borderRadius: 10,
    backgroundColor: Candle.bgElevated,
    borderWidth: 1,
    borderColor: Candle.hairline,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dismissLabel: {
    fontFamily: CandleFontFamilies.interSemiBold,
    fontSize: 13,
    fontWeight: '600',
    color: Candle.textSecondary,
  },
  approveBtn: {
    flex: 1,
    flexDirection: 'row',
    height: 38,
    borderRadius: 10,
    backgroundColor: Candle.flame,
    gap: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  approveLabel: {
    fontFamily: CandleFontFamilies.interSemiBold,
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFDF8',
  },
  installed: {
    gap: 0,
  },
  installedSkill: {
    backgroundColor: 'transparent',
    padding: 14,
    gap: 12,
    borderTopWidth: 1,
    borderColor: Candle.hairline,
  },
  installedHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  installedTexts: {
    flex: 1,
    gap: 1,
  },
  installedName: {
    fontFamily: CandleFontFamilies.interBold,
    fontSize: 14.5,
    fontWeight: '700',
    color: Candle.textPrimary,
  },
  installedSub: {
    fontFamily: CandleFontFamilies.inter,
    fontSize: 11.5,
    color: Candle.textTertiary,
  },
  tags: {
    flexDirection: 'row',
    gap: 6,
  },
  tag: {
    borderRadius: 8,
    backgroundColor: Candle.surfaceSunken,
    paddingVertical: 4,
    paddingHorizontal: 9,
  },
  tagLabel: {
    fontFamily: CandleFontFamilies.interMedium,
    fontSize: 11,
    fontWeight: '500',
    color: Candle.textSecondary,
  },
  mcp: {
    backgroundColor: 'transparent',
    padding: 14,
    gap: 12,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: Candle.hairline,
  },
  toggleOn: {
    width: 44,
    height: 26,
    borderRadius: 13,
    backgroundColor: Candle.flame,
    paddingHorizontal: 3,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  toggleKnob: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#FFFDF8',
  },
  status: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Candle.success,
  },
  statusLabel: {
    fontFamily: CandleFontFamilies.interMedium,
    fontSize: 12,
    fontWeight: '500',
    color: Candle.success,
  },
});
