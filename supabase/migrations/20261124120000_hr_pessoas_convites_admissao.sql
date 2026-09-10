-- ==============================================================================
-- pessoas_convites_admissao -- o link de admissao sem conta. Molde:
-- client_contract_signature_tokens (SHA-256 em token_hash, valid_until,
-- used_at, attempts). Grants POR COLUNA: token_hash e rascunho NUNCA saem
-- para quem tem so hr.pessoas.view.
--
-- POR APLICAR.
--
--
-- -- O PROBLEMA ----------------------------------------------------------------
--
-- A admissao precisa de um caminho de escrita para dentro da ficha de uma
-- pessoa que ainda nao tem conta, de uma unica vez, sem criar identidade
-- permanente nenhuma. Um link com codigo proprio, uso unico, resolve isto sem
-- as memberships e o offboarding que uma conta obrigaria.
--
--
-- -- A REGRA NOVA --------------------------------------------------------------
--
-- Uma linha por convite; indice unico parcial garante um so convite VIVO por
-- pessoa (used_at IS NULL AND revoked_at IS NULL). O codigo em claro nunca e
-- guardado -- so o SHA-256 em token_hash.
--
-- Grants POR COLUNA (como pessoas_identificacao para o NISS): REVOKE ALL,
-- depois GRANT SELECT em todas as colunas EXCEPTO token_hash e rascunho.
-- rascunho contem, a meio do preenchimento, a resposta de sindicalizacao --
-- sem esta exclusao, qualquer pessoa com hr.pessoas.view leria dado do art.
-- 9.o por uma tabela de convites, com a permissao de sindicalizacao a valer
-- zero. O bloco de conferir usa pg_attribute.attacl, nunca
-- information_schema.column_privileges, e falha se alguma coluna que NAO seja
-- {token_hash, rascunho} ficar sem SELECT.
--
-- INSERT/UPDATE/DELETE bloqueados a authenticated por tres politicas
-- restritivas false: so as RPCs (20261124130000) escrevem, todas SECURITY
-- DEFINER.
--
--
-- -- O QUE FICA DE FORA --------------------------------------------------------
--
-- - Nenhuma permissao nova por esta migracao: usa hr.pessoas.view (SELECT) e
--   hr.pessoas.convite.enviar (RPC de criar, na migracao seguinte).
-- - Sem RPC de leitura do codigo em claro: nunca volta a sair depois de
--   gerado -- so o hash fica guardado.
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- DROP TABLE IF EXISTS public.pessoas_convites_admissao;
--
--
-- Prerequisitos:
--   20261120030000  pessoas (pessoas_id_org_key)
--   20261124010000  catalogo: hr.pessoas.convite.enviar
-- ==============================================================================

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
BEGIN
  IF to_regclass('public.pessoas') IS NULL THEN
    RAISE EXCEPTION 'public.pessoas nao existe. Aplicar 20261120030000 primeiro.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'pessoas_id_org_key' AND conrelid = 'public.pessoas'::regclass
  ) THEN
    RAISE EXCEPTION 'A unique pessoas_id_org_key nao existe; a FK composta desta tabela depende dela.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.anew_permissions WHERE code = 'hr.pessoas.convite.enviar') THEN
    RAISE EXCEPTION 'hr.pessoas.convite.enviar nao existe no catalogo. Aplicar 20261124010000 primeiro.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.anew_permissions WHERE code = 'hr.pessoas.view') THEN
    RAISE EXCEPTION 'hr.pessoas.view nao existe no catalogo. Aplicar 20261120020000 primeiro.';
  END IF;
END;
$guardas$;

-- ==============================================================================
-- pessoas_convites_admissao
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.pessoas_convites_admissao (
  id                     uuid NOT NULL DEFAULT gen_random_uuid(),
  pessoa_id              uuid NOT NULL,
  organization_id        uuid NOT NULL,

  token_hash             text NOT NULL,
  email_destino          text NOT NULL,
  valid_until            timestamptz NOT NULL,
  used_at                timestamptz,
  revoked_at             timestamptz,
  attempts               integer NOT NULL DEFAULT 0,
  rascunho               jsonb,
  assinatura_nome        text,
  assinatura_ip          inet,
  assinatura_user_agent  text,

  created_at             timestamptz NOT NULL DEFAULT now(),
  created_by             uuid,

  CONSTRAINT pessoas_convites_admissao_pkey PRIMARY KEY (id),
  CONSTRAINT pessoas_convites_admissao_token_hash_unica UNIQUE (token_hash),
  CONSTRAINT pessoas_convites_admissao_pessoa_fkey
    FOREIGN KEY (pessoa_id, organization_id)
    REFERENCES public.pessoas (id, organization_id) ON DELETE CASCADE,
  CONSTRAINT pessoas_convites_admissao_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES public.anew_users (id) ON DELETE SET NULL,
  CONSTRAINT pessoas_convites_admissao_attempts_nao_negativo
    CHECK (attempts >= 0),
  CONSTRAINT pessoas_convites_admissao_email_formato
    CHECK (email_destino ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')
);

COMMENT ON TABLE public.pessoas_convites_admissao IS
'Link de admissao sem conta -- molde de client_contract_signature_tokens. token_hash e o SHA-256 do codigo; o codigo em claro NUNCA e guardado. token_hash e rascunho tem grants POR COLUNA que excluem authenticated de SELECT -- ver a migracao que os define. So RPCs SECURITY DEFINER (rpc_hr_convite_admissao_criar/_estado/_submeter, 20261124130000) escrevem ou leem o conteudo completo.';
COMMENT ON COLUMN public.pessoas_convites_admissao.token_hash IS
'SHA-256 hex do codigo enviado por email. Sem SELECT para authenticated: um GRANT de tabela normal deixaria qualquer titular de hr.pessoas.view ler o hash e tentar forca-lo offline.';
COMMENT ON COLUMN public.pessoas_convites_admissao.rascunho IS
'Estado do preenchimento antes da submissao -- inclui a resposta de sindicalizacao a meio do processo. Sem SELECT para authenticated: e exactamente o dado de art. 9.o que hr.pessoas.sindicalizacao.view existe para controlar, e uma tabela de convites nao pode ser o atalho que o ignora.';

CREATE INDEX IF NOT EXISTS idx_pessoas_convites_admissao_pessoa_id
  ON public.pessoas_convites_admissao (pessoa_id);
CREATE INDEX IF NOT EXISTS idx_pessoas_convites_admissao_organization_id
  ON public.pessoas_convites_admissao (organization_id);

-- Um so convite VIVO por pessoa.
CREATE UNIQUE INDEX IF NOT EXISTS idx_pessoas_convites_admissao_um_vivo
  ON public.pessoas_convites_admissao (pessoa_id, organization_id)
  WHERE used_at IS NULL AND revoked_at IS NULL;

-- ---- Grants: tabela primeiro fechada, depois coluna a coluna --------------
REVOKE ALL ON TABLE public.pessoas_convites_admissao FROM anon;
REVOKE ALL ON TABLE public.pessoas_convites_admissao FROM authenticated;

GRANT SELECT (
  id, pessoa_id, organization_id,
  email_destino, valid_until, used_at, revoked_at, attempts,
  assinatura_nome, assinatura_ip, assinatura_user_agent,
  created_at, created_by
) ON TABLE public.pessoas_convites_admissao TO authenticated;

GRANT ALL ON TABLE public.pessoas_convites_admissao TO service_role;

ALTER TABLE public.pessoas_convites_admissao ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pessoas_convites_admissao_select ON public.pessoas_convites_admissao;
CREATE POLICY pessoas_convites_admissao_select ON public.pessoas_convites_admissao
  FOR SELECT TO authenticated
  USING ((SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.pessoas.view', organization_id)));

DROP POLICY IF EXISTS pessoas_convites_admissao_block_insert ON public.pessoas_convites_admissao;
CREATE POLICY pessoas_convites_admissao_block_insert ON public.pessoas_convites_admissao
  AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (false);

DROP POLICY IF EXISTS pessoas_convites_admissao_block_update ON public.pessoas_convites_admissao;
CREATE POLICY pessoas_convites_admissao_block_update ON public.pessoas_convites_admissao
  AS RESTRICTIVE FOR UPDATE TO authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS pessoas_convites_admissao_block_delete ON public.pessoas_convites_admissao;
CREATE POLICY pessoas_convites_admissao_block_delete ON public.pessoas_convites_admissao
  AS RESTRICTIVE FOR DELETE TO authenticated USING (false);

COMMENT ON POLICY pessoas_convites_admissao_select ON public.pessoas_convites_admissao IS
'Ve os convites (colunas nao-sensiveis, por grant de coluna) quem tem hr.pessoas.view NAQUELA organizacao. token_hash e rascunho ficam de fora mesmo para quem passa esta politica -- o fecho e por GRANT, nao por RLS, porque a RLS decide linhas e nao colunas.';

-- ---- Conferir --------------------------------------------------------------
DO $conferir$
DECLARE
  v_col_real text;
  v_excepcao text[] := ARRAY['token_hash','rascunho'];
  v_politicas integer;
BEGIN
  FOR v_col_real IN
    SELECT a.attname FROM pg_attribute a
    WHERE a.attrelid = 'public.pessoas_convites_admissao'::regclass
      AND a.attnum > 0 AND NOT a.attisdropped
  LOOP
    IF v_col_real = ANY (v_excepcao) THEN
      IF has_column_privilege('authenticated', 'public.pessoas_convites_admissao', v_col_real, 'SELECT') THEN
        RAISE EXCEPTION 'authenticated consegue ler %, que devia estar excluida por grant de coluna.', v_col_real;
      END IF;
      CONTINUE;
    END IF;

    IF NOT has_column_privilege('authenticated', 'public.pessoas_convites_admissao', v_col_real, 'SELECT') THEN
      RAISE EXCEPTION
        'A coluna % de pessoas_convites_admissao nao tem SELECT concedido a authenticated, e nao esta na lista de excepcao {token_hash, rascunho}. Uma coluna nova ficou invisivel em silencio.',
        v_col_real;
    END IF;
  END LOOP;

  IF has_table_privilege('authenticated', 'public.pessoas_convites_admissao', 'INSERT')
     OR has_table_privilege('authenticated', 'public.pessoas_convites_admissao', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.pessoas_convites_admissao', 'DELETE') THEN
    RAISE EXCEPTION 'authenticated tem INSERT, UPDATE ou DELETE de tabela em pessoas_convites_admissao -- a escrita tem de passar so pelas RPCs SECURITY DEFINER.';
  END IF;

  SELECT count(*) INTO v_politicas FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'pessoas_convites_admissao';

  IF v_politicas <> 4 THEN
    RAISE EXCEPTION 'Esperavam-se 4 politicas em pessoas_convites_admissao, encontraram-se %.', v_politicas;
  END IF;

  RAISE NOTICE 'OK: pessoas_convites_admissao criada, token_hash e rascunho fechados por grant de coluna, escrita 100%% fechada a authenticated, 4 politicas.';
END;
$conferir$;

-- ==============================================================================
-- ANTES DO db push
--
-- 1. So cria objecto novo; nenhuma tabela ou politica existente e alterada --
--    sem janela de estado defeituoso na base partilhada.
-- 2. Esta migracao NAO cria as RPCs que escrevem/leem a tabela -- vao em
--    20261124130000, que tem de ir a seguir na fila (sem elas, a tabela fica
--    sem caminho de escrita nenhum, o que e seguro mas inutil).
-- ==============================================================================
