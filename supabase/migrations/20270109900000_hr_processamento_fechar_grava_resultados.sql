-- ==============================================================================
-- Regras salariais, ENTREGA D: fechar um periodo da folha GRAVA o resultado de
-- cada pessoa, e um periodo fechado le o gravado (nao recalcula).
--
-- PROVISORIO. NAO FAZER db push sem: (1) listar o remoto imediatamente antes e
-- confirmar que 20270109900000 fica acima do maximo aplicado (20270109800000);
-- (2) correr a prova na nike em transaccao desfeita ANTES do push; (3) revisao
-- ecc:database-reviewer e ecc:security-reviewer. Depende de 20261207020400
-- (periodos), 20270107500000 (data_inicio/data_fim) e 20270109600000
-- (hr_regras_salariais, hr_regras_salariais_em).
--
--
-- -- PRECISA DE CODIGO NOVO NO MESMO ENVIO --------------------------------------
--
-- SIM. A RPC de fechar muda de assinatura: (uuid) -> (uuid, jsonb). O cliente
-- de hoje (useProcessamentoPeriodo.ts: hrRpc com so p_periodo_id) deixa de
-- encontrar a funcao no instante do push, e o botao "Fechar periodo" falha para
-- TODAS as organizacoes da base RH ate o codigo novo estar publicado. O
-- cliente novo tem de:
--   - enviar p_resultados (formato abaixo) com o resultado de TODAS as pessoas
--     OBRIGATORIAS (ver "pessoas do periodo"), so depois de o calculo de todas
--     ter terminado;
--   - pedir tambem o id de pessoas_retribuicoes (hoje nao o pede) para o
--     enviar em retribuicao_id, e enviar so a versao em vigor no data_fim (a
--     fallback "a mais recente" de escolherRetribuicaoVigente e recusada);
--   - num periodo fechado, ler rpc_hr_processamento_resultados_ler e NAO
--     recalcular, em paginas: chamar com p_depois = NULL, depois repetir com
--     p_depois = o ultimo pessoa_id recebido, ate vir menos de 500 linhas.
--     Zero linhas na primeira pagina de um periodo fechado = "fechado antes
--     do registo";
--   - ler os resultados exige hr.processamento.periodo.view E
--     hr.pessoas.retribuicao.view.
--
--
-- -- PESSOAS DO PERIODO ----------------------------------------------------------
--
-- Vinculo sobreposto: um pessoas_vinculos nao apagado com data_inicio <=
-- data_fim do periodo e (data_fim do vinculo NULL ou >= data_inicio do
-- periodo). data_fim do vinculo e o ultimo dia do contrato (inclusive); NULL =
-- sem fim.
--   OBRIGATORIAS: pessoas da organizacao sem deleted_at, estado_registo =
--     'activo', com vinculo sobreposto. Falta uma: resultado_em_falta.
--   PERMITIDAS: pessoas da organizacao sem deleted_at, activas OU arquivadas,
--     com vinculo sobreposto. Quem nao e permitida: pessoa_fora_do_periodo.
--
--
-- -- RISCO ACEITE ----------------------------------------------------------------
--
-- O calculo continua no cliente. A RPC valida a ESTRUTURA de cada resultado, a
-- COERENCIA dos lancamentos pontuais (totais.lancamentos_pontuais = soma dos
-- lancamentos manuais nao anulados da pessoa no periodo, ao centimo) e as
-- VERSOES (regra em vigor no data_fim, retribuicao em vigor no data_fim da
-- pessoa, cargo da organizacao). Nao recalcula nem confere os restantes
-- valores (base, horas, subsidio, regras, total): quem tem
-- hr.processamento.periodo.gerir pode gravar valores errados com a forma
-- certa. Fica gravado quem fechou e quando. Tambem nao confere lancamentos de
-- pessoas que nao vem na lista (so possivel para quem nao e obrigatoria).
--
--
-- -- O QUE MUDA ----------------------------------------------------------------
--
-- 1. Tabela nova hr_processamento_resultados: uma linha por (periodo, pessoa)
--    com os totais, as linhas, os avisos, o valor hora usado, a versao da
--    retribuicao / do cargo / da regra salarial, quem fechou e quando.
--    - Imutavel por trigger: UPDATE, DELETE e TRUNCATE recusados; INSERT so
--      enquanto o periodo esta aberto (a RPC insere e fecha a seguir, na mesma
--      transaccao).
--    - fechado_por SEM FK, de proposito: um ON DELETE SET NULL seria um
--      UPDATE, que a imutabilidade recusa (mesmo desenho de
--      hr_regras_salariais_eventos.feito_por).
--    - FKs RESTRICT para a organizacao, o periodo (composta com a organizacao)
--      e a pessoa (composta com a organizacao): apagar uma pessoa ou um
--      periodo com resultados gravados passa a ser recusado. Dados de folha
--      nao desaparecem em silencio.
--    - RLS forcada. SELECT a authenticated com hr.processamento.periodo.view
--      E hr.pessoas.retribuicao.view na organizacao (sao valores salariais).
--      Sem politica nem privilegio de escrita: so a RPC (definer). anon,
--      PUBLIC e service_role sem privilegios.
--
-- 2. rpc_hr_processamento_periodo_fechar: larga-se a de 1 argumento
--    (20261207020400; 20270107500000 so conferiu o md5, nao a reescreveu) e
--    cria-se rpc_hr_processamento_periodo_fechar(p_periodo_id uuid,
--    p_resultados jsonb) RETURNS void. Mantem, pela mesma ordem e com as
--    mesmas mensagens: sessao, FOR UPDATE do periodo, permissao gerir ANTES de
--    revelar se o periodo existe, nao encontrado, ja fechado, autor. Depois:
--    valida a estrutura de cada resultado, recusa pessoas repetidas, pessoas
--    sem vinculo no periodo, pessoas obrigatorias sem resultado, lancamentos
--    pontuais que nao batem com a base, resultados calculados com outra regra
--    salarial, retribuicao que nao e a em vigor no data_fim e cargo de outra
--    organizacao; grava e fecha na MESMA transaccao (ver RISCO ACEITE).
--    - A regra salarial gravada e a do SERVIDOR (em vigor no data_fim do
--      periodo); o regra_salarial_id que o cliente envia tem de ser igual.
--    - A verificacao de desvios por validar fica ESCRITA E COMENTADA: a tabela
--      dos desvios chega na entrega seguinte.
--    - search_path passa de 'public, pg_temp' a '' (tudo qualificado).
--    - EXECUTE so a authenticated (antes tambem service_role).
--
-- 3. rpc_hr_processamento_resultados_ler(p_periodo_id uuid, p_depois uuid
--    DEFAULT NULL): os resultados gravados de um periodo FECHADO, no maximo
--    500 por chamada, ordenados por pessoa_id e a seguir a p_depois (keyset).
--    O cliente repete com o ultimo pessoa_id ate vir menos de 500. Exige
--    hr.processamento.periodo.view e hr.pessoas.retribuicao.view. Periodo
--    aberto: erro. Periodo fechado antes desta migration: zero linhas.
--
--
-- -- FORMATO DE p_resultados ---------------------------------------------------
--
-- Um array jsonb, um objecto por pessoa (todas as obrigatorias; outras
-- permitidas opcionais; ate 5000; ate 8 MB no total).
-- Cada objecto tem EXACTAMENTE estes campos (campo a mais ou a menos recusa):
--   pessoa_id          string uuid
--   valor_hora         number >= 0 e <= 10000, ou null   (gravado a 4 casas)
--   total_bruto        number (abs <= 10 000 000), ou null (gravado a 2 casas)
--   totais             objecto com EXACTAMENTE: base_mes, divisor_duodecimos,
--                      total_codigos_automaticos, total_regras,
--                      desconto_faltas, subsidio_alimentacao,
--                      lancamentos_pontuais -- cada um number ou null.
--                      lancamentos_pontuais (null = 0) tem de ser, ao centimo,
--                      a soma dos lancamentos MANUAIS nao anulados da pessoa
--                      no periodo (km e ajudas nao entram).
--   linhas             array (ate 500) de objectos; cada um com origem
--                      ('codigo' | 'regra' | 'lancamento') e valor (number);
--                      outros campos livres (ate 2000 bytes por linha)
--   avisos             array (ate 20) de strings ^[a-z_]{1,60}$
--   retribuicao_id     string uuid da versao de pessoas_retribuicoes da pessoa
--                      EM VIGOR no data_fim (valido_de <= data_fim < valido_ate,
--                      sem deleted_at), ou null
--   cargo_periodo_id   string uuid de hr_cargos_periodos (da organizacao), ou null
--   regra_salarial_id  string uuid, ou null; tem de ser a regra em vigor no
--                      data_fim do periodo (null se nao houver regra)
--
--
-- -- O QUE MUDA PARA AS OUTRAS ORGANIZACOES DA BASE RH --------------------------
--
-- Fechar passa a exigir o resultado de todas as pessoas activas com vinculo
-- no periodo. Quem fechar sem ver todas essas pessoas (ambito) ve o fecho
-- recusado com processamento_fechar_resultado_em_falta. Periodos ja fechados
-- nao sao tocados (leem zero linhas). Ler resultados passa a exigir tambem
-- hr.pessoas.retribuicao.view. Ate o cliente novo ser publicado ninguem fecha
-- periodos (ver acima).
--
--
-- -- CODIGOS DE ERRO (prefixo da mensagem; ERRCODE) ---------------------------
--
--   processamento_fechar_resultado_mal_formado (22023)
--   processamento_fechar_pessoa_repetida (22023)
--   processamento_fechar_pessoa_fora_do_periodo (23514)
--   processamento_fechar_resultado_em_falta (23514)
--   processamento_fechar_lancamentos_desactualizados (23514)
--   processamento_fechar_regra_desactualizada (23514)
--   processamento_fechar_versao_invalida (23514)
--   processamento_fechar_desvios_por_validar (23514, preparado e comentado)
--   processamento_resultados_sem_sessao / _sem_permissao (42501)
--   processamento_resultados_dados_em_falta (23502)
--   processamento_resultados_periodo_aberto (22023)
--   processamento_resultados_imutavel / _periodo_fechado (22000)
--   As mensagens herdadas da versao de 1 argumento ficam iguais (P0001).
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- Sem ficheiro de reversao, de proposito. A mao, por migration nova: repor a
-- RPC de 1 argumento de 20261207020400 (com o cliente antigo), largar as duas
-- RPCs novas, as duas funcoes internas e, so depois de exportar, a tabela
-- hr_processamento_resultados (os resultados gravados perdem-se).
-- ==============================================================================

SET LOCAL lock_timeout = '5s';

-- ---- G00: dentro de uma transaccao -------------------------------------------
DO $transaccao$
BEGIN
  IF current_setting('lock_timeout') IS DISTINCT FROM '5s' THEN
    RAISE EXCEPTION
      'processamento_resultados_fora_de_transaccao: SET LOCAL nao teve efeito (lock_timeout = %); esta migration tem de correr numa so transaccao.',
      current_setting('lock_timeout')
      USING ERRCODE = '25000';
  END IF;
END;
$transaccao$;

-- ---- Corpo esperado no remoto (para a guarda md5) -----------------------------
-- O corpo de rpc_hr_processamento_periodo_fechar(uuid) de 20261207020400:309.
CREATE TEMP TABLE tmp_pr_esperado (fn text PRIMARY KEY, md5_lido text NOT NULL, corpo text NOT NULL) ON COMMIT DROP;
INSERT INTO tmp_pr_esperado (fn, md5_lido, corpo) VALUES
('public.rpc_hr_processamento_periodo_fechar(uuid)', '7e0070d94359259d20c569e0e464116e', $old$
DECLARE
  v_auth     uuid := auth.uid();
  v_periodo  public.hr_periodos_processamento%ROWTYPE;
  v_autor_id uuid;
BEGIN
  IF v_auth IS NULL THEN
    RAISE EXCEPTION 'rpc_hr_processamento_periodo_fechar exige um utilizador autenticado.';
  END IF;

  SELECT * INTO v_periodo
    FROM public.hr_periodos_processamento
   WHERE id = p_periodo_id
   FOR UPDATE;

  -- A verificacao de permissao corre logo depois do FOR UPDATE, ANTES de
  -- qualquer RAISE EXCEPTION que revele se a linha existe ou o seu estado --
  -- assim quem nao tem hr.processamento.periodo.gerir nesta organizacao nao
  -- distingue "periodo inexistente" de "periodo ja fechado" por enumeracao.
  -- Quando o periodo nao existe, v_periodo.organization_id fica NULL e
  -- has_anew_permission_in_org devolve false com organizacao NULL (o "="
  -- interno nunca casa com NULL) -- por isso cai sempre no mesmo erro de
  -- permissao, nunca no "nao encontrado", para quem nao tem a permissao.
  IF NOT public.has_anew_permission_in_org(
    v_auth, 'hr.processamento.periodo.gerir', v_periodo.organization_id
  ) THEN
    RAISE EXCEPTION 'Sem permissao hr.processamento.periodo.gerir nesta organizacao.';
  END IF;

  IF v_periodo.id IS NULL THEN
    RAISE EXCEPTION 'Periodo % nao encontrado.', p_periodo_id;
  END IF;

  IF v_periodo.estado = 'fechado' THEN
    RAISE EXCEPTION 'Periodo % ja esta fechado.', p_periodo_id;
  END IF;

  SELECT au.id INTO v_autor_id FROM public.anew_users au WHERE au.auth_user_id = v_auth LIMIT 1;

  IF v_autor_id IS NULL THEN
    RAISE EXCEPTION 'Utilizador autenticado sem ficha em anew_users.';
  END IF;

  UPDATE public.hr_periodos_processamento
     SET estado = 'fechado',
         fechado_em = now(),
         fechado_por = v_autor_id
   WHERE id = p_periodo_id;
END;
$old$);

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
DECLARE
  v_lista text;
  v_n     integer;
  v_r     record;
  v_src   text;
  v_cod   text;
BEGIN
  -- G0. Quem aplica passa a RLS (a tabela nova fica FORCE; as RPCs definer
  --     correm como o dono, que e quem aplica).
  IF NOT EXISTS (SELECT 1 FROM pg_roles r
                  WHERE r.rolname::text = current_user::text AND (r.rolsuper OR r.rolbypassrls)) THEN
    RAISE EXCEPTION 'G0: o papel que aplica (%) nao tem BYPASSRLS; com FORCE RLS as RPCs nao leriam nem gravariam.', current_user::text;
  END IF;

  -- G1. Pre-requisitos: tabelas, colunas e funcoes de que isto depende.
  IF to_regclass('public.hr_periodos_processamento') IS NULL
     OR to_regclass('public.pessoas') IS NULL
     OR to_regclass('public.pessoas_retribuicoes') IS NULL
     OR to_regclass('public.hr_cargos_periodos') IS NULL
     OR to_regclass('public.hr_regras_salariais') IS NULL
     OR to_regclass('public.anew_users') IS NULL
     OR to_regclass('public.anew_organizations') IS NULL THEN
    RAISE EXCEPTION 'G1: falta uma das tabelas: hr_periodos_processamento, pessoas, pessoas_retribuicoes, hr_cargos_periodos, hr_regras_salariais, anew_users, anew_organizations.';
  END IF;
  SELECT count(*) INTO v_n
    FROM (VALUES ('hr_periodos_processamento', 'data_inicio'), ('hr_periodos_processamento', 'data_fim'),
                 ('hr_periodos_processamento', 'estado'), ('hr_periodos_processamento', 'fechado_por'),
                 ('pessoas', 'estado_registo'), ('pessoas', 'deleted_at'), ('pessoas', 'organization_id'),
                 ('pessoas_retribuicoes', 'pessoa_id'), ('pessoas_retribuicoes', 'deleted_at'),
                 ('hr_cargos_periodos', 'organization_id'), ('anew_users', 'name'), ('anew_users', 'auth_user_id'),
                 ('pessoas_retribuicoes', 'valido_de'), ('pessoas_retribuicoes', 'valido_ate'),
                 ('pessoas_vinculos', 'data_inicio'), ('pessoas_vinculos', 'data_fim'), ('pessoas_vinculos', 'deleted_at'),
                 ('hr_processamento_lancamentos', 'tipo'), ('hr_processamento_lancamentos', 'anulado_em'),
                 ('hr_processamento_lancamentos', 'valor'))
         AS e(tabela, coluna)
   WHERE EXISTS (SELECT 1 FROM pg_attribute a
                  WHERE a.attrelid = to_regclass('public.' || e.tabela)
                    AND a.attname::text = e.coluna AND NOT a.attisdropped);
  IF v_n <> 20 THEN
    RAISE EXCEPTION 'G1: faltam colunas esperadas (% de 20; hr_processamento_lancamentos.tipo vem de 20270109700000).', v_n;
  END IF;
  IF to_regprocedure('public.has_anew_permission_in_org(uuid, text, uuid)') IS NULL
     OR to_regprocedure('public.hr_regras_salariais_em(uuid, date)') IS NULL THEN
    RAISE EXCEPTION 'G1: falta has_anew_permission_in_org(uuid, text, uuid) ou hr_regras_salariais_em(uuid, date).';
  END IF;
  -- Os UNIQUE (id, organization_id) de que as FKs compostas precisam.
  SELECT count(*) INTO v_n
    FROM (VALUES ('hr_periodos_processamento'), ('pessoas')) AS t(tabela)
   WHERE EXISTS (
     SELECT 1 FROM pg_index i
      WHERE i.indrelid = to_regclass('public.' || t.tabela)
        AND i.indisunique AND i.indpred IS NULL AND i.indexprs IS NULL
        AND (SELECT array_agg(a.attname::text ORDER BY a.attname::text)
               FROM unnest(i.indkey::int2[]) AS k(n)
               JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = k.n)
            = ARRAY['id', 'organization_id']::text[]);
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'G1: falta UNIQUE (id, organization_id) em hr_periodos_processamento ou pessoas (% de 2).', v_n;
  END IF;

  -- G2. Nomes novos livres.
  IF to_regclass('public.hr_processamento_resultados') IS NOT NULL THEN
    RAISE EXCEPTION 'G2: public.hr_processamento_resultados ja existe. Ler o que la esta.';
  END IF;
  SELECT string_agg(p.oid::regprocedure::text, ', ') INTO v_lista
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname::text = 'public'
     AND p.proname::text IN ('hr_processamento_resultado_erro', 'hr_processamento_resultados_guarda',
                             'rpc_hr_processamento_resultados_ler');
  IF v_lista IS NOT NULL THEN
    RAISE EXCEPTION 'G2: ja existem funcoes com nomes desta migration: %.', v_lista;
  END IF;

  -- G3. A RPC de fechar existe com UMA so assinatura, a de 1 argumento.
  SELECT count(*) INTO v_n
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname::text = 'public' AND p.proname::text = 'rpc_hr_processamento_periodo_fechar';
  IF v_n <> 1 OR to_regprocedure('public.rpc_hr_processamento_periodo_fechar(uuid)') IS NULL THEN
    RAISE EXCEPTION 'G3: rpc_hr_processamento_periodo_fechar devia existir so como (uuid); ha % assinatura(s).', v_n;
  END IF;

  -- G4. O corpo e o lido: md5 bruto lido no remoto a 05/11 (o que
  --     20270107500000 conferiu) OU o corpo transcrito acima, sem \r dos dois lados.
  FOR v_r IN SELECT * FROM tmp_pr_esperado ORDER BY fn LOOP
    SELECT p.prosrc INTO v_src FROM pg_proc p WHERE p.oid = to_regprocedure(v_r.fn)::oid;
    IF md5(v_src) IS DISTINCT FROM v_r.md5_lido
       AND md5(replace(v_src, chr(13), '')) IS DISTINCT FROM md5(replace(v_r.corpo, chr(13), '')) THEN
      RAISE EXCEPTION 'G4: o corpo de % no remoto (md5 %) nao e o lido (md5 % ou %). Reler a versao mais recente antes de aplicar.',
        v_r.fn, md5(v_src), v_r.md5_lido, md5(replace(v_r.corpo, chr(13), ''));
    END IF;
  END LOOP;

  -- G5. Ninguem mais chama a RPC de fechar (a assinatura muda).
  SELECT string_agg(p.oid::regprocedure::text, ', ') INTO v_lista
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname::text = 'public'
     AND regexp_replace(p.prosrc, '--[^\n]*', '', 'g') LIKE '%rpc_hr_processamento_periodo_fechar%'
     AND p.proname::text <> 'rpc_hr_processamento_periodo_fechar';
  IF v_lista IS NOT NULL THEN
    RAISE EXCEPTION 'G5: outras funcoes chamam rpc_hr_processamento_periodo_fechar: %. Rever antes de mudar a assinatura.', v_lista;
  END IF;

  -- G6. Codigos de permissao usados. Nenhum e criado aqui.
  FOREACH v_cod IN ARRAY ARRAY['hr.processamento.periodo.view', 'hr.processamento.periodo.gerir',
                               'hr.pessoas.retribuicao.view'] LOOP
    IF NOT EXISTS (SELECT 1 FROM public.anew_permissions ap WHERE ap.code = v_cod) THEN
      RAISE EXCEPTION 'G6: o codigo % nao esta no catalogo.', v_cod;
    END IF;
  END LOOP;
END;
$guardas$;


-- ==============================================================================
-- 1. hr_processamento_resultados
-- ==============================================================================
CREATE TABLE public.hr_processamento_resultados (
  id                 uuid          NOT NULL DEFAULT gen_random_uuid(),
  organization_id    uuid          NOT NULL,
  periodo_id         uuid          NOT NULL,
  pessoa_id          uuid          NOT NULL,
  valor_hora         numeric(12,4),
  total_bruto        numeric(12,2),
  totais             jsonb         NOT NULL,
  linhas             jsonb         NOT NULL,
  avisos             text[]        NOT NULL DEFAULT '{}'::text[],
  retribuicao_id     uuid,
  cargo_periodo_id   uuid,
  regra_salarial_id  uuid,
  fechado_por        uuid          NOT NULL,
  fechado_em         timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT hr_processamento_resultados_pkey PRIMARY KEY (id),
  CONSTRAINT hr_processamento_resultados_periodo_pessoa_key UNIQUE (periodo_id, pessoa_id),
  CONSTRAINT hr_processamento_resultados_org_fkey
    FOREIGN KEY (organization_id) REFERENCES public.anew_organizations (id) ON DELETE RESTRICT,
  CONSTRAINT hr_processamento_resultados_periodo_fkey
    FOREIGN KEY (periodo_id, organization_id)
    REFERENCES public.hr_periodos_processamento (id, organization_id) ON DELETE RESTRICT,
  CONSTRAINT hr_processamento_resultados_pessoa_fkey
    FOREIGN KEY (pessoa_id, organization_id)
    REFERENCES public.pessoas (id, organization_id) ON DELETE RESTRICT,
  CONSTRAINT hr_processamento_resultados_regra_fkey
    FOREIGN KEY (regra_salarial_id) REFERENCES public.hr_regras_salariais (id) ON DELETE RESTRICT,
  CONSTRAINT hr_processamento_resultados_totais_objecto
    CHECK (jsonb_typeof(totais) = 'object'),
  CONSTRAINT hr_processamento_resultados_linhas_array
    CHECK (jsonb_typeof(linhas) = 'array'),
  CONSTRAINT hr_processamento_resultados_avisos_validos
    CHECK (cardinality(avisos) <= 20 AND array_position(avisos, NULL) IS NULL),
  CONSTRAINT hr_processamento_resultados_valor_hora_intervalo
    CHECK (valor_hora IS NULL OR (valor_hora >= 0 AND valor_hora <= 10000)),
  CONSTRAINT hr_processamento_resultados_total_intervalo
    CHECK (total_bruto IS NULL OR abs(total_bruto) <= 10000000)
);

CREATE INDEX idx_hr_processamento_resultados_org
  ON public.hr_processamento_resultados (organization_id);
CREATE INDEX idx_hr_processamento_resultados_pessoa
  ON public.hr_processamento_resultados (pessoa_id, organization_id);
CREATE INDEX idx_hr_processamento_resultados_regra
  ON public.hr_processamento_resultados (regra_salarial_id) WHERE regra_salarial_id IS NOT NULL;

COMMENT ON TABLE public.hr_processamento_resultados IS
'O resultado do processamento salarial de cada pessoa, gravado no instante em que o periodo da folha e fechado: uma linha por (periodo, pessoa). O calculo e feito no cliente; rpc_hr_processamento_periodo_fechar valida a estrutura, grava e fecha na mesma transaccao. Imutavel (trigger): UPDATE, DELETE e TRUNCATE recusados; INSERT so com o periodo aberto. Le-se com hr.processamento.periodo.view E hr.pessoas.retribuicao.view (politica ou rpc_hr_processamento_resultados_ler). Um periodo fechado sem linhas aqui foi fechado antes do registo (20270109900000). RLS forcada; sem escrita para ninguem fora da RPC.';
COMMENT ON COLUMN public.hr_processamento_resultados.totais IS
'Objecto com base_mes, divisor_duodecimos, total_codigos_automaticos, total_regras, desconto_faltas, subsidio_alimentacao, lancamentos_pontuais (number ou null), tal como o cliente os calculou.';
COMMENT ON COLUMN public.hr_processamento_resultados.linhas IS
'Array das linhas do calculo; cada uma tem origem (codigo | regra | lancamento) e valor, e os campos descritivos que o cliente juntou.';
COMMENT ON COLUMN public.hr_processamento_resultados.retribuicao_id IS
'A versao de pessoas_retribuicoes usada no calculo (da pessoa, conferida ao fechar). Sem FK: e um registo do que se usou.';
COMMENT ON COLUMN public.hr_processamento_resultados.cargo_periodo_id IS
'A versao de hr_cargos_periodos usada no calculo (da organizacao, conferida ao fechar), ou NULL. Sem FK: e um registo do que se usou.';
COMMENT ON COLUMN public.hr_processamento_resultados.regra_salarial_id IS
'A regra salarial em vigor no data_fim do periodo, escolhida pelo SERVIDOR ao fechar (o cliente tem de ter calculado com a mesma). NULL = nao havia regra.';
COMMENT ON COLUMN public.hr_processamento_resultados.fechado_por IS
'anew_users.id de quem fechou. Sem FK de proposito: um ON DELETE SET NULL seria um UPDATE, que a imutabilidade recusa.';

-- Imutabilidade: so INSERT, e so com o periodo aberto.
CREATE FUNCTION public.hr_processamento_resultados_guarda()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_estado text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT pp.estado INTO v_estado
      FROM public.hr_periodos_processamento pp
     WHERE pp.id = NEW.periodo_id
       AND pp.organization_id = NEW.organization_id;
    IF v_estado IS DISTINCT FROM 'aberto' THEN
      RAISE EXCEPTION
        'processamento_resultados_periodo_fechado: so se gravam resultados ao fechar um periodo aberto (periodo %).', NEW.periodo_id
        USING ERRCODE = '22000';
    END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION
    'processamento_resultados_imutavel: os resultados de um periodo fechado nao mudam nem se apagam (%).', TG_OP
    USING ERRCODE = '22000';
END;
$$;

REVOKE ALL ON FUNCTION public.hr_processamento_resultados_guarda() FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER trg_hr_processamento_resultados_guarda
  BEFORE INSERT OR UPDATE OR DELETE ON public.hr_processamento_resultados
  FOR EACH ROW EXECUTE FUNCTION public.hr_processamento_resultados_guarda();
CREATE TRIGGER trg_hr_processamento_resultados_sem_truncate
  BEFORE TRUNCATE ON public.hr_processamento_resultados
  FOR EACH STATEMENT EXECUTE FUNCTION public.hr_processamento_resultados_guarda();

REVOKE ALL ON TABLE public.hr_processamento_resultados FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.hr_processamento_resultados TO authenticated;
ALTER TABLE public.hr_processamento_resultados ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_processamento_resultados FORCE ROW LEVEL SECURITY;

CREATE POLICY hr_processamento_resultados_select ON public.hr_processamento_resultados
  FOR SELECT TO authenticated
  USING (
    (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.processamento.periodo.view', organization_id))
    AND (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.pessoas.retribuicao.view', organization_id))
  );
COMMENT ON POLICY hr_processamento_resultados_select ON public.hr_processamento_resultados IS
'Ve quem tem hr.processamento.periodo.view E hr.pessoas.retribuicao.view NAQUELA organizacao (sao valores salariais). Sem politicas de escrita: so rpc_hr_processamento_periodo_fechar grava.';


-- ==============================================================================
-- 2. Validacao da estrutura de UM resultado (interna, sem EXECUTE)
-- ==============================================================================
-- Devolve NULL se o objecto esta bem formado; senao, o que esta mal.
CREATE FUNCTION public.hr_processamento_resultado_erro(_r jsonb)
RETURNS text
LANGUAGE plpgsql IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  k_chaves  constant text[] := ARRAY['pessoa_id', 'valor_hora', 'total_bruto', 'totais', 'linhas', 'avisos',
                                     'retribuicao_id', 'cargo_periodo_id', 'regra_salarial_id'];
  k_totais  constant text[] := ARRAY['base_mes', 'divisor_duodecimos', 'total_codigos_automaticos', 'total_regras',
                                     'desconto_faltas', 'subsidio_alimentacao', 'lancamentos_pontuais'];
  k_uuids   constant text[] := ARRAY['retribuicao_id', 'cargo_periodo_id', 'regra_salarial_id'];
  k_uuid_re constant text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
  k_max     constant numeric := 10000000;
  k_linhas  constant integer := 500;
  k_avisos  constant integer := 20;
  v_k       text;
  v_t       text;
  v_e       jsonb;
BEGIN
  IF _r IS NULL OR pg_catalog.jsonb_typeof(_r) IS DISTINCT FROM 'object' THEN
    RETURN 'cada resultado tem de ser um objecto';
  END IF;

  SELECT pg_catalog.string_agg(k.chave, ', ' ORDER BY k.chave) INTO v_t
    FROM pg_catalog.jsonb_object_keys(_r) AS k(chave)
   WHERE k.chave <> ALL (k_chaves);
  IF v_t IS NOT NULL THEN
    RETURN 'campos desconhecidos: ' || v_t;
  END IF;
  FOREACH v_k IN ARRAY k_chaves LOOP
    IF NOT (_r ? v_k) THEN
      RETURN 'falta o campo ' || v_k;
    END IF;
  END LOOP;

  -- pessoa_id
  IF pg_catalog.jsonb_typeof(_r -> 'pessoa_id') <> 'string' OR (_r ->> 'pessoa_id') !~ k_uuid_re THEN
    RETURN 'pessoa_id tem de ser um uuid';
  END IF;

  -- versoes: uuid ou null
  FOREACH v_k IN ARRAY k_uuids LOOP
    v_t := pg_catalog.jsonb_typeof(_r -> v_k);
    IF v_t <> 'null' THEN
      IF v_t <> 'string' OR (_r ->> v_k) !~ k_uuid_re THEN
        RETURN v_k || ' tem de ser um uuid ou null';
      END IF;
    END IF;
  END LOOP;

  -- valor_hora: number >= 0 e <= 10000, ou null
  v_t := pg_catalog.jsonb_typeof(_r -> 'valor_hora');
  IF v_t = 'number' THEN
    IF (_r ->> 'valor_hora')::numeric < 0 OR (_r ->> 'valor_hora')::numeric > 10000 THEN
      RETURN 'valor_hora fora do intervalo (0 a 10000)';
    END IF;
  ELSIF v_t <> 'null' THEN
    RETURN 'valor_hora tem de ser numero ou null';
  END IF;

  -- total_bruto: number ou null
  v_t := pg_catalog.jsonb_typeof(_r -> 'total_bruto');
  IF v_t = 'number' THEN
    IF pg_catalog.abs((_r ->> 'total_bruto')::numeric) > k_max THEN
      RETURN 'total_bruto fora do intervalo';
    END IF;
  ELSIF v_t <> 'null' THEN
    RETURN 'total_bruto tem de ser numero ou null';
  END IF;

  -- totais: objecto com exactamente as chaves k_totais, cada uma number ou null
  IF pg_catalog.jsonb_typeof(_r -> 'totais') <> 'object' THEN
    RETURN 'totais tem de ser um objecto';
  END IF;
  SELECT pg_catalog.string_agg(k.chave, ', ' ORDER BY k.chave) INTO v_t
    FROM pg_catalog.jsonb_object_keys(_r -> 'totais') AS k(chave)
   WHERE k.chave <> ALL (k_totais);
  IF v_t IS NOT NULL THEN
    RETURN 'campos desconhecidos em totais: ' || v_t;
  END IF;
  FOREACH v_k IN ARRAY k_totais LOOP
    IF NOT ((_r -> 'totais') ? v_k) THEN
      RETURN 'falta totais.' || v_k;
    END IF;
    v_t := pg_catalog.jsonb_typeof(_r -> 'totais' -> v_k);
    IF v_t = 'number' THEN
      IF pg_catalog.abs((_r -> 'totais' ->> v_k)::numeric) > k_max THEN
        RETURN 'totais.' || v_k || ' fora do intervalo';
      END IF;
    ELSIF v_t <> 'null' THEN
      RETURN 'totais.' || v_k || ' tem de ser numero ou null';
    END IF;
  END LOOP;

  -- linhas: array de objectos com origem e valor
  IF pg_catalog.jsonb_typeof(_r -> 'linhas') <> 'array' THEN
    RETURN 'linhas tem de ser uma lista';
  END IF;
  IF pg_catalog.jsonb_array_length(_r -> 'linhas') > k_linhas THEN
    RETURN 'linhas a mais (maximo 500)';
  END IF;
  FOR v_e IN SELECT x.value FROM pg_catalog.jsonb_array_elements(_r -> 'linhas') AS x(value) LOOP
    IF pg_catalog.jsonb_typeof(v_e) <> 'object' THEN
      RETURN 'cada linha tem de ser um objecto';
    END IF;
    IF pg_catalog.octet_length(v_e::text) > 2000 THEN
      RETURN 'linha demasiado grande (mais de 2000 bytes)';
    END IF;
    IF pg_catalog.jsonb_typeof(v_e -> 'origem') IS DISTINCT FROM 'string'
       OR (v_e ->> 'origem') NOT IN ('codigo', 'regra', 'lancamento') THEN
      RETURN 'linha com origem invalida (codigo, regra ou lancamento)';
    END IF;
    IF pg_catalog.jsonb_typeof(v_e -> 'valor') IS DISTINCT FROM 'number' THEN
      RETURN 'linha sem valor numerico';
    END IF;
    IF pg_catalog.abs((v_e ->> 'valor')::numeric) > k_max THEN
      RETURN 'linha com valor fora do intervalo';
    END IF;
  END LOOP;

  -- avisos: array de codigos curtos
  IF pg_catalog.jsonb_typeof(_r -> 'avisos') <> 'array' THEN
    RETURN 'avisos tem de ser uma lista';
  END IF;
  IF pg_catalog.jsonb_array_length(_r -> 'avisos') > k_avisos THEN
    RETURN 'avisos a mais (maximo 20)';
  END IF;
  FOR v_e IN SELECT x.value FROM pg_catalog.jsonb_array_elements(_r -> 'avisos') AS x(value) LOOP
    IF pg_catalog.jsonb_typeof(v_e) <> 'string' OR (v_e #>> '{}') !~ '^[a-z_]{1,60}$' THEN
      RETURN 'cada aviso tem de ser um codigo (letras minusculas e _)';
    END IF;
  END LOOP;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.hr_processamento_resultado_erro(jsonb) FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION public.hr_processamento_resultado_erro(jsonb) IS
'Interna. NULL se o objecto e um resultado bem formado (o formato do cabecalho de 20270109900000); senao, a descricao do que esta mal. So valida a forma, nao os valores do calculo.';


-- ==============================================================================
-- 3. rpc_hr_processamento_periodo_fechar: assinatura nova (larga a antiga)
-- ==============================================================================
DROP FUNCTION public.rpc_hr_processamento_periodo_fechar(uuid);

CREATE FUNCTION public.rpc_hr_processamento_periodo_fechar(
  p_periodo_id  uuid,
  p_resultados  jsonb
)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  k_max_pessoas constant integer := 5000;
  k_max_bytes   constant integer := 8000000;
  v_auth        uuid := auth.uid();
  v_periodo     public.hr_periodos_processamento%ROWTYPE;
  v_autor_id    uuid;
  v_agora       timestamptz := pg_catalog.now();
  v_pode        boolean;
  v_item        jsonb;
  v_ord         bigint;
  v_erro        text;
  v_ids         uuid[];
  v_exemplo     uuid;
  v_falta       integer;
  v_regra_id    uuid;
BEGIN
  IF v_auth IS NULL THEN
    RAISE EXCEPTION 'rpc_hr_processamento_periodo_fechar exige um utilizador autenticado.';
  END IF;

  -- FOR UPDATE: fecha a corrida com rpc_hr_processamento_lancamento_criar
  -- (FOR SHARE na mesma linha) e com outro fecho em simultaneo.
  SELECT * INTO v_periodo
    FROM public.hr_periodos_processamento pp
   WHERE pp.id = p_periodo_id
   FOR UPDATE;

  -- Permissao logo depois do lock, ANTES de revelar se o periodo existe ou o
  -- seu estado (mesma regra da versao de 20261207020400). Periodo inexistente:
  -- organizacao NULL, sem permissao. O coalesce garante que um NULL nunca passa.
  v_pode := coalesce(public.has_anew_permission_in_org(
    v_auth, 'hr.processamento.periodo.gerir', v_periodo.organization_id), false);
  IF NOT v_pode THEN
    RAISE EXCEPTION 'Sem permissao hr.processamento.periodo.gerir nesta organizacao.';
  END IF;

  IF v_periodo.id IS NULL THEN
    RAISE EXCEPTION 'Periodo % nao encontrado.', p_periodo_id;
  END IF;

  IF v_periodo.estado = 'fechado' THEN
    RAISE EXCEPTION 'Periodo % ja esta fechado.', p_periodo_id;
  END IF;

  SELECT au.id INTO v_autor_id FROM public.anew_users au WHERE au.auth_user_id = v_auth LIMIT 1;

  IF v_autor_id IS NULL THEN
    RAISE EXCEPTION 'Utilizador autenticado sem ficha em anew_users.';
  END IF;

  -- ---- Estrutura -------------------------------------------------------------
  IF p_resultados IS NULL OR pg_catalog.jsonb_typeof(p_resultados) <> 'array' THEN
    RAISE EXCEPTION 'processamento_fechar_resultado_mal_formado: p_resultados tem de ser uma lista (array jsonb) com um resultado por pessoa.'
      USING ERRCODE = '22023';
  END IF;
  IF pg_catalog.jsonb_array_length(p_resultados) > k_max_pessoas
     OR pg_catalog.octet_length(p_resultados::text) > k_max_bytes THEN
    RAISE EXCEPTION 'processamento_fechar_resultado_mal_formado: a lista excede o limite (% pessoas, % bytes).',
      k_max_pessoas, k_max_bytes
      USING ERRCODE = '22023';
  END IF;

  FOR v_item, v_ord IN
    SELECT e.value, e.ord FROM pg_catalog.jsonb_array_elements(p_resultados) WITH ORDINALITY AS e(value, ord)
  LOOP
    v_erro := public.hr_processamento_resultado_erro(v_item);
    IF v_erro IS NOT NULL THEN
      RAISE EXCEPTION 'processamento_fechar_resultado_mal_formado: resultado % da lista: %.', v_ord, v_erro
        USING ERRCODE = '22023';
    END IF;
  END LOOP;

  v_ids := ARRAY(SELECT (e.value ->> 'pessoa_id')::uuid
                   FROM pg_catalog.jsonb_array_elements(p_resultados) AS e(value));

  -- ---- Pessoas do periodo ------------------------------------------------------
  -- PERMITIDAS: pessoas da organizacao (sem deleted_at), activas ou arquivadas,
  --   com um vinculo nao apagado que sobrepoe [data_inicio, data_fim] do
  --   periodo. pessoas_vinculos.data_fim e o ULTIMO dia do contrato
  --   (inclusive); NULL = sem fim.
  -- OBRIGATORIAS: as permitidas com estado_registo = 'activo' (o que o ecra
  --   mostra).
  -- Anti-joins por LEFT JOIN a CTEs materializadas (hash join), nao NOT EXISTS
  -- correlacionado sobre o array: escala para 5000 pessoas.
  SELECT x.id INTO v_exemplo
    FROM pg_catalog.unnest(v_ids) AS x(id)
   GROUP BY x.id
  HAVING pg_catalog.count(*) > 1
   LIMIT 1;
  IF v_exemplo IS NOT NULL THEN
    RAISE EXCEPTION 'processamento_fechar_pessoa_repetida: a pessoa % aparece mais de uma vez na lista.', v_exemplo
      USING ERRCODE = '22023';
  END IF;

  WITH permitidas AS MATERIALIZED (
    SELECT DISTINCT p.id
      FROM public.pessoas p
      JOIN public.pessoas_vinculos v
        ON v.pessoa_id = p.id
       AND v.organization_id = p.organization_id
       AND v.deleted_at IS NULL
       AND v.data_inicio <= v_periodo.data_fim
       AND (v.data_fim IS NULL OR v.data_fim >= v_periodo.data_inicio)
     WHERE p.organization_id = v_periodo.organization_id
       AND p.deleted_at IS NULL
  ),
  enviadas AS MATERIALIZED (
    SELECT x.id FROM pg_catalog.unnest(v_ids) AS x(id)
  )
  SELECT e.id INTO v_exemplo
    FROM enviadas e
    LEFT JOIN permitidas pe ON pe.id = e.id
   WHERE pe.id IS NULL
   LIMIT 1;
  IF v_exemplo IS NOT NULL THEN
    RAISE EXCEPTION 'processamento_fechar_pessoa_fora_do_periodo: a pessoa % nao tem vinculo com esta organizacao entre % e %.',
      v_exemplo, v_periodo.data_inicio, v_periodo.data_fim
      USING ERRCODE = '23514';
  END IF;

  WITH obrigatorias AS MATERIALIZED (
    SELECT DISTINCT p.id
      FROM public.pessoas p
      JOIN public.pessoas_vinculos v
        ON v.pessoa_id = p.id
       AND v.organization_id = p.organization_id
       AND v.deleted_at IS NULL
       AND v.data_inicio <= v_periodo.data_fim
       AND (v.data_fim IS NULL OR v.data_fim >= v_periodo.data_inicio)
     WHERE p.organization_id = v_periodo.organization_id
       AND p.deleted_at IS NULL
       AND p.estado_registo = 'activo'
  ),
  enviadas AS MATERIALIZED (
    SELECT x.id FROM pg_catalog.unnest(v_ids) AS x(id)
  )
  SELECT pg_catalog.count(*)::integer, (pg_catalog.array_agg(o.id ORDER BY o.id))[1]
    INTO v_falta, v_exemplo
    FROM obrigatorias o
    LEFT JOIN enviadas e ON e.id = o.id
   WHERE e.id IS NULL;
  IF v_falta > 0 THEN
    RAISE EXCEPTION 'processamento_fechar_resultado_em_falta: faltam os resultados de % pessoa(s) activa(s) com vinculo no periodo (por exemplo %); o calculo de todas tem de terminar antes de fechar.',
      v_falta, v_exemplo
      USING ERRCODE = '23514';
  END IF;

  -- ---- Coerencia: lancamentos pontuais (manuais, nao anulados) ----------------
  -- totais.lancamentos_pontuais tem de ser a soma, ao centimo, dos lancamentos
  -- manuais nao anulados da pessoa neste periodo (null conta 0). km e ajudas
  -- tem linha propria da regra e nao entram neste total (como no cliente,
  -- processamentoTotais.ts calcularLancamentosPontuais). O FOR UPDATE do periodo
  -- impede lancamentos novos enquanto isto corre.
  WITH somas AS MATERIALIZED (
    SELECT l.pessoa_id, pg_catalog.round(pg_catalog.sum(l.valor), 2) AS total
      FROM public.hr_processamento_lancamentos l
     WHERE l.periodo_id = v_periodo.id
       AND l.organization_id = v_periodo.organization_id
       AND l.anulado_em IS NULL
       AND l.tipo = 'manual'
     GROUP BY l.pessoa_id
  ),
  enviadas AS MATERIALIZED (
    SELECT (e.value ->> 'pessoa_id')::uuid AS pid,
           pg_catalog.round(coalesce((e.value -> 'totais' ->> 'lancamentos_pontuais')::numeric, 0), 2) AS total
      FROM pg_catalog.jsonb_array_elements(p_resultados) AS e(value)
  )
  SELECT en.pid INTO v_exemplo
    FROM enviadas en
    LEFT JOIN somas s ON s.pessoa_id = en.pid
   WHERE en.total IS DISTINCT FROM coalesce(s.total, 0)
   LIMIT 1;
  IF v_exemplo IS NOT NULL THEN
    RAISE EXCEPTION 'processamento_fechar_lancamentos_desactualizados: os lancamentos pontuais da pessoa % mudaram desde o calculo; recalcular e voltar a fechar.', v_exemplo
      USING ERRCODE = '23514';
  END IF;

  -- ---- Versoes: regra salarial do servidor; retribuicao e cargo conferidos ----
  v_regra_id := (public.hr_regras_salariais_em(v_periodo.organization_id, v_periodo.data_fim) ->> 'id')::uuid;

  SELECT (e.value ->> 'pessoa_id')::uuid INTO v_exemplo
    FROM pg_catalog.jsonb_array_elements(p_resultados) AS e(value)
   WHERE (e.value ->> 'regra_salarial_id')::uuid IS DISTINCT FROM v_regra_id
   LIMIT 1;
  IF v_exemplo IS NOT NULL THEN
    RAISE EXCEPTION 'processamento_fechar_regra_desactualizada: o resultado da pessoa % foi calculado com outra regra salarial; a regra em vigor a % e %. Recalcular e voltar a fechar.',
      v_exemplo, v_periodo.data_fim, coalesce(v_regra_id::text, 'nenhuma')
      USING ERRCODE = '23514';
  END IF;

  SELECT x.pid INTO v_exemplo
    FROM (SELECT (e.value ->> 'pessoa_id')::uuid AS pid, (e.value ->> 'retribuicao_id')::uuid AS rid
            FROM pg_catalog.jsonb_array_elements(p_resultados) AS e(value)) AS x
   WHERE x.rid IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.pessoas_retribuicoes r
                      WHERE r.id = x.rid
                        AND r.pessoa_id = x.pid
                        AND r.organization_id = v_periodo.organization_id
                        AND r.deleted_at IS NULL
                        -- a versao em vigor no data_fim; valido_ate e EXCLUSIVO
                        -- (trigger de nao sobreposicao com '[)').
                        AND r.valido_de <= v_periodo.data_fim
                        AND (r.valido_ate IS NULL OR r.valido_ate > v_periodo.data_fim))
   LIMIT 1;
  IF v_exemplo IS NOT NULL THEN
    RAISE EXCEPTION 'processamento_fechar_versao_invalida: a retribuicao indicada para a pessoa % nao e a versao dela em vigor a %; recalcular e voltar a fechar.',
      v_exemplo, v_periodo.data_fim
      USING ERRCODE = '23514';
  END IF;

  SELECT x.pid INTO v_exemplo
    FROM (SELECT (e.value ->> 'pessoa_id')::uuid AS pid, (e.value ->> 'cargo_periodo_id')::uuid AS cid
            FROM pg_catalog.jsonb_array_elements(p_resultados) AS e(value)) AS x
   WHERE x.cid IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.hr_cargos_periodos c
                      WHERE c.id = x.cid
                        AND c.organization_id = v_periodo.organization_id)
   LIMIT 1;
  IF v_exemplo IS NOT NULL THEN
    RAISE EXCEPTION 'processamento_fechar_versao_invalida: a versao do cargo indicada para a pessoa % nao e desta organizacao.', v_exemplo
      USING ERRCODE = '23514';
  END IF;

  -- ---- Desvios por validar (PREPARADO, DESLIGADO) -----------------------------
  -- A tabela dos desvios chega na entrega seguinte. Quando existir, descomentar
  -- (ajustando o nome da tabela e o estado) NA MESMA migration que a cria:
  --
  -- IF EXISTS (SELECT 1 FROM public.hr_processamento_desvios d
  --             WHERE d.periodo_id = v_periodo.id
  --               AND d.organization_id = v_periodo.organization_id
  --               AND d.estado = 'por_validar') THEN
  --   RAISE EXCEPTION 'processamento_fechar_desvios_por_validar: ha desvios por validar neste periodo; validar ou recusar cada um antes de fechar.'
  --     USING ERRCODE = '23514';
  -- END IF;

  -- ---- Gravar e fechar (mesma transaccao) ------------------------------------
  INSERT INTO public.hr_processamento_resultados (
    organization_id, periodo_id, pessoa_id, valor_hora, total_bruto, totais, linhas, avisos,
    retribuicao_id, cargo_periodo_id, regra_salarial_id, fechado_por, fechado_em
  )
  SELECT v_periodo.organization_id,
         v_periodo.id,
         (e.value ->> 'pessoa_id')::uuid,
         pg_catalog.round((e.value ->> 'valor_hora')::numeric, 4),
         pg_catalog.round((e.value ->> 'total_bruto')::numeric, 2),
         e.value -> 'totais',
         e.value -> 'linhas',
         ARRAY(SELECT a.value FROM pg_catalog.jsonb_array_elements_text(e.value -> 'avisos') AS a(value)),
         (e.value ->> 'retribuicao_id')::uuid,
         (e.value ->> 'cargo_periodo_id')::uuid,
         v_regra_id,
         v_autor_id,
         v_agora
    FROM pg_catalog.jsonb_array_elements(p_resultados) AS e(value);

  UPDATE public.hr_periodos_processamento
     SET estado = 'fechado',
         fechado_em = v_agora,
         fechado_por = v_autor_id
   WHERE id = v_periodo.id;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_hr_processamento_periodo_fechar(uuid, jsonb) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_hr_processamento_periodo_fechar(uuid, jsonb) TO authenticated;

COMMENT ON FUNCTION public.rpc_hr_processamento_periodo_fechar(uuid, jsonb) IS
'Fecha um periodo de processamento salarial ABERTO e grava, na mesma transaccao, o resultado de cada pessoa em hr_processamento_resultados. Exige hr.processamento.periodo.gerir na organizacao do periodo (verificada antes de revelar se o periodo existe). p_resultados: array com um objecto por pessoa (formato no cabecalho de 20270109900000): obrigatorias as activas com vinculo sobreposto ao periodo; permitidas as que tem vinculo sobreposto, activas ou arquivadas. Recusa estrutura mal formada, pessoas repetidas, sem vinculo no periodo, obrigatorias em falta, totais.lancamentos_pontuais diferente da soma dos lancamentos manuais nao anulados, regra salarial diferente da em vigor no data_fim, retribuicao que nao e a em vigor no data_fim, e cargo de outra organizacao. O calculo e do cliente; a RPC valida estrutura, coerencia dos lancamentos e versoes, e grava. Irreversivel: sem reabertura auditada. Desde 20270109900000 (substitui a de 1 argumento).';


-- ==============================================================================
-- 4. rpc_hr_processamento_resultados_ler
-- ==============================================================================
CREATE FUNCTION public.rpc_hr_processamento_resultados_ler(p_periodo_id uuid, p_depois uuid DEFAULT NULL)
RETURNS TABLE (
  pessoa_id          uuid,
  valor_hora         numeric,
  total_bruto        numeric,
  totais             jsonb,
  linhas             jsonb,
  avisos             text[],
  retribuicao_id     uuid,
  cargo_periodo_id   uuid,
  regra_salarial_id  uuid,
  fechado_em         timestamptz,
  fechado_por_nome   text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
#variable_conflict use_column
DECLARE
  v_auth   uuid := auth.uid();
  v_org    uuid;
  v_estado text;
  v_pode   boolean;
BEGIN
  IF v_auth IS NULL THEN
    RAISE EXCEPTION 'processamento_resultados_sem_sessao: nao ha utilizador autenticado.' USING ERRCODE = '42501';
  END IF;
  IF p_periodo_id IS NULL THEN
    RAISE EXCEPTION 'processamento_resultados_dados_em_falta: o periodo e obrigatorio.' USING ERRCODE = '23502';
  END IF;

  SELECT pp.organization_id, pp.estado INTO v_org, v_estado
    FROM public.hr_periodos_processamento pp
   WHERE pp.id = p_periodo_id;

  -- Inexistente e sem permissao dao a mesma mensagem. Sao valores salariais:
  -- exige as duas permissoes, como a politica da tabela.
  v_pode := coalesce(public.has_anew_permission_in_org(v_auth, 'hr.processamento.periodo.view', v_org), false)
            AND coalesce(public.has_anew_permission_in_org(v_auth, 'hr.pessoas.retribuicao.view', v_org), false);
  IF NOT v_pode THEN
    RAISE EXCEPTION 'processamento_resultados_sem_permissao: ver os resultados exige hr.processamento.periodo.view e hr.pessoas.retribuicao.view na organizacao do periodo.'
      USING ERRCODE = '42501';
  END IF;

  IF v_estado IS DISTINCT FROM 'fechado' THEN
    RAISE EXCEPTION 'processamento_resultados_periodo_aberto: o periodo ainda esta aberto; os resultados so ficam gravados ao fechar.'
      USING ERRCODE = '22023';
  END IF;

  -- Paginas de 500 por pessoa_id (keyset; o UNIQUE (periodo_id, pessoa_id)
  -- serve a ordem). Zero linhas na primeira pagina de um periodo fechado =
  -- fechado antes do registo.
  RETURN QUERY
  SELECT r.pessoa_id, r.valor_hora, r.total_bruto, r.totais, r.linhas, r.avisos,
         r.retribuicao_id, r.cargo_periodo_id, r.regra_salarial_id, r.fechado_em, u.name::text
    FROM public.hr_processamento_resultados r
    LEFT JOIN public.anew_users u ON u.id = r.fechado_por
   WHERE r.periodo_id = p_periodo_id
     AND r.organization_id = v_org
     AND (p_depois IS NULL OR r.pessoa_id > p_depois)
   ORDER BY r.pessoa_id
   LIMIT 500;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_hr_processamento_resultados_ler(uuid, uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_hr_processamento_resultados_ler(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.rpc_hr_processamento_resultados_ler(uuid, uuid) IS
'Os resultados gravados de um periodo FECHADO, ate 500 linhas por chamada, ordenadas por pessoa_id e a seguir a p_depois (keyset): o cliente repete com o ultimo pessoa_id recebido ate vir menos de 500. Com o nome de quem fechou. Exige hr.processamento.periodo.view e hr.pessoas.retribuicao.view na organizacao do periodo (inexistente e sem permissao dao a mesma mensagem). Periodo aberto: processamento_resultados_periodo_aberto. Periodo fechado antes de 20270109900000: zero linhas (fechado antes do registo).';


-- ==============================================================================
-- 5. Conferir (estrutura, privilegios e comportamento na nike, desfeito)
-- ==============================================================================
DO $conferir$
DECLARE
  k_nike      constant uuid := 'b6ffce4f-f630-4933-833a-008649757a33'::uuid;
  k_fechar    constant text := 'public.rpc_hr_processamento_periodo_fechar(uuid, jsonb)';
  k_ler       constant text := 'public.rpc_hr_processamento_resultados_ler(uuid, uuid)';
  v_r         record;
  v_esperado  text;
  v_lista     text;
  v_n         integer;
  v_pessoas   integer;
  v_uid       uuid;
  v_falso     uuid;
  v_autor     uuid;
  v_per       uuid;
  v_per_ab    uuid;
  v_per_ant   uuid;
  v_regra_id  uuid;
  v_payload   jsonb;
  v_msg       text;
  v_row       public.hr_processamento_resultados%ROWTYPE;
  v_estado    text;
  v_primeira  uuid;
  v_ultima    uuid;
BEGIN
  -- 5.1 Assinaturas: a antiga largada; as novas unicas.
  IF to_regprocedure('public.rpc_hr_processamento_periodo_fechar(uuid)') IS NOT NULL
     OR to_regprocedure(k_fechar) IS NULL
     OR to_regprocedure(k_ler) IS NULL
     OR (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname::text = 'public'
            AND p.proname::text IN ('rpc_hr_processamento_periodo_fechar', 'rpc_hr_processamento_resultados_ler')) <> 2 THEN
    RAISE EXCEPTION 'Conferir: fechar devia existir so como (uuid, jsonb) e ler so como (uuid, uuid).';
  END IF;

  -- 5.2 SECURITY DEFINER e search_path vazio nas duas RPCs; EXECUTE por aclexplode.
  FOR v_r IN SELECT f.fn FROM (VALUES (k_fechar), (k_ler)) AS f(fn) LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid = to_regprocedure(v_r.fn)::oid AND p.prosecdef
                      AND coalesce(array_to_string(p.proconfig, ','), '')::text IN ('search_path=""', 'search_path=')) THEN
      RAISE EXCEPTION 'Conferir: % devia ser SECURITY DEFINER com search_path vazio.', v_r.fn;
    END IF;
  END LOOP;
  FOR v_r IN
    SELECT f.fn, f.authenticated
      FROM (VALUES (k_fechar, true), (k_ler, true),
                   ('public.hr_processamento_resultado_erro(jsonb)', false),
                   ('public.hr_processamento_resultados_guarda()', false)) AS f(fn, authenticated)
  LOOP
    SELECT string_agg(CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE a.grantee::regrole::text END, ',') INTO v_lista
      FROM pg_proc p, LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
     WHERE p.oid = to_regprocedure(v_r.fn)::oid
       AND a.privilege_type::text = 'EXECUTE'
       AND (a.grantee = 0 OR a.grantee::regrole::text IN ('anon', 'authenticated', 'service_role'));
    v_esperado := CASE WHEN v_r.authenticated THEN 'authenticated' ELSE '' END;
    IF coalesce(v_lista, '') IS DISTINCT FROM v_esperado THEN
      RAISE EXCEPTION 'Conferir: EXECUTE em % devia ser so "%", e "%".', v_r.fn, v_esperado, coalesce(v_lista, '');
    END IF;
  END LOOP;

  -- 5.3 Tabela: RLS forcada, uma politica de SELECT, so SELECT a authenticated, triggers.
  IF NOT (SELECT c.relrowsecurity AND c.relforcerowsecurity FROM pg_class c
           WHERE c.oid = to_regclass('public.hr_processamento_resultados')) THEN
    RAISE EXCEPTION 'Conferir: hr_processamento_resultados devia ter RLS ligada e forcada.';
  END IF;
  SELECT string_agg((CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE a.grantee::regrole::text END) || ':' || a.privilege_type::text,
                    ',' ORDER BY a.privilege_type::text) INTO v_lista
    FROM pg_class c, LATERAL aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
   WHERE c.oid = to_regclass('public.hr_processamento_resultados')
     AND (a.grantee = 0 OR a.grantee::regrole::text IN ('anon', 'authenticated', 'service_role'));
  IF coalesce(v_lista, '') IS DISTINCT FROM 'authenticated:SELECT' THEN
    RAISE EXCEPTION 'Conferir: privilegios em hr_processamento_resultados deviam ser so authenticated:SELECT, e "%".', coalesce(v_lista, '');
  END IF;
  SELECT count(*) INTO v_n FROM pg_policies pl
   WHERE pl.schemaname::text = 'public' AND pl.tablename::text = 'hr_processamento_resultados';
  IF v_n <> 1 OR NOT EXISTS (SELECT 1 FROM pg_policies pl
                              WHERE pl.schemaname::text = 'public' AND pl.tablename::text = 'hr_processamento_resultados'
                                AND pl.cmd::text = 'SELECT') THEN
    RAISE EXCEPTION 'Conferir: hr_processamento_resultados devia ter exactamente uma politica, de SELECT (tem %).', v_n;
  END IF;
  SELECT count(*) INTO v_n FROM pg_trigger t
   WHERE t.tgrelid = to_regclass('public.hr_processamento_resultados') AND NOT t.tgisinternal
     AND t.tgname::text IN ('trg_hr_processamento_resultados_guarda', 'trg_hr_processamento_resultados_sem_truncate');
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'Conferir: faltam triggers de imutabilidade (% de 2).', v_n;
  END IF;

  -- 5.4 Comportamento na nike, em 2099, DESFEITO no fim (sentinela HRD00).
  BEGIN
    -- As pessoas OBRIGATORIAS de 2099-05: activas com vinculo nao apagado que
    -- sobrepoe 01/05/2099-31/05/2099 (na pratica, contratos sem fim).
    CREATE TEMP TABLE tmp_pr_obrigatorias ON COMMIT DROP AS
    SELECT DISTINCT p.id
      FROM public.pessoas p
      JOIN public.pessoas_vinculos v
        ON v.pessoa_id = p.id AND v.organization_id = p.organization_id AND v.deleted_at IS NULL
       AND v.data_inicio <= DATE '2099-05-31' AND (v.data_fim IS NULL OR v.data_fim >= DATE '2099-05-01')
     WHERE p.organization_id = k_nike AND p.deleted_at IS NULL AND p.estado_registo = 'activo';
    SELECT count(*)::integer, (array_agg(o.id ORDER BY o.id))[1], (array_agg(o.id ORDER BY o.id DESC))[1]
      INTO v_pessoas, v_primeira, v_ultima
      FROM tmp_pr_obrigatorias o;
    SELECT au.auth_user_id, au.id INTO v_uid, v_autor
      FROM public.anew_memberships am
      JOIN public.anew_users au ON au.id = am.user_id
     WHERE am.organization_id = k_nike AND am.status = 'active' AND au.auth_user_id IS NOT NULL
       AND public.has_anew_permission_in_org(au.auth_user_id, 'hr.processamento.periodo.gerir', k_nike)
       AND public.has_anew_permission_in_org(au.auth_user_id, 'hr.processamento.periodo.view', k_nike)
       AND public.has_anew_permission_in_org(au.auth_user_id, 'hr.pessoas.retribuicao.view', k_nike)
     ORDER BY au.id
     LIMIT 1;
    IF v_pessoas < 1 OR v_uid IS NULL THEN
      RAISE EXCEPTION 'Conferir: na nike faltam pessoas activas com vinculo sem fim (%) ou um utilizador activo com hr.processamento.periodo.gerir, .view e hr.pessoas.retribuicao.view (%).',
        v_pessoas, coalesce(v_uid::text, 'nenhum');
    END IF;

    INSERT INTO public.hr_periodos_processamento (organization_id, ano, mes, estado, data_inicio, data_fim)
    VALUES (k_nike, 2099, 5, 'aberto', DATE '2099-05-01', DATE '2099-05-31')
    RETURNING id INTO v_per;
    INSERT INTO public.hr_periodos_processamento (organization_id, ano, mes, estado, data_inicio, data_fim)
    VALUES (k_nike, 2099, 6, 'aberto', DATE '2099-06-01', DATE '2099-06-30')
    RETURNING id INTO v_per_ab;
    -- Um periodo fechado "a moda antiga" (sem resultados), como os de antes desta migration.
    INSERT INTO public.hr_periodos_processamento (organization_id, ano, mes, estado, data_inicio, data_fim)
    VALUES (k_nike, 2099, 7, 'aberto', DATE '2099-07-01', DATE '2099-07-31')
    RETURNING id INTO v_per_ant;
    UPDATE public.hr_periodos_processamento
       SET estado = 'fechado', fechado_em = now(), fechado_por = v_autor
     WHERE id = v_per_ant;

    v_regra_id := (public.hr_regras_salariais_em(k_nike, DATE '2099-05-31') ->> 'id')::uuid;

    -- Um lancamento manual de 12,34 (e um anulado de 99,00, que nao conta) para
    -- a primeira pessoa.
    INSERT INTO public.hr_processamento_lancamentos (periodo_id, pessoa_id, organization_id, descricao, valor)
    VALUES (v_per, v_primeira, k_nike, 'Premio teste', 12.34);
    INSERT INTO public.hr_processamento_lancamentos (periodo_id, pessoa_id, organization_id, descricao, valor,
                                                     anulado_em, anulado_por, anulado_motivo)
    VALUES (v_per, v_primeira, k_nike, 'Anulado teste', 99, now(), v_autor, 'teste');

    SELECT jsonb_agg(jsonb_build_object(
             'pessoa_id', o.id,
             'valor_hora', 8.16345,
             'total_bruto', 1234.567,
             'totais', jsonb_build_object(
               'base_mes', 1414, 'divisor_duodecimos', NULL, 'total_codigos_automaticos', 0,
               'total_regras', 353.5, 'desconto_faltas', 0, 'subsidio_alimentacao', 6.15,
               'lancamentos_pontuais', CASE WHEN o.id = v_primeira THEN 12.34 ELSE NULL END),
             'linhas', jsonb_build_array(
               jsonb_build_object('origem', 'regra', 'tipo', 'iht', 'faixa', NULL, 'quantidade', NULL, 'valor', 353.5)),
             'avisos', jsonb_build_array('duodecimos_por_decidir'),
             'retribuicao_id', NULL,
             'cargo_periodo_id', NULL,
             'regra_salarial_id', v_regra_id) ORDER BY o.id)
      INTO v_payload
      FROM tmp_pr_obrigatorias o;

    -- a) sem sessao.
    PERFORM set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '{}', true);
    v_msg := NULL;
    BEGIN
      PERFORM public.rpc_hr_processamento_periodo_fechar(v_per, v_payload);
    EXCEPTION WHEN OTHERS THEN v_msg := SQLERRM;
    END;
    IF coalesce(position('rpc_hr_processamento_periodo_fechar exige um utilizador autenticado' IN v_msg), 0) <> 1 THEN
      RAISE EXCEPTION 'Conferir: fechar sem sessao devia ser recusado (%).', coalesce(v_msg, 'aceite');
    END IF;

    -- b) utilizador sem permissao (uid que nao existe): fechar e ler recusados.
    v_falso := gen_random_uuid();
    PERFORM set_config('request.jwt.claim.sub', v_falso::text, true),
            set_config('request.jwt.claims', json_build_object('sub', v_falso, 'role', 'authenticated')::text, true);
    v_msg := NULL;
    BEGIN
      PERFORM public.rpc_hr_processamento_periodo_fechar(v_per, v_payload);
    EXCEPTION WHEN OTHERS THEN v_msg := SQLERRM;
    END;
    IF coalesce(position('Sem permissao hr.processamento.periodo.gerir' IN v_msg), 0) <> 1 THEN
      RAISE EXCEPTION 'Conferir: fechar sem permissao devia ser recusado (%).', coalesce(v_msg, 'aceite');
    END IF;
    v_msg := NULL;
    BEGIN
      PERFORM 1 FROM public.rpc_hr_processamento_resultados_ler(v_per_ant);
    EXCEPTION WHEN OTHERS THEN v_msg := SQLERRM;
    END;
    IF coalesce(position('processamento_resultados_sem_permissao' IN v_msg), 0) <> 1 THEN
      RAISE EXCEPTION 'Conferir: ler sem permissao devia ser recusado (%).', coalesce(v_msg, 'aceite');
    END IF;

    -- c) as recusas de estrutura e de conteudo, com o utilizador da nike.
    PERFORM set_config('request.jwt.claim.sub', v_uid::text, true),
            set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
    FOR v_r IN
      SELECT t.nome, t.payload, t.esperado
        FROM (VALUES
          ('nao e lista',        '{}'::jsonb,                                                            'processamento_fechar_resultado_mal_formado'),
          ('nulo',               NULL::jsonb,                                                            'processamento_fechar_resultado_mal_formado'),
          ('valor_hora texto',   jsonb_set(v_payload, '{0,valor_hora}', '"8"'::jsonb),                   'processamento_fechar_resultado_mal_formado'),
          ('campo a mais',       jsonb_set(v_payload, '{0,extra}', '1'::jsonb),                          'processamento_fechar_resultado_mal_formado'),
          ('totais sem chave',   jsonb_set(v_payload, '{0,totais}', '{"base_mes": 1}'::jsonb),           'processamento_fechar_resultado_mal_formado'),
          ('linha sem origem',   jsonb_set(v_payload, '{0,linhas}', '[{"valor": 1}]'::jsonb),            'processamento_fechar_resultado_mal_formado'),
          ('aviso invalido',     jsonb_set(v_payload, '{0,avisos}', '["Nao Pode"]'::jsonb),              'processamento_fechar_resultado_mal_formado'),
          ('pessoa repetida',    v_payload || jsonb_build_array(v_payload -> 0),                         'processamento_fechar_pessoa_repetida'),
          ('pessoa de fora',     v_payload || jsonb_build_array(jsonb_set(v_payload -> 0, '{pessoa_id}', to_jsonb(gen_random_uuid()::text))),
                                                                                                         'processamento_fechar_pessoa_fora_do_periodo'),
          ('pessoa em falta',    v_payload - 0,                                                          'processamento_fechar_resultado_em_falta'),
          ('outra regra',        jsonb_set(v_payload, '{0,regra_salarial_id}', to_jsonb(gen_random_uuid()::text)),
                                                                                                         'processamento_fechar_regra_desactualizada'),
          ('retribuicao alheia', jsonb_set(v_payload, '{0,retribuicao_id}', to_jsonb(gen_random_uuid()::text)),
                                                                                                         'processamento_fechar_versao_invalida'),
          ('cargo alheio',       jsonb_set(v_payload, '{0,cargo_periodo_id}', to_jsonb(gen_random_uuid()::text)),
                                                                                                         'processamento_fechar_versao_invalida'),
          ('lancamentos a 0',    jsonb_set(v_payload, '{0,totais,lancamentos_pontuais}', '0'::jsonb),     'processamento_fechar_lancamentos_desactualizados'),
          ('lancamentos c/ anulado', jsonb_set(v_payload, '{0,totais,lancamentos_pontuais}', '111.34'::jsonb),
                                                                                                         'processamento_fechar_lancamentos_desactualizados')
        ) AS t(nome, payload, esperado)
    LOOP
      v_msg := NULL;
      BEGIN
        PERFORM public.rpc_hr_processamento_periodo_fechar(v_per, v_r.payload);
      EXCEPTION WHEN OTHERS THEN v_msg := SQLERRM;
      END;
      IF coalesce(position(v_r.esperado IN v_msg), 0) <> 1 THEN
        RAISE EXCEPTION 'Conferir: "%" devia dar % e deu: %.', v_r.nome, v_r.esperado, coalesce(v_msg, 'aceite');
      END IF;
    END LOOP;
    SELECT pp.estado INTO v_estado FROM public.hr_periodos_processamento pp WHERE pp.id = v_per;
    SELECT count(*)::integer INTO v_n FROM public.hr_processamento_resultados r WHERE r.periodo_id = v_per;
    IF v_estado IS DISTINCT FROM 'aberto' OR v_n <> 0 THEN
      RAISE EXCEPTION 'Conferir: depois das recusas o periodo devia continuar aberto e sem resultados (% / %).', v_estado, v_n;
    END IF;

    -- d) ler um periodo aberto: recusado.
    v_msg := NULL;
    BEGIN
      PERFORM 1 FROM public.rpc_hr_processamento_resultados_ler(v_per_ab);
    EXCEPTION WHEN OTHERS THEN v_msg := SQLERRM;
    END;
    IF coalesce(position('processamento_resultados_periodo_aberto' IN v_msg), 0) <> 1 THEN
      RAISE EXCEPTION 'Conferir: ler um periodo aberto devia ser recusado (%).', coalesce(v_msg, 'aceite');
    END IF;

    -- e) fechar com sucesso: periodo fechado e uma linha por pessoa activa, arredondada.
    PERFORM public.rpc_hr_processamento_periodo_fechar(v_per, v_payload);
    SELECT pp.estado INTO v_estado FROM public.hr_periodos_processamento pp WHERE pp.id = v_per;
    SELECT count(*)::integer INTO v_n FROM public.hr_processamento_resultados r
     WHERE r.periodo_id = v_per AND r.organization_id = k_nike AND r.fechado_por = v_autor;
    IF v_estado IS DISTINCT FROM 'fechado' OR v_n <> v_pessoas THEN
      RAISE EXCEPTION 'Conferir: fechar devia deixar o periodo fechado com % resultados (estado %, % linhas).', v_pessoas, v_estado, v_n;
    END IF;
    SELECT * INTO v_row FROM public.hr_processamento_resultados r WHERE r.periodo_id = v_per ORDER BY r.pessoa_id LIMIT 1;
    IF v_row.total_bruto IS DISTINCT FROM 1234.57::numeric OR v_row.valor_hora IS DISTINCT FROM 8.1635::numeric
       OR v_row.avisos IS DISTINCT FROM ARRAY['duodecimos_por_decidir']::text[]
       OR v_row.regra_salarial_id IS DISTINCT FROM v_regra_id
       OR (v_row.totais ->> 'subsidio_alimentacao')::numeric IS DISTINCT FROM 6.15::numeric
       OR (v_row.totais ->> 'lancamentos_pontuais')::numeric IS DISTINCT FROM 12.34::numeric
       OR v_row.pessoa_id IS DISTINCT FROM v_primeira
       OR jsonb_array_length(v_row.linhas) <> 1 THEN
      RAISE EXCEPTION 'Conferir: o resultado gravado nao e o enviado (total %, valor hora %, avisos %).',
        v_row.total_bruto, v_row.valor_hora, v_row.avisos;
    END IF;

    -- f) fechar outra vez: recusado com a mensagem antiga.
    v_msg := NULL;
    BEGIN
      PERFORM public.rpc_hr_processamento_periodo_fechar(v_per, v_payload);
    EXCEPTION WHEN OTHERS THEN v_msg := SQLERRM;
    END;
    IF coalesce(position('ja esta fechado' IN v_msg), 0) = 0 THEN
      RAISE EXCEPTION 'Conferir: fechar um periodo fechado devia ser recusado (%).', coalesce(v_msg, 'aceite');
    END IF;

    -- g) ler: o gravado; e o periodo fechado antes do registo devolve zero linhas.
    SELECT count(*)::integer INTO v_n FROM public.rpc_hr_processamento_resultados_ler(v_per);
    IF v_n <> least(v_pessoas, 500) THEN
      RAISE EXCEPTION 'Conferir: ler devia devolver % linhas e devolveu %.', least(v_pessoas, 500), v_n;
    END IF;
    -- keyset: a seguir a primeira, menos uma; a seguir a ultima, nenhuma.
    SELECT count(*)::integer INTO v_n FROM public.rpc_hr_processamento_resultados_ler(v_per, v_primeira);
    IF v_n <> least(v_pessoas - 1, 500) THEN
      RAISE EXCEPTION 'Conferir: ler a seguir a primeira pessoa devia devolver % linhas e devolveu %.', least(v_pessoas - 1, 500), v_n;
    END IF;
    SELECT count(*)::integer INTO v_n FROM public.rpc_hr_processamento_resultados_ler(v_per, v_ultima);
    IF v_n <> 0 THEN
      RAISE EXCEPTION 'Conferir: ler a seguir a ultima pessoa devia devolver zero linhas (%).', v_n;
    END IF;
    SELECT count(*)::integer INTO v_n FROM public.rpc_hr_processamento_resultados_ler(v_per_ant);
    IF v_n <> 0 THEN
      RAISE EXCEPTION 'Conferir: um periodo fechado antes do registo devia devolver zero linhas (%).', v_n;
    END IF;

    PERFORM set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '{}', true);

    -- h) imutavel: UPDATE, DELETE e INSERT num periodo fechado recusados (mesmo ao dono).
    v_n := 0;
    BEGIN UPDATE public.hr_processamento_resultados SET total_bruto = 0 WHERE periodo_id = v_per;
    EXCEPTION WHEN OTHERS THEN IF position('processamento_resultados_imutavel' IN SQLERRM) = 1 THEN v_n := v_n + 1; END IF; END;
    BEGIN DELETE FROM public.hr_processamento_resultados WHERE periodo_id = v_per;
    EXCEPTION WHEN OTHERS THEN IF position('processamento_resultados_imutavel' IN SQLERRM) = 1 THEN v_n := v_n + 1; END IF; END;
    BEGIN
      INSERT INTO public.hr_processamento_resultados (organization_id, periodo_id, pessoa_id, totais, linhas, fechado_por)
      SELECT k_nike, v_per_ant, p.id, '{}'::jsonb, '[]'::jsonb, v_autor
        FROM public.pessoas p
       WHERE p.organization_id = k_nike AND p.deleted_at IS NULL AND p.estado_registo = 'activo'
       ORDER BY p.id LIMIT 1;
    EXCEPTION WHEN OTHERS THEN IF position('processamento_resultados_periodo_fechado' IN SQLERRM) = 1 THEN v_n := v_n + 1; END IF; END;
    IF v_n <> 3 THEN
      RAISE EXCEPTION 'Conferir: das 3 escritas proibidas (UPDATE, DELETE, INSERT em periodo fechado) so % foram recusadas.', v_n;
    END IF;

    RAISE EXCEPTION 'teste_resultados_ok' USING ERRCODE = 'HRD00';
  EXCEPTION
    WHEN SQLSTATE 'HRD00' THEN
      NULL; -- sucesso: tudo o que o bloco escreveu na nike foi desfeito.
  END;

  PERFORM set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '{}', true);

  IF EXISTS (SELECT 1 FROM public.hr_periodos_processamento pp
              WHERE pp.organization_id = k_nike AND pp.ano = 2099 AND pp.mes IN (5, 6, 7)) THEN
    RAISE EXCEPTION 'Conferir: o teste deixou periodos de 2099 na nike.';
  END IF;

  RAISE NOTICE 'Conferido: fechar grava um resultado por pessoa activa com vinculo no periodo e fecha na mesma transaccao; recusa estrutura mal formada, repetidas, sem vinculo no periodo, em falta, lancamentos desactualizados, outra regra e versoes alheias; ler (com as duas permissoes) devolve o gravado em paginas por pessoa_id e zero linhas num periodo fechado antes do registo; resultados imutaveis.';
END;
$conferir$;

-- ==============================================================================
-- ANTES DO db push
--
-- 1. "supabase migration list --linked" imediatamente antes, a partir do
--    worktree rh-pessoas (project-ref uetjghdkwbywbftedtth): so este ficheiro
--    pendente, com carimbo acima do maximo do remoto.
-- 2. Prova na nike ANTES do push: correr este ficheiro inteiro numa transaccao
--    terminada por um RAISE EXCEPTION (desfaz tudo); as guardas confirmam o
--    corpo do remoto, o conferir prova o resto.
-- 3. O cliente (useProcessamentoPeriodo envia p_resultados; periodo fechado le
--    rpc_hr_processamento_resultados_ler; "fechado antes do registo") entra no
--    MESMO envio: sem ele ninguem fecha periodos.
-- ==============================================================================
