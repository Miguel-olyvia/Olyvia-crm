-- ==============================================================================
-- Prazo para a pessoa justificar o dia: configuravel por organizacao.
--
-- RASCUNHO. NAO APLICADO. Vive em supabase/rascunhos/ e so passa para
-- supabase/migrations/ depois de revisto (ecc:database-reviewer e
-- ecc:security-reviewer) e de corrido o teste
-- supabase/rascunhos/TESTE-prazo-justificacao-configuravel.sql.
-- Desenho: supabase/rascunhos/DESENHO-prazo-configuravel.md.
--
--
-- -- O PROBLEMA ----------------------------------------------------------------
--
-- A base recusa a pessoa que justifica o dia depois de 5 dias uteis, com o 5
-- fixo em hr_justificacao_dia_prazo(date) (20261231800000). O ecra do
-- /rh-exemplo deixa mudar o prazo, mas so em memoria: o valor perde-se ao
-- recarregar e a base continua a usar 5. A pessoa pode ver "dentro do prazo" e
-- a base recusar.
--
--
-- -- A REGRA NOVA (decisao do utilizador, 27/10) -------------------------------
--
-- O prazo passa a ser da ORGANIZACAO, com 5 por omissao.
--   * Tabela hr_regras_assiduidade, uma linha por organizacao, SEM linhas
--     semeadas: sem linha o prazo e 5. Nenhuma organizacao muda de
--     comportamento com esta migration.
--   * Valor entre 1 e 30 dias uteis (seg-sex, sem feriados, como hoje).
--   * O prazo conta-se da data do dia a justificar, com o valor EM VIGOR no
--     momento em que a pessoa regista. Justificacoes ja registadas (pendentes
--     ou decididas) nao mudam: nada se reabre nem se fecha retroactivamente.
--   * O prazo so trava a PROPRIA pessoa; o RH (hr.assiduidade.justificacao.edit)
--     continua a registar em nome de outra pessoa fora do prazo.
--   * Ler: quem tem hr.module.access, hr.assiduidade.view.own ou
--     hr.assiduidade.picar na organizacao (quem pica tem de saber o prazo).
--     Gravar: hr.assiduidade.gerir (ja existe). A alternativa, uma permissao
--     nova hr.assiduidade.regras.gerir, esta POR DECIDIR; mudar e trocar o
--     codigo em rpc_hr_regras_assiduidade_guardar e em _ler (pode_alterar).
--
-- AMBITO DO RH (decidido a 27/10): a organizacao inteira. Os centros so dizem
-- onde cada pessoa trabalha. Esta migration segue esse ambito (tudo por
-- has_anew_permission_in_org na organizacao) e nao cria ambito por centro.
--
--
-- -- O QUE FAZ -----------------------------------------------------------------
--
-- 1. Tabela public.hr_regras_assiduidade (padrao de hr_regras_fim_contrato):
--    RLS nas 4 operacoes, escrita so pela RPC, authenticated so com SELECT.
-- 2. hr_justificacao_dia_prazo(_data date, _dias integer): sobrecarga NOVA,
--    IMMUTABLE. _dias fora de 1..30 ou NULL devolve NULL. Antes de redefinir a
--    de um argumento, um bloco compara as duas (dias = 5) em 4 anos de datas.
-- 3. hr_justificacao_dia_prazo(_data date): a MESMA assinatura, redefinida como
--    a de dois argumentos com 5. Legado: nenhum codigo do cliente a chama; a
--    unica chamadora na base era rpc_hr_justificacao_dia_registar (guarda G5).
-- 4. hr_prazo_justificacao_dias(_organization_id uuid): o numero da
--    organizacao (5 sem linha). SECURITY DEFINER, uma leitura pelo indice
--    unico, sem catalogo. EXECUTE so a service_role: e uma peca interna das
--    RPCs (que correm como dono); o ecra le por rpc_hr_regras_assiduidade_ler.
--    (Diferenca ao desenho, que dava EXECUTE a authenticated: assim nao se le o
--    prazo de outra organizacao por uuid.)
-- 5. rpc_hr_regras_assiduidade_ler(_organization_id) e
--    rpc_hr_regras_assiduidade_guardar(_organization_id, _prazo_justificacao_dias).
-- 6. rpc_hr_justificacao_dia_registar: CREATE OR REPLACE com a MESMA
--    assinatura de 10 argumentos e o corpo vivo lido a 28/10 (md5 fdfb898f...,
--    guarda G4). Unica mudanca: o prazo passa a ser o da organizacao e a
--    mensagem de justificacao_dia_fora_do_prazo diz o dia, os dias uteis e a
--    data-limite (o prefixo, que o ecra traduz, fica igual).
-- Nenhuma RPC de faltas muda (nao tem prazo). Nenhum DROP.
--
-- Erros novos (o ecra traduz por prefixo, ao lado de src/lib/hr/justificacaoDia.ts):
--   regras_assiduidade_sem_permissao  42501  sem sessao ou sem permissao
--   regras_assiduidade_prazo_invalido 23514  fora de 1..30 ou NULL
--
--
-- -- PRECISA DE CODIGO NOVO? ---------------------------------------------------
--
-- Nao parte nada sozinha: sem linhas, a base continua a usar 5 e o prefixo do
-- erro fora do prazo fica igual. Mas SO SERVE com o codigo novo, que vai NO
-- MESMO ENVIO PARA O MAIN que o db push:
--   * hook real src/hooks/useRegrasAssiduidade.ts (le por _ler, grava por
--     _guardar) e a constante partilhada PRAZO_JUSTIFICACAO_OMISSAO = 5;
--   * prazoFaltaDias sai do lojaFluxosB e definirPrazoDeJustificacao sai de
--     accoesAssiduidadeB; FaltasPainel, FaltaDetalhe, situacaoDoMes,
--     JustificacaoDeDiaPessoa, JustificacaoDoDia, JustificarFalhaDeMarcacao,
--     useJustificacoesDaPessoa e vistaDaPessoa passam a usar o prazo da base
--     (hoje os quatro ultimos usam 5 fixo);
--   * JANELA_DE_DESVIOS_DIAS deixa de ser 30 fixo (prazo de 30 dias uteis sao
--     ~42 de calendario);
--   * traducao dos dois erros novos.
-- Publicado o codigo ANTES do push, a leitura falha (RPC inexistente) e o
-- ecra cai em 5 com aviso: nao se publica antes.
--
--
-- -- ORDEM DE PUBLICACAO -------------------------------------------------------
--
-- 1. Base RH uetjghdkwbywbftedtth, a partir do worktree rh-pessoas (confirmar
--    supabase/.temp/project-ref). Nunca a principal, nunca a Mudelar.
-- 2. Revisao do rascunho (ecc:database-reviewer, ecc:security-reviewer).
-- 3. Teste contra o remoto ANTES do push, so com autorizacao para escritas
--    REVERTIDAS na nike: BEGIN; esta migration; o TESTE; ROLLBACK.
-- 4. Reconfirmar com migration list --linked que 20261231991000 continua a ser
--    maior que a ultima aplicada; mover para supabase/migrations/; listar o
--    pendente IMEDIATAMENTE antes; db push --linked.
-- 5. Medir na nike (SELECT em ciclo de 100) hr_prazo_justificacao_dias e
--    hr_justificacao_dia_prazo(d, 30); chamar rpc_hr_regras_assiduidade_ler.
-- 6. Codigo no mesmo envio para o main; ao vivo na nike: mudar o prazo,
--    recarregar, ver o calendario da pessoa e os alertas mudarem juntos e a
--    base aceitar/recusar conforme.
-- Depois do push NAO se volta atras para demonstrar o vermelho.
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- Sem ficheiro de reversao nesta pasta, de proposito. A mao, por migration:
--   repor o corpo de rpc_hr_justificacao_dia_registar de 20261231800000;
--   repor o corpo proprio de hr_justificacao_dia_prazo(date) (20261231800000);
--   DROP FUNCTION public.rpc_hr_regras_assiduidade_guardar(uuid, integer);
--   DROP FUNCTION public.rpc_hr_regras_assiduidade_ler(uuid);
--   DROP FUNCTION public.hr_prazo_justificacao_dias(uuid);
--   DROP FUNCTION public.hr_justificacao_dia_prazo(date, integer);
--   DROP TABLE public.hr_regras_assiduidade;
--
-- Prerequisitos:
--   20261120010000  has_anew_permission_in_org
--   20261231800000  hr_justificacao_dia_prazo(date), rpc_hr_justificacao_dia_registar
-- ==============================================================================

-- ---- Guardas (todas antes de qualquer escrita) -----------------------------
DO $guardas$
DECLARE
  v_cod text;
  v_txt text;
BEGIN
  -- G1. Os objectos novos nao existem.
  IF to_regclass('public.hr_regras_assiduidade') IS NOT NULL THEN
    RAISE EXCEPTION 'G1: public.hr_regras_assiduidade ja existe. Ler o que la esta antes de aplicar.';
  END IF;
  IF to_regprocedure('public.hr_justificacao_dia_prazo(date, integer)') IS NOT NULL
     OR to_regprocedure('public.hr_prazo_justificacao_dias(uuid)') IS NOT NULL
     OR to_regprocedure('public.rpc_hr_regras_assiduidade_ler(uuid)') IS NOT NULL
     OR to_regprocedure('public.rpc_hr_regras_assiduidade_guardar(uuid, integer)') IS NOT NULL THEN
    RAISE EXCEPTION 'G1: uma das funcoes novas (prazo de 2 argumentos, hr_prazo_justificacao_dias, _ler, _guardar) ja existe.';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'public'
                AND p.proname IN ('hr_prazo_justificacao_dias', 'rpc_hr_regras_assiduidade_ler',
                                  'rpc_hr_regras_assiduidade_guardar')) THEN
    RAISE EXCEPTION 'G1: ha uma funcao com o nome de uma das novas, com outra assinatura. Ler antes de aplicar.';
  END IF;

  -- G2. As pecas de que esta migration depende.
  IF to_regprocedure('public.has_anew_permission_in_org(uuid, text, uuid)') IS NULL
     OR to_regprocedure('public.hr_pessoa_do_utilizador(uuid, uuid)') IS NULL
     OR to_regprocedure('public.update_updated_at_column()') IS NULL
     OR to_regclass('public.anew_organizations') IS NULL
     OR to_regclass('public.anew_users') IS NULL
     OR to_regclass('public.pessoas_justificacoes_dia') IS NULL THEN
    RAISE EXCEPTION 'G2: falta has_anew_permission_in_org, hr_pessoa_do_utilizador, update_updated_at_column, anew_organizations, anew_users ou pessoas_justificacoes_dia.';
  END IF;

  -- G3. Os codigos de permissao usados, todos existentes.
  FOREACH v_cod IN ARRAY ARRAY['hr.module.access', 'hr.assiduidade.view.own', 'hr.assiduidade.picar',
                               'hr.assiduidade.gerir', 'hr.assiduidade.justificacao.edit']
  LOOP
    IF NOT EXISTS (SELECT 1 FROM public.anew_permissions ap WHERE ap.code = v_cod) THEN
      RAISE EXCEPTION 'G3: o codigo % nao esta no catalogo.', v_cod;
    END IF;
  END LOOP;

  -- G4. As duas funcoes que se recriam, com a assinatura E o corpo lidos no
  --     remoto a 28/10. Se o corpo mudou, reler antes de aplicar: o CREATE OR
  --     REPLACE abaixo reescreve-o.
  IF to_regprocedure('public.rpc_hr_justificacao_dia_registar(uuid, uuid, date, text, boolean, time, time, text, time, text[])') IS NULL
     OR to_regprocedure('public.hr_justificacao_dia_prazo(date)') IS NULL THEN
    RAISE EXCEPTION 'G4: rpc_hr_justificacao_dia_registar (10 argumentos) ou hr_justificacao_dia_prazo(date) nao existe com a assinatura esperada.';
  END IF;
  IF (SELECT md5(p.prosrc) FROM pg_proc p
       WHERE p.oid = to_regprocedure('public.rpc_hr_justificacao_dia_registar(uuid, uuid, date, text, boolean, time, time, text, time, text[])')::oid)
       IS DISTINCT FROM 'fdfb898f94b54530886bb9ac48ce83d9' THEN
    RAISE EXCEPTION 'G4: o corpo de rpc_hr_justificacao_dia_registar mudou desde 28/10 (md5 esperado fdfb898f...). Reler a versao actual antes de aplicar.';
  END IF;
  IF (SELECT md5(p.prosrc) FROM pg_proc p
       WHERE p.oid = to_regprocedure('public.hr_justificacao_dia_prazo(date)')::oid)
       IS DISTINCT FROM 'f9ec3fb1b5c0cb526b4c51ee33babdf3' THEN
    RAISE EXCEPTION 'G4: o corpo de hr_justificacao_dia_prazo(date) mudou desde 28/10 (md5 esperado f9ec3fb1...). Reler antes de aplicar.';
  END IF;

  -- G5. A unica chamadora de hr_justificacao_dia_prazo e a RPC de registar; nenhum
  --     CHECK, indice ou vista a usa (redefini-la nao mexe em mais nada).
  SELECT string_agg(p.oid::regprocedure::text, ', ') INTO v_txt
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.prosrc LIKE '%hr_justificacao_dia_prazo%'
     AND p.oid <> to_regprocedure('public.rpc_hr_justificacao_dia_registar(uuid, uuid, date, text, boolean, time, time, text, time, text[])')::oid;
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'G5: hr_justificacao_dia_prazo e chamada tambem por: %. Ler antes de aplicar.', v_txt;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint c
              WHERE c.connamespace = 'public'::regnamespace
                AND pg_get_constraintdef(c.oid) LIKE '%hr_justificacao_dia_prazo%')
     OR EXISTS (SELECT 1 FROM pg_index i JOIN pg_class ic ON ic.oid = i.indexrelid
                 WHERE ic.relnamespace = 'public'::regnamespace
                   AND pg_get_indexdef(i.indexrelid) LIKE '%hr_justificacao_dia_prazo%')
     OR EXISTS (SELECT 1 FROM pg_class v
                 WHERE v.relnamespace = 'public'::regnamespace
                   AND v.relkind::text IN ('v', 'm')
                   AND pg_get_viewdef(v.oid) LIKE '%hr_justificacao_dia_prazo%') THEN
    RAISE EXCEPTION 'G5: ha um CHECK, indice ou vista que usa hr_justificacao_dia_prazo. Ler antes de aplicar.';
  END IF;
END;
$guardas$;


-- ==============================================================================
-- 1. A tabela (padrao de hr_regras_fim_contrato)
-- ==============================================================================
CREATE TABLE public.hr_regras_assiduidade (
  id                        uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id           uuid NOT NULL,

  prazo_justificacao_dias   integer NOT NULL DEFAULT 5,

  created_at                timestamptz NOT NULL DEFAULT now(),
  created_by                uuid,
  updated_at                timestamptz NOT NULL DEFAULT now(),
  updated_by                uuid,

  CONSTRAINT hr_regras_assiduidade_pkey PRIMARY KEY (id),
  CONSTRAINT hr_regras_assiduidade_org_key UNIQUE (organization_id),
  CONSTRAINT hr_regras_assiduidade_org_fkey
    FOREIGN KEY (organization_id) REFERENCES public.anew_organizations (id) ON DELETE CASCADE,
  CONSTRAINT hr_regras_assiduidade_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES public.anew_users (id) ON DELETE SET NULL,
  CONSTRAINT hr_regras_assiduidade_updated_by_fkey
    FOREIGN KEY (updated_by) REFERENCES public.anew_users (id) ON DELETE SET NULL,

  CONSTRAINT hr_regras_assiduidade_prazo_valido CHECK (prazo_justificacao_dias BETWEEN 1 AND 30)
);

COMMENT ON TABLE public.hr_regras_assiduidade IS
'As regras DA EMPRESA para a assiduidade. Uma linha por organizacao; sem linha valem as omissoes (prazo de justificacao = 5 dias uteis). Le quem tem hr.module.access, hr.assiduidade.view.own ou hr.assiduidade.picar na organizacao. Escrita so pela RPC rpc_hr_regras_assiduidade_guardar (hr.assiduidade.gerir). Nome generico de proposito: futuras regras da assiduidade entram aqui. Desde 20261231991000.';
COMMENT ON COLUMN public.hr_regras_assiduidade.prazo_justificacao_dias IS
'Dias uteis (segunda a sexta, sem feriados) que a propria pessoa tem para justificar um dia, a contar do dia seguinte; o ultimo e inclusivo. 1 a 30, omissao 5. Vale o valor em vigor no momento em que a pessoa regista; justificacoes ja registadas nao mudam. O RH (hr.assiduidade.justificacao.edit) regista em nome de outra pessoa fora do prazo.';

CREATE TRIGGER trg_hr_regras_assiduidade_updated_at
  BEFORE UPDATE ON public.hr_regras_assiduidade
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Escrita fechada: so a RPC (verifica a permissao na organizacao e valida o valor).
REVOKE ALL ON TABLE public.hr_regras_assiduidade FROM PUBLIC;
REVOKE ALL ON TABLE public.hr_regras_assiduidade FROM anon;
REVOKE ALL ON TABLE public.hr_regras_assiduidade FROM authenticated;
GRANT SELECT ON TABLE public.hr_regras_assiduidade TO authenticated;
GRANT ALL ON TABLE public.hr_regras_assiduidade TO service_role;

ALTER TABLE public.hr_regras_assiduidade ENABLE ROW LEVEL SECURITY;

CREATE POLICY hr_regras_assiduidade_select ON public.hr_regras_assiduidade
  FOR SELECT TO authenticated
  USING (
    (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.module.access', organization_id))
    OR (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.assiduidade.view.own', organization_id))
    OR (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.assiduidade.picar', organization_id))
  );

CREATE POLICY hr_regras_assiduidade_block_insert ON public.hr_regras_assiduidade
  AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (false);

CREATE POLICY hr_regras_assiduidade_block_update ON public.hr_regras_assiduidade
  AS RESTRICTIVE FOR UPDATE TO authenticated USING (false) WITH CHECK (false);

CREATE POLICY hr_regras_assiduidade_block_delete ON public.hr_regras_assiduidade
  AS RESTRICTIVE FOR DELETE TO authenticated USING (false);


-- ==============================================================================
-- 2. O calculo da data-limite com N dias uteis (sobrecarga nova)
-- ==============================================================================
-- O mesmo calculo da versao de um argumento, com N em vez de 5. 30 dias uteis
-- sao no maximo 41 de calendario (a contar de um sabado); 60 da folga.
-- _dias fora de 1..30 ou NULL -> NULL (quem chama recusa). Aritmetica de
-- date + integer: IMMUTABLE de facto (nao depende do fuso da sessao).
CREATE FUNCTION public.hr_justificacao_dia_prazo(_data date, _dias integer)
RETURNS date
LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT _data + g.i
    FROM generate_series(1, 60) AS g(i)
   WHERE _dias BETWEEN 1 AND 30
     AND extract(isodow FROM (_data + g.i)) < 6
   ORDER BY g.i
  OFFSET greatest(coalesce(_dias, 1) - 1, 0)   -- o N.o dia util
   LIMIT 1
$$;

COMMENT ON FUNCTION public.hr_justificacao_dia_prazo(date, integer) IS
'Ultimo dia para a pessoa justificar o dia _data: _dias dias uteis depois (seg-sex, sem feriados), a mesma regra de somarDiasUteis(data, dias) do ecra. _dias fora de 1..30 ou NULL devolve NULL. O _dias da organizacao vem de hr_prazo_justificacao_dias. Desde 20261231991000.';

REVOKE ALL ON FUNCTION public.hr_justificacao_dia_prazo(date, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_justificacao_dia_prazo(date, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.hr_justificacao_dia_prazo(date, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hr_justificacao_dia_prazo(date, integer) TO service_role;

-- Antes de redefinir a de um argumento: a nova com 5 tem de dar EXACTAMENTE o
-- que a viva da, dia a dia, em 4 anos (todos os dias da semana, viradas de mes
-- e de ano, 29/02/2028).
DO $equivalencia$
DECLARE
  v_n integer;
  v_d date;
BEGIN
  SELECT count(*), min(d::date) INTO v_n, v_d
    FROM generate_series(DATE '2025-01-01', DATE '2028-12-31', interval '1 day') AS s(d)
   WHERE public.hr_justificacao_dia_prazo(s.d::date) IS DISTINCT FROM public.hr_justificacao_dia_prazo(s.d::date, 5);
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'A sobrecarga com 5 dias difere da versao viva em % dias (o primeiro: %). Nada foi aplicado.', v_n, v_d;
  END IF;
END;
$equivalencia$;


-- ==============================================================================
-- 3. A versao de um argumento: mesma assinatura, agora a de dois com 5 (legado)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.hr_justificacao_dia_prazo(_data date)
RETURNS date
LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT public.hr_justificacao_dia_prazo(_data, 5)
$$;

COMMENT ON FUNCTION public.hr_justificacao_dia_prazo(date) IS
'LEGADO: o prazo de 5 dias uteis fixo. Usar hr_justificacao_dia_prazo(date, integer) com o prazo da organizacao (hr_prazo_justificacao_dias). Mantida para nao partir chamadores; nenhum codigo do cliente a chama. Redefinida em 20261231991000.';

REVOKE ALL ON FUNCTION public.hr_justificacao_dia_prazo(date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_justificacao_dia_prazo(date) FROM anon;
GRANT EXECUTE ON FUNCTION public.hr_justificacao_dia_prazo(date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hr_justificacao_dia_prazo(date) TO service_role;


-- ==============================================================================
-- 4. O prazo da organizacao (peca interna)
-- ==============================================================================
CREATE FUNCTION public.hr_prazo_justificacao_dias(_organization_id uuid)
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT coalesce(
           (SELECT r.prazo_justificacao_dias
              FROM public.hr_regras_assiduidade r
             WHERE r.organization_id = _organization_id),
           5)
$$;

COMMENT ON FUNCTION public.hr_prazo_justificacao_dias(uuid) IS
'Os dias uteis que a pessoa tem para justificar um dia nesta organizacao: o valor de hr_regras_assiduidade, ou 5 sem linha. Uma leitura pelo indice unico. Peca interna das RPCs (EXECUTE so a service_role); o ecra le por rpc_hr_regras_assiduidade_ler. Desde 20261231991000.';

REVOKE ALL ON FUNCTION public.hr_prazo_justificacao_dias(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_prazo_justificacao_dias(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.hr_prazo_justificacao_dias(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.hr_prazo_justificacao_dias(uuid) TO service_role;


-- ==============================================================================
-- 5. RPC de ler
-- ==============================================================================
CREATE FUNCTION public.rpc_hr_regras_assiduidade_ler(_organization_id uuid)
RETURNS TABLE (
  prazo_justificacao_dias integer,
  gravado                 boolean,
  updated_at              timestamptz,
  pode_alterar            boolean
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_auth uuid := auth.uid();
  v_dias integer;
  v_upd  timestamptz;
BEGIN
  IF v_auth IS NULL OR _organization_id IS NULL
     OR NOT (public.has_anew_permission_in_org(v_auth, 'hr.module.access', _organization_id)
             OR public.has_anew_permission_in_org(v_auth, 'hr.assiduidade.view.own', _organization_id)
             OR public.has_anew_permission_in_org(v_auth, 'hr.assiduidade.picar', _organization_id)) THEN
    RAISE EXCEPTION
      'regras_assiduidade_sem_permissao: so quem tem acesso ao RH, ve a propria assiduidade ou pica o ponto nesta organizacao le as regras da assiduidade.'
      USING ERRCODE = '42501';
  END IF;

  SELECT r.prazo_justificacao_dias, r.updated_at INTO v_dias, v_upd
    FROM public.hr_regras_assiduidade r
   WHERE r.organization_id = _organization_id;

  RETURN QUERY
  SELECT coalesce(v_dias, 5),
         (v_dias IS NOT NULL),
         v_upd,
         public.has_anew_permission_in_org(v_auth, 'hr.assiduidade.gerir', _organization_id);
END;
$$;

COMMENT ON FUNCTION public.rpc_hr_regras_assiduidade_ler(uuid) IS
'As regras da assiduidade da organizacao: prazo_justificacao_dias (5 sem linha), gravado (ha linha), updated_at e pode_alterar (tem hr.assiduidade.gerir; a base volta a verificar ao gravar). Exige sessao e hr.module.access, hr.assiduidade.view.own ou hr.assiduidade.picar na organizacao (regras_assiduidade_sem_permissao, 42501). Desde 20261231991000.';

REVOKE ALL ON FUNCTION public.rpc_hr_regras_assiduidade_ler(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_hr_regras_assiduidade_ler(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_hr_regras_assiduidade_ler(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_regras_assiduidade_ler(uuid) TO service_role;


-- ==============================================================================
-- 6. RPC de gravar
-- ==============================================================================
CREATE FUNCTION public.rpc_hr_regras_assiduidade_guardar(
  _organization_id uuid,
  _prazo_justificacao_dias integer
)
RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_auth uuid := auth.uid();
  v_user uuid;
  v_dias integer;
BEGIN
  IF v_auth IS NULL OR _organization_id IS NULL
     OR NOT public.has_anew_permission_in_org(v_auth, 'hr.assiduidade.gerir', _organization_id) THEN
    RAISE EXCEPTION
      'regras_assiduidade_sem_permissao: so quem gere a assiduidade (hr.assiduidade.gerir) nesta organizacao altera as regras da assiduidade.'
      USING ERRCODE = '42501';
  END IF;

  IF _prazo_justificacao_dias IS NULL OR _prazo_justificacao_dias < 1 OR _prazo_justificacao_dias > 30 THEN
    RAISE EXCEPTION
      'regras_assiduidade_prazo_invalido: o prazo para justificar tem de estar entre 1 e 30 dias uteis; recebi %.',
      coalesce(_prazo_justificacao_dias::text, 'nada')
      USING ERRCODE = '23514';
  END IF;

  SELECT au.id INTO v_user FROM public.anew_users au WHERE au.auth_user_id = v_auth LIMIT 1;
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'regras_assiduidade_sem_permissao: a sessao nao corresponde a nenhum utilizador.'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.hr_regras_assiduidade AS r
    (organization_id, prazo_justificacao_dias, created_by, updated_by)
  VALUES
    (_organization_id, _prazo_justificacao_dias, v_user, v_user)
  ON CONFLICT (organization_id) DO UPDATE SET
    prazo_justificacao_dias = EXCLUDED.prazo_justificacao_dias,
    updated_by              = EXCLUDED.updated_by
  RETURNING r.prazo_justificacao_dias INTO v_dias;

  RETURN v_dias;
END;
$$;

COMMENT ON FUNCTION public.rpc_hr_regras_assiduidade_guardar(uuid, integer) IS
'Grava (upsert por organizacao) o prazo que a pessoa tem para justificar um dia: 1 a 30 dias uteis (regras_assiduidade_prazo_invalido, 23514). Exige sessao e hr.assiduidade.gerir na organizacao (regras_assiduidade_sem_permissao, 42501). Vale dai em diante para os dias ainda por justificar; justificacoes ja registadas nao mudam. Devolve o valor gravado. Desde 20261231991000.';

REVOKE ALL ON FUNCTION public.rpc_hr_regras_assiduidade_guardar(uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_hr_regras_assiduidade_guardar(uuid, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_hr_regras_assiduidade_guardar(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_regras_assiduidade_guardar(uuid, integer) TO service_role;


-- ==============================================================================
-- 7. Registar a justificacao do dia: o prazo passa a ser o da organizacao
--    Corpo de 20261231800000 (md5 vivo fdfb898f..., guarda G4); so muda o
--    DECLARE (v_prazo_dias, v_prazo) e o bloco do prazo.
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.rpc_hr_justificacao_dia_registar(
  _organization_id uuid,
  _pessoa_id uuid,
  _data date,
  _tipo text,
  _de_atraso boolean,
  _periodo_inicio time,
  _periodo_fim time,
  _motivo text,
  _hora_real time DEFAULT NULL,
  _anexos_nomes text[] DEFAULT '{}'::text[]
)
RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_auth       uuid := auth.uid();
  v_anew       uuid;
  v_rh         boolean;
  v_eu         uuid;
  v_hoje       date := (now() AT TIME ZONE 'Europe/Lisbon')::date;
  v_anexos     text[] := coalesce(_anexos_nomes, '{}'::text[]);
  v_conflito   record;
  v_id         uuid;
  v_constraint text;
  v_prazo_dias integer;
  v_prazo      date;
BEGIN
  IF v_auth IS NULL THEN
    RAISE EXCEPTION 'justificacao_dia_sem_sessao: nao ha utilizador autenticado.' USING ERRCODE = '42501';
  END IF;

  IF _organization_id IS NULL OR _pessoa_id IS NULL OR _data IS NULL OR _tipo IS NULL
     OR _de_atraso IS NULL OR _periodo_inicio IS NULL OR _periodo_fim IS NULL THEN
    RAISE EXCEPTION 'justificacao_dia_dados_em_falta: organizacao, pessoa, dia, tipo, atraso e periodo sao obrigatorios.'
      USING ERRCODE = '23502';
  END IF;

  -- Quem: o RH (em nome da pessoa) ou a propria pessoa, com picar.
  v_rh := public.has_anew_permission_in_org(v_auth, 'hr.assiduidade.justificacao.edit', _organization_id);
  v_eu := public.hr_pessoa_do_utilizador(v_auth, _organization_id);
  -- Sobre a propria ficha, quem e do RH e so a pessoa: sem registar fora do
  -- prazo nem sem picar. O bloqueio de decidir a propria esta em _decidir.
  IF v_rh AND v_eu IS NOT NULL AND v_eu = _pessoa_id THEN
    v_rh := false;
  END IF;
  IF NOT v_rh THEN
    IF NOT (public.has_anew_permission_in_org(v_auth, 'hr.assiduidade.picar', _organization_id)
            AND _pessoa_id IS NOT DISTINCT FROM v_eu) THEN
      RAISE EXCEPTION
        'justificacao_dia_sem_permissao: so a propria pessoa (hr.assiduidade.picar) ou o RH (hr.assiduidade.justificacao.edit) registam uma justificacao do dia.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.pessoas p
     WHERE p.id = _pessoa_id AND p.organization_id = _organization_id AND p.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'justificacao_dia_pessoa_invalida: a pessoa nao existe nesta organizacao.' USING ERRCODE = '23503';
  END IF;

  IF _tipo NOT IN ('consulta_medica','transporte','assunto_pessoal','outro') THEN
    RAISE EXCEPTION 'justificacao_dia_tipo_invalido: tipo "%" nao existe.', _tipo USING ERRCODE = '23514';
  END IF;

  IF _periodo_fim <= _periodo_inicio THEN
    RAISE EXCEPTION
      'justificacao_dia_periodo_invalido: o fim tem de ser depois do inicio. Um periodo que atravesse a meia-noite sao duas justificacoes, em dois dias.'
      USING ERRCODE = '23514';
  END IF;

  IF char_length(btrim(coalesce(_motivo, ''))) < 3 OR char_length(_motivo) > 4000 THEN
    RAISE EXCEPTION 'justificacao_dia_motivo_invalido: o motivo tem de ter entre 3 e 4000 caracteres.' USING ERRCODE = '23514';
  END IF;

  IF NOT public.hr_justificacao_dia_anexos_validos(v_anexos) THEN
    RAISE EXCEPTION 'justificacao_dia_anexos_invalidos: no maximo 4 anexos, cada nome com 1 a 255 caracteres.' USING ERRCODE = '23514';
  END IF;

  IF _data > v_hoje THEN
    RAISE EXCEPTION 'justificacao_dia_data_futura: nao se justifica um dia que ainda nao aconteceu (%).', _data USING ERRCODE = '23514';
  END IF;

  -- O prazo e da PESSOA, com o valor da organizacao em vigor agora
  -- (hr_regras_assiduidade; 5 sem linha). O RH pode registar em nome dela
  -- depois do prazo. Sem prazo calculavel, recusa (nunca deixa passar).
  IF NOT v_rh THEN
    v_prazo_dias := public.hr_prazo_justificacao_dias(_organization_id);
    v_prazo      := public.hr_justificacao_dia_prazo(_data, v_prazo_dias);
    IF v_prazo IS NULL OR v_hoje > v_prazo THEN
      RAISE EXCEPTION
        'justificacao_dia_fora_do_prazo: o prazo para justificar % (% dias uteis) acabou a %.', _data, v_prazo_dias, v_prazo
        USING ERRCODE = '23514';
    END IF;
  END IF;

  -- Se ja ha falta marcada a cruzar o periodo, justifica-se pela falta.
  -- Comparacao SEMI-ABERTA, a de hr_faltas_sem_sobreposicao.
  SELECT f.id, f.hora_inicio, f.hora_fim INTO v_conflito
    FROM public.pessoas_faltas f
   WHERE f.pessoa_id = _pessoa_id
     AND f.organization_id = _organization_id
     AND f.data = _data
     AND f.estado = 'activa'
     AND _periodo_inicio < f.hora_fim
     AND f.hora_inicio < _periodo_fim
   LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION
      'justificacao_dia_ja_ha_falta: ja ha uma falta marcada de % a % neste dia; a justificacao faz-se pela falta.',
      v_conflito.hora_inicio, v_conflito.hora_fim
      USING ERRCODE = '23514';
  END IF;

  SELECT au.id INTO v_anew FROM public.anew_users au WHERE au.auth_user_id = v_auth LIMIT 1;
  IF v_anew IS NULL THEN
    RAISE EXCEPTION 'justificacao_dia_sem_utilizador: a sessao nao corresponde a nenhum utilizador.' USING ERRCODE = '42501';
  END IF;

  BEGIN
    INSERT INTO public.pessoas_justificacoes_dia (
      organization_id, pessoa_id, data, tipo, de_atraso,
      periodo_inicio, periodo_fim, hora_real, motivo, anexos_nomes,
      created_by, updated_by
    ) VALUES (
      _organization_id, _pessoa_id, _data, _tipo, _de_atraso,
      _periodo_inicio, _periodo_fim, _hora_real, btrim(_motivo), v_anexos,
      v_anew, v_anew
    )
    RETURNING id INTO v_id;
  EXCEPTION WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
    IF v_constraint = 'uq_pessoas_justificacoes_dia_activa' THEN
      RAISE EXCEPTION
        'justificacao_dia_ja_enviada: ja ha uma justificacao pendente ou aceite para este dia e esta hora.'
        USING ERRCODE = '23505';
    END IF;
    RAISE;
  END;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_hr_justificacao_dia_registar(uuid, uuid, date, text, boolean, time, time, text, time, text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_hr_justificacao_dia_registar(uuid, uuid, date, text, boolean, time, time, text, time, text[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_hr_justificacao_dia_registar(uuid, uuid, date, text, boolean, time, time, text, time, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_justificacao_dia_registar(uuid, uuid, date, text, boolean, time, time, text, time, text[]) TO service_role;

COMMENT ON FUNCTION public.rpc_hr_justificacao_dia_registar(uuid, uuid, date, text, boolean, time, time, text, time, text[]) IS
'Regista uma justificacao do dia. A propria pessoa com hr.assiduidade.picar, dentro do prazo da organizacao (hr_regras_assiduidade.prazo_justificacao_dias, 5 dias uteis por omissao, o valor em vigor no momento do registo); o RH (hr.assiduidade.justificacao.edit) em nome de OUTRA pessoa, tambem fora do prazo (sobre a propria ficha, o RH e so a pessoa). Recusa dia futuro, periodo ja coberto por falta activa (justifica-se pela falta) e segunda justificacao activa para o mesmo dia e hora (justificacao_dia_ja_enviada). Prazo configuravel desde 20261231991000.';


-- ==============================================================================
-- Conferir (estrutura): falha o push se algo estiver diferente do esperado.
-- ==============================================================================
DO $conferir$
DECLARE
  v_n    integer;
  v_priv text;
  v_fn   text;
BEGIN
  -- 1. Tabela: RLS, 4 politicas (1 SELECT permissiva + 3 restritivas), so
  --    SELECT para authenticated, nada para anon, sem linhas.
  IF NOT (SELECT c.relrowsecurity FROM pg_class c WHERE c.oid = to_regclass('public.hr_regras_assiduidade')) THEN
    RAISE EXCEPTION 'RLS nao esta activa em hr_regras_assiduidade.';
  END IF;
  SELECT count(*) INTO v_n FROM pg_policies WHERE schemaname = 'public' AND tablename = 'hr_regras_assiduidade';
  IF v_n <> 4 THEN
    RAISE EXCEPTION 'hr_regras_assiduidade ficou com % politicas, esperavam-se 4.', v_n;
  END IF;
  SELECT count(*) INTO v_n FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'hr_regras_assiduidade'
     AND permissive::text = 'RESTRICTIVE' AND cmd::text IN ('INSERT', 'UPDATE', 'DELETE');
  IF v_n <> 3 THEN
    RAISE EXCEPTION 'hr_regras_assiduidade: esperavam-se 3 politicas restritivas de escrita, ha %.', v_n;
  END IF;
  SELECT string_agg(DISTINCT privilege_type, ',' ORDER BY privilege_type) INTO v_priv
    FROM information_schema.role_table_grants
   WHERE table_schema = 'public' AND table_name = 'hr_regras_assiduidade' AND grantee = 'authenticated';
  IF v_priv IS DISTINCT FROM 'SELECT' THEN
    RAISE EXCEPTION 'hr_regras_assiduidade: authenticated tem "%", esperava-se exactamente SELECT.', coalesce(v_priv, '(nenhum)');
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.role_table_grants
              WHERE table_schema = 'public' AND table_name = 'hr_regras_assiduidade'
                AND grantee IN ('anon', 'PUBLIC')) THEN
    RAISE EXCEPTION 'hr_regras_assiduidade ficou com grant a anon ou PUBLIC.';
  END IF;
  SELECT count(*) INTO v_n FROM public.hr_regras_assiduidade;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'hr_regras_assiduidade devia nascer vazia (sem linha = 5); tem % linhas.', v_n;
  END IF;

  -- 2. Funcoes: volatilidade, SECURITY DEFINER, search_path fixo, sem anon/PUBLIC.
  IF (SELECT p.provolatile::text FROM pg_proc p WHERE p.oid = to_regprocedure('public.hr_justificacao_dia_prazo(date, integer)')::oid) IS DISTINCT FROM 'i'
     OR (SELECT p.provolatile::text FROM pg_proc p WHERE p.oid = to_regprocedure('public.hr_justificacao_dia_prazo(date)')::oid) IS DISTINCT FROM 'i' THEN
    RAISE EXCEPTION 'hr_justificacao_dia_prazo (1 e 2 argumentos) devia ser IMMUTABLE.';
  END IF;

  FOREACH v_fn IN ARRAY ARRAY[
    'public.hr_prazo_justificacao_dias(uuid)',
    'public.rpc_hr_regras_assiduidade_ler(uuid)',
    'public.rpc_hr_regras_assiduidade_guardar(uuid, integer)',
    'public.rpc_hr_justificacao_dia_registar(uuid, uuid, date, text, boolean, time, time, text, time, text[])'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_proc p
       WHERE p.oid = to_regprocedure(v_fn)::oid
         AND p.prosecdef
         AND array_to_string(p.proconfig, ',') LIKE '%search_path=%'
    ) THEN
      RAISE EXCEPTION '% devia existir, ser SECURITY DEFINER e ter search_path fixo.', v_fn;
    END IF;
    IF has_function_privilege('anon', v_fn, 'EXECUTE') OR has_function_privilege('public', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'anon ou PUBLIC conseguem executar %.', v_fn;
    END IF;
  END LOOP;

  IF has_function_privilege('authenticated', 'public.hr_prazo_justificacao_dias(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated consegue executar hr_prazo_justificacao_dias (devia ser so interna).';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.rpc_hr_regras_assiduidade_ler(uuid)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.rpc_hr_regras_assiduidade_guardar(uuid, integer)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.rpc_hr_justificacao_dia_registar(uuid, uuid, date, text, boolean, time, time, text, time, text[])', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated perdeu EXECUTE numa das RPCs (_ler, _guardar, _registar).';
  END IF;

  -- 3. A RPC de registar usa o prazo da organizacao e manteve a assinatura.
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = 'rpc_hr_justificacao_dia_registar') <> 1 THEN
    RAISE EXCEPTION 'rpc_hr_justificacao_dia_registar ficou com mais de uma assinatura.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
     WHERE p.oid = to_regprocedure('public.rpc_hr_justificacao_dia_registar(uuid, uuid, date, text, boolean, time, time, text, time, text[])')::oid
       AND p.prosrc LIKE '%hr_prazo_justificacao_dias(_organization_id)%'
       AND p.prosrc LIKE '%hr_justificacao_dia_prazo(_data, v_prazo_dias)%'
  ) THEN
    RAISE EXCEPTION 'rpc_hr_justificacao_dia_registar nao ficou a ler o prazo da organizacao.';
  END IF;

  -- 4. Vectores das datas (2026-10-23 e sexta; 2026-10-24 sabado; 2026-10-26 segunda).
  IF public.hr_justificacao_dia_prazo(DATE '2026-10-23', 1)  IS DISTINCT FROM DATE '2026-10-26'
     OR public.hr_justificacao_dia_prazo(DATE '2026-10-23', 5)  IS DISTINCT FROM DATE '2026-10-30'
     OR public.hr_justificacao_dia_prazo(DATE '2026-10-24', 5)  IS DISTINCT FROM DATE '2026-10-30'
     OR public.hr_justificacao_dia_prazo(DATE '2026-10-26', 5)  IS DISTINCT FROM DATE '2026-11-02'
     OR public.hr_justificacao_dia_prazo(DATE '2026-10-23', 8)  IS DISTINCT FROM DATE '2026-11-04'
     OR public.hr_justificacao_dia_prazo(DATE '2026-10-23', 30) IS DISTINCT FROM DATE '2026-12-04'
     OR public.hr_justificacao_dia_prazo(DATE '2026-10-24', 30) IS DISTINCT FROM DATE '2026-12-04'
     OR public.hr_justificacao_dia_prazo(DATE '2026-10-23', 0)  IS NOT NULL
     OR public.hr_justificacao_dia_prazo(DATE '2026-10-23', 31) IS NOT NULL
     OR public.hr_justificacao_dia_prazo(DATE '2026-10-23', -3) IS NOT NULL
     OR public.hr_justificacao_dia_prazo(DATE '2026-10-23', NULL) IS NOT NULL
     OR public.hr_justificacao_dia_prazo(NULL::date, 5) IS NOT NULL
     OR public.hr_justificacao_dia_prazo(DATE '2026-10-23') IS DISTINCT FROM DATE '2026-10-30' THEN
    RAISE EXCEPTION 'hr_justificacao_dia_prazo nao bate com os vectores (1, 5, 8 e 30 dias; fora de 1..30 = NULL).';
  END IF;

  -- 5. Sem linha, o prazo e 5 (uma organizacao que nao existe).
  IF public.hr_prazo_justificacao_dias(gen_random_uuid()) IS DISTINCT FROM 5 THEN
    RAISE EXCEPTION 'hr_prazo_justificacao_dias sem linha devia dar 5.';
  END IF;

  RAISE NOTICE 'OK: hr_regras_assiduidade vazia, com RLS e escrita so pela RPC; funcoes com search_path e sem anon; registar le o prazo da organizacao; 13 vectores das datas.';
END;
$conferir$;


-- ==============================================================================
-- Conferir (ao vivo, so na organizacao nike): cria e DESFAZ tudo com a
-- sentinela HR900 (a subtransaccao reverte as linhas e os set_config).
-- ==============================================================================
DO $conferir_vivo$
DECLARE
  v_org_nike uuid := 'b6ffce4f-f630-4933-833a-008649757a33'::uuid;
  v_r        public.hr_regras_assiduidade%ROWTYPE;
  v_cons     text;
  v_estado   text;
  v_msg      text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.anew_organizations WHERE id = v_org_nike) THEN
    RAISE NOTICE 'Org nike nao encontrada neste ambiente -- o conferir ao vivo do prazo foi saltado.';
    RETURN;
  END IF;

  BEGIN
    -- 1. Sem linha: 5.
    IF public.hr_prazo_justificacao_dias(v_org_nike) IS DISTINCT FROM 5 THEN
      RAISE EXCEPTION 'A nike sem linha devia ter prazo 5.' USING ERRCODE = 'HR964';
    END IF;

    -- 2. Com linha: o valor da linha. Escritas SO na nike.
    INSERT INTO public.hr_regras_assiduidade (organization_id) VALUES (v_org_nike) RETURNING * INTO v_r;
    IF v_r.prazo_justificacao_dias <> 5 THEN
      RAISE EXCEPTION 'O default de prazo_justificacao_dias devia ser 5; e %.', v_r.prazo_justificacao_dias USING ERRCODE = 'HR964';
    END IF;
    UPDATE public.hr_regras_assiduidade SET prazo_justificacao_dias = 8 WHERE id = v_r.id;
    IF public.hr_prazo_justificacao_dias(v_org_nike) IS DISTINCT FROM 8 THEN
      RAISE EXCEPTION 'hr_prazo_justificacao_dias devia ler 8 da linha da nike.' USING ERRCODE = 'HR964';
    END IF;

    -- 3. O CHECK recusa 0 e 31.
    v_cons := NULL;
    BEGIN
      UPDATE public.hr_regras_assiduidade SET prazo_justificacao_dias = 0 WHERE id = v_r.id;
    EXCEPTION WHEN check_violation THEN
      GET STACKED DIAGNOSTICS v_cons = CONSTRAINT_NAME;
    END;
    IF v_cons IS DISTINCT FROM 'hr_regras_assiduidade_prazo_valido' THEN
      RAISE EXCEPTION 'prazo 0 devia ser recusado por hr_regras_assiduidade_prazo_valido; foi por %.', coalesce(v_cons, '(nada)')
        USING ERRCODE = 'HR964';
    END IF;
    v_cons := NULL;
    BEGIN
      UPDATE public.hr_regras_assiduidade SET prazo_justificacao_dias = 31 WHERE id = v_r.id;
    EXCEPTION WHEN check_violation THEN
      GET STACKED DIAGNOSTICS v_cons = CONSTRAINT_NAME;
    END;
    IF v_cons IS DISTINCT FROM 'hr_regras_assiduidade_prazo_valido' THEN
      RAISE EXCEPTION 'prazo 31 devia ser recusado por hr_regras_assiduidade_prazo_valido; foi por %.', coalesce(v_cons, '(nada)')
        USING ERRCODE = 'HR964';
    END IF;

    -- 4. As RPCs recusam sem sessao e sem permissao (utilizador fabricado).
    PERFORM set_config('request.jwt.claims', '', true);
    PERFORM set_config('request.jwt.claim.sub', '', true);
    v_estado := NULL; v_msg := NULL;
    BEGIN
      PERFORM public.rpc_hr_regras_assiduidade_guardar(v_org_nike, 10);
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_estado = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT;
    END;
    IF v_estado IS DISTINCT FROM '42501' OR v_msg NOT LIKE 'regras_assiduidade_sem_permissao%' THEN
      RAISE EXCEPTION '_guardar sem sessao devia dar 42501 regras_assiduidade_sem_permissao; deu % %.', coalesce(v_estado, 'sucesso'), coalesce(v_msg, '-')
        USING ERRCODE = 'HR964';
    END IF;

    PERFORM set_config('request.jwt.claim.sub', gen_random_uuid()::text, true);
    v_estado := NULL; v_msg := NULL;
    BEGIN
      PERFORM public.rpc_hr_regras_assiduidade_guardar(v_org_nike, 10);
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_estado = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT;
    END;
    IF v_estado IS DISTINCT FROM '42501' OR v_msg NOT LIKE 'regras_assiduidade_sem_permissao%' THEN
      RAISE EXCEPTION '_guardar sem permissao devia dar 42501 regras_assiduidade_sem_permissao; deu % %.', coalesce(v_estado, 'sucesso'), coalesce(v_msg, '-')
        USING ERRCODE = 'HR964';
    END IF;
    v_estado := NULL; v_msg := NULL;
    BEGIN
      PERFORM * FROM public.rpc_hr_regras_assiduidade_ler(v_org_nike);
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_estado = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT;
    END;
    IF v_estado IS DISTINCT FROM '42501' OR v_msg NOT LIKE 'regras_assiduidade_sem_permissao%' THEN
      RAISE EXCEPTION '_ler sem permissao devia dar 42501 regras_assiduidade_sem_permissao; deu % %.', coalesce(v_estado, 'sucesso'), coalesce(v_msg, '-')
        USING ERRCODE = 'HR964';
    END IF;

    -- A linha nao mudou.
    IF (SELECT r.prazo_justificacao_dias FROM public.hr_regras_assiduidade r WHERE r.id = v_r.id) <> 8 THEN
      RAISE EXCEPTION 'Uma chamada recusada mudou a linha da nike.' USING ERRCODE = 'HR964';
    END IF;

    RAISE EXCEPTION 'teste_prazo_justificacao_configuravel_20261231991000_ok' USING ERRCODE = 'HR900';
  EXCEPTION
    WHEN SQLSTATE 'HR900' THEN
      NULL; -- sucesso: tudo desfeito pela subtransaccao.
    WHEN OTHERS THEN
      RAISE EXCEPTION 'O conferir ao vivo do prazo configuravel falhou -- SQLSTATE %: %', SQLSTATE, SQLERRM;
  END;

  IF EXISTS (SELECT 1 FROM public.hr_regras_assiduidade) THEN
    RAISE EXCEPTION 'O conferir ao vivo deixou linhas em hr_regras_assiduidade.';
  END IF;

  RAISE NOTICE 'CONFERIR AO VIVO (nike): sem linha = 5, linha = 8, CHECK recusa 0 e 31, _guardar e _ler recusam sem sessao/permissao com 42501. Tudo desfeito.';
END;
$conferir_vivo$;

-- ==============================================================================
-- ANTES DO db push
--
-- 1. PRECISA DE CODIGO NOVO: ver o cabecalho; entra no mesmo envio para o main.
-- 2. Listar o que esta pendente IMEDIATAMENTE antes do push
--    (supabase migration list --linked): o push aplica TUDO o que estiver na
--    pasta, por ordem. Nunca migration repair.
-- 3. Correr o TESTE ANTES do push. Depois de aplicada, NAO se volta atras para
--    demonstrar o vermelho.
-- ==============================================================================
