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


-- Semantic search columns (run once if not already present)
alter table transcripts add column if not exists embedding vector(384);
alter table transcripts add column if not exists tags text[] default '{}';
alter table transcripts add column if not exists action_items jsonb default '[]';

-- HNSW index for fast cosine similarity search
create index if not exists idx_transcripts_embedding
  on transcripts using hnsw (embedding vector_cosine_ops);

-- Search logs table
create table if not exists search_logs (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references auth.users(id) on delete cascade not null,
  query        text not null,
  mode         text not null,
  result_count int not null,
  latency_ms   int not null,
  created_at   timestamptz default now() not null
);

alter table search_logs enable row level security;

create policy "search_logs: user isolation"
  on search_logs for all
  using  (user_id = auth.uid())
  with check (user_id = auth.uid());


-- Semantic search function
create or replace function search_transcripts_semantic(
  p_user_id  uuid,
  p_embedding vector(384),
  p_limit    int default 3
)
returns table(id uuid, title text, content text, created_at timestamptz, similarity real)
language sql stable
as $$
  select
    id, title, content, created_at,
    1 - (embedding <=> p_embedding) as similarity
  from transcripts
  where user_id = p_user_id
    and embedding is not null
  order by embedding <=> p_embedding
  limit p_limit;
$$;


-- Hybrid RRF search function (full-text + semantic via Reciprocal Rank Fusion)
create or replace function search_transcripts_hybrid(
  p_user_id  uuid,
  p_query    text,
  p_embedding vector(384),
  p_limit    int default 5
)
returns table(id uuid, title text, content text, created_at timestamptz, score real)
language sql stable
as $$
  with fts as (
    select id,
      row_number() over (order by ts_rank(
        to_tsvector('english', title || ' ' || content),
        plainto_tsquery('english', p_query)
      ) desc) as rank
    from transcripts
    where user_id = p_user_id
      and to_tsvector('english', title || ' ' || content)
          @@ plainto_tsquery('english', p_query)
    limit 20
  ),
  sem as (
    select id,
      row_number() over (order by embedding <=> p_embedding) as rank
    from transcripts
    where user_id = p_user_id
      and embedding is not null
    limit 20
  ),
  combined as (
    select
      coalesce(fts.id, sem.id) as id,
      coalesce(1.0 / (60 + fts.rank), 0)::real +
      coalesce(1.0 / (60 + sem.rank), 0)::real as rrf_score
    from fts full outer join sem on fts.id = sem.id
  )
  select t.id, t.title, t.content, t.created_at, c.rrf_score as score
  from combined c
  join transcripts t on t.id = c.id
  order by c.rrf_score desc
  limit p_limit;
$$;


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
