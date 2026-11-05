-- ==============================================================================
-- Periodo da folha configuravel + prazo de justificar ate ao fecho do periodo.
--
-- PROVISORIO. Carimbo escolhido por quem orquestra, depois da revisao
-- (ecc:database-reviewer + ecc:security-reviewer) e da prova na nike.
-- Versao 2: corrige os achados das duas revisoes (HIGH1, HIGH2, MEDIUM a-f, LOW).
--
--
-- -- O QUE MUDA -----------------------------------------------------------------
--
-- 1. O periodo da folha deixa de ser o mes de calendario. Cada organizacao
--    escolhe o dia de inicio (1 a 28); o periodo vai desse dia ate ao dia
--    anterior do mes seguinte, e o NOME do periodo e o mes do fecho
--    (dia 22: a folha de NOVEMBRO vai de 22/10 a 21/11). Sem regra gravada o
--    dia de inicio e 1: mes de calendario, o comportamento de hoje.
--    - Tabela nova hr_regras_periodo_folha (versionada): uma regra vale a
--      partir da folha do mes valido_de (sempre dia 1). Uma so regra em vigor
--      por organizacao e mes: gravar outra para o mesmo mes marca a anterior
--      como substituida (fica no historico). Nunca para tras do periodo em
--      curso. Escrita e leitura so pelas RPCs; RLS forcada, sem politicas,
--      sem GRANT.
--    - hr_periodos_processamento ganha data_inicio, data_fim e transicao
--      (a tabela tem 0 linhas no remoto, nada a migrar -- a guarda confere-o).
--      (ano, mes) = mes de data_fim; datas imutaveis; sem sobreposicao.
--    - DURACAO: um periodo normal tem 28 a 31 dias (CHECK). O PRIMEIRO periodo
--      depois de mudar o dia de inicio e de TRANSICAO (transicao = true) e
--      pode ter de 1 a 62 dias: de 28 para 2 da um periodo de 2 a 5 dias; de
--      2 para 28 da um de cerca de 56. E a unica forma de mudar sem buracos;
--      o ecra deve mostra-lo. Excepcao assumida, nao um limite esquecido.
--    - rpc_hr_processamento_periodo_abrir: mesma assinatura; calcula as datas
--      e a marca de transicao, com o lock da organizacao tomado no inicio.
--    - Fechar nao muda. Reabrir continua fora (decisao de produto).
--
-- 2. O prazo de justificar deixa de ser "5 dias uteis": entrega-se ate ao
--    FIM do periodo da folha que contem o dia (inclusive), e nunca depois de o
--    periodo ser fechado (o dia do fecho so conta enquanto o periodo nao foi
--    fechado). Depois disso a falta fica INJUSTIFICADA PARA SEMPRE: estado
--    derivado (sem coluna nem job), e ninguem a justifica, RH incluido.
--    - hr_justificacao_dia_prazo(date) e LARGADA; nasce
--      hr_justificacao_dia_prazo(uuid, date): o ultimo dia em que ainda se
--      pode entregar (aberto: data_fim; fechado: o mais cedo entre data_fim e
--      a vespera do dia do fecho). Uma so funcao com este nome no fim.
--    - Recusam fora do prazo (justificacao_prazo_terminado /
--      justificacao_periodo_fechado): rpc_hr_justificacao_dia_registar,
--      rpc_hr_falta_registar_justificacao, e rpc_hr_falta_decidir_justificacao
--      quando o resultado e 'justificada' e a falta NAO tem papel entregue a
--      tempo (fecha o desvio de marcar justificada sem justificacao).
--      Recusar ('recusada') e sempre possivel. Uma justificacao entregue a
--      tempo continua a poder ser decidida depois do fecho.
--    - Aceitar uma justificacao do dia entregue a tempo, depois do prazo:
--      rpc_hr_justificacao_dia_decidir poe a marca de transaccao
--      hr_justificacao.via_dia = <id> enquanto chama as RPCs de faltas. A
--      marca SO dispensa o prazo se existir essa justificacao do dia,
--      pendente, da mesma pessoa, dia e hora de inicio, e criada a tempo. A
--      marca sozinha nao da nada: e um GUC (o cliente nao o define pelo
--      PostgREST) e e conferida contra os dados.
--    - justificacao_dia_mes_fechado passa a olhar para o periodo que CONTEM o
--      dia (antes: ano/mes de calendario, errado com periodos 22 a 21).
--    - Nao existe / sem permissao: as tres RPCs de justificacao reescritas
--      devolvem a MESMA mensagem para os dois casos, e verificam a permissao
--      antes de bloquear a linha.
--
-- Permissoes: o plano dizia hr.processamento.view, que NAO existe no
-- catalogo. Usa-se hr.processamento.periodo.view para ler e
-- hr.processamento.periodo.gerir para escrever. Nenhuma permissao e criada.
--
--
-- -- PORQUE TRIGGER E NAO EXCLUSION CONSTRAINT ----------------------------------
--
-- btree_gist esta disponivel no remoto mas NAO instalada, e esta migration
-- nao instala extensoes. A sobreposicao valida-se num trigger BEFORE INSERT OR
-- UPDATE que serializa por organizacao com pg_advisory_xact_lock (mesma chave
-- que abrir e guardar a regra tomam no inicio). Limite assumido: o trigger so
-- ve linhas de outras transaccoes ja confirmadas em READ COMMITTED (o
-- PostgREST usa READ COMMITTED); em REPEATABLE READ uma corrida podia escapar
-- -- e o UNIQUE (organization_id, ano, mes) continua la.
--
-- O trigger de imutabilidade antigo (hr_processamento_periodo_imutavel_fechado)
-- NAO e alterado: as datas e a transicao ficam protegidas pelo trigger novo,
-- SEMPRE (aberto ou fechado), porque nenhuma RPC as muda.
--
--
-- -- ATOMICIDADE ---------------------------------------------------------------
--
-- O ficheiro tem de correr numa so transaccao (o supabase db push fa-lo por
-- migration). A primeira guarda confirma-o: SET LOCAL fora de uma transaccao
-- nao tem efeito, por isso, se lock_timeout nao ficou a 5s, a migration
-- recusa ANTES de mudar o que quer que seja.
--
--
-- -- GUARDAS POR MD5 -----------------------------------------------------------
--
-- G3 compara md5 do prosrc BRUTO do remoto (lido a 05/11, os 7 batem). Tres
-- dessas funcoes (rpc_hr_justificacao_dia_registar, rpc_hr_justificacao_dia_decidir
-- e hr_justificacao_dia_prazo(date)) tem CRLF no corpo remoto, porque vieram de
-- ficheiros CRLF. NAO normalizar o \r nas guardas: os md5 deixariam de bater.
-- Os corpos novos deste ficheiro sao LF; o conferir nao usa md5 sobre eles.
--
--
-- -- PRECISA DE CODIGO NOVO NO MESMO ENVIO -------------------------------------
--
-- SIM. Sem o codigo novo:
--   - o ecra de Faltas continua a mostrar "5 dias uteis" e o calculo local do
--     prazo, e a base recusa com codigos que ele nao traduz
--     (justificacao_prazo_terminado, justificacao_periodo_fechado);
--   - o Processamento continua a usar o mes de calendario para faltas, horas
--     extra e subsidio, enquanto a base ja guarda periodos 22 a 21;
--   - falta_inexistente deixa de ser emitido (passa a falta_sem_permissao) e
--     justificacao_dia_inexistente tambem (passa a justificacao_dia_sem_permissao).
-- O codigo antigo nao chama hr_justificacao_dia_prazo(date) (lido em src/).
--
--
-- -- O QUE MUDA PARA AS OUTRAS ORGANIZACOES DA BASE RH -------------------------
--
--   - Periodos: 0 linhas no remoto; nada a migrar.
--   - Sem regra gravada, o dia de inicio e 1: o periodo e o mes de calendario.
--   - O prazo de TODAS passa de 5 dias uteis para o fim do mes (ou o fecho do
--     periodo, se for fechado antes). Para os primeiros dias do mes o prazo
--     alarga; para os ultimos encurta (dia 31 -> ate dia 31).
--   - Todas passam a recusar justificacoes (novas, e decisoes "justificada"
--     sem papel entregue a tempo) de dias anteriores ao periodo corrente, RH
--     incluido: no dia da migracao (05/11), tudo o que for de outubro ou
--     antes, ja nao se justifica.
--   - Um periodo fechado deixa de aceitar justificacoes, tambem do RH.
--   - Nao apaga nem reclassifica nenhuma falta nem justificacao existente
--     (nike: 8 faltas, 3 justificacoes de falta, 0 justificacoes do dia).
--
--
-- -- CODIGOS DE ERRO NOVOS (prefixo da mensagem; ERRCODE entre parenteses) ----
--
--   justificacao_prazo_terminado (23514)   justificacao_periodo_fechado (23514)
--   justificacao_periodo_indeterminado (22023)
--   periodo_folha_sobreposto (23P01)       periodo_folha_datas_imutaveis (22000)
--   periodo_folha_regra_imutavel (22000)   periodo_folha_regra_retroactiva (23514)
--   periodo_folha_dia_invalido (23514)     periodo_folha_valido_de_invalido (23514)
--   periodo_folha_intervalo_invalido (23514)
--   periodo_folha_sem_sessao / _sem_permissao / _sem_utilizador (42501)
--   periodo_folha_dados_em_falta (23502)
--   periodo_folha_fora_de_transaccao (25000, so na aplicacao da migration)
-- Deixam de ser emitidos: justificacao_dia_fora_do_prazo, falta_inexistente,
-- justificacao_dia_inexistente.
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- Sem ficheiro de reversao, de proposito. A mao, por migration nova: repor os
-- corpos antigos das cinco RPCs (20261207020400, 20261231800000,
-- 20261207004200), recriar hr_justificacao_dia_prazo(date), largar as funcoes
-- e a tabela novas, os dois triggers e as colunas data_inicio, data_fim e
-- transicao (so com a tabela de periodos vazia, ou depois de exportar).
--
-- Prerequisitos (a guarda confere-os):
--   20261207020400  hr_periodos_processamento e as RPCs abrir/fechar
--   20261207004200  pessoas_faltas_justificacoes e as RPCs de justificacao
--   20261231800000  justificacao do dia
-- ==============================================================================

SET LOCAL lock_timeout = '5s';

-- ---- G00: dentro de uma transaccao -------------------------------------------
DO $transaccao$
BEGIN
  IF current_setting('lock_timeout') IS DISTINCT FROM '5s' THEN
    RAISE EXCEPTION
      'periodo_folha_fora_de_transaccao: SET LOCAL nao teve efeito (lock_timeout = %); esta migration tem de correr numa so transaccao.',
      current_setting('lock_timeout')
      USING ERRCODE = '25000';
  END IF;
END;
$transaccao$;

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
DECLARE
  v_cod   text;
  v_n     integer;
  v_lista text;
  v_old   oid;
BEGIN
  -- G0. Quem aplica passa a RLS: a tabela nova tem FORCE e nenhuma politica, e
  --     as RPCs SECURITY DEFINER correm com os direitos deste papel.
  IF NOT EXISTS (SELECT 1 FROM pg_roles r
                  WHERE r.rolname::text = current_user::text AND (r.rolsuper OR r.rolbypassrls)) THEN
    RAISE EXCEPTION 'G0: o papel que aplica (%) nao tem BYPASSRLS; com FORCE RLS as RPCs nao leriam a regra.', current_user::text;
  END IF;

  -- G1. hr_periodos_processamento como foi lida no remoto: existe, vazia,
  --     ano/mes smallint, ainda sem as colunas novas.
  IF to_regclass('public.hr_periodos_processamento') IS NULL THEN
    RAISE EXCEPTION 'G1: public.hr_periodos_processamento nao existe. Aplicar 20261207020400.';
  END IF;
  SELECT count(*) INTO v_n FROM public.hr_periodos_processamento;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'G1: hr_periodos_processamento tem % linhas; esta migration supoe 0 (colunas NOT NULL sem valor a migrar).', v_n;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_attribute a
              WHERE a.attrelid = to_regclass('public.hr_periodos_processamento')
                AND a.attname::text IN ('data_inicio', 'data_fim', 'transicao') AND NOT a.attisdropped) THEN
    RAISE EXCEPTION 'G1: hr_periodos_processamento ja tem data_inicio, data_fim ou transicao. Ler o que la esta.';
  END IF;
  SELECT count(*) INTO v_n FROM pg_attribute a
   WHERE a.attrelid = to_regclass('public.hr_periodos_processamento')
     AND a.attname::text IN ('ano', 'mes') AND NOT a.attisdropped
     AND format_type(a.atttypid, a.atttypmod)::text = 'smallint';
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'G1: ano e mes de hr_periodos_processamento ja nao sao smallint (% de 2).', v_n;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint c
                  WHERE c.conrelid = to_regclass('public.hr_periodos_processamento')
                    AND c.conname::text = 'hr_periodos_processamento_org_ano_mes_key' AND c.contype::text = 'u')
     OR NOT EXISTS (SELECT 1 FROM pg_constraint c
                     WHERE c.conrelid = to_regclass('public.hr_periodos_processamento')
                       AND c.conname::text = 'hr_periodos_processamento_estado_valido'
                       AND pg_get_constraintdef(c.oid)::text LIKE '%''fechado''%') THEN
    RAISE EXCEPTION 'G1: falta UNIQUE (organization_id, ano, mes) ou o estado ''fechado'' em hr_periodos_processamento.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger t
                  WHERE t.tgrelid = to_regclass('public.hr_periodos_processamento')
                    AND t.tgname::text = 'trg_hr_periodos_processamento_imutavel' AND NOT t.tgisinternal) THEN
    RAISE EXCEPTION 'G1: o trigger trg_hr_periodos_processamento_imutavel nao existe.';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_trigger t
              WHERE t.tgrelid = to_regclass('public.hr_periodos_processamento')
                AND t.tgname::text = 'trg_hr_periodos_processamento_datas') THEN
    RAISE EXCEPTION 'G1: o trigger trg_hr_periodos_processamento_datas ja existe.';
  END IF;

  -- G2. Os objectos novos nao existem.
  IF to_regclass('public.hr_regras_periodo_folha') IS NOT NULL THEN
    RAISE EXCEPTION 'G2: public.hr_regras_periodo_folha ja existe.';
  END IF;
  SELECT string_agg(p.oid::regprocedure::text, ', ') INTO v_lista
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname::text = 'public'
     AND p.proname::text IN ('hr_periodo_folha_dia_inicio', 'hr_periodo_folha_fim', 'hr_periodo_folha_do_dia',
                             'hr_justificacao_prazo_do_dia', 'hr_justificacao_entregue_a_tempo',
                             'hr_justificacao_dia_dispensa_prazo', 'hr_justificacao_exigir_prazo',
                             'hr_periodos_processamento_validar_datas', 'hr_regras_periodo_folha_append_only',
                             'rpc_hr_periodo_folha_regras_listar', 'rpc_hr_periodo_folha_regra_guardar');
  IF v_lista IS NOT NULL THEN
    RAISE EXCEPTION 'G2: ja existem funcoes com nomes desta migration: %.', v_lista;
  END IF;
  IF to_regprocedure('public.hr_justificacao_dia_prazo(uuid, date)') IS NOT NULL THEN
    RAISE EXCEPTION 'G2: hr_justificacao_dia_prazo(uuid, date) ja existe.';
  END IF;

  -- G3. Os corpos que esta migration substitui (ou de que depende) sao os
  --     lidos no remoto. md5(prosrc) lido a 05/11.
  IF to_regprocedure('public.rpc_hr_processamento_periodo_abrir(uuid, smallint, smallint)') IS NULL
     OR to_regprocedure('public.rpc_hr_processamento_periodo_fechar(uuid)') IS NULL
     OR to_regprocedure('public.hr_justificacao_dia_prazo(date)') IS NULL
     OR to_regprocedure('public.rpc_hr_justificacao_dia_registar(uuid, uuid, date, text, boolean, time, time, text, time, text[])') IS NULL
     OR to_regprocedure('public.rpc_hr_justificacao_dia_decidir(uuid, text, text, boolean)') IS NULL
     OR to_regprocedure('public.rpc_hr_falta_registar_justificacao(uuid, text, text, text, text, date, smallint)') IS NULL
     OR to_regprocedure('public.rpc_hr_falta_decidir_justificacao(uuid, text, text)') IS NULL
     OR to_regprocedure('public.rpc_hr_falta_marcar(uuid, uuid, date, time, time, text, uuid, boolean, boolean)') IS NULL THEN
    RAISE EXCEPTION 'G3: falta uma das funcoes esperadas com a assinatura lida no remoto.';
  END IF;
  IF (SELECT md5(p.prosrc) FROM pg_proc p WHERE p.oid = to_regprocedure('public.rpc_hr_processamento_periodo_abrir(uuid, smallint, smallint)')::oid)
       IS DISTINCT FROM '94ffb537946bbc8f3fecee1d85a99dc9'
  OR (SELECT md5(p.prosrc) FROM pg_proc p WHERE p.oid = to_regprocedure('public.rpc_hr_processamento_periodo_fechar(uuid)')::oid)
       IS DISTINCT FROM '7e0070d94359259d20c569e0e464116e'
  OR (SELECT md5(p.prosrc) FROM pg_proc p WHERE p.oid = to_regprocedure('public.hr_justificacao_dia_prazo(date)')::oid)
       IS DISTINCT FROM 'f9ec3fb1b5c0cb526b4c51ee33babdf3'
  OR (SELECT md5(p.prosrc) FROM pg_proc p WHERE p.oid = to_regprocedure('public.rpc_hr_justificacao_dia_registar(uuid, uuid, date, text, boolean, time, time, text, time, text[])')::oid)
       IS DISTINCT FROM 'fdfb898f94b54530886bb9ac48ce83d9'
  OR (SELECT md5(p.prosrc) FROM pg_proc p WHERE p.oid = to_regprocedure('public.rpc_hr_justificacao_dia_decidir(uuid, text, text, boolean)')::oid)
       IS DISTINCT FROM 'e46fad4f73020cafbf2985866c4389da'
  OR (SELECT md5(p.prosrc) FROM pg_proc p WHERE p.oid = to_regprocedure('public.rpc_hr_falta_registar_justificacao(uuid, text, text, text, text, date, smallint)')::oid)
       IS DISTINCT FROM '3185851d8b52a1fd29620ab81fc5818e'
  OR (SELECT md5(p.prosrc) FROM pg_proc p WHERE p.oid = to_regprocedure('public.rpc_hr_falta_decidir_justificacao(uuid, text, text)')::oid)
       IS DISTINCT FROM 'fc84fb7f4da53f6a8adde2480043a58c' THEN
    RAISE EXCEPTION 'G3: o corpo de uma das funcoes mudou desde 05/11. Reler a versao actual antes de aplicar: esta migration reescreve-as por inteiro.';
  END IF;

  -- G4. Codigos de permissao usados. Nenhum e criado aqui.
  FOREACH v_cod IN ARRAY ARRAY['hr.processamento.periodo.view', 'hr.processamento.periodo.gerir',
                               'hr.assiduidade.picar', 'hr.assiduidade.view.own',
                               'hr.assiduidade.justificacao.edit', 'hr.assiduidade.justificacao.view',
                               'hr.assiduidade.faltas.edit']
  LOOP
    IF NOT EXISTS (SELECT 1 FROM public.anew_permissions ap WHERE ap.code = v_cod) THEN
      RAISE EXCEPTION 'G4: o codigo % nao esta no catalogo.', v_cod;
    END IF;
  END LOOP;

  -- G5. Funcoes e tabelas de suporte.
  IF to_regprocedure('public.has_anew_permission_in_org(uuid, text, uuid)') IS NULL
     OR to_regprocedure('public.hr_pessoa_do_utilizador(uuid, uuid)') IS NULL THEN
    RAISE EXCEPTION 'G5: falta has_anew_permission_in_org(uuid, text, uuid) ou hr_pessoa_do_utilizador(uuid, uuid).';
  END IF;
  IF to_regclass('public.pessoas_justificacoes_dia') IS NULL OR to_regclass('public.pessoas_faltas') IS NULL
     OR to_regclass('public.pessoas_faltas_justificacoes') IS NULL THEN
    RAISE EXCEPTION 'G5: falta pessoas_justificacoes_dia, pessoas_faltas ou pessoas_faltas_justificacoes.';
  END IF;

  -- G6. Quem chama hr_justificacao_dia_prazo(date): so a RPC de registar, que
  --     esta migration reescreve. Outra funcao que a chame impede o DROP.
  v_old := to_regprocedure('public.hr_justificacao_dia_prazo(date)')::oid;
  SELECT string_agg(p.oid::regprocedure::text, ', ') INTO v_lista
    FROM pg_proc p
   WHERE p.prosrc LIKE '%hr_justificacao_dia_prazo%'
     AND p.oid <> v_old
     AND p.oid <> to_regprocedure('public.rpc_hr_justificacao_dia_registar(uuid, uuid, date, text, boolean, time, time, text, time, text[])')::oid;
  IF v_lista IS NOT NULL THEN
    RAISE EXCEPTION 'G6: hr_justificacao_dia_prazo e usada por funcoes que esta migration nao reescreve: %.', v_lista;
  END IF;
  SELECT count(*) INTO v_n FROM pg_depend d
   WHERE d.refclassid = 'pg_catalog.pg_proc'::regclass AND d.refobjid = v_old;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'G6: ha % objectos dependentes de hr_justificacao_dia_prazo(date) (vista, constraint, politica).', v_n;
  END IF;
END;
$guardas$;


-- ==============================================================================
-- 1. A regra do periodo da folha
-- ==============================================================================
CREATE TABLE public.hr_regras_periodo_folha (
  id               uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL,
  dia_inicio       smallint NOT NULL,
  valido_de        date NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  created_by       uuid,
  substituida_em   timestamptz,
  substituida_por  uuid,

  CONSTRAINT hr_regras_periodo_folha_pkey PRIMARY KEY (id),
  CONSTRAINT hr_regras_periodo_folha_org_fkey
    FOREIGN KEY (organization_id) REFERENCES public.anew_organizations (id) ON DELETE RESTRICT,
  CONSTRAINT hr_regras_periodo_folha_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES public.anew_users (id) ON DELETE SET NULL,
  CONSTRAINT hr_regras_periodo_folha_substituida_por_fkey
    FOREIGN KEY (substituida_por) REFERENCES public.anew_users (id) ON DELETE SET NULL,
  CONSTRAINT hr_regras_periodo_folha_dia_valido
    CHECK (dia_inicio BETWEEN 1 AND 28),
  CONSTRAINT hr_regras_periodo_folha_valido_de_dia_1
    CHECK (EXTRACT(day FROM valido_de) = 1),
  CONSTRAINT hr_regras_periodo_folha_valido_de_razoavel
    CHECK (valido_de BETWEEN DATE '2000-01-01' AND DATE '2100-12-01'),
  CONSTRAINT hr_regras_periodo_folha_substituicao_coerente
    CHECK (substituida_em IS NOT NULL OR substituida_por IS NULL)
);

-- Uma regra em vigor por organizacao e mes.
CREATE UNIQUE INDEX uq_hr_regras_periodo_folha_org_mes
  ON public.hr_regras_periodo_folha (organization_id, valido_de)
  WHERE substituida_em IS NULL;
CREATE INDEX idx_hr_regras_periodo_folha_created_by
  ON public.hr_regras_periodo_folha (created_by);
CREATE INDEX idx_hr_regras_periodo_folha_substituida_por
  ON public.hr_regras_periodo_folha (substituida_por) WHERE substituida_por IS NOT NULL;

COMMENT ON TABLE public.hr_regras_periodo_folha IS
'O dia de inicio do periodo da folha, por organizacao, versionado. Uma regra vale a partir da folha do mes valido_de (sempre dia 1 do mes do FECHO). Em vigor para a folha do mes M: a regra nao substituida de maior valido_de <= dia 1 de M. Sem regra: dia 1 (mes de calendario). Uma so regra nao substituida por organizacao e mes; gravar outra para o mesmo mes marca a anterior substituida_em (historico). Nada mais muda (trigger). RLS forcada, sem politicas e sem GRANT: le-se por rpc_hr_periodo_folha_regras_listar (hr.processamento.periodo.view) e grava-se por rpc_hr_periodo_folha_regra_guardar (hr.processamento.periodo.gerir).';

-- So acrescentar. UPDATE aceite: marcar substituida (uma vez), e as cascatas
-- ON DELETE SET NULL de created_by e substituida_por.
CREATE FUNCTION public.hr_regras_periodo_folha_append_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.id = OLD.id
       AND NEW.organization_id = OLD.organization_id
       AND NEW.dia_inicio = OLD.dia_inicio
       AND NEW.valido_de = OLD.valido_de
       AND NEW.created_at = OLD.created_at
       AND (NEW.created_by IS NOT DISTINCT FROM OLD.created_by OR NEW.created_by IS NULL)
       AND (NEW.substituida_em IS NOT DISTINCT FROM OLD.substituida_em
            OR (OLD.substituida_em IS NULL AND NEW.substituida_em IS NOT NULL))
       AND (NEW.substituida_por IS NOT DISTINCT FROM OLD.substituida_por
            OR NEW.substituida_por IS NULL
            OR (OLD.substituida_em IS NULL AND NEW.substituida_em IS NOT NULL AND OLD.substituida_por IS NULL)) THEN
      RETURN NEW;
    END IF;
  END IF;
  RAISE EXCEPTION
    'periodo_folha_regra_imutavel: as regras do periodo da folha sao historico; para mudar grava-se uma regra nova (%).', TG_OP
    USING ERRCODE = '22000';
END;
$$;

REVOKE ALL ON FUNCTION public.hr_regras_periodo_folha_append_only() FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER trg_hr_regras_periodo_folha_append_only
  BEFORE UPDATE OR DELETE ON public.hr_regras_periodo_folha
  FOR EACH ROW EXECUTE FUNCTION public.hr_regras_periodo_folha_append_only();
CREATE TRIGGER trg_hr_regras_periodo_folha_sem_truncate
  BEFORE TRUNCATE ON public.hr_regras_periodo_folha
  FOR EACH STATEMENT EXECUTE FUNCTION public.hr_regras_periodo_folha_append_only();

REVOKE ALL ON TABLE public.hr_regras_periodo_folha FROM PUBLIC, anon, authenticated, service_role;
ALTER TABLE public.hr_regras_periodo_folha ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_regras_periodo_folha FORCE ROW LEVEL SECURITY;
-- Sem CREATE POLICY de proposito: so as RPCs.


-- ==============================================================================
-- 2. hr_periodos_processamento: as datas do periodo
-- ==============================================================================
ALTER TABLE public.hr_periodos_processamento
  ADD COLUMN data_inicio date NOT NULL,
  ADD COLUMN data_fim    date NOT NULL,
  ADD COLUMN transicao   boolean NOT NULL DEFAULT false,
  ADD CONSTRAINT hr_periodos_processamento_datas_ordem
    CHECK (data_inicio <= data_fim),
  ADD CONSTRAINT hr_periodos_processamento_mes_do_fecho
    CHECK (EXTRACT(year FROM data_fim)::integer = ano AND EXTRACT(month FROM data_fim)::integer = mes),
  -- Normal: 28 a 31 dias. Transicao (primeiro periodo depois de mudar o dia
  -- de inicio): 1 a 62 dias -- ver cabecalho.
  ADD CONSTRAINT hr_periodos_processamento_duracao_coerente
    CHECK ((NOT transicao AND (data_fim - data_inicio + 1) BETWEEN 28 AND 31)
           OR (transicao AND (data_fim - data_inicio + 1) BETWEEN 1 AND 62));

CREATE INDEX idx_hr_periodos_processamento_org_fim
  ON public.hr_periodos_processamento (organization_id, data_fim);

COMMENT ON COLUMN public.hr_periodos_processamento.data_inicio IS
'Primeiro dia do periodo da folha (inclusive). Dia seguinte ao fim do periodo anterior. Imutavel (trg_hr_periodos_processamento_datas).';
COMMENT ON COLUMN public.hr_periodos_processamento.data_fim IS
'Ultimo dia do periodo da folha (inclusive); (ano, mes) e o mes desta data, que da o nome a folha. Ate esta data (e enquanto o periodo nao for fechado) justificam-se os dias do periodo. Imutavel.';
COMMENT ON COLUMN public.hr_periodos_processamento.transicao IS
'true no primeiro periodo depois de mudar o dia de inicio: pode ter de 1 a 62 dias (os normais tem 28 a 31). Imutavel.';

-- Datas imutaveis e sem sobreposicao (trigger em vez de EXCLUDE: btree_gist
-- nao esta instalada; ver cabecalho).
CREATE FUNCTION public.hr_periodos_processamento_validar_datas()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_outro record;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.data_inicio IS DISTINCT FROM OLD.data_inicio
       OR NEW.data_fim IS DISTINCT FROM OLD.data_fim
       OR NEW.transicao IS DISTINCT FROM OLD.transicao THEN
      RAISE EXCEPTION
        'periodo_folha_datas_imutaveis: as datas de um periodo da folha (% a %) nao mudam depois de criado.',
        OLD.data_inicio, OLD.data_fim
        USING ERRCODE = '22000';
    END IF;
    IF NEW.organization_id IS NOT DISTINCT FROM OLD.organization_id THEN
      RETURN NEW;
    END IF;
  END IF;

  -- Serializa por organizacao; a consulta seguinte tem snapshot novo (READ COMMITTED).
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('hr_periodos_processamento:' || NEW.organization_id::text, 0));

  SELECT pp.ano, pp.mes, pp.data_inicio, pp.data_fim INTO v_outro
    FROM public.hr_periodos_processamento pp
   WHERE pp.organization_id = NEW.organization_id
     AND pp.id <> NEW.id
     AND pp.data_fim >= NEW.data_inicio
     AND pp.data_inicio <= NEW.data_fim
   LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION
      'periodo_folha_sobreposto: o periodo % a % cruza o periodo da folha de %/% (% a %) desta organizacao.',
      NEW.data_inicio, NEW.data_fim, v_outro.mes, v_outro.ano, v_outro.data_inicio, v_outro.data_fim
      USING ERRCODE = '23P01';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.hr_periodos_processamento_validar_datas() FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION public.hr_periodos_processamento_validar_datas() IS
'Trigger de hr_periodos_processamento: data_inicio, data_fim e transicao nunca mudam por UPDATE (aberto ou fechado); um periodo novo (ou que mude de organizacao) nao pode cruzar outro da mesma organizacao. Serializa por organizacao com pg_advisory_xact_lock. Substitui uma EXCLUDE USING gist porque btree_gist nao esta instalada.';

CREATE TRIGGER trg_hr_periodos_processamento_datas
  BEFORE INSERT OR UPDATE ON public.hr_periodos_processamento
  FOR EACH ROW EXECUTE FUNCTION public.hr_periodos_processamento_validar_datas();


-- ==============================================================================
-- 3. Calculo do periodo e do prazo (internas: sem EXECUTE para ninguem)
-- ==============================================================================

-- O dia de inicio em vigor para a folha do mes (_ano, _mes).
CREATE FUNCTION public.hr_periodo_folha_dia_inicio(_organization_id uuid, _ano integer, _mes integer)
RETURNS smallint
LANGUAGE sql STABLE
SET search_path = ''
AS $$
  SELECT coalesce(
    (SELECT r.dia_inicio
       FROM public.hr_regras_periodo_folha r
      WHERE r.organization_id = _organization_id
        AND r.substituida_em IS NULL
        AND r.valido_de <= make_date(_ano, _mes, 1)
      ORDER BY r.valido_de DESC
      LIMIT 1),
    1::smallint)
$$;

-- O ultimo dia da folha do mes (_ano, _mes): dia de inicio - 1 desse mes;
-- com dia de inicio 1, o ultimo dia do mes.
CREATE FUNCTION public.hr_periodo_folha_fim(_organization_id uuid, _ano integer, _mes integer)
RETURNS date
LANGUAGE sql STABLE
SET search_path = ''
AS $$
  SELECT CASE WHEN x.d = 1
              THEN (make_date(_ano, _mes, 1) + interval '1 month')::date - 1
              ELSE make_date(_ano, _mes, x.d - 1)
         END
    FROM (SELECT public.hr_periodo_folha_dia_inicio(_organization_id, _ano, _mes)::integer AS d) AS x
$$;

-- O periodo que CONTEM o dia: o gravado, se houver; senao o calculado pelas
-- regras (periodo_id e estado NULL). O inicio calculado e o dia a seguir ao
-- fim do periodo do mes anterior (gravado ou calculado), como na RPC de abrir.
CREATE FUNCTION public.hr_periodo_folha_do_dia(
  _organization_id uuid,
  _data date,
  OUT periodo_id uuid,
  OUT ano smallint,
  OUT mes smallint,
  OUT data_inicio date,
  OUT data_fim date,
  OUT estado text,
  OUT fechado_em timestamptz
)
RETURNS record
LANGUAGE plpgsql STABLE
SET search_path = ''
AS $$
#variable_conflict use_column
DECLARE
  v_ano     integer;
  v_mes     integer;
  v_fim     date;
  v_ant_ano integer;
  v_ant_mes integer;
  v_fim_ant date;
BEGIN
  IF _organization_id IS NULL OR _data IS NULL THEN
    RETURN;
  END IF;

  SELECT pp.id, pp.ano, pp.mes, pp.data_inicio, pp.data_fim, pp.estado, pp.fechado_em
    INTO periodo_id, ano, mes, data_inicio, data_fim, estado, fechado_em
    FROM public.hr_periodos_processamento pp
   WHERE pp.organization_id = _organization_id
     AND pp.data_fim >= _data
     AND pp.data_inicio <= _data
   ORDER BY pp.data_fim
   LIMIT 1;
  IF FOUND THEN
    RETURN;
  END IF;

  v_ano := EXTRACT(year FROM _data)::integer;
  v_mes := EXTRACT(month FROM _data)::integer;
  v_fim := public.hr_periodo_folha_fim(_organization_id, v_ano, v_mes);
  IF _data > v_fim THEN
    IF v_mes = 12 THEN
      v_ano := v_ano + 1;
      v_mes := 1;
    ELSE
      v_mes := v_mes + 1;
    END IF;
    v_fim := public.hr_periodo_folha_fim(_organization_id, v_ano, v_mes);
  END IF;

  v_ant_ano := CASE WHEN v_mes = 1 THEN v_ano - 1 ELSE v_ano END;
  v_ant_mes := CASE WHEN v_mes = 1 THEN 12 ELSE v_mes - 1 END;
  SELECT pp.data_fim INTO v_fim_ant
    FROM public.hr_periodos_processamento pp
   WHERE pp.organization_id = _organization_id
     AND pp.ano = v_ant_ano
     AND pp.mes = v_ant_mes;
  IF v_fim_ant IS NULL THEN
    v_fim_ant := public.hr_periodo_folha_fim(_organization_id, v_ant_ano, v_ant_mes);
  END IF;

  periodo_id  := NULL;
  ano         := v_ano::smallint;
  mes         := v_mes::smallint;
  data_inicio := v_fim_ant + 1;
  data_fim    := v_fim;
  estado      := NULL;
  fechado_em  := NULL;
END;
$$;

-- O ultimo dia em que ainda se pode ENTREGAR uma justificacao de _data.
-- Aberto (ou por abrir): data_fim, inclusive. Fechado: o mais cedo entre
-- data_fim e a vespera do dia do fecho (no dia do fecho, depois de fechar,
-- ja nao se pode; o ecra nunca diz "ate hoje" quando ja nao da).
CREATE FUNCTION public.hr_justificacao_prazo_do_dia(_organization_id uuid, _data date)
RETURNS date
LANGUAGE plpgsql STABLE
SET search_path = ''
AS $$
DECLARE
  v_fim  date;
  v_est  text;
  v_fech timestamptz;
BEGIN
  SELECT d.data_fim, d.estado, d.fechado_em INTO v_fim, v_est, v_fech
    FROM public.hr_periodo_folha_do_dia(_organization_id, _data) AS d;
  IF v_est = 'fechado' THEN
    RETURN least(v_fim, (coalesce(v_fech, now()) AT TIME ZONE 'Europe/Lisbon')::date - 1);
  END IF;
  RETURN v_fim;
END;
$$;

-- Uma entrega no instante _em, para o dia _data, foi a tempo? Ate ao fim do
-- dia data_fim (Lisboa) e, se o periodo foi fechado, antes do instante do fecho.
CREATE FUNCTION public.hr_justificacao_entregue_a_tempo(_organization_id uuid, _data date, _em timestamptz)
RETURNS boolean
LANGUAGE plpgsql STABLE
SET search_path = ''
AS $$
DECLARE
  v_fim  date;
  v_est  text;
  v_fech timestamptz;
BEGIN
  IF _em IS NULL THEN
    RETURN false;
  END IF;
  SELECT d.data_fim, d.estado, d.fechado_em INTO v_fim, v_est, v_fech
    FROM public.hr_periodo_folha_do_dia(_organization_id, _data) AS d;
  IF v_fim IS NULL THEN
    RETURN false;
  END IF;
  IF (_em AT TIME ZONE 'Europe/Lisbon')::date > v_fim THEN
    RETURN false;
  END IF;
  IF v_est = 'fechado' AND (v_fech IS NULL OR _em >= v_fech) THEN
    RETURN false;
  END IF;
  RETURN true;
END;
$$;

-- A guarda do prazo, com a mensagem: recusa quando o periodo que contem o dia
-- esta fechado, ou quando hoje (Lisboa) ja passou do fim do periodo. Para
-- todos, RH incluido.
CREATE FUNCTION public.hr_justificacao_exigir_prazo(_organization_id uuid, _data date)
RETURNS void
LANGUAGE plpgsql STABLE
SET search_path = ''
AS $$
DECLARE
  k_meses constant text[] := ARRAY['janeiro','fevereiro','marco','abril','maio','junho',
                                   'julho','agosto','setembro','outubro','novembro','dezembro'];
  v_hoje  date := (now() AT TIME ZONE 'Europe/Lisbon')::date;
  v_ano   smallint;
  v_mes   smallint;
  v_ini   date;
  v_fim   date;
  v_est   text;
BEGIN
  SELECT d.ano, d.mes, d.data_inicio, d.data_fim, d.estado
    INTO v_ano, v_mes, v_ini, v_fim, v_est
    FROM public.hr_periodo_folha_do_dia(_organization_id, _data) AS d;

  IF v_fim IS NULL THEN
    RAISE EXCEPTION
      'justificacao_periodo_indeterminado: nao foi possivel determinar o periodo da folha do dia %.', _data
      USING ERRCODE = '22023';
  END IF;

  IF v_est = 'fechado' THEN
    RAISE EXCEPTION
      'justificacao_periodo_fechado: o periodo da folha de % de % (% a %) ja esta fechado; o dia % ja nao se justifica e fica injustificado.',
      k_meses[v_mes], v_ano, v_ini, v_fim, _data
      USING ERRCODE = '23514';
  END IF;

  IF v_hoje > v_fim THEN
    RAISE EXCEPTION
      'justificacao_prazo_terminado: o dia % so se podia justificar ate ao fecho do periodo de % de % (%); fica injustificado.',
      _data, k_meses[v_mes], v_ano, v_fim
      USING ERRCODE = '23514';
  END IF;
END;
$$;

-- A dispensa de prazo da aceitacao de uma justificacao do dia: so com a marca
-- de transaccao hr_justificacao.via_dia (posta por rpc_hr_justificacao_dia_decidir)
-- E uma justificacao do dia com esse id, pendente, da mesma pessoa, dia e
-- hora de inicio, criada a tempo.
CREATE FUNCTION public.hr_justificacao_dia_dispensa_prazo(
  _organization_id uuid,
  _pessoa_id uuid,
  _data date,
  _hora_inicio time
)
RETURNS boolean
LANGUAGE plpgsql STABLE
SET search_path = ''
AS $$
DECLARE
  v_marca  text := current_setting('hr_justificacao.via_dia', true);
  v_criada timestamptz;
BEGIN
  IF v_marca IS NULL
     OR v_marca !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
    RETURN false;
  END IF;
  SELECT j.created_at INTO v_criada
    FROM public.pessoas_justificacoes_dia j
   WHERE j.id = v_marca::uuid
     AND j.organization_id = _organization_id
     AND j.pessoa_id = _pessoa_id
     AND j.data = _data
     AND j.periodo_inicio = _hora_inicio
     AND j.estado = 'pendente';
  IF v_criada IS NULL THEN
    RETURN false;
  END IF;
  RETURN public.hr_justificacao_entregue_a_tempo(_organization_id, _data, v_criada);
END;
$$;

REVOKE ALL ON FUNCTION public.hr_periodo_folha_dia_inicio(uuid, integer, integer) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.hr_periodo_folha_fim(uuid, integer, integer) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.hr_periodo_folha_do_dia(uuid, date) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.hr_justificacao_prazo_do_dia(uuid, date) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.hr_justificacao_entregue_a_tempo(uuid, date, timestamptz) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.hr_justificacao_exigir_prazo(uuid, date) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.hr_justificacao_dia_dispensa_prazo(uuid, uuid, date, time) FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION public.hr_periodo_folha_dia_inicio(uuid, integer, integer) IS
'Interna. Dia de inicio (1 a 28) em vigor para a folha do mes (_ano, _mes): a regra nao substituida de maior valido_de <= dia 1 desse mes; sem regra, 1.';
COMMENT ON FUNCTION public.hr_periodo_folha_fim(uuid, integer, integer) IS
'Interna. Ultimo dia da folha do mes (_ano, _mes): (dia de inicio - 1) desse mes, ou o ultimo dia do mes com dia de inicio 1.';
COMMENT ON FUNCTION public.hr_periodo_folha_do_dia(uuid, date) IS
'Interna. O periodo da folha que contem _data: o gravado em hr_periodos_processamento, ou o calculado pelas regras (periodo_id e estado NULL). (ano, mes) e o mes do fecho.';
COMMENT ON FUNCTION public.hr_justificacao_prazo_do_dia(uuid, date) IS
'Interna. Ultimo dia em que se pode entregar uma justificacao de _data: data_fim do periodo que o contem; se fechado, o mais cedo entre data_fim e a vespera do dia do fecho.';
COMMENT ON FUNCTION public.hr_justificacao_entregue_a_tempo(uuid, date, timestamptz) IS
'Interna. Uma entrega no instante _em, para _data, foi a tempo: o dia (Lisboa) de _em <= data_fim do periodo e, se fechado, _em antes de fechado_em.';
COMMENT ON FUNCTION public.hr_justificacao_exigir_prazo(uuid, date) IS
'Interna. Guarda do prazo: recusa (justificacao_periodo_fechado) se o periodo que contem o dia esta fechado, e (justificacao_prazo_terminado) se hoje, em Lisboa, ja passou do fim desse periodo. Para todos, RH incluido.';
COMMENT ON FUNCTION public.hr_justificacao_dia_dispensa_prazo(uuid, uuid, date, time) IS
'Interna. true so com a marca de transaccao hr_justificacao.via_dia = <id> (posta por rpc_hr_justificacao_dia_decidir) e uma justificacao do dia com esse id, pendente, da mesma organizacao, pessoa, dia e hora de inicio, criada a tempo. A marca sozinha nao dispensa nada.';


-- ==============================================================================
-- 4. As RPCs novas
-- ==============================================================================

-- ---- O prazo, para o ecra ---------------------------------------------------
CREATE FUNCTION public.hr_justificacao_dia_prazo(_organization_id uuid, _data date)
RETURNS date
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_auth uuid := auth.uid();
BEGIN
  IF v_auth IS NULL THEN
    RAISE EXCEPTION 'justificacao_dia_sem_sessao: nao ha utilizador autenticado.' USING ERRCODE = '42501';
  END IF;
  IF _organization_id IS NULL OR _data IS NULL THEN
    RAISE EXCEPTION 'justificacao_dia_dados_em_falta: organizacao e dia sao obrigatorios.' USING ERRCODE = '23502';
  END IF;

  IF NOT (public.has_anew_permission_in_org(v_auth, 'hr.assiduidade.picar', _organization_id)
          OR public.has_anew_permission_in_org(v_auth, 'hr.assiduidade.view.own', _organization_id)
          OR public.has_anew_permission_in_org(v_auth, 'hr.assiduidade.justificacao.edit', _organization_id)
          OR public.has_anew_permission_in_org(v_auth, 'hr.assiduidade.justificacao.view', _organization_id)
          OR public.has_anew_permission_in_org(v_auth, 'hr.processamento.periodo.view', _organization_id)) THEN
    RAISE EXCEPTION 'justificacao_dia_sem_permissao: sem permissao de assiduidade nesta organizacao.' USING ERRCODE = '42501';
  END IF;

  RETURN public.hr_justificacao_prazo_do_dia(_organization_id, _data);
END;
$$;

REVOKE ALL ON FUNCTION public.hr_justificacao_dia_prazo(uuid, date) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.hr_justificacao_dia_prazo(uuid, date) TO authenticated;

COMMENT ON FUNCTION public.hr_justificacao_dia_prazo(uuid, date) IS
'Ultimo dia em que ainda se pode justificar _data nesta organizacao (inclusive): o fim do periodo da folha que contem o dia (gravado, ou calculado pela regra; sem regra, o fim do mes); se o periodo ja foi fechado, o mais cedo entre esse fim e a vespera do dia do fecho. Depois disso a falta fica injustificada para sempre (estado derivado). Exige uma permissao de assiduidade ou hr.processamento.periodo.view na organizacao. Substitui hr_justificacao_dia_prazo(date), 5 dias uteis, largada nesta migration.';

-- ---- Ler as regras ------------------------------------------------------------
CREATE FUNCTION public.rpc_hr_periodo_folha_regras_listar(_organization_id uuid)
RETURNS TABLE (
  id              uuid,
  dia_inicio      smallint,
  valido_de       date,
  em_vigor        boolean,
  criada_em       timestamptz,
  criada_por_nome text,
  substituida_em  timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
#variable_conflict use_column
DECLARE
  v_auth  uuid := auth.uid();
  v_hoje  date := (now() AT TIME ZONE 'Europe/Lisbon')::date;
  v_a     smallint;
  v_m     smallint;
  v_vigor uuid;
BEGIN
  IF v_auth IS NULL THEN
    RAISE EXCEPTION 'periodo_folha_sem_sessao: nao ha utilizador autenticado.' USING ERRCODE = '42501';
  END IF;
  IF _organization_id IS NULL THEN
    RAISE EXCEPTION 'periodo_folha_dados_em_falta: a organizacao e obrigatoria.' USING ERRCODE = '23502';
  END IF;
  IF NOT public.has_anew_permission_in_org(v_auth, 'hr.processamento.periodo.view', _organization_id) THEN
    RAISE EXCEPTION 'periodo_folha_sem_permissao: ver o periodo da folha exige hr.processamento.periodo.view nesta organizacao.'
      USING ERRCODE = '42501';
  END IF;

  -- Em vigor: a regra que governa a folha do periodo em que hoje cai.
  SELECT d.ano, d.mes INTO v_a, v_m
    FROM public.hr_periodo_folha_do_dia(_organization_id, v_hoje) AS d;
  SELECT r.id INTO v_vigor
    FROM public.hr_regras_periodo_folha r
   WHERE r.organization_id = _organization_id
     AND r.substituida_em IS NULL
     AND r.valido_de <= make_date(v_a, v_m, 1)
   ORDER BY r.valido_de DESC
   LIMIT 1;

  RETURN QUERY
  SELECT r.id,
         r.dia_inicio,
         r.valido_de,
         (r.id = v_vigor) IS TRUE,
         r.created_at,
         u.name,
         r.substituida_em
    FROM public.hr_regras_periodo_folha r
    LEFT JOIN public.anew_users u ON u.id = r.created_by
   WHERE r.organization_id = _organization_id
   ORDER BY r.valido_de DESC, r.created_at DESC, r.id DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_hr_periodo_folha_regras_listar(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_hr_periodo_folha_regras_listar(uuid) TO authenticated;

COMMENT ON FUNCTION public.rpc_hr_periodo_folha_regras_listar(uuid) IS
'Historico das regras do periodo da folha da organizacao (mais recente primeiro, com as substituidas), com em_vigor na que governa a folha do periodo de hoje. Lista vazia: dia de inicio 1 (mes de calendario). Exige hr.processamento.periodo.view.';

-- ---- Guardar uma regra -------------------------------------------------------
CREATE FUNCTION public.rpc_hr_periodo_folha_regra_guardar(
  _organization_id uuid,
  _dia_inicio integer,
  _valido_de date
)
RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_auth     uuid := auth.uid();
  v_hoje     date := (now() AT TIME ZONE 'Europe/Lisbon')::date;
  v_anew     uuid;
  v_cur_ano  smallint;
  v_cur_mes  smallint;
  v_min      date;
  v_fim_novo date;
  v_ult_ano  smallint;
  v_ult_mes  smallint;
  v_id       uuid;
BEGIN
  IF v_auth IS NULL THEN
    RAISE EXCEPTION 'periodo_folha_sem_sessao: nao ha utilizador autenticado.' USING ERRCODE = '42501';
  END IF;
  IF _organization_id IS NULL OR _dia_inicio IS NULL OR _valido_de IS NULL THEN
    RAISE EXCEPTION 'periodo_folha_dados_em_falta: organizacao, dia de inicio e mes a partir do qual vale sao obrigatorios.'
      USING ERRCODE = '23502';
  END IF;
  IF NOT public.has_anew_permission_in_org(v_auth, 'hr.processamento.periodo.gerir', _organization_id) THEN
    RAISE EXCEPTION 'periodo_folha_sem_permissao: mudar o periodo da folha exige hr.processamento.periodo.gerir nesta organizacao.'
      USING ERRCODE = '42501';
  END IF;

  -- Lock da organizacao logo a seguir a permissao, antes de ler: a mesma chave
  -- de abrir e do trigger de periodos.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('hr_periodos_processamento:' || _organization_id::text, 0));

  IF _dia_inicio < 1 OR _dia_inicio > 28 THEN
    RAISE EXCEPTION 'periodo_folha_dia_invalido: o dia de inicio vai de 1 a 28 (recebido %).', _dia_inicio
      USING ERRCODE = '23514';
  END IF;
  IF EXTRACT(day FROM _valido_de) <> 1 OR _valido_de < DATE '2000-01-01' OR _valido_de > DATE '2100-12-01' THEN
    RAISE EXCEPTION
      'periodo_folha_valido_de_invalido: a regra vale a partir do dia 1 do mes da folha, entre 2000 e 2100 (recebido %).', _valido_de
      USING ERRCODE = '23514';
  END IF;

  -- Nunca para tras do periodo em curso (o que contem hoje; sem periodo
  -- gravado, o calculado). Na propria folha em curso so se o novo fim nao
  -- ficar no passado -- senao dias ja decorridos perdiam o prazo de repente.
  SELECT d.ano, d.mes INTO v_cur_ano, v_cur_mes
    FROM public.hr_periodo_folha_do_dia(_organization_id, v_hoje) AS d;
  v_min := make_date(v_cur_ano, v_cur_mes, 1);
  IF _valido_de < v_min THEN
    RAISE EXCEPTION
      'periodo_folha_regra_retroactiva: a regra so pode valer a partir da folha em curso (%/%), nunca para meses ja passados.',
      v_cur_mes, v_cur_ano
      USING ERRCODE = '23514';
  END IF;
  IF _valido_de = v_min THEN
    v_fim_novo := CASE WHEN _dia_inicio = 1
                       THEN (v_min + interval '1 month')::date - 1
                       ELSE make_date(v_cur_ano, v_cur_mes, _dia_inicio - 1)
                  END;
    IF v_fim_novo < v_hoje THEN
      RAISE EXCEPTION
        'periodo_folha_regra_retroactiva: com dia de inicio %, a folha de %/% ja teria fechado a %; escolher a folha seguinte.',
        _dia_inicio, v_cur_mes, v_cur_ano, v_fim_novo
        USING ERRCODE = '23514';
    END IF;
  END IF;

  -- Nem para tras de um periodo ja aberto ou fechado: as datas dele nao mudam.
  SELECT pp.ano, pp.mes INTO v_ult_ano, v_ult_mes
    FROM public.hr_periodos_processamento pp
   WHERE pp.organization_id = _organization_id
   ORDER BY pp.ano DESC, pp.mes DESC
   LIMIT 1;
  IF v_ult_ano IS NOT NULL AND make_date(v_ult_ano, v_ult_mes, 1) >= _valido_de THEN
    RAISE EXCEPTION
      'periodo_folha_regra_retroactiva: ja existe a folha de %/% nesta organizacao; a regra nova so pode valer a partir da folha do mes seguinte.',
      v_ult_mes, v_ult_ano
      USING ERRCODE = '23514';
  END IF;

  SELECT au.id INTO v_anew FROM public.anew_users au WHERE au.auth_user_id = v_auth LIMIT 1;
  IF v_anew IS NULL THEN
    RAISE EXCEPTION 'periodo_folha_sem_utilizador: a sessao nao corresponde a nenhum utilizador.' USING ERRCODE = '42501';
  END IF;

  -- Uma regra em vigor por organizacao e mes: a anterior do mesmo mes (ainda
  -- sem periodo, confirmado acima) fica substituida, no historico.
  UPDATE public.hr_regras_periodo_folha r
     SET substituida_em = now(),
         substituida_por = v_anew
   WHERE r.organization_id = _organization_id
     AND r.valido_de = _valido_de
     AND r.substituida_em IS NULL;

  INSERT INTO public.hr_regras_periodo_folha (organization_id, dia_inicio, valido_de, created_by)
  VALUES (_organization_id, _dia_inicio::smallint, _valido_de, v_anew)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_hr_periodo_folha_regra_guardar(uuid, integer, date) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_hr_periodo_folha_regra_guardar(uuid, integer, date) TO authenticated;

COMMENT ON FUNCTION public.rpc_hr_periodo_folha_regra_guardar(uuid, integer, date) IS
'Grava o dia de inicio (1 a 28) do periodo da folha a partir da folha do mes _valido_de (dia 1). Uma regra por organizacao e mes: a anterior do mesmo mes fica substituida (historico). Recusa (periodo_folha_regra_retroactiva) meses anteriores a folha em curso, a folha em curso se o novo fim ja tiver passado, e meses que ja tenham periodo. O primeiro periodo depois da mudanca e de transicao (1 a 62 dias), sem buracos. Exige hr.processamento.periodo.gerir.';


-- ==============================================================================
-- 5. Abrir: mesma assinatura, agora com as datas e a transicao
--    (search_path mantido como estava: public, pg_temp; tudo qualificado)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.rpc_hr_processamento_periodo_abrir(
  p_organization_id uuid,
  p_ano smallint,
  p_mes smallint
)
RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_auth      uuid := auth.uid();
  v_autor_id  uuid;
  v_novo_id   uuid;
  v_fim       date;
  v_inicio    date;
  v_ant_ano   integer;
  v_ant_mes   integer;
  v_fim_ant   date;
  v_transicao boolean;
BEGIN
  IF v_auth IS NULL THEN
    RAISE EXCEPTION 'rpc_hr_processamento_periodo_abrir exige um utilizador autenticado.';
  END IF;

  IF p_organization_id IS NULL OR p_ano IS NULL OR p_mes IS NULL THEN
    RAISE EXCEPTION 'p_organization_id, p_ano e p_mes sao obrigatorios.';
  END IF;

  IF p_mes < 1 OR p_mes > 12 THEN
    RAISE EXCEPTION 'p_mes tem de estar entre 1 e 12.';
  END IF;

  IF p_ano < 2000 OR p_ano > 2100 THEN
    RAISE EXCEPTION 'p_ano tem de estar entre 2000 e 2100.';
  END IF;

  IF NOT public.has_anew_permission_in_org(v_auth, 'hr.processamento.periodo.gerir', p_organization_id) THEN
    RAISE EXCEPTION 'Sem permissao hr.processamento.periodo.gerir nesta organizacao.';
  END IF;

  -- Lock da organizacao ANTES de ler periodos e regras: nenhuma regra nova nem
  -- outro periodo entra a meio deste calculo.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('hr_periodos_processamento:' || p_organization_id::text, 0));

  IF EXISTS (
    SELECT 1 FROM public.hr_periodos_processamento pp
     WHERE pp.organization_id = p_organization_id AND pp.ano = p_ano AND pp.mes = p_mes
  ) THEN
    RAISE EXCEPTION 'Ja existe um periodo de processamento para %/% nesta organizacao.', p_mes, p_ano;
  END IF;

  SELECT au.id INTO v_autor_id FROM public.anew_users au WHERE au.auth_user_id = v_auth LIMIT 1;

  IF v_autor_id IS NULL THEN
    RAISE EXCEPTION 'Utilizador autenticado sem ficha em anew_users.';
  END IF;

  -- As datas: (p_ano, p_mes) e o mes do FECHO.
  v_fim := public.hr_periodo_folha_fim(p_organization_id, p_ano, p_mes);
  v_ant_ano := CASE WHEN p_mes = 1 THEN p_ano - 1 ELSE p_ano END;
  v_ant_mes := CASE WHEN p_mes = 1 THEN 12 ELSE p_mes - 1 END;
  SELECT pp.data_fim INTO v_fim_ant
    FROM public.hr_periodos_processamento pp
   WHERE pp.organization_id = p_organization_id AND pp.ano = v_ant_ano AND pp.mes = v_ant_mes;
  IF v_fim_ant IS NULL THEN
    v_fim_ant := public.hr_periodo_folha_fim(p_organization_id, v_ant_ano, v_ant_mes);
  END IF;
  v_inicio := v_fim_ant + 1;
  v_transicao := public.hr_periodo_folha_dia_inicio(p_organization_id, p_ano, p_mes)
                 <> public.hr_periodo_folha_dia_inicio(p_organization_id, v_ant_ano, v_ant_mes);

  IF v_inicio > v_fim THEN
    RAISE EXCEPTION
      'periodo_folha_intervalo_invalido: a folha de %/% ficaria de % a %. Rever as regras do periodo da folha.',
      p_mes, p_ano, v_inicio, v_fim
      USING ERRCODE = '23514';
  END IF;

  -- Sobreposicao: trigger (periodo_folha_sobreposto). Duracao: CHECK.
  INSERT INTO public.hr_periodos_processamento (organization_id, ano, mes, estado, created_by, data_inicio, data_fim, transicao)
  VALUES (p_organization_id, p_ano, p_mes, 'aberto', v_autor_id, v_inicio, v_fim, v_transicao)
  RETURNING id INTO v_novo_id;

  RETURN v_novo_id;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_hr_processamento_periodo_abrir(uuid, smallint, smallint) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_hr_processamento_periodo_abrir(uuid, smallint, smallint) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_hr_processamento_periodo_abrir(uuid, smallint, smallint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_processamento_periodo_abrir(uuid, smallint, smallint) TO service_role;

COMMENT ON FUNCTION public.rpc_hr_processamento_periodo_abrir(uuid, smallint, smallint) IS
'Abre a folha do mes (p_ano, p_mes) -- o mes do FECHO. data_fim = dia de inicio - 1 desse mes (ou o fim do mes, com dia 1); data_inicio = dia a seguir ao fim da folha do mes anterior (gravada, ou calculada pela regra desse mes); transicao = o dia de inicio mudou deste mes para o anterior. Exige hr.processamento.periodo.gerir; toma o lock da organizacao antes de ler. Recusa um segundo periodo para o mesmo (organizacao, ano, mes), qualquer sobreposicao (trigger) e duracoes fora de 28-31 dias (1-62 em transicao).';


-- ==============================================================================
-- 6. Registar uma justificacao do dia: prazo = fecho do periodo, para todos
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
  -- Sobre a propria ficha, quem e do RH e so a pessoa (precisa de picar).
  -- O bloqueio de decidir a propria esta em _decidir.
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

  -- O prazo e o fecho do periodo da folha que contem o dia, e vale para TODOS,
  -- RH incluido: depois disso a falta fica injustificada para sempre.
  PERFORM public.hr_justificacao_exigir_prazo(_organization_id, _data);

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
'Regista uma justificacao do dia. A propria pessoa com hr.assiduidade.picar; o RH (hr.assiduidade.justificacao.edit) em nome de OUTRA pessoa (sobre a propria ficha, o RH e so a pessoa). Prazo para TODOS, RH incluido: ate ao fim do periodo da folha que contem o dia, e nunca com o periodo fechado (justificacao_prazo_terminado / justificacao_periodo_fechado). Recusa dia futuro, periodo ja coberto por falta activa (justifica-se pela falta) e segunda justificacao activa para o mesmo dia e hora (justificacao_dia_ja_enviada).';


-- ==============================================================================
-- 7. Registar o papel de uma falta ja marcada: o mesmo prazo
-- ==============================================================================
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

  -- Leitura minima, sem lock; "nao existe" e "sem permissao" dao a MESMA
  -- mensagem, para nao se enumerarem faltas de outras organizacoes.
  SELECT f.* INTO v_f FROM public.pessoas_faltas f WHERE f.id = _falta_id;
  IF v_f.id IS NULL
     OR NOT public.has_anew_permission_in_org(v_auth, 'hr.assiduidade.justificacao.edit', v_f.organization_id) THEN
    RAISE EXCEPTION
      'falta_sem_permissao: a falta nao existe ou registar uma justificacao exige hr.assiduidade.justificacao.edit na organizacao dela.'
      USING ERRCODE = '42501';
  END IF;

  IF coalesce(btrim(_documento_ref), '') = '' AND coalesce(btrim(_texto), '') = '' THEN
    RAISE EXCEPTION
      'falta_justificacao_vazia: uma justificacao precisa de referencia a documento ou de texto. Nesta ronda nao se anexa ficheiro -- o bucket esta fechado ao cliente ate existir a Edge Function de upload.'
      USING ERRCODE = '23514';
  END IF;

  -- O prazo e da SUBMISSAO. Unica excepcao: a aceitacao de uma justificacao
  -- do dia entregue a tempo (rpc_hr_justificacao_dia_decidir), com a referencia
  -- dela e a marca de transaccao conferida contra os dados.
  IF NOT (
    _documento_ref IS NOT DISTINCT FROM ('justificacao-dia:' || current_setting('hr_justificacao.via_dia', true))
    AND public.hr_justificacao_dia_dispensa_prazo(v_f.organization_id, v_f.pessoa_id, v_f.data, v_f.hora_inicio)
  ) THEN
    PERFORM public.hr_justificacao_exigir_prazo(v_f.organization_id, v_f.data);
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
'Regista um documento ou uma declaracao para uma falta. NAO decide se a falta fica justificada: passa-a a pendente_documento se estava sem justificacao, e a decisao e de um humano com rpc_hr_falta_decidir_justificacao. Prazo da submissao: ate ao fim do periodo da folha que contem o dia da falta, e nunca com o periodo fechado, RH incluido (justificacao_prazo_terminado / justificacao_periodo_fechado). Excepcao unica: a aceitacao, por rpc_hr_justificacao_dia_decidir, de uma justificacao do dia pendente entregue a tempo (hr_justificacao_dia_dispensa_prazo). Falta inexistente e falta sem permissao dao a mesma mensagem (falta_sem_permissao).';


-- ==============================================================================
-- 8. Decidir a justificacao de uma falta: "justificada" so com papel a tempo
-- ==============================================================================
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

  IF _resultado IS NULL OR _resultado NOT IN ('justificada','recusada') THEN
    RAISE EXCEPTION
      'falta_resultado_invalido: a decisao e justificada ou recusada (recebido "%").', _resultado
      USING ERRCODE = '23514';
  END IF;

  IF _resultado = 'recusada' AND (_motivo IS NULL OR btrim(_motivo) = '') THEN
    RAISE EXCEPTION
      'falta_recusa_sem_motivo: recusar uma justificacao exige motivo escrito. Uma recusa sem razao e o que gera a disputa laboral.'
      USING ERRCODE = '23514';
  END IF;

  -- "nao existe" e "sem permissao" dao a MESMA mensagem.
  SELECT f.* INTO v_f FROM public.pessoas_faltas f WHERE f.id = _falta_id;
  IF v_f.id IS NULL
     OR NOT public.has_anew_permission_in_org(v_auth, 'hr.assiduidade.justificacao.edit', v_f.organization_id) THEN
    RAISE EXCEPTION
      'falta_sem_permissao: a falta nao existe ou decidir a justificacao exige hr.assiduidade.justificacao.edit na organizacao dela.'
      USING ERRCODE = '42501';
  END IF;

  IF v_f.estado <> 'activa' THEN
    RAISE EXCEPTION
      'falta_nao_activa: a falta % esta em "%" e nao ha justificacao a decidir.', _falta_id, v_f.estado
      USING ERRCODE = '23514';
  END IF;

  -- "Injustificada para sempre": passado o prazo (ou com o periodo fechado), so
  -- fica justificada uma falta com papel entregue a tempo (ou a aceitacao de
  -- uma justificacao do dia entregue a tempo). Recusar e sempre possivel.
  IF _resultado = 'justificada'
     AND NOT public.hr_justificacao_entregue_a_tempo(v_f.organization_id, v_f.data, now())
     AND NOT EXISTS (
       SELECT 1 FROM public.pessoas_faltas_justificacoes fj
        WHERE fj.falta_id = v_f.id
          AND fj.anulado_em IS NULL
          AND public.hr_justificacao_entregue_a_tempo(v_f.organization_id, v_f.data, fj.created_at)
     )
     AND NOT public.hr_justificacao_dia_dispensa_prazo(v_f.organization_id, v_f.pessoa_id, v_f.data, v_f.hora_inicio) THEN
    PERFORM public.hr_justificacao_exigir_prazo(v_f.organization_id, v_f.data);
    -- exigir_prazo recusa sempre neste ramo; isto so corre se o periodo mudar
    -- entre as duas leituras (nao muda: mesma transaccao, mesmo snapshot de dados).
    RAISE EXCEPTION
      'justificacao_periodo_fechado: o dia % ja nao se justifica e a falta nao tem justificacao entregue a tempo.', v_f.data
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
'Decide se a falta fica justificada ou recusada, com autor e data. Recusar exige motivo escrito e e sempre possivel. Justificar dentro do prazo: sempre. Justificar depois do prazo ou com o periodo da folha fechado: so se a falta tiver uma justificacao (pessoas_faltas_justificacoes, nao anulada) entregue a tempo, ou na aceitacao de uma justificacao do dia entregue a tempo; senao justificacao_prazo_terminado / justificacao_periodo_fechado. Falta inexistente e falta sem permissao dao a mesma mensagem (falta_sem_permissao).';


-- ==============================================================================
-- 9. Decidir uma justificacao do dia: periodo que contem o dia, permissao antes
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.rpc_hr_justificacao_dia_decidir(
  _justificacao_id uuid,
  _decisao text,
  _motivo text DEFAULT NULL,
  _confirmar_mes_fechado boolean DEFAULT false
)
RETURNS TABLE (falta_id uuid, mes_fechado boolean)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
#variable_conflict use_column
DECLARE
  -- O que fica escrito na justificacao da FALTA quando o motivo e de saude: a
  -- tabela da falta le-se sem rasto, por isso o texto da pessoa nao vai para la.
  k_texto_neutro constant text :=
    'Consulta medica declarada pela pessoa na justificacao do dia. O texto le-se na justificacao do dia, com registo de acesso.';
  k_sem_acesso constant text :=
    'justificacao_dia_sem_permissao: a justificacao nao existe ou decidi-la exige hr.assiduidade.justificacao.edit na organizacao dela.';
  v_auth        uuid := auth.uid();
  v_anew        uuid;
  v_eu          uuid;
  v_org         uuid;
  v_pessoa      uuid;
  v_j           public.pessoas_justificacoes_dia;
  v_f           public.pessoas_faltas;
  v_conflito    record;
  v_mes_fechado boolean;
  v_per_ano     smallint;
  v_per_mes     smallint;
  v_remunerada  boolean;
  v_motivo_cod  text;
  v_falta       uuid;
BEGIN
  IF v_auth IS NULL THEN
    RAISE EXCEPTION 'justificacao_dia_sem_sessao: nao ha utilizador autenticado.' USING ERRCODE = '42501';
  END IF;

  IF _decisao IS NULL OR _decisao NOT IN ('aceitar_paga','aceitar_nao_paga','recusar') THEN
    RAISE EXCEPTION
      'justificacao_dia_decisao_invalida: a decisao e aceitar_paga, aceitar_nao_paga ou recusar (recebido "%").', _decisao
      USING ERRCODE = '23514';
  END IF;

  -- Leitura minima, SEM lock, so para saber a organizacao e a pessoa.
  SELECT j.organization_id, j.pessoa_id INTO v_org, v_pessoa
    FROM public.pessoas_justificacoes_dia j
   WHERE j.id = _justificacao_id;

  -- Ninguem decide a sua propria justificacao, mesmo tendo a permissao: aceitar
  -- tornava a falta justificada (e paga) por decisao do proprio. Em aceitar E em
  -- recusar. Antes da verificacao de permissao de proposito (o padrao de
  -- rpc_hr_ausencia_cancelar): a mensagem diz "e a sua", que e o verdadeiro --
  -- e a propria pessoa ja ve as suas justificacoes, nada se revela.
  IF v_org IS NOT NULL THEN
    v_eu := public.hr_pessoa_do_utilizador(v_auth, v_org);
    IF v_eu IS NOT NULL AND v_eu = v_pessoa THEN
      RAISE EXCEPTION
        'justificacao_dia_propria_decisao: nao pode decidir uma justificacao sua, mesmo tendo hr.assiduidade.justificacao.edit. Outra pessoa do RH decide-a.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- "nao existe" e "sem permissao" dao a MESMA mensagem; permissao ANTES do lock.
  IF v_org IS NULL OR NOT public.has_anew_permission_in_org(v_auth, 'hr.assiduidade.justificacao.edit', v_org) THEN
    RAISE EXCEPTION '%', k_sem_acesso USING ERRCODE = '42501';
  END IF;
  IF _decisao <> 'recusar'
     AND NOT public.has_anew_permission_in_org(v_auth, 'hr.assiduidade.faltas.edit', v_org) THEN
    RAISE EXCEPTION
      'justificacao_dia_sem_permissao: aceitar cria uma falta e exige tambem hr.assiduidade.faltas.edit.'
      USING ERRCODE = '42501';
  END IF;

  -- FOR UPDATE: duas pessoas do RH a carregar ao mesmo tempo nao criam duas faltas.
  SELECT j.* INTO v_j
    FROM public.pessoas_justificacoes_dia j
   WHERE j.id = _justificacao_id
     FOR UPDATE;
  IF NOT FOUND OR v_j.organization_id IS DISTINCT FROM v_org THEN
    RAISE EXCEPTION '%', k_sem_acesso USING ERRCODE = '42501';
  END IF;

  IF v_j.estado <> 'pendente' THEN
    RAISE EXCEPTION 'justificacao_dia_ja_decidida: a justificacao % ja esta "%".', v_j.id, v_j.estado USING ERRCODE = '23514';
  END IF;

  SELECT au.id INTO v_anew FROM public.anew_users au WHERE au.auth_user_id = v_auth LIMIT 1;
  IF v_anew IS NULL THEN
    RAISE EXCEPTION 'justificacao_dia_sem_utilizador: a sessao nao corresponde a nenhum utilizador.' USING ERRCODE = '42501';
  END IF;

  -- O periodo da folha que CONTEM o dia (nao o mes de calendario).
  SELECT (d.estado = 'fechado'), d.ano, d.mes
    INTO v_mes_fechado, v_per_ano, v_per_mes
    FROM public.hr_periodo_folha_do_dia(v_j.organization_id, v_j.data) AS d;
  v_mes_fechado := coalesce(v_mes_fechado, false);

  -- ---- Recusar: nao mexe em faltas -----------------------------------------
  IF _decisao = 'recusar' THEN
    IF char_length(btrim(coalesce(_motivo, ''))) < 3 THEN
      RAISE EXCEPTION
        'justificacao_dia_recusa_sem_motivo: recusar exige motivo escrito (pelo menos 3 caracteres). Uma recusa sem razao e o que gera a disputa.'
        USING ERRCODE = '23514';
    END IF;

    UPDATE public.pessoas_justificacoes_dia j
       SET estado = 'recusada',
           decidida_por = v_anew,
           decidida_em = now(),
           motivo_recusa = btrim(_motivo),
           mes_fechado_na_decisao = v_mes_fechado,
           updated_by = v_anew
     WHERE j.id = v_j.id;

    RETURN QUERY SELECT NULL::uuid, v_mes_fechado;
    RETURN;
  END IF;

  -- ---- Aceitar -------------------------------------------------------------
  -- Periodo fechado: so com confirmacao explicita, e ANTES de escrever o que quer que seja.
  IF v_mes_fechado AND NOT coalesce(_confirmar_mes_fechado, false) THEN
    RAISE EXCEPTION
      'justificacao_dia_mes_fechado: o processamento de %/% ja esta fechado e os recibos congelados. Confirmar para aceitar na mesma.',
      v_per_mes, v_per_ano
      USING ERRCODE = '55000';
  END IF;

  v_remunerada := (_decisao = 'aceitar_paga');

  -- A falta activa do mesmo dia e hora de inicio (um recarregar, ou o RH que a
  -- marcou a mao entretanto). As 'corrigida' estao fora de circulacao.
  SELECT f.* INTO v_f
    FROM public.pessoas_faltas f
   WHERE f.pessoa_id = v_j.pessoa_id
     AND f.organization_id = v_j.organization_id
     AND f.data = v_j.data
     AND f.estado = 'activa'
     AND f.hora_inicio = v_j.periodo_inicio
   LIMIT 1
     FOR UPDATE;

  IF FOUND THEN
    IF v_f.hora_fim IS DISTINCT FROM v_j.periodo_fim OR v_f.remunerada IS DISTINCT FROM v_remunerada THEN
      RAISE EXCEPTION
        'justificacao_dia_falta_divergente: ja ha uma falta de % a % (remunerada: %) e a decisao pede % a % (remunerada: %). Corrigir a falta ou decidir em conformidade.',
        v_f.hora_inicio, v_f.hora_fim, v_f.remunerada, v_j.periodo_inicio, v_j.periodo_fim, v_remunerada
        USING ERRCODE = '23514';
    END IF;
    -- rpc_hr_falta_decidir_justificacao nao o verifica: sem isto, aceitar
    -- reescrevia em silencio uma recusa (ou aceitacao) anterior da falta.
    IF v_f.justificacao_estado NOT IN ('sem_justificacao','pendente_documento') THEN
      RAISE EXCEPTION
        'justificacao_dia_falta_ja_decidida: a falta deste periodo ja tem a justificacao "%"; decidir pela falta.',
        v_f.justificacao_estado
        USING ERRCODE = '23514';
    END IF;
    v_falta := v_f.id;
  ELSE
    -- Uma falta activa que cruza o periodo sem comecar a mesma hora: o trigger
    -- de sobreposicao recusaria a nova; diz-se aqui, com as horas.
    SELECT f.id, f.hora_inicio, f.hora_fim INTO v_conflito
      FROM public.pessoas_faltas f
     WHERE f.pessoa_id = v_j.pessoa_id
       AND f.organization_id = v_j.organization_id
       AND f.data = v_j.data
       AND f.estado = 'activa'
       AND v_j.periodo_inicio < f.hora_fim
       AND f.hora_inicio < v_j.periodo_fim
     LIMIT 1;
    IF FOUND THEN
      RAISE EXCEPTION
        'justificacao_dia_falta_sobreposta: ja ha uma falta de % a % que cruza o periodo % a %. Corrigir ou anular essa falta primeiro.',
        v_conflito.hora_inicio, v_conflito.hora_fim, v_j.periodo_inicio, v_j.periodo_fim
        USING ERRCODE = '23514';
    END IF;

    -- O mapa de MOTIVO_DA_FALTA do ecra (lib/faltaDaAceitacao.ts).
    v_motivo_cod := CASE
      WHEN v_j.de_atraso THEN 'atraso'
      WHEN v_j.tipo = 'consulta_medica' THEN 'doenca'
      WHEN v_j.tipo = 'assunto_pessoal' THEN 'assuntos_pessoais'
      ELSE 'outro'
    END;

    -- A RPC existente, tal como esta: volta a verificar hr.assiduidade.faltas.edit
    -- com o auth.uid() de quem decide, e corre os triggers de coerencia.
    v_falta := public.rpc_hr_falta_marcar(
      v_j.organization_id, v_j.pessoa_id, v_j.data,
      v_j.periodo_inicio, v_j.periodo_fim, v_motivo_cod,
      NULL::uuid, v_remunerada, false
    );
  END IF;

  -- A marca de transaccao: esta justificacao do dia foi entregue (o prazo e
  -- conferido contra os dados em hr_justificacao_dia_dispensa_prazo, enquanto
  -- ela ainda esta pendente). Liga-se so para as duas chamadas e desliga-se logo.
  PERFORM set_config('hr_justificacao.via_dia', v_j.id::text, true);

  -- O papel da falta: so se ainda nao tiver uma justificacao em vigor.
  IF NOT EXISTS (
    SELECT 1 FROM public.pessoas_faltas_justificacoes fj
     WHERE fj.falta_id = v_falta AND fj.anulado_em IS NULL
  ) THEN
    PERFORM public.rpc_hr_falta_registar_justificacao(
      v_falta,
      'declaracao_propria',
      'justificacao-dia:' || v_j.id::text,
      CASE WHEN v_j.tipo = 'consulta_medica' THEN k_texto_neutro ELSE v_j.motivo END,
      NULL::text,
      (v_j.created_at AT TIME ZONE 'Europe/Lisbon')::date,
      NULL::smallint
    );
  END IF;

  PERFORM public.rpc_hr_falta_decidir_justificacao(v_falta, 'justificada', NULL::text);

  PERFORM set_config('hr_justificacao.via_dia', '', true);

  UPDATE public.pessoas_justificacoes_dia j
     SET estado = CASE WHEN v_remunerada THEN 'aceite_paga' ELSE 'aceite_nao_paga' END,
         decidida_por = v_anew,
         decidida_em = now(),
         falta_id = v_falta,
         mes_fechado_na_decisao = v_mes_fechado,
         updated_by = v_anew
   WHERE j.id = v_j.id;

  RETURN QUERY SELECT v_falta, v_mes_fechado;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_hr_justificacao_dia_decidir(uuid, text, text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_hr_justificacao_dia_decidir(uuid, text, text, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_hr_justificacao_dia_decidir(uuid, text, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_justificacao_dia_decidir(uuid, text, text, boolean) TO service_role;

COMMENT ON FUNCTION public.rpc_hr_justificacao_dia_decidir(uuid, text, text, boolean) IS
'Decide uma justificacao do dia pendente, numa so transaccao. Ninguem decide a sua propria (justificacao_dia_propria_decisao, 42501). Inexistente e sem permissao dao a mesma mensagem (justificacao_dia_sem_permissao), verificada antes do lock. Recusar exige motivo e nao mexe em faltas. Aceitar (paga / nao paga) exige tambem hr.assiduidade.faltas.edit e: reaproveita a falta activa do mesmo dia e hora de inicio (se coincidir em fim e remunerada, e se a justificacao dela ainda nao estiver decidida) ou marca-a com rpc_hr_falta_marcar; regista a declaracao (texto neutro se for consulta medica) e decide-a como justificada, sem prazo se a justificacao do dia foi entregue a tempo (marca hr_justificacao.via_dia). Se o periodo da folha que CONTEM o dia estiver fechado, aceitar exige _confirmar_mes_fechado = true (senao justificacao_dia_mes_fechado, 55000, com o mes/ano do fecho, sem escrever nada). Devolve falta_id e mes_fechado.';


-- ==============================================================================
-- 10. Largar hr_justificacao_dia_prazo(date): ninguem a usa agora
-- ==============================================================================
DO $largar$
DECLARE
  v_old   oid := to_regprocedure('public.hr_justificacao_dia_prazo(date)')::oid;
  v_lista text;
  v_n     integer;
BEGIN
  SELECT string_agg(p.oid::regprocedure::text, ', ') INTO v_lista
    FROM pg_proc p
   WHERE p.prosrc LIKE '%hr_justificacao_dia_prazo%'
     AND p.oid <> v_old;
  IF v_lista IS NOT NULL THEN
    RAISE EXCEPTION 'Largar: ainda ha funcoes que chamam hr_justificacao_dia_prazo: %.', v_lista;
  END IF;
  SELECT count(*) INTO v_n FROM pg_depend d
   WHERE d.refclassid = 'pg_catalog.pg_proc'::regclass AND d.refobjid = v_old;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'Largar: ha % objectos dependentes de hr_justificacao_dia_prazo(date).', v_n;
  END IF;
END;
$largar$;

DROP FUNCTION public.hr_justificacao_dia_prazo(date);


-- ==============================================================================
-- Conferir: falha a migration inteira se algo nao bater
-- ==============================================================================
DO $conferir$
DECLARE
  k_nike      constant uuid := 'b6ffce4f-f630-4933-833a-008649757a33'::uuid;
  v_novas     text[] := ARRAY[
    'public.hr_justificacao_dia_prazo(uuid, date)',
    'public.rpc_hr_periodo_folha_regras_listar(uuid)',
    'public.rpc_hr_periodo_folha_regra_guardar(uuid, integer, date)'];
  v_internas  text[] := ARRAY[
    'public.hr_periodo_folha_dia_inicio(uuid, integer, integer)',
    'public.hr_periodo_folha_fim(uuid, integer, integer)',
    'public.hr_periodo_folha_do_dia(uuid, date)',
    'public.hr_justificacao_prazo_do_dia(uuid, date)',
    'public.hr_justificacao_entregue_a_tempo(uuid, date, timestamp with time zone)',
    'public.hr_justificacao_exigir_prazo(uuid, date)',
    'public.hr_justificacao_dia_dispensa_prazo(uuid, uuid, date, time without time zone)',
    'public.hr_periodos_processamento_validar_datas()',
    'public.hr_regras_periodo_folha_append_only()'];
  v_trocadas  text[] := ARRAY[
    'public.rpc_hr_processamento_periodo_abrir(uuid, smallint, smallint)',
    'public.rpc_hr_justificacao_dia_registar(uuid, uuid, date, text, boolean, time, time, text, time, text[])',
    'public.rpc_hr_falta_registar_justificacao(uuid, text, text, text, text, date, smallint)',
    'public.rpc_hr_justificacao_dia_decidir(uuid, text, text, boolean)',
    'public.rpc_hr_falta_decidir_justificacao(uuid, text, text)'];
  v_fn        text;
  v_oid       oid;
  v_grant     text;
  v_n         integer;
  v_ok        boolean;
  v_id        uuid;
  v_falsa     uuid := gen_random_uuid();
  v_hoje      date := (now() AT TIME ZONE 'Europe/Lisbon')::date;
  v_ini       date;
  v_fim       date;
  v_ano       smallint;
  v_mes       smallint;
  v_pid       uuid;
  v_cons      text;
BEGIN
  -- 1. EXECUTE por aclexplode (sem o dono). NULL em proacl = o omisso (PUBLIC).
  FOREACH v_fn IN ARRAY v_novas || v_internas || v_trocadas LOOP
    v_oid := to_regprocedure(v_fn)::oid;
    IF v_oid IS NULL THEN
      RAISE EXCEPTION 'Conferir: a funcao % nao existe.', v_fn;
    END IF;
    SELECT coalesce(string_agg(DISTINCT CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE a.grantee::regrole::text END, ','
                               ORDER BY CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE a.grantee::regrole::text END), '')
      INTO v_grant
      FROM pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
     WHERE p.oid = v_oid AND a.privilege_type = 'EXECUTE' AND a.grantee <> p.proowner;
    IF v_fn = ANY (v_novas) AND v_grant <> 'authenticated' THEN
      RAISE EXCEPTION 'Conferir: % devia ter EXECUTE so para authenticated; tem "%".', v_fn, v_grant;
    ELSIF v_fn = ANY (v_internas) AND v_grant <> '' THEN
      RAISE EXCEPTION 'Conferir: a interna % tem EXECUTE para "%".', v_fn, v_grant;
    ELSIF v_fn = ANY (v_trocadas) AND v_grant <> 'authenticated,service_role' THEN
      RAISE EXCEPTION 'Conferir: % devia manter EXECUTE para authenticated e service_role; tem "%".', v_fn, v_grant;
    END IF;
  END LOOP;

  -- 2. prosecdef e search_path.
  FOREACH v_fn IN ARRAY v_novas || v_trocadas LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid = to_regprocedure(v_fn)::oid AND p.prosecdef) THEN
      RAISE EXCEPTION 'Conferir: % devia ser SECURITY DEFINER.', v_fn;
    END IF;
  END LOOP;
  FOREACH v_fn IN ARRAY v_internas LOOP
    IF EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid = to_regprocedure(v_fn)::oid AND p.prosecdef) THEN
      RAISE EXCEPTION 'Conferir: a interna % nao devia ser SECURITY DEFINER.', v_fn;
    END IF;
  END LOOP;
  FOREACH v_fn IN ARRAY v_novas || v_internas LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_proc p
                    WHERE p.oid = to_regprocedure(v_fn)::oid
                      AND coalesce(p.proconfig, ARRAY[]::text[]) @> ARRAY['search_path=""']) THEN
      RAISE EXCEPTION 'Conferir: % nao tem search_path vazio.', v_fn;
    END IF;
  END LOOP;
  FOREACH v_fn IN ARRAY v_trocadas LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_proc p
                    WHERE p.oid = to_regprocedure(v_fn)::oid
                      AND coalesce(array_to_string(p.proconfig, ','), '') LIKE '%search_path=public, pg_temp%') THEN
      RAISE EXCEPTION 'Conferir: % perdeu o search_path (public, pg_temp).', v_fn;
    END IF;
  END LOOP;

  -- 3. Um so hr_justificacao_dia_prazo, (uuid, date), STABLE.
  SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname::text = 'public' AND p.proname::text = 'hr_justificacao_dia_prazo';
  IF v_n <> 1 OR to_regprocedure('public.hr_justificacao_dia_prazo(uuid, date)') IS NULL THEN
    RAISE EXCEPTION 'Conferir: esperava-se uma so hr_justificacao_dia_prazo(uuid, date); ha %.', v_n;
  END IF;
  IF (SELECT p.provolatile::text FROM pg_proc p WHERE p.oid = to_regprocedure('public.hr_justificacao_dia_prazo(uuid, date)')::oid) <> 's' THEN
    RAISE EXCEPTION 'Conferir: hr_justificacao_dia_prazo(uuid, date) devia ser STABLE.';
  END IF;

  -- 4. Os corpos trocados levam as guardas novas e largaram as antigas.
  IF NOT EXISTS (SELECT 1 FROM pg_proc p
                  WHERE p.oid = to_regprocedure(v_trocadas[1])::oid
                    AND p.prosrc LIKE '%hr_periodo_folha_fim%'
                    AND p.prosrc LIKE '%pg_advisory_xact_lock%') THEN
    RAISE EXCEPTION 'Conferir: rpc_hr_processamento_periodo_abrir nao calcula as datas ou nao toma o lock.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p
                  WHERE p.oid = to_regprocedure(v_trocadas[2])::oid
                    AND p.prosrc LIKE '%hr_justificacao_exigir_prazo%'
                    AND p.prosrc NOT LIKE '%NOT v_rh AND v_hoje%') THEN
    RAISE EXCEPTION 'Conferir: rpc_hr_justificacao_dia_registar nao aplica o prazo novo a todos.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p
                  WHERE p.oid = to_regprocedure(v_trocadas[3])::oid
                    AND p.prosrc LIKE '%hr_justificacao_exigir_prazo%'
                    AND p.prosrc LIKE '%hr_justificacao_dia_dispensa_prazo%'
                    AND p.prosrc NOT LIKE '%falta_inexistente%') THEN
    RAISE EXCEPTION 'Conferir: rpc_hr_falta_registar_justificacao nao aplica o prazo ou ainda distingue inexistente.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p
                  WHERE p.oid = to_regprocedure(v_trocadas[4])::oid
                    AND p.prosrc LIKE '%hr_periodo_folha_do_dia%'
                    AND p.prosrc LIKE '%hr_justificacao.via_dia%'
                    AND p.prosrc LIKE '%justificacao_dia_propria_decisao%'
                    AND p.prosrc NOT LIKE '%justificacao_dia_inexistente%'
                    AND p.prosrc NOT LIKE '%extract(year FROM v_j.data)%') THEN
    RAISE EXCEPTION 'Conferir: rpc_hr_justificacao_dia_decidir ainda usa o mes de calendario ou perdeu uma guarda.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p
                  WHERE p.oid = to_regprocedure(v_trocadas[5])::oid
                    AND p.prosrc LIKE '%hr_justificacao_entregue_a_tempo%'
                    AND p.prosrc LIKE '%hr_justificacao_dia_dispensa_prazo%'
                    AND p.prosrc NOT LIKE '%falta_inexistente%') THEN
    RAISE EXCEPTION 'Conferir: rpc_hr_falta_decidir_justificacao nao exige papel a tempo para justificar fora do prazo.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p
                  WHERE p.oid = to_regprocedure(v_novas[3])::oid
                    AND p.prosrc LIKE '%pg_advisory_xact_lock%') THEN
    RAISE EXCEPTION 'Conferir: rpc_hr_periodo_folha_regra_guardar nao toma o lock da organizacao.';
  END IF;

  -- 5. A tabela de regras: RLS ligada e forcada, sem politicas, sem privilegios.
  IF NOT EXISTS (SELECT 1 FROM pg_class c
                  WHERE c.oid = to_regclass('public.hr_regras_periodo_folha')
                    AND c.relrowsecurity AND c.relforcerowsecurity) THEN
    RAISE EXCEPTION 'Conferir: hr_regras_periodo_folha sem RLS ligada e forcada.';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policy pol WHERE pol.polrelid = to_regclass('public.hr_regras_periodo_folha')) THEN
    RAISE EXCEPTION 'Conferir: hr_regras_periodo_folha tem politicas; o desenho e sem nenhuma.';
  END IF;
  SELECT coalesce(string_agg(DISTINCT CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE a.grantee::regrole::text END
                             || ':' || a.privilege_type::text, ','), '')
    INTO v_grant
    FROM pg_class c, aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
   WHERE c.oid = to_regclass('public.hr_regras_periodo_folha') AND a.grantee <> c.relowner;
  IF v_grant <> '' THEN
    RAISE EXCEPTION 'Conferir: hr_regras_periodo_folha tem privilegios para "%".', v_grant;
  END IF;
  SELECT count(*) INTO v_n FROM pg_attribute a
   WHERE a.attrelid = to_regclass('public.hr_regras_periodo_folha') AND a.attnum > 0 AND NOT a.attisdropped
     AND a.attacl IS NOT NULL;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'Conferir: hr_regras_periodo_folha tem % colunas com privilegios proprios.', v_n;
  END IF;
  SELECT count(*) INTO v_n FROM pg_constraint c
   WHERE c.conrelid = to_regclass('public.hr_regras_periodo_folha')
     AND c.conname::text IN ('hr_regras_periodo_folha_pkey', 'hr_regras_periodo_folha_org_fkey',
                             'hr_regras_periodo_folha_created_by_fkey', 'hr_regras_periodo_folha_substituida_por_fkey',
                             'hr_regras_periodo_folha_dia_valido', 'hr_regras_periodo_folha_valido_de_dia_1',
                             'hr_regras_periodo_folha_valido_de_razoavel', 'hr_regras_periodo_folha_substituicao_coerente');
  IF v_n <> 8 THEN
    RAISE EXCEPTION 'Conferir: esperavam-se 8 restricoes em hr_regras_periodo_folha; ha %.', v_n;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_index i JOIN pg_class ci ON ci.oid = i.indexrelid
                  WHERE i.indrelid = to_regclass('public.hr_regras_periodo_folha')
                    AND ci.relname::text = 'uq_hr_regras_periodo_folha_org_mes'
                    AND i.indisunique AND i.indpred IS NOT NULL) THEN
    RAISE EXCEPTION 'Conferir: falta o indice unico parcial de uma regra por organizacao e mes.';
  END IF;
  SELECT count(*) INTO v_n FROM pg_trigger t
   WHERE t.tgrelid = to_regclass('public.hr_regras_periodo_folha') AND NOT t.tgisinternal
     AND t.tgenabled::text <> 'D'
     AND t.tgname::text IN ('trg_hr_regras_periodo_folha_append_only', 'trg_hr_regras_periodo_folha_sem_truncate');
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'Conferir: hr_regras_periodo_folha devia ter 2 triggers de append-only ligados; tem %.', v_n;
  END IF;

  -- 6. hr_periodos_processamento: colunas, restricoes, triggers, privilegios.
  SELECT count(*) INTO v_n FROM pg_attribute a
   WHERE a.attrelid = to_regclass('public.hr_periodos_processamento')
     AND NOT a.attisdropped AND a.attnotnull
     AND ((a.attname::text IN ('data_inicio', 'data_fim') AND format_type(a.atttypid, a.atttypmod)::text = 'date')
          OR (a.attname::text = 'transicao' AND format_type(a.atttypid, a.atttypmod)::text = 'boolean'));
  IF v_n <> 3 THEN
    RAISE EXCEPTION 'Conferir: data_inicio, data_fim (date) e transicao (boolean) deviam ser NOT NULL (% de 3).', v_n;
  END IF;
  SELECT count(*) INTO v_n FROM pg_constraint c
   WHERE c.conrelid = to_regclass('public.hr_periodos_processamento') AND c.contype::text = 'c'
     AND c.conname::text IN ('hr_periodos_processamento_datas_ordem', 'hr_periodos_processamento_mes_do_fecho',
                             'hr_periodos_processamento_duracao_coerente');
  IF v_n <> 3 THEN
    RAISE EXCEPTION 'Conferir: faltam CHECK das datas em hr_periodos_processamento (% de 3).', v_n;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint c
                  WHERE c.conrelid = to_regclass('public.hr_periodos_processamento')
                    AND c.conname::text = 'hr_periodos_processamento_org_ano_mes_key' AND c.contype::text = 'u')
     OR NOT EXISTS (SELECT 1 FROM pg_constraint c
                     WHERE c.conrelid = to_regclass('public.hr_processamento_lancamentos')
                       AND c.conname::text = 'hr_processamento_lancamentos_periodo_fkey' AND c.contype::text = 'f') THEN
    RAISE EXCEPTION 'Conferir: perdeu-se o UNIQUE (organization_id, ano, mes) ou a FK dos lancamentos.';
  END IF;
  SELECT count(*) INTO v_n FROM pg_trigger t
   WHERE t.tgrelid = to_regclass('public.hr_periodos_processamento') AND NOT t.tgisinternal
     AND t.tgenabled::text <> 'D'
     AND t.tgname::text IN ('trg_hr_periodos_processamento_imutavel', 'trg_hr_periodos_processamento_datas');
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'Conferir: hr_periodos_processamento devia ter os 2 triggers ligados; tem %.', v_n;
  END IF;
  IF has_table_privilege('authenticated', 'public.hr_periodos_processamento', 'INSERT')
     OR has_table_privilege('authenticated', 'public.hr_periodos_processamento', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.hr_periodos_processamento', 'DELETE')
     OR has_table_privilege('authenticated', 'public.hr_periodos_processamento', 'TRUNCATE')
     OR has_table_privilege('anon', 'public.hr_periodos_processamento', 'SELECT')
     OR NOT has_table_privilege('authenticated', 'public.hr_periodos_processamento', 'SELECT') THEN
    RAISE EXCEPTION 'Conferir: os privilegios de hr_periodos_processamento mudaram.';
  END IF;

  -- 7. Comportamento sem regra (organizacao inexistente: nada se escreve).
  IF public.hr_periodo_folha_fim(v_falsa, 2026, 2) IS DISTINCT FROM DATE '2026-02-28'
     OR public.hr_periodo_folha_fim(v_falsa, 2028, 2) IS DISTINCT FROM DATE '2028-02-29'
     OR public.hr_periodo_folha_fim(v_falsa, 2026, 12) IS DISTINCT FROM DATE '2026-12-31' THEN
    RAISE EXCEPTION 'Conferir: sem regra, o fim da folha nao e o ultimo dia do mes.';
  END IF;
  SELECT d.periodo_id, d.ano, d.mes, d.data_inicio, d.data_fim INTO v_pid, v_ano, v_mes, v_ini, v_fim
    FROM public.hr_periodo_folha_do_dia(v_falsa, DATE '2026-10-25') AS d;
  IF v_pid IS NOT NULL OR v_ano <> 2026 OR v_mes <> 10
     OR v_ini IS DISTINCT FROM DATE '2026-10-01' OR v_fim IS DISTINCT FROM DATE '2026-10-31' THEN
    RAISE EXCEPTION 'Conferir: sem regra, 25/10/2026 devia cair na folha de outubro (1 a 31); deu %/% de % a %.', v_mes, v_ano, v_ini, v_fim;
  END IF;
  IF public.hr_justificacao_prazo_do_dia(v_falsa, DATE '2026-10-25') IS DISTINCT FROM DATE '2026-10-31' THEN
    RAISE EXCEPTION 'Conferir: sem regra, o prazo de 25/10/2026 devia ser 31/10/2026.';
  END IF;
  BEGIN
    PERFORM public.hr_justificacao_exigir_prazo(v_falsa, DATE '2020-01-15');
    v_ok := false;
  EXCEPTION WHEN OTHERS THEN
    v_ok := position('justificacao_prazo_terminado' IN SQLERRM) = 1;
  END;
  IF NOT v_ok THEN
    RAISE EXCEPTION 'Conferir: um dia de 2020 sem periodo nao foi recusado com justificacao_prazo_terminado.';
  END IF;
  IF public.hr_justificacao_entregue_a_tempo(v_falsa, DATE '2020-01-15', now())
     OR NOT public.hr_justificacao_entregue_a_tempo(v_falsa, DATE '2020-01-15', TIMESTAMPTZ '2020-01-31 12:00:00+00')
     OR public.hr_justificacao_entregue_a_tempo(v_falsa, DATE '2020-01-15', TIMESTAMPTZ '2020-02-01 12:00:00+00') THEN
    RAISE EXCEPTION 'Conferir: hr_justificacao_entregue_a_tempo nao respeita o fim do periodo (31/01/2020 inclusive).';
  END IF;
  -- Sem a marca, a dispensa nunca da.
  IF public.hr_justificacao_dia_dispensa_prazo(v_falsa, v_falsa, DATE '2020-01-15', TIME '09:00') THEN
    RAISE EXCEPTION 'Conferir: hr_justificacao_dia_dispensa_prazo dispensou sem marca nem justificacao.';
  END IF;

  -- 8. Comportamento com regra e periodos, na nike, em 2098-2100, DESFEITO no
  --    fim (sentinela HRP00). Escreve como dono da tabela; nada fica.
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.anew_organizations o WHERE o.id = k_nike) THEN
      RAISE EXCEPTION 'Conferir: a organizacao nike nao existe nesta base.';
    END IF;

    INSERT INTO public.hr_regras_periodo_folha (organization_id, dia_inicio, valido_de)
    VALUES (k_nike, 22, DATE '2099-01-01'),
           (k_nike, 5,  DATE '2100-01-01');

    -- 8.a dia 22: a folha de novembro vai de 22/10 a 21/11.
    IF public.hr_periodo_folha_fim(k_nike, 2099, 11) IS DISTINCT FROM DATE '2099-11-21' THEN
      RAISE EXCEPTION 'Conferir: com dia 22, a folha de novembro de 2099 devia fechar a 21/11.';
    END IF;
    SELECT d.ano, d.mes, d.data_inicio, d.data_fim INTO v_ano, v_mes, v_ini, v_fim
      FROM public.hr_periodo_folha_do_dia(k_nike, DATE '2099-10-25') AS d;
    IF v_ano <> 2099 OR v_mes <> 11 OR v_ini IS DISTINCT FROM DATE '2099-10-22' OR v_fim IS DISTINCT FROM DATE '2099-11-21' THEN
      RAISE EXCEPTION 'Conferir: 25/10/2099 devia cair na folha de 11/2099 (22/10 a 21/11); deu %/% de % a %.', v_mes, v_ano, v_ini, v_fim;
    END IF;
    SELECT d.mes, d.data_inicio, d.data_fim INTO v_mes, v_ini, v_fim
      FROM public.hr_periodo_folha_do_dia(k_nike, DATE '2099-10-21') AS d;
    IF v_mes <> 10 OR v_ini IS DISTINCT FROM DATE '2099-09-22' OR v_fim IS DISTINCT FROM DATE '2099-10-21' THEN
      RAISE EXCEPTION 'Conferir: 21/10/2099 devia ser o ultimo dia da folha de outubro; deu mes % de % a %.', v_mes, v_ini, v_fim;
    END IF;

    -- 8.b transicao para dia 5 a partir da folha de 01/2100: um so periodo, sem buraco.
    SELECT d.ano, d.mes, d.data_inicio, d.data_fim INTO v_ano, v_mes, v_ini, v_fim
      FROM public.hr_periodo_folha_do_dia(k_nike, DATE '2099-12-25') AS d;
    IF v_ano <> 2100 OR v_mes <> 1 OR v_ini IS DISTINCT FROM DATE '2099-12-22' OR v_fim IS DISTINCT FROM DATE '2100-01-04' THEN
      RAISE EXCEPTION 'Conferir: a folha de transicao 01/2100 devia ir de 22/12/2099 a 04/01/2100; deu %/% de % a %.', v_mes, v_ano, v_ini, v_fim;
    END IF;
    SELECT d.mes, d.data_inicio, d.data_fim INTO v_mes, v_ini, v_fim
      FROM public.hr_periodo_folha_do_dia(k_nike, DATE '2100-01-10') AS d;
    IF v_mes <> 2 OR v_ini IS DISTINCT FROM DATE '2100-01-05' OR v_fim IS DISTINCT FROM DATE '2100-02-04' THEN
      RAISE EXCEPTION 'Conferir: depois da transicao, a folha 02/2100 devia ir de 05/01 a 04/02; deu mes % de % a %.', v_mes, v_ini, v_fim;
    END IF;

    -- 8.c periodos: o gravado e encontrado; sobreposicao, mes errado, duracao
    --     anormal fora de transicao e datas mudadas sao recusados.
    INSERT INTO public.hr_periodos_processamento (organization_id, ano, mes, estado, data_inicio, data_fim)
    VALUES (k_nike, 2099, 11, 'aberto', DATE '2099-10-22', DATE '2099-11-21')
    RETURNING id INTO v_id;
    SELECT d.periodo_id INTO v_pid FROM public.hr_periodo_folha_do_dia(k_nike, DATE '2099-11-05') AS d;
    IF v_pid IS DISTINCT FROM v_id THEN
      RAISE EXCEPTION 'Conferir: o periodo gravado nao foi encontrado para 05/11/2099.';
    END IF;

    v_ok := false;
    BEGIN
      INSERT INTO public.hr_periodos_processamento (organization_id, ano, mes, estado, data_inicio, data_fim)
      VALUES (k_nike, 2099, 12, 'aberto', DATE '2099-11-20', DATE '2099-12-21');
    EXCEPTION WHEN exclusion_violation THEN
      v_ok := position('periodo_folha_sobreposto' IN SQLERRM) = 1;
    END;
    IF NOT v_ok THEN
      RAISE EXCEPTION 'Conferir: um periodo sobreposto foi aceite (ou recusado com outro erro).';
    END IF;

    v_ok := false;
    BEGIN
      INSERT INTO public.hr_periodos_processamento (organization_id, ano, mes, estado, data_inicio, data_fim)
      VALUES (k_nike, 2099, 9, 'aberto', DATE '2099-07-22', DATE '2099-08-21');
    EXCEPTION WHEN check_violation THEN
      GET STACKED DIAGNOSTICS v_cons = CONSTRAINT_NAME;
      v_ok := v_cons = 'hr_periodos_processamento_mes_do_fecho';
    END;
    IF NOT v_ok THEN
      RAISE EXCEPTION 'Conferir: um periodo cujo (ano, mes) nao e o mes de data_fim foi aceite.';
    END IF;

    v_ok := false;
    BEGIN
      INSERT INTO public.hr_periodos_processamento (organization_id, ano, mes, estado, data_inicio, data_fim)
      VALUES (k_nike, 2098, 3, 'aberto', DATE '2098-02-28', DATE '2098-03-01');
    EXCEPTION WHEN check_violation THEN
      GET STACKED DIAGNOSTICS v_cons = CONSTRAINT_NAME;
      v_ok := v_cons = 'hr_periodos_processamento_duracao_coerente';
    END;
    IF NOT v_ok THEN
      RAISE EXCEPTION 'Conferir: um periodo de 2 dias fora de transicao foi aceite.';
    END IF;
    -- O mesmo periodo curto, marcado como transicao, e aceite.
    INSERT INTO public.hr_periodos_processamento (organization_id, ano, mes, estado, data_inicio, data_fim, transicao)
    VALUES (k_nike, 2098, 3, 'aberto', DATE '2098-02-28', DATE '2098-03-01', true);

    v_ok := false;
    BEGIN
      UPDATE public.hr_periodos_processamento SET data_fim = DATE '2099-11-20' WHERE id = v_id;
    EXCEPTION WHEN OTHERS THEN
      v_ok := position('periodo_folha_datas_imutaveis' IN SQLERRM) = 1;
    END;
    IF NOT v_ok THEN
      RAISE EXCEPTION 'Conferir: as datas de um periodo aberto mudaram por UPDATE.';
    END IF;

    -- 8.d prazo: aberto -> data_fim, entrega agora a tempo, guarda passa.
    IF public.hr_justificacao_prazo_do_dia(k_nike, DATE '2099-10-25') IS DISTINCT FROM DATE '2099-11-21'
       OR NOT public.hr_justificacao_entregue_a_tempo(k_nike, DATE '2099-10-25', now()) THEN
      RAISE EXCEPTION 'Conferir: com o periodo aberto, o prazo de 25/10/2099 devia ser 21/11/2099 e uma entrega agora a tempo.';
    END IF;
    PERFORM public.hr_justificacao_exigir_prazo(k_nike, DATE '2099-10-25');

    --     fechado (hoje): o prazo passa a ontem; o dia do fecho ja nao conta;
    --     uma entrega anterior ao fecho foi a tempo; a guarda recusa.
    UPDATE public.hr_periodos_processamento SET estado = 'fechado', fechado_em = now() WHERE id = v_id;
    IF public.hr_justificacao_prazo_do_dia(k_nike, DATE '2099-10-25') IS DISTINCT FROM v_hoje - 1 THEN
      RAISE EXCEPTION 'Conferir: fechado hoje, o prazo devia ser ontem (%), e e %.',
        v_hoje - 1, public.hr_justificacao_prazo_do_dia(k_nike, DATE '2099-10-25');
    END IF;
    IF public.hr_justificacao_entregue_a_tempo(k_nike, DATE '2099-10-25', now())
       OR NOT public.hr_justificacao_entregue_a_tempo(k_nike, DATE '2099-10-25', now() - interval '1 hour') THEN
      RAISE EXCEPTION 'Conferir: com o periodo fechado, so uma entrega anterior ao fecho conta como a tempo.';
    END IF;
    v_ok := false;
    BEGIN
      PERFORM public.hr_justificacao_exigir_prazo(k_nike, DATE '2099-10-25');
    EXCEPTION WHEN OTHERS THEN
      v_ok := position('justificacao_periodo_fechado' IN SQLERRM) = 1;
    END;
    IF NOT v_ok THEN
      RAISE EXCEPTION 'Conferir: um dia de um periodo fechado nao foi recusado com justificacao_periodo_fechado.';
    END IF;

    -- 8.e regras: uma por mes; substituir guarda historico; nada mais muda.
    v_ok := false;
    BEGIN
      INSERT INTO public.hr_regras_periodo_folha (organization_id, dia_inicio, valido_de)
      VALUES (k_nike, 10, DATE '2099-01-01');
    EXCEPTION WHEN unique_violation THEN
      v_ok := true;
    END;
    IF NOT v_ok THEN
      RAISE EXCEPTION 'Conferir: duas regras em vigor para a mesma organizacao e mes.';
    END IF;
    UPDATE public.hr_regras_periodo_folha SET substituida_em = now()
     WHERE organization_id = k_nike AND valido_de = DATE '2099-01-01' AND substituida_em IS NULL;
    INSERT INTO public.hr_regras_periodo_folha (organization_id, dia_inicio, valido_de)
    VALUES (k_nike, 10, DATE '2099-01-01');
    IF public.hr_periodo_folha_fim(k_nike, 2099, 6) IS DISTINCT FROM DATE '2099-06-09' THEN
      RAISE EXCEPTION 'Conferir: a regra que substituiu a anterior do mesmo mes nao ficou em vigor.';
    END IF;
    v_ok := false;
    BEGIN
      UPDATE public.hr_regras_periodo_folha SET dia_inicio = 12 WHERE organization_id = k_nike;
    EXCEPTION WHEN OTHERS THEN
      v_ok := position('periodo_folha_regra_imutavel' IN SQLERRM) = 1;
    END;
    IF NOT v_ok THEN
      RAISE EXCEPTION 'Conferir: uma regra do periodo da folha foi alterada por UPDATE.';
    END IF;

    RAISE EXCEPTION 'teste_periodo_folha_ok' USING ERRCODE = 'HRP00';
  EXCEPTION
    WHEN SQLSTATE 'HRP00' THEN
      NULL; -- sucesso: tudo o que o bloco escreveu na nike foi desfeito.
  END;

  IF EXISTS (SELECT 1 FROM public.hr_regras_periodo_folha r WHERE r.organization_id = k_nike)
     OR EXISTS (SELECT 1 FROM public.hr_periodos_processamento pp WHERE pp.organization_id = k_nike AND pp.ano >= 2098) THEN
    RAISE EXCEPTION 'Conferir: o teste deixou linhas na nike.';
  END IF;

  RAISE NOTICE 'Conferido: periodo da folha configuravel (regra versionada, uma por mes, datas imutaveis, transicao marcada, sem sobreposicao) e prazo de justificar ate ao fecho, para todos, com a decisao de falta fechada fora do prazo.';
END;
$conferir$;
