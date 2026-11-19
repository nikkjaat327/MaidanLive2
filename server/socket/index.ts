export {
  initSocketServer,
  getSocketIO,
  emitStreamEvent,
  emitRoomOnlyEvent,
  emitTournamentEvent,
  emitUserNotification,
  getActiveRoomViewerCount,
  getAllActiveViewerCounts,
  invalidateViewerVisibilityCache,
} from '../../backend/realtime/socket.ts';
