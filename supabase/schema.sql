-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New query)

-- Transcripts table
create table if not exists transcripts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete cascade not null,
  title       text not null default 'Untitled',
  content     text not null,
  created_at  timestamptz default now() not null
);

-- Index for per-user history queries
create index if not exists idx_transcripts_user_created
  on transcripts(user_id, created_at desc);

-- Index for full-text search
create index if not exists idx_transcripts_fts
  on transcripts using gin(to_tsvector('english', title || ' ' || content));

-- Row-level security: users can only touch their own rows
alter table transcripts enable row level security;

create policy "transcripts: user isolation"
  on transcripts for all
  using  (user_id = auth.uid())
  with check (user_id = auth.uid());


-- Chat sessions table
create table if not exists chat_sessions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete cascade not null,
  title       text not null default 'Untitled Chat',
  messages    jsonb not null default '[]'::jsonb,
  created_at  timestamptz default now() not null,
  updated_at  timestamptz default now() not null
);

-- Index for per-user session list (sorted by most recent)
create index if not exists idx_chat_sessions_user_updated
  on chat_sessions(user_id, updated_at desc);

-- Row-level security
alter table chat_sessions enable row level security;

create policy "chat_sessions: user isolation"
  on chat_sessions for all
  using  (user_id = auth.uid())
  with check (user_id = auth.uid());


-- Full-text search function (called from backend with service role key)
create or replace function search_transcripts(
  p_user_id uuid,
  p_query   text,
  p_limit   int default 5
)
returns table(id uuid, title text, content text, created_at timestamptz, rank real)
language sql stable
as $$
  select
    id, title, content, created_at,
    ts_rank(
      to_tsvector('english', title || ' ' || content),
      plainto_tsquery('english', p_query)
    ) as rank
  from transcripts
  where user_id = p_user_id
    and to_tsvector('english', title || ' ' || content)
        @@ plainto_tsquery('english', p_query)
  order by rank desc
  limit p_limit;
$$;
