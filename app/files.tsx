/**
 * Files — recent agent-produced files plus a grid of generated images. Pixel-
 * faithful to the Pencil `Screen · Files` node: a flame "add" button in the
 * title bar, a search field, a hairline-bordered recents list, and a 2×3 image
 * grid. Cards blend into the canvas with hairline borders.
 */
import { useRouter } from 'expo-router';
import {
    Code,
    Download,
    FileText,
    Image as ImageIcon,
    Plus,
    Search,
    Table,
    type LucideIcon,
} from 'lucide-react-native';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Candle, CandleFontFamilies } from '@/constants/theme';

interface FileRow {
  icon: LucideIcon;
  iconColor: string;
  name: string;
  size: string;
}

const RECENT_FILES: FileRow[] = [
  { icon: FileText, iconColor: '#E0533D', name: 'report.pdf', size: '240 KB' },
  { icon: Table, iconColor: '#3E9D5B', name: 'data.csv', size: '18 KB' },
  { icon: Code, iconColor: '#9B5DE5', name: 'chart.py', size: '2 KB' },
];

const IMAGE_GRID = [0, 1, 2, 3, 4, 5];

export default function FilesScreen() {
  const router = useRouter();

  return (
    <View style={styles.root}>
      <SafeAreaView edges={['top']} style={styles.safe}>
        {/* Title bar */}
        <View style={styles.titleBar}>
          <Text style={styles.title}>Files</Text>
          <Pressable
            style={styles.addBtn}
            hitSlop={8}
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Add file"
          >
            <Plus size={22} color={Candle.textOnAccent} />
          </Pressable>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.body}
          showsVerticalScrollIndicator={false}
        >
          {/* Search */}
          <View style={styles.searchWrap}>
            <View style={styles.search}>
              <Search size={19} color={Candle.textTertiary} />
              <Text style={styles.searchPlaceholder}>Search files</Text>
            </View>
          </View>

          {/* Recents */}
          <View style={styles.recents}>
            <View style={styles.labelWrap}>
              <Text style={styles.sectionLabel}>RECENT</Text>
            </View>
            <View style={styles.list}>
              {RECENT_FILES.map((file, index) => {
                const Icon = file.icon;
                const isLast = index === RECENT_FILES.length - 1;
                return (
                  <Pressable
                    key={file.name}
                    style={[styles.fileRow, isLast ? null : styles.fileRowBorder]}
                    accessibilityRole="button"
                    accessibilityLabel={file.name}
                  >
                    <Icon size={22} color={file.iconColor} />
                    <View style={styles.fileTexts}>
                      <Text style={styles.fileName}>{file.name}</Text>
                      <Text style={styles.fileSize}>{file.size}</Text>
                    </View>
                    <Download size={17} color={Candle.textTertiary} />
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Generated images */}
          <View style={styles.photos}>
            <View style={styles.labelWrap}>
              <Text style={styles.sectionLabel}>GENERATED IMAGES</Text>
            </View>
            <View style={styles.gridWrap}>
              <View style={styles.grid}>
                <View style={styles.gridRow}>
                  {IMAGE_GRID.slice(0, 3).map((i) => (
                    <View key={i} style={styles.photoTile} accessibilityRole="image">
                      <ImageIcon size={18} color="#E0A85C" />
                    </View>
                  ))}
                </View>
                <View style={styles.gridRow}>
                  {IMAGE_GRID.slice(3, 6).map((i) => (
                    <View key={i} style={styles.photoTile} accessibilityRole="image">
                      <ImageIcon size={18} color="#E0A85C" />
                    </View>
                  ))}
                </View>
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 8,
    paddingBottom: 4,
    paddingHorizontal: 20,
  },
  title: {
    fontFamily: CandleFontFamilies.interBold,
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.6,
    color: Candle.textPrimary,
  },
  addBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Candle.flame,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Candle.flameDeep,
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 6,
  },
  scroll: {
    flex: 1,
  },
  body: {
    paddingTop: 14,
    paddingBottom: 32,
    gap: 18,
  },
  searchWrap: {
    paddingHorizontal: 20,
  },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 46,
    borderRadius: 14,
    backgroundColor: 'transparent',
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
  recents: {
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
  list: {
    backgroundColor: 'transparent',
    paddingVertical: 2,
    paddingHorizontal: 14,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: Candle.hairline,
  },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingVertical: 11,
  },
  fileRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Candle.hairline,
  },
  fileTexts: {
    flex: 1,
    gap: 1,
  },
  fileName: {
    fontFamily: CandleFontFamilies.interSemiBold,
    fontSize: 13.5,
    fontWeight: '600',
    color: Candle.textPrimary,
  },
  fileSize: {
    fontFamily: CandleFontFamilies.inter,
    fontSize: 11,
    color: Candle.textTertiary,
  },
  photos: {
    gap: 11,
  },
  gridWrap: {
    paddingHorizontal: 20,
  },
  grid: {
    gap: 8,
  },
  gridRow: {
    flexDirection: 'row',
    gap: 8,
  },
  photoTile: {
    flex: 1,
    height: 62,
    borderRadius: 10,
    backgroundColor: Candle.accentSoft,
    borderWidth: 1,
    borderColor: Candle.hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
