-- 日文單字練習 App：Supabase 資料表與 Row Level Security
-- 用法：Supabase 後台 → SQL Editor → New query → 貼上整份 → Run（可重複執行）
--
-- 設計：
--   每個資料表都存「整筆資料」在 data (jsonb)，另外拉出同步需要的欄位。
--   主鍵是 (user_id, id)：不同使用者匯入同一個單字會得到相同的決定性 id，不能互相衝突。
--   synced_at 由伺服器在寫入時設定，App 用它當「上次同步到哪裡」的游標（不受各裝置時鐘誤差影響）。
--   lww_guard trigger：較舊的 updated_at 不會覆蓋較新的資料（Last-Write-Wins）；作答紀錄只新增不修改。

create or replace function public.lww_guard() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' then
    if tg_table_name = 'review_logs' then
      return null; -- 作答紀錄只新增不修改
    end if;
    if new.updated_at < old.updated_at then
      return null; -- 較舊的寫入不覆蓋較新的
    end if;
  end if;
  new.synced_at := clock_timestamp();
  return new;
end $$;

do $$
declare
  t text;
begin
  foreach t in array array['decks', 'words', 'deck_entries', 'cards', 'review_logs', 'settings'] loop
    execute format($f$
      create table if not exists public.%1$I (
        user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
        id         text        not null,
        data       jsonb       not null,
        updated_at timestamptz not null,
        deleted    boolean     not null default false,
        synced_at  timestamptz not null default clock_timestamp(),
        primary key (user_id, id)
      );
      create index if not exists %1$s_sync_idx on public.%1$I (user_id, synced_at);

      alter table public.%1$I enable row level security;

      drop policy if exists "own rows select" on public.%1$I;
      drop policy if exists "own rows insert" on public.%1$I;
      drop policy if exists "own rows update" on public.%1$I;
      create policy "own rows select" on public.%1$I for select using (auth.uid() = user_id);
      create policy "own rows insert" on public.%1$I for insert with check (auth.uid() = user_id);
      create policy "own rows update" on public.%1$I for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
      -- 不開放 delete：App 一律用軟刪除（deleted = true）同步到其他裝置

      drop trigger if exists %1$s_lww on public.%1$I;
      create trigger %1$s_lww before insert or update on public.%1$I
        for each row execute function public.lww_guard();
    $f$, t);
  end loop;
end $$;
