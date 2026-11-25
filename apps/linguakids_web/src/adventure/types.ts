export interface StudentProfile {
  id: string;
  nickname: string;
  grade_level: number;
  avatar_key?: string;
  preferences?: { sound?: boolean; reduced_motion?: boolean; language?: string };
}
export type ConnectionStatus = 'online' | 'offline-collection' | 'offline' | 'awaiting-scoring';
export interface MissionBadge {
  id:string;title:string;difficulty:'beginner'|'intermediate'|'advanced';grade_level:number;
  awarded_at:string;verification:'verified'|'local_pending_verification'|'preview';
}
export interface RankingEntry {
  alias:string;rank:number|null;tied:boolean;completed_missions:number;assigned_missions:number;
  completion_percent:number;placement_review_required:boolean;is_you?:boolean;
}
export interface MissionRewards extends RankingEntry {
  grade_level:number;source:'cloud_verified'|'local_pending_verification'|'preview';
  class_size:number;earned_count:number;mission_badges:MissionBadge[];is_demo:boolean;
  milestones:{id:string;target:number;earned:boolean;progress:number}[];
  ranking_basis:'completed_missions_then_assigned_percent';leaderboard?:RankingEntry[];
}
export type StepStatus = 'locked' | 'current' | 'completed' | 'needs_review' | 'pending_online_scoring' | 'not-assigned';
export interface AdventureStep {
  id: string;
  material_id: string;
  material_version: number;
  title: string;
  kind: 'lesson' | 'dictionary' | 'vocabulary' | 'game' | 'story' | 'quiz';
  mode?: 'matching' | 'word-builder';
  status: StepStatus;
  score?: { correct: number; total: number } | null;
  reading_checked?: number;
  reading_total?: number;
  teacher_approved?: boolean;
}
export interface MapStage {
  id: string;
  title: string;
  subtitle: string;
  status: 'locked' | 'active' | 'completed' | 'not-assigned';
  difficulty?: 'beginner' | 'intermediate' | 'advanced';
  steps: AdventureStep[];
  completed: number;
  total: number;
}
export interface AdventureState {
  revision: number;
  stages: MapStage[];
  current_step_id: string | null;
  quiz_pass_percent: 80;
  placement?: {approved_stage_id:string;selected_stage_id:string;can_choose_start:boolean;requires_review:boolean;maximum_start_index:number|null}|null;
}

/** Public design vocabulary; these retain the existing backend contracts. */
export type StoryStage = MapStage;
export type ConnectionMode = ConnectionStatus;
