/**
 * KanbanBlock — an inline GenUI kanban board rendered in the chat stream.
 * Mirrors the Pencil `GenUI/5 · Project Planning` "Kanban board": horizontally
 * scrollable columns (To do / In progress / Done) of small task cards, each
 * column headed by a status dot, title, and a count. Pure presentational;
 * falls back to SAMPLE data when `data` is missing or malformed.
 */
import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Candle, CandleFontFamilies } from '@/constants/theme';

interface Task {
  title: string;
  tag?: string;
}

interface KanbanColumn {
  title: string;
  dotColor: string;
  tasks: Task[];
}

interface KanbanData {
  columns: KanbanColumn[];
}

const SAMPLE: KanbanData = {
  columns: [
    {
      title: 'To do',
      dotColor: Candle.textTertiary,
      tasks: [{ title: 'Design auth flow', tag: 'research' }, { title: 'Set up CI' }],
    },
    {
      title: 'In progress',
      dotColor: Candle.flame,
      tasks: [
        { title: 'Build chat UI', tag: 'ui' },
        { title: 'WebSocket client', tag: 'backend' },
      ],
    },
    {
      title: 'Done',
      dotColor: Candle.success,
      tasks: [{ title: 'Project scaffold' }, { title: 'Theme tokens' }],
    },
  ],
};

const DOT_RAMP = [Candle.textTertiary, Candle.flame, Candle.success];

/** Coerce an unknown payload into safe KanbanData. */
function normalize(data: unknown): KanbanData {
  if (!data || typeof data !== 'object') return SAMPLE;
  const d = data as Record<string, unknown>;
  const columns = Array.isArray(d.columns)
    ? (d.columns as unknown[])
        .map((c, ci): KanbanColumn | null => {
          const r = c as Record<string, unknown>;
          if (!r || typeof r !== 'object') return null;
          const tasks = Array.isArray(r.tasks)
            ? (r.tasks as unknown[])
                .map((t): Task | null => {
                  const tr = t as Record<string, unknown>;
                  if (!tr || typeof tr !== 'object' || typeof tr.title !== 'string') return null;
                  return {
                    title: tr.title,
                    tag: typeof tr.tag === 'string' ? tr.tag : undefined,
                  };
                })
                .filter((t): t is Task => t !== null)
            : [];
          return {
            title: typeof r.title === 'string' ? r.title : '',
            dotColor: typeof r.dotColor === 'string' ? r.dotColor : DOT_RAMP[ci % DOT_RAMP.length],
            tasks,
          };
        })
        .filter((c): c is KanbanColumn => c !== null)
    : [];
  return { columns: columns.length > 0 ? columns : SAMPLE.columns };
}

function TaskCard({ task }: { task: Task }) {
  return (
    <View style={styles.taskCard}>
      <Text style={styles.taskTitle} numberOfLines={2}>
        {task.title}
      </Text>
      {task.tag ? (
        <View style={styles.tag}>
          <Text style={styles.tagLabel}>{task.tag}</Text>
        </View>
      ) : null}
    </View>
  );
}

function Column({ column }: { column: KanbanColumn }) {
  return (
    <View style={styles.column}>
      <View style={styles.columnHead}>
        <View style={[styles.dot, { backgroundColor: column.dotColor }]} />
        <Text style={styles.columnTitle} numberOfLines={1}>
          {column.title}
        </Text>
        <Text style={styles.count}>{column.tasks.length}</Text>
      </View>
      {column.tasks.map((task, i) => (
        <TaskCard key={i} task={task} />
      ))}
    </View>
  );
}

export function KanbanBlock({ data }: { data?: unknown }) {
  const model = useMemo(() => normalize(data), [data]);
  return (
    <View style={styles.root}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.track}
      >
        {model.columns.map((column, i) => (
          <Column key={i} column={column} />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
  },
  track: {
    gap: 12,
    paddingVertical: 1,
  },
  column: {
    width: 200,
    gap: 10,
    borderRadius: 14,
    backgroundColor: Candle.bgWarmDeep,
    padding: 12,
  },
  columnHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  columnTitle: {
    flex: 1,
    fontFamily: CandleFontFamilies.interBold,
    fontSize: 12.5,
    fontWeight: '700',
    color: Candle.textPrimary,
  },
  count: {
    fontFamily: CandleFontFamilies.interSemiBold,
    fontSize: 11,
    fontWeight: '600',
    color: Candle.textTertiary,
  },
  taskCard: {
    gap: 8,
    borderRadius: 10,
    backgroundColor: Candle.bgCanvas,
    borderWidth: 1,
    borderColor: Candle.hairline,
    padding: 11,
  },
  taskTitle: {
    fontFamily: CandleFontFamilies.interMedium,
    fontSize: 12.5,
    fontWeight: '500',
    color: Candle.textPrimary,
  },
  tag: {
    alignSelf: 'flex-start',
    borderRadius: 6,
    backgroundColor: Candle.accentSoft,
    paddingVertical: 3,
    paddingHorizontal: 7,
  },
  tagLabel: {
    fontFamily: CandleFontFamilies.interSemiBold,
    fontSize: 10,
    fontWeight: '600',
    color: Candle.flame,
  },
});
