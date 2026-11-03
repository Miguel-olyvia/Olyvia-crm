-- ==============================================================================
-- 20270104800000_hr_horas_extra_e_limites.sql
--
-- RH, horas extra: passa da memoria (src/components/rh-exemplo/fluxosC/
-- horasExtraRegras.ts, lojaFluxosC.ts) para a base:
--   1. hr_horas_extra_config            -- limites por organizacao (dia, ano,
--                                          alerta, minimo); sem linha = omissao;
--   2. pessoas_horas_extra_autorizacao  -- o interruptor "pode fazer horas extra";
--   3. pessoas_horas_extra              -- cada hora extra (detetada a partir das
--                                          horas realizadas em vigor, ou registada
--                                          a mao), com a fila de confirmacao do RH;
--   4. pessoas_horas_extra_eventos      -- registo so de acrescentar (auditoria e
--                                          limites de escritas por actor).
-- E 9 RPCs: detetar, listar, decidir, registar, saldo, config ler/guardar,
-- autorizar e listar autorizacoes.
--
-- NAO liga ao processamento salarial nem ao banco de horas (ficam de fora).
-- NAO cria triggers em tabelas existentes. So le v_hr_horario_realizado_em_vigor,
-- pessoas_horario_planeado, pessoas_vinculos, pessoas_contas, schedule_holidays
-- e pessoas.
--
-- Base: RH (uetjghdkwbywbftedtth). NUNCA a principal, NUNCA a Mudelar.
--
--
-- !!! PRECISA DE CODIGO NOVO -- NAO APLICAR SOZINHA !!! ------------------------
--
--  Nada no ecra usa isto enquanto o store em memoria lojaFluxosC.ts (horasExtra,
--  podeHE, limites) nao for substituido por hooks que chamem as 9 RPCs abaixo.
--  Aplicar sozinha nao parte nada (so cria objectos novos), mas tambem nao muda
--  nada no ecra. O que o ecra envia e le esta no resumo
--  (jobs/bbc4f3a6/tmp/migration-horas-extra-resumo.md) e nos COMMENT das RPCs.
--  Pontos de traducao obrigatorios no hook:
--   - minutos em todo o lado (como o ecra); horas do vinculo ja vem x60.
--   - "acima do limite" e uma marca numa linha UNICA (o store dividia em duas
--     linhas, normal + acima); o ecra deixa de partir a hora extra.
--   - sem autorizacao a hora extra CRIA-SE na mesma (o store nao criava),
--     marcada sem_autorizacao; confirmar exige motivo.
--   - hora_fim pode vir '24:00:00' (fim do dia).
--   - codigos HRA75 a HRA85 (abaixo) entram no catalogo de erros do ecra.
--  Ordem: db push --linked (a partir do worktree rh-pessoas, confirmar
--  supabase/.temp/project-ref = uetjgh...) -> front com os hooks.
--
--
-- -- [CONFIRMAR] ANTES DO PUSH ---------------------------------------------------
--  a) Feriados: public.schedule_holidays (organization_id, holiday_date,
--     is_recurring), a mesma leitura de useFeriadosDaOrganizacao e das RPCs das
--     ausencias (20261207003200): so as linhas DA organizacao; recorrentes por
--     MM-DD. Linhas com organization_id NULL nao contam.
--  b) "Propria pessoa" = existe em pessoas_contas (qualquer estado, activa ou
--     revogada) uma ligacao deste auth.uid() a essa pessoa nesta organizacao.
--  c) Permissoes: hr.assiduidade.gerir (escrever e decidir), hr.assiduidade.view
--     (ver tudo), hr.assiduidade.view.own (ver so as suas). A guarda confere-as.
--  d) Codigos HRA75 a HRA85 livres (o ultimo usado no repositorio e HRA74). A
--     guarda confere que nenhuma funcao do remoto os usa.
--  e) PostgreSQL 14+ (multiranges). A guarda confere-o.
--  f) Quem aplica tem BYPASSRLS (FORCE RLS sem politicas; e a vista em vigor e
--     security_invoker, lida com os direitos do dono das funcoes). A guarda
--     confere-o.
--  g) "Hoje" e Europe/Lisbon para todas as organizacoes (hr_horas_extra_hoje).
--  h) Sem statement_timeout na funcao (seria inerte: o temporizador arma-se no
--     inicio da instrucao). A defesa da detecao sao os tectos de volume (HRA84:
--     31/62 dias, 5000 pessoas-dia, 300 pessoas com horas no intervalo); acima
--     disso o ecra chama pessoa a pessoa ou semana a semana.
--  i) SET LOCAL lock_timeout so vale se o db push correr a migration dentro de
--     uma transaccao (o CLI do Supabase fa-lo); fora dela e ignorado com aviso.
--  j) Dias retroactivos usam o vinculo ACTUAL (em vigor hoje) para a politica
--     de feriados e para o limite anual, nao o vinculo dessa data.
--
--
-- -- DECISOES DE PRODUTO (registadas, NAO alteradas aqui) -------------------------
--  P1. acima_limite conta TODAS as linhas nao rejeitadas do dia e do ano
--      (pendentes e confirmadas), incluindo as de outras origens.
--  P2. A detecao usa horas realizadas ainda por validar (estado registado).
--  P3. Nenhuma linha se apaga (retencao RGPD por decidir).
--
--
-- -- DESVIOS AO PEDIDO / DECISOES TOMADAS AQUI (a validar) ------------------------
--  1. 'semanal' nunca e produzida: nao ha na base forma de saber se o horario e
--     livre (tipo_horario ainda e um GANCHO). 'semanal' e 'banco' ficam aceites
--     na tabela para quando houver.
--  2. "Dia de descanso" = a pessoa TEM horario em vigor nessa data (regra
--     recorrente valida de qualquer dia da semana, ou excepcao nessa data) mas
--     nenhuma janela de trabalho nesse dia. Sem horario em vigor nenhum: nada
--     se cria e conta em saltadas_sem_horario.
--  3. Feriado so se o vinculo em vigor (activo ou suspenso, o mais recente) nao
--     tiver politica_feriados = 'trabalho_habitual'. Feriado e descanso contam
--     TODO o tempo realizado nesse dia. Feriado ganha a descanso.
--  4. Pendentes detetadas que a corrida ja nao produz (sem tempo a mais, origem
--     mudada, realizado desaparecido) NAO se apagam nem se decidem sozinhas:
--     contam em "obsoletas". Decididas cujos minutos ja nao batem com o
--     realizado contam em "divergentes" e tambem nao se tocam.
--  5. hora_inicio/hora_fim so com UM tramo continuo; varios tramos ficam no
--     motivo_origem ("fora do horario: 07:30-09:00, 18:00-19:30").
--  6. Um realizado que acaba as 23:59:59 (a consolidacao fecha a vespera assim)
--     conta ate as 24:00. Minutos arredondados ao mais proximo.
--  7. Limites por actor (HRA41): 240 accoes por hora de registar, detetar,
--     configurar e autorizar (nao contam detetada/atualizada, que uma corrida
--     cria em lote, nem as decisoes); 1000 decisoes (confirmar/rejeitar) por
--     hora, a parte, para a fila nao bloquear um RH a despachar; e 20 corridas
--     de detecao por hora por actor e organizacao. Uma so detecao de cada vez
--     por organizacao (HRA85).
--  8. Detecao (HRA84): no maximo 31 dias para a organizacao inteira, 62 para
--     uma pessoa, 300 pessoas com horas no intervalo (cada uma leva um bloqueio
--     consultivo ate ao fim da transaccao) e 5000 pessoas-dia (essas pessoas x
--     dias). Acima disso, o ecra chama pessoa a pessoa ou semana a semana.
--  4b. Uma pendente nova NAO se cria se o mesmo dia ja tem uma detetada
--     DECIDIDA de outra origem: conta em divergentes (o tempo nao conta duas
--     vezes no acima_limite nem no saldo). Detetadas decididas de dias sem
--     horario, abaixo do minimo ou sem realizado tambem contam em divergentes.
--  14. O planeado ignora as linhas que tem um corrector vivo
--     (corrige_horario_id, 20261130190000): so conta a versao em vigor, como
--     versoesDoPlaneado no ecra (horarioReal.ts).
--  9. Registar a mao: data nos ultimos 12 meses e nunca futura, sem atravessar
--     a meia-noite (24:00 aceite como fim), origem classificada pela base,
--     recusa (HRA83) se o dia ja tem outra hora extra nao rejeitada sobreposta
--     ou de tramo desconhecido. Quem regista PODE ser a propria pessoa.
-- 10. A detecao desconta do tempo a mais os tramos das registadas nao
--     rejeitadas desse dia: o mesmo tempo nunca e hora extra duas vezes.
-- 11. Decidir recalcula acima_limite; sem_autorizacao fica a da criacao (ou da
--     ultima recontagem da detecao).
-- 12. listar devolve {linhas, total}; decidido_por so vai a quem tem
--     hr.assiduidade.view.
-- 13. Recusas de seguranca (42501, HRA75, HRA41) deixam um RAISE WARNING com
--     auth.uid(), organizacao e codigo (sem dados pessoais).
--
--
-- -- CODIGOS DE ERRO (MESSAGE = codigo) ------------------------------------------
--   reutilizados: 42501 insufficient_privilege, HRA10 pedido_invalido, HRA31
--   nao_encontrado, HRA33 organizacao_nao_empregadora, HRA41 limite_excedido.
--   novos:
--     HRA75 decisao_propria      (decidir ou autorizar a propria pessoa)
--     HRA76 motivo_obrigatorio   (rejeitar; confirmar acima do limite ou sem autorizacao; registar)
--     HRA77 ja_decidida          (so pendentes se decidem)
--     HRA78 data_invalida        (nula, infinita, futura, antes de 2000 ou, ao registar, ha mais de 12 meses; intervalo invertido)
--     HRA79 horas_invalidas      (fim nao posterior ao inicio, ou nulas)
--     HRA80 abaixo_minimo        (registar menos do que minimo_min)
--     HRA81 config_invalida      (limites fora dos intervalos)
--     HRA82 motivo_invalido      (comprido de mais, ou com caracteres de controlo ou invisiveis)
--     HRA83 sobreposicao         (registar por cima de outra hora extra do dia)
--     HRA84 intervalo_excedido   (detecao acima de 31/62 dias, 300 pessoas ou 5000 pessoas-dia)
--     HRA85 detecao_em_curso     (ja ha uma detecao a correr nesta organizacao)
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
-- Sem ficheiro de reversao nesta pasta, de proposito. A mao, e so sem dados:
-- largar as 9 RPCs, as funcoes internas e as 4 tabelas.
-- ==============================================================================

SET LOCAL lock_timeout = '5s';

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
DECLARE
  v_n integer;
BEGIN
  -- As classes de caracteres usam escapes \uXXXX em literais simples: com
  -- standard_conforming_strings desligado a barra seria comida antes da regex.
  IF current_setting('standard_conforming_strings') <> 'on' THEN
    RAISE EXCEPTION 'Guarda: standard_conforming_strings tem de estar on (esta %).', current_setting('standard_conforming_strings');
  END IF;

  -- Multiranges (range_agg, tsmultirange) exigem PostgreSQL 14.
  IF current_setting('server_version_num')::integer < 140000 THEN
    RAISE EXCEPTION 'Guarda: esta migration precisa de PostgreSQL 14 ou superior (versao %).', current_setting('server_version');
  END IF;

  -- Dependencias.
  IF to_regprocedure('public.has_anew_permission_in_org(uuid, text, uuid)') IS NULL
     OR to_regprocedure('public.hr_organizacao_empregadora(uuid)') IS NULL
     OR to_regprocedure('public.hr_pessoa_do_utilizador(uuid, uuid)') IS NULL
     OR to_regprocedure('public.update_updated_at_column()') IS NULL THEN
    RAISE EXCEPTION 'Guarda: falta has_anew_permission_in_org, hr_organizacao_empregadora, hr_pessoa_do_utilizador ou update_updated_at_column.';
  END IF;
  IF to_regclass('public.anew_organizations') IS NULL
     OR to_regclass('public.anew_users') IS NULL
     OR to_regclass('public.anew_permissions') IS NULL
     OR to_regclass('public.pessoas') IS NULL
     OR to_regclass('public.pessoas_contas') IS NULL
     OR to_regclass('public.pessoas_vinculos') IS NULL
     OR to_regclass('public.pessoas_horario_planeado') IS NULL
     OR to_regclass('public.v_hr_horario_realizado_em_vigor') IS NULL
     OR to_regclass('public.schedule_holidays') IS NULL THEN
    RAISE EXCEPTION 'Guarda: falta uma das relacoes lidas (anew_*, pessoas, pessoas_contas, pessoas_vinculos, horario planeado, v_hr_horario_realizado_em_vigor, schedule_holidays).';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint c
                  WHERE c.conrelid = to_regclass('public.pessoas')
                    AND c.conname::text = 'pessoas_id_org_key' AND c.contype::text = 'u') THEN
    RAISE EXCEPTION 'Guarda: pessoas nao tem a UNIQUE pessoas_id_org_key (alvo das FK compostas).';
  END IF;

  -- Colunas lidas, relacao a relacao.
  SELECT count(*) INTO v_n FROM pg_attribute a
   WHERE a.attrelid = to_regclass('public.anew_users') AND NOT a.attisdropped
     AND a.attname::text IN ('id', 'auth_user_id');
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'Guarda: anew_users nao tem id e auth_user_id (encontradas % de 2).', v_n;
  END IF;
  SELECT count(*) INTO v_n FROM pg_attribute a
   WHERE a.attrelid = to_regclass('public.pessoas') AND NOT a.attisdropped
     AND a.attname::text IN ('id', 'organization_id', 'deleted_at', 'nome_completo');
  IF v_n <> 4 THEN
    RAISE EXCEPTION 'Guarda: pessoas nao tem id, organization_id, deleted_at e nome_completo (encontradas % de 4).', v_n;
  END IF;
  SELECT count(*) INTO v_n FROM pg_attribute a
   WHERE a.attrelid = to_regclass('public.pessoas_contas') AND NOT a.attisdropped
     AND a.attname::text IN ('pessoa_id', 'organization_id', 'anew_user_id');
  IF v_n <> 3 THEN
    RAISE EXCEPTION 'Guarda: pessoas_contas nao tem pessoa_id, organization_id e anew_user_id (encontradas % de 3).', v_n;
  END IF;
  SELECT count(*) INTO v_n FROM pg_attribute a
   WHERE a.attrelid = to_regclass('public.pessoas_vinculos') AND NOT a.attisdropped
     AND a.attname::text IN ('pessoa_id', 'organization_id', 'estado', 'data_inicio', 'deleted_at',
                             'horas_anuais_maximas', 'politica_feriados');
  IF v_n <> 7 THEN
    RAISE EXCEPTION 'Guarda: pessoas_vinculos nao tem as 7 colunas lidas (encontradas %).', v_n;
  END IF;
  SELECT count(*) INTO v_n FROM pg_attribute a
   WHERE a.attrelid = to_regclass('public.pessoas_horario_planeado') AND NOT a.attisdropped
     AND a.attname::text IN ('id', 'pessoa_id', 'organization_id', 'dia_semana', 'data', 'hora_inicio', 'hora_fim',
                             'nao_trabalha', 'valido_de', 'valido_ate', 'deleted_at', 'corrige_horario_id');
  IF v_n <> 12 THEN
    RAISE EXCEPTION 'Guarda: pessoas_horario_planeado nao tem as 12 colunas lidas (encontradas %).', v_n;
  END IF;
  SELECT count(*) INTO v_n FROM pg_attribute a
   WHERE a.attrelid = to_regclass('public.v_hr_horario_realizado_em_vigor') AND NOT a.attisdropped
     AND a.attname::text IN ('id', 'pessoa_id', 'organization_id', 'data', 'hora_inicio', 'hora_fim', 'estado');
  IF v_n <> 7 THEN
    RAISE EXCEPTION 'Guarda: v_hr_horario_realizado_em_vigor nao tem as 7 colunas lidas (encontradas %).', v_n;
  END IF;
  SELECT count(*) INTO v_n FROM pg_attribute a
   WHERE a.attrelid = to_regclass('public.schedule_holidays') AND NOT a.attisdropped
     AND a.attname::text IN ('organization_id', 'holiday_date', 'is_recurring');
  IF v_n <> 3 THEN
    RAISE EXCEPTION 'Guarda: schedule_holidays nao tem organization_id, holiday_date e is_recurring (encontradas % de 3).', v_n;
  END IF;

  -- As permissoes reutilizadas existem (nenhuma nova).
  SELECT count(DISTINCT code) INTO v_n FROM public.anew_permissions
   WHERE code IN ('hr.assiduidade.view', 'hr.assiduidade.view.own', 'hr.assiduidade.gerir');
  IF v_n <> 3 THEN
    RAISE EXCEPTION 'Guarda: faltam permissoes de assiduidade no catalogo (encontradas % de 3).', v_n;
  END IF;

  -- Nada do que esta migration cria pode ja existir.
  IF to_regclass('public.hr_horas_extra_config') IS NOT NULL
     OR to_regclass('public.pessoas_horas_extra_autorizacao') IS NOT NULL
     OR to_regclass('public.pessoas_horas_extra') IS NOT NULL
     OR to_regclass('public.pessoas_horas_extra_eventos') IS NOT NULL THEN
    RAISE EXCEPTION 'Guarda: uma das tabelas desta migration ja existe. Investigar.';
  END IF;
  SELECT count(*) INTO v_n
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname::text = 'public'
     AND (p.proname::text LIKE 'rpc\_hr\_horas\_extra%'
          OR p.proname::text LIKE 'rpc\_hr\_hora\_extra%'
          OR p.proname::text LIKE 'rpc\_hr\_pessoa\_horas\_extra%'
          OR p.proname::text LIKE 'hr\_horas\_extra\_%');
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'Guarda: ja existem % funcao(oes) com nomes desta migration. Investigar.', v_n;
  END IF;

  -- [CONFIRMAR d] Os codigos novos nao estao em uso em nenhuma funcao do remoto.
  SELECT count(*) INTO v_n
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname::text = 'public' AND p.prosrc ~ 'HRA(7[5-9]|8[0-5])';
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'Guarda: ha % funcao(oes) no remoto que ja usam um codigo entre HRA75 e HRA85. Escolher outros.', v_n;
  END IF;

  -- O dono das funcoes tem de passar a RLS (tabelas novas com FORCE e sem politica).
  IF NOT EXISTS (SELECT 1 FROM pg_roles r WHERE r.rolname::text = current_user::text AND (r.rolsuper OR r.rolbypassrls)) THEN
    RAISE EXCEPTION 'Guarda: o papel que aplica (%) nao tem BYPASSRLS; com FORCE RLS as RPCs nao conseguiriam ler nem escrever.', current_user::text;
  END IF;
END;
$guardas$;

-- ==============================================================================
-- 1. Tabelas
-- ==============================================================================
-- Caracteres recusados nos textos (repetido literal nos CHECK e em
-- hr_horas_extra_texto e no conferir; o conferir confirma que coincidem). Escrita
-- com escapes \Uxxxxxxxx de 8 digitos, nunca com caracteres literais:
--   controlo, U+007F-009F, U+200B-200F, U+2028-202E, U+2060-2069, U+FEFF.

-- ---- 1.1 Limites da organizacao ----------------------------------------------
CREATE TABLE public.hr_horas_extra_config (
  organization_id uuid        NOT NULL,
  dia_min         integer     NOT NULL DEFAULT 120,
  ano_min         integer     NOT NULL DEFAULT 9000,
  alerta_pct      integer     NOT NULL DEFAULT 80,
  minimo_min      integer     NOT NULL DEFAULT 15,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  updated_by      uuid,

  CONSTRAINT hr_horas_extra_config_pkey PRIMARY KEY (organization_id),
  CONSTRAINT hr_horas_extra_config_organization_fkey
    FOREIGN KEY (organization_id) REFERENCES public.anew_organizations (id) ON DELETE CASCADE,
  CONSTRAINT hr_horas_extra_config_updated_by_fkey
    FOREIGN KEY (updated_by) REFERENCES public.anew_users (id) ON DELETE SET NULL,
  CONSTRAINT hr_horas_extra_config_dia_min    CHECK (dia_min BETWEEN 1 AND 1440),
  CONSTRAINT hr_horas_extra_config_ano_min    CHECK (ano_min BETWEEN 1 AND 100000),
  CONSTRAINT hr_horas_extra_config_alerta_pct CHECK (alerta_pct BETWEEN 1 AND 100),
  CONSTRAINT hr_horas_extra_config_minimo_min CHECK (minimo_min BETWEEN 1 AND 240)
);
COMMENT ON TABLE public.hr_horas_extra_config IS
'Limites de horas extra por organizacao, em minutos: por dia (dia_min), por ano (ano_min, omissao quando o vinculo em vigor nao define horas_anuais_maximas), percentagem de alerta (alerta_pct) e minimo para existir hora extra (minimo_min, 1..240). Sem linha valem as omissoes 120, 9000, 80, 15 (hr_horas_extra_config_omissao). So por RPC. Desde 20270104800000.';
CREATE INDEX idx_hr_horas_extra_config_updated_by ON public.hr_horas_extra_config (updated_by) WHERE updated_by IS NOT NULL;

-- ---- 1.2 Autorizacao "pode fazer horas extra" ----------------------------------
CREATE TABLE public.pessoas_horas_extra_autorizacao (
  pessoa_id       uuid        NOT NULL,
  organization_id uuid        NOT NULL,
  pode            boolean     NOT NULL,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  updated_by      uuid,

  CONSTRAINT pessoas_horas_extra_autorizacao_pkey PRIMARY KEY (pessoa_id),
  CONSTRAINT pessoas_horas_extra_autorizacao_pessoa_fkey
    FOREIGN KEY (pessoa_id, organization_id) REFERENCES public.pessoas (id, organization_id) ON DELETE RESTRICT,
  CONSTRAINT pessoas_horas_extra_autorizacao_updated_by_fkey
    FOREIGN KEY (updated_by) REFERENCES public.anew_users (id) ON DELETE SET NULL
);
COMMENT ON TABLE public.pessoas_horas_extra_autorizacao IS
'O interruptor "pode fazer horas extra" por pessoa. Sem linha = nao pode. Sem autorizacao a hora extra cria-se na mesma, marcada sem_autorizacao, e confirma-la exige motivo. Ninguem se autoriza a si proprio. So por RPC. Desde 20270104800000.';
CREATE INDEX idx_pessoas_horas_extra_autorizacao_org ON public.pessoas_horas_extra_autorizacao (organization_id);
CREATE INDEX idx_pessoas_horas_extra_autorizacao_updated_by ON public.pessoas_horas_extra_autorizacao (updated_by) WHERE updated_by IS NOT NULL;

-- ---- 1.3 Horas extra ------------------------------------------------------------
CREATE TABLE public.pessoas_horas_extra (
  id               uuid        NOT NULL DEFAULT gen_random_uuid(),
  organization_id  uuid        NOT NULL,
  pessoa_id        uuid        NOT NULL,
  data             date        NOT NULL,
  hora_inicio      time,
  hora_fim         time,
  minutos          integer     NOT NULL,
  nocturno_min     integer     NOT NULL DEFAULT 0,
  origem           text        NOT NULL,
  tipo_registo     text        NOT NULL,
  motivo_origem    text,
  estado           text        NOT NULL DEFAULT 'pendente',
  sem_autorizacao  boolean     NOT NULL DEFAULT false,
  acima_limite     boolean     NOT NULL DEFAULT false,
  motivo_decisao   text,
  decidido_por     uuid,
  decidido_em      timestamptz,
  realizado_ref    uuid,
  created_at       timestamptz NOT NULL DEFAULT now(),
  created_by       uuid,
  updated_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT pessoas_horas_extra_pkey PRIMARY KEY (id),
  CONSTRAINT pessoas_horas_extra_id_pessoa_org_key UNIQUE (id, pessoa_id, organization_id),
  CONSTRAINT pessoas_horas_extra_pessoa_fkey
    FOREIGN KEY (pessoa_id, organization_id) REFERENCES public.pessoas (id, organization_id) ON DELETE RESTRICT,
  CONSTRAINT pessoas_horas_extra_minutos CHECK (minutos > 0 AND minutos <= 1440),
  CONSTRAINT pessoas_horas_extra_nocturno CHECK (nocturno_min >= 0 AND nocturno_min <= minutos),
  CONSTRAINT pessoas_horas_extra_origem_valida CHECK (
    origem IN ('diaria', 'semanal', 'feriado', 'descanso', 'banco')),
  CONSTRAINT pessoas_horas_extra_tipo_registo_valido CHECK (tipo_registo IN ('detetada', 'registada')),
  CONSTRAINT pessoas_horas_extra_estado_valido CHECK (estado IN ('pendente', 'confirmada', 'rejeitada')),
  CONSTRAINT pessoas_horas_extra_data_intervalo CHECK (data BETWEEN DATE '2000-01-01' AND DATE '2100-01-01'),
  -- O tramo: os dois ou nenhum, dentro do dia (24:00 = fim do dia).
  CONSTRAINT pessoas_horas_extra_tramo_coerente CHECK (
    (hora_inicio IS NULL AND hora_fim IS NULL)
    OR (hora_inicio IS NOT NULL AND hora_fim IS NOT NULL AND hora_fim > hora_inicio)),
  -- Registada a mao tem sempre o tramo; so a detetada sabe de que realizado veio.
  CONSTRAINT pessoas_horas_extra_registada_com_tramo CHECK (
    tipo_registo <> 'registada' OR (hora_inicio IS NOT NULL AND realizado_ref IS NULL)),
  -- Comprimento ANTES da regex (texto enorme recusado barato).
  CONSTRAINT pessoas_horas_extra_motivo_origem CHECK (
    motivo_origem IS NULL
    OR (length(motivo_origem) BETWEEN 1 AND 200
        AND motivo_origem = btrim(motivo_origem)
        AND motivo_origem !~ '[[:cntrl:]\U0000007F-\U000000A0\U000000AD\U0000061C\U0000180E\U00002000-\U0000200F\U00002028-\U0000202F\U0000205F-\U00002069\U00002800\U00003164\U0000FE00-\U0000FE0F\U0000FEFF\U0000FFA0\U000E0000-\U000E007F]')),
  CONSTRAINT pessoas_horas_extra_motivo_decisao_texto CHECK (
    motivo_decisao IS NULL
    OR (length(motivo_decisao) <= 500
        AND motivo_decisao = btrim(motivo_decisao)
        AND motivo_decisao !~ '[[:cntrl:]\U0000007F-\U000000A0\U000000AD\U0000061C\U0000180E\U00002000-\U0000200F\U00002028-\U0000202F\U0000205F-\U00002069\U00002800\U00003164\U0000FE00-\U0000FE0F\U0000FEFF\U0000FFA0\U000E0000-\U000E007F]'
        AND length(regexp_replace(motivo_decisao,
              '[[:cntrl:]\U0000007F-\U000000A0\U000000AD\U0000061C\U0000180E\U00002000-\U0000200F\U00002028-\U0000202F\U0000205F-\U00002069\U00002800\U00003164\U0000FE00-\U0000FE0F\U0000FEFF\U0000FFA0\U000E0000-\U000E007F]', '', 'g')) >= 3)),
  -- Pendente nao tem decisao; decidida tem autor e momento.
  CONSTRAINT pessoas_horas_extra_decisao_coerente CHECK (
    (estado = 'pendente' AND decidido_por IS NULL AND decidido_em IS NULL AND motivo_decisao IS NULL)
    OR (estado <> 'pendente' AND decidido_por IS NOT NULL AND decidido_em IS NOT NULL)),
  -- Rejeitar exige motivo; confirmar acima do limite ou sem autorizacao tambem.
  CONSTRAINT pessoas_horas_extra_motivo_exigido CHECK (
    (estado <> 'rejeitada' OR motivo_decisao IS NOT NULL)
    AND (estado <> 'confirmada' OR NOT (acima_limite OR sem_autorizacao) OR motivo_decisao IS NOT NULL))
);
COMMENT ON TABLE public.pessoas_horas_extra IS
'Horas extra por pessoa e dia, em minutos (nocturno_min = parte entre 22:00 e 07:00). tipo_registo detetada (rpc_hr_horas_extra_detetar, a partir de v_hr_horario_realizado_em_vigor contra o planeado, descontando as registadas; uma por pessoa, dia e origem) ou registada (rpc_hr_hora_extra_registar). Fila do RH: pendente -> confirmada | rejeitada, uma so vez; rejeitar exige motivo, e confirmar tambem quando acima_limite ou sem_autorizacao. Decididas imutaveis; nada se apaga (retencao RGPD por decidir). A detecao usa horas ainda por validar. So por RPC. Desde 20270104800000.';
COMMENT ON COLUMN public.pessoas_horas_extra.hora_inicio IS
'Inicio do tramo de tempo a mais, quando e UM tramo continuo; NULL quando sao varios (ficam no motivo_origem). hora_fim pode ser 24:00 (fim do dia). Desde 20270104800000.';
COMMENT ON COLUMN public.pessoas_horas_extra.decidido_por IS
'anew_users.id de quem decidiu, SEM FK de proposito: a linha decidida e imutavel por trigger e um ON DELETE SET NULL chocaria com isso. Desde 20270104800000.';
COMMENT ON COLUMN public.pessoas_horas_extra.created_by IS
'anew_users.id de quem detetou ou registou, SEM FK pela mesma razao de decidido_por. Desde 20270104800000.';
COMMENT ON COLUMN public.pessoas_horas_extra.realizado_ref IS
'id em v_hr_horario_realizado_em_vigor que originou a detetada (o de hora_fim mais tardia que toca o tempo a mais), SEM FK rigida: o realizado pode ser corrigido (linha nova) e a hora extra nao o segue. Desde 20270104800000.';
COMMENT ON COLUMN public.pessoas_horas_extra.acima_limite IS
'Passa o limite do dia (config.dia_min) ou do ano (horas_anuais_maximas x 60 do vinculo em vigor, senao config.ano_min). Conta TODAS as linhas nao rejeitadas do dia e do ano (pendentes e confirmadas, de qualquer origem) -- decisao de produto. Recalculado ao decidir. Desde 20270104800000.';

-- Detecao idempotente: uma detetada por pessoa, dia e origem.
CREATE UNIQUE INDEX uq_pessoas_horas_extra_detetada
  ON public.pessoas_horas_extra (pessoa_id, data, origem) WHERE tipo_registo = 'detetada';
CREATE INDEX idx_pessoas_horas_extra_org_estado_data ON public.pessoas_horas_extra (organization_id, estado, data);
CREATE INDEX idx_pessoas_horas_extra_pessoa_data ON public.pessoas_horas_extra (pessoa_id, data);

-- ---- 1.4 Registo de eventos (so de acrescentar) -----------------------------------
CREATE TABLE public.pessoas_horas_extra_eventos (
  id              uuid        NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL,
  pessoa_id       uuid,
  hora_extra_id   uuid,
  acao            text        NOT NULL,
  ator_auth_uid   uuid        NOT NULL,
  ator_id         uuid,
  dados           jsonb       NOT NULL DEFAULT '{}'::jsonb,
  criado_em       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT pessoas_horas_extra_eventos_pkey PRIMARY KEY (id),
  CONSTRAINT pessoas_horas_extra_eventos_organization_fkey
    FOREIGN KEY (organization_id) REFERENCES public.anew_organizations (id) ON DELETE RESTRICT,
  CONSTRAINT pessoas_horas_extra_eventos_pessoa_fkey
    FOREIGN KEY (pessoa_id, organization_id) REFERENCES public.pessoas (id, organization_id) ON DELETE RESTRICT,
  CONSTRAINT pessoas_horas_extra_eventos_hora_extra_fkey
    FOREIGN KEY (hora_extra_id, pessoa_id, organization_id)
    REFERENCES public.pessoas_horas_extra (id, pessoa_id, organization_id) ON DELETE RESTRICT,
  CONSTRAINT pessoas_horas_extra_eventos_acao_valida CHECK (
    (acao IN ('detetada', 'atualizada', 'confirmada', 'rejeitada', 'registada')
       AND pessoa_id IS NOT NULL AND hora_extra_id IS NOT NULL)
    OR (acao = 'autorizacao_alterada' AND pessoa_id IS NOT NULL AND hora_extra_id IS NULL)
    OR (acao IN ('config_alterada', 'detecao_executada') AND pessoa_id IS NULL AND hora_extra_id IS NULL)),
  CONSTRAINT pessoas_horas_extra_eventos_dados CHECK (
    jsonb_typeof(dados) = 'object' AND pg_column_size(dados) <= 2000)
);
COMMENT ON TABLE public.pessoas_horas_extra_eventos IS
'Registo so de acrescentar das horas extra: detetada, atualizada, confirmada, rejeitada, registada, config_alterada (antes e depois), autorizacao_alterada (antes e depois) e detecao_executada (uma por corrida). dados leva so numeros e codigos, nunca nomes nem motivos. Serve os limites por actor: 240 accoes por hora (HRA41; nao conta detetada nem atualizada) e 20 detecoes por hora por actor e organizacao. UPDATE, DELETE e TRUNCATE recusados por trigger. Desde 20270104800000.';
COMMENT ON COLUMN public.pessoas_horas_extra_eventos.ator_id IS
'anew_users.id do actor, SEM FK de proposito (imutabilidade). ator_auth_uid e o auth.users.id. Desde 20270104800000.';
CREATE INDEX idx_pessoas_horas_extra_eventos_ator ON public.pessoas_horas_extra_eventos (ator_auth_uid, criado_em);
CREATE INDEX idx_pessoas_horas_extra_eventos_org ON public.pessoas_horas_extra_eventos (organization_id, criado_em);
CREATE INDEX idx_pessoas_horas_extra_eventos_pessoa ON public.pessoas_horas_extra_eventos (pessoa_id, organization_id) WHERE pessoa_id IS NOT NULL;
CREATE INDEX idx_pessoas_horas_extra_eventos_hora_extra ON public.pessoas_horas_extra_eventos (hora_extra_id) WHERE hora_extra_id IS NOT NULL;

-- ==============================================================================
-- 2. Triggers
-- ==============================================================================
CREATE TRIGGER trg_hr_horas_extra_config_updated_at
  BEFORE UPDATE ON public.hr_horas_extra_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_pessoas_horas_extra_autorizacao_updated_at
  BEFORE UPDATE ON public.pessoas_horas_extra_autorizacao
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_pessoas_horas_extra_updated_at
  BEFORE UPDATE ON public.pessoas_horas_extra
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Uma hora extra nunca se apaga; decidida nao muda; a identidade (pessoa, dia,
-- origem, tipo) nunca muda.
CREATE FUNCTION public.hr_horas_extra_guarda()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP IN ('DELETE', 'TRUNCATE') THEN
    RAISE EXCEPTION 'hora_extra_nao_se_apaga' USING ERRCODE = '42501';
  END IF;
  IF OLD.estado <> 'pendente' THEN
    RAISE EXCEPTION 'hora_extra_decidida_imutavel' USING ERRCODE = '42501';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR NEW.pessoa_id IS DISTINCT FROM OLD.pessoa_id
     OR NEW.data IS DISTINCT FROM OLD.data
     OR NEW.origem IS DISTINCT FROM OLD.origem
     OR NEW.tipo_registo IS DISTINCT FROM OLD.tipo_registo
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    RAISE EXCEPTION 'hora_extra_identidade_imutavel' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_pessoas_horas_extra_guarda
  BEFORE UPDATE OR DELETE ON public.pessoas_horas_extra
  FOR EACH ROW EXECUTE FUNCTION public.hr_horas_extra_guarda();
CREATE TRIGGER trg_pessoas_horas_extra_sem_truncate
  BEFORE TRUNCATE ON public.pessoas_horas_extra
  FOR EACH STATEMENT EXECUTE FUNCTION public.hr_horas_extra_guarda();

CREATE FUNCTION public.hr_horas_extra_eventos_imutavel()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'evento_imutavel' USING ERRCODE = '42501';
END;
$$;
CREATE TRIGGER trg_pessoas_horas_extra_eventos_sem_alterar
  BEFORE UPDATE OR DELETE ON public.pessoas_horas_extra_eventos
  FOR EACH ROW EXECUTE FUNCTION public.hr_horas_extra_eventos_imutavel();
CREATE TRIGGER trg_pessoas_horas_extra_eventos_sem_truncate
  BEFORE TRUNCATE ON public.pessoas_horas_extra_eventos
  FOR EACH STATEMENT EXECUTE FUNCTION public.hr_horas_extra_eventos_imutavel();

-- ==============================================================================
-- 3. Privilegios e RLS: ninguem le nem escreve directamente; so as RPCs
-- ==============================================================================
REVOKE ALL ON TABLE public.hr_horas_extra_config           FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.pessoas_horas_extra_autorizacao FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.pessoas_horas_extra             FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.pessoas_horas_extra_eventos     FROM PUBLIC, anon, authenticated, service_role;

ALTER TABLE public.hr_horas_extra_config           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_horas_extra_config           FORCE ROW LEVEL SECURITY;
ALTER TABLE public.pessoas_horas_extra_autorizacao ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pessoas_horas_extra_autorizacao FORCE ROW LEVEL SECURITY;
ALTER TABLE public.pessoas_horas_extra             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pessoas_horas_extra             FORCE ROW LEVEL SECURITY;
ALTER TABLE public.pessoas_horas_extra_eventos     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pessoas_horas_extra_eventos     FORCE ROW LEVEL SECURITY;
-- Sem CREATE POLICY de proposito (o linter avisa "RLS sem politica"; e o desenho).

-- ==============================================================================
-- 4. Funcoes internas (sem EXECUTE para ninguem)
-- ==============================================================================

-- 4.1 As omissoes dos limites, num so sitio (o conferir compara-as com os DEFAULT).
CREATE FUNCTION public.hr_horas_extra_config_omissao()
RETURNS jsonb
LANGUAGE sql IMMUTABLE
SET search_path = ''
AS $$
  SELECT jsonb_build_object('dia_min', 120, 'ano_min', 9000, 'alerta_pct', 80, 'minimo_min', 15)
$$;

-- 4.2 "Hoje" no fuso de Portugal continental (nao no da sessao).
CREATE FUNCTION public.hr_horas_extra_hoje()
RETURNS date
LANGUAGE sql STABLE
SET search_path = ''
AS $$
  SELECT (now() AT TIME ZONE 'Europe/Lisbon')::date
$$;

-- 4.3 Recusa de seguranca: deixa rasto no registo do servidor (auth.uid(),
--     organizacao e codigo; nada pessoal) e levanta o erro.
CREATE FUNCTION public.hr_horas_extra_recusar(p_organization_id uuid, p_codigo text, p_sqlstate text)
RETURNS void
LANGUAGE plpgsql VOLATILE
SET search_path = ''
AS $$
BEGIN
  RAISE WARNING 'hr_horas_extra_recusa uid=% org=% codigo=%', auth.uid(), p_organization_id, p_sqlstate;
  RAISE EXCEPTION USING MESSAGE = p_codigo, ERRCODE = p_sqlstate;
END;
$$;

-- 4.4 Os limites em vigor da organizacao (linha, ou as omissoes).
CREATE FUNCTION public.hr_horas_extra_config_efetiva(
  p_organization_id uuid,
  OUT dia_min integer, OUT ano_min integer, OUT alerta_pct integer, OUT minimo_min integer,
  OUT omissao boolean)
LANGUAGE plpgsql STABLE
SET search_path = ''
AS $$
DECLARE
  v_o jsonb := public.hr_horas_extra_config_omissao();
BEGIN
  SELECT c.dia_min, c.ano_min, c.alerta_pct, c.minimo_min, false
    INTO dia_min, ano_min, alerta_pct, minimo_min, omissao
    FROM public.hr_horas_extra_config c
   WHERE c.organization_id = p_organization_id;
  IF NOT FOUND THEN
    dia_min    := (v_o ->> 'dia_min')::integer;
    ano_min    := (v_o ->> 'ano_min')::integer;
    alerta_pct := (v_o ->> 'alerta_pct')::integer;
    minimo_min := (v_o ->> 'minimo_min')::integer;
    omissao    := true;
  END IF;
END;
$$;

-- 4.5 O vinculo "em vigor": activo ou suspenso (o par de 20261130180000 e de
--     idx_pessoas_vinculos_um_em_vigor). Num so sitio, testado no conferir.
CREATE FUNCTION public.hr_horas_extra_vinculo_em_vigor(p_estado text)
RETURNS boolean
LANGUAGE sql IMMUTABLE
SET search_path = ''
AS $$
  SELECT coalesce(p_estado IN ('activo', 'suspenso'), false)
$$;

-- 4.6 O contexto de uma pessoa, lido UMA vez por pessoa: limite anual
--     (horas_anuais_maximas x 60 do vinculo em vigor mais recente, como
--     limiteAnualMin do ecra, senao a omissao da organizacao), se o feriado
--     conta (politica_feriados <> trabalho_habitual) e se pode fazer horas extra.
CREATE FUNCTION public.hr_horas_extra_pessoa_ctx(
  p_organization_id uuid, p_pessoa_id uuid, p_omissao_min integer,
  OUT limite_min integer, OUT limite_origem text, OUT feriado_conta boolean, OUT pode boolean)
LANGUAGE plpgsql STABLE
SET search_path = ''
AS $$
DECLARE
  v_h   numeric;
  v_pol text;
BEGIN
  SELECT v.horas_anuais_maximas, v.politica_feriados INTO v_h, v_pol
    FROM public.pessoas_vinculos v
   WHERE v.pessoa_id = p_pessoa_id
     AND v.organization_id = p_organization_id
     AND v.deleted_at IS NULL
     AND public.hr_horas_extra_vinculo_em_vigor(v.estado)
   ORDER BY v.data_inicio DESC
   LIMIT 1;
  IF v_h IS NOT NULL AND v_h > 0 THEN
    limite_min    := round(v_h * 60)::integer;
    limite_origem := 'contrato';
  ELSE
    limite_min    := p_omissao_min;
    limite_origem := 'organizacao';
  END IF;
  feriado_conta := coalesce(v_pol, 'nao_laboral') <> 'trabalho_habitual';
  pode := coalesce((SELECT a.pode FROM public.pessoas_horas_extra_autorizacao a
                     WHERE a.pessoa_id = p_pessoa_id AND a.organization_id = p_organization_id), false);
END;
$$;

-- 4.7 Os feriados da organizacao num intervalo, lidos UMA vez por corrida.
CREATE FUNCTION public.hr_horas_extra_feriados(p_organization_id uuid, p_de date, p_ate date)
RETURNS date[]
LANGUAGE sql STABLE
SET search_path = ''
AS $$
  SELECT coalesce(array_agg(p_de + i ORDER BY i), ARRAY[]::date[])
    FROM generate_series(0, greatest(p_ate - p_de, -1)) AS i
   WHERE EXISTS (
     SELECT 1 FROM public.schedule_holidays sh
      WHERE sh.organization_id = p_organization_id
        AND ((coalesce(sh.is_recurring, false) = false AND sh.holiday_date = p_de + i)
             OR (coalesce(sh.is_recurring, false) = true
                 AND to_char(sh.holiday_date, 'MM-DD') = to_char(p_de + i, 'MM-DD'))))
$$;

-- 4.8 Uma data aceitavel para horas extra: finita, desde 2000-01-01, ate hoje.
CREATE FUNCTION public.hr_horas_extra_data_valida(p_data date)
RETURNS boolean
LANGUAGE sql STABLE
SET search_path = ''
AS $$
  SELECT p_data IS NOT NULL
     AND isfinite(p_data)
     AND p_data >= DATE '2000-01-01'
     AND p_data <= public.hr_horas_extra_hoje()
$$;

-- 4.9 O fim de um realizado: 23:59:59 (como a consolidacao fecha a vespera de
--     um turno que atravessa a meia-noite) vale 24:00.
CREATE FUNCTION public.hr_horas_extra_fim(p_fim time)
RETURNS time
LANGUAGE sql IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE WHEN p_fim = time '23:59:59' THEN time '24:00' ELSE p_fim END
$$;

-- 4.10 O dia de uma pessoa: tem horario em vigor? e descanso? e as janelas
--      planeadas. A escolha e a de hr_assiduidade_desvios: havendo alguma linha
--      com data = dia (excepcao), so as excepcoes contam; senao, as recorrentes
--      desse dia da semana validas na data. deleted_at fora; nao_trabalha nunca
--      da janela. As linhas CORRIGIDAS (com um corrector vivo que aponta para
--      elas por corrige_horario_id, 20261130190000) ficam fora em todas as
--      quatro leituras: a correccao cobre o mesmo periodo, e contar as duas
--      somaria a janela errada a certa (como versoesDoPlaneado, horarioReal.ts).
CREATE FUNCTION public.hr_horas_extra_dia(
  p_organization_id uuid, p_pessoa_id uuid, p_data date,
  OUT tem_horario boolean, OUT descanso boolean, OUT janelas tsmultirange)
LANGUAGE plpgsql STABLE
SET search_path = ''
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.pessoas_horario_planeado hp
              WHERE hp.organization_id = p_organization_id
                AND hp.pessoa_id = p_pessoa_id
                AND hp.deleted_at IS NULL
                AND NOT EXISTS (SELECT 1 FROM public.pessoas_horario_planeado c
                                 WHERE c.corrige_horario_id = hp.id AND c.deleted_at IS NULL)
                AND hp.data = p_data) THEN
    tem_horario := true;
    SELECT range_agg(tsrange(p_data + hp.hora_inicio, p_data + hp.hora_fim, '[)'))
      INTO janelas
      FROM public.pessoas_horario_planeado hp
     WHERE hp.organization_id = p_organization_id
       AND hp.pessoa_id = p_pessoa_id
       AND hp.deleted_at IS NULL
       AND NOT EXISTS (SELECT 1 FROM public.pessoas_horario_planeado c
                        WHERE c.corrige_horario_id = hp.id AND c.deleted_at IS NULL)
       AND hp.data = p_data
       AND hp.nao_trabalha = false
       AND hp.hora_inicio IS NOT NULL AND hp.hora_fim IS NOT NULL;
  ELSE
    -- Horario em vigor: alguma regra recorrente valida nesta data, de qualquer
    -- dia da semana (o sabado sem regra de quem trabalha de segunda a sexta e
    -- descanso, nao "sem horario").
    tem_horario := EXISTS (
      SELECT 1 FROM public.pessoas_horario_planeado hp
       WHERE hp.organization_id = p_organization_id
         AND hp.pessoa_id = p_pessoa_id
         AND hp.deleted_at IS NULL
         AND NOT EXISTS (SELECT 1 FROM public.pessoas_horario_planeado c
                          WHERE c.corrige_horario_id = hp.id AND c.deleted_at IS NULL)
         AND hp.dia_semana IS NOT NULL
         AND (hp.valido_de IS NULL OR p_data >= hp.valido_de)
         AND (hp.valido_ate IS NULL OR p_data <= hp.valido_ate));
    SELECT range_agg(tsrange(p_data + hp.hora_inicio, p_data + hp.hora_fim, '[)'))
      INTO janelas
      FROM public.pessoas_horario_planeado hp
     WHERE hp.organization_id = p_organization_id
       AND hp.pessoa_id = p_pessoa_id
       AND hp.deleted_at IS NULL
       AND NOT EXISTS (SELECT 1 FROM public.pessoas_horario_planeado c
                        WHERE c.corrige_horario_id = hp.id AND c.deleted_at IS NULL)
       AND hp.dia_semana = extract(dow FROM p_data)::smallint
       AND (hp.valido_de IS NULL OR p_data >= hp.valido_de)
       AND (hp.valido_ate IS NULL OR p_data <= hp.valido_ate)
       AND hp.nao_trabalha = false
       AND hp.hora_inicio IS NOT NULL AND hp.hora_fim IS NOT NULL;
  END IF;

  janelas  := coalesce(janelas, '{}'::tsmultirange);
  descanso := tem_horario AND isempty(janelas);
END;
$$;

-- 4.11 O calculo puro: tempo realizado FORA do que se desconta (janelas
--      planeadas e tramos ja registados a mao), por uniao (nada conta duas
--      vezes), a parte nocturna (22:00-24:00 e 00:00-07:00 desse dia), o tramo
--      quando e um so (fim 24:00 se acaba a meia-noite) e os tramos em texto.
--      Minutos arredondados ao mais proximo.
CREATE FUNCTION public.hr_horas_extra_calcular(
  p_dia date, p_realizado tsmultirange, p_descontar tsmultirange,
  OUT minutos integer, OUT nocturno_min integer, OUT hora_inicio time, OUT hora_fim time,
  OUT tramos text, OUT extra tsmultirange)
LANGUAGE plpgsql IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_meia_noite timestamp := (p_dia + 1)::timestamp;
  v_noite      tsmultirange;
  v_n          integer;
BEGIN
  extra := coalesce(p_realizado, '{}'::tsmultirange) - coalesce(p_descontar, '{}'::tsmultirange);
  v_noite := tsmultirange(
    tsrange(p_dia + time '00:00', p_dia + time '07:00', '[)'),
    tsrange(p_dia + time '22:00', v_meia_noite, '[)'));

  SELECT coalesce(round(sum(extract(epoch FROM (upper(r) - lower(r)))) / 60), 0)::integer, count(*)::integer
    INTO minutos, v_n
    FROM unnest(extra) AS r;
  SELECT coalesce(round(sum(extract(epoch FROM (upper(r) - lower(r)))) / 60), 0)::integer
    INTO nocturno_min
    FROM unnest(extra * v_noite) AS r;
  nocturno_min := least(nocturno_min, minutos);

  SELECT string_agg(to_char(lower(r), 'HH24:MI') || '-'
                    || CASE WHEN upper(r) = v_meia_noite THEN '24:00' ELSE to_char(upper(r), 'HH24:MI') END,
                    ', ' ORDER BY lower(r))
    INTO tramos
    FROM unnest(extra) AS r;

  hora_inicio := NULL;
  hora_fim    := NULL;
  IF v_n = 1 THEN
    hora_inicio := lower(extra)::time;
    -- O fim do dia guarda-se 24:00 (o tipo time aceita-o); ::time daria 00:00.
    hora_fim    := CASE WHEN upper(extra) = v_meia_noite THEN time '24:00' ELSE upper(extra)::time END;
  END IF;
END;
$$;

-- 4.12 Passa o limite? Total do dia e do ano da pessoa (todas as linhas nao
--      rejeitadas, sem a propria) mais os minutos novos.
CREATE FUNCTION public.hr_horas_extra_acima(
  p_organization_id uuid, p_pessoa_id uuid, p_data date, p_minutos integer,
  p_excluir_id uuid, p_dia_min integer, p_ano_min integer)
RETURNS boolean
LANGUAGE plpgsql STABLE
SET search_path = ''
AS $$
DECLARE
  v_dia integer;
  v_ano integer;
BEGIN
  SELECT coalesce(sum(h.minutos) FILTER (WHERE h.data = p_data), 0)::integer,
         coalesce(sum(h.minutos), 0)::integer
    INTO v_dia, v_ano
    FROM public.pessoas_horas_extra h
   WHERE h.organization_id = p_organization_id
     AND h.pessoa_id = p_pessoa_id
     -- make_date e nao date_trunc: date_trunc(date) resolve para timestamptz e
     -- dependeria do fuso da sessao.
     AND h.data >= make_date(extract(year FROM p_data)::integer, 1, 1)
     AND h.data <  make_date(extract(year FROM p_data)::integer + 1, 1, 1)
     AND h.estado <> 'rejeitada'
     AND (p_excluir_id IS NULL OR h.id <> p_excluir_id);
  RETURN (v_dia + p_minutos) > p_dia_min OR (v_ano + p_minutos) > p_ano_min;
END;
$$;

-- 4.13 Este auth.uid() e (ou foi) a pessoa? Qualquer ligacao em pessoas_contas
--      nesta organizacao, activa OU revogada: uma conta revogada nao passa a
--      poder decidir as horas da sua antiga ficha.
CREATE FUNCTION public.hr_horas_extra_e_propria(p_organization_id uuid, p_pessoa_id uuid)
RETURNS boolean
LANGUAGE sql STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.pessoas_contas pc
      JOIN public.anew_users au ON au.id = pc.anew_user_id
     WHERE au.auth_user_id = auth.uid()
       AND pc.organization_id = p_organization_id
       AND pc.pessoa_id = p_pessoa_id)
$$;

-- 4.14 Leitura: devolve o ambito de pessoa. hr.assiduidade.view ve tudo
--      (devolve p_pessoa_id, NULL = todas); hr.assiduidade.view.own ve so a sua
--      ficha (a ligacao ACTIVA, hr_pessoa_do_utilizador); pedir outra e 42501.
CREATE FUNCTION public.hr_horas_extra_ambito_leitura(p_organization_id uuid, p_pessoa_id uuid)
RETURNS uuid
LANGUAGE plpgsql STABLE
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_eu  uuid;
BEGIN
  IF v_uid IS NOT NULL AND p_organization_id IS NOT NULL THEN
    IF public.has_anew_permission_in_org(v_uid, 'hr.assiduidade.view', p_organization_id) THEN
      RETURN p_pessoa_id;
    END IF;
    IF public.has_anew_permission_in_org(v_uid, 'hr.assiduidade.view.own', p_organization_id) THEN
      v_eu := public.hr_pessoa_do_utilizador(v_uid, p_organization_id);
      IF v_eu IS NOT NULL AND (p_pessoa_id IS NULL OR p_pessoa_id = v_eu) THEN
        RETURN v_eu;
      END IF;
    END IF;
  END IF;
  PERFORM public.hr_horas_extra_recusar(p_organization_id, 'insufficient_privilege', '42501');
  RETURN NULL;
END;
$$;

-- 4.15 Escrita: sessao, hr.assiduidade.gerir, utilizador da aplicacao,
--      organizacao empregadora e limite de accoes por hora por actor (em fila
--      por actor). Dois baldes separados: decisoes (p_decisao = true,
--      confirmar/rejeitar) ate 1000 por hora; o resto (registar, detetar,
--      configurar, autorizar) ate 240 por hora, sem contar as decisoes nem as
--      linhas detetada/atualizada que uma corrida cria em lote. Devolve
--      anew_users.id. Tudo ANTES de ler ou trancar.
CREATE FUNCTION public.hr_horas_extra_exigir_escrita(p_organization_id uuid, p_decisao boolean)
RETURNS uuid
LANGUAGE plpgsql VOLATILE
SET search_path = ''
AS $$
DECLARE
  c_limite         constant integer := 240;
  c_limite_decisao constant integer := 1000;
  v_uid  uuid := auth.uid();
  v_anew uuid;
  v_n    integer;
BEGIN
  IF v_uid IS NULL OR p_organization_id IS NULL
     OR NOT public.has_anew_permission_in_org(v_uid, 'hr.assiduidade.gerir', p_organization_id) THEN
    PERFORM public.hr_horas_extra_recusar(p_organization_id, 'insufficient_privilege', '42501');
  END IF;
  SELECT au.id INTO v_anew FROM public.anew_users au WHERE au.auth_user_id = v_uid LIMIT 1;
  IF v_anew IS NULL THEN
    PERFORM public.hr_horas_extra_recusar(p_organization_id, 'insufficient_privilege', '42501');
  END IF;
  IF NOT public.hr_organizacao_empregadora(p_organization_id) THEN
    RAISE EXCEPTION 'organizacao_nao_empregadora' USING ERRCODE = 'HRA33';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('hr_horas_extra_ator:' || v_uid::text, 0));
  IF coalesce(p_decisao, false) THEN
    SELECT count(*) INTO v_n
      FROM public.pessoas_horas_extra_eventos e
     WHERE e.ator_auth_uid = v_uid
       AND e.criado_em > now() - interval '1 hour'
       AND e.acao IN ('confirmada', 'rejeitada');
    IF v_n >= c_limite_decisao THEN
      PERFORM public.hr_horas_extra_recusar(p_organization_id, 'limite_excedido', 'HRA41');
    END IF;
  ELSE
    SELECT count(*) INTO v_n
      FROM public.pessoas_horas_extra_eventos e
     WHERE e.ator_auth_uid = v_uid
       AND e.criado_em > now() - interval '1 hour'
       AND e.acao NOT IN ('detetada', 'atualizada', 'confirmada', 'rejeitada');
    IF v_n >= c_limite THEN
      PERFORM public.hr_horas_extra_recusar(p_organization_id, 'limite_excedido', 'HRA41');
    END IF;
  END IF;
  RETURN v_anew;
END;
$$;

-- 4.16 Fila por pessoa: as contas do dia e do ano nao se baralham entre duas
--      escritas simultaneas. Tranca-se sempre DEPOIS da fila do actor (e da da
--      organizacao, na detecao), e a detecao tranca as pessoas por ordem crescente.
CREATE FUNCTION public.hr_horas_extra_trancar_pessoa(p_pessoa_id uuid)
RETURNS void
LANGUAGE sql VOLATILE
SET search_path = ''
AS $$
  SELECT pg_advisory_xact_lock(hashtextextended('hr_horas_extra_pessoa:' || p_pessoa_id::text, 0))
$$;

-- 4.17 Grava um evento (o actor e sempre auth.uid()).
CREATE FUNCTION public.hr_horas_extra_evento(
  p_organization_id uuid, p_pessoa_id uuid, p_hora_extra_id uuid, p_acao text, p_ator_id uuid, p_dados jsonb)
RETURNS void
LANGUAGE sql VOLATILE
SET search_path = ''
AS $$
  INSERT INTO public.pessoas_horas_extra_eventos
    (organization_id, pessoa_id, hora_extra_id, acao, ator_auth_uid, ator_id, dados)
  VALUES
    (p_organization_id, p_pessoa_id, p_hora_extra_id, p_acao, auth.uid(), p_ator_id, coalesce(p_dados, '{}'::jsonb))
$$;

-- 4.18 Um texto livre valido: devolve-o aparado, ou NULL se vazio. Apara nas
--      pontas espacos normais E espacos Unicode (NBSP U+00A0, U+2000-200A,
--      U+202F, U+205F, U+3000), nao so o btrim. O comprimento mede-se ANTES da
--      regex (texto enorme recusado barato); comprido de mais, ou com
--      caracteres de controlo ou invisiveis no meio: HRA82.
--      length() conta caracteres, nao bytes nem glifos. Como qualquer
--      caracter da classe e recusado, o que volta so tem caracteres que se
--      veem e espacos normais: os minimos de 3 contam esses (um "a b" conta 3).
CREATE FUNCTION public.hr_horas_extra_texto(p_texto text, p_max integer)
RETURNS text
LANGUAGE plpgsql IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v text;
BEGIN
  IF p_texto IS NULL THEN
    RETURN NULL;
  END IF;
  -- Antes de aparar: um texto absurdo nem chega a passar pela regex.
  IF length(p_texto) > p_max + 1000 THEN
    RAISE EXCEPTION 'motivo_invalido' USING ERRCODE = 'HRA82';
  END IF;
  v := nullif(regexp_replace(p_texto,
         '^[[:space:]\U000000A0\U00002000-\U0000200A\U0000202F\U0000205F\U00003000]+|[[:space:]\U000000A0\U00002000-\U0000200A\U0000202F\U0000205F\U00003000]+$',
         '', 'g'), '');
  IF v IS NULL THEN
    RETURN NULL;
  END IF;
  IF length(v) > p_max THEN
    RAISE EXCEPTION 'motivo_invalido' USING ERRCODE = 'HRA82';
  END IF;
  IF v ~ '[[:cntrl:]\U0000007F-\U000000A0\U000000AD\U0000061C\U0000180E\U00002000-\U0000200F\U00002028-\U0000202F\U0000205F-\U00002069\U00002800\U00003164\U0000FE00-\U0000FE0F\U0000FEFF\U0000FFA0\U000E0000-\U000E007F]' THEN
    RAISE EXCEPTION 'motivo_invalido' USING ERRCODE = 'HRA82';
  END IF;
  RETURN v;
END;
$$;

-- ==============================================================================
-- 5. RPCs (authenticated; SECURITY DEFINER; permissao e organizacao primeiro)
-- ==============================================================================

-- 5.1 Detetar horas extra a partir das horas realizadas em vigor.
CREATE FUNCTION public.rpc_hr_horas_extra_detetar(
  p_organization_id uuid, p_data_de date, p_data_ate date, p_pessoa_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  -- Os tectos sao a defesa contra chamadas pesadas (sem statement_timeout
  -- proprio: seria inerte). Acima deles o ecra parte por pessoa ou semana.
  c_max_dias_org    constant integer := 31;
  c_max_dias_pessoa constant integer := 62;
  c_max_pessoas     constant integer := 300;
  c_max_pessoa_dias constant integer := 5000;
  c_max_corridas    constant integer := 20;
  v_outra_decidida boolean;
  v_pend     integer;
  v_dec      integer;
  v_anew     uuid;
  v_hoje     date;
  v_ate      date;
  v_dias     integer;
  v_np       integer;
  v_n        integer;
  v_cfg      record;
  v_ctx      record;
  v_r        record;
  v_dia      record;
  v_calc     record;
  v_he       public.pessoas_horas_extra;
  v_feriados date[];
  v_reg      tsmultirange;
  v_pessoa   uuid := NULL;
  v_origem   text;
  v_motivo   text;
  v_acima    boolean;
  v_ref      uuid;
  v_id       uuid;
  v_criadas  integer := 0;
  v_atual    integer := 0;
  v_iguais   integer := 0;
  v_decid    integer := 0;
  v_diverg   integer := 0;
  v_saltadas integer := 0;
  v_abaixo   integer := 0;
  v_obsol    integer := 0;
BEGIN
  v_anew := public.hr_horas_extra_exigir_escrita(p_organization_id, false);

  -- Limite proprio das corridas (sob a fila do actor ja tomada).
  SELECT count(*) INTO v_n
    FROM public.pessoas_horas_extra_eventos e
   WHERE e.ator_auth_uid = auth.uid()
     AND e.organization_id = p_organization_id
     AND e.acao = 'detecao_executada'
     AND e.criado_em > now() - interval '1 hour';
  IF v_n >= c_max_corridas THEN
    PERFORM public.hr_horas_extra_recusar(p_organization_id, 'limite_excedido', 'HRA41');
  END IF;

  v_hoje := public.hr_horas_extra_hoje();
  IF NOT public.hr_horas_extra_data_valida(p_data_de)
     OR p_data_ate IS NULL OR NOT isfinite(p_data_ate) OR p_data_ate < p_data_de THEN
    RAISE EXCEPTION 'data_invalida' USING ERRCODE = 'HRA78';
  END IF;
  v_ate  := least(p_data_ate, v_hoje);
  v_dias := (v_ate - p_data_de) + 1;
  IF v_dias > c_max_dias_pessoa OR (p_pessoa_id IS NULL AND v_dias > c_max_dias_org) THEN
    RAISE EXCEPTION 'intervalo_excedido' USING ERRCODE = 'HRA84';
  END IF;

  IF p_pessoa_id IS NOT NULL THEN
    PERFORM 1 FROM public.pessoas p
     WHERE p.id = p_pessoa_id AND p.organization_id = p_organization_id AND p.deleted_at IS NULL;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'nao_encontrado' USING ERRCODE = 'HRA31';
    END IF;
  END IF;

  -- Volume real: so as pessoas (nao apagadas) com horas em vigor no intervalo.
  -- Cada uma leva um bloqueio consultivo ate ao fim da transaccao: dai o tecto
  -- de pessoas distintas, alem do de pessoas-dia.
  SELECT count(DISTINCT h.pessoa_id)::integer INTO v_np
    FROM public.v_hr_horario_realizado_em_vigor h
    JOIN public.pessoas p ON p.id = h.pessoa_id AND p.organization_id = h.organization_id
   WHERE h.organization_id = p_organization_id
     AND h.data BETWEEN p_data_de AND v_ate
     AND p.deleted_at IS NULL
     AND (p_pessoa_id IS NULL OR h.pessoa_id = p_pessoa_id);
  IF v_np > c_max_pessoas OR v_np::bigint * v_dias > c_max_pessoa_dias THEN
    RAISE EXCEPTION 'intervalo_excedido' USING ERRCODE = 'HRA84';
  END IF;

  -- Uma so detecao de cada vez por organizacao (sem esperar: recusa).
  IF NOT pg_try_advisory_xact_lock(hashtextextended('hr_horas_extra_detecao:' || p_organization_id::text, 0)) THEN
    RAISE EXCEPTION 'detecao_em_curso' USING ERRCODE = 'HRA85';
  END IF;

  SELECT * INTO v_cfg FROM public.hr_horas_extra_config_efetiva(p_organization_id);
  v_feriados := public.hr_horas_extra_feriados(p_organization_id, p_data_de, v_ate);

  FOR v_r IN
    SELECT h.pessoa_id, h.data,
           range_agg(tsrange(h.data + h.hora_inicio, h.data + public.hr_horas_extra_fim(h.hora_fim), '[)')) AS realizado
      FROM public.v_hr_horario_realizado_em_vigor h
      JOIN public.pessoas p ON p.id = h.pessoa_id AND p.organization_id = h.organization_id
     WHERE h.organization_id = p_organization_id
       AND h.data BETWEEN p_data_de AND v_ate
       AND h.estado <> 'rejeitado'
       AND p.deleted_at IS NULL
       AND (p_pessoa_id IS NULL OR h.pessoa_id = p_pessoa_id)
     GROUP BY h.pessoa_id, h.data
     ORDER BY h.pessoa_id, h.data
  LOOP
    -- Uma vez por pessoa: fila, limite anual, feriado conta, pode.
    IF v_r.pessoa_id IS DISTINCT FROM v_pessoa THEN
      v_pessoa := v_r.pessoa_id;
      PERFORM public.hr_horas_extra_trancar_pessoa(v_pessoa);
      SELECT * INTO v_ctx FROM public.hr_horas_extra_pessoa_ctx(p_organization_id, v_pessoa, v_cfg.ano_min);
    END IF;

    SELECT * INTO v_dia FROM public.hr_horas_extra_dia(p_organization_id, v_r.pessoa_id, v_r.data);
    IF NOT v_dia.tem_horario THEN
      v_saltadas := v_saltadas + 1;
      -- Detetadas do dia: as pendentes ficaram obsoletas, as decididas divergem.
      SELECT count(*) FILTER (WHERE x.estado = 'pendente')::integer,
             count(*) FILTER (WHERE x.estado <> 'pendente')::integer
        INTO v_pend, v_dec
        FROM public.pessoas_horas_extra x
       WHERE x.organization_id = p_organization_id AND x.pessoa_id = v_r.pessoa_id AND x.data = v_r.data
         AND x.tipo_registo = 'detetada';
      v_obsol  := v_obsol + v_pend;
      v_diverg := v_diverg + v_dec;
      CONTINUE;
    END IF;

    v_origem := CASE WHEN v_ctx.feriado_conta AND v_r.data = ANY (v_feriados) THEN 'feriado'
                     WHEN v_dia.descanso THEN 'descanso'
                     ELSE 'diaria' END;

    -- O que ja foi registado a mao nesse dia nao volta a ser hora extra.
    SELECT coalesce(range_agg(tsrange(x.data + x.hora_inicio, x.data + x.hora_fim, '[)')), '{}'::tsmultirange)
      INTO v_reg
      FROM public.pessoas_horas_extra x
     WHERE x.organization_id = p_organization_id
       AND x.pessoa_id = v_r.pessoa_id
       AND x.data = v_r.data
       AND x.tipo_registo = 'registada'
       AND x.estado <> 'rejeitada'
       AND x.hora_inicio IS NOT NULL;

    SELECT * INTO v_calc
      FROM public.hr_horas_extra_calcular(
             v_r.data, v_r.realizado,
             (CASE WHEN v_origem = 'diaria' THEN v_dia.janelas ELSE '{}'::tsmultirange END) + v_reg);

    IF v_calc.minutos <= 0 OR v_calc.minutos < v_cfg.minimo_min THEN
      v_abaixo := v_abaixo + 1;
      -- Ja nao ha hora extra neste dia: pendentes obsoletas, decididas divergem.
      SELECT count(*) FILTER (WHERE x.estado = 'pendente')::integer,
             count(*) FILTER (WHERE x.estado <> 'pendente')::integer
        INTO v_pend, v_dec
        FROM public.pessoas_horas_extra x
       WHERE x.organization_id = p_organization_id AND x.pessoa_id = v_r.pessoa_id AND x.data = v_r.data
         AND x.tipo_registo = 'detetada';
      v_obsol  := v_obsol + v_pend;
      v_diverg := v_diverg + v_dec;
      CONTINUE;
    END IF;

    -- Detetadas do mesmo dia com OUTRA origem: as pendentes ficaram obsoletas,
    -- as decididas divergem (e impedem criar uma nova, abaixo).
    SELECT count(*) FILTER (WHERE x.estado = 'pendente')::integer,
           count(*) FILTER (WHERE x.estado <> 'pendente')::integer
      INTO v_pend, v_dec
      FROM public.pessoas_horas_extra x
     WHERE x.organization_id = p_organization_id AND x.pessoa_id = v_r.pessoa_id AND x.data = v_r.data
       AND x.tipo_registo = 'detetada' AND x.origem <> v_origem;
    v_obsol  := v_obsol + v_pend;
    v_diverg := v_diverg + v_dec;
    v_outra_decidida := v_dec > 0;

    v_motivo := btrim(left(CASE v_origem
                             WHEN 'feriado'  THEN 'trabalho em feriado: '
                             WHEN 'descanso' THEN 'trabalho em dia de descanso: '
                             ELSE 'fora do horario: ' END || v_calc.tramos, 200));

    SELECT * INTO v_he
      FROM public.pessoas_horas_extra x
     WHERE x.organization_id = p_organization_id
       AND x.pessoa_id = v_r.pessoa_id
       AND x.data = v_r.data
       AND x.origem = v_origem
       AND x.tipo_registo = 'detetada'
     FOR UPDATE;

    -- Ja decidida: nao se mexe; so se conta se os minutos ja nao batem.
    IF v_he.id IS NOT NULL AND v_he.estado <> 'pendente' THEN
      v_decid := v_decid + 1;
      IF v_he.minutos <> v_calc.minutos THEN
        v_diverg := v_diverg + 1;
      END IF;
      CONTINUE;
    END IF;

    -- O dia ja tem uma detetada DECIDIDA de outra origem (ja contada em
    -- divergentes): nao se cria outra, senao o mesmo tempo contaria duas vezes
    -- no acima_limite e no saldo. O RH resolve a divergencia.
    IF v_he.id IS NULL AND v_outra_decidida THEN
      CONTINUE;
    END IF;

    SELECT h.id INTO v_ref
      FROM public.v_hr_horario_realizado_em_vigor h
     WHERE h.organization_id = p_organization_id
       AND h.pessoa_id = v_r.pessoa_id
       AND h.data = v_r.data
       AND tsrange(h.data + h.hora_inicio, h.data + public.hr_horas_extra_fim(h.hora_fim), '[)') && v_calc.extra
     ORDER BY h.hora_fim DESC, h.id
     LIMIT 1;

    IF v_he.id IS NULL THEN
      v_acima := public.hr_horas_extra_acima(p_organization_id, v_r.pessoa_id, v_r.data, v_calc.minutos,
                                             NULL, v_cfg.dia_min, v_ctx.limite_min);
      INSERT INTO public.pessoas_horas_extra
        (organization_id, pessoa_id, data, hora_inicio, hora_fim, minutos, nocturno_min, origem,
         tipo_registo, motivo_origem, estado, sem_autorizacao, acima_limite, realizado_ref, created_by)
      VALUES
        (p_organization_id, v_r.pessoa_id, v_r.data, v_calc.hora_inicio, v_calc.hora_fim, v_calc.minutos,
         v_calc.nocturno_min, v_origem, 'detetada', v_motivo, 'pendente', NOT v_ctx.pode, v_acima, v_ref, v_anew)
      RETURNING id INTO v_id;
      PERFORM public.hr_horas_extra_evento(p_organization_id, v_r.pessoa_id, v_id, 'detetada', v_anew,
        jsonb_build_object('minutos', v_calc.minutos, 'nocturno_min', v_calc.nocturno_min, 'origem', v_origem,
                           'acima_limite', v_acima, 'sem_autorizacao', NOT v_ctx.pode));
      v_criadas := v_criadas + 1;
      CONTINUE;
    END IF;

    -- Pendente igual ao que se calculou: nada a fazer (nem recontar limites).
    IF v_he.minutos = v_calc.minutos
       AND v_he.nocturno_min = v_calc.nocturno_min
       AND v_he.hora_inicio IS NOT DISTINCT FROM v_calc.hora_inicio
       AND v_he.hora_fim IS NOT DISTINCT FROM v_calc.hora_fim
       AND v_he.sem_autorizacao = (NOT v_ctx.pode)
       AND v_he.realizado_ref IS NOT DISTINCT FROM v_ref
       AND v_he.motivo_origem IS NOT DISTINCT FROM v_motivo THEN
      v_iguais := v_iguais + 1;
      CONTINUE;
    END IF;

    v_acima := public.hr_horas_extra_acima(p_organization_id, v_r.pessoa_id, v_r.data, v_calc.minutos,
                                           v_he.id, v_cfg.dia_min, v_ctx.limite_min);
    UPDATE public.pessoas_horas_extra x
       SET hora_inicio     = v_calc.hora_inicio,
           hora_fim        = v_calc.hora_fim,
           minutos         = v_calc.minutos,
           nocturno_min    = v_calc.nocturno_min,
           motivo_origem   = v_motivo,
           sem_autorizacao = NOT v_ctx.pode,
           acima_limite    = v_acima,
           realizado_ref   = v_ref
     WHERE x.id = v_he.id
       AND x.organization_id = p_organization_id;
    PERFORM public.hr_horas_extra_evento(p_organization_id, v_r.pessoa_id, v_he.id, 'atualizada', v_anew,
      jsonb_build_object('antes', jsonb_build_object('minutos', v_he.minutos, 'nocturno_min', v_he.nocturno_min,
                                                     'acima_limite', v_he.acima_limite),
                         'depois', jsonb_build_object('minutos', v_calc.minutos, 'nocturno_min', v_calc.nocturno_min,
                                                      'acima_limite', v_acima)));
    v_atual := v_atual + 1;
  END LOOP;

  -- Detetadas de dias que deixaram de ter qualquer realizado em vigor: as
  -- pendentes ficaram obsoletas, as decididas divergem (nenhuma se toca).
  SELECT count(*) FILTER (WHERE x.estado = 'pendente')::integer,
         count(*) FILTER (WHERE x.estado <> 'pendente')::integer
    INTO v_pend, v_dec
    FROM public.pessoas_horas_extra x
    JOIN public.pessoas p ON p.id = x.pessoa_id AND p.organization_id = x.organization_id
   WHERE x.organization_id = p_organization_id
     AND x.tipo_registo = 'detetada'
     AND x.data BETWEEN p_data_de AND v_ate
     AND p.deleted_at IS NULL
     AND (p_pessoa_id IS NULL OR x.pessoa_id = p_pessoa_id)
     AND NOT EXISTS (SELECT 1 FROM public.v_hr_horario_realizado_em_vigor h
                      WHERE h.organization_id = x.organization_id
                        AND h.pessoa_id = x.pessoa_id
                        AND h.data = x.data);
  v_obsol  := v_obsol + v_pend;
  v_diverg := v_diverg + v_dec;

  PERFORM public.hr_horas_extra_evento(p_organization_id, NULL, NULL, 'detecao_executada', v_anew,
    jsonb_build_object('data_de', p_data_de, 'data_ate', v_ate, 'uma_pessoa', p_pessoa_id IS NOT NULL,
                       'criadas', v_criadas, 'atualizadas', v_atual, 'saltadas_sem_horario', v_saltadas));

  RETURN jsonb_build_object(
    'criadas', v_criadas,
    'atualizadas', v_atual,
    'inalteradas', v_iguais,
    'ja_decididas', v_decid,
    'divergentes', v_diverg,
    'saltadas_sem_horario', v_saltadas,
    'abaixo_minimo', v_abaixo,
    'obsoletas', v_obsol,
    'data_de', p_data_de,
    'data_ate', v_ate);
END;
$$;

-- 5.2 Listar (fila do RH, ou as suas).
CREATE FUNCTION public.rpc_hr_horas_extra_listar(
  p_organization_id uuid, p_estado text DEFAULT NULL, p_pessoa_id uuid DEFAULT NULL,
  p_data_de date DEFAULT NULL, p_data_ate date DEFAULT NULL,
  p_limite integer DEFAULT 200, p_offset integer DEFAULT 0)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  c_limite_max constant integer := 500;
  v_pessoa uuid;
  v_tudo   boolean;
  v_limite integer := least(greatest(coalesce(p_limite, 200), 1), c_limite_max);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_total  integer;
  v_r      jsonb;
BEGIN
  v_pessoa := public.hr_horas_extra_ambito_leitura(p_organization_id, p_pessoa_id);
  -- Quem decidiu so vai a quem ve a organizacao toda.
  v_tudo := public.has_anew_permission_in_org(auth.uid(), 'hr.assiduidade.view', p_organization_id);

  IF p_estado IS NOT NULL AND p_estado NOT IN ('pendente', 'confirmada', 'rejeitada') THEN
    RAISE EXCEPTION 'pedido_invalido' USING ERRCODE = 'HRA10';
  END IF;
  IF (p_data_de IS NOT NULL AND NOT isfinite(p_data_de))
     OR (p_data_ate IS NOT NULL AND NOT isfinite(p_data_ate))
     OR (p_data_de IS NOT NULL AND p_data_ate IS NOT NULL AND p_data_ate < p_data_de) THEN
    RAISE EXCEPTION 'data_invalida' USING ERRCODE = 'HRA78';
  END IF;

  SELECT count(*)::integer INTO v_total
    FROM public.pessoas_horas_extra x
    JOIN public.pessoas p ON p.id = x.pessoa_id AND p.organization_id = x.organization_id
   WHERE x.organization_id = p_organization_id
     AND p.deleted_at IS NULL
     AND (v_pessoa IS NULL OR x.pessoa_id = v_pessoa)
     AND (p_estado IS NULL OR x.estado = p_estado)
     AND (p_data_de IS NULL OR x.data >= p_data_de)
     AND (p_data_ate IS NULL OR x.data <= p_data_ate);

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'id', q.id, 'pessoa_id', q.pessoa_id, 'pessoa_nome', q.nome_completo,
           'data', q.data, 'hora_inicio', q.hora_inicio, 'hora_fim', q.hora_fim,
           'minutos', q.minutos, 'nocturno_min', q.nocturno_min, 'origem', q.origem,
           'tipo_registo', q.tipo_registo, 'motivo_origem', q.motivo_origem, 'estado', q.estado,
           'sem_autorizacao', q.sem_autorizacao, 'acima_limite', q.acima_limite,
           'motivo_decisao', q.motivo_decisao,
           'decidido_por', CASE WHEN v_tudo THEN q.decidido_por END,
           'decidido_em', q.decidido_em,
           'created_at', q.created_at, 'updated_at', q.updated_at)
         ORDER BY q.data DESC, q.created_at DESC, q.id DESC), '[]'::jsonb)
    INTO v_r
    FROM (
      SELECT x.id, x.pessoa_id, p.nome_completo, x.data, x.hora_inicio, x.hora_fim, x.minutos, x.nocturno_min,
             x.origem, x.tipo_registo, x.motivo_origem, x.estado, x.sem_autorizacao, x.acima_limite,
             x.motivo_decisao, x.decidido_por, x.decidido_em, x.created_at, x.updated_at
        FROM public.pessoas_horas_extra x
        JOIN public.pessoas p ON p.id = x.pessoa_id AND p.organization_id = x.organization_id
       WHERE x.organization_id = p_organization_id
         AND p.deleted_at IS NULL
         AND (v_pessoa IS NULL OR x.pessoa_id = v_pessoa)
         AND (p_estado IS NULL OR x.estado = p_estado)
         AND (p_data_de IS NULL OR x.data >= p_data_de)
         AND (p_data_ate IS NULL OR x.data <= p_data_ate)
       ORDER BY x.data DESC, x.created_at DESC, x.id DESC
       LIMIT v_limite OFFSET v_offset
    ) q;

  RETURN jsonb_build_object('linhas', v_r, 'total', v_total);
END;
$$;

-- 5.3 Decidir (confirmar ou rejeitar) uma pendente.
CREATE FUNCTION public.rpc_hr_hora_extra_decidir(
  p_id uuid, p_organization_id uuid, p_decisao text, p_motivo text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_anew   uuid;
  v_pessoa uuid;
  v_he     public.pessoas_horas_extra;
  v_cfg    record;
  v_ctx    record;
  v_acima  boolean;
  v_motivo text;
  v_estado text;
BEGIN
  -- Balde proprio das decisoes (1000/h), separado das outras escritas (240/h).
  v_anew := public.hr_horas_extra_exigir_escrita(p_organization_id, true);

  IF p_decisao IS NULL OR p_decisao NOT IN ('confirmar', 'rejeitar') THEN
    RAISE EXCEPTION 'pedido_invalido' USING ERRCODE = 'HRA10';
  END IF;
  v_motivo := public.hr_horas_extra_texto(p_motivo, 500);

  -- A mesma resposta para inexistente, de outra organizacao ou de pessoa apagada.
  SELECT x.pessoa_id INTO v_pessoa
    FROM public.pessoas_horas_extra x
    JOIN public.pessoas p ON p.id = x.pessoa_id AND p.organization_id = x.organization_id
   WHERE x.id = p_id AND x.organization_id = p_organization_id AND p.deleted_at IS NULL;
  IF v_pessoa IS NULL THEN
    RAISE EXCEPTION 'nao_encontrado' USING ERRCODE = 'HRA31';
  END IF;

  -- Ninguem decide as suas proprias horas extra (qualquer ligacao, mesmo revogada).
  IF public.hr_horas_extra_e_propria(p_organization_id, v_pessoa) THEN
    PERFORM public.hr_horas_extra_recusar(p_organization_id, 'decisao_propria', 'HRA75');
  END IF;

  PERFORM public.hr_horas_extra_trancar_pessoa(v_pessoa);
  SELECT * INTO v_he
    FROM public.pessoas_horas_extra x
   WHERE x.id = p_id AND x.organization_id = p_organization_id
   FOR UPDATE;

  IF v_he.estado <> 'pendente' THEN
    RAISE EXCEPTION 'ja_decidida' USING ERRCODE = 'HRA77';
  END IF;

  SELECT * INTO v_cfg FROM public.hr_horas_extra_config_efetiva(p_organization_id);
  SELECT * INTO v_ctx FROM public.hr_horas_extra_pessoa_ctx(p_organization_id, v_pessoa, v_cfg.ano_min);
  v_acima := public.hr_horas_extra_acima(p_organization_id, v_pessoa, v_he.data, v_he.minutos,
                                         v_he.id, v_cfg.dia_min, v_ctx.limite_min);

  -- Motivo: obrigatorio ao rejeitar, acima do limite ou sem autorizacao; e um
  -- motivo opcional com menos de 3 caracteres tambem se recusa.
  IF ((p_decisao = 'rejeitar' OR v_acima OR v_he.sem_autorizacao) AND v_motivo IS NULL)
     OR (v_motivo IS NOT NULL AND length(v_motivo) < 3) THEN
    RAISE EXCEPTION 'motivo_obrigatorio' USING ERRCODE = 'HRA76';
  END IF;

  v_estado := CASE p_decisao WHEN 'confirmar' THEN 'confirmada' ELSE 'rejeitada' END;

  UPDATE public.pessoas_horas_extra x
     SET estado         = v_estado,
         acima_limite   = v_acima,
         motivo_decisao = v_motivo,
         decidido_por   = v_anew,
         decidido_em    = now()
   WHERE x.id = v_he.id
     AND x.organization_id = p_organization_id;

  PERFORM public.hr_horas_extra_evento(p_organization_id, v_pessoa, v_he.id, v_estado, v_anew,
    jsonb_build_object('minutos', v_he.minutos, 'acima_limite', v_acima,
                       'sem_autorizacao', v_he.sem_autorizacao, 'com_motivo', v_motivo IS NOT NULL));

  RETURN jsonb_build_object('id', v_he.id, 'estado', v_estado, 'acima_limite', v_acima,
                            'sem_autorizacao', v_he.sem_autorizacao);
END;
$$;

-- 5.4 Registar a mao um tempo a mais.
CREATE FUNCTION public.rpc_hr_hora_extra_registar(
  p_organization_id uuid, p_pessoa_id uuid, p_data date, p_hora_inicio time, p_hora_fim time, p_motivo text)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_anew   uuid;
  v_motivo text;
  v_cfg    record;
  v_ctx    record;
  v_dia    record;
  v_calc   record;
  v_origem text;
  v_acima  boolean;
  v_id     uuid;
BEGIN
  v_anew := public.hr_horas_extra_exigir_escrita(p_organization_id, false);

  -- Ate hoje e no maximo 12 meses para tras.
  IF NOT public.hr_horas_extra_data_valida(p_data)
     OR p_data < (public.hr_horas_extra_hoje() - interval '12 months')::date THEN
    RAISE EXCEPTION 'data_invalida' USING ERRCODE = 'HRA78';
  END IF;
  IF p_hora_inicio IS NULL OR p_hora_fim IS NULL OR p_hora_fim <= p_hora_inicio THEN
    RAISE EXCEPTION 'horas_invalidas' USING ERRCODE = 'HRA79';
  END IF;
  v_motivo := public.hr_horas_extra_texto(p_motivo, 200);
  IF v_motivo IS NULL OR length(v_motivo) < 3 THEN
    RAISE EXCEPTION 'motivo_obrigatorio' USING ERRCODE = 'HRA76';
  END IF;

  PERFORM 1 FROM public.pessoas p
   WHERE p.id = p_pessoa_id AND p.organization_id = p_organization_id AND p.deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'nao_encontrado' USING ERRCODE = 'HRA31';
  END IF;

  PERFORM public.hr_horas_extra_trancar_pessoa(p_pessoa_id);

  SELECT * INTO v_cfg FROM public.hr_horas_extra_config_efetiva(p_organization_id);
  SELECT * INTO v_calc
    FROM public.hr_horas_extra_calcular(
           p_data, tsmultirange(tsrange(p_data + p_hora_inicio, p_data + p_hora_fim, '[)')), '{}'::tsmultirange);
  IF v_calc.minutos <= 0 OR v_calc.minutos < v_cfg.minimo_min THEN
    RAISE EXCEPTION 'abaixo_minimo' USING ERRCODE = 'HRA80';
  END IF;

  -- O mesmo tempo nunca e hora extra duas vezes: recusa-se se o dia ja tem
  -- outra hora extra nao rejeitada de tramo DESCONHECIDO (detetada com varios
  -- tramos: nao se sabe se cobre este) ou com tramo que se sobrepoe.
  IF EXISTS (SELECT 1 FROM public.pessoas_horas_extra x
              WHERE x.organization_id = p_organization_id
                AND x.pessoa_id = p_pessoa_id
                AND x.data = p_data
                AND x.estado <> 'rejeitada'
                AND (x.hora_inicio IS NULL
                     OR (x.hora_inicio < p_hora_fim AND p_hora_inicio < x.hora_fim))) THEN
    RAISE EXCEPTION 'sobreposicao' USING ERRCODE = 'HRA83';
  END IF;

  SELECT * INTO v_ctx FROM public.hr_horas_extra_pessoa_ctx(p_organization_id, p_pessoa_id, v_cfg.ano_min);
  SELECT * INTO v_dia FROM public.hr_horas_extra_dia(p_organization_id, p_pessoa_id, p_data);
  v_origem := CASE WHEN v_ctx.feriado_conta
                        AND p_data = ANY (public.hr_horas_extra_feriados(p_organization_id, p_data, p_data))
                     THEN 'feriado'
                   WHEN v_dia.descanso THEN 'descanso'
                   ELSE 'diaria' END;

  v_acima := public.hr_horas_extra_acima(p_organization_id, p_pessoa_id, p_data, v_calc.minutos,
                                         NULL, v_cfg.dia_min, v_ctx.limite_min);

  INSERT INTO public.pessoas_horas_extra
    (organization_id, pessoa_id, data, hora_inicio, hora_fim, minutos, nocturno_min, origem,
     tipo_registo, motivo_origem, estado, sem_autorizacao, acima_limite, created_by)
  VALUES
    (p_organization_id, p_pessoa_id, p_data, p_hora_inicio, p_hora_fim, v_calc.minutos, v_calc.nocturno_min,
     v_origem, 'registada', v_motivo, 'pendente', NOT v_ctx.pode, v_acima, v_anew)
  RETURNING id INTO v_id;

  PERFORM public.hr_horas_extra_evento(p_organization_id, p_pessoa_id, v_id, 'registada', v_anew,
    jsonb_build_object('minutos', v_calc.minutos, 'nocturno_min', v_calc.nocturno_min, 'origem', v_origem,
                       'acima_limite', v_acima, 'sem_autorizacao', NOT v_ctx.pode));

  RETURN jsonb_build_object('id', v_id, 'minutos', v_calc.minutos, 'nocturno_min', v_calc.nocturno_min,
                            'origem', v_origem, 'acima_limite', v_acima, 'sem_autorizacao', NOT v_ctx.pode);
END;
$$;

-- 5.5 Saldo de uma pessoa num ano.
CREATE FUNCTION public.rpc_hr_horas_extra_saldo(p_organization_id uuid, p_pessoa_id uuid, p_ano integer DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_pessoa uuid;
  v_ano    integer;
  v_cfg    record;
  v_ctx    record;
  v_conf   integer;
  v_pend   integer;
  v_total  integer;
BEGIN
  v_pessoa := public.hr_horas_extra_ambito_leitura(p_organization_id, p_pessoa_id);
  v_ano := coalesce(p_ano, extract(year FROM public.hr_horas_extra_hoje())::integer);
  IF v_pessoa IS NULL OR v_ano < 2000 OR v_ano > 2100 THEN
    RAISE EXCEPTION 'pedido_invalido' USING ERRCODE = 'HRA10';
  END IF;
  PERFORM 1 FROM public.pessoas p
   WHERE p.id = v_pessoa AND p.organization_id = p_organization_id AND p.deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'nao_encontrado' USING ERRCODE = 'HRA31';
  END IF;

  SELECT * INTO v_cfg FROM public.hr_horas_extra_config_efetiva(p_organization_id);
  SELECT * INTO v_ctx FROM public.hr_horas_extra_pessoa_ctx(p_organization_id, v_pessoa, v_cfg.ano_min);

  SELECT coalesce(sum(x.minutos) FILTER (WHERE x.estado = 'confirmada'), 0)::integer,
         coalesce(sum(x.minutos) FILTER (WHERE x.estado = 'pendente'), 0)::integer
    INTO v_conf, v_pend
    FROM public.pessoas_horas_extra x
   WHERE x.organization_id = p_organization_id
     AND x.pessoa_id = v_pessoa
     AND x.data >= make_date(v_ano, 1, 1)
     AND x.data <  make_date(v_ano + 1, 1, 1);
  v_total := v_conf + v_pend;

  RETURN jsonb_build_object(
    'pessoa_id', v_pessoa,
    'ano', v_ano,
    'total_ano_min', v_total,
    'confirmadas_min', v_conf,
    'pendentes_min', v_pend,
    'limite_ano_min', v_ctx.limite_min,
    'limite_ano_origem', v_ctx.limite_origem,
    'limite_dia_min', v_cfg.dia_min,
    'alerta_pct', v_cfg.alerta_pct,
    'em_alerta', (v_total::bigint * 100) >= (v_ctx.limite_min::bigint * v_cfg.alerta_pct),
    'acima_limite', v_total > v_ctx.limite_min,
    'restante_min', greatest(0, v_ctx.limite_min - v_total));
END;
$$;

-- 5.6 Ler os limites da organizacao.
CREATE FUNCTION public.rpc_hr_horas_extra_config_ler(p_organization_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_cfg record;
BEGIN
  IF v_uid IS NULL OR p_organization_id IS NULL
     OR NOT public.has_anew_permission_in_org(v_uid, 'hr.assiduidade.view', p_organization_id) THEN
    PERFORM public.hr_horas_extra_recusar(p_organization_id, 'insufficient_privilege', '42501');
  END IF;
  SELECT * INTO v_cfg FROM public.hr_horas_extra_config_efetiva(p_organization_id);
  RETURN jsonb_build_object('dia_min', v_cfg.dia_min, 'ano_min', v_cfg.ano_min, 'alerta_pct', v_cfg.alerta_pct,
                            'minimo_min', v_cfg.minimo_min, 'omissao', v_cfg.omissao);
END;
$$;

-- 5.7 Guardar os limites (os quatro de uma vez), com antes e depois no evento.
CREATE FUNCTION public.rpc_hr_horas_extra_config_guardar(
  p_organization_id uuid, p_dia_min integer, p_ano_min integer, p_alerta_pct integer, p_minimo_min integer)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_anew  uuid;
  v_antes record;
BEGIN
  v_anew := public.hr_horas_extra_exigir_escrita(p_organization_id, false);

  IF p_dia_min IS NULL OR p_dia_min < 1 OR p_dia_min > 1440
     OR p_ano_min IS NULL OR p_ano_min < 1 OR p_ano_min > 100000
     OR p_alerta_pct IS NULL OR p_alerta_pct < 1 OR p_alerta_pct > 100
     OR p_minimo_min IS NULL OR p_minimo_min < 1 OR p_minimo_min > 240 THEN
    RAISE EXCEPTION 'config_invalida' USING ERRCODE = 'HRA81';
  END IF;

  PERFORM 1 FROM public.hr_horas_extra_config c WHERE c.organization_id = p_organization_id FOR UPDATE;
  SELECT * INTO v_antes FROM public.hr_horas_extra_config_efetiva(p_organization_id);

  INSERT INTO public.hr_horas_extra_config AS c
    (organization_id, dia_min, ano_min, alerta_pct, minimo_min, updated_by)
  VALUES
    (p_organization_id, p_dia_min, p_ano_min, p_alerta_pct, p_minimo_min, v_anew)
  ON CONFLICT (organization_id) DO UPDATE
    SET dia_min    = EXCLUDED.dia_min,
        ano_min    = EXCLUDED.ano_min,
        alerta_pct = EXCLUDED.alerta_pct,
        minimo_min = EXCLUDED.minimo_min,
        updated_by = EXCLUDED.updated_by;

  PERFORM public.hr_horas_extra_evento(p_organization_id, NULL, NULL, 'config_alterada', v_anew,
    jsonb_build_object(
      'antes', jsonb_build_object('dia_min', v_antes.dia_min, 'ano_min', v_antes.ano_min,
                                  'alerta_pct', v_antes.alerta_pct, 'minimo_min', v_antes.minimo_min,
                                  'omissao', v_antes.omissao),
      'depois', jsonb_build_object('dia_min', p_dia_min, 'ano_min', p_ano_min,
                                   'alerta_pct', p_alerta_pct, 'minimo_min', p_minimo_min)));

  RETURN jsonb_build_object('dia_min', p_dia_min, 'ano_min', p_ano_min, 'alerta_pct', p_alerta_pct,
                            'minimo_min', p_minimo_min, 'omissao', false);
END;
$$;

-- 5.8 Ligar ou desligar "pode fazer horas extra" de uma pessoa (nunca a propria).
CREATE FUNCTION public.rpc_hr_pessoa_horas_extra_autorizar(p_pessoa_id uuid, p_organization_id uuid, p_pode boolean)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_anew  uuid;
  v_antes boolean;
BEGIN
  v_anew := public.hr_horas_extra_exigir_escrita(p_organization_id, false);

  IF p_pode IS NULL THEN
    RAISE EXCEPTION 'pedido_invalido' USING ERRCODE = 'HRA10';
  END IF;

  PERFORM 1 FROM public.pessoas p
   WHERE p.id = p_pessoa_id AND p.organization_id = p_organization_id AND p.deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'nao_encontrado' USING ERRCODE = 'HRA31';
  END IF;

  IF public.hr_horas_extra_e_propria(p_organization_id, p_pessoa_id) THEN
    PERFORM public.hr_horas_extra_recusar(p_organization_id, 'decisao_propria', 'HRA75');
  END IF;

  SELECT a.pode INTO v_antes
    FROM public.pessoas_horas_extra_autorizacao a
   WHERE a.pessoa_id = p_pessoa_id AND a.organization_id = p_organization_id
   FOR UPDATE;

  IF v_antes IS NOT DISTINCT FROM p_pode THEN
    -- Nada muda: idempotente, sem evento.
    RETURN jsonb_build_object('pessoa_id', p_pessoa_id, 'pode', p_pode, 'alterada', false);
  END IF;

  INSERT INTO public.pessoas_horas_extra_autorizacao AS a (pessoa_id, organization_id, pode, updated_by)
  VALUES (p_pessoa_id, p_organization_id, p_pode, v_anew)
  ON CONFLICT (pessoa_id) DO UPDATE
    SET pode = EXCLUDED.pode,
        updated_by = EXCLUDED.updated_by;

  PERFORM public.hr_horas_extra_evento(p_organization_id, p_pessoa_id, NULL, 'autorizacao_alterada', v_anew,
    jsonb_build_object('antes', coalesce(v_antes, false), 'depois', p_pode));

  RETURN jsonb_build_object('pessoa_id', p_pessoa_id, 'pode', p_pode, 'alterada', true);
END;
$$;

-- 5.9 Listar as autorizacoes da organizacao.
CREATE FUNCTION public.rpc_hr_horas_extra_autorizacoes_listar(p_organization_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_r   jsonb;
BEGIN
  IF v_uid IS NULL OR p_organization_id IS NULL
     OR NOT public.has_anew_permission_in_org(v_uid, 'hr.assiduidade.view', p_organization_id) THEN
    PERFORM public.hr_horas_extra_recusar(p_organization_id, 'insufficient_privilege', '42501');
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object('pessoa_id', a.pessoa_id, 'pode', a.pode, 'updated_at', a.updated_at)
                            ORDER BY a.pessoa_id), '[]'::jsonb)
    INTO v_r
    FROM public.pessoas_horas_extra_autorizacao a
    JOIN public.pessoas p ON p.id = a.pessoa_id AND p.organization_id = a.organization_id
   WHERE a.organization_id = p_organization_id
     AND p.deleted_at IS NULL;
  RETURN v_r;
END;
$$;

-- ==============================================================================
-- 6. EXECUTE explicito (o Supabase da EXECUTE por omissao a anon e authenticated)
-- ==============================================================================
REVOKE ALL ON FUNCTION public.hr_horas_extra_guarda() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.hr_horas_extra_eventos_imutavel() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.hr_horas_extra_config_omissao() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.hr_horas_extra_hoje() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.hr_horas_extra_recusar(uuid, text, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.hr_horas_extra_config_efetiva(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.hr_horas_extra_vinculo_em_vigor(text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.hr_horas_extra_pessoa_ctx(uuid, uuid, integer) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.hr_horas_extra_feriados(uuid, date, date) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.hr_horas_extra_data_valida(date) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.hr_horas_extra_fim(time) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.hr_horas_extra_dia(uuid, uuid, date) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.hr_horas_extra_calcular(date, tsmultirange, tsmultirange) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.hr_horas_extra_acima(uuid, uuid, date, integer, uuid, integer, integer) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.hr_horas_extra_e_propria(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.hr_horas_extra_ambito_leitura(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.hr_horas_extra_exigir_escrita(uuid, boolean) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.hr_horas_extra_trancar_pessoa(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.hr_horas_extra_evento(uuid, uuid, uuid, text, uuid, jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.hr_horas_extra_texto(text, integer) FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.rpc_hr_horas_extra_detetar(uuid, date, date, uuid) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.rpc_hr_horas_extra_listar(uuid, text, uuid, date, date, integer, integer) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.rpc_hr_hora_extra_decidir(uuid, uuid, text, text) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.rpc_hr_hora_extra_registar(uuid, uuid, date, time, time, text) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.rpc_hr_horas_extra_saldo(uuid, uuid, integer) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.rpc_hr_horas_extra_config_ler(uuid) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.rpc_hr_horas_extra_config_guardar(uuid, integer, integer, integer, integer) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.rpc_hr_pessoa_horas_extra_autorizar(uuid, uuid, boolean) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.rpc_hr_horas_extra_autorizacoes_listar(uuid) FROM PUBLIC, anon, service_role;

GRANT EXECUTE ON FUNCTION public.rpc_hr_horas_extra_detetar(uuid, date, date, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_horas_extra_listar(uuid, text, uuid, date, date, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_hora_extra_decidir(uuid, uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_hora_extra_registar(uuid, uuid, date, time, time, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_horas_extra_saldo(uuid, uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_horas_extra_config_ler(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_horas_extra_config_guardar(uuid, integer, integer, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_pessoa_horas_extra_autorizar(uuid, uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_horas_extra_autorizacoes_listar(uuid) TO authenticated;

COMMENT ON FUNCTION public.hr_horas_extra_config_omissao() IS
'INTERNA. As omissoes dos limites (120, 9000, 80, 15); tem de coincidir com os DEFAULT de hr_horas_extra_config (conferido na migration). Desde 20270104800000.';
COMMENT ON FUNCTION public.hr_horas_extra_hoje() IS
'INTERNA. A data de hoje em Europe/Lisbon, independente do fuso da sessao. Desde 20270104800000.';
COMMENT ON FUNCTION public.hr_horas_extra_recusar(uuid, text, text) IS
'INTERNA. RAISE WARNING com auth.uid(), organizacao e codigo (sem dados pessoais) e depois o erro; no maximo um aviso por chamada, porque o erro acaba a chamada. Usada nas recusas de seguranca (42501, HRA75, HRA41). O aviso e para o registo do servidor e NAO deve ser exposto ao cliente: o ecra mostra so o codigo do erro, nunca as mensagens WARNING/NOTICE que o PostgREST ou o driver possam passar. Desde 20270104800000.';
COMMENT ON FUNCTION public.hr_horas_extra_vinculo_em_vigor(text) IS
'INTERNA. Vinculo em vigor = estado activo ou suspenso (o par de 20261130180000). Desde 20270104800000.';
COMMENT ON FUNCTION public.hr_horas_extra_pessoa_ctx(uuid, uuid, integer) IS
'INTERNA. Lido uma vez por pessoa: limite anual (horas_anuais_maximas x 60 do vinculo em vigor mais recente, senao a omissao), origem do limite, se o feriado conta (politica_feriados <> trabalho_habitual) e se pode fazer horas extra. Usa SEMPRE o vinculo em vigor HOJE, mesmo para dias retroactivos: uma detecao ou registo de um dia passado aplica a politica de feriados e o limite anual do vinculo actual, nao o que vigorava nessa data. Desde 20270104800000.';
COMMENT ON FUNCTION public.hr_horas_extra_feriados(uuid, date, date) IS
'INTERNA. Os dias do intervalo que sao feriado na organizacao (schedule_holidays da organizacao; fixos por data, recorrentes por MM-DD). Desde 20270104800000.';
COMMENT ON FUNCTION public.hr_horas_extra_dia(uuid, uuid, date) IS
'INTERNA. O dia da pessoa: tem_horario (excepcao nessa data ou regra recorrente valida de qualquer dia da semana), descanso (com horario mas sem janela) e as janelas planeadas (mesma escolha de hr_assiduidade_desvios). Ignora as linhas do planeado que tem um corrector vivo (corrige_horario_id): so conta a versao em vigor. Desde 20270104800000.';
COMMENT ON FUNCTION public.hr_horas_extra_calcular(date, tsmultirange, tsmultirange) IS
'INTERNA, pura. Tempo realizado fora do que se desconta (janelas e registadas), por uniao; parte nocturna 22:00-07:00; tramo unico (fim 24:00 a meia-noite) senao NULL; tramos em texto. Minutos arredondados ao mais proximo. Desde 20270104800000.';
COMMENT ON FUNCTION public.hr_horas_extra_e_propria(uuid, uuid) IS
'INTERNA. true se este auth.uid() tem ou teve (qualquer estado) uma ligacao em pessoas_contas a essa pessoa nesta organizacao. Desde 20270104800000.';
COMMENT ON FUNCTION public.hr_horas_extra_exigir_escrita(uuid, boolean) IS
'INTERNA. Sessao, hr.assiduidade.gerir e utilizador da aplicacao (42501), organizacao empregadora (HRA33) e limite por actor em fila (HRA41): p_decisao = true conta so confirmar/rejeitar, ate 1000 por hora; p_decisao = false conta o resto (registar, detetar, configurar, autorizar), ate 240 por hora, sem as decisoes nem as linhas detetada/atualizada. Devolve anew_users.id. Desde 20270104800000.';
COMMENT ON FUNCTION public.hr_horas_extra_ambito_leitura(uuid, uuid) IS
'INTERNA. hr.assiduidade.view: devolve p_pessoa_id (NULL = todas). hr.assiduidade.view.own: devolve a propria pessoa (hr_pessoa_do_utilizador); pedir outra da 42501. Desde 20270104800000.';
COMMENT ON FUNCTION public.hr_horas_extra_texto(text, integer) IS
'INTERNA. Texto livre aparado nas pontas (espacos normais e Unicode: NBSP, U+2000-200A, U+202F, U+205F, U+3000); NULL se vazio; comprimento antes da regex; mais de p_max ou com controlo/invisiveis no meio (controlo, U+007F-00A0, U+00AD, U+061C, U+180E, U+2000-200F, U+2028-202F, U+205F-2069, U+2800, U+3164, U+FE00-FE0F, U+FEFF, U+FFA0, U+E0000-E007F) da HRA82. Desde 20270104800000.';

COMMENT ON FUNCTION public.rpc_hr_horas_extra_detetar(uuid, date, date, uuid) IS
'RH (authenticated). Deteta horas extra entre p_data_de e p_data_ate (cortado a hoje em Lisboa) a partir de v_hr_horario_realizado_em_vigor (inclui horas ainda por validar -- decisao de produto) contra o planeado do dia, descontando as registadas a mao nao rejeitadas e ignorando o planeado corrigido. Tectos (HRA84): organizacao toda ate 31 dias, uma pessoa ate 62, no maximo 300 pessoas com horas no intervalo e 5000 pessoas-dia. A defesa contra chamadas pesadas sao estes tectos (nao ha statement_timeout proprio); acima deles o ecra chama pessoa a pessoa ou semana a semana. Uma corrida de cada vez por organizacao (HRA85); 20 corridas por hora por actor e organizacao (HRA41). Cria pendentes (diaria, feriado ou descanso), recalcula as pendentes ja detetadas, nunca mexe nas decididas nem apaga nada; nao cria pendente num dia que ja tem detetada decidida de outra origem (conta em divergentes). Devolve {criadas, atualizadas, inalteradas, ja_decididas, divergentes, saltadas_sem_horario, abaixo_minimo, obsoletas, data_de, data_ate}. Exige hr.assiduidade.gerir (42501), organizacao empregadora (HRA33). Recusas: data_invalida HRA78, nao_encontrado HRA31, limite_excedido HRA41. Desde 20270104800000.';
COMMENT ON FUNCTION public.rpc_hr_horas_extra_listar(uuid, text, uuid, date, date, integer, integer) IS
'RH ou a propria pessoa (authenticated). Devolve {linhas, total}: horas extra com pessoa_nome, filtradas por estado (pendente|confirmada|rejeitada), pessoa e datas; ordem data desc, created_at desc, id desc; p_limite 200 (1..500), p_offset >= 0. hr.assiduidade.view ve todas (e decidido_por); hr.assiduidade.view.own so as suas, sem decidido_por (pedir outra pessoa = 42501). Recusas: pedido_invalido HRA10 (estado), data_invalida HRA78. Desde 20270104800000.';
COMMENT ON FUNCTION public.rpc_hr_hora_extra_decidir(uuid, uuid, text, text) IS
'RH (authenticated). Confirma ou rejeita (p_decisao confirmar|rejeitar) uma pendente, uma so vez. Recalcula acima_limite no momento (todas as linhas nao rejeitadas do dia e do ano -- decisao de produto). Motivo (3..500, sem controlo nem invisiveis) obrigatorio ao rejeitar e ao confirmar acima do limite ou sem autorizacao. Devolve {id, estado, acima_limite, sem_autorizacao}. Exige hr.assiduidade.gerir (42501), organizacao empregadora (HRA33). Recusas: pedido_invalido HRA10, nao_encontrado HRA31 (tambem pessoa apagada), decisao_propria HRA75 (qualquer ligacao da conta a pessoa, mesmo revogada), motivo_obrigatorio HRA76, ja_decidida HRA77, motivo_invalido HRA82, limite_excedido HRA41. Desde 20270104800000.';
COMMENT ON FUNCTION public.rpc_hr_hora_extra_registar(uuid, uuid, date, time, time, text) IS
'RH (authenticated). Regista a mao um tempo a mais (pendente, tipo registada) de p_hora_inicio a p_hora_fim (24:00 aceite) no dia p_data (ate hoje e no maximo 12 meses para tras; sem atravessar a meia-noite). Calcula minutos e nocturno; origem pela base (feriado, descanso ou diaria). Devolve {id, minutos, nocturno_min, origem, acima_limite, sem_autorizacao}. Exige hr.assiduidade.gerir (42501), organizacao empregadora (HRA33). Recusas: data_invalida HRA78, horas_invalidas HRA79, motivo_obrigatorio HRA76 (3..200), motivo_invalido HRA82, nao_encontrado HRA31, abaixo_minimo HRA80, sobreposicao HRA83 (outra hora extra nao rejeitada do dia sobreposta ou de tramo desconhecido), limite_excedido HRA41. Desde 20270104800000.';
COMMENT ON FUNCTION public.rpc_hr_horas_extra_saldo(uuid, uuid, integer) IS
'RH ou a propria pessoa (authenticated). Saldo do ano (omissao: o corrente em Lisboa): {pessoa_id, ano, total_ano_min, confirmadas_min, pendentes_min, limite_ano_min, limite_ano_origem (contrato|organizacao), limite_dia_min, alerta_pct, em_alerta, acima_limite, restante_min}. Rejeitadas nunca contam. Recusas: 42501, pedido_invalido HRA10 (sem pessoa, ano fora de 2000..2100), nao_encontrado HRA31. Desde 20270104800000.';
COMMENT ON FUNCTION public.rpc_hr_horas_extra_config_ler(uuid) IS
'RH (authenticated). {dia_min, ano_min, alerta_pct, minimo_min, omissao}. Exige hr.assiduidade.view (42501). Desde 20270104800000.';
COMMENT ON FUNCTION public.rpc_hr_horas_extra_config_guardar(uuid, integer, integer, integer, integer) IS
'RH (authenticated). Guarda os quatro limites (upsert) e regista o antes e o depois em config_alterada. dia 1..1440, ano 1..100000, alerta 1..100, minimo 1..240 (config_invalida HRA81). Exige hr.assiduidade.gerir (42501), organizacao empregadora (HRA33); limite_excedido HRA41. Nao recalcula horas extra ja criadas. Desde 20270104800000.';
COMMENT ON FUNCTION public.rpc_hr_pessoa_horas_extra_autorizar(uuid, uuid, boolean) IS
'RH (authenticated). Liga ou desliga "pode fazer horas extra"; idempotente (alterada=false se nao muda). Nunca a propria pessoa (HRA75). Devolve {pessoa_id, pode, alterada}. Exige hr.assiduidade.gerir (42501), organizacao empregadora (HRA33). Recusas: pedido_invalido HRA10 (p_pode nulo), nao_encontrado HRA31, decisao_propria HRA75, limite_excedido HRA41. Desde 20270104800000.';
COMMENT ON FUNCTION public.rpc_hr_horas_extra_autorizacoes_listar(uuid) IS
'RH (authenticated). [{pessoa_id, pode, updated_at}] das pessoas nao apagadas com linha (sem linha = nao pode). Exige hr.assiduidade.view (42501). Desde 20270104800000.';

-- ==============================================================================
-- 7. Conferir
-- ==============================================================================
DO $conferir$
DECLARE
  c_classe constant text := '[[:cntrl:]\U0000007F-\U000000A0\U000000AD\U0000061C\U0000180E\U00002000-\U0000200F\U00002028-\U0000202F\U0000205F-\U00002069\U00002800\U00003164\U0000FE00-\U0000FE0F\U0000FEFF\U0000FFA0\U000E0000-\U000E007F]';
  v_tabs text[] := ARRAY['public.hr_horas_extra_config', 'public.pessoas_horas_extra_autorizacao',
                         'public.pessoas_horas_extra', 'public.pessoas_horas_extra_eventos'];
  v_rpcs text[] := ARRAY[
    'public.rpc_hr_horas_extra_detetar(uuid, date, date, uuid)',
    'public.rpc_hr_horas_extra_listar(uuid, text, uuid, date, date, integer, integer)',
    'public.rpc_hr_hora_extra_decidir(uuid, uuid, text, text)',
    'public.rpc_hr_hora_extra_registar(uuid, uuid, date, time, time, text)',
    'public.rpc_hr_horas_extra_saldo(uuid, uuid, integer)',
    'public.rpc_hr_horas_extra_config_ler(uuid)',
    'public.rpc_hr_horas_extra_config_guardar(uuid, integer, integer, integer, integer)',
    'public.rpc_hr_pessoa_horas_extra_autorizar(uuid, uuid, boolean)',
    'public.rpc_hr_horas_extra_autorizacoes_listar(uuid)'];
  v_internas text[] := ARRAY[
    'public.hr_horas_extra_guarda()',
    'public.hr_horas_extra_eventos_imutavel()',
    'public.hr_horas_extra_config_omissao()',
    'public.hr_horas_extra_hoje()',
    'public.hr_horas_extra_recusar(uuid, text, text)',
    'public.hr_horas_extra_config_efetiva(uuid)',
    'public.hr_horas_extra_vinculo_em_vigor(text)',
    'public.hr_horas_extra_pessoa_ctx(uuid, uuid, integer)',
    'public.hr_horas_extra_feriados(uuid, date, date)',
    'public.hr_horas_extra_data_valida(date)',
    'public.hr_horas_extra_fim(time)',
    'public.hr_horas_extra_dia(uuid, uuid, date)',
    'public.hr_horas_extra_calcular(date, tsmultirange, tsmultirange)',
    'public.hr_horas_extra_acima(uuid, uuid, date, integer, uuid, integer, integer)',
    'public.hr_horas_extra_e_propria(uuid, uuid)',
    'public.hr_horas_extra_ambito_leitura(uuid, uuid)',
    'public.hr_horas_extra_exigir_escrita(uuid, boolean)',
    'public.hr_horas_extra_trancar_pessoa(uuid)',
    'public.hr_horas_extra_evento(uuid, uuid, uuid, text, uuid, jsonb)',
    'public.hr_horas_extra_texto(text, integer)'];
  v_tab   text;
  v_fn    text;
  v_col   text;
  v_papel text;
  v_priv  text;
  v_oid   oid;
  v_expr  text;
  v_num   integer;
  v_omis  jsonb := public.hr_horas_extra_config_omissao();
  v_c     record;
  v_d     date := DATE '2026-09-07';
  v_lidos text[];
  v_n     integer;
BEGIN
  -- 1. RLS ligada e forcada, sem politicas, sem privilegios de tabela nem coluna.
  FOREACH v_tab IN ARRAY v_tabs LOOP
    v_oid := to_regclass(v_tab);
    IF v_oid IS NULL THEN
      RAISE EXCEPTION 'Conferir: a tabela % nao foi criada.', v_tab;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_class c WHERE c.oid = v_oid AND c.relrowsecurity AND c.relforcerowsecurity) THEN
      RAISE EXCEPTION 'Conferir: % nao tem RLS ligada e forcada.', v_tab;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_policy pol WHERE pol.polrelid = v_oid) THEN
      RAISE EXCEPTION 'Conferir: % tem politicas; o desenho e sem nenhuma.', v_tab;
    END IF;
    FOREACH v_papel IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
      FOREACH v_priv IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] LOOP
        IF has_table_privilege(v_papel, v_oid, v_priv) THEN
          RAISE EXCEPTION 'Conferir: % tem % em %.', v_papel, v_priv, v_tab;
        END IF;
      END LOOP;
      FOR v_col IN
        SELECT a.attname::text FROM pg_attribute a
         WHERE a.attrelid = v_oid AND a.attnum > 0 AND NOT a.attisdropped
      LOOP
        FOREACH v_priv IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'REFERENCES'] LOOP
          IF has_column_privilege(v_papel, v_oid, v_col, v_priv) THEN
            RAISE EXCEPTION 'Conferir: % tem % na coluna %.%.', v_papel, v_priv, v_tab, v_col;
          END IF;
        END LOOP;
      END LOOP;
    END LOOP;
  END LOOP;

  -- 2. EXECUTE: RPCs so para authenticated e SECURITY DEFINER; internas para ninguem.
  FOREACH v_fn IN ARRAY v_rpcs LOOP
    IF to_regprocedure(v_fn) IS NULL THEN
      RAISE EXCEPTION 'Conferir: a RPC % nao existe.', v_fn;
    END IF;
    IF has_function_privilege('anon', v_fn, 'EXECUTE') OR has_function_privilege('service_role', v_fn, 'EXECUTE')
       OR NOT has_function_privilege('authenticated', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'Conferir: % devia ser so de authenticated.', v_fn;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid = to_regprocedure(v_fn)::oid AND p.prosecdef) THEN
      RAISE EXCEPTION 'Conferir: % devia ser SECURITY DEFINER.', v_fn;
    END IF;
  END LOOP;
  FOREACH v_fn IN ARRAY v_internas LOOP
    IF to_regprocedure(v_fn) IS NULL THEN
      RAISE EXCEPTION 'Conferir: a funcao interna % nao existe.', v_fn;
    END IF;
    IF has_function_privilege('anon', v_fn, 'EXECUTE') OR has_function_privilege('authenticated', v_fn, 'EXECUTE')
       OR has_function_privilege('service_role', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'Conferir: a funcao interna % tem EXECUTE para alguem.', v_fn;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid = to_regprocedure(v_fn)::oid AND p.prosecdef) THEN
      RAISE EXCEPTION 'Conferir: a funcao interna % nao devia ser SECURITY DEFINER.', v_fn;
    END IF;
  END LOOP;

  -- 3. Todas as funcoes novas com search_path fixo e vazio.
  FOREACH v_fn IN ARRAY v_rpcs || v_internas LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_proc p
                    WHERE p.oid = to_regprocedure(v_fn)::oid
                      AND coalesce(p.proconfig, ARRAY[]::text[]) @> ARRAY['search_path=""']) THEN
      RAISE EXCEPTION 'Conferir: % nao tem search_path vazio.', v_fn;
    END IF;
  END LOOP;

  -- 3b. O planeado corrigido fica fora nas QUATRO leituras de hr_horas_extra_dia
  --     (nao se pode provar por comportamento sem escrever no planeado de uma
  --     organizacao real: confere-se a definicao).
  SELECT (length(d) - length(replace(d, 'c.corrige_horario_id = hp.id', ''))) / length('c.corrige_horario_id = hp.id')
    INTO v_n
    FROM (SELECT pg_get_functiondef(to_regprocedure('public.hr_horas_extra_dia(uuid, uuid, date)')) AS d) q;
  IF v_n <> 4 THEN
    RAISE EXCEPTION 'Conferir: hr_horas_extra_dia devia excluir o planeado corrigido nas 4 leituras (encontradas %).', v_n;
  END IF;

  -- 4. Os DEFAULT da config sao as omissoes.
  FOREACH v_col IN ARRAY ARRAY['dia_min', 'ano_min', 'alerta_pct', 'minimo_min'] LOOP
    SELECT pg_get_expr(d.adbin, d.adrelid) INTO v_expr
      FROM pg_attrdef d JOIN pg_attribute a ON a.attrelid = d.adrelid AND a.attnum = d.adnum
     WHERE d.adrelid = to_regclass('public.hr_horas_extra_config') AND a.attname::text = v_col;
    IF v_expr IS NULL THEN
      RAISE EXCEPTION 'Conferir: hr_horas_extra_config.% nao tem DEFAULT.', v_col;
    END IF;
    EXECUTE format('SELECT (%s)::integer', v_expr) INTO v_num;
    IF v_num IS DISTINCT FROM (v_omis ->> v_col)::integer THEN
      RAISE EXCEPTION 'Conferir: o DEFAULT de hr_horas_extra_config.% difere da omissao.', v_col;
    END IF;
  END LOOP;

  -- 5. Restricoes de pessoas_horas_extra, o indice unico parcial e as FK compostas.
  SELECT count(*) INTO v_n FROM pg_constraint c
   WHERE c.conrelid = to_regclass('public.pessoas_horas_extra') AND c.contype::text IN ('c', 'f', 'u')
     AND c.conname::text IN ('pessoas_horas_extra_id_pessoa_org_key', 'pessoas_horas_extra_pessoa_fkey',
                             'pessoas_horas_extra_minutos', 'pessoas_horas_extra_nocturno',
                             'pessoas_horas_extra_origem_valida', 'pessoas_horas_extra_tipo_registo_valido',
                             'pessoas_horas_extra_estado_valido', 'pessoas_horas_extra_data_intervalo',
                             'pessoas_horas_extra_tramo_coerente', 'pessoas_horas_extra_registada_com_tramo',
                             'pessoas_horas_extra_motivo_origem', 'pessoas_horas_extra_motivo_decisao_texto',
                             'pessoas_horas_extra_decisao_coerente', 'pessoas_horas_extra_motivo_exigido');
  IF v_n <> 14 THEN
    RAISE EXCEPTION 'Conferir: esperavam-se 14 restricoes em pessoas_horas_extra; ha %.', v_n;
  END IF;
  -- Os dois CHECK de texto e a funcao de texto trazem a mesma classe de invisiveis.
  SELECT count(*) INTO v_n FROM pg_constraint c
   WHERE c.conrelid = to_regclass('public.pessoas_horas_extra')
     AND c.conname::text IN ('pessoas_horas_extra_motivo_origem', 'pessoas_horas_extra_motivo_decisao_texto')
     AND position(c_classe IN pg_get_constraintdef(c.oid)) > 0;
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'Conferir: os CHECK de texto nao trazem a classe de invisiveis (encontrados % de 2).', v_n;
  END IF;
  IF position(c_classe IN pg_get_functiondef(to_regprocedure('public.hr_horas_extra_texto(text, integer)'))) = 0 THEN
    RAISE EXCEPTION 'Conferir: hr_horas_extra_texto nao usa a mesma classe dos CHECK.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint c
                  WHERE c.conrelid = to_regclass('public.pessoas_horas_extra')
                    AND c.conname::text = 'pessoas_horas_extra_motivo_decisao_texto'
                    AND position('regexp_replace' IN pg_get_constraintdef(c.oid)) > 0) THEN
    RAISE EXCEPTION 'Conferir: o CHECK de motivo_decisao nao mede o comprimento sem os invisiveis.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_index i JOIN pg_class ci ON ci.oid = i.indexrelid
                  WHERE i.indrelid = to_regclass('public.pessoas_horas_extra')
                    AND ci.relname::text = 'uq_pessoas_horas_extra_detetada'
                    AND i.indisunique AND i.indpred IS NOT NULL) THEN
    RAISE EXCEPTION 'Conferir: falta o indice unico parcial das detetadas.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint c
                  WHERE c.conrelid = to_regclass('public.pessoas_horas_extra_autorizacao')
                    AND c.conname::text = 'pessoas_horas_extra_autorizacao_pessoa_fkey' AND c.contype::text = 'f')
     OR NOT EXISTS (SELECT 1 FROM pg_constraint c
                  WHERE c.conrelid = to_regclass('public.pessoas_horas_extra_eventos')
                    AND c.conname::text = 'pessoas_horas_extra_eventos_hora_extra_fkey' AND c.contype::text = 'f') THEN
    RAISE EXCEPTION 'Conferir: falta uma FK composta (autorizacao ou eventos).';
  END IF;
  -- decidido_por, created_by e ator_id ficam sem FK (imutabilidade).
  IF EXISTS (SELECT 1 FROM pg_constraint c
              WHERE c.contype::text = 'f'
                AND ((c.conrelid = to_regclass('public.pessoas_horas_extra')
                      AND c.conkey && ARRAY(SELECT a.attnum FROM pg_attribute a
                                             WHERE a.attrelid = to_regclass('public.pessoas_horas_extra')
                                               AND a.attname::text IN ('decidido_por', 'created_by'))::smallint[])
                  OR (c.conrelid = to_regclass('public.pessoas_horas_extra_eventos')
                      AND c.conkey && ARRAY(SELECT a.attnum FROM pg_attribute a
                                             WHERE a.attrelid = to_regclass('public.pessoas_horas_extra_eventos')
                                               AND a.attname::text = 'ator_id')::smallint[]))) THEN
    RAISE EXCEPTION 'Conferir: decidido_por, created_by ou ator_id tem uma FK; deviam ficar soltos.';
  END IF;

  -- 6. Os triggers novos estao activos.
  SELECT array_agg(t.tgname::text ORDER BY t.tgname::text) INTO v_lidos
    FROM pg_trigger t
   WHERE NOT t.tgisinternal AND t.tgenabled::text <> 'D'
     AND t.tgname::text IN ('trg_hr_horas_extra_config_updated_at', 'trg_pessoas_horas_extra_autorizacao_updated_at',
                            'trg_pessoas_horas_extra_updated_at', 'trg_pessoas_horas_extra_guarda',
                            'trg_pessoas_horas_extra_sem_truncate', 'trg_pessoas_horas_extra_eventos_sem_alterar',
                            'trg_pessoas_horas_extra_eventos_sem_truncate');
  IF coalesce(array_length(v_lidos, 1), 0) <> 7 THEN
    RAISE EXCEPTION 'Conferir: esperavam-se 7 triggers activos; ha %.', coalesce(array_to_string(v_lidos, ','), '(nenhum)');
  END IF;

  -- 7. O calculo, por comportamento (funcoes puras; nada se escreve).
  -- 7a. O exemplo do pedido: planeado 09:00-18:00, realizado 09:00-20:00 = 120 min, tramo 18:00-20:00.
  SELECT * INTO v_c FROM public.hr_horas_extra_calcular(v_d,
    tsmultirange(tsrange(v_d + time '09:00', v_d + time '20:00', '[)')),
    tsmultirange(tsrange(v_d + time '09:00', v_d + time '18:00', '[)')));
  IF v_c.minutos IS DISTINCT FROM 120 OR v_c.nocturno_min IS DISTINCT FROM 0
     OR v_c.hora_inicio IS DISTINCT FROM time '18:00' OR v_c.hora_fim IS DISTINCT FROM time '20:00' THEN
    RAISE EXCEPTION 'Conferir: 09-18 planeado e 09-20 realizado devia dar 120 min de 18:00 a 20:00 (deu % min).', v_c.minutos;
  END IF;
  -- 7b. Varios tramos e sobreposicao: realizado 07:00-12:00 e 11:00-18:30 (sobrepostos),
  --     janelas 09-13 e 14-18 -> 07-09 (120) + 13-14 (60) + 18-18:30 (30) = 210, sem tramo unico.
  SELECT * INTO v_c FROM public.hr_horas_extra_calcular(v_d,
    tsmultirange(tsrange(v_d + time '07:00', v_d + time '12:00', '[)'),
                 tsrange(v_d + time '11:00', v_d + time '18:30', '[)')),
    tsmultirange(tsrange(v_d + time '09:00', v_d + time '13:00', '[)'),
                 tsrange(v_d + time '14:00', v_d + time '18:00', '[)')));
  IF v_c.minutos IS DISTINCT FROM 210 OR v_c.nocturno_min IS DISTINCT FROM 0
     OR v_c.hora_inicio IS NOT NULL OR v_c.hora_fim IS NOT NULL
     OR v_c.tramos IS DISTINCT FROM '07:00-09:00, 13:00-14:00, 18:00-18:30' THEN
    RAISE EXCEPTION 'Conferir: o caso de varios tramos devia dar 210 min sem tramo unico (deu % min).', v_c.minutos;
  END IF;
  -- 7c. Nocturno: realizado 21:00-23:00 com janela 09-18 -> 120 min, 60 nocturnos.
  SELECT * INTO v_c FROM public.hr_horas_extra_calcular(v_d,
    tsmultirange(tsrange(v_d + time '21:00', v_d + time '23:00', '[)')),
    tsmultirange(tsrange(v_d + time '09:00', v_d + time '18:00', '[)')));
  IF v_c.minutos IS DISTINCT FROM 120 OR v_c.nocturno_min IS DISTINCT FROM 60 THEN
    RAISE EXCEPTION 'Conferir: 21:00-23:00 devia dar 120 min com 60 nocturnos (deu % e %).', v_c.minutos, v_c.nocturno_min;
  END IF;
  -- 7d. Meia-noite: 23:59:59 vale 24:00; 22:00-23:59:59 sem janelas = 120 min exactos,
  --     todos nocturnos, tramo 22:00-24:00.
  IF public.hr_horas_extra_fim(time '23:59:59') IS DISTINCT FROM time '24:00'
     OR public.hr_horas_extra_fim(time '18:00') IS DISTINCT FROM time '18:00' THEN
    RAISE EXCEPTION 'Conferir: hr_horas_extra_fim devia levar 23:59:59 a 24:00 e deixar o resto.';
  END IF;
  SELECT * INTO v_c FROM public.hr_horas_extra_calcular(v_d,
    tsmultirange(tsrange(v_d + time '22:00', v_d + public.hr_horas_extra_fim(time '23:59:59'), '[)')),
    '{}'::tsmultirange);
  IF v_c.minutos IS DISTINCT FROM 120 OR v_c.nocturno_min IS DISTINCT FROM 120
     OR v_c.hora_inicio IS DISTINCT FROM time '22:00' OR v_c.hora_fim IS DISTINCT FROM time '24:00'
     OR v_c.tramos IS DISTINCT FROM '22:00-24:00' THEN
    RAISE EXCEPTION 'Conferir: 22:00-23:59:59 devia dar 120 min nocturnos de 22:00 a 24:00 (deu % e %).', v_c.minutos, v_c.nocturno_min;
  END IF;
  -- 7e. Dentro do horario: nada.
  SELECT * INTO v_c FROM public.hr_horas_extra_calcular(v_d,
    tsmultirange(tsrange(v_d + time '09:30', v_d + time '17:00', '[)')),
    tsmultirange(tsrange(v_d + time '09:00', v_d + time '18:00', '[)')));
  IF v_c.minutos IS DISTINCT FROM 0 OR v_c.tramos IS NOT NULL THEN
    RAISE EXCEPTION 'Conferir: trabalho dentro do horario devia dar 0 min (deu %).', v_c.minutos;
  END IF;
  -- 7f. Registada + detetada nao contam o mesmo tempo: planeado 09-18, realizado
  --     09-20 e registada 18-19 -> a detecao so ve 19:00-20:00 (60 min).
  SELECT * INTO v_c FROM public.hr_horas_extra_calcular(v_d,
    tsmultirange(tsrange(v_d + time '09:00', v_d + time '20:00', '[)')),
    tsmultirange(tsrange(v_d + time '09:00', v_d + time '18:00', '[)'))
      + tsmultirange(tsrange(v_d + time '18:00', v_d + time '19:00', '[)')));
  IF v_c.minutos IS DISTINCT FROM 60
     OR v_c.hora_inicio IS DISTINCT FROM time '19:00' OR v_c.hora_fim IS DISTINCT FROM time '20:00' THEN
    RAISE EXCEPTION 'Conferir: com 18-19 registada a detecao devia ver so 19:00-20:00 (deu % min).', v_c.minutos;
  END IF;
  -- 7g. Janela corrigida nao conta duas vezes: o planeado errado 09-18 foi
  --     corrigido para 09-17; realizado 09-18. So com a versao em vigor
  --     (a que hr_horas_extra_dia passa, conferido em 3b) ha 60 min de 17 a 18;
  --     somar a janela corrigida a correccao escondia-os.
  SELECT * INTO v_c FROM public.hr_horas_extra_calcular(v_d,
    tsmultirange(tsrange(v_d + time '09:00', v_d + time '18:00', '[)')),
    tsmultirange(tsrange(v_d + time '09:00', v_d + time '17:00', '[)')));
  IF v_c.minutos IS DISTINCT FROM 60 OR v_c.hora_inicio IS DISTINCT FROM time '17:00' THEN
    RAISE EXCEPTION 'Conferir: so com a correccao 09-17 devia haver 60 min de 17:00 a 18:00 (deu % min).', v_c.minutos;
  END IF;
  SELECT * INTO v_c FROM public.hr_horas_extra_calcular(v_d,
    tsmultirange(tsrange(v_d + time '09:00', v_d + time '18:00', '[)')),
    tsmultirange(tsrange(v_d + time '09:00', v_d + time '17:00', '[)'),
                 tsrange(v_d + time '09:00', v_d + time '18:00', '[)')));
  IF v_c.minutos IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'Conferir: o caso de controlo (corrigida + correccao somadas) devia dar 0 min (deu %).', v_c.minutos;
  END IF;

  -- 8. Vinculo em vigor: activo e suspenso contam; terminado, futuro e NULL nao.
  IF NOT public.hr_horas_extra_vinculo_em_vigor('activo')
     OR NOT public.hr_horas_extra_vinculo_em_vigor('suspenso')
     OR public.hr_horas_extra_vinculo_em_vigor('terminado')
     OR public.hr_horas_extra_vinculo_em_vigor('futuro')
     OR public.hr_horas_extra_vinculo_em_vigor(NULL) THEN
    RAISE EXCEPTION 'Conferir: hr_horas_extra_vinculo_em_vigor devia aceitar so activo e suspenso.';
  END IF;

  -- 9. Datas: hoje em Lisboa, nunca futura, nunca infinita nem antes de 2000.
  IF public.hr_horas_extra_data_valida('infinity'::date) OR public.hr_horas_extra_data_valida(NULL)
     OR public.hr_horas_extra_data_valida(DATE '1999-12-31')
     OR public.hr_horas_extra_data_valida(public.hr_horas_extra_hoje() + 1)
     OR NOT public.hr_horas_extra_data_valida(public.hr_horas_extra_hoje()) THEN
    RAISE EXCEPTION 'Conferir: hr_horas_extra_data_valida nao da os valores esperados.';
  END IF;

  -- 10. Texto: apara (tambem NBSP e espacos Unicode nas pontas); recusa
  --     controlo e invisiveis no meio, e o comprido de mais; deixa passar texto
  --     normal com acentos. Os caracteres sao feitos com chr(), nunca literais.
  IF public.hr_horas_extra_texto('   ', 200) IS NOT NULL
     OR public.hr_horas_extra_texto(chr(160) || chr(8239) || ' ' || chr(12288), 200) IS NOT NULL
     OR public.hr_horas_extra_texto('  saiu tarde  ', 200) IS DISTINCT FROM 'saiu tarde'
     OR public.hr_horas_extra_texto(chr(160) || chr(8195) || 'saiu tarde' || chr(8239) || chr(12288), 200)
          IS DISTINCT FROM 'saiu tarde' THEN
    RAISE EXCEPTION 'Conferir: hr_horas_extra_texto nao apara como esperado.';
  END IF;
  -- Um de cada faixa da classe: U+200B, U+FEFF, U+202E, U+0085, U+00A0, U+00AD,
  -- U+061C, U+180E, U+2000, U+202F, U+205F, U+2800, U+3164, U+FE0F, U+FFA0,
  -- U+E0001, U+E007F.
  SELECT count(*) INTO v_n
    FROM unnest(ARRAY[8203, 65279, 8238, 133, 160, 173, 1564, 6158, 8192, 8239, 8287,
                      10240, 12644, 65039, 65440, 917505, 917631]) AS cp
   WHERE NOT (('a' || chr(cp) || 'b') ~ c_classe);
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'Conferir: % caracter(es) invisiveis passaram pela classe.', v_n;
  END IF;
  IF ('saiu as 19:30, ficou a fechar a loja' ~ c_classe)
     OR (('cora' || chr(231) || chr(227) || 'o, ' || chr(233) || ' j' || chr(225)) ~ c_classe) THEN
    RAISE EXCEPTION 'Conferir: a classe de invisiveis recusa texto normal.';
  END IF;
  BEGIN
    PERFORM public.hr_horas_extra_texto('saiu' || chr(160) || 'tarde', 200);
    RAISE EXCEPTION 'Conferir: um NBSP no meio do texto devia dar HRA82.';
  EXCEPTION WHEN SQLSTATE 'HRA82' THEN NULL;
  END;
  BEGIN
    PERFORM public.hr_horas_extra_texto('saiu' || chr(8203) || 'tarde', 200);
    RAISE EXCEPTION 'Conferir: um texto com U+200B devia dar HRA82.';
  EXCEPTION WHEN SQLSTATE 'HRA82' THEN NULL;
  END;
  BEGIN
    PERFORM public.hr_horas_extra_texto('linha' || chr(10) || 'dupla', 200);
    RAISE EXCEPTION 'Conferir: um texto com caracteres de controlo devia dar HRA82.';
  EXCEPTION WHEN SQLSTATE 'HRA82' THEN NULL;
  END;
  BEGIN
    PERFORM public.hr_horas_extra_texto(repeat('x', 201), 200);
    RAISE EXCEPTION 'Conferir: um texto comprido de mais devia dar HRA82.';
  EXCEPTION WHEN SQLSTATE 'HRA82' THEN NULL;
  END;

  RAISE NOTICE 'OK: horas extra (4 tabelas com RLS forcada e sem privilegios, 9 RPCs so de authenticated, 20 internas sem EXECUTE), omissoes, restricoes, triggers, calculo, meia-noite, planeado corrigido, vinculo em vigor e textos conferidos.';
END;
$conferir$;
