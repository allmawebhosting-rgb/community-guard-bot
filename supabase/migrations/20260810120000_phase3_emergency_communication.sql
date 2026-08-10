-- Phase 3: in-app emergency communication.
-- Voice is intentionally provider-neutral. No call is represented as real until
-- a server-issued voice session is created by a configured provider.

create table if not exists public.emergency_calls (
  id uuid primary key default gen_random_uuid(),
  sos_session_id uuid,
  caller_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  call_type text not null default 'emergency_assistance',
  status text not null default 'pending' check (status in ('pending','calling','ringing','accepted','declined','no_answer','busy','connected','failed','ended')),
  provider_mode text not null default 'demo' check (provider_mode in ('demo','webrtc')),
  started_at timestamptz,
  ringing_at timestamptz,
  accepted_at timestamptz,
  connected_at timestamptz,
  ended_at timestamptz,
  duration integer,
  failure_reason text,
  created_at timestamptz not null default now()
);

create table if not exists public.call_sessions (
  id uuid primary key default gen_random_uuid(),
  emergency_call_id uuid not null references public.emergency_calls(id) on delete cascade,
  webrtc_session_id text,
  status text not null default 'connecting' check (status in ('connecting','ringing','connected','reconnecting','poor_connection','disconnected','ended')),
  created_at timestamptz not null default now()
);

create table if not exists public.responder_assignments (
  id uuid primary key default gen_random_uuid(),
  sos_session_id uuid,
  responder_id uuid not null references auth.users(id) on delete cascade,
  assignment_type text not null default 'community_responder',
  status text not null default 'assigned' check (status in ('assigned','accepted','en_route','arrived','assisting','need_official_help','completed','unable_to_continue','cancelled')),
  priority integer not null default 0,
  distance numeric,
  assigned_at timestamptz not null default now(),
  accepted_at timestamptz,
  arrived_at timestamptz,
  completed_at timestamptz,
  notes text
);

create table if not exists public.emergency_escalations (
  id uuid primary key default gen_random_uuid(),
  sos_session_id uuid,
  from_state text,
  to_state text not null,
  reason text,
  created_at timestamptz not null default now()
);

create table if not exists public.emergency_chat_events (
  id uuid primary key default gen_random_uuid(),
  sos_session_id uuid,
  author_id uuid references auth.users(id) on delete set null,
  event_type text not null check (event_type in ('user_message','ai_message','system_event','official_notification')),
  body text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.emergency_audit_events (
  id uuid primary key default gen_random_uuid(),
  sos_session_id uuid,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null check (action in ('call_initiated','call_accepted','call_declined','call_failed','responder_assigned','location_shared','location_stopped','emergency_escalated','emergency_closed')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists emergency_calls_participants_idx on public.emergency_calls(caller_id, recipient_id, created_at desc);
create index if not exists responder_assignments_responder_idx on public.responder_assignments(responder_id, status);
create index if not exists emergency_chat_events_session_idx on public.emergency_chat_events(sos_session_id, created_at);

alter table public.emergency_calls enable row level security;
alter table public.call_sessions enable row level security;
alter table public.responder_assignments enable row level security;
alter table public.emergency_escalations enable row level security;
alter table public.emergency_chat_events enable row level security;
alter table public.emergency_audit_events enable row level security;

create policy "participants can view emergency calls"
  on public.emergency_calls for select to authenticated
  using (auth.uid() = caller_id or auth.uid() = recipient_id);

create policy "participants can view call sessions"
  on public.call_sessions for select to authenticated
  using (exists (
    select 1 from public.emergency_calls c
    where c.id = emergency_call_id and (c.caller_id = auth.uid() or c.recipient_id = auth.uid())
  ));

create policy "participants can view assignments"
  on public.responder_assignments for select to authenticated
  using (
    auth.uid() = responder_id
    or exists (
      select 1
      from public.safety_activity activity
      where activity.id = sos_session_id
        and activity.user_id = auth.uid()
    )
  );

create policy "participants can view emergency chat"
  on public.emergency_chat_events for select to authenticated
  using (
    auth.uid() = author_id
    or exists (
      select 1
      from public.safety_activity activity
      where activity.id = sos_session_id
        and activity.user_id = auth.uid()
    )
  );

-- Writes and participant fan-out should be performed by authenticated server
-- functions after validating the SOS session and responder permissions.
