import type { LiveScoreData, LiveStreamData, StreamingProvider, StreamStatus } from '../types/index.ts';
import type { BroadcastCameraData, ObsControllerProfileData, ObsStudioMatchSummary } from '../types/obs.ts';

export type WorkflowStepState = 'completed' | 'current' | 'pending' | 'blocked';

export interface SeparatedBroadcastStatuses {
  obsStatus: {
    label: 'Offline' | 'Bridge Online' | 'OBS Connected' | 'OBS Streaming Live';
    tone: 'slate' | 'amber' | 'sky' | 'emerald' | 'red';
    detail: string;
  };
  youtubeStatus: {
    label:
      | 'Not Linked'
      | 'Linked · Ready'
      | 'Live on YouTube'
      | 'Unavailable'
      | 'MediaMTX Ready'
      | 'MediaMTX Live';
    tone: 'slate' | 'sky' | 'emerald' | 'red' | 'amber';
    detail: string;
  };
  matchStatus: {
    label: 'Match Setup' | 'Prepared' | 'Upcoming' | 'Match Live' | 'Break' | 'Match Completed';
    tone: 'slate' | 'amber' | 'emerald' | 'red' | 'sky';
    detail: string;
  };
  workflowStatus: {
    label:
      | 'Match Setup'
      | 'Match Prepared'
      | 'OBS Connected'
      | 'YouTube Connected'
      | 'Broadcast Active'
      | 'Match Live'
      | 'Match Completed'
      | 'Broadcast Ended';
    tone: 'slate' | 'amber' | 'sky' | 'emerald' | 'red';
    isPubliclyPublished: boolean;
  };
}

export interface ControlRoomWorkflowStep {
  stepNumber: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  key:
    | 'match_setup'
    | 'initialize_match'
    | 'broadcast_prep'
    | 'obs_camera_check'
    | 'youtube_connection'
    | 'activate_broadcast'
    | 'end_next_match';
  title: string;
  shortTitle: string;
  state: WorkflowStepState;
  detail: string;
}

export interface WorkflowMatchInput {
  id?: string;
  matchTitle?: string;
  teamAName?: string;
  teamBName?: string;
  gameName?: string;
  status: StreamStatus;
  broadcastPublished?: boolean;
  wasPublished?: boolean;
  broadcastPhase?: string;
  activeStreamingProvider?: StreamingProvider;
  youtubeVideoId?: string;
  youtubeStreamStatus?: string;
  mediamtxStreamPath?: string;
  mediamtxPublishStatus?: string;
}

export function isMatchPreparedDraft(stream: WorkflowMatchInput | null | undefined): boolean {
  if (!stream) return false;
  return stream.status === 'UPCOMING' && stream.broadcastPublished === false;
}

export function isMatchPubliclyLive(stream: WorkflowMatchInput | null | undefined): boolean {
  if (!stream) return false;
  return stream.status === 'LIVE' && stream.broadcastPublished !== false;
}

export function hasStreamOutputReady(stream: WorkflowMatchInput | null | undefined): boolean {
  if (!stream) return false;
  const provider = stream.activeStreamingProvider || 'youtube';
  if (provider === 'mediamtx') {
    return Boolean(stream.mediamtxStreamPath || stream.id);
  }
  return Boolean(stream.youtubeVideoId && stream.youtubeVideoId.trim().length === 11);
}

export function deriveSeparatedBroadcastStatuses(params: {
  match?: WorkflowMatchInput | ObsStudioMatchSummary | LiveStreamData | null;
  profile?: ObsControllerProfileData | null;
  score?: LiveScoreData | null;
}): SeparatedBroadcastStatuses {
  const { match, profile, score } = params;
  const obsConnected = profile?.connectionStatus === 'CONNECTED';
  const bridgeOnline =
    profile?.connectionMode === 'direct_ws' ? obsConnected : Boolean(profile?.agentOnline);
  const obsStreaming = Boolean(obsConnected && profile?.obsStreamActive);

  // 1. OBS Transmission Status
  const obsStatus: SeparatedBroadcastStatuses['obsStatus'] = obsStreaming
    ? {
        label: 'OBS Streaming Live',
        tone: 'red',
        detail: profile?.activeObsScene
          ? `Scene "${profile.activeObsScene}"${profile.obsStreamTimecode ? ` · ${profile.obsStreamTimecode}` : ''}`
          : 'Encoder streaming live',
      }
    : obsConnected
      ? {
          label: 'OBS Connected',
          tone: 'emerald',
          detail: profile?.activeObsScene
            ? `Ready · Scene: ${profile.activeObsScene}`
            : 'WebSocket ready (stream idle)',
        }
      : bridgeOnline
        ? {
            label: 'Bridge Online',
            tone: 'amber',
            detail: 'Bridge connected — waiting for OBS Studio port 4455',
          }
        : {
            label: 'Offline',
            tone: 'slate',
            detail: 'OBS Studio / Bridge not connected',
          };

  // 2. YouTube / Direct Output Status
  const provider: StreamingProvider = match?.activeStreamingProvider || 'youtube';
  const ytId = match?.youtubeVideoId?.trim() || '';
  const ytRawStatus = match?.youtubeStreamStatus || 'UNKNOWN';
  let youtubeStatus: SeparatedBroadcastStatuses['youtubeStatus'];

  if (provider === 'mediamtx') {
    const mtxLive = match?.mediamtxPublishStatus === 'PUBLISHING';
    youtubeStatus = {
      label: mtxLive ? 'MediaMTX Live' : 'MediaMTX Ready',
      tone: mtxLive ? 'emerald' : 'sky',
      detail: mtxLive ? 'Direct RTMP/HLS publishing live' : 'Direct MediaMTX feed configured',
    };
  } else if (!ytId) {
    youtubeStatus = {
      label: 'Not Linked',
      tone: 'slate',
      detail: 'Connect YouTube Video URL or ID in Step 5',
    };
  } else if (ytRawStatus === 'UNAVAILABLE') {
    youtubeStatus = {
      label: 'Unavailable',
      tone: 'red',
      detail: `Video ID ${ytId} unavailable or non-embeddable`,
    };
  } else if (ytRawStatus === 'LIVE' || (match?.status === 'LIVE' && obsStreaming)) {
    youtubeStatus = {
      label: 'Live on YouTube',
      tone: 'emerald',
      detail: `Video ID: ${ytId}`,
    };
  } else {
    youtubeStatus = {
      label: 'Linked · Ready',
      tone: 'sky',
      detail: `Video ID: ${ytId} (not yet activated on MaidanLive)`,
    };
  }

  // 3. Match / Scoreboard Status
  const scoreStatus = (score?.matchStatus || '').trim();
  const isCompleted =
    match?.status === 'ENDED' ||
    scoreStatus === 'Completed' ||
    (score?.resultStatus && score.resultStatus !== 'NOT_DECLARED');
  const isBreak = /break|innings|half|timeout|delay/i.test(scoreStatus);

  let matchStatus: SeparatedBroadcastStatuses['matchStatus'];
  if (!match) {
    matchStatus = {
      label: 'Match Setup',
      tone: 'slate',
      detail: 'Configure teams and sport format',
    };
  } else if (isCompleted) {
    matchStatus = {
      label: 'Match Completed',
      tone: 'slate',
      detail: score?.resultDescription || 'Final score recorded',
    };
  } else if (isBreak) {
    matchStatus = {
      label: 'Break',
      tone: 'amber',
      detail: scoreStatus || 'Match paused / break',
    };
  } else if (match.status === 'LIVE') {
    matchStatus = {
      label: 'Match Live',
      tone: 'emerald',
      detail: 'Scorer console & overlay active',
    };
  } else if (match.broadcastPublished === false || scoreStatus === 'Prepared') {
    matchStatus = {
      label: 'Prepared',
      tone: 'sky',
      detail: 'Initialized & unpublished (ready for scorer + OBS)',
    };
  } else {
    matchStatus = {
      label: 'Upcoming',
      tone: 'amber',
      detail: 'Scheduled before broadcast launch',
    };
  }

  // 4. MaidanLive Control Room Workflow Status
  const isPubliclyPublished = Boolean(match && match.broadcastPublished !== false && match.status === 'LIVE');
  let workflowStatus: SeparatedBroadcastStatuses['workflowStatus'];

  if (!match) {
    workflowStatus = { label: 'Match Setup', tone: 'slate', isPubliclyPublished: false };
  } else if (match.status === 'ENDED') {
    workflowStatus = {
      label: match.wasPublished === false ? 'Broadcast Ended' : 'Match Completed',
      tone: 'slate',
      isPubliclyPublished: false,
    };
  } else if (isPubliclyPublished) {
    workflowStatus = {
      label: obsStreaming ? 'Broadcast Active' : 'Match Live',
      tone: 'red',
      isPubliclyPublished: true,
    };
  } else if (hasStreamOutputReady(match) && ytId) {
    workflowStatus = {
      label: 'YouTube Connected',
      tone: 'sky',
      isPubliclyPublished: false,
    };
  } else if (obsConnected) {
    workflowStatus = {
      label: 'OBS Connected',
      tone: 'emerald',
      isPubliclyPublished: false,
    };
  } else {
    workflowStatus = {
      label: 'Match Prepared',
      tone: 'amber',
      isPubliclyPublished: false,
    };
  }

  return { obsStatus, youtubeStatus, matchStatus, workflowStatus };
}

export function deriveControlRoomSteps(params: {
  match?: WorkflowMatchInput | ObsStudioMatchSummary | null;
  profile?: ObsControllerProfileData | null;
  cameras?: BroadcastCameraData[];
}): ControlRoomWorkflowStep[] {
  const { match, profile, cameras = [] } = params;
  const obsConnected = profile?.connectionStatus === 'CONNECTED';
  const bridgeReady =
    profile?.connectionMode === 'direct_ws' ? obsConnected : Boolean(profile?.agentOnline);
  const enabledCams = cameras.filter((c) => c.enabled);
  const onlineCams = enabledCams.filter((c) => c.status === 'CONNECTED' || c.status === 'ACTIVE');

  const hasMatch = Boolean(match?.id);
  const isEnded = match?.status === 'ENDED';
  const isPublicLive = isMatchPubliclyLive(match);
  const outputReady = hasStreamOutputReady(match);

  const step1Done = hasMatch && Boolean(match?.matchTitle || match?.teamAName || match?.gameName);
  const step2Done = hasMatch;
  const step3Done = Boolean(bridgeReady || obsConnected || enabledCams.length > 0 || profile?.vdoRoomName);
  const step4Done = obsConnected && (enabledCams.length > 0 || (profile?.obsScenes?.length || 0) > 0);
  const step5Done = outputReady;
  const step6Done = isPublicLive || (isEnded && match?.wasPublished !== false);
  const step7Done = isEnded;

  const currentStep: number = !hasMatch
    ? 1
    : isEnded
      ? 7
      : !obsConnected
        ? 3
        : !step4Done
          ? 4
          : !step5Done
            ? 5
            : !isPublicLive
              ? 6
              : 7;

  const stateFor = (num: number, done: boolean): WorkflowStepState => {
    if (done) return 'completed';
    if (currentStep === num) return 'current';
    return 'pending';
  };

  return [
    {
      stepNumber: 1,
      key: 'match_setup',
      title: 'Match Setup',
      shortTitle: 'Setup',
      state: stateFor(1, step1Done),
      detail: hasMatch
        ? `${match?.matchTitle || [match?.teamAName, match?.teamBName].filter(Boolean).join(' vs ') || 'Metadata saved'} (${match?.gameName || 'Sport'})`
        : 'Enter teams, sport, format & viewer privacy (no YouTube link needed)',
    },
    {
      stepNumber: 2,
      key: 'initialize_match',
      title: 'Initialize Match',
      shortTitle: 'Initialize',
      state: stateFor(2, step2Done),
      detail: hasMatch
        ? isPublicLive
          ? 'Initialized & active'
          : isEnded
            ? 'Match session archived'
            : 'Prepared · Unpublished draft ready for Scorer & OBS Overlay'
        : 'Create active session, reset scores & clear stale state',
    },
    {
      stepNumber: 3,
      key: 'broadcast_prep',
      title: 'Broadcast Prep',
      shortTitle: 'Prep',
      state: stateFor(3, step3Done),
      detail: bridgeReady
        ? 'Bridge / VDO.Ninja / MediaMTX & overlay prepared'
        : 'Pair OBS Bridge, prepare VDO.Ninja cameras & overlay URL',
    },
    {
      stepNumber: 4,
      key: 'obs_camera_check',
      title: 'OBS / Camera Check',
      shortTitle: 'OBS Check',
      state: stateFor(4, step4Done),
      detail: obsConnected
        ? `${profile?.obsScenes?.length || 0} scenes · ${onlineCams.length}/${enabledCams.length} cams online`
        : 'Waiting for OBS WebSocket 4455 & camera sources',
    },
    {
      stepNumber: 5,
      key: 'youtube_connection',
      title: 'YouTube Connection',
      shortTitle: 'YouTube',
      state: step6Done && !step5Done ? 'blocked' : stateFor(5, step5Done),
      detail:
        match?.activeStreamingProvider === 'mediamtx'
          ? 'MediaMTX Direct Feed selected'
          : match?.youtubeVideoId
            ? `Linked ID: ${match.youtubeVideoId}`
            : 'Start OBS stream to YouTube, then paste Video URL / ID',
    },
    {
      stepNumber: 6,
      key: 'activate_broadcast',
      title: 'Activate Broadcast',
      shortTitle: 'Activate',
      state: !outputReady && !isEnded ? 'blocked' : stateFor(6, step6Done),
      detail: isPublicLive
        ? 'Live & published on Player Portal'
        : outputReady
          ? 'Ready — click Activate Broadcast to publish to players'
          : 'Connect YouTube ID (or MediaMTX) in Step 5 first',
    },
    {
      stepNumber: 7,
      key: 'end_next_match',
      title: 'End / Next Match',
      shortTitle: 'End / Next',
      state: stateFor(7, step7Done),
      detail: isEnded
        ? 'Ended cleanly · scores & history preserved'
        : 'End broadcast cleanly & start next match when finished',
    },
  ];
}
