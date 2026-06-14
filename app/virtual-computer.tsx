/**
 * Virtual Computer — a live view of the agent's E2B sandbox. Mirrors the Pencil
 * `Screen · Virtual Computer` node: a NavBar (back, "Virtual Computer" + live
 * status row, more), a Body with a Browser/Terminal/Files segment over a
 * preview surface (a rendered page skeleton + a status/take-over bar), and a
 * docked Restart / Expand / Stop action trio.
 */
import { useRouter } from 'expo-router';
import {
    ArrowLeft,
    Hand,
    Loader,
    Maximize2,
    MoreHorizontal,
    RotateCcw,
    StopCircle,
} from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Candle, CandleFontFamilies } from '@/constants/theme';

type Tab = 'browser' | 'terminal' | 'files';

export default function VirtualComputerScreen() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('browser');

  return (
    <View style={styles.root}>
      <SafeAreaView edges={['top', 'bottom']} style={styles.safe}>
        {/* NavBar */}
        <View style={styles.navBar}>
          <View style={styles.navLeft}>
            <Pressable
              style={styles.iconBtn}
              hitSlop={8}
              onPress={() => router.back()}
              accessibilityRole="button"
              accessibilityLabel="Back"
            >
              <ArrowLeft size={21} color={Candle.textPrimary} />
            </Pressable>
            <View style={styles.titleCol}>
              <Text style={styles.title}>Virtual Computer</Text>
              <View style={styles.liveRow}>
                <View style={styles.dot} />
                <Text style={styles.liveLabel}>Sandbox running · e2b</Text>
              </View>
            </View>
          </View>
          <Pressable
            style={styles.iconBtn}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="More options"
          >
            <MoreHorizontal size={21} color={Candle.textSecondary} />
          </Pressable>
        </View>

        {/* Body */}
        <View style={styles.body}>
          {/* Segment control */}
          <View style={styles.segment}>
            {(['browser', 'terminal', 'files'] as Tab[]).map((t) => {
              const active = tab === t;
              const label = t === 'browser' ? 'Browser' : t === 'terminal' ? 'Terminal' : 'Files';
              return (
                <Pressable
                  key={t}
                  style={[styles.segBtn, active ? styles.segBtnActive : null]}
                  onPress={() => setTab(t)}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={label}
                >
                  <Text style={[styles.segLabel, active ? styles.segLabelActive : null]}>
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Preview surface */}
          <View style={styles.preview}>
            {/* Page skeleton */}
            <View style={styles.page}>
              <View style={styles.h1} />
              <View style={styles.line} />
              <View style={styles.line} />
              <View style={styles.pageRow}>
                <View style={styles.img} />
                <View style={styles.imgCol}>
                  <View style={styles.skel} />
                  <View style={[styles.skel, styles.skelShort]} />
                </View>
              </View>
              <View style={styles.line} />
              <View style={[styles.line, styles.lineWide]} />
            </View>

            {/* Status / take-over bar */}
            <View style={styles.bar}>
              <View style={styles.status}>
                <Loader size={14} color={Candle.flame} />
                <Text style={styles.statusLabel}>Reading · 6 of 9</Text>
              </View>
              <Pressable
                style={styles.takeOver}
                accessibilityRole="button"
                accessibilityLabel="Take over the sandbox"
              >
                <Hand size={14} color={Candle.flame} />
                <Text style={styles.takeOverLabel}>Take over</Text>
              </Pressable>
            </View>
          </View>
        </View>

        {/* Dock */}
        <View style={styles.dock}>
          <Pressable
            style={[styles.dockBtn, styles.neutralBtn]}
            accessibilityRole="button"
            accessibilityLabel="Restart sandbox"
          >
            <RotateCcw size={18} color={Candle.textPrimary} />
            <Text style={styles.neutralLabel}>Restart</Text>
          </Pressable>
          <Pressable
            style={[styles.dockBtn, styles.neutralBtn]}
            accessibilityRole="button"
            accessibilityLabel="Expand view"
          >
            <Maximize2 size={18} color={Candle.textPrimary} />
            <Text style={styles.neutralLabel}>Expand</Text>
          </Pressable>
          <Pressable
            style={[styles.dockBtn, styles.stopBtn]}
            accessibilityRole="button"
            accessibilityLabel="Stop sandbox"
          >
            <StopCircle size={18} color={Candle.danger} />
            <Text style={styles.stopLabel}>Stop</Text>
          </Pressable>
        </View>
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
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 6,
    paddingBottom: 8,
    paddingHorizontal: 20,
  },
  navLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Candle.surfaceSunken,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleCol: {
    gap: 1,
  },
  title: {
    fontFamily: CandleFontFamilies.interBold,
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.4,
    color: Candle.textPrimary,
  },
  liveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: Candle.success,
  },
  liveLabel: {
    fontFamily: CandleFontFamilies.interMedium,
    fontSize: 12,
    fontWeight: '500',
    color: Candle.textSecondary,
  },
  body: {
    flex: 1,
    paddingTop: 10,
    paddingHorizontal: 20,
    gap: 16,
  },
  segment: {
    flexDirection: 'row',
    gap: 4,
    borderRadius: 12,
    backgroundColor: Candle.surfaceSunken,
    padding: 4,
  },
  segBtn: {
    flex: 1,
    height: 36,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segBtnActive: {
    backgroundColor: Candle.bgElevated,
    borderWidth: 1,
    borderColor: Candle.hairline,
  },
  segLabel: {
    fontFamily: CandleFontFamilies.interMedium,
    fontSize: 13.5,
    fontWeight: '500',
    color: Candle.textSecondary,
  },
  segLabelActive: {
    fontFamily: CandleFontFamilies.interBold,
    fontWeight: '700',
    color: Candle.textPrimary,
  },
  preview: {
    flex: 1,
    borderRadius: 16,
    backgroundColor: Candle.bgElevated,
    borderWidth: 1,
    borderColor: Candle.hairline,
    overflow: 'hidden',
    shadowColor: '#C8A06E',
    shadowOpacity: 0.12,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  page: {
    flex: 1,
    gap: 11,
    backgroundColor: Candle.bgElevated,
    padding: 20,
  },
  h1: {
    width: 200,
    height: 15,
    borderRadius: 7,
    backgroundColor: Candle.flame,
  },
  line: {
    width: '100%',
    height: 9,
    borderRadius: 5,
    backgroundColor: Candle.surfaceSunken,
  },
  lineWide: {
    width: 280,
  },
  pageRow: {
    flexDirection: 'row',
    gap: 11,
    height: 54,
    paddingTop: 5,
  },
  img: {
    width: 150,
    height: 54,
    borderRadius: 9,
    backgroundColor: Candle.accentSoft,
  },
  imgCol: {
    flex: 1,
    gap: 8,
    justifyContent: 'center',
  },
  skel: {
    width: '100%',
    height: 8,
    borderRadius: 4,
    backgroundColor: Candle.surfaceSunken,
  },
  skelShort: {
    width: 110,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    backgroundColor: Candle.surfaceSunken,
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderTopWidth: 1,
    borderTopColor: Candle.hairline,
  },
  status: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  statusLabel: {
    fontFamily: CandleFontFamilies.interMedium,
    fontSize: 12,
    fontWeight: '500',
    color: Candle.textSecondary,
  },
  takeOver: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  takeOverLabel: {
    fontFamily: CandleFontFamilies.interSemiBold,
    fontSize: 12,
    fontWeight: '600',
    color: Candle.flame,
  },
  dock: {
    flexDirection: 'row',
    gap: 10,
    paddingTop: 14,
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  dockBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    height: 48,
    borderRadius: 14,
  },
  neutralBtn: {
    backgroundColor: Candle.bgElevated,
    borderWidth: 1,
    borderColor: Candle.hairline,
  },
  neutralLabel: {
    fontFamily: CandleFontFamilies.interSemiBold,
    fontSize: 14,
    fontWeight: '600',
    color: Candle.textPrimary,
  },
  stopBtn: {
    backgroundColor: Candle.dangerSoft,
  },
  stopLabel: {
    fontFamily: CandleFontFamilies.interSemiBold,
    fontSize: 14,
    fontWeight: '600',
    color: Candle.danger,
  },
});
