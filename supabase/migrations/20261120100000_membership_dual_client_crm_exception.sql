-- Reposto a partir do historico da base (supabase_migrations.schema_migrations)
-- em 2026-09-09: esta migration estava aplicada no remoto sem ficheiro no
-- repositorio (aplicada por outra sessao/branch), o que impedia qualquer
-- 'db push' e faria uma base reconstruida do zero sair diferente da de
-- producao. O SQL abaixo e o que correu de facto.

-- ============================================================================
-- Excecao: permitir que o MESMO utilizador tenha, na MESMA organizacao, uma
-- membership de CRM (role != client) E uma membership de cliente (role =
-- client) em simultaneo.
--
-- Ate aqui a constraint anew_memberships_user_org_unique UNIQUE (user_id,
-- organization_id) so deixava existir UMA linha por (user, org), o que impedia
-- um utilizador de ser, ao mesmo tempo, colaborador do CRM e cliente da mesma
-- organizacao.
--
-- Nova regra (forward-only; nao edita migracoes anteriores):
--   - no maximo UMA membership client por (user, org)
--   - no maximo UMA membership nao-client por (user, org)
--   => um par (user, org) pode ter, no limite, duas linhas: uma client + uma
--      nao-client.
--
-- O papel "client" NAO e identificado por UUID no schema (os UUIDs de role
-- diferem entre organizacoes e ambientes). Em vez disso mantemos uma coluna
-- booleana derivada `role_is_client`, alimentada por trigger a partir de
-- anew_roles.code = 'client', e dois indices unicos parciais sobre ela.
--
-- Nota: idx_anew_memberships_unique_active UNIQUE (user_id, organization_id,
-- role_id) WHERE status='active' ja impedia duplicar a MESMA role activa; esta
-- migracao nao mexe nisso. A unica coisa que bloqueava client+crm era a
-- constraint (user_id, organization_id), removida abaixo.
-- ============================================================================

-- ── 1. Coluna derivada ──────────────────────────────────────────────────────
ALTER TABLE public.anew_memberships
  ADD COLUMN IF NOT EXISTS role_is_client boolean NOT NULL DEFAULT false;

-- ── 2. Trigger que mantem role_is_client a partir do code da role ────────────
-- Recalcula em TODOS os INSERT/UPDATE (nao so quando role_id muda) para que a
-- coluna nao possa ser falsificada por um UPDATE que escreva role_is_client
-- directamente sem tocar em role_id.
CREATE OR REPLACE FUNCTION public.tg_anew_memberships_set_role_is_client()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  NEW.role_is_client := COALESCE(
    (SELECT r.code = 'client' FROM public.anew_roles r WHERE r.id = NEW.role_id),
    false
  );
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS anew_memberships_set_role_is_client ON public.anew_memberships;

CREATE TRIGGER anew_memberships_set_role_is_client
  BEFORE INSERT OR UPDATE ON public.anew_memberships
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_anew_memberships_set_role_is_client();

-- ── 3. Backfill da coluna para as linhas existentes ──────────────────────────
UPDATE public.anew_memberships m
SET role_is_client = COALESCE(
      (SELECT r.code = 'client' FROM public.anew_roles r WHERE r.id = m.role_id),
      false
    )
WHERE m.role_is_client IS DISTINCT FROM COALESCE(
      (SELECT r.code = 'client' FROM public.anew_roles r WHERE r.id = m.role_id),
      false
    );

-- ── 4. Remover a constraint que bloqueava a coexistencia ─────────────────────
ALTER TABLE public.anew_memberships
  DROP CONSTRAINT IF EXISTS anew_memberships_user_org_unique;

-- ── 5. Dois indices unicos parciais ──────────────────────────────────────────
-- No maximo uma membership client por (user, org).
CREATE UNIQUE INDEX IF NOT EXISTS anew_memberships_user_org_client_unique
  ON public.anew_memberships (user_id, organization_id)
  WHERE role_is_client;

-- No maximo uma membership nao-client por (user, org).
CREATE UNIQUE INDEX IF NOT EXISTS anew_memberships_user_org_nonclient_unique
  ON public.anew_memberships (user_id, organization_id)
  WHERE NOT role_is_client;

