-- ==============================================================================
-- pessoas_faltas_justificacoes: o documento justificativo da falta, a parte.
--
-- POR APLICAR.
--
--
-- -- O PROBLEMA ----------------------------------------------------------------
--
-- A RLS do PostgreSQL e por LINHA e nao por coluna. Se o diagnostico vivesse
-- numa coluna de pessoas_faltas, qualquer chefia que veja a falta da equipa
-- para a despachar leria a doenca -- e a chefia TEM de ver a falta.
--
-- Nao ha maneira de dar leitura da linha e negar leitura de uma coluna dela. A
-- separacao em duas tabelas nao e organizacao: e o unico mecanismo que existe.
--
--
-- -- A REGRA NOVA --------------------------------------------------------------
--
-- Uma linha = um documento ou uma declaracao ligada a uma falta. Leitura por
-- hr.assiduidade.justificacao.view (is_dangerous) mais a propria pessoa, e mais
-- nada -- nem a chefia, nem quem tem hr.assiduidade.faltas.view.
--
-- Revelacao por rpc_hr_falta_ver_justificacao, que chama
-- hr_registar_acesso_sensivel(pessoa, org, 'falta_justificacao', 'revelar') --
-- o mesmo padrao do NISS e do IBAN, com o mesmo rasto em
-- pessoas_acessos_sensiveis.
--
-- As colunas do FICHEIRO existem aqui (ficheiro_bucket, ficheiro_path,
-- ficheiro_nome, ficheiro_mime, ficheiro_bytes, ficheiro_sha256), com CHECK de
-- coerencia -- ou estao todas nulas, ou bucket, path e nome estao preenchidos.
-- Mas o bucket que 20261121220000 cria esta FECHADO ao cliente, e por isso,
-- nesta ronda, nao se anexa ficheiro nenhum: a falta justifica-se por texto,
-- documento_ref e tipo_documento. Ver o cabecalho de 20261121220000.
--
-- Append-only: sem deleted_at. Anula-se com anulado_em e anulacao_motivo.
--
--
-- -- O QUE FICA DE FORA --------------------------------------------------------
--
-- - O bucket e as politicas de Storage: 20261121220000.
-- - A Edge Function de upload (quarentena, scan, promocao) e a de URL assinado.
--   Sem ela nao se anexa ficheiro. Lacuna assumida.
-- - Diagnostico estruturado, codigo de doenca, periodo de baixa como dado:
--   dias_atestados existe como informacao e ninguem constroi logica sobre ele.
-- - Nao se toca em pessoas_vinculos nem em pessoas_retribuicoes.
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- Sem ficheiro de reversao nesta pasta, de proposito. A mao:
--   DROP FUNCTION public.rpc_hr_falta_decidir_justificacao(uuid, text, text);
--   DROP FUNCTION public.rpc_hr_falta_registar_justificacao(uuid, text, text, text, text, date, smallint);
--   DROP FUNCTION public.rpc_hr_falta_ver_justificacao(uuid);
--   DROP TABLE public.pessoas_faltas_justificacoes;
--
--
-- Prerequisitos:
--   20261121200000  pessoas_faltas (unique id, pessoa_id, organization_id)
--   20261120040000  hr_registar_acesso_sensivel(uuid, uuid, text, text)
--   20261121140000  hr.assiduidade.justificacao.view / .edit no catalogo
-- ==============================================================================

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
BEGIN
  IF to_regclass('public.pessoas_faltas') IS NULL THEN
    RAISE EXCEPTION 'public.pessoas_faltas nao existe. Aplicar 20261121200000 primeiro.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'pessoas_faltas_id_pessoa_org_key'
       AND conrelid = to_regclass('public.pessoas_faltas')
       AND cardinality(conkey) = 3
  ) THEN
    RAISE EXCEPTION
      'A unique (id, pessoa_id, organization_id) de pessoas_faltas nao existe; a FK COMPOSTA de falta_id depende dela.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'hr_registar_acesso_sensivel' AND p.pronargs = 4
  ) THEN
    RAISE EXCEPTION
      'hr_registar_acesso_sensivel(uuid, uuid, text, text) nao existe. Aplicar 20261120040000 primeiro: sem ela nao ha rasto de revelacao.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.anew_permissions
     WHERE code = 'hr.assiduidade.justificacao.view' AND is_dangerous = true
  ) THEN
    RAISE EXCEPTION
      'hr.assiduidade.justificacao.view nao esta no catalogo, ou nao esta marcada is_dangerous. Revela dados de saude e tem de aparecer como perigosa no ecra de Papeis. Aplicar 20261121140000.';
  END IF;
END;
$guardas$;

-- ---- A tabela --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pessoas_faltas_justificacoes (
  id                       uuid NOT NULL DEFAULT gen_random_uuid(),
  falta_id                 uuid NOT NULL,
  pessoa_id                uuid NOT NULL,
  organization_id          uuid NOT NULL,

  tipo_documento           text,
  documento_ref            text,
  entidade_emissora        text,
  data_documento           date,
  dias_atestados           smallint,
  texto                    text,

  -- O ficheiro: a base guarda so a referencia. Ver 20261121220000.
  ficheiro_bucket          text,
  ficheiro_path            text,
  ficheiro_nome            text,
  ficheiro_mime            text,
  ficheiro_bytes           bigint,
  ficheiro_sha256          text,

  anulado_em               timestamptz,
  anulado_por_anew_user_id uuid,
  anulacao_motivo          text,

  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  created_by               uuid,
  updated_by               uuid,
  -- SEM deleted_at: append-only.

  CONSTRAINT pessoas_faltas_justificacoes_pkey PRIMARY KEY (id),
  CONSTRAINT pessoas_faltas_justificacoes_id_org_key UNIQUE (id, organization_id),

  CONSTRAINT pessoas_faltas_justificacoes_falta_fkey
    FOREIGN KEY (falta_id, pessoa_id, organization_id)
    REFERENCES public.pessoas_faltas (id, pessoa_id, organization_id) ON DELETE CASCADE,

  CONSTRAINT pessoas_faltas_justificacoes_anulado_por_fkey
    FOREIGN KEY (anulado_por_anew_user_id) REFERENCES public.anew_users (id) ON DELETE NO ACTION,
  CONSTRAINT pessoas_faltas_justificacoes_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES public.anew_users (id) ON DELETE SET NULL,
  CONSTRAINT pessoas_faltas_justificacoes_updated_by_fkey
    FOREIGN KEY (updated_by) REFERENCES public.anew_users (id) ON DELETE SET NULL,

  CONSTRAINT pessoas_faltas_justificacoes_tipo_valido
    CHECK (tipo_documento IS NULL OR tipo_documento IN
           ('atestado_medico','declaracao_medica','convocatoria','obito',
            'declaracao_entidade','declaracao_propria','outro')),

  CONSTRAINT pessoas_faltas_justificacoes_dias_validos
    CHECK (dias_atestados IS NULL OR dias_atestados > 0),

  -- Uma justificacao vazia nao justifica nada: ou ha referencia, ou texto, ou
  -- ficheiro. Uma linha com os tres nulos diria que ha justificacao quando nao ha.
  CONSTRAINT pessoas_faltas_justificacoes_tem_conteudo
    CHECK (
      (documento_ref IS NOT NULL AND btrim(documento_ref) <> '')
      OR (texto IS NOT NULL AND btrim(texto) <> '')
      OR ficheiro_path IS NOT NULL
    ),

  -- Ou os campos do ficheiro estao todos nulos, ou bucket, path e nome estao
  -- preenchidos. Um path sem bucket nao aponta a nada.
  CONSTRAINT pessoas_faltas_justificacoes_ficheiro_coerente
    CHECK (
      (ficheiro_bucket IS NULL AND ficheiro_path IS NULL AND ficheiro_nome IS NULL
       AND ficheiro_mime IS NULL AND ficheiro_bytes IS NULL AND ficheiro_sha256 IS NULL)
      OR (ficheiro_bucket IS NOT NULL AND ficheiro_path IS NOT NULL AND ficheiro_nome IS NOT NULL)
    ),

  CONSTRAINT pessoas_faltas_justificacoes_bytes_positivos
    CHECK (ficheiro_bytes IS NULL OR ficheiro_bytes > 0),

  CONSTRAINT pessoas_faltas_justificacoes_anulacao_coerente
    CHECK (
      (anulado_em IS NULL AND anulado_por_anew_user_id IS NULL AND anulacao_motivo IS NULL)
      OR (anulado_em IS NOT NULL AND anulado_por_anew_user_id IS NOT NULL
          AND anulacao_motivo IS NOT NULL AND btrim(anulacao_motivo) <> '')
    )
);

-- O mesmo objecto nao pode estar preso a duas justificacoes: seria impossivel
-- saber qual delas autoriza a leitura do ficheiro.
CREATE UNIQUE INDEX IF NOT EXISTS uq_pessoas_faltas_justificacoes_ficheiro
  ON public.pessoas_faltas_justificacoes (ficheiro_bucket, ficheiro_path)
  WHERE ficheiro_path IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pessoas_faltas_justificacoes_falta
  ON public.pessoas_faltas_justificacoes (falta_id) WHERE anulado_em IS NULL;

CREATE INDEX IF NOT EXISTS idx_pessoas_faltas_justificacoes_pessoa
  ON public.pessoas_faltas_justificacoes (pessoa_id, data_documento DESC);

COMMENT ON TABLE public.pessoas_faltas_justificacoes IS
'O documento justificativo de uma falta, em tabela SEPARADA -- e a separacao nao e organizacao, e o unico mecanismo que existe: a RLS e por LINHA e nao por coluna, e a chefia TEM de ver a falta para a despachar. Com o diagnostico dentro de pessoas_faltas, leria a doenca.

Leitura: hr.assiduidade.justificacao.view (is_dangerous) mais a propria pessoa. Nem a chefia nem quem tem hr.assiduidade.faltas.view le aqui.

Revelacao por rpc_hr_falta_ver_justificacao, com registo em pessoas_acessos_sensiveis -- o padrao do NISS e do IBAN.

O FICHEIRO vive no Storage e a base guarda so a referencia. Nesta ronda o bucket esta fechado ao cliente (20261121220000) e por isso NAO se anexa ficheiro: justifica-se por texto, documento_ref e tipo_documento, que e o que a maior parte dos casos precisa. Prefere-se a lacuna assumida a abrir um bucket com atestados medicos ao INSERT directo do browser.';

COMMENT ON COLUMN public.pessoas_faltas_justificacoes.ficheiro_path IS
'Caminho no bucket, obrigatoriamente <organization_id>/<pessoa_id>/<falta_id>/<uuid>.<ext>. O ambito organizacional e a PRIMEIRA PASTA, e e isso que a politica de storage.objects le. Um caminho fora deste formato nao e legivel por ninguem -- e isso e a intencao.';

COMMENT ON COLUMN public.pessoas_faltas_justificacoes.dias_atestados IS
'Quantos dias o documento atesta, como INFORMACAO. Ninguem constroi logica sobre este campo: nao gera faltas, nao estende periodos e nao justifica dias que nao estejam marcados.';

-- ---- Triggers de padrao ----------------------------------------------------
DROP TRIGGER IF EXISTS trg_pessoas_faltas_justificacoes_updated_at ON public.pessoas_faltas_justificacoes;
CREATE TRIGGER trg_pessoas_faltas_justificacoes_updated_at
  BEFORE UPDATE ON public.pessoas_faltas_justificacoes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---- Grants: SELECT e mais nada -------------------------------------------
REVOKE ALL ON TABLE public.pessoas_faltas_justificacoes FROM anon;
REVOKE ALL ON TABLE public.pessoas_faltas_justificacoes FROM authenticated;
GRANT SELECT ON TABLE public.pessoas_faltas_justificacoes TO authenticated;
GRANT ALL ON TABLE public.pessoas_faltas_justificacoes TO service_role;

-- ---- RLS -------------------------------------------------------------------
ALTER TABLE public.pessoas_faltas_justificacoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pessoas_faltas_justificacoes_select ON public.pessoas_faltas_justificacoes;
CREATE POLICY pessoas_faltas_justificacoes_select ON public.pessoas_faltas_justificacoes
  FOR SELECT TO authenticated
  USING (
    (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.assiduidade.justificacao.view', organization_id))
    OR (
      (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.assiduidade.view.own', organization_id))
      AND pessoa_id = (SELECT public.hr_pessoa_do_utilizador((SELECT auth.uid()), organization_id))
    )
  );

DROP POLICY IF EXISTS pessoas_faltas_justificacoes_block_insert ON public.pessoas_faltas_justificacoes;
CREATE POLICY pessoas_faltas_justificacoes_block_insert ON public.pessoas_faltas_justificacoes
  AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (false);

DROP POLICY IF EXISTS pessoas_faltas_justificacoes_block_update ON public.pessoas_faltas_justificacoes;
CREATE POLICY pessoas_faltas_justificacoes_block_update ON public.pessoas_faltas_justificacoes
  AS RESTRICTIVE FOR UPDATE TO authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS pessoas_faltas_justificacoes_block_delete ON public.pessoas_faltas_justificacoes;
CREATE POLICY pessoas_faltas_justificacoes_block_delete ON public.pessoas_faltas_justificacoes
  AS RESTRICTIVE FOR DELETE TO authenticated USING (false);

COMMENT ON POLICY pessoas_faltas_justificacoes_select ON public.pessoas_faltas_justificacoes IS
'UM SO ramo de permissao -- hr.assiduidade.justificacao.view -- mais o da propria pessoa. Nem a chefia nem quem tem hr.assiduidade.faltas.view le aqui, e e essa exclusao que justifica a tabela existir.

DITO AS CLARAS: quem tem a permissao le a linha directamente, sem passar pela RPC, e portanto sem rasto em pessoas_acessos_sensiveis. E o mesmo comportamento dos outros campos sensiveis do modulo; mudar isso seria mudar o padrao para todo o modulo, nao uma decisao a tomar so aqui.';

-- ==============================================================================
-- As RPCs
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.rpc_hr_falta_ver_justificacao(_falta_id uuid)
RETURNS TABLE (
  id                uuid,
  tipo_documento    text,
  documento_ref     text,
  entidade_emissora text,
  data_documento    date,
  dias_atestados    smallint,
  texto             text,
  ficheiro_nome     text,
  ficheiro_mime     text,
  ficheiro_bytes    bigint
)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_auth uuid := auth.uid();
  v_f    public.pessoas_faltas;
BEGIN
  IF v_auth IS NULL THEN
    RAISE EXCEPTION 'falta_sem_sessao: nao ha utilizador autenticado.' USING ERRCODE = '42501';
  END IF;

  SELECT f.* INTO v_f FROM public.pessoas_faltas f WHERE f.id = _falta_id;
  IF v_f.id IS NULL THEN
    RAISE EXCEPTION 'falta_inexistente: a falta % nao existe.', _falta_id USING ERRCODE = '23503';
  END IF;

  IF NOT public.has_anew_permission_in_org(v_auth, 'hr.assiduidade.justificacao.view', v_f.organization_id) THEN
    RAISE EXCEPTION
      'falta_sem_permissao: ler a justificacao exige hr.assiduidade.justificacao.view nesta organizacao. Ver a falta para a despachar nao da acesso ao atestado.'
      USING ERRCODE = '42501';
  END IF;

  -- O rasto, ANTES de devolver: se a leitura falhar, o rasto fica.
  PERFORM public.hr_registar_acesso_sensivel(
    v_f.pessoa_id, v_f.organization_id, 'falta_justificacao', 'revelar'
  );

  RETURN QUERY
  SELECT j.id, j.tipo_documento, j.documento_ref, j.entidade_emissora,
         j.data_documento, j.dias_atestados, j.texto,
         j.ficheiro_nome, j.ficheiro_mime, j.ficheiro_bytes
    FROM public.pessoas_faltas_justificacoes j
   WHERE j.falta_id = _falta_id
     AND j.anulado_em IS NULL
   ORDER BY j.data_documento NULLS LAST, j.created_at;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_hr_falta_ver_justificacao(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_hr_falta_ver_justificacao(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_hr_falta_ver_justificacao(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_falta_ver_justificacao(uuid) TO service_role;

COMMENT ON FUNCTION public.rpc_hr_falta_ver_justificacao(uuid) IS
'Revela a justificacao de uma falta, exigindo hr.assiduidade.justificacao.view e registando a revelacao em pessoas_acessos_sensiveis -- o padrao do NISS e do IBAN. Devolve o NOME e o tipo do ficheiro, nao o caminho: o objecto e opaco, e o URL assinado e emitido por codigo com permissao verificada.';

CREATE OR REPLACE FUNCTION public.rpc_hr_falta_registar_justificacao(
  _falta_id uuid,
  _tipo_documento text DEFAULT NULL,
  _documento_ref text DEFAULT NULL,
  _texto text DEFAULT NULL,
  _entidade_emissora text DEFAULT NULL,
  _data_documento date DEFAULT NULL,
  _dias_atestados smallint DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_auth uuid := auth.uid();
  v_anew uuid;
  v_f    public.pessoas_faltas;
  v_id   uuid;
BEGIN
  IF v_auth IS NULL THEN
    RAISE EXCEPTION 'falta_sem_sessao: nao ha utilizador autenticado.' USING ERRCODE = '42501';
  END IF;

  SELECT f.* INTO v_f FROM public.pessoas_faltas f WHERE f.id = _falta_id;
  IF v_f.id IS NULL THEN
    RAISE EXCEPTION 'falta_inexistente: a falta % nao existe.', _falta_id USING ERRCODE = '23503';
  END IF;

  IF NOT public.has_anew_permission_in_org(v_auth, 'hr.assiduidade.justificacao.edit', v_f.organization_id) THEN
    RAISE EXCEPTION
      'falta_sem_permissao: registar uma justificacao exige hr.assiduidade.justificacao.edit nesta organizacao.'
      USING ERRCODE = '42501';
  END IF;

  IF coalesce(btrim(_documento_ref), '') = '' AND coalesce(btrim(_texto), '') = '' THEN
    RAISE EXCEPTION
      'falta_justificacao_vazia: uma justificacao precisa de referencia a documento ou de texto. Nesta ronda nao se anexa ficheiro -- o bucket esta fechado ao cliente ate existir a Edge Function de upload.'
      USING ERRCODE = '23514';
  END IF;

  SELECT au.id INTO v_anew FROM public.anew_users au WHERE au.auth_user_id = v_auth LIMIT 1;

  INSERT INTO public.pessoas_faltas_justificacoes (
    falta_id, pessoa_id, organization_id,
    tipo_documento, documento_ref, texto, entidade_emissora, data_documento, dias_atestados,
    created_by
  ) VALUES (
    _falta_id, v_f.pessoa_id, v_f.organization_id,
    _tipo_documento, _documento_ref, _texto, _entidade_emissora, _data_documento, _dias_atestados,
    v_anew
  )
  RETURNING id INTO v_id;

  -- A falta passa a "pendente_documento" se ainda estava sem justificacao: ha
  -- papel, mas quem decide se serve e um humano com a RPC de decidir.
  IF v_f.justificacao_estado = 'sem_justificacao' THEN
    UPDATE public.pessoas_faltas
       SET justificacao_estado = 'pendente_documento', updated_by = v_anew
     WHERE id = _falta_id;
  END IF;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_hr_falta_registar_justificacao(uuid, text, text, text, text, date, smallint) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_hr_falta_registar_justificacao(uuid, text, text, text, text, date, smallint) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_hr_falta_registar_justificacao(uuid, text, text, text, text, date, smallint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_falta_registar_justificacao(uuid, text, text, text, text, date, smallint) TO service_role;

COMMENT ON FUNCTION public.rpc_hr_falta_registar_justificacao(uuid, text, text, text, text, date, smallint) IS
'Registra um documento ou uma declaracao para uma falta. NAO decide se a falta fica justificada: passa-a a pendente_documento se estava sem justificacao, e a decisao e de um humano com rpc_hr_falta_decidir_justificacao. Registar papel e aceitar papel sao dois actos.';

CREATE OR REPLACE FUNCTION public.rpc_hr_falta_decidir_justificacao(
  _falta_id uuid,
  _resultado text,
  _motivo text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_auth uuid := auth.uid();
  v_anew uuid;
  v_f    public.pessoas_faltas;
BEGIN
  IF v_auth IS NULL THEN
    RAISE EXCEPTION 'falta_sem_sessao: nao ha utilizador autenticado.' USING ERRCODE = '42501';
  END IF;

  IF _resultado NOT IN ('justificada','recusada') THEN
    RAISE EXCEPTION
      'falta_resultado_invalido: a decisao e justificada ou recusada (recebido "%").', _resultado
      USING ERRCODE = '23514';
  END IF;

  IF _resultado = 'recusada' AND (_motivo IS NULL OR btrim(_motivo) = '') THEN
    RAISE EXCEPTION
      'falta_recusa_sem_motivo: recusar uma justificacao exige motivo escrito. Uma recusa sem razao e o que gera a disputa laboral.'
      USING ERRCODE = '23514';
  END IF;

  SELECT f.* INTO v_f FROM public.pessoas_faltas f WHERE f.id = _falta_id;
  IF v_f.id IS NULL THEN
    RAISE EXCEPTION 'falta_inexistente: a falta % nao existe.', _falta_id USING ERRCODE = '23503';
  END IF;

  IF NOT public.has_anew_permission_in_org(v_auth, 'hr.assiduidade.justificacao.edit', v_f.organization_id) THEN
    RAISE EXCEPTION
      'falta_sem_permissao: decidir uma justificacao exige hr.assiduidade.justificacao.edit nesta organizacao.'
      USING ERRCODE = '42501';
  END IF;

  IF v_f.estado <> 'activa' THEN
    RAISE EXCEPTION
      'falta_nao_activa: a falta % esta em "%" e nao ha justificacao a decidir.', _falta_id, v_f.estado
      USING ERRCODE = '23514';
  END IF;

  SELECT au.id INTO v_anew FROM public.anew_users au WHERE au.auth_user_id = v_auth LIMIT 1;

  UPDATE public.pessoas_faltas
     SET justificacao_estado = _resultado,
         justificacao_decidida_por = v_anew,
         justificacao_decidida_em = now(),
         justificacao_motivo = nullif(btrim(coalesce(_motivo, '')), ''),
         updated_by = v_anew
   WHERE id = _falta_id;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_hr_falta_decidir_justificacao(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_hr_falta_decidir_justificacao(uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_hr_falta_decidir_justificacao(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_falta_decidir_justificacao(uuid, text, text) TO service_role;

COMMENT ON FUNCTION public.rpc_hr_falta_decidir_justificacao(uuid, text, text) IS
'Decide se a falta fica justificada ou recusada, com autor e data. Recusar exige motivo escrito -- e o CHECK da tabela tambem o exige, para a regra nao viver so aqui.';

-- ---- Conferir --------------------------------------------------------------
DO $conferir$
DECLARE
  v_rls   boolean;
  v_pol   integer;
  v_restr integer;
  v_qual  text;
BEGIN
  IF to_regclass('public.pessoas_faltas_justificacoes') IS NULL THEN
    RAISE EXCEPTION 'public.pessoas_faltas_justificacoes nao ficou criada.';
  END IF;

  SELECT c.relrowsecurity INTO v_rls
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname = 'pessoas_faltas_justificacoes';
  IF v_rls IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'A tabela ficou sem RLS activo.';
  END IF;

  SELECT count(*) INTO v_pol FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'pessoas_faltas_justificacoes';
  IF v_pol <> 4 THEN
    RAISE EXCEPTION 'Esperavam-se 4 politicas, encontraram-se %.', v_pol;
  END IF;

  SELECT count(*) INTO v_restr FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'pessoas_faltas_justificacoes'
     AND permissive = 'RESTRICTIVE';
  IF v_restr <> 3 THEN
    RAISE EXCEPTION 'Esperavam-se 3 politicas RESTRICTIVE de escrita, encontraram-se %.', v_restr;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
     WHERE table_schema = 'public' AND table_name = 'pessoas_faltas_justificacoes'
       AND grantee = 'authenticated' AND privilege_type IN ('INSERT','UPDATE','DELETE')
  ) THEN
    RAISE EXCEPTION 'authenticated tem GRANT de escrita. Esta tabela e SELECT e mais nada.';
  END IF;

  SELECT coalesce(qual,'') INTO v_qual FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'pessoas_faltas_justificacoes'
     AND policyname = 'pessoas_faltas_justificacoes_select';

  -- As guardas que importam nesta tabela.
  IF v_qual LIKE '%pessoa_na_minha_cadeia%' THEN
    RAISE EXCEPTION
      'A politica da justificacao ganhou o ramo da chefia. E a razao de existir desta tabela que a chefia NAO leia o diagnostico do subordinado.';
  END IF;
  IF v_qual LIKE '%hr.assiduidade.faltas.view%' THEN
    RAISE EXCEPTION
      'A politica da justificacao passou a aceitar hr.assiduidade.faltas.view. Quem ve a falta para a despachar nao le o atestado.';
  END IF;
  IF v_qual NOT LIKE '%hr.assiduidade.justificacao.view%' THEN
    RAISE EXCEPTION 'A politica nao exige hr.assiduidade.justificacao.view.';
  END IF;
  IF v_qual NOT LIKE '%hr_pessoa_do_utilizador%' THEN
    RAISE EXCEPTION 'A politica perdeu o ramo da propria pessoa.';
  END IF;
  IF v_qual LIKE '%get_user_visible_org_ids%' THEN
    RAISE EXCEPTION 'A politica usa get_user_visible_org_ids. Em RH isso nunca acontece.';
  END IF;
  IF v_qual ~ 'has_anew_permission\([^_]' THEN
    RAISE EXCEPTION 'A politica usa has_anew_permission (global) em vez de has_anew_permission_in_org.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'pessoas_faltas_justificacoes'
       AND column_name = 'deleted_at'
  ) THEN
    RAISE EXCEPTION 'A tabela ganhou deleted_at. E append-only: anula-se com motivo.';
  END IF;

  -- A RPC de revelacao TEM de registar o acesso: sem isso, a permissao
  -- perigosa nao deixa rasto nenhum.
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'rpc_hr_falta_ver_justificacao'
       AND p.prosrc LIKE '%hr_registar_acesso_sensivel%'
  ) THEN
    RAISE EXCEPTION
      'rpc_hr_falta_ver_justificacao nao chama hr_registar_acesso_sensivel. Sem isso, revelar um atestado nao deixa rasto nenhum.';
  END IF;

  RAISE NOTICE 'Conferido: justificacoes de falta com um so ramo de permissao e revelacao registada.';
END;
$conferir$;
