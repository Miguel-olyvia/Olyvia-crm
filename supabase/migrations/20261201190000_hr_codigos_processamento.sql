-- ==============================================================================
-- hr_codigos_processamento -- o catalogo de codigos de processamento salarial.
--
-- POR APLICAR.
--
--
-- -- O PROBLEMA ----------------------------------------------------------------
--
-- O contrato de uma pessoa (pessoas_retribuicoes) so guarda o valor BASE do
-- vencimento. Horas extraordinarias, situacoes pagas a 100% (fins-de-semana e
-- feriados), recibos verdes e horas nocturnas precisam de um CODIGO DE
-- PROCESSAMENTO para serem reportadas ao processamento salarial -- e esses
-- codigos ainda nao tem tabela nenhuma.
--
-- Contexto dado pelo utilizador, verbatim: "Os codigos actualmente em uso sao
-- transversais a todas as empresas do grupo: o codigo 200 aplica-se a
-- situacoes pagas a 100% (fins de semana e feriados) e o codigo 100
-- corresponde a horas extraordinarias pagas ao valor da hora normal. Sugiro a
-- criacao de dois novos codigos: um para recibos verdes e outro para horas
-- nocturnas, que por si deve ser configuravel por empresa."
--
--
-- -- A REGRA NOVA ----------------------------------------------------------------
--
-- SO O CATALOGO/CONFIGURACAO. NENHUM CALCULO NESTA MIGRACAO -- o calculo
-- ligado a assiduidade (quantas horas de cada codigo uma pessoa fez num
-- periodo) fica para depois, confirmado com o utilizador.
--
-- organization_id NULL = codigo TRANSVERSAL, partilhado por todo o grupo (os
-- dois codigos ja em uso, 100 e 200, semeados mais abaixo). organization_id
-- preenchido = codigo PROPRIO de uma organizacao (os codigos novos --
-- "configuravel por empresa" quer dizer que cada organizacao decide se quer
-- criar o seu proprio codigo de recibos verdes ou de horas nocturnas; por
-- isso NAO se semeia nenhum codigo novo aqui, so os dois transversais).
--
-- Leitura: hr.vencimento.codigos.view, ve os transversais e os proprios da
-- SUA organizacao. Escrita (INSERT/UPDATE): hr.vencimento.codigos.gerir, SO
-- em linhas com organization_id preenchido e igual a organizacao de quem
-- escreve -- nenhuma organizacao pode criar, editar nem desactivar um codigo
-- transversal (organization_id IS NULL). DELETE bloqueado, MESMO PADRAO de
-- pessoas_documentos_modelos (20261123020000): um codigo em uso nao se
-- apaga, desactiva-se (activo=false).
--
--
-- -- PORQUE A LEITURA DOS TRANSVERSAIS NAO USA has_anew_permission_in_org -------
--
-- has_anew_permission_in_org exige um organization_id concreto para
-- verificar a membership -- com organization_id IS NULL (um codigo
-- transversal nao pertence a organizacao nenhuma) devolveria sempre false,
-- escondendo 100 e 200 de todos. Por isso a policy de SELECT usa
-- has_anew_permission_in_org so quando organization_id IS NOT NULL, e cai
-- para has_anew_permission (SEM organizacao -- "tem esta permissao em
-- QUALQUER organizacao onde seja membro activo") quando organization_id IS
-- NULL: um codigo partilhado por todo o grupo fica visivel a quem tiver a
-- permissao em qualquer das suas organizacoes, sem revelar nada de outra
-- organizacao (os proprios continuam a exigir a organizacao certa).
--
--
-- -- DOIS INDICES PARCIAIS, NAO UM UNIQUE(organization_id, codigo) --------------
--
-- Um UNIQUE(organization_id, codigo) normal NAO chegaria: o Postgres trata
-- cada NULL como distinto de outro NULL num indice unico, por isso dois
-- codigos transversais com o MESMO texto (organization_id NULL, codigo
-- '100' duas vezes) passariam sem violar nada. Por isso dois indices
-- parciais: um unico em codigo SO para organization_id IS NULL (os
-- transversais nunca colidem entre si), outro unico em (organization_id,
-- codigo) SO para organization_id IS NOT NULL (cada organizacao nao repete
-- o seu proprio codigo, mas PODE reutilizar o mesmo texto de codigo que
-- outra organizacao ja usa para outra coisa -- os catalogos delas sao
-- independentes).
--
--
-- -- O QUE FICA DE FORA, DE PROPOSITO -------------------------------------------
--
-- - Nenhum calculo, nenhuma ligacao a assiduidade ou a picagens.
-- - Nenhum codigo novo semeado (recibos verdes, horas nocturnas) -- ficam
--   por criar pelo ecra, organizacao a organizacao, so quando quiserem.
-- - Nenhuma atribuicao das permissoes hr.vencimento.codigos.* a papel
--   nenhum (20261201180000).
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- Sem ficheiro de reversao nesta pasta, de proposito. A mao:
--   DROP TABLE IF EXISTS public.hr_codigos_processamento;
--
--
-- Prerequisitos:
--   20261120010000  has_anew_permission_in_org
--   20260622114000  has_anew_permission (sem organizacao)
--   20261201180000  catalogo hr.vencimento.codigos.view/.gerir
-- ==============================================================================

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'has_anew_permission_in_org' AND p.pronargs = 3
  ) THEN
    RAISE EXCEPTION 'public.has_anew_permission_in_org(uuid,text,uuid) nao existe. Aplicar 20261120010000 primeiro.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'has_anew_permission' AND p.pronargs = 2
  ) THEN
    RAISE EXCEPTION 'public.has_anew_permission(uuid,text) nao existe. Aplicar 20260622114000 primeiro.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.anew_permissions WHERE code = 'hr.vencimento.codigos.view') THEN
    RAISE EXCEPTION 'hr.vencimento.codigos.view nao esta no catalogo. Aplicar 20261201180000 primeiro.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.anew_permissions WHERE code = 'hr.vencimento.codigos.gerir') THEN
    RAISE EXCEPTION 'hr.vencimento.codigos.gerir nao esta no catalogo. Aplicar 20261201180000 primeiro.';
  END IF;

  IF to_regclass('public.anew_organizations') IS NULL THEN
    RAISE EXCEPTION 'public.anew_organizations nao existe.';
  END IF;

  IF to_regclass('public.hr_codigos_processamento') IS NOT NULL THEN
    RAISE EXCEPTION 'public.hr_codigos_processamento ja existe -- investigar antes de aplicar.';
  END IF;
END;
$guardas$;

-- ==============================================================================
-- 1. A tabela
-- ==============================================================================
CREATE TABLE public.hr_codigos_processamento (
  id              uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid,

  codigo          text NOT NULL,
  nome            text NOT NULL,
  descricao       text,
  activo          boolean NOT NULL DEFAULT true,

  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  updated_by      uuid,

  CONSTRAINT hr_codigos_processamento_pkey PRIMARY KEY (id),
  CONSTRAINT hr_codigos_processamento_org_fkey
    FOREIGN KEY (organization_id) REFERENCES public.anew_organizations (id) ON DELETE CASCADE,
  CONSTRAINT hr_codigos_processamento_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES public.anew_users (id) ON DELETE SET NULL,
  CONSTRAINT hr_codigos_processamento_updated_by_fkey
    FOREIGN KEY (updated_by) REFERENCES public.anew_users (id) ON DELETE SET NULL,

  CONSTRAINT hr_codigos_processamento_codigo_nao_vazio CHECK (btrim(codigo) <> ''),
  CONSTRAINT hr_codigos_processamento_nome_nao_vazio CHECK (btrim(nome) <> '')
);

COMMENT ON TABLE public.hr_codigos_processamento IS
'Catalogo de codigos de processamento salarial. organization_id NULL = codigo TRANSVERSAL, partilhado por todo o grupo (100 = horas extraordinarias ao valor normal, 200 = situacoes pagas a 100%, ambos semeados por esta migracao). organization_id preenchido = codigo PROPRIO dessa organizacao (ex.: recibos verdes, horas nocturnas -- nenhum semeado, ficam por criar pelo ecra). SO CATALOGO: sem calculo nenhum ligado a assiduidade nesta versao.';
COMMENT ON COLUMN public.hr_codigos_processamento.organization_id IS
'NULL = transversal a todo o grupo. Preenchido = codigo proprio dessa organizacao. Nunca se muda depois de criado (nao ha UPDATE desta coluna previsto no ecra).';
COMMENT ON COLUMN public.hr_codigos_processamento.activo IS
'Um codigo em uso nunca se apaga -- so se desactiva. Ver a politica RESTRICTIVE de DELETE mais abaixo.';

-- Dois indices parciais -- ver o porque no cabecalho desta migracao.
CREATE UNIQUE INDEX hr_codigos_processamento_transversal_codigo_key
  ON public.hr_codigos_processamento (codigo)
  WHERE organization_id IS NULL;

CREATE UNIQUE INDEX hr_codigos_processamento_org_codigo_key
  ON public.hr_codigos_processamento (organization_id, codigo)
  WHERE organization_id IS NOT NULL;

CREATE INDEX idx_hr_codigos_processamento_organization_id
  ON public.hr_codigos_processamento (organization_id);

DROP TRIGGER IF EXISTS trg_hr_codigos_processamento_updated_at ON public.hr_codigos_processamento;
CREATE TRIGGER trg_hr_codigos_processamento_updated_at
  BEFORE UPDATE ON public.hr_codigos_processamento
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- REVOKE ALL a authenticated ANTES do GRANT -- os privilegios por omissao do
-- Supabase deixam DELETE/TRUNCATE/REFERENCES/TRIGGER em cima, e TRUNCATE nao
-- passa por RLS (mesma guarda de 20261123020000).
REVOKE ALL ON TABLE public.hr_codigos_processamento FROM anon;
REVOKE ALL ON TABLE public.hr_codigos_processamento FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.hr_codigos_processamento TO authenticated;
GRANT ALL ON TABLE public.hr_codigos_processamento TO service_role;

ALTER TABLE public.hr_codigos_processamento ENABLE ROW LEVEL SECURITY;

-- ==============================================================================
-- 2. RLS
-- ==============================================================================
DROP POLICY IF EXISTS hr_codigos_processamento_select ON public.hr_codigos_processamento;
CREATE POLICY hr_codigos_processamento_select ON public.hr_codigos_processamento
  FOR SELECT TO authenticated
  USING (
    CASE
      WHEN organization_id IS NULL THEN
        (SELECT public.has_anew_permission((SELECT auth.uid()), 'hr.vencimento.codigos.view'))
      ELSE
        (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.vencimento.codigos.view', organization_id))
    END
  );

DROP POLICY IF EXISTS hr_codigos_processamento_insert ON public.hr_codigos_processamento;
CREATE POLICY hr_codigos_processamento_insert ON public.hr_codigos_processamento
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id IS NOT NULL
    AND (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.vencimento.codigos.gerir', organization_id))
  );

DROP POLICY IF EXISTS hr_codigos_processamento_update ON public.hr_codigos_processamento;
CREATE POLICY hr_codigos_processamento_update ON public.hr_codigos_processamento
  FOR UPDATE TO authenticated
  USING (
    organization_id IS NOT NULL
    AND (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.vencimento.codigos.gerir', organization_id))
  )
  WITH CHECK (
    organization_id IS NOT NULL
    AND (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.vencimento.codigos.gerir', organization_id))
  );

DROP POLICY IF EXISTS hr_codigos_processamento_block_delete ON public.hr_codigos_processamento;
CREATE POLICY hr_codigos_processamento_block_delete ON public.hr_codigos_processamento
  AS RESTRICTIVE FOR DELETE TO authenticated USING (false);

COMMENT ON POLICY hr_codigos_processamento_block_delete ON public.hr_codigos_processamento IS
'Um codigo de processamento em uso no historico de processamento salarial nao se apaga: desactiva-se (activo=false). Mesmo padrao de pessoas_documentos_modelos (20261123020000).';

-- ==============================================================================
-- 3. Semear os dois codigos transversais JA em uso -- nenhum codigo novo.
-- ==============================================================================
INSERT INTO public.hr_codigos_processamento (organization_id, codigo, nome, descricao, activo)
VALUES
  (NULL, '100', 'Horas extraordinarias ao valor normal',
   'Horas extraordinarias pagas ao valor da hora normal.', true),
  (NULL, '200', 'Situacoes pagas a 100% (fins-de-semana e feriados)',
   'Situacoes pagas a 100% do valor da hora: fins-de-semana e feriados.', true)
ON CONFLICT (codigo) WHERE organization_id IS NULL DO NOTHING;

-- ---- Conferir --------------------------------------------------------------
DO $conferir$
DECLARE
  v_n           integer;
  v_privilegios text;
BEGIN
  -- 1. RLS activa, 4 politicas.
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.hr_codigos_processamento'::regclass) THEN
    RAISE EXCEPTION 'RLS nao esta activa em hr_codigos_processamento.';
  END IF;

  SELECT count(*) INTO v_n FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'hr_codigos_processamento';
  IF v_n <> 4 THEN
    RAISE EXCEPTION 'hr_codigos_processamento ficou com % politicas, esperavam-se 4.', v_n;
  END IF;

  -- 2. Grants exactos a authenticated -- sem DELETE nem TRUNCATE.
  SELECT string_agg(DISTINCT privilege_type, ',' ORDER BY privilege_type) INTO v_privilegios
    FROM information_schema.role_table_grants
   WHERE table_schema = 'public' AND table_name = 'hr_codigos_processamento'
     AND grantee = 'authenticated';
  IF v_privilegios IS DISTINCT FROM 'INSERT,SELECT,UPDATE' THEN
    RAISE EXCEPTION
      'hr_codigos_processamento: authenticated tem "%", esperava-se exactamente INSERT,SELECT,UPDATE.',
      coalesce(v_privilegios, '(nenhum)');
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
     WHERE table_schema = 'public' AND table_name = 'hr_codigos_processamento' AND grantee = 'anon'
  ) THEN
    RAISE EXCEPTION 'hr_codigos_processamento ficou com grant a anon.';
  END IF;

  -- 3. Os dois codigos transversais existem, e so esses dois.
  SELECT count(*) INTO v_n FROM public.hr_codigos_processamento WHERE organization_id IS NULL;
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'Esperavam-se 2 codigos transversais (organization_id NULL), encontraram-se %.', v_n;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.hr_codigos_processamento
     WHERE organization_id IS NULL AND codigo = '100' AND activo
  ) THEN
    RAISE EXCEPTION 'O codigo transversal 100 nao ficou semeado como esperado.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.hr_codigos_processamento
     WHERE organization_id IS NULL AND codigo = '200' AND activo
  ) THEN
    RAISE EXCEPTION 'O codigo transversal 200 nao ficou semeado como esperado.';
  END IF;

  -- 4. Os dois indices parciais existem.
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = 'public'
     AND tablename = 'hr_codigos_processamento' AND indexname = 'hr_codigos_processamento_transversal_codigo_key'
  ) THEN
    RAISE EXCEPTION 'Falta o indice unico dos codigos transversais.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = 'public'
     AND tablename = 'hr_codigos_processamento' AND indexname = 'hr_codigos_processamento_org_codigo_key'
  ) THEN
    RAISE EXCEPTION 'Falta o indice unico dos codigos por organizacao.';
  END IF;

  RAISE NOTICE 'OK: hr_codigos_processamento criada com RLS, 4 politicas, grants exactos, 2 codigos transversais (100, 200) semeados.';
END;
$conferir$;

-- ==============================================================================
-- ANTES DO db push
--
-- 1. Correr `supabase migration list --linked` e confirmar a ordem de
--    aplicacao real contra o remoto antes de empurrar -- ha drift conhecido
--    neste repositorio (migrations aplicadas sem ficheiro local).
-- 2. Sem janela de estado defeituoso: esta migracao so cria objectos novos,
--    nao altera nenhum existente.
-- 3. O ecra novo (React) e os hooks que leem/escrevem hr_codigos_processamento
--    entram no mesmo commit, fora do SQL.
-- ==============================================================================
