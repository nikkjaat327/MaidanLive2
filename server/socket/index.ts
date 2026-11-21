export {
  initSocketServer,
  getSocketIO,
  emitStreamEvent,
  emitRoomOnlyEvent,
  emitBroadcastStudioEvent,
  registerObsAgentHandlers,
  emitTournamentEvent,
  emitUserNotification,
  getActiveRoomViewerCount,
  getAllActiveViewerCounts,
  invalidateViewerVisibilityCache,
} from '../../backend/realtime/socket.ts';
