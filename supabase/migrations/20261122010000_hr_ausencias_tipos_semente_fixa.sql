-- ==============================================================================
-- hr_ausencias_tipos deixa de ser um catalogo vazio a espera de alguem o
-- preencher: passa a nascer com onze tipos fixos, por organizacao.
--
-- POR APLICAR.
--
--
-- -- O PROBLEMA ----------------------------------------------------------------
--
-- A 20261121020000 criou hr_ausencias_tipos SEM SEED, de proposito: "Criar o
-- catalogo e decisao de produto de cada organizacao". O utilizador, a olhar
-- para o ecra, decidiu o contrario: os tipos de ausencia sao sempre os mesmos
-- onze, e NAO devem ser configuraveis. O ecra de edicao (/rh/definicoes/
-- ausencias-tipos) sai nesta ronda pelo lado da aplicacao; esta migracao trata
-- do lado da base -- semear os onze tipos e nao deixar mais nenhum nascer vazio.
--
--
-- -- A REGRA NOVA ----------------------------------------------------------------
--
-- public.hr_ausencias_tipos_semear(_organization_id uuid) insere os onze tipos
-- canonicos numa organizacao, se ainda nao existir ali um tipo com o mesmo
-- codigo (comparando por lower(btrim(codigo)), como o indice unico parcial da
-- tabela). E SECURITY DEFINER porque corre tanto a partir desta migracao (dono
-- da base) como a partir do trigger sobre anew_organizations (que corre como o
-- utilizador que criou a organizacao, sem hr.ausencias.tipos.edit nenhum).
--
-- Os onze, com o comportamento exacto pedido:
--
--   codigo               categoria           desconta  chefia  rh    justif  sensivel
--   FERIAS               ferias              true      true    true  false   false
--   ASSIST_FAMILIA        falta_justificada   false     true    true  false   false
--   BAIXA_MEDICA          doenca              false     false   false true    true
--   CASAMENTO             falta_justificada   false     true    true  false   false
--   CONGRESSO             outro               false     true    true  false   false
--   DOENCA_FAMILIAR       doenca              false     false   false true    true
--   EXAMES                falta_justificada   false     true    true  false   false
--   LICENCA_PARENTAL      parentalidade       false     false   false true    true
--   MOTIVOS_FAMILIARES    falta_justificada   false     true    true  false   false
--   OUTRO                 outro               false     true    true  false   false
--   TELETRABALHO          outro               false     true    true  false   false
--
-- "Exige aprovacao" = exige_aprovacao_chefia E exige_aprovacao_rh a true, os
-- DOIS passos do fluxo ja construido. Os tres de saude (BAIXA_MEDICA,
-- DOENCA_FAMILIAR, LICENCA_PARENTAL) NAO exigem aprovacao -- o utilizador foi
-- explicito nisso -- e por isso NAO tem sentido pedir-lhes documento antes de
-- alguem decidir: ficam com exige_aprovacao_* a false. justificacao_sensivel
-- exige exige_justificacao=true (CHECK hr_ausencias_tipos_sensivel_exige_
-- justificacao, 20261121020000): os tres levam por isso exige_justificacao=
-- true, e e essa combinacao -- sensivel=true, aprovacao=false, justificacao=
-- true -- que activa a protecao do dado de saude sem bloquear ninguem a
-- espera de uma chefia. conta_minimo_legal so em FERIAS.
--
--
-- -- COMO SE SEMEIA: TRIGGER, NAO SO NAS EXISTENTES ----------------------------
--
-- Tres formas possiveis, com o custo de cada uma:
--
-- 1. So nas organizacoes existentes -- um INSERT...SELECT contra
--    anew_organizations. Barato, mas qualquer organizacao criada depois desta
--    migracao nasce sem NENHUM tipo, e o proprio comentario da 20261121020000
--    ja descrevia esse estado como inutilizavel ("nao ha tipo nenhum e nao se
--    consegue pedir ausencia nenhuma"). Havendo tres caminhos de criacao de
--    organizacao (create_initial_organization, rpc_create_organization,
--    rpc_create_organization_with_hierarchy), seria preciso alterar os tres, e
--    o proximo caminho que alguem escrever esquece-se outra vez.
-- 2. Tipos globais (organization_id NULL) -- obrigaria a levantar o NOT NULL
--    de organization_id, refazer a UNIQUE (id, organization_id) e as QUATRO FKs
--    compostas que dependem dela (direitos, ajustes, pedidos, dias), e
--    reescrever a RLS das cinco tabelas. Cirurgia no coracao do modulo para um
--    ganho estetico. Rejeitado.
-- 3. Trigger AFTER INSERT em anew_organizations -- confirmado por grep que nao
--    existe hoje nenhum AFTER INSERT nessa tabela (so um BEFORE INSERT de
--    identidade de entidade e um AFTER de auditoria). Cobre os tres RPCs de
--    criacao e qualquer caminho futuro, num so sitio. Escolhida.
--
--
-- -- A FK PARA anew_organizations PASSA A CASCADE --------------------------------
--
-- 20261121020000 criou hr_ausencias_tipos_org_fkey como ON DELETE RESTRICT,
-- pelo MESMO regime de hr_locais_trabalho e pessoas: "apagar uma organizacao
-- com dados de pe nao se faz em silencio". Essa razao vale para dados que a
-- organizacao ESCOLHEU ter. Deixa de valer aqui: esta migracao (e o trigger
-- que ela cria) semeia os onze tipos em TODA a organizacao, existente ou
-- futura, sem que ninguem peca. Depois desta migracao, RESTRICT deixa de
-- proteger uma escolha -- passa a bloquear rpc_delete_organization (via
-- delete_organization_subtree, 20260818010000) em TODAS as organizacoes,
-- sempre, porque a linha que trava o DELETE e a propria semente do sistema, e
-- ela nunca falta.
--
-- Confirmado por grep (ver abaixo) que nenhuma outra tabela de RH tem este
-- problema: hr_pessoas_nucleo, hr_locais_trabalho e hr_picagens_dispositivos
-- sao RESTRICT tambem, mas so ganham linhas quando alguem cria pessoas, locais
-- ou dispositivos -- conteudo real, escolhido, e por isso continuam RESTRICT.
-- hr_ausencias_tipos e o UNICO caso de RESTRICT sobre uma tabela com semente
-- automatica incondicional; e correccao fica so aqui.
--
-- CASCADE: o catalogo fixo e dado de SISTEMA, sem valor fora da organizacao a
-- que pertence -- ao contrario de pessoas ou locais, ninguem reaproveita um
-- tipo de ausencia de uma organizacao apagada. As FKs compostas de
-- pessoas_ausencias_direitos, _ajustes, _pedidos e _dias apontam para
-- (id, organization_id) desta tabela; quando a organizacao cai, essas linhas
-- ja caem primeiro pelas SUAS proprias FKs a anew_organizations (todas
-- CASCADE), por isso o CASCADE aqui nao arrasta nada que a arvore de apagamento
-- nao arrastasse de qualquer forma -- so deixa de bloquear o ultimo passo.
--
--
-- -- O QUE FICA DE FORA ---------------------------------------------------------
--
-- - Fechar a escrita da tabela: migracao seguinte (20261122020000), que
--   confirma esta semente antes de fechar a porta.
-- - Tipos pre-existentes fora da lista canonica: nao se apagam nem se
--   tocam nesta migracao alem de contar e (se sem dependentes) desactivar --
--   ha FKs de pedidos, direitos, ajustes e dias que lhes podem apontar.
--
--
-- -- COMO SE REVERTE -------------------------------------------------------------
--
-- Sem ficheiro de reversao nesta pasta, de proposito. A mao:
--   DROP TRIGGER trg_hr_ausencias_tipos_semear_na_criacao_org ON public.anew_organizations;
--   DROP FUNCTION public.hr_ausencias_tipos_semear_trigger();
--   DROP FUNCTION public.hr_ausencias_tipos_semear(uuid);
--   ALTER TABLE public.hr_ausencias_tipos DROP CONSTRAINT hr_ausencias_tipos_org_fkey,
--     ADD CONSTRAINT hr_ausencias_tipos_org_fkey FOREIGN KEY (organization_id)
--     REFERENCES public.anew_organizations (id) ON DELETE RESTRICT;
--   -- os tipos semeados ficam (tem UNIQUE por codigo e podem ja ter pedidos).
--
--
-- Prerequisitos:
--   20261121020000  hr_ausencias_tipos (unique hr_ausencias_tipos_id_org_key,
--                    indice uq_hr_ausencias_tipos_org_codigo)
-- ==============================================================================

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
BEGIN
  IF to_regclass('public.hr_ausencias_tipos') IS NULL THEN
    RAISE EXCEPTION 'public.hr_ausencias_tipos nao existe. Aplicar 20261121020000 primeiro.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname = 'public' AND indexname = 'uq_hr_ausencias_tipos_org_codigo'
  ) THEN
    RAISE EXCEPTION
      'uq_hr_ausencias_tipos_org_codigo nao existe. A semente depende dele para nao duplicar codigos.';
  END IF;

  IF to_regclass('public.anew_organizations') IS NULL THEN
    RAISE EXCEPTION 'public.anew_organizations nao existe. Estado da base inesperado.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'trg_hr_ausencias_tipos_semear_na_criacao_org'
       AND tgrelid = to_regclass('public.anew_organizations')
  ) THEN
    RAISE EXCEPTION
      'trg_hr_ausencias_tipos_semear_na_criacao_org ja existe. Investigar antes de reaplicar.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'hr_ausencias_tipos_org_fkey'
       AND conrelid = to_regclass('public.hr_ausencias_tipos')
  ) THEN
    RAISE EXCEPTION
      'hr_ausencias_tipos_org_fkey nao existe. Estado da base inesperado -- aplicar 20261121020000 primeiro.';
  END IF;
END;
$guardas$;

-- ---- A FK do catalogo passa a CASCADE ---------------------------------------
-- Semeado incondicionalmente em toda a organizacao (esta migracao, o trigger
-- abaixo), o catalogo deixa de poder ser RESTRICT sem bloquear
-- rpc_delete_organization SEMPRE. So se altera se ainda estiver RESTRICT --
-- idempotente, para reaplicar nao falhar contra uma base ja corrigida.
DO $fk_cascade$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'hr_ausencias_tipos_org_fkey'
       AND conrelid = to_regclass('public.hr_ausencias_tipos')
       AND confdeltype = 'r'
  ) THEN
    ALTER TABLE public.hr_ausencias_tipos
      DROP CONSTRAINT hr_ausencias_tipos_org_fkey;

    ALTER TABLE public.hr_ausencias_tipos
      ADD CONSTRAINT hr_ausencias_tipos_org_fkey
      FOREIGN KEY (organization_id) REFERENCES public.anew_organizations (id) ON DELETE CASCADE;
  END IF;
END;
$fk_cascade$;

-- ---- A funcao de semente ----------------------------------------------------
CREATE OR REPLACE FUNCTION public.hr_ausencias_tipos_semear(_organization_id uuid)
RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_inseridos integer;
BEGIN
  IF _organization_id IS NULL THEN
    RAISE EXCEPTION 'hr_ausencias_tipos_semear: _organization_id nao pode ser nulo.' USING ERRCODE = '23502';
  END IF;

  WITH canonicos (codigo, nome, categoria, desconta_saldo, conta_minimo_legal,
                   exige_aprovacao_chefia, exige_aprovacao_rh, exige_justificacao,
                   justificacao_sensivel, display_order) AS (
    VALUES
      ('FERIAS',              'Férias',                  'ferias',            true,  true,  true,  true,  false, false, 10),
      ('ASSIST_FAMILIA',      'Assistência a família',   'falta_justificada', false, false, true,  true,  false, false, 20),
      ('BAIXA_MEDICA',        'Baixa médica',             'doenca',            false, false, false, false, true,  true,  30),
      ('CASAMENTO',           'Casamento',                'falta_justificada', false, false, true,  true,  false, false, 40),
      ('CONGRESSO',           'Congresso',                'outro',             false, false, true,  true,  false, false, 50),
      ('DOENCA_FAMILIAR',     'Doença de um familiar',    'doenca',            false, false, false, false, true,  true,  60),
      ('EXAMES',              'Exames',                   'falta_justificada', false, false, true,  true,  false, false, 70),
      ('LICENCA_PARENTAL',    'Licença parental',        'parentalidade',     false, false, false, false, true,  true,  80),
      ('MOTIVOS_FAMILIARES',  'Motivos familiares',       'falta_justificada', false, false, true,  true,  false, false, 90),
      ('OUTRO',               'Outro',                    'outro',             false, false, true,  true,  false, false, 100),
      ('TELETRABALHO',        'Teletrabalho',              'outro',             false, false, true,  true,  false, false, 110)
  )
  INSERT INTO public.hr_ausencias_tipos (
    organization_id, codigo, nome, categoria,
    desconta_saldo, conta_minimo_legal,
    exige_aprovacao_chefia, exige_aprovacao_rh,
    exige_justificacao, justificacao_sensivel,
    remunerada, permite_meio_dia, unidade_apresentacao, activo
  )
  SELECT
    _organization_id, c.codigo, c.nome, c.categoria,
    c.desconta_saldo, c.conta_minimo_legal,
    c.exige_aprovacao_chefia, c.exige_aprovacao_rh,
    c.exige_justificacao, c.justificacao_sensivel,
    true, true, 'dia', true
  FROM canonicos c
  WHERE NOT EXISTS (
    SELECT 1 FROM public.hr_ausencias_tipos t
     WHERE t.organization_id = _organization_id
       AND t.deleted_at IS NULL
       AND lower(btrim(t.codigo)) = lower(btrim(c.codigo))
  );

  GET DIAGNOSTICS v_inseridos = ROW_COUNT;
  RETURN v_inseridos;
END;
$$;

COMMENT ON FUNCTION public.hr_ausencias_tipos_semear(uuid) IS
'Insere os onze tipos de ausencia CANONICOS e FIXOS numa organizacao, saltando os codigos que ja existam ali (comparado como o indice unico parcial da tabela: lower(btrim(codigo)), so entre os vivos). Idempotente: chamar duas vezes na mesma organizacao na segunda nao insere nada. SECURITY DEFINER porque corre tambem a partir do trigger de criacao de organizacao, sob o utilizador que a criou, sem hr.ausencias.tipos.edit nenhum -- e essa permissao, de qualquer forma, deixou de dar acesso a escrita (20261122020000).';

REVOKE ALL ON FUNCTION public.hr_ausencias_tipos_semear(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_ausencias_tipos_semear(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.hr_ausencias_tipos_semear(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.hr_ausencias_tipos_semear(uuid) TO service_role;

-- ---- O trigger na criacao de organizacao ------------------------------------
CREATE OR REPLACE FUNCTION public.hr_ausencias_tipos_semear_trigger()
RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  PERFORM public.hr_ausencias_tipos_semear(NEW.id);
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.hr_ausencias_tipos_semear_trigger() IS
'Chama hr_ausencias_tipos_semear para a organizacao recem-criada. Cobre os tres caminhos de criacao de organizacao (create_initial_organization, rpc_create_organization, rpc_create_organization_with_hierarchy) e qualquer caminho futuro, num so sitio -- em vez de alterar os tres RPCs.';

DROP TRIGGER IF EXISTS trg_hr_ausencias_tipos_semear_na_criacao_org ON public.anew_organizations;
CREATE TRIGGER trg_hr_ausencias_tipos_semear_na_criacao_org
  AFTER INSERT ON public.anew_organizations
  FOR EACH ROW EXECUTE FUNCTION public.hr_ausencias_tipos_semear_trigger();

REVOKE ALL ON FUNCTION public.hr_ausencias_tipos_semear_trigger() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_ausencias_tipos_semear_trigger() FROM anon;
REVOKE ALL ON FUNCTION public.hr_ausencias_tipos_semear_trigger() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.hr_ausencias_tipos_semear_trigger() TO service_role;

-- ---- Semear as organizacoes existentes --------------------------------------
DO $semear$
DECLARE
  v_org               record;
  v_total_orgs        integer := 0;
  v_total_inseridos   integer := 0;
  v_inseridos_aqui    integer;
BEGIN
  FOR v_org IN SELECT id FROM public.anew_organizations LOOP
    v_total_orgs := v_total_orgs + 1;
    v_inseridos_aqui := public.hr_ausencias_tipos_semear(v_org.id);
    v_total_inseridos := v_total_inseridos + v_inseridos_aqui;
  END LOOP;

  RAISE NOTICE
    'Semente aplicada a % organizacao(oes) existente(s), % linha(s) inserida(s) no total.',
    v_total_orgs, v_total_inseridos;
END;
$semear$;

-- ---- Tipos pre-existentes fora da lista canonica: contar, nunca apagar -----
DO $orfaos$
DECLARE
  v_orfaos_sem_dependentes integer := 0;
  v_orfaos_com_dependentes text;
  v_rec record;
  v_tem_dependente boolean;
BEGIN
  FOR v_rec IN
    SELECT t.id, t.organization_id, t.codigo
      FROM public.hr_ausencias_tipos t
     WHERE t.deleted_at IS NULL
       AND lower(btrim(t.codigo)) NOT IN (
         'ferias','assist_familia','baixa_medica','casamento','congresso',
         'doenca_familiar','exames','licenca_parental','motivos_familiares',
         'outro','teletrabalho'
       )
  LOOP
    v_tem_dependente := false;

    IF to_regclass('public.pessoas_ausencias_direitos') IS NOT NULL THEN
      SELECT EXISTS (SELECT 1 FROM public.pessoas_ausencias_direitos d WHERE d.tipo_id = v_rec.id)
        INTO v_tem_dependente;
    END IF;
    IF NOT v_tem_dependente AND to_regclass('public.pessoas_ausencias_pedidos') IS NOT NULL THEN
      SELECT EXISTS (SELECT 1 FROM public.pessoas_ausencias_pedidos pd WHERE pd.tipo_id = v_rec.id)
        INTO v_tem_dependente;
    END IF;
    IF NOT v_tem_dependente AND to_regclass('public.pessoas_ausencias_ajustes') IS NOT NULL THEN
      SELECT EXISTS (SELECT 1 FROM public.pessoas_ausencias_ajustes a WHERE a.tipo_id = v_rec.id)
        INTO v_tem_dependente;
    END IF;

    IF v_tem_dependente THEN
      v_orfaos_com_dependentes := coalesce(v_orfaos_com_dependentes || ', ', '')
        || v_rec.codigo || ' (org ' || v_rec.organization_id || ')';
    ELSE
      UPDATE public.hr_ausencias_tipos SET activo = false WHERE id = v_rec.id;
      v_orfaos_sem_dependentes := v_orfaos_sem_dependentes + 1;
    END IF;
  END LOOP;

  IF v_orfaos_sem_dependentes > 0 THEN
    RAISE NOTICE
      '% tipo(s) fora da lista canonica, sem dependentes, desactivado(s) (activo=false).',
      v_orfaos_sem_dependentes;
  END IF;

  IF v_orfaos_com_dependentes IS NOT NULL THEN
    RAISE NOTICE
      'Tipo(s) fora da lista canonica COM dependentes, deixados activos e intocados: %',
      v_orfaos_com_dependentes;
  END IF;
END;
$orfaos$;

-- ---- Conferir ----------------------------------------------------------------
DO $conferir$
DECLARE
  v_orgs_sem_11   integer;
  v_org_exemplo   uuid;
  v_codigos       integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'hr_ausencias_tipos_semear' AND p.pronargs = 1
  ) THEN
    RAISE EXCEPTION 'hr_ausencias_tipos_semear(uuid) nao ficou criada.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'hr_ausencias_tipos_org_fkey'
       AND conrelid = to_regclass('public.hr_ausencias_tipos')
       AND confdeltype = 'c'
  ) THEN
    RAISE EXCEPTION
      'hr_ausencias_tipos_org_fkey nao ficou CASCADE. Com semente incondicional, RESTRICT bloqueia rpc_delete_organization sempre.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'trg_hr_ausencias_tipos_semear_na_criacao_org'
       AND tgrelid = to_regclass('public.anew_organizations')
       AND tgenabled <> 'D'
  ) THEN
    RAISE EXCEPTION 'trg_hr_ausencias_tipos_semear_na_criacao_org nao ficou criado ou ficou desactivado.';
  END IF;

  SELECT count(*) INTO v_orgs_sem_11
    FROM public.anew_organizations o
   WHERE (
     SELECT count(DISTINCT lower(btrim(t.codigo)))
       FROM public.hr_ausencias_tipos t
      WHERE t.organization_id = o.id AND t.deleted_at IS NULL
   ) < 11;

  IF v_orgs_sem_11 > 0 THEN
    SELECT o.id INTO v_org_exemplo
      FROM public.anew_organizations o
     WHERE (
       SELECT count(DISTINCT lower(btrim(t.codigo)))
         FROM public.hr_ausencias_tipos t
        WHERE t.organization_id = o.id AND t.deleted_at IS NULL
     ) < 11
     LIMIT 1;

    RAISE EXCEPTION
      '% organizacao(oes) ficaram com menos de 11 codigos distintos de tipo de ausencia (exemplo: org %). A semente nao cobriu todas.',
      v_orgs_sem_11, v_org_exemplo;
  END IF;

  RAISE NOTICE 'Conferido: todas as organizacoes tem os 11 codigos distintos de tipo de ausencia, e o trigger de criacao esta activo.';
END;
$conferir$;
