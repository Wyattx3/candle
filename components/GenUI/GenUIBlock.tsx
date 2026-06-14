/**
 * GenUIBlock — the inline GenUI dispatcher. Given a `{ kind, data }` payload
 * from a `genui` stream node (see `hooks/chat-types.ts`), it selects the
 * matching presentational renderer and hands it the optional `data`. Each
 * renderer validates `data` defensively and falls back to its own sample data,
 * so an unknown or malformed payload never crashes the chat stream. Unknown
 * kinds render nothing.
 */
import type { GenUIKind } from '@/hooks/chat-types';

import { AgentActionBlock } from './AgentActionBlock';
import { DataTableBlock } from './DataTableBlock';
import { InsightsBlock } from './InsightsBlock';
import { KanbanBlock } from './KanbanBlock';
import { LocationsBlock } from './LocationsBlock';
import { PlanBlock } from './PlanBlock';
import { WorkersBlock } from './WorkersBlock';

export function GenUIBlock({ kind, data }: { kind: GenUIKind; data?: unknown }) {
  switch (kind) {
    case 'insights':
      return <InsightsBlock data={data} />;
    case 'table':
      return <DataTableBlock data={data} />;
    case 'kanban':
      return <KanbanBlock data={data} />;
    case 'agent_action':
      return <AgentActionBlock data={data} />;
    case 'plan':
      return <PlanBlock data={data} />;
    case 'workers':
      return <WorkersBlock data={data} />;
    case 'locations':
      return <LocationsBlock data={data} />;
    default:
      return null;
  }
}
