-- ==============================================================================
-- Regras salariais da organizacao (versionadas, com historico append-only),
-- faixas noturnas, direitos por pessoa (IHT, km, ajudas de custo) e
-- periodicidade SEMANAL no cargo. ENTREGA B do plano de regras salariais.
--
-- PROVISORIO. Versao 2: corrige a revisao de seguranca (HIGH1, HIGH2, MEDIUM
-- 3-6, LOW). O carimbo final escolhe-o quem orquestra (>= 20270108560000: o
-- maior aplicado no remoto RH, lido na fase 0, e 20270108550000). Rever com
-- ecc:database-reviewer e ecc:security-reviewer e provar na nike ANTES do push.
--
--
-- -- PRECISA DE CODIGO NOVO NO MESMO ENVIO --------------------------------------
--
-- SIM, para se ver: Processamento Salarial > Configuracao ganha a seccao
-- "Regras salariais" (useRegrasSalariais.ts), a ficha da pessoa o cartao
-- "Direitos" (usePessoaDireitosSalariais.ts), e "Alterar o salario do cargo"
-- tem de oferecer "por semana". Sem o codigo novo NADA parte: as tabelas e RPCs
-- sao novas, e o que ja existia so passa a aceitar mais um valor (semanal).
--
--
-- -- O QUE MUDA ----------------------------------------------------------------
--
-- 1. Periodicidade SEMANAL no cargo. Alargam-se os CHECK
--    hr_cargos_periodos_periodicidade_valida e hr_cargos_periodicidade_valida
--    (a cache em hr_cargos: sem ela a funcao de definir o salario rebentava ao
--    gravar a cache) para ('mensal','anual','hora','semanal'), e a validacao em
--    hr_cargo_definir_salario_core (a UNICA funcao que valida a lista: a guarda
--    G4 procura outras no catalogo e falha se aparecerem). O corpo novo e o
--    antigo letra a letra, menos a linha da lista e a mensagem, e MANTEM o
--    search_path de hoje (public, pg_temp; tudo ja qualificado): o conferir
--    compara-o com o corpo do remoto guardado ANTES de o substituir.
--    rpc_hr_cargo_definir_salario nao valida a lista (passa ao core): nao muda.
--    Ganham um ramo 'semanal' as tres funcoes que davam NULL a um salario
--    semanal (revisao de base de dados): fn_rh_custo_hora_cargo_em e
--    fn_rh_custo_hora_pessoa_em_det (20261231998000) convertem cada
--    periodicidade num MENSAL equivalente e passam-no a fn_cat_custo_hora_salario;
--    o ramo novo segue esse padrao: semanal x 52 / 12, o mesmo do cliente
--    (processamentoTotais.ts). hr_documento_variaveis (20261210140000) passa a
--    escrever 'Semanal' em retribuicao_periodicidade. Nas tres, a migration
--    acrescenta SO a linha do ramo ao corpo que esta no remoto
--    (pg_get_functiondef + replace + EXECUTE), em vez de copiar o corpo local:
--    os corpos locais tem acentos nos comentarios (este ficheiro e so ASCII) e
--    a fase 0 nao os leu (podem ter mudado em 20270108xxxx). Guardas: a linha
--    de ancora aparece exactamente uma vez e ainda nao ha 'semanal'; o conferir
--    exige que o corpo novo, sem a linha acrescentada, seja IGUAL ao antigo, e
--    que SECURITY DEFINER, search_path e privilegios fiquem iguais.
--    pessoas_retribuicoes.periodicidade ja aceita semanal desde 20261207001900
--    (confirmado no remoto). hr_cargos_correcoes guarda a periodicidade em jsonb
--    sem lista; hr_cargo_salario_em devolve o texto: nao mudam.
--    O VALOR HORA NAO MUDA AQUI: o cliente ja converte semanal x 52 / 12.
--
-- 2. hr_regras_salariais: versoes por organizacao, [valido_de, valido_ate]
--    com valido_ate INCLUSIVO (uma versao nova fecha a anterior NO DIA
--    ANTERIOR). ATENCAO, ao contrario de hr_cargos_periodos (valido_ate
--    EXCLUSIVO): valido_de 2026-01-01 e valido_ate 2026-12-31 vale o ano
--    inteiro, 31/12 incluido; a seguinte comeca a 2027-01-01. A versao numa
--    data d e a que tem valido_de <= d AND (valido_ate IS NULL OR valido_ate >= d).
--    Antes da primeira versao NAO ha regra: hr_regras_salariais_em devolve
--    NULL e o calculo (entrega C) tem de tratar esse NULL (nada a pagar por
--    regra, e um aviso), nunca assumir valores. Uma so versao em vigor em aberto (indice unico parcial) e
--    nenhuma sobreposicao entre versoes nao substituidas (trigger; btree_gist
--    nao esta instalada). Campos e limites (CHECK e validacao do jsonb; com
--    margem, mas um erro de virgula como 615 em vez de 6,15 e recusado):
--      subsidio_limite_min  1..1440 min   subsidio_valor_hora 0..10 EUR
--      subsidio_valor_dia   0..50 EUR     he_pct_dia_util/feriado/descanso 0..300
--      he_limite_anual_min  1..24000 min  iht_pct 0..50
--      km_valor             0..2 EUR      ajudas_custo_dia 0..300 EUR
--      faixa noturna: percentagem >0..300 OU preco_hora >0..50 EUR
--    Subsidio: abaixo do limite paga por hora trabalhada; a partir do limite,
--    INCLUSIVE, paga o dia. Dinheiro numeric(10,2), percentagens numeric(5,2).
--    hr_regras_salariais_noturnas: faixas de cada versao (hora_fim <= hora_inicio
--    = atravessa a meia-noite; hora_fim 24:00 = fim do dia, 1440 minutos, e
--    00:00-24:00 e o dia inteiro); sem sobreposicao dentro da versao (trigger,
--    minutos do dia num int4multirange).
--
--    HISTORICO (HIGH2): nada se apaga nem se reescreve.
--    - hr_regras_salariais: UPDATE so para FECHAR (valido_ate de NULL para uma
--      data) ou marcar SUBSTITUIDA (substituida_em/_por, uma vez), e as
--      cascatas SET NULL de created_by/substituida_por; DELETE e TRUNCATE
--      recusados por trigger. Corrigir a versao mais recente (mesma data)
--      marca-a substituida e cria uma versao nova com a mesma data; as faixas
--      da antiga ficam com ela.
--    - hr_regras_salariais_noturnas e as duas tabelas de eventos: UPDATE,
--      DELETE e TRUNCATE recusados por trigger.
--    - hr_regras_salariais_eventos: uma linha por criar, corrigir e fechar,
--      com o antes e o depois em jsonb (faixas incluidas), quem e quando.
--      Escrita pelo core em cada gravacao (e pela carga inicial).
--
--    Janela de datas (MEDIUM5), na RPC (hr_regras_salariais_janela): a data
--    vai do inicio da folha em curso (hr_periodo_folha_do_dia de hoje: a folha
--    gravada que contem hoje, ou a calculada pela regra do periodo da folha;
--    sem regra, o dia 1 do mes corrente) ate 5 anos para a frente. O core
--    recusa ainda qualquer data em ou antes do fim de uma folha FECHADA.
--    A carga inicial (2026-01-01) e da migration e nao passa pela RPC.
--
--    RLS ligada e FORCADA, sem politicas, sem privilegio para ninguem: so as
--    RPCs SECURITY DEFINER (search_path vazio, tudo qualificado).
--    O nome de quem criou cada versao (criada_por_nome) so vai a quem tem
--    hr.vencimento.codigos.view ou .gerir (LOW); com so subsidio.view vem NULL.
--
-- 3. pessoas_direitos_salariais: uma linha por pessoa (iht, km, ajudas). Sem
--    linha = sem direito. So rpc_hr_pessoa_direitos_guardar liga ou desliga
--    (HIGH1: NAO ha trigger em pessoas_vinculos; ligar a isencao de horario
--    num vinculo NAO da IHT). Carga inicial UNICA, nesta migration: quem JA
--    tem um vinculo ACTIVO (nao apagado, sem data_fim no passado) com
--    isencao_horario ganha iht = true (na nike: no maximo 1 -- a fase 0 contou
--    1 vinculo com isencao sem filtrar a data_fim; o NOTICE do conferir diz o
--    numero real). pessoas_direitos_salariais_eventos (append-only) guarda o
--    antes, o depois, quem, quando e a origem (rpc | carga_inicial).
--    "Os proprios direitos" (MEDIUM4): recusado se o utilizador estiver ligado
--    a pessoa por pessoas_contas (qualquer ligacao, mesmo revogada) OU se o
--    e-mail do utilizador (anew_users.email) for o e-mail de trabalho ou pessoal
--    da pessoa. Se o utilizador nao se consegue ligar a NENHUMA pessoa da
--    organizacao (nem por conta nem por e-mail), deixa-se passar e o evento
--    fica com actor_sem_pessoa = true. A recusa devolve o MESMO 42501 que
--    pessoa inexistente ou sem permissao (MEDIUM6: sem oraculo).
--
-- 4. Dados: cada organizacao com linha em hr_regras_subsidio_alimentacao (no
--    remoto RH: so a nike, minutos_minimos_dia = 240) ganha a PRIMEIRA versao,
--    valida desde 2026-01-01, com os valores definidos pelo utilizador: limite
--    300 min (5 h), 0,76 EUR por hora abaixo do limite, 6,15 EUR por dia a
--    partir do limite, horas extra 50/75/100, limite anual 6000 min (100 h),
--    IHT 25, km 0,40, ajudas 65,89, e o evento "criar". O 240 antigo NAO e
--    copiado: era outra regra (o tempo minimo para haver subsidio, sem valor
--    hora); o utilizador fixou o limite em 5 h. Sem faixas noturnas: o
--    utilizador deu-as como exemplo, nao como valor.
--    hr_regras_subsidio_alimentacao NAO e apagada nem alterada.
--    As 22 retribuicoes da nike com subsidio_alimentacao por pessoa (0,00 /
--    4,80 / 6,00 / 8,00 / 9,00 / 9,60; 18 com modo) NAO sao tocadas: deixam de
--    ser fonte de verdade na entrega C e largam-se numa migracao futura.
--    Subsidio obrigatorio no CARGO: as 6 pessoas da nike sem cargo nao recebem
--    subsidio quando o calculo passar a usar a regra.
--
--
-- -- O QUE MUDA PARA AS OUTRAS ORGANIZACOES -----------------------------------
--
-- No que se paga: NADA. O calculo so passa a ler isto na entrega C. Hoje:
--   - todas passam a poder gravar cargos "por semana";
--   - as que tem linha em hr_regras_subsidio_alimentacao ganham a primeira
--     versao (no remoto RH so existe a nike; a guarda G5 falha se houver outra);
--   - quem ja tem isencao de horario ganha o direito a IHT (na nike: 1).
--   - o custo/hora de obra (Catalogo) de quem tem retribuicao ou cargo
--     semanal deixa de ser NULL e passa a contar semanal x 52 / 12 por mes;
--     um contrato emitido com retribuicao semanal passa a dizer "Semanal"
--     (antes ficava em branco). Os cargos nao podiam ser semanais ate aqui; a
--     fase 0 NAO contou retribuicoes semanais: se as houver, o custo/hora
--     delas passa de NULL a um valor. Contar antes do push.
--
--
-- -- GUARDAS E CRLF -------------------------------------------------------------
--
-- A fase 0 nao leu o md5 de hr_cargo_definir_salario_core. Em vez de md5: o
-- corpo do remoto vai para uma tabela temporaria ANTES de ser substituido, e o
-- conferir exige que o corpo novo, com as duas trocas desfeitas, seja IGUAL ao
-- antigo. A comparacao tira os \r dos DOIS lados (o corpo remoto pode ter vindo
-- de um ficheiro CRLF; este ficheiro e LF). Outro corpo no remoto (por exemplo,
-- mudado por um ramo em 20270108xxxx) faz falhar a migration inteira.
--
--
-- -- CODIGOS DE ERRO (prefixo da mensagem; ERRCODE) ---------------------------
--
--   regras_salariais_sem_sessao / _sem_permissao / _sem_utilizador (42501)
--   regras_salariais_dados_em_falta (23502)
--   regras_salariais_valor_invalido / _faixa_invalida (22023)
--   regras_salariais_fora_de_intervalo / _data_invalida / _retroactiva /
--   _data_anterior / _periodo_fechado (23514)
--   regras_salariais_versoes_sobrepostas / _faixas_sobrepostas (23P01)
--   regras_salariais_historico_imutavel (22000)
--   direitos_salariais_sem_sessao / _sem_permissao (42501; tambem para os
--   proprios direitos e para pessoa inexistente)
--   direitos_salariais_dados_em_falta (23502)
--   regras_salariais_fora_de_transaccao (25000, so na aplicacao)
--   Cargo: HRC03 passa a aceitar semanal (o resto igual).
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- Sem ficheiro de reversao, de proposito. A mao, por migration nova: largar as
-- funcoes e as cinco tabelas novas (os triggers de historico recusam TRUNCATE e
-- DELETE: largar os triggers primeiro, depois de exportar); repor o corpo de
-- hr_cargo_definir_salario_core de 20261210130000 e os dois CHECK sem semanal
-- (so se nenhum cargo ou periodo for semanal).
-- ==============================================================================

SET LOCAL lock_timeout = '5s';

-- ---- G00: dentro de uma transaccao -------------------------------------------
DO $transaccao$
BEGIN
  IF current_setting('lock_timeout') IS DISTINCT FROM '5s' THEN
    RAISE EXCEPTION
      'regras_salariais_fora_de_transaccao: SET LOCAL nao teve efeito (lock_timeout = %); esta migration tem de correr numa so transaccao.',
      current_setting('lock_timeout')
      USING ERRCODE = '25000';
  END IF;
END;
$transaccao$;

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
DECLARE
  k_nike   constant uuid := 'b6ffce4f-f630-4933-833a-008649757a33'::uuid;
  k_a1     constant text := $a$  IF p_periodicidade IS NULL OR p_periodicidade NOT IN ('mensal', 'anual', 'hora') THEN$a$;
  k_b1     constant text := 'tem de ser mensal, anual ou hora.';
  v_cod    text;
  v_n      integer;
  v_lista  text;
  v_src    text;
  v_def    text;
  v_core   oid;
BEGIN
  -- G0. Quem aplica passa a RLS (tabelas FORCE sem politicas; as RPCs definer
  --     correm com os direitos deste papel).
  IF NOT EXISTS (SELECT 1 FROM pg_roles r
                  WHERE r.rolname::text = current_user::text AND (r.rolsuper OR r.rolbypassrls)) THEN
    RAISE EXCEPTION 'G0: o papel que aplica (%) nao tem BYPASSRLS; com FORCE RLS as RPCs nao leriam as regras.', current_user::text;
  END IF;

  -- G1. Os nomes novos nao existem (fase 0: 0).
  SELECT string_agg(t, ', ') INTO v_lista
    FROM unnest(ARRAY['public.hr_regras_salariais', 'public.hr_regras_salariais_noturnas',
                      'public.hr_regras_salariais_eventos', 'public.pessoas_direitos_salariais',
                      'public.pessoas_direitos_salariais_eventos']) AS t
   WHERE to_regclass(t) IS NOT NULL;
  IF v_lista IS NOT NULL THEN
    RAISE EXCEPTION 'G1: ja existem tabelas com nomes desta migration: %.', v_lista;
  END IF;
  SELECT string_agg(p.oid::regprocedure::text, ', ') INTO v_lista
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname::text = 'public'
     AND p.proname::text IN ('hr_regras_salariais_faixa_minutos', 'hr_regras_salariais_sem_sobreposicao',
                             'hr_regras_salariais_noturnas_sem_sobreposicao', 'hr_regras_salariais_imutavel',
                             'hr_regras_salariais_so_acrescentar', 'hr_regras_salariais_json',
                             'hr_regras_salariais_em', 'hr_regras_salariais_janela',
                             'hr_regras_salariais_guardar_core',
                             'rpc_hr_regras_salariais_ler', 'rpc_hr_regras_salariais_guardar',
                             'rpc_hr_regras_salariais_historico',
                             'rpc_hr_pessoa_direitos_ler', 'rpc_hr_pessoa_direitos_guardar');
  IF v_lista IS NOT NULL THEN
    RAISE EXCEPTION 'G1: ja existem funcoes com nomes desta migration: %.', v_lista;
  END IF;

  -- G2. Permissoes usadas (nenhuma e criada).
  FOREACH v_cod IN ARRAY ARRAY['hr.vencimento.codigos.view', 'hr.vencimento.codigos.gerir',
                               'hr.vencimento.subsidio.view', 'hr.pessoas.retribuicao.view',
                               'hr.pessoas.retribuicao.edit']
  LOOP
    IF NOT EXISTS (SELECT 1 FROM public.anew_permissions ap WHERE ap.code = v_cod) THEN
      RAISE EXCEPTION 'G2: o codigo % nao esta no catalogo.', v_cod;
    END IF;
  END LOOP;

  -- G3. Suporte: funcoes, tipos e colunas que as funcoes novas usam.
  IF to_regprocedure('public.has_anew_permission_in_org(uuid, text, uuid)') IS NULL THEN
    RAISE EXCEPTION 'G3: falta has_anew_permission_in_org(uuid, text, uuid).';
  END IF;
  IF to_regprocedure('public.hr_periodo_folha_do_dia(uuid, date)') IS NULL
     OR NOT EXISTS (SELECT 1 FROM pg_proc p
                     WHERE p.oid = to_regprocedure('public.hr_periodo_folha_do_dia(uuid, date)')::oid
                       AND 'data_inicio' = ANY (p.proargnames)) THEN
    RAISE EXCEPTION 'G3: falta hr_periodo_folha_do_dia(uuid, date) com a coluna data_inicio (20270107500000).';
  END IF;
  IF to_regtype('int4multirange') IS NULL THEN
    RAISE EXCEPTION 'G3: o tipo int4multirange nao existe (precisa de PostgreSQL 14 ou mais).';
  END IF;
  SELECT count(*) INTO v_n
    FROM (VALUES ('pessoas', 'id'), ('pessoas', 'organization_id'), ('pessoas', 'deleted_at'),
                 ('pessoas', 'email_trabalho'), ('pessoas', 'email_pessoal'),
                 ('pessoas_vinculos', 'pessoa_id'), ('pessoas_vinculos', 'organization_id'),
                 ('pessoas_vinculos', 'isencao_horario'), ('pessoas_vinculos', 'deleted_at'),
                 ('pessoas_vinculos', 'data_fim'),
                 ('pessoas_contas', 'pessoa_id'), ('pessoas_contas', 'organization_id'),
                 ('pessoas_contas', 'anew_user_id'),
                 ('anew_users', 'id'), ('anew_users', 'auth_user_id'), ('anew_users', 'name'),
                 ('anew_users', 'email'),
                 ('hr_periodos_processamento', 'organization_id'), ('hr_periodos_processamento', 'estado'),
                 ('hr_periodos_processamento', 'data_inicio'), ('hr_periodos_processamento', 'data_fim'))
         AS e(tabela, coluna)
   WHERE EXISTS (SELECT 1 FROM pg_attribute a
                  WHERE a.attrelid = to_regclass('public.' || e.tabela)
                    AND a.attname::text = e.coluna AND NOT a.attisdropped);
  IF v_n <> 21 THEN
    RAISE EXCEPTION 'G3: faltam colunas esperadas em pessoas, pessoas_vinculos, pessoas_contas, anew_users ou hr_periodos_processamento (% de 21).', v_n;
  END IF;
  IF (SELECT format_type(a.atttypid, a.atttypmod)::text FROM pg_attribute a
       WHERE a.attrelid = to_regclass('public.pessoas_vinculos') AND a.attname::text = 'isencao_horario'
         AND NOT a.attisdropped) IS DISTINCT FROM 'boolean' THEN
    RAISE EXCEPTION 'G3: pessoas_vinculos.isencao_horario nao e boolean.';
  END IF;

  -- G4. Periodicidade: os CHECK sao os lidos; a unica funcao que valida a lista
  --     e o core; o rpc so a passa.
  SELECT pg_get_constraintdef(c.oid)::text INTO v_def FROM pg_constraint c
   WHERE c.conrelid = to_regclass('public.hr_cargos_periodos')
     AND c.conname::text = 'hr_cargos_periodos_periodicidade_valida' AND c.contype::text = 'c';
  IF v_def IS DISTINCT FROM 'CHECK ((periodicidade = ANY (ARRAY[''mensal''::text, ''anual''::text, ''hora''::text])))' THEN
    RAISE EXCEPTION 'G4: hr_cargos_periodos_periodicidade_valida nao e a lida no remoto: %.', coalesce(v_def, '(nao existe)');
  END IF;
  SELECT pg_get_constraintdef(c.oid)::text INTO v_def FROM pg_constraint c
   WHERE c.conrelid = to_regclass('public.hr_cargos')
     AND c.conname::text = 'hr_cargos_periodicidade_valida' AND c.contype::text = 'c';
  IF v_def IS DISTINCT FROM 'CHECK ((periodicidade = ANY (ARRAY[''mensal''::text, ''anual''::text, ''hora''::text])))' THEN
    RAISE EXCEPTION 'G4: hr_cargos_periodicidade_valida nao e a esperada (20261207022100): %.', coalesce(v_def, '(nao existe)');
  END IF;
  SELECT pg_get_constraintdef(c.oid)::text INTO v_def FROM pg_constraint c
   WHERE c.conrelid = to_regclass('public.pessoas_retribuicoes')
     AND c.conname::text = 'pessoas_retribuicoes_periodicidade_valida' AND c.contype::text = 'c';
  IF v_def IS NULL OR position('''semanal''' IN v_def) = 0 THEN
    RAISE EXCEPTION 'G4: pessoas_retribuicoes_periodicidade_valida ja nao aceita semanal: %.', coalesce(v_def, '(nao existe)');
  END IF;

  -- Outros CHECK com a lista antiga (anual e hora sem semanal): so os dois.
  SELECT string_agg(c.conrelid::regclass::text || '.' || c.conname::text, ', ') INTO v_lista
    FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
   WHERE n.nspname::text = 'public' AND c.contype::text = 'c'
     AND pg_get_constraintdef(c.oid)::text LIKE '%''anual''%'
     AND pg_get_constraintdef(c.oid)::text LIKE '%''hora''%'
     AND pg_get_constraintdef(c.oid)::text NOT LIKE '%''semanal''%'
     AND c.conname::text NOT IN ('hr_cargos_periodos_periodicidade_valida', 'hr_cargos_periodicidade_valida');
  IF v_lista IS NOT NULL THEN
    RAISE EXCEPTION 'G4: ha outros CHECK com a lista de periodicidades sem semanal: %. Incluir nesta migration.', v_lista;
  END IF;

  v_core := to_regprocedure('public.hr_cargo_definir_salario_core(uuid, numeric, text, date, text, uuid)')::oid;
  IF v_core IS NULL
     OR to_regprocedure('public.rpc_hr_cargo_definir_salario(uuid, numeric, text, date, text)') IS NULL THEN
    RAISE EXCEPTION 'G4: falta hr_cargo_definir_salario_core ou rpc_hr_cargo_definir_salario com a assinatura de 20261210130000.';
  END IF;
  SELECT replace(p.prosrc, chr(13), '') INTO v_src FROM pg_proc p WHERE p.oid = v_core;
  IF NOT (SELECT p.prosecdef FROM pg_proc p WHERE p.oid = v_core)
     OR NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid = v_core
                     AND coalesce(array_to_string(p.proconfig, ','), '') LIKE '%search_path=public, pg_temp%') THEN
    RAISE EXCEPTION 'G4: hr_cargo_definir_salario_core deixou de ser SECURITY DEFINER com search_path public, pg_temp.';
  END IF;
  IF (length(v_src) - length(replace(v_src, k_a1, ''))) / length(k_a1) <> 1
     OR (length(v_src) - length(replace(v_src, k_b1, ''))) / length(k_b1) <> 1 THEN
    RAISE EXCEPTION 'G4: o corpo de hr_cargo_definir_salario_core no remoto nao tem a validacao de 20261210130000 (uma so vez). Reler antes de aplicar.';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p
              WHERE p.oid = to_regprocedure('public.rpc_hr_cargo_definir_salario(uuid, numeric, text, date, text)')::oid
                AND (p.prosrc LIKE '%''anual''%' OR p.prosrc NOT LIKE '%hr_cargo_definir_salario_core%')) THEN
    RAISE EXCEPTION 'G4: rpc_hr_cargo_definir_salario passou a validar a periodicidade ou deixou de chamar o core. Reler.';
  END IF;
  SELECT string_agg(p.oid::regprocedure::text, ', ') INTO v_lista
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname::text = 'public' AND p.oid <> v_core
     AND p.prosrc ~ '''anual''\s*,\s*''hora''\s*\)';
  IF v_lista IS NOT NULL THEN
    RAISE EXCEPTION 'G4: outras funcoes validam a lista de periodicidades sem semanal: %. Incluir nesta migration.', v_lista;
  END IF;

  -- G6. As tres funcoes que ganham o ramo semanal: existem com a assinatura
  --     local, a linha de ancora aparece UMA vez e ainda nao ha 'semanal'.
  SELECT string_agg(f.fn, ', ') INTO v_lista
    FROM (VALUES
      ('public.fn_rh_custo_hora_cargo_em(uuid, uuid, date, numeric)', $s$WHEN 'mensal' THEN s.salario_base$s$),
      ('public.fn_rh_custo_hora_pessoa_em_det(uuid, uuid, date)',     $s$WHEN 'mensal' THEN v_ret.valor_base$s$),
      ('public.hr_documento_variaveis(uuid, uuid, boolean)',          $s$WHEN 'hora' THEN 'Por hora'$s$)
    ) AS f(fn, ancora)
   WHERE to_regprocedure(f.fn) IS NULL
      OR NOT EXISTS (SELECT 1 FROM pg_proc p
                      WHERE p.oid = to_regprocedure(f.fn)::oid
                        AND (length(p.prosrc) - length(replace(p.prosrc, f.ancora, ''))) / length(f.ancora) = 1
                        AND p.prosrc NOT LIKE '%''semanal''%');
  IF v_lista IS NOT NULL THEN
    RAISE EXCEPTION 'G6: funcoes que nao existem, nao tem a linha de ancora uma so vez, ou ja tem semanal: %. Reler o corpo do remoto.', v_lista;
  END IF;

  -- G5. Dados como lidos na fase 0: hr_regras_subsidio_alimentacao com as 7
  --     colunas, uma linha (nike, 240 min); nenhuma folha fechada.
  SELECT string_agg(a.attname::text, ',' ORDER BY a.attname::text) INTO v_lista
    FROM pg_attribute a
   WHERE a.attrelid = to_regclass('public.hr_regras_subsidio_alimentacao') AND a.attnum > 0 AND NOT a.attisdropped;
  IF v_lista IS DISTINCT FROM 'created_at,created_by,id,minutos_minimos_dia,organization_id,updated_at,updated_by' THEN
    RAISE EXCEPTION 'G5: hr_regras_subsidio_alimentacao tem as colunas "%", nao as lidas na fase 0.', coalesce(v_lista, '(tabela nao existe)');
  END IF;
  SELECT count(*) INTO v_n FROM public.hr_regras_subsidio_alimentacao;
  IF v_n <> 1 OR NOT EXISTS (SELECT 1 FROM public.hr_regras_subsidio_alimentacao s
                              WHERE s.organization_id = k_nike AND s.minutos_minimos_dia = 240) THEN
    RAISE EXCEPTION 'G5: hr_regras_subsidio_alimentacao devia ter 1 linha (nike, 240 min), como na fase 0; tem %. Reler antes de aplicar.', v_n;
  END IF;
  SELECT count(*) INTO v_n FROM public.hr_periodos_processamento pp WHERE pp.estado = 'fechado';
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'G5: ha % folha(s) fechada(s); a primeira versao (desde 2026-01-01) cobriria meses fechados. Reler antes de aplicar.', v_n;
  END IF;
END;
$guardas$;

-- O corpo actual do core, para o conferir provar que so mudou a lista.
CREATE TEMP TABLE tmp_rs_core_antigo ON COMMIT DROP AS
SELECT p.prosrc AS prosrc
  FROM pg_proc p
 WHERE p.oid = to_regprocedure('public.hr_cargo_definir_salario_core(uuid, numeric, text, date, text, uuid)')::oid;

-- As tres funcoes do ramo semanal, tal como estao no remoto: a linha de ancora,
-- a linha a acrescentar, e o corpo, SECURITY DEFINER, search_path e
-- privilegios de antes (o conferir compara).
CREATE TEMP TABLE tmp_rs_semanal ON COMMIT DROP AS
SELECT f.fn, f.ancora, f.acrescento, p.prosrc, p.prosecdef,
       coalesce(array_to_string(p.proconfig, ','), '') AS proconfig,
       coalesce(p.proacl::text, '') AS proacl
  FROM (VALUES
    ('public.fn_rh_custo_hora_cargo_em(uuid, uuid, date, numeric)',
     $s$WHEN 'mensal' THEN s.salario_base$s$,
     chr(10) || $s$             WHEN 'semanal' THEN s.salario_base * 52 / 12$s$),
    ('public.fn_rh_custo_hora_pessoa_em_det(uuid, uuid, date)',
     $s$WHEN 'mensal' THEN v_ret.valor_base$s$,
     chr(10) || $s$              WHEN 'semanal' THEN v_ret.valor_base * 52 / 12$s$),
    ('public.hr_documento_variaveis(uuid, uuid, boolean)',
     $s$WHEN 'hora' THEN 'Por hora'$s$,
     chr(10) || $s$        WHEN 'semanal' THEN 'Semanal'$s$)
  ) AS f(fn, ancora, acrescento)
  JOIN pg_proc p ON p.oid = to_regprocedure(f.fn)::oid;


-- ==============================================================================
-- 1. Periodicidade semanal no cargo
-- ==============================================================================
ALTER TABLE public.hr_cargos_periodos
  DROP CONSTRAINT hr_cargos_periodos_periodicidade_valida,
  ADD CONSTRAINT hr_cargos_periodos_periodicidade_valida
    CHECK (periodicidade IN ('mensal', 'anual', 'hora', 'semanal'));

ALTER TABLE public.hr_cargos
  DROP CONSTRAINT hr_cargos_periodicidade_valida,
  ADD CONSTRAINT hr_cargos_periodicidade_valida
    CHECK (periodicidade IN ('mensal', 'anual', 'hora', 'semanal'));

-- Corpo de 20261210130000, igual, menos a lista e a mensagem da periodicidade.
-- O search_path fica o de hoje (public, pg_temp), de proposito.
CREATE OR REPLACE FUNCTION public.hr_cargo_definir_salario_core(
  p_cargo_id       uuid,
  p_salario_base   numeric,
  p_periodicidade  text,
  p_valido_de      date,
  p_motivo         text,
  p_actor          uuid
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  c_motivo_max   constant integer := 500;
  v_hoje         date := current_date;
  v_limite_futuro date := (current_date + interval '5 years')::date;
  v_org          uuid;
  v_sal          numeric(12,2);
  v_motivo       text;
  v_p            public.hr_cargos_periodos%ROWTYPE;
  v_primeiro     boolean;
  v_periodo_id   uuid;
  v_r            record;
  v_n            integer;
  v_actualizadas integer := 0;
  v_sem_retrib   integer := 0;
  v_falhadas     integer := 0;
  v_lista        text;
  v_nome         text;
  v_dica         text;
BEGIN
  -- 1. O cargo, com lock (serializa quem mexe no mesmo cargo). FOR NO KEY UPDATE:
  --    nao bloqueia as verificacoes de chave estrangeira de quem escreve em
  --    pessoas_cargos. Ordem de locks do modulo: o cargo ANTES das pessoas
  --    (rpc_hr_pessoa_mudar_cargo faz o mesmo), e as pessoas por ordem de id.
  SELECT c.organization_id INTO v_org
    FROM public.hr_cargos c
   WHERE c.id = p_cargo_id AND c.deleted_at IS NULL
     FOR NO KEY UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'cargo_nao_encontrado: o cargo nao existe ou foi apagado.'
      USING ERRCODE = 'HRC02';
  END IF;

  v_motivo := btrim(coalesce(p_motivo, ''));

  IF p_salario_base IS NULL OR p_salario_base < 0 OR round(p_salario_base, 2) >= 10000000000 THEN
    RAISE EXCEPTION 'cargo_dados_invalidos: o salario base tem de ser um valor entre 0 e 9999999999,99.'
      USING ERRCODE = 'HRC03';
  END IF;
  IF p_periodicidade IS NULL OR p_periodicidade NOT IN ('mensal', 'anual', 'hora', 'semanal') THEN
    RAISE EXCEPTION 'cargo_dados_invalidos: a periodicidade do salario do cargo tem de ser mensal, anual, hora ou semanal.'
      USING ERRCODE = 'HRC03';
  END IF;
  IF char_length(v_motivo) < 3 THEN
    RAISE EXCEPTION 'cargo_dados_invalidos: o motivo da alteracao do salario e obrigatorio (3 caracteres ou mais).'
      USING ERRCODE = 'HRC03';
  END IF;
  IF char_length(v_motivo) > c_motivo_max THEN
    RAISE EXCEPTION 'cargo_dados_invalidos: o motivo da alteracao do salario nao pode ter mais de % caracteres.', c_motivo_max
      USING ERRCODE = 'HRC03';
  END IF;
  IF p_valido_de IS NULL THEN
    RAISE EXCEPTION 'data_invalida: a data de efeito do novo salario e obrigatoria.'
      USING ERRCODE = 'HRC04';
  END IF;
  IF p_valido_de < v_hoje THEN
    RAISE EXCEPTION 'cargo_periodo_no_passado: a subida so pode ser de hoje (%) para a frente. Subidas com data passada ficam para quando o processamento souber tratar acertos.',
      v_hoje
      USING ERRCODE = 'HRC05';
  END IF;
  IF p_valido_de > v_limite_futuro THEN
    RAISE EXCEPTION 'data_invalida: a data de efeito nao pode ser depois de % (maximo 5 anos para a frente).', v_limite_futuro
      USING ERRCODE = 'HRC04';
  END IF;

  v_sal := round(p_salario_base, 2);

  -- 2. O periodo mais recente do cargo.
  SELECT * INTO v_p
    FROM public.hr_cargos_periodos p
   WHERE p.cargo_id = p_cargo_id
   ORDER BY p.valido_de DESC
   LIMIT 1;
  IF NOT FOUND OR v_p.valido_ate IS NOT NULL THEN
    RAISE EXCEPTION 'data_invalida: o cargo nao tem um periodo de salario em aberto. Investigar hr_cargos_periodos antes de continuar.'
      USING ERRCODE = 'HRC04';
  END IF;

  IF p_valido_de < v_p.valido_de THEN
    RAISE EXCEPTION 'data_invalida: ja ha um periodo de salario que comeca em %. A data de efeito nao pode ser anterior; para o corrigir usar essa mesma data.',
      v_p.valido_de
      USING ERRCODE = 'HRC04';
  END IF;

  IF v_sal = v_p.salario_base AND p_periodicidade = v_p.periodicidade THEN
    RAISE EXCEPTION 'sem_alteracao: o salario e a periodicidade pedidos sao iguais aos do periodo mais recente do cargo.'
      USING ERRCODE = 'HRC07';
  END IF;

  -- Corrigir o PRIMEIRO periodo do cargo (o unico, e com a data dele) muda o
  -- salario "desde sempre": o primeiro valor de um cargo vale para todas as datas
  -- anteriores (hr_cargo_salario_em). Por isso as pessoas refazem-se desde a
  -- primeira linha de cargo, e se alguma tem retribuicao ja em vigor a
  -- correccao e recusada (HRC06) em vez de deixar o historico incoerente.
  v_primeiro := p_valido_de = v_p.valido_de
                AND NOT EXISTS (
                  SELECT 1 FROM public.hr_cargos_periodos q
                   WHERE q.cargo_id = p_cargo_id AND q.valido_de < v_p.valido_de);

  IF p_valido_de > v_p.valido_de THEN
    -- Fecha o periodo mais recente nesta data e abre o novo.
    UPDATE public.hr_cargos_periodos
       SET valido_ate = p_valido_de, updated_by = p_actor
     WHERE id = v_p.id;

    INSERT INTO public.hr_cargos_periodos
      (organization_id, cargo_id, salario_base, periodicidade, valido_de, motivo, created_by)
    VALUES
      (v_org, p_cargo_id, v_sal, p_periodicidade, p_valido_de, v_motivo, p_actor)
    RETURNING id INTO v_periodo_id;
  ELSE
    -- Mesma data: corrige a subida agendada (o periodo ainda nao comecou, ou
    -- comeca hoje). O valor antigo e quem corrigiu ficam em hr_cargos_correcoes
    -- (trigger de hr_cargos_periodos, que le updated_by).
    UPDATE public.hr_cargos_periodos
       SET salario_base = v_sal, periodicidade = p_periodicidade, motivo = v_motivo,
           updated_by = p_actor
     WHERE id = v_p.id;
    v_periodo_id := v_p.id;
  END IF;

  -- 3. A cache em hr_cargos (so por aqui).
  PERFORM set_config('hr.cargo_salario_via_rpc', 'on', true);
  UPDATE public.hr_cargos
     SET salario_base = v_sal, periodicidade = p_periodicidade, updated_by = p_actor
   WHERE id = p_cargo_id;
  PERFORM set_config('hr.cargo_salario_via_rpc', 'off', true);

  -- 4. Cada pessoa com este cargo, por ordem de pessoa_id (evita impasses). A
  --    pessoa que tem varias linhas deste cargo refaz-se uma so vez, a partir da
  --    primeira data em que o tem a partir de p_valido_de (ou, ao corrigir o
  --    primeiro periodo, desde a primeira linha, qualquer que seja).
  FOR v_r IN
    SELECT pc.pessoa_id,
           CASE WHEN v_primeiro THEN min(pc.valido_de)
                ELSE GREATEST(p_valido_de, min(pc.valido_de)) END AS desde
      FROM public.pessoas_cargos pc
      JOIN public.pessoas p ON p.id = pc.pessoa_id AND p.deleted_at IS NULL
     WHERE pc.cargo_id = p_cargo_id
       AND (v_primeiro OR pc.valido_ate IS NULL OR pc.valido_ate > p_valido_de)
     GROUP BY pc.pessoa_id
     ORDER BY pc.pessoa_id
  LOOP
    BEGIN
      v_n := public.hr_retribuicao_refazer_desde(
        v_r.pessoa_id, v_r.desde, NULL, 'subida_cargo',
        'Subida do cargo: ' || v_motivo, p_actor);

      IF v_n > 0 THEN
        v_actualizadas := v_actualizadas + 1;
      ELSE
        v_sem_retrib := v_sem_retrib + 1;
      END IF;
    EXCEPTION
      WHEN SQLSTATE 'HRC06' THEN
        v_falhadas := v_falhadas + 1;
        IF v_falhadas <= 5 THEN
          SELECT p.nome_completo INTO v_nome FROM public.pessoas p WHERE p.id = v_r.pessoa_id;
          v_lista := coalesce(v_lista || ', ', '') || coalesce(v_nome, 'pessoa sem nome');
        END IF;
    END;
  END LOOP;

  -- Uma so falha desfaz tudo (a excepcao reverte o periodo, a cache e as
  -- pessoas que ja tinham sido refeitas): ou sobem todas, ou nenhuma.
  IF v_falhadas > 0 THEN
    v_dica := CASE WHEN v_primeiro
                   THEN ' Corrigir o primeiro valor de um cargo muda o salario desde sempre, e reescrevia retribuicoes ja em vigor.'
                   ELSE '' END;
    RAISE EXCEPTION
      'alteracao_posterior_existe: a alteracao nao foi feita porque ha versoes de retribuicao ja em vigor que ela reescreveria: %.%',
      v_lista || CASE WHEN v_falhadas > 5 THEN ' e mais ' || (v_falhadas - 5)::text ELSE '' END,
      v_dica
      USING ERRCODE = 'HRC06';
  END IF;

  RETURN jsonb_build_object(
    'periodo_id',              v_periodo_id,
    'pessoas_actualizadas',    v_actualizadas,
    'pessoas_sem_retribuicao', v_sem_retrib
  );
END;
$$;

COMMENT ON FUNCTION public.hr_cargo_definir_salario_core(uuid, numeric, text, date, text, uuid) IS
'INTERNA (sem EXECUTE para ninguem excepto o dono; chamada so por rpc_hr_cargo_definir_salario, que faz o gate). Define o salario base e a periodicidade (mensal, anual, hora ou semanal -- semanal desde a migration das regras salariais) de um cargo a partir de p_valido_de (hoje ou futuro ate 5 anos, HRC05; motivo de 3 a 500 caracteres): fecha o periodo mais recente nessa data e abre o novo, ou corrige a subida agendada se a data for a dela (o valor antigo e quem corrigiu ficam em hr_cargos_correcoes); actualiza a cache de hr_cargos; refaz as retribuicoes de cada pessoa com o cargo desde essa data (as versoes futuras de origem pessoa sao preservadas). Corrigir o PRIMEIRO periodo do cargo muda o salario desde sempre: as pessoas refazem-se desde a primeira linha de cargo e, havendo retribuicao ja em vigor, a correccao e recusada (HRC06). Uma falha em qualquer pessoa desfaz tudo. Locks: cargo FOR NO KEY UPDATE e depois cada pessoa por ordem de id. search_path public, pg_temp (o de 20261210130000). Devolve jsonb: periodo_id, pessoas_actualizadas, pessoas_sem_retribuicao.';

-- O ramo semanal nas tres funcoes: acrescenta SO a linha a seguir a ancora, no
-- corpo que esta no remoto. CREATE OR REPLACE (via pg_get_functiondef) mantem
-- dono, privilegios, SECURITY DEFINER, search_path e comentario.
DO $semanal$
DECLARE
  v_r   record;
  v_def text;
BEGIN
  FOR v_r IN SELECT * FROM tmp_rs_semanal ORDER BY fn LOOP
    v_def := pg_get_functiondef(to_regprocedure(v_r.fn)::oid);
    IF (length(v_def) - length(replace(v_def, v_r.ancora, ''))) / length(v_r.ancora) <> 1 THEN
      RAISE EXCEPTION 'semanal: a ancora de % nao aparece uma so vez na definicao.', v_r.fn;
    END IF;
    EXECUTE replace(v_def, v_r.ancora, v_r.ancora || v_r.acrescento);
  END LOOP;
  IF (SELECT count(*) FROM tmp_rs_semanal) <> 3 THEN
    RAISE EXCEPTION 'semanal: esperavam-se 3 funcoes, ha %.', (SELECT count(*) FROM tmp_rs_semanal);
  END IF;
END;
$semanal$;


-- ==============================================================================
-- 2. Tabelas das regras: versoes, faixas, eventos
-- ==============================================================================
CREATE TABLE public.hr_regras_salariais (
  id                    uuid          NOT NULL DEFAULT gen_random_uuid(),
  organization_id       uuid          NOT NULL,
  valido_de             date          NOT NULL,
  valido_ate            date,
  subsidio_limite_min   integer       NOT NULL,
  subsidio_valor_hora   numeric(10,2) NOT NULL,
  subsidio_valor_dia    numeric(10,2) NOT NULL,
  he_pct_dia_util       numeric(5,2)  NOT NULL,
  he_pct_feriado        numeric(5,2)  NOT NULL,
  he_pct_descanso       numeric(5,2)  NOT NULL,
  he_limite_anual_min   integer       NOT NULL,
  iht_pct               numeric(5,2)  NOT NULL,
  km_valor              numeric(10,2) NOT NULL,
  ajudas_custo_dia      numeric(10,2) NOT NULL,
  created_at            timestamptz   NOT NULL DEFAULT now(),
  created_by            uuid,
  substituida_em        timestamptz,
  substituida_por       uuid,

  CONSTRAINT hr_regras_salariais_pkey PRIMARY KEY (id),
  CONSTRAINT hr_regras_salariais_org_fkey
    FOREIGN KEY (organization_id) REFERENCES public.anew_organizations (id) ON DELETE RESTRICT,
  CONSTRAINT hr_regras_salariais_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES public.anew_users (id) ON DELETE SET NULL,
  CONSTRAINT hr_regras_salariais_substituida_por_fkey
    FOREIGN KEY (substituida_por) REFERENCES public.anew_users (id) ON DELETE SET NULL,
  CONSTRAINT hr_regras_salariais_substituicao_coerente
    CHECK (substituida_em IS NOT NULL OR substituida_por IS NULL),
  CONSTRAINT hr_regras_salariais_datas_validas
    CHECK (valido_de BETWEEN DATE '2000-01-01' AND DATE '2100-12-31'
           AND (valido_ate IS NULL OR valido_ate >= valido_de)),
  CONSTRAINT hr_regras_salariais_subsidio_limite_intervalo CHECK (subsidio_limite_min BETWEEN 1 AND 1440),
  CONSTRAINT hr_regras_salariais_subsidio_hora_intervalo   CHECK (subsidio_valor_hora BETWEEN 0 AND 10),
  CONSTRAINT hr_regras_salariais_subsidio_dia_intervalo    CHECK (subsidio_valor_dia BETWEEN 0 AND 50),
  CONSTRAINT hr_regras_salariais_he_pcts_intervalo
    CHECK (he_pct_dia_util BETWEEN 0 AND 300 AND he_pct_feriado BETWEEN 0 AND 300 AND he_pct_descanso BETWEEN 0 AND 300),
  CONSTRAINT hr_regras_salariais_he_limite_intervalo       CHECK (he_limite_anual_min BETWEEN 1 AND 24000),
  CONSTRAINT hr_regras_salariais_iht_intervalo             CHECK (iht_pct BETWEEN 0 AND 50),
  CONSTRAINT hr_regras_salariais_km_intervalo              CHECK (km_valor BETWEEN 0 AND 2),
  CONSTRAINT hr_regras_salariais_ajudas_intervalo          CHECK (ajudas_custo_dia BETWEEN 0 AND 300)
);

-- Camada 1: uma so versao em vigor (nao substituida) em aberto por organizacao.
CREATE UNIQUE INDEX uq_hr_regras_salariais_org_aberta
  ON public.hr_regras_salariais (organization_id) WHERE valido_ate IS NULL AND substituida_em IS NULL;
CREATE INDEX idx_hr_regras_salariais_org_de
  ON public.hr_regras_salariais (organization_id, valido_de DESC);
CREATE INDEX idx_hr_regras_salariais_created_by
  ON public.hr_regras_salariais (created_by) WHERE created_by IS NOT NULL;
CREATE INDEX idx_hr_regras_salariais_substituida_por
  ON public.hr_regras_salariais (substituida_por) WHERE substituida_por IS NOT NULL;

COMMENT ON TABLE public.hr_regras_salariais IS
'Regras salariais da organizacao, versionadas: cada linha vale de valido_de a valido_ate INCLUSIVO (NULL = em aberto). Linhas com substituida_em foram corrigidas por outra com a mesma data e ja nao valem (ficam como historico). Uma so em aberto por organizacao; sem sobreposicao entre as nao substituidas (trigger). Historico: so se fecha (valido_ate) ou se marca substituida; DELETE e TRUNCATE recusados. Subsidio de almoco: abaixo de subsidio_limite_min minutos trabalhados no dia paga subsidio_valor_hora por hora trabalhada (minutos proporcionais); a partir do limite, inclusive, paga subsidio_valor_dia. Horas extra: acrescimo em percentagem (dia util, feriado, descanso) e limite anual em minutos. IHT em percentagem do ordenado base; km_valor por km; ajudas_custo_dia por dia (so para quem tem o direito em pessoas_direitos_salariais). Faixas em hr_regras_salariais_noturnas; eventos em hr_regras_salariais_eventos. RLS forcada, sem politicas, sem privilegios: so as RPCs rpc_hr_regras_salariais_*. O calculo so passa a usar isto na entrega C.';

CREATE TABLE public.hr_regras_salariais_noturnas (
  id           uuid          NOT NULL DEFAULT gen_random_uuid(),
  regra_id     uuid          NOT NULL,
  hora_inicio  time          NOT NULL,
  hora_fim     time          NOT NULL,
  percentagem  numeric(5,2),
  preco_hora   numeric(10,2),

  CONSTRAINT hr_regras_salariais_noturnas_pkey PRIMARY KEY (id),
  CONSTRAINT hr_regras_salariais_noturnas_regra_fkey
    FOREIGN KEY (regra_id) REFERENCES public.hr_regras_salariais (id) ON DELETE RESTRICT,
  CONSTRAINT hr_regras_salariais_noturnas_um_so_valor
    CHECK ((percentagem IS NULL) <> (preco_hora IS NULL)),
  CONSTRAINT hr_regras_salariais_noturnas_percentagem_intervalo
    CHECK (percentagem IS NULL OR (percentagem > 0 AND percentagem <= 300)),
  CONSTRAINT hr_regras_salariais_noturnas_preco_intervalo
    CHECK (preco_hora IS NULL OR (preco_hora > 0 AND preco_hora <= 50)),
  CONSTRAINT hr_regras_salariais_noturnas_horas_validas
    CHECK (hora_inicio <> hora_fim
           AND hora_inicio < TIME '24:00' AND hora_fim <= TIME '24:00'
           AND EXTRACT(second FROM hora_inicio) = 0 AND EXTRACT(second FROM hora_fim) = 0)
);

CREATE INDEX idx_hr_regras_salariais_noturnas_regra
  ON public.hr_regras_salariais_noturnas (regra_id);

COMMENT ON TABLE public.hr_regras_salariais_noturnas IS
'Faixas de trabalho noturno de uma versao de hr_regras_salariais: de hora_inicio a hora_fim (minuto exacto). hora_fim 24:00 = fim do dia (1440 minutos; 00:00-24:00 e o dia inteiro). hora_fim <= hora_inicio = a faixa atravessa a meia-noite (21:00-00:00 vai ate a meia-noite, como 21:00-24:00). Paga percentagem sobre o valor hora OU preco_hora fixo, nunca os dois nem nenhum. Faixas da mesma versao nao se sobrepoem (trigger). So se acrescentam (UPDATE, DELETE e TRUNCATE recusados): corrigir faixas e corrigir a versao. So por RPC.';

CREATE TABLE public.hr_regras_salariais_eventos (
  id               uuid        NOT NULL DEFAULT gen_random_uuid(),
  organization_id  uuid        NOT NULL,
  regra_id         uuid        NOT NULL,
  accao            text        NOT NULL,
  antes            jsonb,
  depois           jsonb       NOT NULL,
  feito_por        uuid,
  feito_em         timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT hr_regras_salariais_eventos_pkey PRIMARY KEY (id),
  CONSTRAINT hr_regras_salariais_eventos_regra_fkey
    FOREIGN KEY (regra_id) REFERENCES public.hr_regras_salariais (id) ON DELETE RESTRICT,
  CONSTRAINT hr_regras_salariais_eventos_org_fkey
    FOREIGN KEY (organization_id) REFERENCES public.anew_organizations (id) ON DELETE RESTRICT,
  CONSTRAINT hr_regras_salariais_eventos_accao_valida
    CHECK ((accao = 'criar' AND antes IS NULL) OR (accao IN ('corrigir', 'fechar') AND antes IS NOT NULL))
);

CREATE INDEX idx_hr_regras_salariais_eventos_regra
  ON public.hr_regras_salariais_eventos (regra_id, feito_em);
CREATE INDEX idx_hr_regras_salariais_eventos_org
  ON public.hr_regras_salariais_eventos (organization_id, feito_em DESC);

COMMENT ON TABLE public.hr_regras_salariais_eventos IS
'Historico append-only das regras salariais: uma linha por criar (versao nova), corrigir (regra_id = a versao nova que substituiu a de antes, cujo id vem em antes) e fechar (regra_id = a versao fechada no dia anterior a seguinte). antes e depois sao a versao inteira em jsonb, faixas incluidas. feito_por = anew_users.id, sem FK de proposito (um SET NULL seria um UPDATE; o historico nao se reescreve). UPDATE, DELETE e TRUNCATE recusados.';

-- Minutos do dia cobertos por uma faixa: [inicio, fim) ou, atravessando a
-- meia-noite, [inicio, 1440) e [0, fim). 24:00 vale 1440 (EXTRACT(hour) = 24).
CREATE FUNCTION public.hr_regras_salariais_faixa_minutos(_inicio time, _fim time)
RETURNS int4multirange
LANGUAGE sql IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE
           WHEN m.f > m.i THEN pg_catalog.int4multirange(pg_catalog.int4range(m.i, m.f))
           ELSE pg_catalog.int4multirange(pg_catalog.int4range(m.i, 1440), pg_catalog.int4range(0, m.f))
         END
    FROM (SELECT (EXTRACT(hour FROM _inicio) * 60 + EXTRACT(minute FROM _inicio))::integer AS i,
                 (EXTRACT(hour FROM _fim) * 60 + EXTRACT(minute FROM _fim))::integer AS f) AS m
$$;

-- Camada 2: versoes nao substituidas que se cruzam. Serializa por organizacao.
CREATE FUNCTION public.hr_regras_salariais_sem_sobreposicao()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_c record;
BEGIN
  IF NEW.substituida_em IS NOT NULL THEN
    RETURN NEW;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('hr_regras_salariais:' || NEW.organization_id::text, 0));

  SELECT r.id, r.valido_de, r.valido_ate INTO v_c
    FROM public.hr_regras_salariais r
   WHERE r.organization_id = NEW.organization_id
     AND r.id <> NEW.id
     AND r.substituida_em IS NULL
     AND pg_catalog.daterange(r.valido_de, r.valido_ate, '[]')
         OPERATOR(pg_catalog.&&) pg_catalog.daterange(NEW.valido_de, NEW.valido_ate, '[]')
   LIMIT 1;

  IF v_c.id IS NOT NULL THEN
    RAISE EXCEPTION
      'regras_salariais_versoes_sobrepostas: a versao de % a % cruza-se com a de % a %.',
      NEW.valido_de, coalesce(NEW.valido_ate::text, 'sem fim'),
      v_c.valido_de, coalesce(v_c.valido_ate::text, 'sem fim')
      USING ERRCODE = '23P01';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_hr_regras_salariais_sem_sobreposicao
  BEFORE INSERT OR UPDATE ON public.hr_regras_salariais
  FOR EACH ROW EXECUTE FUNCTION public.hr_regras_salariais_sem_sobreposicao();

-- Historico das versoes: UPDATE so para fechar, marcar substituida, ou as
-- cascatas SET NULL; DELETE e TRUNCATE recusados.
CREATE FUNCTION public.hr_regras_salariais_imutavel()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF ROW(NEW.id, NEW.organization_id, NEW.valido_de, NEW.subsidio_limite_min, NEW.subsidio_valor_hora,
           NEW.subsidio_valor_dia, NEW.he_pct_dia_util, NEW.he_pct_feriado, NEW.he_pct_descanso,
           NEW.he_limite_anual_min, NEW.iht_pct, NEW.km_valor, NEW.ajudas_custo_dia, NEW.created_at)
       IS NOT DISTINCT FROM
       ROW(OLD.id, OLD.organization_id, OLD.valido_de, OLD.subsidio_limite_min, OLD.subsidio_valor_hora,
           OLD.subsidio_valor_dia, OLD.he_pct_dia_util, OLD.he_pct_feriado, OLD.he_pct_descanso,
           OLD.he_limite_anual_min, OLD.iht_pct, OLD.km_valor, OLD.ajudas_custo_dia, OLD.created_at)
       AND (NEW.valido_ate IS NOT DISTINCT FROM OLD.valido_ate
            OR (OLD.valido_ate IS NULL AND NEW.valido_ate IS NOT NULL AND OLD.substituida_em IS NULL))
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
    'regras_salariais_historico_imutavel: as versoes das regras salariais sao historico; so se fecham ou se substituem por uma nova (%).', TG_OP
    USING ERRCODE = '22000';
END;
$$;

CREATE TRIGGER trg_hr_regras_salariais_imutavel
  BEFORE UPDATE OR DELETE ON public.hr_regras_salariais
  FOR EACH ROW EXECUTE FUNCTION public.hr_regras_salariais_imutavel();
CREATE TRIGGER trg_hr_regras_salariais_sem_truncate
  BEFORE TRUNCATE ON public.hr_regras_salariais
  FOR EACH STATEMENT EXECUTE FUNCTION public.hr_regras_salariais_imutavel();

-- So acrescentar: faixas e eventos.
CREATE FUNCTION public.hr_regras_salariais_so_acrescentar()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION
    'regras_salariais_historico_imutavel: % e historico; so se acrescentam linhas (%).', TG_TABLE_NAME, TG_OP
    USING ERRCODE = '22000';
END;
$$;

CREATE TRIGGER trg_hr_regras_salariais_noturnas_so_acrescentar
  BEFORE UPDATE OR DELETE ON public.hr_regras_salariais_noturnas
  FOR EACH ROW EXECUTE FUNCTION public.hr_regras_salariais_so_acrescentar();
CREATE TRIGGER trg_hr_regras_salariais_noturnas_sem_truncate
  BEFORE TRUNCATE ON public.hr_regras_salariais_noturnas
  FOR EACH STATEMENT EXECUTE FUNCTION public.hr_regras_salariais_so_acrescentar();
CREATE TRIGGER trg_hr_regras_salariais_eventos_so_acrescentar
  BEFORE UPDATE OR DELETE ON public.hr_regras_salariais_eventos
  FOR EACH ROW EXECUTE FUNCTION public.hr_regras_salariais_so_acrescentar();
CREATE TRIGGER trg_hr_regras_salariais_eventos_sem_truncate
  BEFORE TRUNCATE ON public.hr_regras_salariais_eventos
  FOR EACH STATEMENT EXECUTE FUNCTION public.hr_regras_salariais_so_acrescentar();

CREATE FUNCTION public.hr_regras_salariais_noturnas_sem_sobreposicao()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_c record;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('hr_regras_salariais_noturnas:' || NEW.regra_id::text, 0));

  SELECT n.id, n.hora_inicio, n.hora_fim INTO v_c
    FROM public.hr_regras_salariais_noturnas n
   WHERE n.regra_id = NEW.regra_id
     AND n.id <> NEW.id
     AND public.hr_regras_salariais_faixa_minutos(n.hora_inicio, n.hora_fim)
         OPERATOR(pg_catalog.&&) public.hr_regras_salariais_faixa_minutos(NEW.hora_inicio, NEW.hora_fim)
   LIMIT 1;

  IF v_c.id IS NOT NULL THEN
    RAISE EXCEPTION
      'regras_salariais_faixas_sobrepostas: a faixa % a % cruza-se com a faixa % a %.',
      pg_catalog.to_char(NEW.hora_inicio, 'HH24:MI'), pg_catalog.to_char(NEW.hora_fim, 'HH24:MI'),
      pg_catalog.to_char(v_c.hora_inicio, 'HH24:MI'), pg_catalog.to_char(v_c.hora_fim, 'HH24:MI')
      USING ERRCODE = '23P01';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_hr_regras_salariais_noturnas_sem_sobreposicao
  BEFORE INSERT ON public.hr_regras_salariais_noturnas
  FOR EACH ROW EXECUTE FUNCTION public.hr_regras_salariais_noturnas_sem_sobreposicao();

REVOKE ALL ON TABLE public.hr_regras_salariais FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.hr_regras_salariais_noturnas FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.hr_regras_salariais_eventos FROM PUBLIC, anon, authenticated, service_role;
ALTER TABLE public.hr_regras_salariais ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_regras_salariais FORCE ROW LEVEL SECURITY;
ALTER TABLE public.hr_regras_salariais_noturnas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_regras_salariais_noturnas FORCE ROW LEVEL SECURITY;
ALTER TABLE public.hr_regras_salariais_eventos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_regras_salariais_eventos FORCE ROW LEVEL SECURITY;
-- Sem CREATE POLICY de proposito: so as RPCs.


-- ==============================================================================
-- 3. Leitura: uma versao em jsonb; a versao em vigor numa data (interna)
-- ==============================================================================
CREATE FUNCTION public.hr_regras_salariais_json(_regra_id uuid, _com_autor boolean)
RETURNS jsonb
LANGUAGE sql STABLE
SET search_path = ''
AS $$
  SELECT pg_catalog.jsonb_build_object(
           'id',                  r.id,
           'valido_de',           r.valido_de,
           'valido_ate',          r.valido_ate,
           'subsidio_limite_min', r.subsidio_limite_min,
           'subsidio_valor_hora', r.subsidio_valor_hora,
           'subsidio_valor_dia',  r.subsidio_valor_dia,
           'he_pct_dia_util',     r.he_pct_dia_util,
           'he_pct_feriado',      r.he_pct_feriado,
           'he_pct_descanso',     r.he_pct_descanso,
           'he_limite_anual_min', r.he_limite_anual_min,
           'iht_pct',             r.iht_pct,
           'km_valor',            r.km_valor,
           'ajudas_custo_dia',    r.ajudas_custo_dia,
           'criada_em',           r.created_at,
           'criada_por_nome',     CASE WHEN _com_autor THEN u.name END,
           'substituida_em',      r.substituida_em,
           'noturnas', coalesce((
             SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
                      'hora_inicio', pg_catalog.to_char(n.hora_inicio, 'HH24:MI'),
                      'hora_fim',    pg_catalog.to_char(n.hora_fim, 'HH24:MI'),
                      'percentagem', n.percentagem,
                      'preco_hora',  n.preco_hora)
                    ORDER BY n.hora_inicio)
               FROM public.hr_regras_salariais_noturnas n
              WHERE n.regra_id = r.id), '[]'::jsonb))
    FROM public.hr_regras_salariais r
    LEFT JOIN public.anew_users u ON u.id = r.created_by
   WHERE r.id = _regra_id
$$;

CREATE FUNCTION public.hr_regras_salariais_em(_organization_id uuid, _data date)
RETURNS jsonb
LANGUAGE sql STABLE
SET search_path = ''
AS $$
  SELECT public.hr_regras_salariais_json(r.id, false)
    FROM public.hr_regras_salariais r
   WHERE r.organization_id = _organization_id
     AND r.substituida_em IS NULL
     AND r.valido_de <= _data
     AND (r.valido_ate IS NULL OR r.valido_ate >= _data)
   ORDER BY r.valido_de DESC
   LIMIT 1
$$;

COMMENT ON FUNCTION public.hr_regras_salariais_em(uuid, date) IS
'INTERNA (sem EXECUTE para ninguem). A versao de hr_regras_salariais em vigor na data (nao substituida), em jsonb com as faixas noturnas e sem o nome do autor. valido_ate e INCLUSIVO (ao contrario de hr_cargos_periodos, onde e exclusivo): valido_de 2026-01-01 e valido_ate 2026-12-31 cobre 31/12/2026; a versao de d tem valido_de <= d e (valido_ate NULL ou >= d). Devolve NULL antes da primeira versao (nao ha regra): o calculo da entrega C TEM de tratar esse NULL e nunca assumir valores. Para o calculo e para as RPCs de leitura.';

CREATE FUNCTION public.rpc_hr_regras_salariais_ler(_organization_id uuid, _data date)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_auth   uuid := auth.uid();
  v_codigos boolean;
  v_j      jsonb;
BEGIN
  IF v_auth IS NULL THEN
    RAISE EXCEPTION 'regras_salariais_sem_sessao: nao ha utilizador autenticado.' USING ERRCODE = '42501';
  END IF;
  IF _organization_id IS NULL THEN
    RAISE EXCEPTION 'regras_salariais_dados_em_falta: a organizacao e obrigatoria.' USING ERRCODE = '23502';
  END IF;
  v_codigos := public.has_anew_permission_in_org(v_auth, 'hr.vencimento.codigos.view', _organization_id)
               OR public.has_anew_permission_in_org(v_auth, 'hr.vencimento.codigos.gerir', _organization_id);
  IF NOT (v_codigos OR public.has_anew_permission_in_org(v_auth, 'hr.vencimento.subsidio.view', _organization_id)) THEN
    RAISE EXCEPTION 'regras_salariais_sem_permissao: ver as regras salariais exige hr.vencimento.subsidio.view ou hr.vencimento.codigos.view nesta organizacao.'
      USING ERRCODE = '42501';
  END IF;

  v_j := public.hr_regras_salariais_em(
    _organization_id, coalesce(_data, (pg_catalog.now() AT TIME ZONE 'Europe/Lisbon')::date));
  IF v_j IS NOT NULL AND v_codigos THEN
    v_j := public.hr_regras_salariais_json((v_j ->> 'id')::uuid, true);
  END IF;
  RETURN v_j;
END;
$$;

COMMENT ON FUNCTION public.rpc_hr_regras_salariais_ler(uuid, date) IS
'A versao das regras salariais em vigor na data (NULL = hoje em Lisboa), em jsonb com as faixas noturnas; NULL se nao houver versao. Exige hr.vencimento.subsidio.view ou hr.vencimento.codigos.view (42501 regras_salariais_sem_permissao). criada_por_nome so com codigos.view ou codigos.gerir.';

CREATE FUNCTION public.rpc_hr_regras_salariais_historico(_organization_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_auth    uuid := auth.uid();
  v_codigos boolean;
BEGIN
  IF v_auth IS NULL THEN
    RAISE EXCEPTION 'regras_salariais_sem_sessao: nao ha utilizador autenticado.' USING ERRCODE = '42501';
  END IF;
  IF _organization_id IS NULL THEN
    RAISE EXCEPTION 'regras_salariais_dados_em_falta: a organizacao e obrigatoria.' USING ERRCODE = '23502';
  END IF;
  v_codigos := public.has_anew_permission_in_org(v_auth, 'hr.vencimento.codigos.view', _organization_id)
               OR public.has_anew_permission_in_org(v_auth, 'hr.vencimento.codigos.gerir', _organization_id);
  IF NOT (v_codigos OR public.has_anew_permission_in_org(v_auth, 'hr.vencimento.subsidio.view', _organization_id)) THEN
    RAISE EXCEPTION 'regras_salariais_sem_permissao: ver as regras salariais exige hr.vencimento.subsidio.view ou hr.vencimento.codigos.view nesta organizacao.'
      USING ERRCODE = '42501';
  END IF;

  RETURN coalesce((
    SELECT pg_catalog.jsonb_agg(public.hr_regras_salariais_json(r.id, v_codigos)
                                ORDER BY r.valido_de DESC, r.created_at DESC, r.id DESC)
      FROM public.hr_regras_salariais r
     WHERE r.organization_id = _organization_id), '[]'::jsonb);
END;
$$;

COMMENT ON FUNCTION public.rpc_hr_regras_salariais_historico(uuid) IS
'Todas as versoes das regras salariais da organizacao (tambem as substituidas, com substituida_em), mais recente primeiro, cada uma em jsonb com as faixas. Mesma permissao de rpc_hr_regras_salariais_ler; criada_por_nome so com codigos.view ou codigos.gerir.';


-- ==============================================================================
-- 4. Guardar uma versao: janela (RPC), core interno, RPC com o gate
-- ==============================================================================
CREATE FUNCTION public.hr_regras_salariais_janela(_organization_id uuid, _valido_de date)
RETURNS void
LANGUAGE plpgsql STABLE
SET search_path = ''
AS $$
DECLARE
  v_hoje   date := (pg_catalog.now() AT TIME ZONE 'Europe/Lisbon')::date;
  v_inicio date;
  v_limite date := ((pg_catalog.now() AT TIME ZONE 'Europe/Lisbon')::date + interval '5 years')::date;
BEGIN
  SELECT d.data_inicio INTO v_inicio
    FROM public.hr_periodo_folha_do_dia(_organization_id, v_hoje) AS d;
  v_inicio := coalesce(v_inicio, pg_catalog.date_trunc('month', v_hoje::timestamp)::date);

  IF _valido_de < v_inicio THEN
    RAISE EXCEPTION
      'regras_salariais_retroactiva: a regra so pode valer a partir do inicio da folha em curso (%).', v_inicio
      USING ERRCODE = '23514';
  END IF;
  IF _valido_de > v_limite THEN
    RAISE EXCEPTION
      'regras_salariais_data_invalida: a regra nao pode comecar depois de % (maximo 5 anos para a frente).', v_limite
      USING ERRCODE = '23514';
  END IF;
END;
$$;

COMMENT ON FUNCTION public.hr_regras_salariais_janela(uuid, date) IS
'INTERNA. Recusa uma data de inicio antes do inicio da folha em curso (hr_periodo_folha_do_dia de hoje em Lisboa: a folha gravada que contem hoje, ou a calculada pela regra do periodo da folha; sem regra, o dia 1 do mes) ou mais de 5 anos para a frente. Chamada pela RPC de guardar; a carga inicial da migration nao passa por aqui.';

CREATE FUNCTION public.hr_regras_salariais_guardar_core(
  _organization_id uuid,
  _valido_de       date,
  _regra           jsonb,
  _actor           uuid
)
RETURNS uuid
LANGUAGE plpgsql VOLATILE
SET search_path = ''
AS $$
DECLARE
  k_chaves   constant text[] := ARRAY['subsidio_limite_min', 'subsidio_valor_hora', 'subsidio_valor_dia',
                                      'he_pct_dia_util', 'he_pct_feriado', 'he_pct_descanso',
                                      'he_limite_anual_min', 'iht_pct', 'km_valor', 'ajudas_custo_dia', 'noturnas'];
  k_max_faixas constant integer := 12;
  v_lista    text;
  v_c        record;
  v_num      numeric;
  v_f        record;
  v_ini_txt  text;
  v_fim_txt  text;
  v_inis     time[] := ARRAY[]::time[];
  v_fins     time[] := ARRAY[]::time[];
  v_pcts     numeric[] := ARRAY[]::numeric[];
  v_precos   numeric[] := ARRAY[]::numeric[];
  v_pct      numeric;
  v_preco    numeric;
  v_fechado  date;
  v_ult      record;
  v_antes    jsonb;
  v_id       uuid;
  i          integer;
BEGIN
  IF _organization_id IS NULL OR _valido_de IS NULL OR _regra IS NULL THEN
    RAISE EXCEPTION 'regras_salariais_dados_em_falta: organizacao, data de inicio e regra sao obrigatorias.'
      USING ERRCODE = '23502';
  END IF;
  IF _valido_de < DATE '2000-01-01' OR _valido_de > DATE '2100-12-31' THEN
    RAISE EXCEPTION 'regras_salariais_data_invalida: a data de inicio tem de estar entre 2000 e 2100 (recebido %).', _valido_de
      USING ERRCODE = '23514';
  END IF;
  IF pg_catalog.jsonb_typeof(_regra) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'regras_salariais_valor_invalido: a regra tem de ser um objecto JSON.' USING ERRCODE = '22023';
  END IF;

  -- Chaves: nenhuma desconhecida, nenhuma em falta, tipos certos.
  SELECT string_agg(k, ', ' ORDER BY k) INTO v_lista
    FROM pg_catalog.jsonb_object_keys(_regra) AS k
   WHERE k <> ALL (k_chaves);
  IF v_lista IS NOT NULL THEN
    RAISE EXCEPTION 'regras_salariais_valor_invalido: chaves desconhecidas: %.', v_lista USING ERRCODE = '22023';
  END IF;
  SELECT string_agg(k, ', ') INTO v_lista
    FROM pg_catalog.unnest(k_chaves) AS k
   WHERE pg_catalog.jsonb_typeof(_regra -> k) IS NULL OR pg_catalog.jsonb_typeof(_regra -> k) = 'null';
  IF v_lista IS NOT NULL THEN
    RAISE EXCEPTION 'regras_salariais_dados_em_falta: faltam valores: %.', v_lista USING ERRCODE = '23502';
  END IF;
  SELECT string_agg(k, ', ') INTO v_lista
    FROM pg_catalog.unnest(k_chaves[1:10]) AS k
   WHERE pg_catalog.jsonb_typeof(_regra -> k) <> 'number';
  IF v_lista IS NOT NULL OR pg_catalog.jsonb_typeof(_regra -> 'noturnas') <> 'array' THEN
    RAISE EXCEPTION 'regras_salariais_valor_invalido: tem de ser numero: %; noturnas tem de ser uma lista.', coalesce(v_lista, '(todos numeros)')
      USING ERRCODE = '22023';
  END IF;

  -- Intervalos e casas decimais (os mesmos dos CHECK da tabela, que ficam como
  -- rede). A mensagem devolve o limite.
  FOR v_c IN
    SELECT * FROM (VALUES
      ('subsidio_limite_min', 1::numeric, 1440::numeric,  true),
      ('subsidio_valor_hora', 0::numeric, 10::numeric,    false),
      ('subsidio_valor_dia',  0::numeric, 50::numeric,    false),
      ('he_pct_dia_util',     0::numeric, 300::numeric,   false),
      ('he_pct_feriado',      0::numeric, 300::numeric,   false),
      ('he_pct_descanso',     0::numeric, 300::numeric,   false),
      ('he_limite_anual_min', 1::numeric, 24000::numeric, true),
      ('iht_pct',             0::numeric, 50::numeric,    false),
      ('km_valor',            0::numeric, 2::numeric,     false),
      ('ajudas_custo_dia',    0::numeric, 300::numeric,   false)
    ) AS t(chave, minimo, maximo, inteiro)
  LOOP
    v_num := (_regra ->> v_c.chave)::numeric;
    IF v_c.inteiro AND v_num <> pg_catalog.trunc(v_num) THEN
      RAISE EXCEPTION 'regras_salariais_valor_invalido: % tem de ser um numero inteiro de minutos (recebido %).', v_c.chave, v_num
        USING ERRCODE = '22023';
    END IF;
    IF NOT v_c.inteiro AND v_num <> pg_catalog.round(v_num, 2) THEN
      RAISE EXCEPTION 'regras_salariais_valor_invalido: % tem no maximo duas casas decimais (recebido %).', v_c.chave, v_num
        USING ERRCODE = '22023';
    END IF;
    IF v_num < v_c.minimo OR v_num > v_c.maximo THEN
      RAISE EXCEPTION 'regras_salariais_fora_de_intervalo: % tem de estar entre % e % (recebido %).',
        v_c.chave, v_c.minimo, v_c.maximo, v_num
        USING ERRCODE = '23514';
    END IF;
  END LOOP;

  -- Faixas noturnas: validadas antes de escrever; a sobreposicao e do trigger.
  IF pg_catalog.jsonb_array_length(_regra -> 'noturnas') > k_max_faixas THEN
    RAISE EXCEPTION 'regras_salariais_fora_de_intervalo: no maximo % faixas noturnas.', k_max_faixas USING ERRCODE = '23514';
  END IF;
  FOR v_f IN SELECT e.value AS faixa, e.ordinality AS n
               FROM pg_catalog.jsonb_array_elements(_regra -> 'noturnas') WITH ORDINALITY AS e
  LOOP
    IF pg_catalog.jsonb_typeof(v_f.faixa) IS DISTINCT FROM 'object'
       OR EXISTS (SELECT 1 FROM pg_catalog.jsonb_object_keys(v_f.faixa) AS k
                   WHERE k NOT IN ('hora_inicio', 'hora_fim', 'percentagem', 'preco_hora'))
       OR pg_catalog.jsonb_typeof(v_f.faixa -> 'hora_inicio') IS DISTINCT FROM 'string'
       OR pg_catalog.jsonb_typeof(v_f.faixa -> 'hora_fim') IS DISTINCT FROM 'string' THEN
      RAISE EXCEPTION 'regras_salariais_faixa_invalida: a faixa % tem de ter hora_inicio e hora_fim (texto HH:MI) e percentagem ou preco_hora.', v_f.n
        USING ERRCODE = '22023';
    END IF;
    v_ini_txt := v_f.faixa ->> 'hora_inicio';
    v_fim_txt := v_f.faixa ->> 'hora_fim';
    -- Inicio de 00:00 a 23:59; fim de 00:00 a 24:00 (24:00 = fim do dia).
    IF v_ini_txt !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' OR v_fim_txt !~ '^(([01][0-9]|2[0-3]):[0-5][0-9]|24:00)$' THEN
      RAISE EXCEPTION 'regras_salariais_faixa_invalida: a faixa % tem horas fora do formato HH:MI, inicio ate 23:59 e fim ate 24:00 (% a %).', v_f.n, v_ini_txt, v_fim_txt
        USING ERRCODE = '22023';
    END IF;
    IF v_ini_txt = v_fim_txt THEN
      RAISE EXCEPTION 'regras_salariais_faixa_invalida: a faixa % comeca e acaba a mesma hora (%).', v_f.n, v_ini_txt
        USING ERRCODE = '22023';
    END IF;

    v_pct := NULL;
    v_preco := NULL;
    IF pg_catalog.jsonb_typeof(v_f.faixa -> 'percentagem') = 'number' THEN
      v_pct := (v_f.faixa ->> 'percentagem')::numeric;
    ELSIF coalesce(pg_catalog.jsonb_typeof(v_f.faixa -> 'percentagem'), 'null') <> 'null' THEN
      RAISE EXCEPTION 'regras_salariais_faixa_invalida: a percentagem da faixa % tem de ser numero.', v_f.n USING ERRCODE = '22023';
    END IF;
    IF pg_catalog.jsonb_typeof(v_f.faixa -> 'preco_hora') = 'number' THEN
      v_preco := (v_f.faixa ->> 'preco_hora')::numeric;
    ELSIF coalesce(pg_catalog.jsonb_typeof(v_f.faixa -> 'preco_hora'), 'null') <> 'null' THEN
      RAISE EXCEPTION 'regras_salariais_faixa_invalida: o preco_hora da faixa % tem de ser numero.', v_f.n USING ERRCODE = '22023';
    END IF;
    IF (v_pct IS NULL) = (v_preco IS NULL) THEN
      RAISE EXCEPTION 'regras_salariais_faixa_invalida: a faixa % tem de ter percentagem OU preco_hora (nunca os dois nem nenhum).', v_f.n
        USING ERRCODE = '22023';
    END IF;
    IF coalesce(v_pct, v_preco) <> pg_catalog.round(coalesce(v_pct, v_preco), 2) THEN
      RAISE EXCEPTION 'regras_salariais_valor_invalido: o valor da faixa % tem no maximo duas casas decimais.', v_f.n
        USING ERRCODE = '22023';
    END IF;
    IF v_pct IS NOT NULL AND (v_pct <= 0 OR v_pct > 300) THEN
      RAISE EXCEPTION 'regras_salariais_fora_de_intervalo: a percentagem da faixa % tem de ser maior que 0 e ate 300 (recebido %).', v_f.n, v_pct
        USING ERRCODE = '23514';
    END IF;
    IF v_preco IS NOT NULL AND (v_preco <= 0 OR v_preco > 50) THEN
      RAISE EXCEPTION 'regras_salariais_fora_de_intervalo: o preco por hora da faixa % tem de ser maior que 0 e ate 50 (recebido %).', v_f.n, v_preco
        USING ERRCODE = '23514';
    END IF;

    v_inis   := v_inis || v_ini_txt::time;
    v_fins   := v_fins || v_fim_txt::time;
    v_pcts   := v_pcts || v_pct;
    v_precos := v_precos || v_preco;
  END LOOP;

  -- Lock da organizacao (a mesma chave de abrir a folha e das regras do periodo
  -- da folha) e das folhas que acabam a partir da data: fechar uma folha a meio
  -- espera por esta transaccao.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('hr_periodos_processamento:' || _organization_id::text, 0));
  PERFORM 1 FROM public.hr_periodos_processamento pp
   WHERE pp.organization_id = _organization_id AND pp.data_fim >= _valido_de
     FOR SHARE;

  SELECT max(pp.data_fim) INTO v_fechado
    FROM public.hr_periodos_processamento pp
   WHERE pp.organization_id = _organization_id AND pp.estado = 'fechado';
  IF v_fechado IS NOT NULL AND v_fechado >= _valido_de THEN
    RAISE EXCEPTION
      'regras_salariais_periodo_fechado: ha uma folha fechada ate %; a regra nova so pode valer a partir de %.',
      v_fechado, v_fechado + 1
      USING ERRCODE = '23514';
  END IF;

  -- A versao em vigor mais recente (sempre a em aberto).
  SELECT r.id, r.valido_de INTO v_ult
    FROM public.hr_regras_salariais r
   WHERE r.organization_id = _organization_id AND r.substituida_em IS NULL
   ORDER BY r.valido_de DESC
   LIMIT 1
     FOR UPDATE;

  IF v_ult.id IS NOT NULL AND _valido_de < v_ult.valido_de THEN
    RAISE EXCEPTION
      'regras_salariais_data_anterior: ja ha uma versao que comeca em %; a nova tem de comecar nessa data (corrige-a) ou depois.',
      v_ult.valido_de
      USING ERRCODE = '23514';
  END IF;

  IF v_ult.id IS NOT NULL THEN
    v_antes := public.hr_regras_salariais_json(v_ult.id, false);
    IF _valido_de = v_ult.valido_de THEN
      -- Mesma data: a versao mais recente fica substituida (historico) e a nova
      -- toma o lugar dela.
      UPDATE public.hr_regras_salariais r
         SET substituida_em = pg_catalog.now(), substituida_por = _actor
       WHERE r.id = v_ult.id;
    ELSE
      -- Data posterior: fecha a versao em aberto no dia anterior.
      UPDATE public.hr_regras_salariais r
         SET valido_ate = _valido_de - 1
       WHERE r.id = v_ult.id;
      INSERT INTO public.hr_regras_salariais_eventos (organization_id, regra_id, accao, antes, depois, feito_por)
      VALUES (_organization_id, v_ult.id, 'fechar', v_antes, public.hr_regras_salariais_json(v_ult.id, false), _actor);
    END IF;
  END IF;

  INSERT INTO public.hr_regras_salariais
    (organization_id, valido_de, subsidio_limite_min, subsidio_valor_hora, subsidio_valor_dia,
     he_pct_dia_util, he_pct_feriado, he_pct_descanso, he_limite_anual_min,
     iht_pct, km_valor, ajudas_custo_dia, created_by)
  VALUES
    (_organization_id, _valido_de,
     ((_regra ->> 'subsidio_limite_min')::numeric)::integer,
     (_regra ->> 'subsidio_valor_hora')::numeric,
     (_regra ->> 'subsidio_valor_dia')::numeric,
     (_regra ->> 'he_pct_dia_util')::numeric,
     (_regra ->> 'he_pct_feriado')::numeric,
     (_regra ->> 'he_pct_descanso')::numeric,
     ((_regra ->> 'he_limite_anual_min')::numeric)::integer,
     (_regra ->> 'iht_pct')::numeric,
     (_regra ->> 'km_valor')::numeric,
     (_regra ->> 'ajudas_custo_dia')::numeric,
     _actor)
  RETURNING id INTO v_id;

  FOR i IN 1 .. coalesce(pg_catalog.array_length(v_inis, 1), 0) LOOP
    INSERT INTO public.hr_regras_salariais_noturnas (regra_id, hora_inicio, hora_fim, percentagem, preco_hora)
    VALUES (v_id, v_inis[i], v_fins[i], v_pcts[i], v_precos[i]);
  END LOOP;

  INSERT INTO public.hr_regras_salariais_eventos (organization_id, regra_id, accao, antes, depois, feito_por)
  VALUES (_organization_id, v_id,
          CASE WHEN v_ult.id IS NOT NULL AND _valido_de = v_ult.valido_de THEN 'corrigir' ELSE 'criar' END,
          CASE WHEN v_ult.id IS NOT NULL AND _valido_de = v_ult.valido_de THEN v_antes END,
          public.hr_regras_salariais_json(v_id, false), _actor);

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.hr_regras_salariais_guardar_core(uuid, date, jsonb, uuid) IS
'INTERNA (sem EXECUTE para ninguem; chamada por rpc_hr_regras_salariais_guardar, que faz o gate e a janela de datas). Valida a regra (todas as chaves, numeros, intervalos, duas casas decimais, faixas), toma o lock da organizacao, recusa uma data em ou antes do fim de uma folha fechada (regras_salariais_periodo_fechado) ou antes da versao mais recente (regras_salariais_data_anterior). Mesma data da versao mais recente: marca-a substituida e cria a nova (evento corrigir, com o antes). Data posterior: fecha a em aberto no dia anterior (evento fechar) e cria a nova (evento criar). Devolve o id da versao nova.';

CREATE FUNCTION public.rpc_hr_regras_salariais_guardar(
  _organization_id uuid,
  _valido_de       date,
  _regra           jsonb
)
RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_auth  uuid := auth.uid();
  v_actor uuid;
BEGIN
  IF v_auth IS NULL THEN
    RAISE EXCEPTION 'regras_salariais_sem_sessao: nao ha utilizador autenticado.' USING ERRCODE = '42501';
  END IF;
  IF _organization_id IS NULL OR _valido_de IS NULL THEN
    RAISE EXCEPTION 'regras_salariais_dados_em_falta: a organizacao e a data de inicio sao obrigatorias.' USING ERRCODE = '23502';
  END IF;
  IF NOT public.has_anew_permission_in_org(v_auth, 'hr.vencimento.codigos.gerir', _organization_id) THEN
    RAISE EXCEPTION 'regras_salariais_sem_permissao: gravar as regras salariais exige hr.vencimento.codigos.gerir nesta organizacao.'
      USING ERRCODE = '42501';
  END IF;

  SELECT au.id INTO v_actor FROM public.anew_users au WHERE au.auth_user_id = v_auth LIMIT 1;
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'regras_salariais_sem_utilizador: a sessao nao corresponde a nenhum utilizador.' USING ERRCODE = '42501';
  END IF;

  PERFORM public.hr_regras_salariais_janela(_organization_id, _valido_de);

  RETURN public.hr_regras_salariais_guardar_core(_organization_id, _valido_de, _regra, v_actor);
END;
$$;

COMMENT ON FUNCTION public.rpc_hr_regras_salariais_guardar(uuid, date, jsonb) IS
'Grava uma versao das regras salariais a partir de _valido_de. _regra: {subsidio_limite_min, subsidio_valor_hora, subsidio_valor_dia, he_pct_dia_util, he_pct_feriado, he_pct_descanso, he_limite_anual_min, iht_pct, km_valor, ajudas_custo_dia, noturnas: [{hora_inicio "HH:MI", hora_fim "HH:MI", percentagem | preco_hora}]}, todas obrigatorias. Data: do inicio da folha em curso ate 5 anos para a frente, e nunca em ou antes de uma folha fechada. Fecha a versao em vigor no dia anterior, ou, com a mesma data, substitui-a (fica no historico). Cada gravacao deixa eventos em hr_regras_salariais_eventos. Exige hr.vencimento.codigos.gerir (42501), verificada antes de ler qualquer dado. Devolve o id da versao.';

REVOKE ALL ON FUNCTION public.hr_regras_salariais_faixa_minutos(time, time) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.hr_regras_salariais_sem_sobreposicao() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.hr_regras_salariais_noturnas_sem_sobreposicao() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.hr_regras_salariais_imutavel() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.hr_regras_salariais_so_acrescentar() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.hr_regras_salariais_json(uuid, boolean) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.hr_regras_salariais_em(uuid, date) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.hr_regras_salariais_janela(uuid, date) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.hr_regras_salariais_guardar_core(uuid, date, jsonb, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.rpc_hr_regras_salariais_ler(uuid, date) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.rpc_hr_regras_salariais_historico(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.rpc_hr_regras_salariais_guardar(uuid, date, jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_hr_regras_salariais_ler(uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_regras_salariais_historico(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_regras_salariais_guardar(uuid, date, jsonb) TO authenticated;


-- ==============================================================================
-- 5. pessoas_direitos_salariais e os seus eventos
-- ==============================================================================
CREATE TABLE public.pessoas_direitos_salariais (
  pessoa_id        uuid        NOT NULL,
  organization_id  uuid        NOT NULL,
  iht              boolean     NOT NULL DEFAULT false,
  km               boolean     NOT NULL DEFAULT false,
  ajudas           boolean     NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  updated_by       uuid,

  CONSTRAINT pessoas_direitos_salariais_pkey PRIMARY KEY (pessoa_id),
  CONSTRAINT pessoas_direitos_salariais_pessoa_fkey
    FOREIGN KEY (pessoa_id, organization_id) REFERENCES public.pessoas (id, organization_id) ON DELETE CASCADE,
  CONSTRAINT pessoas_direitos_salariais_updated_by_fkey
    FOREIGN KEY (updated_by) REFERENCES public.anew_users (id) ON DELETE SET NULL
);

CREATE INDEX idx_pessoas_direitos_salariais_org
  ON public.pessoas_direitos_salariais (organization_id);
CREATE INDEX idx_pessoas_direitos_salariais_updated_by
  ON public.pessoas_direitos_salariais (updated_by) WHERE updated_by IS NOT NULL;

COMMENT ON TABLE public.pessoas_direitos_salariais IS
'Direitos opcionais de cada pessoa: IHT (iht), km (km) e ajudas de custo (ajudas). Os VALORES vem sempre de hr_regras_salariais; aqui so se diz se a pessoa tem direito. Sem linha = sem direito. So rpc_hr_pessoa_direitos_guardar escreve (ninguem nos proprios direitos); a isencao de horario NAO liga a IHT sozinha (so a carga inicial da migration, uma vez). Historico em pessoas_direitos_salariais_eventos. RLS forcada, sem politicas, sem privilegios.';

CREATE TABLE public.pessoas_direitos_salariais_eventos (
  id               uuid        NOT NULL DEFAULT gen_random_uuid(),
  organization_id  uuid        NOT NULL,
  pessoa_id        uuid        NOT NULL,
  antes            jsonb,
  depois           jsonb       NOT NULL,
  origem           text        NOT NULL,
  actor_sem_pessoa boolean     NOT NULL DEFAULT false,
  feito_por        uuid,
  feito_em         timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT pessoas_direitos_salariais_eventos_pkey PRIMARY KEY (id),
  CONSTRAINT pessoas_direitos_salariais_eventos_org_fkey
    FOREIGN KEY (organization_id) REFERENCES public.anew_organizations (id) ON DELETE RESTRICT,
  CONSTRAINT pessoas_direitos_salariais_eventos_origem_valida
    CHECK (origem IN ('rpc', 'carga_inicial'))
);

CREATE INDEX idx_pessoas_direitos_salariais_eventos_pessoa
  ON public.pessoas_direitos_salariais_eventos (pessoa_id, feito_em);
CREATE INDEX idx_pessoas_direitos_salariais_eventos_org
  ON public.pessoas_direitos_salariais_eventos (organization_id, feito_em DESC);

COMMENT ON TABLE public.pessoas_direitos_salariais_eventos IS
'Historico append-only dos direitos salariais: antes e depois ({iht, km, ajudas}; antes NULL = nao havia linha), origem (rpc | carga_inicial), quem (anew_users.id, sem FK de proposito) e quando. actor_sem_pessoa = o utilizador que gravou nao se liga a nenhuma pessoa da organizacao (nem por conta nem por e-mail), por isso a regra de nao alterar os proprios direitos nao o pode confirmar. pessoa_id sem FK: o historico sobrevive a pessoa. UPDATE, DELETE e TRUNCATE recusados.';

CREATE TRIGGER trg_pessoas_direitos_salariais_eventos_so_acrescentar
  BEFORE UPDATE OR DELETE ON public.pessoas_direitos_salariais_eventos
  FOR EACH ROW EXECUTE FUNCTION public.hr_regras_salariais_so_acrescentar();
CREATE TRIGGER trg_pessoas_direitos_salariais_eventos_sem_truncate
  BEFORE TRUNCATE ON public.pessoas_direitos_salariais_eventos
  FOR EACH STATEMENT EXECUTE FUNCTION public.hr_regras_salariais_so_acrescentar();

REVOKE ALL ON TABLE public.pessoas_direitos_salariais FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.pessoas_direitos_salariais_eventos FROM PUBLIC, anon, authenticated, service_role;
ALTER TABLE public.pessoas_direitos_salariais ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pessoas_direitos_salariais FORCE ROW LEVEL SECURITY;
ALTER TABLE public.pessoas_direitos_salariais_eventos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pessoas_direitos_salariais_eventos FORCE ROW LEVEL SECURITY;

CREATE FUNCTION public.rpc_hr_pessoa_direitos_ler(_organization_id uuid, _pessoa_id uuid DEFAULT NULL)
RETURNS TABLE (
  pessoa_id   uuid,
  iht         boolean,
  km          boolean,
  ajudas      boolean,
  alterado_em timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
#variable_conflict use_column
DECLARE
  v_auth uuid := auth.uid();
BEGIN
  IF v_auth IS NULL THEN
    RAISE EXCEPTION 'direitos_salariais_sem_sessao: nao ha utilizador autenticado.' USING ERRCODE = '42501';
  END IF;
  IF _organization_id IS NULL THEN
    RAISE EXCEPTION 'direitos_salariais_dados_em_falta: a organizacao e obrigatoria.' USING ERRCODE = '23502';
  END IF;
  IF NOT public.has_anew_permission_in_org(v_auth, 'hr.pessoas.retribuicao.view', _organization_id) THEN
    RAISE EXCEPTION 'direitos_salariais_sem_permissao: ver os direitos salariais exige hr.pessoas.retribuicao.view nesta organizacao.'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT d.pessoa_id, d.iht, d.km, d.ajudas, d.updated_at
    FROM public.pessoas_direitos_salariais d
   WHERE d.organization_id = _organization_id
     AND (_pessoa_id IS NULL OR d.pessoa_id = _pessoa_id)
   ORDER BY d.pessoa_id;
END;
$$;

COMMENT ON FUNCTION public.rpc_hr_pessoa_direitos_ler(uuid, uuid) IS
'Direitos (IHT, km, ajudas) das pessoas da organizacao (_pessoa_id NULL = todas). Quem nao aparece nao tem direito nenhum. Exige hr.pessoas.retribuicao.view (42501).';

CREATE FUNCTION public.rpc_hr_pessoa_direitos_guardar(
  _organization_id uuid,
  _pessoa_id       uuid,
  _iht             boolean,
  _km              boolean,
  _ajudas          boolean
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  k_recusa constant text := 'direitos_salariais_sem_permissao: a pessoa nao existe, ou nao tem permissao para mudar os direitos salariais desta pessoa (hr.pessoas.retribuicao.edit).';
  v_auth     uuid := auth.uid();
  v_actor    uuid;
  v_email    text;
  v_proprio  boolean;
  v_mapeado  boolean;
  v_antes    jsonb;
  v_depois   jsonb;
BEGIN
  IF v_auth IS NULL THEN
    RAISE EXCEPTION 'direitos_salariais_sem_sessao: nao ha utilizador autenticado.' USING ERRCODE = '42501';
  END IF;
  IF _organization_id IS NULL OR _pessoa_id IS NULL OR _iht IS NULL OR _km IS NULL OR _ajudas IS NULL THEN
    RAISE EXCEPTION 'direitos_salariais_dados_em_falta: organizacao, pessoa, iht, km e ajudas sao obrigatorios.'
      USING ERRCODE = '23502';
  END IF;
  IF NOT public.has_anew_permission_in_org(v_auth, 'hr.pessoas.retribuicao.edit', _organization_id) THEN
    RAISE EXCEPTION '%', k_recusa USING ERRCODE = '42501';
  END IF;

  -- Pessoa inexistente nesta organizacao: a mesma resposta.
  PERFORM 1 FROM public.pessoas p
   WHERE p.id = _pessoa_id AND p.organization_id = _organization_id AND p.deleted_at IS NULL
     FOR NO KEY UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION '%', k_recusa USING ERRCODE = '42501';
  END IF;

  SELECT au.id, lower(btrim(coalesce(au.email::text, ''))) INTO v_actor, v_email
    FROM public.anew_users au WHERE au.auth_user_id = v_auth LIMIT 1;
  v_email := coalesce(v_email, '');

  -- Os proprios direitos: ligacao por conta (qualquer, mesmo revogada) ou o
  -- e-mail do utilizador igual ao de trabalho ou pessoal da pessoa. A MESMA
  -- resposta que sem permissao (sem oraculo).
  v_proprio := EXISTS (
                 SELECT 1
                   FROM public.pessoas_contas pc
                   JOIN public.anew_users au ON au.id = pc.anew_user_id
                  WHERE au.auth_user_id = v_auth
                    AND pc.organization_id = _organization_id
                    AND pc.pessoa_id = _pessoa_id)
               OR (v_email <> '' AND EXISTS (
                 SELECT 1 FROM public.pessoas p
                  WHERE p.id = _pessoa_id
                    AND v_email IN (lower(btrim(coalesce(p.email_trabalho, ''))),
                                    lower(btrim(coalesce(p.email_pessoal, ''))))));
  IF v_proprio THEN
    RAISE EXCEPTION '%', k_recusa USING ERRCODE = '42501';
  END IF;

  -- O utilizador liga-se a alguma pessoa da organizacao? Se nao, deixa-se
  -- passar mas o evento fica marcado.
  v_mapeado := EXISTS (
                 SELECT 1
                   FROM public.pessoas_contas pc
                   JOIN public.anew_users au ON au.id = pc.anew_user_id
                  WHERE au.auth_user_id = v_auth
                    AND pc.organization_id = _organization_id)
               OR (v_email <> '' AND EXISTS (
                 SELECT 1 FROM public.pessoas p
                  WHERE p.organization_id = _organization_id
                    AND v_email IN (lower(btrim(coalesce(p.email_trabalho, ''))),
                                    lower(btrim(coalesce(p.email_pessoal, ''))))));

  SELECT pg_catalog.jsonb_build_object('iht', d.iht, 'km', d.km, 'ajudas', d.ajudas) INTO v_antes
    FROM public.pessoas_direitos_salariais d
   WHERE d.pessoa_id = _pessoa_id
     FOR UPDATE;

  INSERT INTO public.pessoas_direitos_salariais AS d (pessoa_id, organization_id, iht, km, ajudas, updated_by)
  VALUES (_pessoa_id, _organization_id, _iht, _km, _ajudas, v_actor)
  ON CONFLICT (pessoa_id) DO UPDATE
     SET iht = EXCLUDED.iht, km = EXCLUDED.km, ajudas = EXCLUDED.ajudas,
         updated_at = pg_catalog.now(), updated_by = EXCLUDED.updated_by;

  v_depois := pg_catalog.jsonb_build_object('iht', _iht, 'km', _km, 'ajudas', _ajudas);
  INSERT INTO public.pessoas_direitos_salariais_eventos
    (organization_id, pessoa_id, antes, depois, origem, actor_sem_pessoa, feito_por)
  VALUES (_organization_id, _pessoa_id, v_antes, v_depois, 'rpc', NOT v_mapeado, v_actor);

  RETURN v_depois || pg_catalog.jsonb_build_object('pessoa_id', _pessoa_id);
END;
$$;

COMMENT ON FUNCTION public.rpc_hr_pessoa_direitos_guardar(uuid, uuid, boolean, boolean, boolean) IS
'Liga ou desliga os direitos de uma pessoa a IHT, km e ajudas de custo (os valores vem da regra da organizacao). Exige hr.pessoas.retribuicao.edit, verificada antes de ler a pessoa. Pessoa inexistente, falta de permissao e os proprios direitos (ligacao por pessoas_contas, ou e-mail do utilizador igual ao de trabalho ou pessoal da pessoa) dao a MESMA resposta (42501 direitos_salariais_sem_permissao). Quem nao se liga a nenhuma pessoa da organizacao passa, e o evento fica com actor_sem_pessoa. Cada gravacao deixa um evento. Devolve {pessoa_id, iht, km, ajudas}.';

REVOKE ALL ON FUNCTION public.rpc_hr_pessoa_direitos_ler(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.rpc_hr_pessoa_direitos_guardar(uuid, uuid, boolean, boolean, boolean) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_hr_pessoa_direitos_ler(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_pessoa_direitos_guardar(uuid, uuid, boolean, boolean, boolean) TO authenticated;


-- ==============================================================================
-- 6. Dados (uma so vez, aqui)
-- ==============================================================================
-- Primeira versao das regras: organizacoes com linha em
-- hr_regras_subsidio_alimentacao (remoto RH: so a nike). Limite 300 min (5 h),
-- NAO o 240 antigo (ver cabecalho). Sem faixas noturnas.
INSERT INTO public.hr_regras_salariais
  (organization_id, valido_de, subsidio_limite_min, subsidio_valor_hora, subsidio_valor_dia,
   he_pct_dia_util, he_pct_feriado, he_pct_descanso, he_limite_anual_min,
   iht_pct, km_valor, ajudas_custo_dia)
SELECT s.organization_id, DATE '2026-01-01', 300, 0.76, 6.15,
       50, 75, 100, 6000,
       25, 0.40, 65.89
  FROM public.hr_regras_subsidio_alimentacao s
 WHERE NOT EXISTS (SELECT 1 FROM public.hr_regras_salariais r WHERE r.organization_id = s.organization_id);

INSERT INTO public.hr_regras_salariais_eventos (organization_id, regra_id, accao, antes, depois, feito_por)
SELECT r.organization_id, r.id, 'criar', NULL, public.hr_regras_salariais_json(r.id, false), NULL
  FROM public.hr_regras_salariais r;

-- IHT: carga inicial UNICA para quem JA tem isencao de horario num vinculo
-- ACTIVO (nao apagado, sem data_fim no passado). Daqui em diante a IHT so se
-- liga por rpc_hr_pessoa_direitos_guardar.
INSERT INTO public.pessoas_direitos_salariais (pessoa_id, organization_id, iht)
SELECT DISTINCT p.id, p.organization_id, true
  FROM public.pessoas_vinculos v
  JOIN public.pessoas p ON p.id = v.pessoa_id AND p.organization_id = v.organization_id AND p.deleted_at IS NULL
 WHERE v.isencao_horario IS TRUE AND v.deleted_at IS NULL
   AND (v.data_fim IS NULL OR v.data_fim >= current_date)
ON CONFLICT (pessoa_id) DO NOTHING;

INSERT INTO public.pessoas_direitos_salariais_eventos
  (organization_id, pessoa_id, antes, depois, origem, feito_por)
SELECT d.organization_id, d.pessoa_id, NULL,
       jsonb_build_object('iht', d.iht, 'km', d.km, 'ajudas', d.ajudas), 'carga_inicial', NULL
  FROM public.pessoas_direitos_salariais d;


-- ==============================================================================
-- Conferir: falha a migration inteira se algo nao bater
-- ==============================================================================
DO $conferir$
DECLARE
  k_nike      constant uuid := 'b6ffce4f-f630-4933-833a-008649757a33'::uuid;
  k_a1        constant text := $a$  IF p_periodicidade IS NULL OR p_periodicidade NOT IN ('mensal', 'anual', 'hora') THEN$a$;
  k_a2        constant text := $a$  IF p_periodicidade IS NULL OR p_periodicidade NOT IN ('mensal', 'anual', 'hora', 'semanal') THEN$a$;
  k_b1        constant text := 'tem de ser mensal, anual ou hora.';
  k_b2        constant text := 'tem de ser mensal, anual, hora ou semanal.';
  k_teste_cargo constant text := 'Cargo teste regras salariais semanal (descartavel)';
  v_novas     text[] := ARRAY[
    'public.rpc_hr_regras_salariais_ler(uuid, date)',
    'public.rpc_hr_regras_salariais_historico(uuid)',
    'public.rpc_hr_regras_salariais_guardar(uuid, date, jsonb)',
    'public.rpc_hr_pessoa_direitos_ler(uuid, uuid)',
    'public.rpc_hr_pessoa_direitos_guardar(uuid, uuid, boolean, boolean, boolean)'];
  v_internas  text[] := ARRAY[
    'public.hr_regras_salariais_faixa_minutos(time without time zone, time without time zone)',
    'public.hr_regras_salariais_sem_sobreposicao()',
    'public.hr_regras_salariais_noturnas_sem_sobreposicao()',
    'public.hr_regras_salariais_imutavel()',
    'public.hr_regras_salariais_so_acrescentar()',
    'public.hr_regras_salariais_json(uuid, boolean)',
    'public.hr_regras_salariais_em(uuid, date)',
    'public.hr_regras_salariais_janela(uuid, date)',
    'public.hr_regras_salariais_guardar_core(uuid, date, jsonb, uuid)'];
  k_core      constant text := 'public.hr_cargo_definir_salario_core(uuid, numeric, text, date, text, uuid)';
  k_tabelas   text[] := ARRAY['public.hr_regras_salariais', 'public.hr_regras_salariais_noturnas',
                              'public.hr_regras_salariais_eventos', 'public.pessoas_direitos_salariais',
                              'public.pessoas_direitos_salariais_eventos'];
  v_fn        text;
  v_tab       text;
  v_grant     text;
  v_n         integer;
  v_m         integer;
  v_ok        boolean;
  v_msg       text;
  v_cons      text;
  v_j         jsonb;
  v_id        uuid;
  v_corr      uuid;
  v_id2       uuid;
  v_regra     jsonb;
  v_pid       uuid;
  v_cargo     uuid;
  v_sal       record;
  v_hoje      date := (now() AT TIME ZONE 'Europe/Lisbon')::date;
BEGIN
  -- 1. EXECUTE por aclexplode (sem o dono). NULL em proacl = o omisso (PUBLIC).
  FOREACH v_fn IN ARRAY v_novas || v_internas || ARRAY[k_core] LOOP
    IF to_regprocedure(v_fn) IS NULL THEN
      RAISE EXCEPTION 'Conferir: a funcao % nao existe.', v_fn;
    END IF;
    SELECT coalesce(string_agg(DISTINCT CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE a.grantee::regrole::text END, ','
                               ORDER BY CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE a.grantee::regrole::text END), '')
      INTO v_grant
      FROM pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
     WHERE p.oid = to_regprocedure(v_fn)::oid AND a.privilege_type = 'EXECUTE' AND a.grantee <> p.proowner;
    IF v_fn = ANY (v_novas) AND v_grant <> 'authenticated' THEN
      RAISE EXCEPTION 'Conferir: % devia ter EXECUTE so para authenticated; tem "%".', v_fn, v_grant;
    ELSIF v_fn <> ALL (v_novas) AND v_grant <> '' THEN
      RAISE EXCEPTION 'Conferir: a interna % tem EXECUTE para "%".', v_fn, v_grant;
    END IF;
  END LOOP;

  -- 2. prosecdef e search_path.
  FOREACH v_fn IN ARRAY v_novas || ARRAY[k_core] LOOP
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
  IF NOT EXISTS (SELECT 1 FROM pg_proc p
                  WHERE p.oid = to_regprocedure(k_core)::oid
                    AND coalesce(array_to_string(p.proconfig, ','), '') LIKE '%search_path=public, pg_temp%') THEN
    RAISE EXCEPTION 'Conferir: hr_cargo_definir_salario_core perdeu o search_path (public, pg_temp).';
  END IF;

  -- 3. O core mudou SO na lista e na mensagem da periodicidade.
  SELECT count(*) INTO v_n FROM tmp_rs_core_antigo;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'Conferir: o corpo antigo do core nao ficou guardado (% linhas).', v_n;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p, tmp_rs_core_antigo t
     WHERE p.oid = to_regprocedure(k_core)::oid
       AND replace(replace(replace(p.prosrc, chr(13), ''), k_a2, k_a1), k_b2, k_b1)
           = replace(t.prosrc, chr(13), '')) THEN
    RAISE EXCEPTION 'Conferir: o corpo novo de hr_cargo_definir_salario_core difere do remoto em mais do que a periodicidade semanal. Reler o corpo do remoto.';
  END IF;

  -- 3b. As tres funcoes do ramo semanal: o corpo novo, sem a linha
  --     acrescentada, e IGUAL ao antigo; SECURITY DEFINER, search_path e
  --     privilegios iguais; o ramo esta la uma vez.
  SELECT string_agg(t.fn, ', ') INTO v_grant
    FROM tmp_rs_semanal t
    JOIN pg_proc p ON p.oid = to_regprocedure(t.fn)::oid
   WHERE replace(p.prosrc, t.ancora || t.acrescento, t.ancora) IS DISTINCT FROM t.prosrc
      OR (length(p.prosrc) - length(replace(p.prosrc, t.acrescento, ''))) / length(t.acrescento) <> 1
      OR p.prosecdef IS DISTINCT FROM t.prosecdef
      OR coalesce(array_to_string(p.proconfig, ','), '') IS DISTINCT FROM t.proconfig
      OR coalesce(p.proacl::text, '') IS DISTINCT FROM t.proacl;
  IF v_grant IS NOT NULL OR (SELECT count(*) FROM tmp_rs_semanal) <> 3 THEN
    RAISE EXCEPTION 'Conferir: o ramo semanal mudou mais do que a linha acrescentada em: %.', coalesce(v_grant, '(faltam funcoes)');
  END IF;

  -- 4. Os CHECK de periodicidade aceitam semanal.
  SELECT count(*) INTO v_n FROM pg_constraint c
   WHERE c.contype::text = 'c'
     AND ((c.conrelid = to_regclass('public.hr_cargos_periodos') AND c.conname::text = 'hr_cargos_periodos_periodicidade_valida')
       OR (c.conrelid = to_regclass('public.hr_cargos') AND c.conname::text = 'hr_cargos_periodicidade_valida'))
     AND pg_get_constraintdef(c.oid)::text LIKE '%''semanal''%'
     AND pg_get_constraintdef(c.oid)::text LIKE '%''mensal''%'
     AND pg_get_constraintdef(c.oid)::text LIKE '%''anual''%'
     AND pg_get_constraintdef(c.oid)::text LIKE '%''hora''%';
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'Conferir: os CHECK de periodicidade de hr_cargos e hr_cargos_periodos nao ficaram com semanal (% de 2).', v_n;
  END IF;

  -- 5. Tabelas novas: RLS ligada e forcada, sem politicas, sem privilegios.
  FOREACH v_tab IN ARRAY k_tabelas LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_class c WHERE c.oid = to_regclass(v_tab)
                    AND c.relrowsecurity AND c.relforcerowsecurity) THEN
      RAISE EXCEPTION 'Conferir: % sem RLS ligada e forcada.', v_tab;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_policy pol WHERE pol.polrelid = to_regclass(v_tab)) THEN
      RAISE EXCEPTION 'Conferir: % tem politicas; o desenho e sem nenhuma.', v_tab;
    END IF;
    SELECT coalesce(string_agg(DISTINCT CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE a.grantee::regrole::text END
                               || ':' || a.privilege_type::text, ','), '')
      INTO v_grant
      FROM pg_class c, aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
     WHERE c.oid = to_regclass(v_tab) AND a.grantee <> c.relowner;
    IF v_grant <> '' THEN
      RAISE EXCEPTION 'Conferir: % tem privilegios para "%".', v_tab, v_grant;
    END IF;
    SELECT count(*) INTO v_n FROM pg_attribute a
     WHERE a.attrelid = to_regclass(v_tab) AND a.attnum > 0 AND NOT a.attisdropped AND a.attacl IS NOT NULL;
    IF v_n <> 0 THEN
      RAISE EXCEPTION 'Conferir: % tem % colunas com privilegios proprios.', v_tab, v_n;
    END IF;
  END LOOP;

  SELECT count(*) INTO v_n FROM pg_constraint c
   WHERE c.conrelid = to_regclass('public.hr_regras_salariais')
     AND c.conname::text IN ('hr_regras_salariais_pkey', 'hr_regras_salariais_org_fkey',
       'hr_regras_salariais_created_by_fkey', 'hr_regras_salariais_substituida_por_fkey',
       'hr_regras_salariais_substituicao_coerente',
       'hr_regras_salariais_datas_validas', 'hr_regras_salariais_subsidio_limite_intervalo',
       'hr_regras_salariais_subsidio_hora_intervalo', 'hr_regras_salariais_subsidio_dia_intervalo',
       'hr_regras_salariais_he_pcts_intervalo', 'hr_regras_salariais_he_limite_intervalo',
       'hr_regras_salariais_iht_intervalo', 'hr_regras_salariais_km_intervalo',
       'hr_regras_salariais_ajudas_intervalo');
  SELECT count(*) INTO v_m FROM pg_constraint c
   WHERE c.conrelid = to_regclass('public.hr_regras_salariais_noturnas')
     AND c.conname::text IN ('hr_regras_salariais_noturnas_pkey', 'hr_regras_salariais_noturnas_regra_fkey',
       'hr_regras_salariais_noturnas_um_so_valor', 'hr_regras_salariais_noturnas_percentagem_intervalo',
       'hr_regras_salariais_noturnas_preco_intervalo', 'hr_regras_salariais_noturnas_horas_validas');
  IF v_n <> 14 OR v_m <> 6 THEN
    RAISE EXCEPTION 'Conferir: restricoes em falta (regras % de 14, noturnas % de 6).', v_n, v_m;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint c
                  WHERE c.conrelid = to_regclass('public.pessoas_direitos_salariais')
                    AND c.conname::text = 'pessoas_direitos_salariais_pessoa_fkey' AND c.contype::text = 'f')
     OR NOT EXISTS (SELECT 1 FROM pg_constraint c
                     WHERE c.conrelid = to_regclass('public.hr_regras_salariais_eventos')
                       AND c.conname::text = 'hr_regras_salariais_eventos_accao_valida' AND c.contype::text = 'c') THEN
    RAISE EXCEPTION 'Conferir: falta a FK de pessoas_direitos_salariais ou o CHECK das accoes dos eventos.';
  END IF;
  SELECT count(*) INTO v_n FROM pg_attribute a
   WHERE a.attrelid = to_regclass('public.hr_regras_salariais') AND a.attnum > 0 AND NOT a.attisdropped
     AND a.attname::text IN ('subsidio_limite_min', 'subsidio_valor_hora', 'subsidio_valor_dia', 'he_pct_dia_util',
                             'he_pct_feriado', 'he_pct_descanso', 'he_limite_anual_min', 'iht_pct', 'km_valor',
                             'ajudas_custo_dia')
     AND a.attnotnull
     AND format_type(a.atttypid, a.atttypmod)::text IN ('integer', 'numeric(10,2)', 'numeric(5,2)');
  IF v_n <> 10 THEN
    RAISE EXCEPTION 'Conferir: os 10 valores das regras deviam ser NOT NULL com integer/numeric(10,2)/numeric(5,2) (% de 10).', v_n;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_index i JOIN pg_class ci ON ci.oid = i.indexrelid
                  WHERE i.indrelid = to_regclass('public.hr_regras_salariais')
                    AND ci.relname::text = 'uq_hr_regras_salariais_org_aberta'
                    AND i.indisunique AND i.indpred IS NOT NULL) THEN
    RAISE EXCEPTION 'Conferir: falta o indice unico parcial de uma versao em aberto por organizacao.';
  END IF;
  SELECT count(*) INTO v_n FROM pg_trigger t
   WHERE NOT t.tgisinternal AND t.tgenabled::text <> 'D'
     AND t.tgrelid IN (to_regclass('public.hr_regras_salariais'), to_regclass('public.hr_regras_salariais_noturnas'),
                       to_regclass('public.hr_regras_salariais_eventos'), to_regclass('public.pessoas_direitos_salariais_eventos'))
     AND t.tgname::text IN ('trg_hr_regras_salariais_sem_sobreposicao', 'trg_hr_regras_salariais_imutavel',
                            'trg_hr_regras_salariais_sem_truncate',
                            'trg_hr_regras_salariais_noturnas_sem_sobreposicao', 'trg_hr_regras_salariais_noturnas_so_acrescentar',
                            'trg_hr_regras_salariais_noturnas_sem_truncate',
                            'trg_hr_regras_salariais_eventos_so_acrescentar', 'trg_hr_regras_salariais_eventos_sem_truncate',
                            'trg_pessoas_direitos_salariais_eventos_so_acrescentar',
                            'trg_pessoas_direitos_salariais_eventos_sem_truncate');
  IF v_n <> 10 THEN
    RAISE EXCEPTION 'Conferir: deviam existir 10 triggers ligados (sobreposicao e historico); ha %.', v_n;
  END IF;
  -- HIGH1: nenhum trigger em pessoas_vinculos liga direitos.
  IF EXISTS (SELECT 1 FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid
              WHERE t.tgrelid = to_regclass('public.pessoas_vinculos') AND NOT t.tgisinternal
                AND p.prosrc LIKE '%pessoas_direitos_salariais%') THEN
    RAISE EXCEPTION 'Conferir: ha um trigger em pessoas_vinculos que escreve direitos salariais.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid = to_regprocedure('public.rpc_hr_pessoa_direitos_guardar(uuid, uuid, boolean, boolean, boolean)')::oid
                    AND p.prosrc LIKE '%pessoas_contas%' AND p.prosrc LIKE '%email_trabalho%'
                    AND p.prosrc LIKE '%actor_sem_pessoa%' AND p.prosrc NOT LIKE '%direitos_salariais_proprios%') THEN
    RAISE EXCEPTION 'Conferir: rpc_hr_pessoa_direitos_guardar nao confere os proprios direitos como desenhado.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid = to_regprocedure('public.rpc_hr_regras_salariais_guardar(uuid, date, jsonb)')::oid
                    AND p.prosrc LIKE '%hr_regras_salariais_janela%')
     OR NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid = to_regprocedure('public.hr_regras_salariais_guardar_core(uuid, date, jsonb, uuid)')::oid
                       AND p.prosrc LIKE '%pg_advisory_xact_lock%' AND p.prosrc LIKE '%regras_salariais_periodo_fechado%'
                       AND p.prosrc LIKE '%hr_regras_salariais_eventos%') THEN
    RAISE EXCEPTION 'Conferir: a RPC de guardar nao aplica a janela, ou o core nao toma o lock, nao recusa folhas fechadas ou nao escreve eventos.';
  END IF;

  -- 6. Dados.
  SELECT count(*) INTO v_n FROM public.hr_regras_subsidio_alimentacao;
  SELECT count(*) INTO v_m FROM public.hr_regras_salariais r
   WHERE r.valido_de = DATE '2026-01-01' AND r.valido_ate IS NULL AND r.substituida_em IS NULL
     AND r.subsidio_limite_min = 300 AND r.subsidio_valor_hora = 0.76 AND r.subsidio_valor_dia = 6.15
     AND r.he_pct_dia_util = 50 AND r.he_pct_feriado = 75 AND r.he_pct_descanso = 100
     AND r.he_limite_anual_min = 6000 AND r.iht_pct = 25 AND r.km_valor = 0.40 AND r.ajudas_custo_dia = 65.89
     AND EXISTS (SELECT 1 FROM public.hr_regras_subsidio_alimentacao s WHERE s.organization_id = r.organization_id);
  IF v_m <> v_n OR (SELECT count(*) FROM public.hr_regras_salariais) <> v_n
     OR (SELECT count(*) FROM public.hr_regras_salariais_eventos WHERE accao = 'criar') <> v_n
     OR (SELECT count(*) FROM public.hr_regras_salariais_eventos) <> v_n THEN
    RAISE EXCEPTION 'Conferir: esperava-se uma primeira versao (e um evento criar) por organizacao com subsidio (%), com os valores definidos; ha %.', v_n, v_m;
  END IF;
  IF EXISTS (SELECT 1 FROM public.hr_regras_salariais_noturnas) THEN
    RAISE EXCEPTION 'Conferir: a migracao de dados nao devia criar faixas noturnas.';
  END IF;
  SELECT count(DISTINCT p.id) INTO v_n
    FROM public.pessoas_vinculos v
    JOIN public.pessoas p ON p.id = v.pessoa_id AND p.organization_id = v.organization_id AND p.deleted_at IS NULL
   WHERE v.isencao_horario IS TRUE AND v.deleted_at IS NULL
     AND (v.data_fim IS NULL OR v.data_fim >= current_date);
  SELECT count(*) INTO v_m FROM public.pessoas_direitos_salariais d WHERE d.iht AND NOT d.km AND NOT d.ajudas;
  IF v_n <> v_m OR (SELECT count(*) FROM public.pessoas_direitos_salariais) <> v_n
     OR (SELECT count(*) FROM public.pessoas_direitos_salariais_eventos WHERE origem = 'carga_inicial') <> v_n
     OR (SELECT count(*) FROM public.pessoas_direitos_salariais_eventos) <> v_n THEN
    RAISE EXCEPTION 'Conferir: % pessoa(s) com isencao de horario, mas % linha(s) de IHT na carga inicial (ou eventos a mais).', v_n, v_m;
  END IF;

  -- 7. Comportamento, na nike, em 2098-2100, DESFEITO no fim (sentinela HRS00).
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.anew_organizations o WHERE o.id = k_nike)
       OR NOT EXISTS (SELECT 1 FROM public.hr_regras_salariais r WHERE r.organization_id = k_nike AND r.valido_ate IS NULL) THEN
      RAISE EXCEPTION 'Conferir: a nike nao existe ou ficou sem versao em aberto.';
    END IF;

    v_regra := jsonb_build_object(
      'subsidio_limite_min', 310, 'subsidio_valor_hora', 0.80, 'subsidio_valor_dia', 6.50,
      'he_pct_dia_util', 50, 'he_pct_feriado', 75, 'he_pct_descanso', 100, 'he_limite_anual_min', 6000,
      'iht_pct', 25, 'km_valor', 0.40, 'ajudas_custo_dia', 65.89,
      'noturnas', jsonb_build_array(
        jsonb_build_object('hora_inicio', '21:00', 'hora_fim', '02:00', 'percentagem', 25),
        jsonb_build_object('hora_inicio', '06:00', 'hora_fim', '07:00', 'preco_hora', 1.50)));

    -- 7.a folha de 03/2098 fechada: datas em ou antes do fim recusadas.
    INSERT INTO public.hr_periodos_processamento (organization_id, ano, mes, estado, data_inicio, data_fim)
    VALUES (k_nike, 2098, 3, 'aberto', DATE '2098-03-01', DATE '2098-03-31')
    RETURNING id INTO v_id;
    UPDATE public.hr_periodos_processamento SET estado = 'fechado', fechado_em = now() WHERE id = v_id;

    v_msg := NULL;
    BEGIN
      PERFORM public.hr_regras_salariais_guardar_core(k_nike, DATE '2098-03-15', v_regra, NULL);
    EXCEPTION WHEN OTHERS THEN v_msg := SQLERRM;
    END;
    IF v_msg IS NULL OR position('regras_salariais_periodo_fechado' IN v_msg) <> 1 THEN
      RAISE EXCEPTION 'Conferir: uma versao dentro de uma folha fechada nao foi recusada (%).', coalesce(v_msg, 'aceite');
    END IF;
    v_msg := NULL;
    BEGIN
      PERFORM public.hr_regras_salariais_guardar_core(k_nike, DATE '2098-02-01', v_regra, NULL);
    EXCEPTION WHEN OTHERS THEN v_msg := SQLERRM;
    END;
    IF v_msg IS NULL OR position('regras_salariais_periodo_fechado' IN v_msg) <> 1 THEN
      RAISE EXCEPTION 'Conferir: uma versao antes de uma folha fechada nao foi recusada (%).', coalesce(v_msg, 'aceite');
    END IF;

    -- 7.b vigencia: nova versao a 2098-04-01 fecha a anterior a 2098-03-31;
    --     uma faixa atravessa a meia-noite (21:00-02:00); outra a preco por hora.
    v_id := public.hr_regras_salariais_guardar_core(k_nike, DATE '2098-04-01', v_regra, NULL);
    v_j := public.hr_regras_salariais_em(k_nike, DATE '2098-03-31');
    IF (v_j ->> 'subsidio_limite_min')::integer IS DISTINCT FROM 300
       OR (v_j ->> 'valido_ate')::date IS DISTINCT FROM DATE '2098-03-31' THEN
      RAISE EXCEPTION 'Conferir: a 31/03/2098 devia valer a primeira versao (300 min) fechada nesse dia; deu %.', v_j::text;
    END IF;
    v_j := public.hr_regras_salariais_em(k_nike, DATE '2098-04-01');
    IF (v_j ->> 'id')::uuid IS DISTINCT FROM v_id OR (v_j ->> 'subsidio_limite_min')::integer IS DISTINCT FROM 310
       OR jsonb_array_length(v_j -> 'noturnas') <> 2
       OR (v_j -> 'noturnas' -> 1 ->> 'hora_inicio') IS DISTINCT FROM '21:00'
       OR (v_j -> 'noturnas' -> 1 ->> 'hora_fim') IS DISTINCT FROM '02:00'
       OR (v_j -> 'noturnas' -> 0 ->> 'hora_inicio') IS DISTINCT FROM '06:00'
       OR (v_j -> 'noturnas' -> 0 ->> 'preco_hora')::numeric IS DISTINCT FROM 1.50 THEN
      RAISE EXCEPTION 'Conferir: a 01/04/2098 devia valer a versao nova (310 min, 2 faixas, 06:00-07:00 a preco e 21:00-02:00); deu %.', v_j::text;
    END IF;
    IF public.hr_regras_salariais_em(k_nike, DATE '1999-12-31') IS NOT NULL THEN
      RAISE EXCEPTION 'Conferir: antes da primeira versao nao devia haver regra.';
    END IF;
    IF (SELECT count(*) FROM public.hr_regras_salariais_eventos e
         WHERE e.organization_id = k_nike
           AND ((e.accao = 'fechar' AND (e.antes ->> 'valido_ate') IS NULL AND (e.depois ->> 'valido_ate')::date = DATE '2098-03-31')
             OR (e.accao = 'criar' AND e.regra_id = v_id AND jsonb_array_length(e.depois -> 'noturnas') = 2))) <> 2 THEN
      RAISE EXCEPTION 'Conferir: guardar a versao de 01/04/2098 devia deixar os eventos fechar (com o antes) e criar (com as faixas).';
    END IF;

    -- 7.c corrigir a versao mais recente (mesma data): a antiga fica
    --     substituida com as suas faixas; a nova toma o lugar; evento corrigir.
    v_corr := public.hr_regras_salariais_guardar_core(
      k_nike, DATE '2098-04-01',
      jsonb_set(jsonb_set(v_regra, '{subsidio_limite_min}', '320'::jsonb), '{noturnas}', '[]'::jsonb), NULL);
    IF v_corr = v_id
       OR (public.hr_regras_salariais_em(k_nike, DATE '2098-05-01') ->> 'id')::uuid IS DISTINCT FROM v_corr
       OR (public.hr_regras_salariais_em(k_nike, DATE '2098-05-01') ->> 'subsidio_limite_min')::integer IS DISTINCT FROM 320
       OR NOT EXISTS (SELECT 1 FROM public.hr_regras_salariais r WHERE r.id = v_id AND r.substituida_em IS NOT NULL)
       OR (SELECT count(*) FROM public.hr_regras_salariais_noturnas n WHERE n.regra_id = v_id) <> 2
       OR NOT EXISTS (SELECT 1 FROM public.hr_regras_salariais_eventos e
                       WHERE e.regra_id = v_corr AND e.accao = 'corrigir'
                         AND (e.antes ->> 'id')::uuid = v_id AND (e.antes ->> 'subsidio_limite_min')::integer = 310) THEN
      RAISE EXCEPTION 'Conferir: corrigir a versao de 01/04/2098 devia criar outra (320 min), deixar a antiga substituida com as faixas e o evento corrigir com o antes.';
    END IF;

    -- 7.d historico: nada se reescreve nem se apaga.
    v_n := 0;
    BEGIN UPDATE public.hr_regras_salariais SET iht_pct = 30 WHERE id = v_corr;
    EXCEPTION WHEN OTHERS THEN IF position('regras_salariais_historico_imutavel' IN SQLERRM) = 1 THEN v_n := v_n + 1; END IF; END;
    BEGIN DELETE FROM public.hr_regras_salariais WHERE id = v_corr;
    EXCEPTION WHEN OTHERS THEN IF position('regras_salariais_historico_imutavel' IN SQLERRM) = 1 THEN v_n := v_n + 1; END IF; END;
    BEGIN UPDATE public.hr_regras_salariais SET valido_ate = DATE '2098-12-31' WHERE id = v_id;
    EXCEPTION WHEN OTHERS THEN IF position('regras_salariais_historico_imutavel' IN SQLERRM) = 1 THEN v_n := v_n + 1; END IF; END;
    BEGIN DELETE FROM public.hr_regras_salariais_noturnas WHERE regra_id = v_id;
    EXCEPTION WHEN OTHERS THEN IF position('regras_salariais_historico_imutavel' IN SQLERRM) = 1 THEN v_n := v_n + 1; END IF; END;
    BEGIN UPDATE public.hr_regras_salariais_eventos SET depois = '{}'::jsonb WHERE organization_id = k_nike;
    EXCEPTION WHEN OTHERS THEN IF position('regras_salariais_historico_imutavel' IN SQLERRM) = 1 THEN v_n := v_n + 1; END IF; END;
    BEGIN DELETE FROM public.hr_regras_salariais_eventos WHERE organization_id = k_nike;
    EXCEPTION WHEN OTHERS THEN IF position('regras_salariais_historico_imutavel' IN SQLERRM) = 1 THEN v_n := v_n + 1; END IF; END;
    INSERT INTO public.pessoas_direitos_salariais_eventos (organization_id, pessoa_id, depois, origem)
    VALUES (k_nike, gen_random_uuid(), '{"iht": false, "km": false, "ajudas": false}'::jsonb, 'rpc');
    BEGIN DELETE FROM public.pessoas_direitos_salariais_eventos WHERE organization_id = k_nike;
    EXCEPTION WHEN OTHERS THEN IF position('regras_salariais_historico_imutavel' IN SQLERRM) = 1 THEN v_n := v_n + 1; END IF; END;
    IF v_n <> 7 THEN
      RAISE EXCEPTION 'Conferir: das 7 tentativas de reescrever ou apagar historico so % foram recusadas.', v_n;
    END IF;

    -- 7.e datas: em folha fechada; anterior a versao mais recente.
    v_msg := NULL;
    BEGIN
      PERFORM public.hr_regras_salariais_guardar_core(k_nike, DATE '2098-03-31', v_regra, NULL);
    EXCEPTION WHEN OTHERS THEN v_msg := SQLERRM;
    END;
    IF v_msg IS NULL OR position('regras_salariais_periodo_fechado' IN v_msg) <> 1 THEN
      RAISE EXCEPTION 'Conferir: 31/03/2098 (ultimo dia da folha fechada) devia ser recusado (%).', coalesce(v_msg, 'aceite');
    END IF;
    PERFORM public.hr_regras_salariais_guardar_core(k_nike, DATE '2100-01-01', v_regra, NULL);
    v_msg := NULL;
    BEGIN
      PERFORM public.hr_regras_salariais_guardar_core(k_nike, DATE '2099-06-01', v_regra, NULL);
    EXCEPTION WHEN OTHERS THEN v_msg := SQLERRM;
    END;
    IF v_msg IS NULL OR position('regras_salariais_data_anterior' IN v_msg) <> 1 THEN
      RAISE EXCEPTION 'Conferir: uma versao anterior a mais recente nao foi recusada (%).', coalesce(v_msg, 'aceite');
    END IF;

    -- 7.f janela da RPC: antes da folha em curso e a mais de 5 anos recusadas;
    --     hoje aceite (so valida, nao escreve).
    v_msg := NULL;
    BEGIN
      PERFORM public.hr_regras_salariais_janela(k_nike, v_hoje - 400);
    EXCEPTION WHEN OTHERS THEN v_msg := SQLERRM;
    END;
    IF v_msg IS NULL OR position('regras_salariais_retroactiva' IN v_msg) <> 1 THEN
      RAISE EXCEPTION 'Conferir: uma data de ha 400 dias passou a janela (%).', coalesce(v_msg, 'aceite');
    END IF;
    v_msg := NULL;
    BEGIN
      PERFORM public.hr_regras_salariais_janela(k_nike, (v_hoje + interval '6 years')::date);
    EXCEPTION WHEN OTHERS THEN v_msg := SQLERRM;
    END;
    IF v_msg IS NULL OR position('regras_salariais_data_invalida' IN v_msg) <> 1 THEN
      RAISE EXCEPTION 'Conferir: uma data a 6 anos passou a janela (%).', coalesce(v_msg, 'aceite');
    END IF;
    PERFORM public.hr_regras_salariais_janela(k_nike, v_hoje);

    -- 7.g faixas sobrepostas (uma atravessa a meia-noite): recusadas.
    v_msg := NULL;
    BEGIN
      PERFORM public.hr_regras_salariais_guardar_core(k_nike, DATE '2100-06-01',
        jsonb_set(v_regra, '{noturnas}', jsonb_build_array(
          jsonb_build_object('hora_inicio', '22:00', 'hora_fim', '02:00', 'percentagem', 25),
          jsonb_build_object('hora_inicio', '01:00', 'hora_fim', '06:00', 'percentagem', 30))), NULL);
    EXCEPTION WHEN OTHERS THEN v_msg := SQLERRM;
    END;
    IF v_msg IS NULL OR position('regras_salariais_faixas_sobrepostas' IN v_msg) <> 1 THEN
      RAISE EXCEPTION 'Conferir: faixas sobrepostas atravessando a meia-noite nao foram recusadas (%).', coalesce(v_msg, 'aceite');
    END IF;
    -- Encostadas (21:00-24:00 e 00:00-06:00, o exemplo do utilizador): aceites;
    -- 24:00 guarda-se como fim do dia.
    v_id2 := public.hr_regras_salariais_guardar_core(k_nike, DATE '2100-06-01',
      jsonb_set(v_regra, '{noturnas}', jsonb_build_array(
        jsonb_build_object('hora_inicio', '21:00', 'hora_fim', '24:00', 'percentagem', 25),
        jsonb_build_object('hora_inicio', '00:00', 'hora_fim', '06:00', 'percentagem', 30))), NULL);
    IF (SELECT count(*) FROM public.hr_regras_salariais_noturnas n
         WHERE n.regra_id = v_id2 AND n.hora_fim IN (TIME '24:00', TIME '06:00')) <> 2
       OR (public.hr_regras_salariais_em(k_nike, DATE '2100-06-01') -> 'noturnas' -> 1 ->> 'hora_fim') IS DISTINCT FROM '24:00' THEN
      RAISE EXCEPTION 'Conferir: as faixas 21:00-24:00 e 00:00-06:00 deviam ficar gravadas, com 24:00 como fim do dia.';
    END IF;
    -- O dia inteiro (00:00-24:00) e aceite; com outra faixa por cima, recusado.
    PERFORM public.hr_regras_salariais_guardar_core(k_nike, DATE '2100-08-01',
      jsonb_set(v_regra, '{noturnas}', jsonb_build_array(
        jsonb_build_object('hora_inicio', '00:00', 'hora_fim', '24:00', 'preco_hora', 2.00))), NULL);
    IF public.hr_regras_salariais_faixa_minutos(TIME '00:00', TIME '24:00')
       IS DISTINCT FROM '{[0,1440)}'::int4multirange THEN
      RAISE EXCEPTION 'Conferir: 00:00-24:00 devia cobrir os 1440 minutos do dia.';
    END IF;
    v_msg := NULL;
    BEGIN
      PERFORM public.hr_regras_salariais_guardar_core(k_nike, DATE '2100-09-01',
        jsonb_set(v_regra, '{noturnas}', jsonb_build_array(
          jsonb_build_object('hora_inicio', '00:00', 'hora_fim', '24:00', 'preco_hora', 2.00),
          jsonb_build_object('hora_inicio', '21:00', 'hora_fim', '23:00', 'percentagem', 25))), NULL);
    EXCEPTION WHEN OTHERS THEN v_msg := SQLERRM;
    END;
    IF v_msg IS NULL OR position('regras_salariais_faixas_sobrepostas' IN v_msg) <> 1 THEN
      RAISE EXCEPTION 'Conferir: uma faixa por cima do dia inteiro nao foi recusada (%).', coalesce(v_msg, 'aceite');
    END IF;
    -- Inteiros em notacao decimal (300.0) aceites; 300.5 recusado.
    PERFORM public.hr_regras_salariais_guardar_core(k_nike, DATE '2100-10-01',
      jsonb_set(v_regra, '{subsidio_limite_min}', '300.0'::jsonb), NULL);
    v_msg := NULL;
    BEGIN
      PERFORM public.hr_regras_salariais_guardar_core(k_nike, DATE '2100-11-01',
        jsonb_set(v_regra, '{he_limite_anual_min}', '6000.5'::jsonb), NULL);
    EXCEPTION WHEN OTHERS THEN v_msg := SQLERRM;
    END;
    IF v_msg IS NULL OR position('regras_salariais_valor_invalido' IN v_msg) <> 1 THEN
      RAISE EXCEPTION 'Conferir: um limite anual com decimais nao foi recusado (%).', coalesce(v_msg, 'aceite');
    END IF;

    -- 7.h valores fora de intervalo e faixas mal formadas: recusados.
    v_n := 0;
    BEGIN PERFORM public.hr_regras_salariais_guardar_core(k_nike, DATE '2100-07-01', jsonb_set(v_regra, '{iht_pct}', '150'::jsonb), NULL);
    EXCEPTION WHEN OTHERS THEN IF position('regras_salariais_fora_de_intervalo' IN SQLERRM) = 1 THEN v_n := v_n + 1; END IF; END;
    BEGIN PERFORM public.hr_regras_salariais_guardar_core(k_nike, DATE '2100-07-01', jsonb_set(v_regra, '{subsidio_valor_dia}', '615'::jsonb), NULL);
    EXCEPTION WHEN OTHERS THEN IF position('regras_salariais_fora_de_intervalo' IN SQLERRM) = 1 THEN v_n := v_n + 1; END IF; END;
    BEGIN PERFORM public.hr_regras_salariais_guardar_core(k_nike, DATE '2100-07-01', jsonb_set(v_regra, '{km_valor}', '40'::jsonb), NULL);
    EXCEPTION WHEN OTHERS THEN IF position('regras_salariais_fora_de_intervalo' IN SQLERRM) = 1 THEN v_n := v_n + 1; END IF; END;
    BEGIN PERFORM public.hr_regras_salariais_guardar_core(k_nike, DATE '2100-07-01',
            jsonb_set(v_regra, '{noturnas}', jsonb_build_array(
              jsonb_build_object('hora_inicio', '21:00', 'hora_fim', '23:00', 'percentagem', 600))), NULL);
    EXCEPTION WHEN OTHERS THEN IF position('regras_salariais_fora_de_intervalo' IN SQLERRM) = 1 THEN v_n := v_n + 1; END IF; END;
    BEGIN PERFORM public.hr_regras_salariais_guardar_core(k_nike, DATE '2100-07-01',
            jsonb_set(v_regra, '{noturnas}', jsonb_build_array(
              jsonb_build_object('hora_inicio', '21:00', 'hora_fim', '23:00', 'percentagem', 25, 'preco_hora', 1))), NULL);
    EXCEPTION WHEN OTHERS THEN IF position('regras_salariais_faixa_invalida' IN SQLERRM) = 1 THEN v_n := v_n + 1; END IF; END;
    BEGIN PERFORM public.hr_regras_salariais_guardar_core(k_nike, DATE '2100-07-01', v_regra - 'km_valor', NULL);
    EXCEPTION WHEN OTHERS THEN IF position('regras_salariais_dados_em_falta' IN SQLERRM) = 1 THEN v_n := v_n + 1; END IF; END;
    IF v_n <> 6 THEN
      RAISE EXCEPTION 'Conferir: das 6 regras invalidas (IHT 150, subsidio 615, km 40, faixa 600, faixa com os dois valores, sem km) so % foram recusadas com o erro certo.', v_n;
    END IF;
    v_ok := false;
    BEGIN
      INSERT INTO public.hr_regras_salariais_noturnas (regra_id, hora_inicio, hora_fim)
      VALUES (v_corr, TIME '01:00', TIME '02:00');
    EXCEPTION WHEN check_violation THEN
      GET STACKED DIAGNOSTICS v_cons = CONSTRAINT_NAME;
      v_ok := v_cons = 'hr_regras_salariais_noturnas_um_so_valor';
    END;
    IF NOT v_ok THEN
      RAISE EXCEPTION 'Conferir: uma faixa sem percentagem nem preco foi aceite pela tabela.';
    END IF;
    v_ok := false;
    BEGIN
      INSERT INTO public.hr_regras_salariais
        (organization_id, valido_de, valido_ate, subsidio_limite_min, subsidio_valor_hora, subsidio_valor_dia,
         he_pct_dia_util, he_pct_feriado, he_pct_descanso, he_limite_anual_min, iht_pct, km_valor, ajudas_custo_dia)
      VALUES (k_nike, DATE '2098-05-01', DATE '2098-05-31', 300, 0.76, 6.15, 50, 75, 100, 6000, 25, 0.40, 65.89);
    EXCEPTION WHEN exclusion_violation THEN
      v_ok := position('regras_salariais_versoes_sobrepostas' IN SQLERRM) = 1;
    END;
    IF NOT v_ok THEN
      RAISE EXCEPTION 'Conferir: uma versao sobreposta foi aceite pela tabela.';
    END IF;

    -- 7.i sem permissao (sessao fabricada, sem papeis): tudo recusado com 42501.
    PERFORM set_config('request.jwt.claim.sub', x.u::text, true),
            set_config('request.jwt.claims', json_build_object('sub', x.u, 'role', 'authenticated')::text, true)
      FROM (SELECT gen_random_uuid() AS u) x;
    SELECT p.id INTO v_pid FROM public.pessoas p
     WHERE p.organization_id = k_nike AND p.deleted_at IS NULL ORDER BY p.id LIMIT 1;

    v_n := 0;
    BEGIN PERFORM public.rpc_hr_regras_salariais_ler(k_nike, DATE '2098-04-01');
    EXCEPTION WHEN SQLSTATE '42501' THEN IF position('regras_salariais_sem_permissao' IN SQLERRM) = 1 THEN v_n := v_n + 1; END IF; END;
    BEGIN PERFORM public.rpc_hr_regras_salariais_historico(k_nike);
    EXCEPTION WHEN SQLSTATE '42501' THEN IF position('regras_salariais_sem_permissao' IN SQLERRM) = 1 THEN v_n := v_n + 1; END IF; END;
    BEGIN PERFORM public.rpc_hr_regras_salariais_guardar(k_nike, v_hoje, v_regra);
    EXCEPTION WHEN SQLSTATE '42501' THEN IF position('regras_salariais_sem_permissao' IN SQLERRM) = 1 THEN v_n := v_n + 1; END IF; END;
    BEGIN PERFORM * FROM public.rpc_hr_pessoa_direitos_ler(k_nike, NULL);
    EXCEPTION WHEN SQLSTATE '42501' THEN IF position('direitos_salariais_sem_permissao' IN SQLERRM) = 1 THEN v_n := v_n + 1; END IF; END;
    BEGIN PERFORM public.rpc_hr_pessoa_direitos_guardar(k_nike, coalesce(v_pid, gen_random_uuid()), true, true, true);
    EXCEPTION WHEN SQLSTATE '42501' THEN IF position('direitos_salariais_sem_permissao' IN SQLERRM) = 1 THEN v_n := v_n + 1; END IF; END;
    IF v_n <> 5 THEN
      RAISE EXCEPTION 'Conferir: sem permissao, das 5 RPCs so % recusaram com 42501 e a mensagem certa.', v_n;
    END IF;
    PERFORM set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '{}', true);

    -- 7.j direitos: uma linha por pessoa.
    IF v_pid IS NOT NULL THEN
      DELETE FROM public.pessoas_direitos_salariais d WHERE d.pessoa_id = v_pid;
      INSERT INTO public.pessoas_direitos_salariais (pessoa_id, organization_id, km) VALUES (v_pid, k_nike, true);
      v_ok := false;
      BEGIN
        INSERT INTO public.pessoas_direitos_salariais (pessoa_id, organization_id) VALUES (v_pid, k_nike);
      EXCEPTION WHEN unique_violation THEN v_ok := true;
      END;
      IF NOT v_ok THEN
        RAISE EXCEPTION 'Conferir: duas linhas de direitos para a mesma pessoa.';
      END IF;
    END IF;

    -- 7.k periodicidade semanal: cargo criado pelo teste (o core so aceita datas
    --     de hoje a 5 anos; o cargo e tudo o resto desfaz-se no fim).
    INSERT INTO public.hr_cargos (organization_id, nome, salario_base, periodicidade)
    VALUES (k_nike, k_teste_cargo, 0, 'semanal')
    RETURNING id INTO v_cargo;
    PERFORM public.hr_cargo_definir_salario_core(v_cargo, 250, 'semanal', current_date + 1, 'teste semanal', NULL);
    SELECT * INTO v_sal FROM public.hr_cargo_salario_em(v_cargo, current_date + 1);
    IF v_sal.periodicidade IS DISTINCT FROM 'semanal' OR v_sal.salario_base IS DISTINCT FROM 250::numeric THEN
      RAISE EXCEPTION 'Conferir: o cargo devia valer 250 por semana desde amanha; vale % %.', v_sal.salario_base, v_sal.periodicidade;
    END IF;
    -- O custo/hora do cargo semanal ja nao e NULL: 250 x 52 / 12 por mes.
    IF public.fn_rh_custo_hora_cargo_em(k_nike, v_cargo, current_date + 1, NULL)
       IS DISTINCT FROM public.fn_cat_custo_hora_salario(k_nike, 250::numeric * 52 / 12) THEN
      RAISE EXCEPTION 'Conferir: fn_rh_custo_hora_cargo_em de um cargo semanal devia usar 250 x 52 / 12 por mes; deu %.',
        coalesce(public.fn_rh_custo_hora_cargo_em(k_nike, v_cargo, current_date + 1, NULL)::text, 'NULL');
    END IF;
    v_msg := NULL;
    BEGIN
      PERFORM public.hr_cargo_definir_salario_core(v_cargo, 260, 'diaria', current_date + 2, 'teste diaria', NULL);
    EXCEPTION WHEN SQLSTATE 'HRC03' THEN v_msg := SQLERRM;
    END;
    IF v_msg IS NULL THEN
      RAISE EXCEPTION 'Conferir: uma periodicidade fora da lista (diaria) foi aceite no cargo.';
    END IF;

    RAISE EXCEPTION 'teste_regras_salariais_ok' USING ERRCODE = 'HRS00';
  EXCEPTION
    WHEN SQLSTATE 'HRS00' THEN
      NULL; -- sucesso: tudo o que o bloco escreveu na nike foi desfeito.
  END;

  IF (SELECT count(*) FROM public.hr_regras_salariais r WHERE r.organization_id = k_nike) <> 1
     OR EXISTS (SELECT 1 FROM public.hr_regras_salariais r
                 WHERE r.organization_id = k_nike AND (r.valido_ate IS NOT NULL OR r.substituida_em IS NOT NULL))
     OR (SELECT count(*) FROM public.hr_regras_salariais_eventos e WHERE e.organization_id = k_nike) <> 1
     OR EXISTS (SELECT 1 FROM public.hr_periodos_processamento pp WHERE pp.organization_id = k_nike AND pp.ano >= 2098)
     OR EXISTS (SELECT 1 FROM public.hr_cargos c WHERE c.organization_id = k_nike AND c.nome = k_teste_cargo) THEN
    RAISE EXCEPTION 'Conferir: o teste deixou linhas na nike.';
  END IF;

  RAISE NOTICE 'Conferido: regras salariais versionadas com historico append-only (vigencia, correccao por substituicao, folha fechada, janela, faixas a atravessar a meia-noite, sobreposicao e intervalos recusados), direitos por pessoa (IHT na carga inicial para % pessoa(s), sem trigger), periodicidade semanal no cargo, RPCs so para authenticated com permissao.',
    (SELECT count(*) FROM public.pessoas_direitos_salariais);
END;
$conferir$;

-- ==============================================================================
-- ANTES DO db push
--
-- 1. "supabase migration list --linked" imediatamente antes, a partir do
--    worktree rh-pessoas (project-ref uetjghdkwbywbftedtth): so este ficheiro
--    pendente, com carimbo > 20270108550000.
-- 2. Prova na nike ANTES do push (transaccao desfeita), com um utilizador que
--    tenha hr.vencimento.codigos.gerir e outro com hr.pessoas.retribuicao.edit:
--    guardar pela RPC (janela), leitura dos dois lados, faixas sobrepostas
--    recusadas, os proprios direitos recusados, sem permissao recusado.
-- 3. O codigo do cliente (Configuracao, ficha da pessoa, "por semana" no
--    cargo) entra no mesmo envio.
-- ==============================================================================
