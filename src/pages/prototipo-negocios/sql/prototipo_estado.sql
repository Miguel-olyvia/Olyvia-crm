-- 21/10/2026: o estado partilhado do protótipo de Negócios (dados de exemplo), para testar em live em vários aparelhos.
-- Uma tabela isolada: não é lida nem escrita pela app. Uma linha por parte do estado (global, cada negócio, inventário, frota) e por "sala".
create table if not exists public.prototipo_estado (
  sala text not null default 'principal' check (char_length(sala) between 1 and 40),
  chave text not null check (char_length(chave) between 1 and 60),
  dados jsonb not null,
  versao bigint not null,
  atualizado timestamptz not null default now(),
  primary key (sala, chave)
);
alter table public.prototipo_estado enable row level security;
drop policy if exists "prototipo ler" on public.prototipo_estado;
drop policy if exists "prototipo criar" on public.prototipo_estado;
drop policy if exists "prototipo mudar" on public.prototipo_estado;
create policy "prototipo ler" on public.prototipo_estado for select to anon, authenticated using (true);
create policy "prototipo criar" on public.prototipo_estado for insert to anon, authenticated with check (true);
create policy "prototipo mudar" on public.prototipo_estado for update to anon, authenticated using (true) with check (true);
grant select, insert, update on public.prototipo_estado to anon, authenticated;
comment on table public.prototipo_estado is 'Protótipo de Negócios (21/10/2026): estado partilhado de exemplo entre aparelhos. Isolado da app.';
