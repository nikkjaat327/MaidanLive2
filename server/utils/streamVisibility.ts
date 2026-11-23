export type BroadcastPhase =
  | 'MATCH_SETUP'
  | 'MATCH_PREPARED'
  | 'BROADCAST_ACTIVE'
  | 'BROADCAST_ENDED';

/**
 * Determines whether a LiveStream document should be exposed on public / Player Portal endpoints.
 * Prepared matches (`broadcastPublished === false` and not yet activated) remain visible only to
 * authorized Admins, Broadcasters, Scorers, and the isolated OBS Browser Source overlay endpoint.
 */
export function isStreamVisibleToPublic(stream: any): boolean {
  if (!stream) return false;
  if (stream.broadcastPublished === false) {
    return stream.status === 'ENDED' && stream.wasPublished !== false;
  }
  return true;
}

export function buildPublicStreamVisibilityQuery(): Record<string, unknown> {
  return {
    $or: [
      { broadcastPublished: { $ne: false } },
      { status: 'ENDED', wasPublished: { $ne: false } },
    ],
  };
}
