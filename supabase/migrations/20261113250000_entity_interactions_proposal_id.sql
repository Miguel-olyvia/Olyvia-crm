-- Adds an optional link from entity_interactions to the proposal that originated
-- the interaction (e.g. a call registered from the Proposals page). Nullable:
-- the overwhelming majority of interactions do not originate from a proposal and
-- must keep working exactly as before.
alter table public.entity_interactions
  add column if not exists proposal_id uuid references public.proposals(id) on delete set null;

create index if not exists idx_entity_interactions_proposal_id
  on public.entity_interactions (proposal_id)
  where proposal_id is not null;
