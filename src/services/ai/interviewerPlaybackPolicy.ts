export type InterviewerPlaybackRoute = 'wait' | 'avatar-tts' | 'browser-fallback' | 'unavailable' | 'silent';
export type InterviewerAvatarState = 'idle' | 'connecting' | 'connected' | 'speaking' | 'error' | 'disconnected';

export interface InterviewerPlaybackConditions {
  hasActiveSession: boolean;
  requiresLiveAvatar: boolean;
  avatarState: InterviewerAvatarState;
  isVideoReady: boolean;
  ttsEnabled: boolean;
  browserTtsAvailable: boolean;
  muted: boolean;
}

export function selectInterviewerPlaybackRoute(
  conditions: InterviewerPlaybackConditions,
): InterviewerPlaybackRoute {
  if (!conditions.hasActiveSession || conditions.muted) return 'silent';

  if (conditions.requiresLiveAvatar) {
    if (conditions.avatarState === 'error' || conditions.avatarState === 'disconnected') {
      return 'unavailable';
    }

    const avatarReady =
      conditions.isVideoReady &&
      (conditions.avatarState === 'connected' || conditions.avatarState === 'speaking');
    if (!avatarReady) return 'wait';
    return conditions.ttsEnabled ? 'avatar-tts' : 'unavailable';
  }

  return conditions.browserTtsAvailable ? 'browser-fallback' : 'silent';
}
