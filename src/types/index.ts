export type {
  ProfileAnalysis,
  ProfileDraft,
  ProfileLevel,
  ProfileScore,
  SessionUser,
  StoredProfile,
  UserProfile,
  UserRole,
  AuthUserData,
} from '@/types/profile';

export type {
  ChatMessage,
  SimulationEvent,
  SimulationEventType,
  SimulationEventStatus,
  SimulationStatus,
  SimulationRole,
  ScenarioId,
  ScenarioState,
  ScenarioConfig,
  ChaosEventTemplate,
  SimulationContext,
  SimulationSession,
  SendMessageResult,
  ChaosTriggerResult,
  GeminiConfig,
  AIServiceError,
  AIErrorCode,
  AIResult,
  MessageRole,
} from '@/types/ai';

export type FirebaseStatus = 'loading' | 'ready' | 'unconfigured';

export interface AuthState {
  readonly status: FirebaseStatus;
  readonly user: import('@/types/profile').SessionUser | null;
}
