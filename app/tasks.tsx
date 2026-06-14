/**
 * Tasks — scheduled/recurring agent jobs. Each card shows an icon, name, the
 * cadence, an enable toggle, plus a footer with the next-run hint and an edit
 * affordance. The flame "Add" button pushes the New Task screen. Pixel-faithful
 * to the Pencil `Screen · Tasks` node.
 */
import { useRouter } from 'expo-router';
import {
    ArrowLeft,
    CalendarDays,
    Clock,
    CloudUpload,
    FileText,
    PauseCircle,
    Pencil,
    Plus,
    Timer,
    type LucideIcon,
} from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Candle, CandleFontFamilies } from '@/constants/theme';

interface ScheduledTask {
  id: string;
  icon: LucideIcon;
  iconColor: string;
  name: string;
  cadence: string;
  nextIcon: LucideIcon;
  nextLabel: string;
  enabled: boolean;
}

const TASKS: ScheduledTask[] = [
  {
    id: 'news',
    icon: Clock,
    iconColor: Candle.flame,
    name: 'Daily news digest',
    cadence: 'Every day · 8:00 AM',
    nextIcon: Timer,
    nextLabel: 'Next in 6h',
    enabled: true,
  },
  {
    id: 'competitor',
    icon: CalendarDays,
    iconColor: Candle.success,
    name: 'Weekly competitor scan',
    cadence: 'Every Monday · 9:00 AM',
    nextIcon: Timer,
    nextLabel: 'Next Mon',
    enabled: true,
  },
  {
    id: 'report',
    icon: FileText,
    iconColor: Candle.ember,
    name: 'Monthly report export',
    cadence: '1st of month · 12:00 PM',
    nextIcon: Timer,
    nextLabel: 'Next Jun 1',
    enabled: true,
  },
  {
    id: 'backup',
    icon: CloudUpload,
    iconColor: Candle.textTertiary,
    name: 'Backup chat history',
    cadence: 'Every Sunday · 2:00 AM',
    nextIcon: PauseCircle,
    nextLabel: 'Paused',
    enabled: false,
  },
];

/** The 50×30 enable toggle on each task card header. */
function TaskToggle({ on, onToggle, label }: { on: boolean; onToggle: () => void; label: string }) {
  return (
    <Pressable
      style={[styles.toggleTrack, on ? styles.toggleOn : styles.toggleOff]}
      onPress={onToggle}
      accessibilityRole="switch"
      accessibilityState={{ checked: on }}
      accessibilityLabel={label}
    >
      <View style={styles.toggleKnob} />
    </Pressable>
  );
}

function TaskCard({ task, onToggle }: { task: ScheduledTask; onToggle: () => void }) {
  const Icon = task.icon;
  const NextIcon = task.nextIcon;
  const footerColor = task.enabled ? Candle.flameDeep : Candle.textTertiary;
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Icon size={24} color={task.iconColor} />
        <View style={styles.cardTexts}>
          <Text style={styles.cardName}>{task.name}</Text>
          <Text style={styles.cardCadence}>{task.cadence}</Text>
        </View>
        <TaskToggle on={task.enabled} onToggle={onToggle} label={task.name} />
      </View>
      <View style={styles.cardFooter}>
        <NextIcon size={16} color={footerColor} />
        <Text style={[styles.nextLabel, { color: footerColor }]}>{task.nextLabel}</Text>
        <Pencil size={17} color={Candle.textTertiary} />
      </View>
    </View>
  );
}

export default function TasksScreen() {
  const router = useRouter();
  const [tasks, setTasks] = useState(TASKS);

  const toggleTask = (id: string) =>
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, enabled: !t.enabled } : t)));

  return (
    <View style={styles.root}>
      <SafeAreaView edges={['top']} style={styles.safe}>
        <View style={styles.navBar}>
          <Pressable
            style={styles.backBtn}
            hitSlop={8}
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <ArrowLeft size={21} color={Candle.textPrimary} />
          </Pressable>
          <Text style={styles.title}>Scheduled tasks</Text>
          <Pressable
            style={styles.addBtn}
            hitSlop={8}
            onPress={() => router.push('/new-task')}
            accessibilityRole="button"
            accessibilityLabel="New task"
          >
            <Plus size={22} color={Candle.textOnAccent} />
          </Pressable>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.body}
          showsVerticalScrollIndicator={false}
        >
          {tasks.map((task) => (
            <TaskCard key={task.id} task={task} onToggle={() => toggleTask(task.id)} />
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
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingTop: 6,
    paddingBottom: 10,
    paddingHorizontal: 20,
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
    flex: 1,
    fontFamily: CandleFontFamilies.interBold,
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: -0.5,
    color: Candle.textPrimary,
  },
  addBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Candle.flame,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    flex: 1,
  },
  body: {
    paddingTop: 10,
    paddingHorizontal: 18,
    paddingBottom: 32,
    gap: 14,
  },
  card: {
    borderRadius: 16,
    backgroundColor: Candle.bgCanvas,
    borderWidth: 1,
    borderColor: Candle.hairline,
    padding: 16,
    gap: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
  },
  cardTexts: {
    flex: 1,
    gap: 3,
  },
  cardName: {
    fontFamily: CandleFontFamilies.interBold,
    fontSize: 16.5,
    fontWeight: '700',
    letterSpacing: -0.2,
    color: Candle.textPrimary,
  },
  cardCadence: {
    fontFamily: CandleFontFamilies.interMedium,
    fontSize: 13,
    fontWeight: '500',
    color: Candle.textSecondary,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Candle.hairline,
  },
  nextLabel: {
    flex: 1,
    fontFamily: CandleFontFamilies.interSemiBold,
    fontSize: 13,
    fontWeight: '600',
  },
  toggleTrack: {
    width: 50,
    height: 30,
    borderRadius: 15,
    paddingHorizontal: 3,
    flexDirection: 'row',
    alignItems: 'center',
  },
  toggleOn: {
    backgroundColor: Candle.flame,
    justifyContent: 'flex-end',
  },
  toggleOff: {
    backgroundColor: Candle.surfaceSunken,
    justifyContent: 'flex-start',
  },
  toggleKnob: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
  },
});
