-- ==============================================================================
-- pessoas_ausencias_justificacoes: o documento justificativo, numa tabela a
-- parte.
--
-- POR APLICAR.
--
--
-- -- O PROBLEMA ----------------------------------------------------------------
--
-- A RLS do PostgreSQL e por LINHA e nao por coluna. Se o motivo de uma baixa
-- medica vivesse em pessoas_ausencias_pedidos.motivo, qualquer chefia que possa
-- ver o pedido -- e tem de o poder ver, para o aprovar -- lia o diagnostico.
--
-- Nao ha maneira de dar leitura do pedido e negar leitura de uma coluna dele.
-- A separacao em duas tabelas nao e organizacao: e o unico mecanismo que existe.
--
--
-- -- A REGRA NOVA --------------------------------------------------------------
--
-- Uma linha = um documento ou uma declaracao ligada a um pedido. A leitura
-- exige hr.ausencias.justificacao.view (marcada is_dangerous no catalogo) e
-- mais nada -- NEM a chefia, NEM quem tem hr.ausencias.view le aqui. So o RH
-- com essa permissao, e a propria pessoa.
--
-- A revelacao passa por rpc_hr_ausencia_ver_justificacao (20261121110000), e
-- essa RPC chama hr_registar_acesso_sensivel(pessoa, org,
-- 'ausencia_justificacao', 'revelar') -- o MESMO padrao do NISS e do IBAN, com
-- o mesmo rasto em pessoas_acessos_sensiveis. Nao e um padrao novo; e o padrao
-- do modulo aplicado a dados de saude.
--
-- Nota sobre o que a politica de SELECT ainda deixa passar: quem tiver a
-- permissao le a linha directamente, sem passar pela RPC, e portanto sem deixar
-- rasto. Fica dito as claras. A alternativa -- fechar tambem o SELECT e servir
-- tudo por RPC -- e defensavel e nao e o que o resto do modulo faz para os
-- campos sensiveis, que ficam legiveis a quem tem a permissao perigosa e
-- registados quando revelados por RPC. Segue-se o padrao existente, e a
-- diferenca fica registada em COMMENT ON POLICY em vez de ser inventada aqui.
--
--
-- -- ESCRITA FECHADA -----------------------------------------------------------
--
-- authenticated tem SELECT e mais nada; tres politicas AS RESTRICTIVE ... false.
--
--
-- -- O QUE FICA DE FORA --------------------------------------------------------
--
-- - O FICHEIRO. Esta tabela guarda documento_ref (uma referencia em texto),
--   texto, entidade emissora e data -- e NAO um caminho de Storage. Anexar
--   ficheiros a uma ausencia exige a arquitectura de quarentena que o
--   repositorio ja tem (20261103020000: o cliente nao insere nos buckets
--   reais) e uma Edge Function que ainda nao existe. Lacuna assumida: nesta
--   ronda a justificacao e texto e referencia.
-- - Nao se guarda diagnostico estruturado, codigo CID, nem periodo de baixa
--   como dado: e texto, e ninguem constroi logica sobre ele.
-- - Nao se toca em pessoas_vinculos nem em pessoas_retribuicoes.
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- Sem ficheiro de reversao nesta pasta, de proposito. A mao:
--   DROP TABLE public.pessoas_ausencias_justificacoes;
--
--
-- Prerequisitos:
--   20261121060000  pessoas_ausencias_pedidos (unique id, pessoa_id, organization_id)
--   20261120040000  hr_registar_acesso_sensivel(uuid, uuid, text, text)
--   20261120090000  hr_pessoa_do_utilizador(uuid, uuid)
--   20261121010000  hr.ausencias.justificacao.view no catalogo
-- ==============================================================================

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
BEGIN
  IF to_regclass('public.pessoas_ausencias_pedidos') IS NULL THEN
    RAISE EXCEPTION 'public.pessoas_ausencias_pedidos nao existe. Aplicar 20261121060000 primeiro.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'pessoas_ausencias_pedidos_id_pessoa_org_key'
       AND conrelid = to_regclass('public.pessoas_ausencias_pedidos')
       AND cardinality(conkey) = 3
  ) THEN
    RAISE EXCEPTION 'A unique (id, pessoa_id, organization_id) dos pedidos nao existe.';
  END IF;

  -- Por nome E aridade: 4 argumentos.
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'hr_registar_acesso_sensivel' AND p.pronargs = 4
  ) THEN
    RAISE EXCEPTION
      'hr_registar_acesso_sensivel(uuid, uuid, text, text) nao existe. Aplicar 20261120040000 primeiro: sem ela nao ha rasto de revelacao.';
  END IF;

  IF to_regclass('public.pessoas_acessos_sensiveis') IS NULL THEN
    RAISE EXCEPTION 'public.pessoas_acessos_sensiveis nao existe. Aplicar 20261120040000 primeiro.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.anew_permissions WHERE code = 'hr.ausencias.justificacao.view') THEN
    RAISE EXCEPTION 'hr.ausencias.justificacao.view nao esta no catalogo. Aplicar 20261121010000 primeiro.';
  END IF;

  -- Tem de ser perigosa no catalogo: e a marca que o ecra de Papeis usa para
  -- avisar quem a esta a atribuir.
  IF NOT EXISTS (
    SELECT 1 FROM public.anew_permissions
     WHERE code = 'hr.ausencias.justificacao.view' AND is_dangerous = true
  ) THEN
    RAISE EXCEPTION
      'hr.ausencias.justificacao.view nao esta marcada is_dangerous. Revela dados de saude e tem de aparecer como perigosa no ecra de Papeis.';
  END IF;
END;
$guardas$;

-- ---- A tabela --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pessoas_ausencias_justificacoes (
  id                uuid NOT NULL DEFAULT gen_random_uuid(),
  pedido_id         uuid NOT NULL,
  pessoa_id         uuid NOT NULL,
  organization_id   uuid NOT NULL,

  tipo_documento    text,
  documento_ref     text,
  texto             text,
  entidade_emissora text,
  data_documento    date,

  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  created_by        uuid,
  updated_by        uuid,

  CONSTRAINT pessoas_ausencias_justificacoes_pkey PRIMARY KEY (id),
  CONSTRAINT pessoas_ausencias_justificacoes_id_org_key UNIQUE (id, organization_id),

  CONSTRAINT pessoas_ausencias_justificacoes_pedido_fkey
    FOREIGN KEY (pedido_id, pessoa_id, organization_id)
    REFERENCES public.pessoas_ausencias_pedidos (id, pessoa_id, organization_id)
    ON DELETE CASCADE,

  CONSTRAINT pessoas_ausencias_justificacoes_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES public.anew_users (id) ON DELETE SET NULL,
  CONSTRAINT pessoas_ausencias_justificacoes_updated_by_fkey
    FOREIGN KEY (updated_by) REFERENCES public.anew_users (id) ON DELETE SET NULL,

  CONSTRAINT pessoas_ausencias_justificacoes_tipo_valido
    CHECK (tipo_documento IS NULL OR tipo_documento IN
           ('atestado_medico','declaracao_medica','convocatoria','obito',
            'declaracao_entidade','declaracao_propria','outro')),

  -- Uma justificacao vazia nao justifica nada: ou ha referencia a documento,
  -- ou ha texto. Uma linha com os dois nulos seria um registo a dizer que ha
  -- justificacao quando nao ha.
  CONSTRAINT pessoas_ausencias_justificacoes_tem_conteudo
    CHECK (
      (documento_ref IS NOT NULL AND btrim(documento_ref) <> '')
      OR (texto IS NOT NULL AND btrim(texto) <> '')
    )
);

CREATE INDEX IF NOT EXISTS idx_pessoas_ausencias_justificacoes_pedido
  ON public.pessoas_ausencias_justificacoes (pedido_id);

CREATE INDEX IF NOT EXISTS idx_pessoas_ausencias_justificacoes_pessoa
  ON public.pessoas_ausencias_justificacoes (pessoa_id, data_documento DESC);

COMMENT ON TABLE public.pessoas_ausencias_justificacoes IS
'O documento justificativo de uma ausencia, em tabela SEPARADA do pedido -- e a separacao nao e organizacao, e o unico mecanismo que existe: a RLS do PostgreSQL e por LINHA e nao por coluna. Com o diagnostico dentro do pedido, qualquer chefia que o veja para o aprovar leria a doenca.

Leitura: hr.ausencias.justificacao.view, marcada is_dangerous, mais a propria pessoa. NEM a chefia NEM quem tem hr.ausencias.view le aqui.

Revelacao por rpc_hr_ausencia_ver_justificacao, que registra em pessoas_acessos_sensiveis pelo mesmo padrao do NISS e do IBAN.

SEM FICHEIRO nesta ronda: guarda-se documento_ref (referencia em texto), texto, entidade emissora e data. Anexar ficheiros exige a arquitectura de quarentena de 20261103020000 e uma Edge Function que nao existe -- e prefere-se a lacuna assumida a abrir um bucket com atestados medicos ao INSERT directo do browser.';

COMMENT ON COLUMN public.pessoas_ausencias_justificacoes.texto IS
'O texto da declaracao ou do documento. E aqui que um diagnostico pode acabar por ficar, e e por isso que esta tabela tem a sua propria permissao. Ninguem constroi logica sobre este campo: e texto para se ler, nao dado estruturado.';

-- ---- Triggers de padrao ----------------------------------------------------
DROP TRIGGER IF EXISTS trg_pessoas_ausencias_justificacoes_updated_at ON public.pessoas_ausencias_justificacoes;
CREATE TRIGGER trg_pessoas_ausencias_justificacoes_updated_at
  BEFORE UPDATE ON public.pessoas_ausencias_justificacoes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---- Grants: SELECT e mais nada -------------------------------------------
REVOKE ALL ON TABLE public.pessoas_ausencias_justificacoes FROM anon;
REVOKE ALL ON TABLE public.pessoas_ausencias_justificacoes FROM authenticated;
GRANT SELECT ON TABLE public.pessoas_ausencias_justificacoes TO authenticated;
GRANT ALL ON TABLE public.pessoas_ausencias_justificacoes TO service_role;

-- ---- RLS -------------------------------------------------------------------
ALTER TABLE public.pessoas_ausencias_justificacoes ENABLE ROW LEVEL SECURITY;

-- UM SO ramo de permissao, e o da propria pessoa. Sem ramo de chefia e sem
-- hr.ausencias.view: e a razao de existir desta tabela.
DROP POLICY IF EXISTS pessoas_ausencias_justificacoes_select ON public.pessoas_ausencias_justificacoes;
CREATE POLICY pessoas_ausencias_justificacoes_select ON public.pessoas_ausencias_justificacoes
  FOR SELECT TO authenticated
  USING (
    (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.ausencias.justificacao.view', organization_id))
    OR (
      (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.ausencias.view.own', organization_id))
      AND pessoa_id = (SELECT public.hr_pessoa_do_utilizador((SELECT auth.uid()), organization_id))
    )
  );

DROP POLICY IF EXISTS pessoas_ausencias_justificacoes_block_insert ON public.pessoas_ausencias_justificacoes;
CREATE POLICY pessoas_ausencias_justificacoes_block_insert ON public.pessoas_ausencias_justificacoes
  AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (false);

DROP POLICY IF EXISTS pessoas_ausencias_justificacoes_block_update ON public.pessoas_ausencias_justificacoes;
CREATE POLICY pessoas_ausencias_justificacoes_block_update ON public.pessoas_ausencias_justificacoes
  AS RESTRICTIVE FOR UPDATE TO authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS pessoas_ausencias_justificacoes_block_delete ON public.pessoas_ausencias_justificacoes;
CREATE POLICY pessoas_ausencias_justificacoes_block_delete ON public.pessoas_ausencias_justificacoes
  AS RESTRICTIVE FOR DELETE TO authenticated USING (false);

COMMENT ON POLICY pessoas_ausencias_justificacoes_select ON public.pessoas_ausencias_justificacoes IS
'UM SO ramo de permissao -- hr.ausencias.justificacao.view -- mais o da propria pessoa. Nem a chefia nem quem tem hr.ausencias.view le aqui, e e essa exclusao que justifica a tabela existir.

DITO AS CLARAS: quem tem a permissao le a linha directamente, sem passar pela RPC, e portanto sem deixar rasto em pessoas_acessos_sensiveis. E o mesmo comportamento dos outros campos sensiveis do modulo -- legiveis a quem tem a permissao perigosa, registados quando revelados por RPC. Fechar tambem o SELECT e servir tudo por RPC e defensavel e seria uma mudanca de padrao para todo o modulo, nao uma decisao a tomar so aqui.';

-- ---- Conferir --------------------------------------------------------------
DO $conferir$
DECLARE
  v_rls       boolean;
  v_politicas integer;
  v_restr     integer;
  v_qual      text;
BEGIN
  IF to_regclass('public.pessoas_ausencias_justificacoes') IS NULL THEN
    RAISE EXCEPTION 'public.pessoas_ausencias_justificacoes nao ficou criada.';
  END IF;

  SELECT c.relrowsecurity INTO v_rls
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname = 'pessoas_ausencias_justificacoes';
  IF v_rls IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'A tabela ficou sem RLS activo.';
  END IF;

  SELECT count(*) INTO v_politicas FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'pessoas_ausencias_justificacoes';
  IF v_politicas <> 4 THEN
    RAISE EXCEPTION 'Esperavam-se 4 politicas, encontraram-se %.', v_politicas;
  END IF;

  SELECT count(*) INTO v_restr FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'pessoas_ausencias_justificacoes'
     AND permissive = 'RESTRICTIVE';
  IF v_restr <> 3 THEN
    RAISE EXCEPTION 'Esperavam-se 3 politicas RESTRICTIVE de escrita, encontraram-se %.', v_restr;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
     WHERE table_schema = 'public' AND table_name = 'pessoas_ausencias_justificacoes'
       AND grantee = 'authenticated' AND privilege_type IN ('INSERT','UPDATE','DELETE')
  ) THEN
    RAISE EXCEPTION 'authenticated tem GRANT de escrita. Esta tabela e SELECT e mais nada.';
  END IF;

  SELECT coalesce(qual,'') INTO v_qual FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'pessoas_ausencias_justificacoes'
     AND policyname = 'pessoas_ausencias_justificacoes_select';

  -- A guarda que importa nesta tabela: a chefia NAO pode aparecer aqui, e a
  -- permissao larga de ausencias tambem nao.
  IF v_qual LIKE '%pessoa_na_minha_cadeia%' THEN
    RAISE EXCEPTION
      'A politica da justificacao ganhou o ramo da chefia. E a razao de existir desta tabela que a chefia NAO leia o diagnostico do subordinado.';
  END IF;

  IF v_qual LIKE '%''hr.ausencias.view''%' THEN
    RAISE EXCEPTION
      'A politica da justificacao passou a aceitar hr.ausencias.view. Quem aprova um pedido nao le o atestado.';
  END IF;

  IF v_qual NOT LIKE '%hr.ausencias.justificacao.view%' THEN
    RAISE EXCEPTION 'A politica da justificacao nao exige hr.ausencias.justificacao.view.';
  END IF;

  IF v_qual NOT LIKE '%hr_pessoa_do_utilizador%' THEN
    RAISE EXCEPTION 'A politica perdeu o ramo da propria pessoa; ninguem veria a sua propria justificacao.';
  END IF;

  IF v_qual LIKE '%get_user_visible_org_ids%' THEN
    RAISE EXCEPTION 'A politica usa get_user_visible_org_ids. Em RH isso nunca acontece.';
  END IF;
  IF v_qual ~ 'has_anew_permission\([^_]' THEN
    RAISE EXCEPTION 'A politica usa has_anew_permission (global) em vez de has_anew_permission_in_org.';
  END IF;

  RAISE NOTICE 'Conferido: justificacoes com um so ramo de permissao, chefia excluida, escrita fechada.';
END;
$conferir$;
