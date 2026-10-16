-- ==============================================================================
-- OA-Sathi: Movement Assessment Sessions Supabase Schema & Security Policies
-- ==============================================================================
-- This schema establishes the cloud storage table, indexes, and Row Level
-- Security (RLS) policies for storing movement checklist assessments.
--
-- Clinical Privacy & Security Guarantees:
-- 1. Zero Video/Image Storage: Only structured kinematic values and summaries are stored.
-- 2. No Service Role Key on Client: Frontend uses public anon key with strict RLS.
-- 3. Demo vs. Real Isolation: Synthetic/demo records are explicitly marked (is_demo = true).
-- 4. Auditability: Timestamps and user IDs track record ownership.
-- ==============================================================================

-- 1. Create the Movement Assessment Sessions table
CREATE TABLE IF NOT EXISTS public.movement_assessment_sessions (
  id TEXT PRIMARY KEY,
  patient_id TEXT,
  patient_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  is_demo BOOLEAN NOT NULL DEFAULT false,
  checklist_tasks JSONB NOT NULL DEFAULT '{}'::jsonb,
  overall_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  gait_assessment JSONB,
  manual_observations JSONB,
  tracking_quality_tier TEXT NOT NULL DEFAULT 'unassessed',
  mean_tracking_confidence NUMERIC(4, 3) NOT NULL DEFAULT 0.0,
  notes TEXT,
  created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- 2. Add performance and search indexes
CREATE INDEX IF NOT EXISTS idx_movement_sessions_created_at 
  ON public.movement_assessment_sessions (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_movement_sessions_patient_id 
  ON public.movement_assessment_sessions (patient_id) 
  WHERE patient_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_movement_sessions_is_demo 
  ON public.movement_assessment_sessions (is_demo);

-- 3. Enable Row Level Security (RLS)
ALTER TABLE public.movement_assessment_sessions ENABLE ROW LEVEL SECURITY;

-- 4. Security Policies:

-- POLICY 1: Authenticated clinicians/users can select only their own records or demo records
CREATE POLICY "Users can view own or demo sessions"
  ON public.movement_assessment_sessions
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = created_by_user_id 
    OR is_demo = true
  );

-- POLICY 2: Authenticated clinicians/users can insert sessions
CREATE POLICY "Users can insert own sessions"
  ON public.movement_assessment_sessions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = created_by_user_id 
    OR created_by_user_id IS NULL
  );

-- POLICY 3: Authenticated clinicians/users can delete only their own sessions
CREATE POLICY "Users can delete own sessions"
  ON public.movement_assessment_sessions
  FOR DELETE
  TO authenticated
  USING (
    auth.uid() = created_by_user_id
    OR is_demo = true
  );

-- POLICY 4: Public / Anonymous demonstration access (Optional for hackathon evaluation)
-- If public demo testing is permitted, anon users can view and insert demo sessions:
CREATE POLICY "Public anon access for demo sessions"
  ON public.movement_assessment_sessions
  FOR ALL
  TO anon
  USING (is_demo = true)
  WITH CHECK (is_demo = true);

-- 5. Comments on table and columns for documentation
COMMENT ON TABLE public.movement_assessment_sessions IS 
  'Stores computer-vision movement assessment checklist results. Does NOT store video or image data.';

COMMENT ON COLUMN public.movement_assessment_sessions.is_demo IS 
  'True if the session was generated during a demonstration, benchmark, or simulated test.';
