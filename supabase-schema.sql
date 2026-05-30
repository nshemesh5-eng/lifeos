-- Run in Supabase SQL Editor

-- Tasks
create table if not exists tasks (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  title text not null,
  description text,
  category text default 'personal', -- personal, work, health, finance
  priority text default 'medium',   -- high, medium, low
  done boolean default false,
  due_date date,
  created_at timestamptz default now()
);
alter table tasks enable row level security;
create policy "tasks_user" on tasks using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Habits
create table if not exists habits (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  emoji text default '✓',
  color text default '#14B8A6',
  active boolean default true,
  created_at timestamptz default now()
);
alter table habits enable row level security;
create policy "habits_user" on habits using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Habit logs
create table if not exists habit_logs (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  habit_id uuid references habits(id) on delete cascade not null,
  date date not null,
  created_at timestamptz default now(),
  unique(habit_id, date)
);
alter table habit_logs enable row level security;
create policy "habit_logs_user" on habit_logs using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Reminders
create table if not exists reminders (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  title text not null,
  time_of_day text,        -- HH:MM
  frequency text,          -- daily, weekly, monthly, custom
  day_of_week integer,     -- 0-6 for weekly
  day_of_month integer,    -- 1-31 for monthly
  active boolean default true,
  last_sent date,
  created_at timestamptz default now()
);
alter table reminders enable row level security;
create policy "reminders_user" on reminders using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Workouts
create table if not exists workouts (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  date date not null,
  type text,               -- chest, back, legs, etc.
  notes text,
  duration_min integer,
  created_at timestamptz default now()
);
alter table workouts enable row level security;
create policy "workouts_user" on workouts using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Workout sets
create table if not exists workout_sets (
  id uuid default gen_random_uuid() primary key,
  workout_id uuid references workouts(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  exercise text not null,
  sets integer,
  reps integer,
  weight_kg numeric(6,2),
  created_at timestamptz default now()
);
alter table workout_sets enable row level security;
create policy "workout_sets_user" on workout_sets using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Investments
create table if not exists investments (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  ticker text,
  category text,           -- stocks, etf, crypto, real_estate, other
  amount_invested numeric(14,2),
  current_value numeric(14,2),
  currency text default 'ILS',
  updated_at timestamptz default now(),
  created_at timestamptz default now()
);
alter table investments enable row level security;
create policy "investments_user" on investments using (auth.uid() = user_id) with check (auth.uid() = user_id);
