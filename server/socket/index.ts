export {
  initSocketServer,
  getSocketIO,
  emitStreamEvent,
  emitRoomOnlyEvent,
  emitBroadcastStudioEvent,
  emitCameraCompanionEvent,
  registerObsAgentHandlers,
  emitTournamentEvent,
  emitUserNotification,
  getActiveRoomViewerCount,
  getAllActiveViewerCounts,
  invalidateViewerVisibilityCache,
} from '../../backend/realtime/socket.ts';
export type { ObsAgentContext } from '../../backend/realtime/socket.ts';

