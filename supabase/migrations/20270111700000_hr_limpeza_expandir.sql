-- ==============================================================================
-- Limpeza do que as regras salariais deixaram sem uso -- FASE 1 (EXPANDIR).
-- ADITIVA: nada se larga nem se apaga (colunas, tabelas e assinaturas antigas
-- ficam). A fase 4 (contrair) so se escreve com confirmacao explicita do
-- utilizador; a lista do que lhe fica esta no fim deste cabecalho.
--
-- PROVISORIO. NAO FAZER db push sem: (1) listar o remoto imediatamente antes,
-- a partir do worktree rh-pessoas (supabase/.temp/project-ref =
-- uetjghdkwbywbftedtth), e confirmar que so este ficheiro fica pendente, com
-- carimbo acima do maximo aplicado; (2) correr este ficheiro inteiro na nike
-- numa transaccao desfeita ANTES do push (o conferir abaixo e essa prova);
-- (3) revisao ecc:database-reviewer e ecc:security-reviewer.
--
--
-- -- PRECISA DE CODIGO NOVO NO MESMO ENVIO --------------------------------------
--
-- NAO para nada partir: as RPCs antigas ficam com a mesma assinatura e o
-- mesmo comportamento. Para USAR as novas, o cliente deixa de enviar
-- p_subsidio (usePessoaRetribuicao.definirPessoal e usePessoas, na criacao da
-- ficha) e p_ano_min (useHorasExtra, guardar limites). O PostgREST escolhe a
-- assinatura pelas chaves do pedido: sem p_subsidio vai a nova, com ele a
-- antiga (idem p_ano_min); nunca as duas (provado no conferir).
--
--
-- -- O QUE MUDA ----------------------------------------------------------------
--
-- A. hr_legado_arquivo (nova): arquivo SO DE ACRESCENTO dos valores que a fase
--    4 vai largar. (id, organization_id, tabela, coluna, registo_id,
--    pessoa_id, valor jsonb, arquivado_em); unico (tabela, coluna,
--    registo_id), por isso arquivar outra vez nao duplica. Trigger recusa
--    UPDATE, DELETE e TRUNCATE (22000). RLS ligada e FORCADA, sem politicas,
--    sem privilegio para ninguem (so o dono). Sem FK de proposito: o arquivo
--    sobrevive ao que arquiva.
--    Arquiva-se, em TODAS as organizacoes:
--      - pessoas_retribuicoes.subsidio_alimentacao: todas as linhas com valor
--        (apagadas incluidas), com valido_de, valido_ate, deleted_at e pessoa;
--      - pessoas_vinculos.horas_anuais_maximas: as nao nulas, com data_inicio,
--        data_fim, deleted_at e pessoa;
--      - hr_regras_subsidio_alimentacao: todas as linhas (coluna '*', a linha
--        inteira em jsonb).
--    As tres tabelas de origem ficam em LOCK SHARE ate ao fim da migration
--    (as escritas esperam; a contagem do conferir e exacta). Nada se le nem se
--    mostra: o conferir so compara contagens.
--
-- B. rpc_hr_retribuicao_definir_pessoal(p_pessoa_id uuid, p_desde date,
--      p_subsidio_modo text, p_duodecimos_pct smallint, p_motivo text DEFAULT NULL)
--    NOVA (overload), sem p_subsidio. Os mesmos gates (sessao,
--    hr.pessoas.retribuicao.edit; .corrigir numa data passada que reescreve
--    versao em vigor; pessoa inexistente = sem permissao, 42501), as mesmas
--    mensagens, limites (HRC03, HRC04, HRC11) e retorno da antiga. O subsidio
--    de alimentacao NAO vem do pedido: a versao nova herda o da versao que
--    cobre a data (o que o cliente fazia ate aqui), por isso o valor nao muda.
--    SECURITY DEFINER, search_path vazio. EXECUTE copiado da antiga por
--    aclexplode (na antiga: authenticated e service_role). A antiga FICA.
--
-- C. rpc_hr_horas_extra_config_guardar(p_organization_id uuid, p_dia_min
--      integer, p_alerta_pct integer, p_minimo_min integer) NOVA, sem
--    p_ano_min (o limite anual vem da regra salarial desde 20270109700000). Os
--    mesmos gates e limites (hr_horas_extra_exigir_escrita, HRA81). Ao CRIAR a
--    linha, ano_min fica com o DEFAULT da coluna; numa linha que ja existe
--    ano_min nao se toca. Retorno {dia_min, alerta_pct, minimo_min, omissao}.
--    EXECUTE copiado da antiga (authenticated). A antiga FICA.
--
-- D. hr_documento_variaveis: o token retribuicao_subsidio_alimentacao passa a
--    ser o valor POR DIA da regra salarial em vigor na data de emissao
--    (hr_regras_salariais_em(organizacao, hoje) ->> subsidio_valor_dia), em
--    formato portugues "6,15 EUR-simbolo"; sem regra em vigor, a linha
--    "____________". retribuicao_subsidio_alimentacao_modo continua a vir da
--    pessoa. Troca de UMA expressao no corpo VIVO (pg_get_functiondef +
--    replace + EXECUTE, como 20270109600000 fez para semanal): dono,
--    privilegios, SECURITY DEFINER, search_path e comentario ficam.
--
-- E. hr_admissao_campos_obrigatorios() e hr_admissao_campo_permissao() sem a
--    linha 'subsidio_alimentacao'. CREATE OR REPLACE com o corpo de
--    20261210040000 menos essa linha (guarda md5 do corpo vivo; atributos e
--    privilegios iguais). hr_admissao_pendencias fica como esta: o filtro
--    "c.codigo <> 'subsidio_alimentacao'" passa a inocuo.
--
--
-- -- O QUE MUDA PARA AS ORGANIZACOES DA BASE RH --------------------------------
--
-- - Contratos emitidos com o token retribuicao_subsidio_alimentacao: passam a
--   mostrar o valor por dia da regra salarial da organizacao, e nao o valor
--   que estava na retribuicao da pessoa. Numa organizacao SEM regra salarial
--   em vigor (no remoto RH, todas menos a nike, se ninguem criou outra) o
--   token sai "____________" em vez do valor da pessoa.
-- - A lista de campos de admissao deixa de ter subsidio_alimentacao (de
--   origem rh, nunca configuravel): o ecra de configuracao e a lista de
--   pendencias deixam de o referir. As pendencias nao mudam (ja o excluiam).
-- - Tudo o resto: nada (RPCs novas; arquivo novo). Mudelar nao esta nesta base.
--
--
-- -- CODIGOS DE ERRO ----------------------------------------------------------
--
--   legado_arquivo_so_acrescentar (22000): UPDATE, DELETE ou TRUNCATE no arquivo.
--   limpeza_expandir_fora_de_transaccao (25000).
--   B e C reutilizam os da antiga (42501, HRC03, HRC04, HRC06, HRC11, HRC13;
--   42501, HRA33, HRA41, HRA81).
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- Sem ficheiro de reversao, de proposito. A mao, por migration nova: largar as
-- duas RPCs novas (assinaturas acima); repor em hr_documento_variaveis a
-- expressao v_retribuicao.subsidio_alimentacao::text (troca inversa sobre o
-- corpo vivo); repor as duas linhas de E (corpo de 20261210040000). O arquivo
-- pode ficar (inofensivo); largar a tabela exige largar primeiro o trigger.
--
--
-- -- FICA PARA A FASE 4 (contrair; so com confirmacao do utilizador) ----------
--
--  1. Largar rpc_hr_retribuicao_definir_pessoal(uuid, date, numeric, text,
--     smallint, text), depois de o cliente usar a nova.
--  2. Largar rpc_hr_horas_extra_config_guardar(uuid, integer, integer,
--     integer, integer), depois de o cliente usar a nova.
--  3. Largar pessoas_retribuicoes.subsidio_alimentacao: mexe em
--     hr_retribuicao_campos_da_versao, hr_retribuicao_refazer_desde (INSERT),
--     hr_retribuicoes_escrita_so_por_rpc (ROW comparado), na RPC nova de B
--     (herda o valor), em hr_admissao_pendencias (filtro inocuo) e no cliente
--     (usePessoaRetribuicao le a coluna).
--  4. Largar pessoas_vinculos.horas_anuais_maximas (procurar leitores no
--     cliente e nas funcoes antes).
--  5. Largar hr_horas_extra_config.ano_min (hr_horas_extra_config_omissao,
--     _efetiva, rpc_hr_horas_extra_config_ler devolvem-no; ATENCAO: ano_min
--     NAO esta no arquivo desta migration -- decidir antes se se arquiva).
--  6. Largar hr_regras_subsidio_alimentacao (e o que a le ou escreve).
--  7. Tirar de hr_admissao_pendencias o filtro inocuo de subsidio_alimentacao.
-- ==============================================================================

BEGIN;

SET LOCAL lock_timeout = '5s';

-- ---- G00: dentro de uma transaccao -------------------------------------------
DO $transaccao$
BEGIN
  IF current_setting('lock_timeout') IS DISTINCT FROM '5s' THEN
    RAISE EXCEPTION
      'limpeza_expandir_fora_de_transaccao: SET LOCAL nao teve efeito (lock_timeout = %); esta migration tem de correr numa so transaccao.',
      current_setting('lock_timeout')
      USING ERRCODE = '25000';
  END IF;
END;
$transaccao$;

-- ---- Corpos esperados no remoto (guarda md5, sem os \r dos dois lados) -------
-- rpc_hr_retribuicao_definir_pessoal: 20261210120000 (sec. 7), a unica
-- definicao nas migrations. rpc_hr_horas_extra_config_guardar:
-- 20270104800000 (5.7). hr_admissao_campos_obrigatorios e
-- hr_admissao_campo_permissao: 20261210040000 (sec. 3 e 4), as mais recentes.
CREATE TEMP TABLE tmp_lx_esperado (fn text PRIMARY KEY, corpo text NOT NULL) ON COMMIT DROP;
INSERT INTO tmp_lx_esperado (fn, corpo) VALUES
('public.rpc_hr_retribuicao_definir_pessoal(uuid, date, numeric, text, smallint, text)', $old$
DECLARE
  c_motivo_max     constant integer := 500;
  v_uid            uuid := auth.uid();
  v_actor          uuid;
  v_org            uuid;
  v_hoje           date := current_date;
  v_limite_passado date := (current_date - interval '10 years')::date;
  v_limite_futuro  date := (current_date + interval '5 years')::date;
  v_cargo          uuid;
  v_vinculo        uuid;
  v_moeda          text;
  v_campos         jsonb;
  v_ve_salario     boolean;
  v_sal            numeric;
  v_per            text;
  v_versoes        integer;
  v_motivo         text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'insufficient_privilege: e preciso uma sessao autenticada.'
      USING ERRCODE = '42501';
  END IF;

  -- Pessoa inexistente e falta de permissao dao a MESMA resposta.
  SELECT p.organization_id INTO v_org
    FROM public.pessoas p
   WHERE p.id = p_pessoa_id AND p.deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'insufficient_privilege: a pessoa nao existe, ou nao tem permissao para definir o subsidio e os duodecimos desta pessoa (hr.pessoas.retribuicao.edit).'
      USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_anew_permission_in_org(v_uid, 'hr.pessoas.retribuicao.edit', v_org) THEN
    RAISE EXCEPTION 'insufficient_privilege: a pessoa nao existe, ou nao tem permissao para definir o subsidio e os duodecimos desta pessoa (hr.pessoas.retribuicao.edit).'
      USING ERRCODE = '42501';
  END IF;

  IF p_desde IS NULL THEN
    RAISE EXCEPTION 'data_invalida: a data de efeito e obrigatoria.'
      USING ERRCODE = 'HRC04';
  END IF;
  IF p_desde < v_limite_passado OR p_desde > v_limite_futuro THEN
    RAISE EXCEPTION 'data_invalida: a data de efeito tem de estar entre % (10 anos para tras) e % (5 anos para a frente).',
      v_limite_passado, v_limite_futuro
      USING ERRCODE = 'HRC04';
  END IF;
  IF p_motivo IS NOT NULL AND char_length(p_motivo) > c_motivo_max THEN
    RAISE EXCEPTION 'cargo_dados_invalidos: o motivo nao pode ter mais de % caracteres.', c_motivo_max
      USING ERRCODE = 'HRC03';
  END IF;

  IF p_subsidio IS NOT NULL AND p_subsidio < 0 THEN
    RAISE EXCEPTION 'cargo_dados_invalidos: o subsidio de alimentacao nao pode ser negativo.'
      USING ERRCODE = 'HRC03';
  END IF;
  IF p_subsidio_modo IS NOT NULL AND p_subsidio_modo NOT IN ('dinheiro', 'cartao') THEN
    RAISE EXCEPTION 'cargo_dados_invalidos: o modo do subsidio de alimentacao tem de ser dinheiro ou cartao.'
      USING ERRCODE = 'HRC03';
  END IF;
  IF p_duodecimos_pct IS NOT NULL AND p_duodecimos_pct NOT IN (0, 50, 100) THEN
    RAISE EXCEPTION 'cargo_dados_invalidos: os duodecimos tem de ser 0, 50 ou 100 por cento.'
      USING ERRCODE = 'HRC03';
  END IF;

  SELECT au.id INTO v_actor FROM public.anew_users au WHERE au.auth_user_id = v_uid LIMIT 1;

  -- Serializa quem mexe na mesma pessoa. FOR NO KEY UPDATE (nao bloqueia as
  -- verificacoes de chave estrangeira). Esta funcao nao bloqueia cargos: so le o
  -- salario do cargo, e nunca espera por um cargo enquanto tem a pessoa (a ordem
  -- de locks do modulo e cargo antes de pessoa).
  PERFORM 1 FROM public.pessoas p
   WHERE p.id = p_pessoa_id AND p.deleted_at IS NULL
     FOR NO KEY UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'insufficient_privilege: a pessoa nao existe, ou nao tem permissao para definir o subsidio e os duodecimos desta pessoa (hr.pessoas.retribuicao.edit).'
      USING ERRCODE = '42501';
  END IF;

  -- Sem cargo nessa data nao ha salario base.
  v_cargo := public.hr_pessoa_cargo_em(p_pessoa_id, p_desde);
  IF v_cargo IS NULL THEN
    RAISE EXCEPTION 'retribuicao_sem_cargo: a pessoa nao tem cargo em %. Atribua primeiro um cargo (separador Laborais da ficha).',
      p_desde
      USING ERRCODE = 'HRC11';
  END IF;

  -- Uma data passada que reescreve uma versao ja em vigor e uma CORRECCAO
  -- (exige tambem hr.pessoas.retribuicao.corrigir). Quem ainda nao tem
  -- nenhuma versao (a criacao da ficha) nao e afectado.
  IF p_desde < v_hoje
     AND EXISTS (
       SELECT 1 FROM public.pessoas_retribuicoes r
        WHERE r.pessoa_id = p_pessoa_id AND r.deleted_at IS NULL
          AND r.valido_de < p_desde
          AND (r.valido_ate IS NULL OR r.valido_ate > p_desde)
     )
     AND NOT public.has_anew_permission_in_org(v_uid, 'hr.pessoas.retribuicao.corrigir', v_org) THEN
    RAISE EXCEPTION 'insufficient_privilege: alterar o subsidio e os duodecimos com data passada reescreve uma versao ja em vigor e exige tambem hr.pessoas.retribuicao.corrigir.'
      USING ERRCODE = '42501';
  END IF;

  -- Vinculo e moeda: os da versao que cobre a data; senao o vinculo mais
  -- recente que nao terminou e EUR.
  SELECT r.vinculo_id, r.moeda INTO v_vinculo, v_moeda
    FROM public.pessoas_retribuicoes r
   WHERE r.pessoa_id = p_pessoa_id AND r.deleted_at IS NULL
     AND r.valido_de <= p_desde
     AND (r.valido_ate IS NULL OR r.valido_ate > p_desde)
   ORDER BY r.valido_de DESC
   LIMIT 1;
  IF NOT FOUND THEN
    v_moeda := 'EUR';
    SELECT v.id INTO v_vinculo
      FROM public.pessoas_vinculos v
     WHERE v.pessoa_id = p_pessoa_id AND v.organization_id = v_org
       AND v.deleted_at IS NULL AND v.estado <> 'terminado'
     ORDER BY v.data_inicio DESC
     LIMIT 1;
  END IF;

  v_campos := jsonb_build_object(
    'vinculo_id',                 v_vinculo,
    'moeda',                      coalesce(v_moeda, 'EUR'),
    'subsidio_alimentacao',       p_subsidio,
    'subsidio_alimentacao_modo',  p_subsidio_modo,
    'duodecimos_pct',             p_duodecimos_pct
  );

  v_motivo := coalesce(NULLIF(btrim(coalesce(p_motivo, '')), ''), 'Subsidio e duodecimos');

  v_versoes := public.hr_retribuicao_refazer_desde(
    p_pessoa_id, p_desde, v_campos, 'pessoa', v_motivo, v_actor);

  -- O salario base aplicado so se devolve a quem tem hr.pessoas.retribuicao.view.
  IF public.has_anew_permission_in_org(v_uid, 'hr.pessoas.retribuicao.view', v_org) THEN
    SELECT s.salario_base, s.periodicidade INTO v_sal, v_per
      FROM public.hr_cargo_salario_em(v_cargo, p_desde) s;
  END IF;

  RETURN jsonb_build_object(
    'versoes_criadas', v_versoes,
    'desde',           p_desde,
    'salario_base',    v_sal,
    'periodicidade',   v_per
  );
END;
$old$),
('public.rpc_hr_horas_extra_config_guardar(uuid, integer, integer, integer, integer)', $old$
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
$old$),
('public.hr_admissao_campos_obrigatorios()', $old$
  SELECT *
  FROM (VALUES
    ('data_nascimento',               'pessoa', false),
    ('genero',                        'pessoa', false),
    ('nacionalidade',                 'pessoa', false),
    ('telefone_pessoal',              'pessoa', false),
    ('email_pessoal',                 'pessoa', false),
    ('estado_civil',                  'pessoa', false),
    ('dependentes',                   'pessoa', false),
    ('dependentes_deficientes',       'pessoa', false),
    ('conjuge_situacao_profissional', 'pessoa', true),
    ('naturalidade_freguesia',        'pessoa', false),
    ('naturalidade_concelho',         'pessoa', false),
    ('naturalidade_pais',             'pessoa', false),
    ('habilitacao_academica',         'pessoa', false),
    ('habilitacao_data_conclusao',    'pessoa', false),
    ('nif',                           'pessoa', false),
    ('niss',                          'pessoa', false),
    ('tipo_documento',                'pessoa', false),
    ('numero_documento',              'pessoa', false),
    ('validade_documento',            'pessoa', true),
    ('linha1',                        'pessoa', false),
    ('codigo_postal',                 'pessoa', false),
    ('localidade',                    'pessoa', false),
    ('tamanho_cima',                  'pessoa', false),
    ('tamanho_baixo',                 'pessoa', false),
    ('tamanho_calcado',               'pessoa', false),
    ('conta_numero',                  'pessoa', false),
    ('conta_titular',                 'pessoa', false),
    ('conta_banco',                   'pessoa', false),
    ('conta_bic',                     'pessoa', false),
    ('data_admissao',                 'rh',     false),
    ('cargo',                         'rh',     false),
    ('tipo_contrato',                 'rh',     false),
    ('subsidio_alimentacao',          'rh',     false),
    ('duodecimos',                    'rh',     false)
    -- GANCHO: o campo tipo_horario (origem rh) entra aqui no lote dos horarios.
  ) AS t(codigo, origem, condicional);
$old$),
('public.hr_admissao_campo_permissao()', $old$
  SELECT *
  FROM (VALUES
    ('email_pessoal',                 'pessoas',                  'hr.pessoas.view'),
    ('data_admissao',                 'pessoas',                  'hr.pessoas.view'),
    ('cargo',                         'pessoas',                  'hr.pessoas.view'),
    ('data_nascimento',               'pessoas_dados_pessoais',   'hr.pessoas.pessoais.view'),
    ('genero',                        'pessoas_dados_pessoais',   'hr.pessoas.pessoais.view'),
    ('nacionalidade',                 'pessoas_dados_pessoais',   'hr.pessoas.pessoais.view'),
    ('telefone_pessoal',              'pessoas_dados_pessoais',   'hr.pessoas.pessoais.view'),
    ('estado_civil',                  'pessoas_dados_pessoais',   'hr.pessoas.pessoais.view'),
    ('dependentes',                   'pessoas_dados_pessoais',   'hr.pessoas.pessoais.view'),
    ('dependentes_deficientes',       'pessoas_dados_pessoais',   'hr.pessoas.pessoais.view'),
    ('conjuge_situacao_profissional', 'pessoas_dados_pessoais',   'hr.pessoas.pessoais.view'),
    ('naturalidade_freguesia',        'pessoas_dados_pessoais',   'hr.pessoas.pessoais.view'),
    ('naturalidade_concelho',         'pessoas_dados_pessoais',   'hr.pessoas.pessoais.view'),
    ('naturalidade_pais',             'pessoas_dados_pessoais',   'hr.pessoas.pessoais.view'),
    ('habilitacao_academica',         'pessoas_dados_pessoais',   'hr.pessoas.pessoais.view'),
    ('habilitacao_data_conclusao',    'pessoas_dados_pessoais',   'hr.pessoas.pessoais.view'),
    ('nif',                           'pessoas_identificacao',    'hr.pessoas.identificacao.view'),
    ('niss',                          'pessoas_identificacao',    'hr.pessoas.identificacao.view'),
    ('tipo_documento',                'pessoas_identificacao',    'hr.pessoas.identificacao.view'),
    ('numero_documento',              'pessoas_identificacao',    'hr.pessoas.identificacao.view'),
    ('validade_documento',            'pessoas_identificacao',    'hr.pessoas.identificacao.view'),
    ('linha1',                        'pessoas_moradas',          'hr.pessoas.morada.view'),
    ('codigo_postal',                 'pessoas_moradas',          'hr.pessoas.morada.view'),
    ('localidade',                    'pessoas_moradas',          'hr.pessoas.morada.view'),
    ('tamanho_cima',                  'pessoas_fardamento',       'hr.pessoas.laborais.view'),
    ('tamanho_baixo',                 'pessoas_fardamento',       'hr.pessoas.laborais.view'),
    ('tamanho_calcado',               'pessoas_fardamento',       'hr.pessoas.laborais.view'),
    ('tipo_contrato',                 'pessoas_vinculos',         'hr.pessoas.vinculos.view'),
    ('subsidio_alimentacao',          'pessoas_retribuicoes',     'hr.pessoas.retribuicao.view'),
    ('duodecimos',                    'pessoas_retribuicoes',     'hr.pessoas.retribuicao.view'),
    ('sindicalizado',                 'pessoas_sindicalizacao',   'hr.pessoas.sindicalizacao.view'),
    ('sindicato',                     'pessoas_sindicalizacao',   'hr.pessoas.sindicalizacao.view'),
    ('conta_numero',                  'pessoas_dados_bancarios',  'hr.pessoas.bancarios.view'),
    ('conta_titular',                 'pessoas_dados_bancarios',  'hr.pessoas.bancarios.view'),
    ('conta_banco',                   'pessoas_dados_bancarios',  'hr.pessoas.bancarios.view'),
    ('conta_bic',                     'pessoas_dados_bancarios',  'hr.pessoas.bancarios.view')
  ) AS t(codigo, tabela, permissao);
$old$);

-- As linhas que E tira (exactamente como estao no corpo esperado) e a troca de D.
CREATE TEMP TABLE tmp_lx_linha (fn text PRIMARY KEY, linha text NOT NULL) ON COMMIT DROP;
INSERT INTO tmp_lx_linha (fn, linha) VALUES
('public.hr_admissao_campos_obrigatorios()',
 $l$    ('subsidio_alimentacao',          'rh',     false),$l$),
('public.hr_admissao_campo_permissao()',
 $l$    ('subsidio_alimentacao',          'pessoas_retribuicoes',     'hr.pessoas.retribuicao.view'),$l$);

CREATE TEMP TABLE tmp_lx_troca (ancora text NOT NULL, novo text NOT NULL) ON COMMIT DROP;
INSERT INTO tmp_lx_troca (ancora, novo) VALUES (
  $a$v_retribuicao.subsidio_alimentacao::text$a$,
  $n$coalesce(replace(pg_catalog.to_char((public.hr_regras_salariais_em(p_organization_id, current_date) ->> 'subsidio_valor_dia')::numeric, 'FM999999990.00'), '.', ',') || ' ' || pg_catalog.chr(8364), '____________')$n$);

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
DECLARE
  v_lista text;
  v_n     integer;
  v_r     record;
  v_src   text;
  v_def   text;
  v_cod   text;
  v_anc   text;
BEGIN
  -- G0. Quem aplica passa a RLS (o arquivo e FORCE sem politicas).
  IF NOT EXISTS (SELECT 1 FROM pg_roles r
                  WHERE r.rolname::text = current_user::text AND (r.rolsuper OR r.rolbypassrls)) THEN
    RAISE EXCEPTION 'G0: o papel que aplica (%) nao tem BYPASSRLS; com FORCE RLS nao escreveria o arquivo.', current_user::text;
  END IF;

  -- G1. Nomes novos livres; as duas RPCs tem hoje UMA so assinatura (a antiga).
  IF to_regclass('public.hr_legado_arquivo') IS NOT NULL THEN
    RAISE EXCEPTION 'G1: public.hr_legado_arquivo ja existe. Ler o que la esta.';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname::text = 'public' AND p.proname::text = 'hr_legado_arquivo_so_acrescentar') THEN
    RAISE EXCEPTION 'G1: ja existe public.hr_legado_arquivo_so_acrescentar.';
  END IF;
  IF to_regprocedure('public.rpc_hr_retribuicao_definir_pessoal(uuid, date, numeric, text, smallint, text)') IS NULL
     OR to_regprocedure('public.rpc_hr_horas_extra_config_guardar(uuid, integer, integer, integer, integer)') IS NULL THEN
    RAISE EXCEPTION 'G1: as RPCs antigas nao existem com a assinatura lida.';
  END IF;
  SELECT string_agg(p.oid::regprocedure::text, ', ') INTO v_lista
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname::text = 'public'
     AND p.proname::text IN ('rpc_hr_retribuicao_definir_pessoal', 'rpc_hr_horas_extra_config_guardar')
     AND p.oid NOT IN (to_regprocedure('public.rpc_hr_retribuicao_definir_pessoal(uuid, date, numeric, text, smallint, text)')::oid,
                       to_regprocedure('public.rpc_hr_horas_extra_config_guardar(uuid, integer, integer, integer, integer)')::oid);
  IF v_lista IS NOT NULL THEN
    RAISE EXCEPTION 'G1: ja ha outras assinaturas das RPCs: %.', v_lista;
  END IF;

  -- G2. md5 dos corpos (sem \r dos dois lados).
  FOR v_r IN SELECT * FROM tmp_lx_esperado ORDER BY fn LOOP
    IF to_regprocedure(v_r.fn) IS NULL THEN
      RAISE EXCEPTION 'G2: % nao existe.', v_r.fn;
    END IF;
    SELECT p.prosrc INTO v_src FROM pg_proc p WHERE p.oid = to_regprocedure(v_r.fn)::oid;
    IF md5(replace(v_src, chr(13), '')) IS DISTINCT FROM md5(replace(v_r.corpo, chr(13), '')) THEN
      RAISE EXCEPTION 'G2: o corpo de % no remoto (md5 %) nao e o lido (md5 %). Reler a versao mais recente antes de aplicar.',
        v_r.fn, md5(replace(v_src, chr(13), '')), md5(replace(v_r.corpo, chr(13), ''));
    END IF;
  END LOOP;
  -- A linha que E tira aparece uma so vez no corpo esperado.
  FOR v_r IN SELECT l.fn, l.linha, e.corpo FROM tmp_lx_linha l JOIN tmp_lx_esperado e ON e.fn = l.fn LOOP
    v_src := replace(v_r.corpo, chr(13), '');
    IF (length(v_src) - length(replace(v_src, v_r.linha || chr(10), ''))) / length(v_r.linha || chr(10)) <> 1 THEN
      RAISE EXCEPTION 'G2: a linha de subsidio_alimentacao de % nao aparece uma so vez.', v_r.fn;
    END IF;
  END LOOP;

  -- G3. Atributos e privilegios das antigas.
  IF NOT EXISTS (SELECT 1 FROM pg_proc p
                  WHERE p.oid = to_regprocedure('public.rpc_hr_retribuicao_definir_pessoal(uuid, date, numeric, text, smallint, text)')::oid
                    AND p.prosecdef AND p.pronargdefaults = 1)
     OR NOT EXISTS (SELECT 1 FROM pg_proc p
                     WHERE p.oid = to_regprocedure('public.rpc_hr_horas_extra_config_guardar(uuid, integer, integer, integer, integer)')::oid
                       AND p.prosecdef AND p.pronargdefaults = 0) THEN
    RAISE EXCEPTION 'G3: as RPCs antigas deixaram de ser SECURITY DEFINER ou mudaram os DEFAULT dos argumentos.';
  END IF;
  SELECT string_agg(p.oid::regprocedure::text, ', ') INTO v_lista
    FROM pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
   WHERE p.oid IN (to_regprocedure('public.rpc_hr_retribuicao_definir_pessoal(uuid, date, numeric, text, smallint, text)')::oid,
                   to_regprocedure('public.rpc_hr_horas_extra_config_guardar(uuid, integer, integer, integer, integer)')::oid)
     AND a.privilege_type = 'EXECUTE'
     AND (a.grantee = 0 OR a.grantee = 'anon'::regrole::oid);
  IF v_lista IS NOT NULL THEN
    RAISE EXCEPTION 'G3: as antigas dao EXECUTE a PUBLIC ou anon (%); a copia de privilegios nao o deve repetir. Reler.', v_lista;
  END IF;
  SELECT string_agg(p.oid::regprocedure::text, ', ') INTO v_lista
    FROM pg_proc p
   WHERE p.oid IN (to_regprocedure('public.hr_admissao_campos_obrigatorios()')::oid,
                   to_regprocedure('public.hr_admissao_campo_permissao()')::oid)
     AND (p.prosecdef OR p.proconfig IS NOT NULL OR p.provolatile::text <> 'i' OR p.proparallel::text <> 's'
          OR p.prolang <> (SELECT l.oid FROM pg_language l WHERE l.lanname::text = 'sql'));
  IF v_lista IS NOT NULL THEN
    RAISE EXCEPTION 'G3: % deixaram de ser sql IMMUTABLE PARALLEL SAFE sem SET nem SECURITY DEFINER; o CREATE OR REPLACE de E mudaria atributos.', v_lista;
  END IF;

  -- G4. Colunas e tipos que o arquivo e as RPCs usam.
  SELECT count(*) INTO v_n
    FROM (VALUES ('pessoas_retribuicoes', 'id'), ('pessoas_retribuicoes', 'organization_id'),
                 ('pessoas_retribuicoes', 'pessoa_id'), ('pessoas_retribuicoes', 'subsidio_alimentacao'),
                 ('pessoas_retribuicoes', 'subsidio_alimentacao_modo'), ('pessoas_retribuicoes', 'duodecimos_pct'),
                 ('pessoas_retribuicoes', 'valido_de'), ('pessoas_retribuicoes', 'valido_ate'),
                 ('pessoas_retribuicoes', 'deleted_at'), ('pessoas_retribuicoes', 'origem'),
                 ('pessoas_retribuicoes', 'motivo'), ('pessoas_retribuicoes', 'vinculo_id'),
                 ('pessoas_retribuicoes', 'moeda'),
                 ('pessoas_vinculos', 'id'), ('pessoas_vinculos', 'organization_id'),
                 ('pessoas_vinculos', 'pessoa_id'), ('pessoas_vinculos', 'horas_anuais_maximas'),
                 ('pessoas_vinculos', 'data_inicio'), ('pessoas_vinculos', 'data_fim'),
                 ('pessoas_vinculos', 'deleted_at'),
                 ('hr_regras_subsidio_alimentacao', 'id'), ('hr_regras_subsidio_alimentacao', 'organization_id'),
                 ('hr_horas_extra_config', 'organization_id'), ('hr_horas_extra_config', 'dia_min'),
                 ('hr_horas_extra_config', 'ano_min'), ('hr_horas_extra_config', 'alerta_pct'),
                 ('hr_horas_extra_config', 'minimo_min'), ('hr_horas_extra_config', 'updated_by'))
         AS e(tabela, coluna)
   WHERE EXISTS (SELECT 1 FROM pg_attribute a
                  WHERE a.attrelid = to_regclass('public.' || e.tabela)
                    AND a.attname::text = e.coluna AND NOT a.attisdropped);
  IF v_n <> 28 THEN
    RAISE EXCEPTION 'G4: faltam colunas esperadas em pessoas_retribuicoes, pessoas_vinculos, hr_regras_subsidio_alimentacao ou hr_horas_extra_config (% de 28).', v_n;
  END IF;
  SELECT count(*) INTO v_n
    FROM pg_attribute a
   WHERE a.attrelid IN (to_regclass('public.pessoas_retribuicoes'), to_regclass('public.pessoas_vinculos'),
                        to_regclass('public.hr_regras_subsidio_alimentacao'))
     AND a.attname::text = 'id' AND NOT a.attisdropped
     AND format_type(a.atttypid, a.atttypmod)::text = 'uuid';
  IF v_n <> 3 THEN
    RAISE EXCEPTION 'G4: o id das tres tabelas de origem devia ser uuid (% de 3).', v_n;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_attrdef d JOIN pg_attribute a ON a.attrelid = d.adrelid AND a.attnum = d.adnum
                  WHERE d.adrelid = to_regclass('public.hr_horas_extra_config') AND a.attname::text = 'ano_min'
                    AND pg_get_expr(d.adbin, d.adrelid)::text ~ '^[0-9]+$') THEN
    RAISE EXCEPTION 'G4: hr_horas_extra_config.ano_min deixou de ter um DEFAULT inteiro; a RPC nova de C conta com ele.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.pessoas_retribuicoes r WHERE r.subsidio_alimentacao IS NOT NULL AND r.organization_id IS NULL)
     OR EXISTS (SELECT 1 FROM public.pessoas_vinculos v WHERE v.horas_anuais_maximas IS NOT NULL AND v.organization_id IS NULL)
     OR EXISTS (SELECT 1 FROM public.hr_regras_subsidio_alimentacao s WHERE s.organization_id IS NULL) THEN
    RAISE EXCEPTION 'G4: ha linhas a arquivar sem organization_id.';
  END IF;

  -- G5. Funcoes de suporte (assinaturas usadas) e permissoes.
  SELECT string_agg(f, ', ') INTO v_lista
    FROM unnest(ARRAY['public.has_anew_permission_in_org(uuid, text, uuid)',
                      'public.hr_pessoa_cargo_em(uuid, date)',
                      'public.hr_cargo_salario_em(uuid, date)',
                      'public.hr_retribuicao_refazer_desde(uuid, date, jsonb, text, text, uuid)',
                      'public.hr_horas_extra_exigir_escrita(uuid, boolean)',
                      'public.hr_horas_extra_config_efetiva(uuid)',
                      'public.hr_horas_extra_evento(uuid, uuid, uuid, text, uuid, jsonb)',
                      'public.hr_regras_salariais_em(uuid, date)',
                      'public.hr_documento_variaveis(uuid, uuid, boolean)',
                      'public.hr_admissao_pendencias(uuid)',
                      'public.hr_admissao_campos_obrigatorios_org(uuid)',
                      'auth.uid()']) AS f
   WHERE to_regprocedure(f) IS NULL;
  IF v_lista IS NOT NULL THEN
    RAISE EXCEPTION 'G5: faltam funcoes: %.', v_lista;
  END IF;
  FOREACH v_cod IN ARRAY ARRAY['hr.pessoas.retribuicao.edit', 'hr.pessoas.retribuicao.corrigir',
                               'hr.pessoas.retribuicao.view', 'hr.assiduidade.gerir'] LOOP
    IF NOT EXISTS (SELECT 1 FROM public.anew_permissions ap WHERE ap.code = v_cod) THEN
      RAISE EXCEPTION 'G5: o codigo % nao esta no catalogo.', v_cod;
    END IF;
  END LOOP;

  -- G6. hr_documento_variaveis: a ancora aparece uma so vez (no corpo e na
  --     definicao), a regra ainda nao e lida, e o dono pode executar
  --     hr_regras_salariais_em (interna, sem EXECUTE para ninguem).
  SELECT t.ancora INTO v_anc FROM tmp_lx_troca t;
  SELECT p.prosrc INTO v_src FROM pg_proc p
   WHERE p.oid = to_regprocedure('public.hr_documento_variaveis(uuid, uuid, boolean)')::oid;
  v_def := pg_get_functiondef(to_regprocedure('public.hr_documento_variaveis(uuid, uuid, boolean)')::oid);
  IF (length(v_src) - length(replace(v_src, v_anc, ''))) / length(v_anc) <> 1
     OR (length(v_def) - length(replace(v_def, v_anc, ''))) / length(v_anc) <> 1
     OR position('hr_regras_salariais_em' IN v_src) > 0 THEN
    RAISE EXCEPTION 'G6: hr_documento_variaveis no remoto nao tem a expressao do subsidio uma so vez, ou ja le a regra salarial. Reler o corpo vivo.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc d
                  WHERE d.oid = to_regprocedure('public.hr_documento_variaveis(uuid, uuid, boolean)')::oid
                    AND d.prosecdef
                    AND has_function_privilege(d.proowner, to_regprocedure('public.hr_regras_salariais_em(uuid, date)')::oid, 'EXECUTE')) THEN
    RAISE EXCEPTION 'G6: hr_documento_variaveis deixou de ser SECURITY DEFINER, ou o dono dela nao pode executar hr_regras_salariais_em.';
  END IF;
END;
$guardas$;

-- As escritas nas tabelas de origem esperam ate ao fim: o arquivo e a
-- contagem do conferir veem exactamente as mesmas linhas.
LOCK TABLE public.pessoas_retribuicoes, public.pessoas_vinculos, public.hr_regras_subsidio_alimentacao
  IN SHARE MODE;

-- ---- O estado de antes (para o conferir; so leitura, nada se mostra) --------
CREATE TEMP TABLE tmp_lx_doc ON COMMIT DROP AS
SELECT p.prosrc, p.prosecdef, coalesce(array_to_string(p.proconfig, ','), '') AS proconfig,
       coalesce(p.proacl::text, '') AS proacl, p.proowner
  FROM pg_proc p
 WHERE p.oid = to_regprocedure('public.hr_documento_variaveis(uuid, uuid, boolean)')::oid;

CREATE TEMP TABLE tmp_lx_adm ON COMMIT DROP AS
SELECT f.fn, p.prosecdef, p.provolatile::text AS provolatile, p.proparallel::text AS proparallel,
       coalesce(array_to_string(p.proconfig, ','), '') AS proconfig, coalesce(p.proacl::text, '') AS proacl
  FROM unnest(ARRAY['public.hr_admissao_campos_obrigatorios()', 'public.hr_admissao_campo_permissao()']) AS f(fn)
  JOIN pg_proc p ON p.oid = to_regprocedure(f.fn)::oid;

CREATE TEMP TABLE tmp_lx_adm_antes ON COMMIT DROP AS
SELECT 'campos'::text AS fn, to_jsonb(c) AS linha FROM public.hr_admissao_campos_obrigatorios() c
UNION ALL
SELECT 'permissao'::text, to_jsonb(c) FROM public.hr_admissao_campo_permissao() c
UNION ALL
SELECT 'org_nike'::text, to_jsonb(c)
  FROM public.hr_admissao_campos_obrigatorios_org('b6ffce4f-f630-4933-833a-008649757a33'::uuid) c;

-- Pendencias de cada pessoa da nike (ramo de servico: auth.uid() e NULL aqui).
CREATE TEMP TABLE tmp_lx_pend_antes ON COMMIT DROP AS
SELECT pe.id AS pessoa_id, x.codigo, x.origem, x.posicao
  FROM public.pessoas pe
  CROSS JOIN LATERAL public.hr_admissao_pendencias(pe.id) x
 WHERE pe.organization_id = 'b6ffce4f-f630-4933-833a-008649757a33'::uuid
   AND pe.deleted_at IS NULL;

-- Uma emissao da nike ANTES da troca de D, numa subtransaccao desfeita (a
-- funcao audita a leitura da retribuicao: o registo desfaz-se; o mapa fica
-- na variavel e vai para uma tabela temporaria que nunca se mostra).
CREATE TEMP TABLE tmp_lx_doc_antes (pessoa_id uuid NOT NULL, mapa jsonb NOT NULL) ON COMMIT DROP;
DO $doc_antes$
DECLARE
  k_nike constant uuid := 'b6ffce4f-f630-4933-833a-008649757a33'::uuid;
  v_pid  uuid;
  v_mapa jsonb;
BEGIN
  SELECT r.pessoa_id INTO v_pid
    FROM public.pessoas_retribuicoes r
    JOIN public.pessoas p ON p.id = r.pessoa_id AND p.organization_id = r.organization_id AND p.deleted_at IS NULL
   WHERE r.organization_id = k_nike AND r.deleted_at IS NULL
     AND r.valido_de <= current_date AND (r.valido_ate IS NULL OR r.valido_ate >= current_date)
   ORDER BY r.pessoa_id
   LIMIT 1;
  IF v_pid IS NULL THEN
    RETURN; -- o conferir falha: a prova de D precisa de uma pessoa com retribuicao hoje.
  END IF;
  BEGIN
    v_mapa := public.hr_documento_variaveis(v_pid, k_nike, true);
    RAISE EXCEPTION 'doc_antes_ok' USING ERRCODE = 'HLX01';
  EXCEPTION
    WHEN SQLSTATE 'HLX01' THEN NULL;
  END;
  INSERT INTO tmp_lx_doc_antes (pessoa_id, mapa) VALUES (v_pid, v_mapa);
END;
$doc_antes$;


-- ==============================================================================
-- A. Arquivo dos valores que a fase 4 vai largar
-- ==============================================================================
CREATE TABLE public.hr_legado_arquivo (
  id               uuid        NOT NULL DEFAULT gen_random_uuid(),
  organization_id  uuid        NOT NULL,
  tabela           text        NOT NULL,
  coluna           text        NOT NULL,
  registo_id       uuid        NOT NULL,
  pessoa_id        uuid,
  valor            jsonb       NOT NULL,
  arquivado_em     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT hr_legado_arquivo_pkey PRIMARY KEY (id),
  CONSTRAINT hr_legado_arquivo_unico UNIQUE (tabela, coluna, registo_id),
  CONSTRAINT hr_legado_arquivo_nomes_validos
    CHECK (char_length(tabela) BETWEEN 1 AND 63 AND char_length(coluna) BETWEEN 1 AND 63),
  CONSTRAINT hr_legado_arquivo_valor_objecto CHECK (jsonb_typeof(valor) = 'object')
);

CREATE INDEX idx_hr_legado_arquivo_org ON public.hr_legado_arquivo (organization_id);
CREATE INDEX idx_hr_legado_arquivo_pessoa ON public.hr_legado_arquivo (pessoa_id) WHERE pessoa_id IS NOT NULL;

COMMENT ON TABLE public.hr_legado_arquivo IS
'Arquivo SO DE ACRESCENTO dos valores que deixaram de ser usados e que uma migracao de contrair vai largar (desde 20270111700000): pessoas_retribuicoes.subsidio_alimentacao (com valido_de, valido_ate, deleted_at), pessoas_vinculos.horas_anuais_maximas (com data_inicio, data_fim, deleted_at) e hr_regras_subsidio_alimentacao (coluna *, a linha inteira). Uma linha por (tabela, coluna, registo_id): arquivar outra vez nao duplica. UPDATE, DELETE e TRUNCATE recusados por trigger (22000). Sem FK de proposito (sobrevive ao que arquiva). RLS forcada, sem politicas, sem privilegios: so o dono le.';

CREATE FUNCTION public.hr_legado_arquivo_so_acrescentar()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION
    'legado_arquivo_so_acrescentar: hr_legado_arquivo e historico; so se acrescentam linhas (%).', TG_OP
    USING ERRCODE = '22000';
END;
$$;

COMMENT ON FUNCTION public.hr_legado_arquivo_so_acrescentar() IS
'INTERNA (trigger). Recusa UPDATE, DELETE e TRUNCATE em hr_legado_arquivo (22000). Desde 20270111700000.';

CREATE TRIGGER trg_hr_legado_arquivo_so_acrescentar
  BEFORE UPDATE OR DELETE ON public.hr_legado_arquivo
  FOR EACH ROW EXECUTE FUNCTION public.hr_legado_arquivo_so_acrescentar();
CREATE TRIGGER trg_hr_legado_arquivo_sem_truncate
  BEFORE TRUNCATE ON public.hr_legado_arquivo
  FOR EACH STATEMENT EXECUTE FUNCTION public.hr_legado_arquivo_so_acrescentar();

REVOKE ALL ON TABLE public.hr_legado_arquivo FROM PUBLIC, anon, authenticated, service_role;
ALTER TABLE public.hr_legado_arquivo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_legado_arquivo FORCE ROW LEVEL SECURITY;
-- Sem CREATE POLICY de proposito.
REVOKE ALL ON FUNCTION public.hr_legado_arquivo_so_acrescentar() FROM PUBLIC, anon, authenticated, service_role;

-- O arquivar, numa funcao TEMPORARIA desta sessao (desaparece com ela), para
-- o conferir a poder chamar uma segunda vez e provar que nao duplica.
CREATE FUNCTION pg_temp.hr_legado_arquivar()
RETURNS integer
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_n     integer;
  v_total integer := 0;
BEGIN
  INSERT INTO public.hr_legado_arquivo (organization_id, tabela, coluna, registo_id, pessoa_id, valor)
  SELECT r.organization_id, 'pessoas_retribuicoes', 'subsidio_alimentacao', r.id, r.pessoa_id,
         pg_catalog.jsonb_build_object('subsidio_alimentacao', r.subsidio_alimentacao,
                                       'valido_de', r.valido_de, 'valido_ate', r.valido_ate,
                                       'deleted_at', r.deleted_at)
    FROM public.pessoas_retribuicoes r
   WHERE r.subsidio_alimentacao IS NOT NULL
  ON CONFLICT ON CONSTRAINT hr_legado_arquivo_unico DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_total := v_total + v_n;

  INSERT INTO public.hr_legado_arquivo (organization_id, tabela, coluna, registo_id, pessoa_id, valor)
  SELECT v.organization_id, 'pessoas_vinculos', 'horas_anuais_maximas', v.id, v.pessoa_id,
         pg_catalog.jsonb_build_object('horas_anuais_maximas', v.horas_anuais_maximas,
                                       'data_inicio', v.data_inicio, 'data_fim', v.data_fim,
                                       'deleted_at', v.deleted_at)
    FROM public.pessoas_vinculos v
   WHERE v.horas_anuais_maximas IS NOT NULL
  ON CONFLICT ON CONSTRAINT hr_legado_arquivo_unico DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_total := v_total + v_n;

  INSERT INTO public.hr_legado_arquivo (organization_id, tabela, coluna, registo_id, pessoa_id, valor)
  SELECT s.organization_id, 'hr_regras_subsidio_alimentacao', '*', s.id, NULL, pg_catalog.to_jsonb(s)
    FROM public.hr_regras_subsidio_alimentacao s
  ON CONFLICT ON CONSTRAINT hr_legado_arquivo_unico DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_total := v_total + v_n;

  RETURN v_total;
END;
$$;

DO $arquivar$
BEGIN
  PERFORM pg_temp.hr_legado_arquivar();
END;
$arquivar$;


-- ==============================================================================
-- B. rpc_hr_retribuicao_definir_pessoal sem p_subsidio (a antiga fica)
-- ==============================================================================
CREATE FUNCTION public.rpc_hr_retribuicao_definir_pessoal(
  p_pessoa_id        uuid,
  p_desde            date,
  p_subsidio_modo    text,
  p_duodecimos_pct   smallint,
  p_motivo           text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  c_motivo_max     constant integer := 500;
  v_uid            uuid := auth.uid();
  v_actor          uuid;
  v_org            uuid;
  v_hoje           date := current_date;
  v_limite_passado date := (current_date - interval '10 years')::date;
  v_limite_futuro  date := (current_date + interval '5 years')::date;
  v_cargo          uuid;
  v_vinculo        uuid;
  v_moeda          text;
  v_subsidio       numeric;
  v_campos         jsonb;
  v_sal            numeric;
  v_per            text;
  v_versoes        integer;
  v_motivo         text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'insufficient_privilege: e preciso uma sessao autenticada.'
      USING ERRCODE = '42501';
  END IF;

  -- Pessoa inexistente e falta de permissao dao a MESMA resposta.
  SELECT p.organization_id INTO v_org
    FROM public.pessoas p
   WHERE p.id = p_pessoa_id AND p.deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'insufficient_privilege: a pessoa nao existe, ou nao tem permissao para definir o subsidio e os duodecimos desta pessoa (hr.pessoas.retribuicao.edit).'
      USING ERRCODE = '42501';
  END IF;
  IF NOT coalesce(public.has_anew_permission_in_org(v_uid, 'hr.pessoas.retribuicao.edit', v_org), false) THEN
    RAISE EXCEPTION 'insufficient_privilege: a pessoa nao existe, ou nao tem permissao para definir o subsidio e os duodecimos desta pessoa (hr.pessoas.retribuicao.edit).'
      USING ERRCODE = '42501';
  END IF;

  IF p_desde IS NULL THEN
    RAISE EXCEPTION 'data_invalida: a data de efeito e obrigatoria.'
      USING ERRCODE = 'HRC04';
  END IF;
  IF p_desde < v_limite_passado OR p_desde > v_limite_futuro THEN
    RAISE EXCEPTION 'data_invalida: a data de efeito tem de estar entre % (10 anos para tras) e % (5 anos para a frente).',
      v_limite_passado, v_limite_futuro
      USING ERRCODE = 'HRC04';
  END IF;
  IF p_motivo IS NOT NULL AND char_length(p_motivo) > c_motivo_max THEN
    RAISE EXCEPTION 'cargo_dados_invalidos: o motivo nao pode ter mais de % caracteres.', c_motivo_max
      USING ERRCODE = 'HRC03';
  END IF;

  IF p_subsidio_modo IS NOT NULL AND p_subsidio_modo NOT IN ('dinheiro', 'cartao') THEN
    RAISE EXCEPTION 'cargo_dados_invalidos: o modo do subsidio de alimentacao tem de ser dinheiro ou cartao.'
      USING ERRCODE = 'HRC03';
  END IF;
  IF p_duodecimos_pct IS NOT NULL AND p_duodecimos_pct NOT IN (0, 50, 100) THEN
    RAISE EXCEPTION 'cargo_dados_invalidos: os duodecimos tem de ser 0, 50 ou 100 por cento.'
      USING ERRCODE = 'HRC03';
  END IF;

  SELECT au.id INTO v_actor FROM public.anew_users au WHERE au.auth_user_id = v_uid LIMIT 1;

  -- Serializa quem mexe na mesma pessoa (FOR NO KEY UPDATE; a ordem de locks
  -- do modulo e cargo antes de pessoa, e esta funcao nao bloqueia cargos).
  PERFORM 1 FROM public.pessoas p
   WHERE p.id = p_pessoa_id AND p.deleted_at IS NULL
     FOR NO KEY UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'insufficient_privilege: a pessoa nao existe, ou nao tem permissao para definir o subsidio e os duodecimos desta pessoa (hr.pessoas.retribuicao.edit).'
      USING ERRCODE = '42501';
  END IF;

  -- Sem cargo nessa data nao ha salario base.
  v_cargo := public.hr_pessoa_cargo_em(p_pessoa_id, p_desde);
  IF v_cargo IS NULL THEN
    RAISE EXCEPTION 'retribuicao_sem_cargo: a pessoa nao tem cargo em %. Atribua primeiro um cargo (separador Laborais da ficha).',
      p_desde
      USING ERRCODE = 'HRC11';
  END IF;

  -- Uma data passada que reescreve uma versao ja em vigor e uma CORRECCAO
  -- (exige tambem hr.pessoas.retribuicao.corrigir).
  IF p_desde < v_hoje
     AND EXISTS (
       SELECT 1 FROM public.pessoas_retribuicoes r
        WHERE r.pessoa_id = p_pessoa_id AND r.deleted_at IS NULL
          AND r.valido_de < p_desde
          AND (r.valido_ate IS NULL OR r.valido_ate > p_desde)
     )
     AND NOT coalesce(public.has_anew_permission_in_org(v_uid, 'hr.pessoas.retribuicao.corrigir', v_org), false) THEN
    RAISE EXCEPTION 'insufficient_privilege: alterar o subsidio e os duodecimos com data passada reescreve uma versao ja em vigor e exige tambem hr.pessoas.retribuicao.corrigir.'
      USING ERRCODE = '42501';
  END IF;

  -- Vinculo, moeda e SUBSIDIO: os da versao que cobre a data (o subsidio nao
  -- vem do pedido: herda-se, e o valor nao muda); senao o vinculo mais
  -- recente que nao terminou, EUR e sem subsidio.
  SELECT r.vinculo_id, r.moeda, r.subsidio_alimentacao INTO v_vinculo, v_moeda, v_subsidio
    FROM public.pessoas_retribuicoes r
   WHERE r.pessoa_id = p_pessoa_id AND r.deleted_at IS NULL
     AND r.valido_de <= p_desde
     AND (r.valido_ate IS NULL OR r.valido_ate > p_desde)
   ORDER BY r.valido_de DESC
   LIMIT 1;
  IF NOT FOUND THEN
    v_moeda := 'EUR';
    v_subsidio := NULL;
    SELECT v.id INTO v_vinculo
      FROM public.pessoas_vinculos v
     WHERE v.pessoa_id = p_pessoa_id AND v.organization_id = v_org
       AND v.deleted_at IS NULL AND v.estado <> 'terminado'
     ORDER BY v.data_inicio DESC
     LIMIT 1;
  END IF;

  v_campos := jsonb_build_object(
    'vinculo_id',                 v_vinculo,
    'moeda',                      coalesce(v_moeda, 'EUR'),
    'subsidio_alimentacao',       v_subsidio,
    'subsidio_alimentacao_modo',  p_subsidio_modo,
    'duodecimos_pct',             p_duodecimos_pct
  );

  v_motivo := coalesce(NULLIF(btrim(coalesce(p_motivo, '')), ''), 'Subsidio e duodecimos');

  v_versoes := public.hr_retribuicao_refazer_desde(
    p_pessoa_id, p_desde, v_campos, 'pessoa', v_motivo, v_actor);

  -- O salario base aplicado so se devolve a quem tem hr.pessoas.retribuicao.view.
  IF coalesce(public.has_anew_permission_in_org(v_uid, 'hr.pessoas.retribuicao.view', v_org), false) THEN
    SELECT s.salario_base, s.periodicidade INTO v_sal, v_per
      FROM public.hr_cargo_salario_em(v_cargo, p_desde) s;
  END IF;

  RETURN jsonb_build_object(
    'versoes_criadas', v_versoes,
    'desde',           p_desde,
    'salario_base',    v_sal,
    'periodicidade',   v_per
  );
END;
$$;

COMMENT ON FUNCTION public.rpc_hr_retribuicao_definir_pessoal(uuid, date, text, smallint, text) IS
'Define o modo do subsidio de alimentacao e os duodecimos de uma pessoa a partir de p_desde (versao nova de pessoas_retribuicoes, origem pessoa, com o salario do cargo nessa data; mesma logica de refazer que a assinatura antiga). SEM p_subsidio: o valor de subsidio_alimentacao herda-se da versao que cobre a data (sem versao: NULL), porque o subsidio vem da regra salarial da organizacao. Mesmos gates, erros e retorno da assinatura de 6 argumentos (20261210120000), que fica ate a fase de contrair: hr.pessoas.retribuicao.edit (pessoa inexistente = sem permissao, 42501); data passada que reescreve versao em vigor exige hr.pessoas.retribuicao.corrigir; datas de 10 anos para tras a 5 para a frente (HRC04); motivo ate 500 (HRC03); modo NULL, dinheiro ou cartao e duodecimos NULL, 0, 50 ou 100 (HRC03); cargo na data (HRC11). Devolve jsonb: versoes_criadas, desde, salario_base e periodicidade (estes dois so com hr.pessoas.retribuicao.view). search_path vazio. Desde 20270111700000.';


-- ==============================================================================
-- C. rpc_hr_horas_extra_config_guardar sem p_ano_min (a antiga fica)
-- ==============================================================================
CREATE FUNCTION public.rpc_hr_horas_extra_config_guardar(
  p_organization_id uuid, p_dia_min integer, p_alerta_pct integer, p_minimo_min integer)
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
     OR p_alerta_pct IS NULL OR p_alerta_pct < 1 OR p_alerta_pct > 100
     OR p_minimo_min IS NULL OR p_minimo_min < 1 OR p_minimo_min > 240 THEN
    RAISE EXCEPTION 'config_invalida' USING ERRCODE = 'HRA81';
  END IF;

  PERFORM 1 FROM public.hr_horas_extra_config c WHERE c.organization_id = p_organization_id FOR UPDATE;
  SELECT * INTO v_antes FROM public.hr_horas_extra_config_efetiva(p_organization_id);

  -- ano_min fora da lista: ao criar a linha fica o DEFAULT da coluna; numa
  -- linha que ja existe nao se toca (o limite anual vem da regra salarial).
  INSERT INTO public.hr_horas_extra_config AS c
    (organization_id, dia_min, alerta_pct, minimo_min, updated_by)
  VALUES
    (p_organization_id, p_dia_min, p_alerta_pct, p_minimo_min, v_anew)
  ON CONFLICT (organization_id) DO UPDATE
    SET dia_min    = EXCLUDED.dia_min,
        alerta_pct = EXCLUDED.alerta_pct,
        minimo_min = EXCLUDED.minimo_min,
        updated_by = EXCLUDED.updated_by;

  PERFORM public.hr_horas_extra_evento(p_organization_id, NULL, NULL, 'config_alterada', v_anew,
    jsonb_build_object(
      'antes', jsonb_build_object('dia_min', v_antes.dia_min, 'alerta_pct', v_antes.alerta_pct,
                                  'minimo_min', v_antes.minimo_min, 'omissao', v_antes.omissao),
      'depois', jsonb_build_object('dia_min', p_dia_min, 'alerta_pct', p_alerta_pct,
                                   'minimo_min', p_minimo_min)));

  RETURN jsonb_build_object('dia_min', p_dia_min, 'alerta_pct', p_alerta_pct,
                            'minimo_min', p_minimo_min, 'omissao', false);
END;
$$;

COMMENT ON FUNCTION public.rpc_hr_horas_extra_config_guardar(uuid, integer, integer, integer) IS
'RH (authenticated). Guarda os limites de horas extra por dia, de alerta e o minimo (upsert), com o antes e o depois em config_alterada. SEM p_ano_min: o limite anual vem da regra salarial (20270109700000); ao criar a linha ano_min fica com o DEFAULT da coluna, numa linha existente nao se toca. dia 1..1440, alerta 1..100, minimo 1..240 (config_invalida HRA81). Exige hr.assiduidade.gerir (42501), organizacao empregadora (HRA33); limite_excedido HRA41. Devolve {dia_min, alerta_pct, minimo_min, omissao}. A assinatura de 5 argumentos (20270104800000) fica ate a fase de contrair. Desde 20270111700000.';

-- EXECUTE das novas = o das antigas (aclexplode; sem o dono). G3 garantiu que
-- as antigas nao dao EXECUTE a PUBLIC nem a anon.
REVOKE ALL ON FUNCTION public.rpc_hr_retribuicao_definir_pessoal(uuid, date, text, smallint, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.rpc_hr_horas_extra_config_guardar(uuid, integer, integer, integer) FROM PUBLIC, anon, authenticated, service_role;

DO $privilegios$
DECLARE
  v_r record;
BEGIN
  FOR v_r IN
    SELECT x.nova, pg_get_userbyid(a.grantee) AS papel
      FROM (VALUES
        ('public.rpc_hr_retribuicao_definir_pessoal(uuid, date, text, smallint, text)',
         'public.rpc_hr_retribuicao_definir_pessoal(uuid, date, numeric, text, smallint, text)'),
        ('public.rpc_hr_horas_extra_config_guardar(uuid, integer, integer, integer)',
         'public.rpc_hr_horas_extra_config_guardar(uuid, integer, integer, integer, integer)')
      ) AS x(nova, antiga)
      JOIN pg_proc p ON p.oid = to_regprocedure(x.antiga)::oid
      CROSS JOIN LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
     WHERE a.privilege_type = 'EXECUTE' AND a.grantee <> p.proowner AND a.grantee <> 0
     ORDER BY 1, 2
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO %I', v_r.nova, v_r.papel);
  END LOOP;
END;
$privilegios$;


-- ==============================================================================
-- D. hr_documento_variaveis: o subsidio vem da regra salarial (corpo vivo)
-- ==============================================================================
-- Troca SO a expressao do token retribuicao_subsidio_alimentacao no corpo que
-- esta no remoto. CREATE OR REPLACE (via pg_get_functiondef) mantem dono,
-- privilegios, SECURITY DEFINER, search_path e comentario.
DO $documento$
DECLARE
  v_def text;
  v_t   record;
BEGIN
  SELECT * INTO v_t FROM tmp_lx_troca;
  v_def := pg_get_functiondef(to_regprocedure('public.hr_documento_variaveis(uuid, uuid, boolean)')::oid);
  IF (length(v_def) - length(replace(v_def, v_t.ancora, ''))) / length(v_t.ancora) <> 1 THEN
    RAISE EXCEPTION 'documento: a expressao do subsidio nao aparece uma so vez na definicao de hr_documento_variaveis.';
  END IF;
  EXECUTE replace(v_def, v_t.ancora, v_t.novo);
END;
$documento$;


-- ==============================================================================
-- E. Campos da admissao sem subsidio_alimentacao
--    Corpos de 20261210040000 (sec. 3 e 4) menos UMA linha cada (guarda G2: o
--    corpo vivo e esse). O formato de linha ('codigo', 'origem', bool) mantem-se
--    EXACTAMENTE: conviteAdmissaoContrato.test.ts le-o por regex. Mesmos
--    atributos; CREATE OR REPLACE mantem os privilegios.
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.hr_admissao_campos_obrigatorios()
RETURNS TABLE (codigo text, origem text, condicional boolean)
LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$
  SELECT *
  FROM (VALUES
    ('data_nascimento',               'pessoa', false),
    ('genero',                        'pessoa', false),
    ('nacionalidade',                 'pessoa', false),
    ('telefone_pessoal',              'pessoa', false),
    ('email_pessoal',                 'pessoa', false),
    ('estado_civil',                  'pessoa', false),
    ('dependentes',                   'pessoa', false),
    ('dependentes_deficientes',       'pessoa', false),
    ('conjuge_situacao_profissional', 'pessoa', true),
    ('naturalidade_freguesia',        'pessoa', false),
    ('naturalidade_concelho',         'pessoa', false),
    ('naturalidade_pais',             'pessoa', false),
    ('habilitacao_academica',         'pessoa', false),
    ('habilitacao_data_conclusao',    'pessoa', false),
    ('nif',                           'pessoa', false),
    ('niss',                          'pessoa', false),
    ('tipo_documento',                'pessoa', false),
    ('numero_documento',              'pessoa', false),
    ('validade_documento',            'pessoa', true),
    ('linha1',                        'pessoa', false),
    ('codigo_postal',                 'pessoa', false),
    ('localidade',                    'pessoa', false),
    ('tamanho_cima',                  'pessoa', false),
    ('tamanho_baixo',                 'pessoa', false),
    ('tamanho_calcado',               'pessoa', false),
    ('conta_numero',                  'pessoa', false),
    ('conta_titular',                 'pessoa', false),
    ('conta_banco',                   'pessoa', false),
    ('conta_bic',                     'pessoa', false),
    ('data_admissao',                 'rh',     false),
    ('cargo',                         'rh',     false),
    ('tipo_contrato',                 'rh',     false),
    ('duodecimos',                    'rh',     false)
    -- GANCHO: o campo tipo_horario (origem rh) entra aqui no lote dos horarios.
  ) AS t(codigo, origem, condicional);
$$;

COMMENT ON FUNCTION public.hr_admissao_campos_obrigatorios() IS
'Os campos da admissao. Origem pessoa: 29 campos que a pessoa preenche no convite (configuraveis por organizacao entre convite, ficha e opcional; inclui conta_bic desde 20261210040000). Origem rh: 4 campos FIXOS (data_admissao, cargo, tipo_contrato, duodecimos) que o RH preenche na ficha e que nunca sao configuraveis. Desde 20270111700000 sem subsidio_alimentacao: vem do cargo e da regra salarial da organizacao, nunca da pessoa. Espelhada em src/lib/hr/admissaoObrigatorios.ts (so os de origem pessoa).';

CREATE OR REPLACE FUNCTION public.hr_admissao_campo_permissao()
RETURNS TABLE (codigo text, tabela text, permissao text)
LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$
  SELECT *
  FROM (VALUES
    ('email_pessoal',                 'pessoas',                  'hr.pessoas.view'),
    ('data_admissao',                 'pessoas',                  'hr.pessoas.view'),
    ('cargo',                         'pessoas',                  'hr.pessoas.view'),
    ('data_nascimento',               'pessoas_dados_pessoais',   'hr.pessoas.pessoais.view'),
    ('genero',                        'pessoas_dados_pessoais',   'hr.pessoas.pessoais.view'),
    ('nacionalidade',                 'pessoas_dados_pessoais',   'hr.pessoas.pessoais.view'),
    ('telefone_pessoal',              'pessoas_dados_pessoais',   'hr.pessoas.pessoais.view'),
    ('estado_civil',                  'pessoas_dados_pessoais',   'hr.pessoas.pessoais.view'),
    ('dependentes',                   'pessoas_dados_pessoais',   'hr.pessoas.pessoais.view'),
    ('dependentes_deficientes',       'pessoas_dados_pessoais',   'hr.pessoas.pessoais.view'),
    ('conjuge_situacao_profissional', 'pessoas_dados_pessoais',   'hr.pessoas.pessoais.view'),
    ('naturalidade_freguesia',        'pessoas_dados_pessoais',   'hr.pessoas.pessoais.view'),
    ('naturalidade_concelho',         'pessoas_dados_pessoais',   'hr.pessoas.pessoais.view'),
    ('naturalidade_pais',             'pessoas_dados_pessoais',   'hr.pessoas.pessoais.view'),
    ('habilitacao_academica',         'pessoas_dados_pessoais',   'hr.pessoas.pessoais.view'),
    ('habilitacao_data_conclusao',    'pessoas_dados_pessoais',   'hr.pessoas.pessoais.view'),
    ('nif',                           'pessoas_identificacao',    'hr.pessoas.identificacao.view'),
    ('niss',                          'pessoas_identificacao',    'hr.pessoas.identificacao.view'),
    ('tipo_documento',                'pessoas_identificacao',    'hr.pessoas.identificacao.view'),
    ('numero_documento',              'pessoas_identificacao',    'hr.pessoas.identificacao.view'),
    ('validade_documento',            'pessoas_identificacao',    'hr.pessoas.identificacao.view'),
    ('linha1',                        'pessoas_moradas',          'hr.pessoas.morada.view'),
    ('codigo_postal',                 'pessoas_moradas',          'hr.pessoas.morada.view'),
    ('localidade',                    'pessoas_moradas',          'hr.pessoas.morada.view'),
    ('tamanho_cima',                  'pessoas_fardamento',       'hr.pessoas.laborais.view'),
    ('tamanho_baixo',                 'pessoas_fardamento',       'hr.pessoas.laborais.view'),
    ('tamanho_calcado',               'pessoas_fardamento',       'hr.pessoas.laborais.view'),
    ('tipo_contrato',                 'pessoas_vinculos',         'hr.pessoas.vinculos.view'),
    ('duodecimos',                    'pessoas_retribuicoes',     'hr.pessoas.retribuicao.view'),
    ('sindicalizado',                 'pessoas_sindicalizacao',   'hr.pessoas.sindicalizacao.view'),
    ('sindicato',                     'pessoas_sindicalizacao',   'hr.pessoas.sindicalizacao.view'),
    ('conta_numero',                  'pessoas_dados_bancarios',  'hr.pessoas.bancarios.view'),
    ('conta_titular',                 'pessoas_dados_bancarios',  'hr.pessoas.bancarios.view'),
    ('conta_banco',                   'pessoas_dados_bancarios',  'hr.pessoas.bancarios.view'),
    ('conta_bic',                     'pessoas_dados_bancarios',  'hr.pessoas.bancarios.view')
  ) AS t(codigo, tabela, permissao);
$$;

COMMENT ON FUNCTION public.hr_admissao_campo_permissao() IS
'Para cada campo de admissao, a tabela que o guarda e a permissao precisa para saber se esta preenchido. Inclui os campos de origem rh: cargo (hr.pessoas.view), tipo_contrato (hr.pessoas.vinculos.view) e duodecimos (hr.pessoas.retribuicao.view); e conta_bic (hr.pessoas.bancarios.view, desde 20261210040000). Desde 20270111700000 sem subsidio_alimentacao (vem da regra salarial). Sem uma linha aqui, hr_admissao_pendencias deita o codigo fora em silencio.';


-- ---- O estado de depois de E (comandos proprios; so leitura) ----------------
CREATE TEMP TABLE tmp_lx_adm_depois ON COMMIT DROP AS
SELECT 'campos'::text AS fn, to_jsonb(c) AS linha FROM public.hr_admissao_campos_obrigatorios() c
UNION ALL
SELECT 'permissao'::text, to_jsonb(c) FROM public.hr_admissao_campo_permissao() c
UNION ALL
SELECT 'org_nike'::text, to_jsonb(c)
  FROM public.hr_admissao_campos_obrigatorios_org('b6ffce4f-f630-4933-833a-008649757a33'::uuid) c;

CREATE TEMP TABLE tmp_lx_pend_depois ON COMMIT DROP AS
SELECT pe.id AS pessoa_id, x.codigo, x.origem, x.posicao
  FROM public.pessoas pe
  CROSS JOIN LATERAL public.hr_admissao_pendencias(pe.id) x
 WHERE pe.organization_id = 'b6ffce4f-f630-4933-833a-008649757a33'::uuid
   AND pe.deleted_at IS NULL;


-- ==============================================================================
-- Conferir: falha a migration inteira se algo nao bater. As provas de
-- comportamento correm SO na nike, em subtransaccoes desfeitas (sentinelas
-- HLX10 a HLX41).
-- ==============================================================================
DO $conferir$
DECLARE
  k_nike      constant uuid := 'b6ffce4f-f630-4933-833a-008649757a33'::uuid;
  k_motivo    constant text := 'prova da migracao 20270111700000';
  k_sem_regra constant text := '____________';
  k_def_nova  constant text := 'public.rpc_hr_retribuicao_definir_pessoal(uuid, date, text, smallint, text)';
  k_def_velha constant text := 'public.rpc_hr_retribuicao_definir_pessoal(uuid, date, numeric, text, smallint, text)';
  k_he_nova   constant text := 'public.rpc_hr_horas_extra_config_guardar(uuid, integer, integer, integer)';
  k_he_velha  constant text := 'public.rpc_hr_horas_extra_config_guardar(uuid, integer, integer, integer, integer)';
  v_n         integer;
  v_m         integer;
  v_k         integer;
  v_i         integer;
  v_total     integer;
  v_g1        text;
  v_g2        text;
  v_st        text;
  v_msg       text;
  v_t         record;
  v_r         record;
  v_j         jsonb;
  v_antes     jsonb;
  v_depois    jsonb;
  v_pid       uuid;
  v_uid       uuid;
  v_falso     uuid;
  v_d         date;
  v_sub       numeric;
  v_esp       text;
  v_ramos     text := '';
  v_regra     record;
  v_cfg_antes jsonb;
  v_def_ano   text;
  v_ret_nike  integer;
  v_arq_n     integer;
BEGIN
  -- ---- A.1 Estrutura do arquivo -------------------------------------------
  IF NOT EXISTS (SELECT 1 FROM pg_class c WHERE c.oid = to_regclass('public.hr_legado_arquivo')
                  AND c.relrowsecurity AND c.relforcerowsecurity) THEN
    RAISE EXCEPTION 'Conferir: hr_legado_arquivo sem RLS ligada e forcada.';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policy pol WHERE pol.polrelid = to_regclass('public.hr_legado_arquivo')) THEN
    RAISE EXCEPTION 'Conferir: hr_legado_arquivo tem politicas; o desenho e sem nenhuma.';
  END IF;
  SELECT coalesce(string_agg(pg_get_userbyid(a.grantee) || ':' || a.privilege_type::text, ','), '') INTO v_g1
    FROM pg_class c, aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
   WHERE c.oid = to_regclass('public.hr_legado_arquivo') AND a.grantee <> c.relowner;
  IF v_g1 <> '' THEN
    RAISE EXCEPTION 'Conferir: hr_legado_arquivo tem privilegios para "%".', v_g1;
  END IF;
  SELECT count(*) INTO v_n FROM pg_trigger t
   WHERE t.tgrelid = to_regclass('public.hr_legado_arquivo') AND NOT t.tgisinternal AND t.tgenabled::text <> 'D'
     AND t.tgname::text IN ('trg_hr_legado_arquivo_so_acrescentar', 'trg_hr_legado_arquivo_sem_truncate');
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'Conferir: hr_legado_arquivo devia ter os 2 triggers de historico ligados; tem %.', v_n;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint c
                  WHERE c.conrelid = to_regclass('public.hr_legado_arquivo')
                    AND c.conname::text = 'hr_legado_arquivo_unico' AND c.contype::text = 'u') THEN
    RAISE EXCEPTION 'Conferir: falta o unico (tabela, coluna, registo_id) do arquivo.';
  END IF;

  -- ---- A.2 Contagens: arquivado = origem (so numeros) ----------------------
  SELECT count(*) INTO v_n FROM public.pessoas_retribuicoes r WHERE r.subsidio_alimentacao IS NOT NULL;
  SELECT count(*) INTO v_m FROM public.hr_legado_arquivo a
   WHERE a.tabela = 'pessoas_retribuicoes' AND a.coluna = 'subsidio_alimentacao';
  SELECT count(*) INTO v_k
    FROM public.hr_legado_arquivo a
    JOIN public.pessoas_retribuicoes r ON r.id = a.registo_id
   WHERE a.tabela = 'pessoas_retribuicoes' AND a.coluna = 'subsidio_alimentacao'
     AND a.organization_id = r.organization_id AND a.pessoa_id IS NOT DISTINCT FROM r.pessoa_id
     AND (a.valor -> 'subsidio_alimentacao') = to_jsonb(r.subsidio_alimentacao)
     AND (a.valor ->> 'valido_de')::date = r.valido_de
     AND (a.valor ->> 'valido_ate')::date IS NOT DISTINCT FROM r.valido_ate;
  IF v_m <> v_n OR v_k <> v_n THEN
    RAISE EXCEPTION 'Conferir: subsidio_alimentacao: % na origem, % arquivadas, % iguais a origem.', v_n, v_m, v_k;
  END IF;
  v_total := v_n;

  SELECT count(*) INTO v_n FROM public.pessoas_vinculos v WHERE v.horas_anuais_maximas IS NOT NULL;
  SELECT count(*) INTO v_m FROM public.hr_legado_arquivo a
   WHERE a.tabela = 'pessoas_vinculos' AND a.coluna = 'horas_anuais_maximas';
  SELECT count(*) INTO v_k
    FROM public.hr_legado_arquivo a
    JOIN public.pessoas_vinculos v ON v.id = a.registo_id
   WHERE a.tabela = 'pessoas_vinculos' AND a.coluna = 'horas_anuais_maximas'
     AND a.organization_id = v.organization_id AND a.pessoa_id IS NOT DISTINCT FROM v.pessoa_id
     AND (a.valor -> 'horas_anuais_maximas') = to_jsonb(v.horas_anuais_maximas);
  IF v_m <> v_n OR v_k <> v_n THEN
    RAISE EXCEPTION 'Conferir: horas_anuais_maximas: % na origem, % arquivadas, % iguais a origem.', v_n, v_m, v_k;
  END IF;
  v_total := v_total + v_n;

  SELECT count(*) INTO v_n FROM public.hr_regras_subsidio_alimentacao;
  SELECT count(*) INTO v_m FROM public.hr_legado_arquivo a
   WHERE a.tabela = 'hr_regras_subsidio_alimentacao' AND a.coluna = '*';
  SELECT count(*) INTO v_k
    FROM public.hr_legado_arquivo a
    JOIN public.hr_regras_subsidio_alimentacao s ON s.id = a.registo_id
   WHERE a.tabela = 'hr_regras_subsidio_alimentacao' AND a.coluna = '*'
     AND a.organization_id = s.organization_id AND a.valor = to_jsonb(s);
  IF v_m <> v_n OR v_k <> v_n THEN
    RAISE EXCEPTION 'Conferir: hr_regras_subsidio_alimentacao: % na origem, % arquivadas, % iguais a origem.', v_n, v_m, v_k;
  END IF;
  v_total := v_total + v_n;

  SELECT count(*) INTO v_arq_n FROM public.hr_legado_arquivo;
  IF v_arq_n <> v_total THEN
    RAISE EXCEPTION 'Conferir: o arquivo tem % linhas; a origem soma %.', v_arq_n, v_total;
  END IF;

  -- ---- A.3 Idempotente e so de acrescento (HLX10, desfeito) ----------------
  BEGIN
    v_n := pg_temp.hr_legado_arquivar();
    IF v_n <> 0 OR (SELECT count(*) FROM public.hr_legado_arquivo) <> v_arq_n THEN
      RAISE EXCEPTION 'Conferir: arquivar outra vez acrescentou % linha(s); devia ser 0.', v_n;
    END IF;

    INSERT INTO public.hr_legado_arquivo (organization_id, tabela, coluna, registo_id, valor)
    VALUES (k_nike, 'prova_conferir', 'prova', gen_random_uuid(), '{"prova": true}'::jsonb);
    v_n := 0;
    BEGIN UPDATE public.hr_legado_arquivo SET valor = '{}'::jsonb WHERE tabela = 'prova_conferir';
    EXCEPTION WHEN OTHERS THEN IF position('legado_arquivo_so_acrescentar' IN SQLERRM) = 1 THEN v_n := v_n + 1; END IF; END;
    BEGIN DELETE FROM public.hr_legado_arquivo WHERE tabela = 'prova_conferir';
    EXCEPTION WHEN OTHERS THEN IF position('legado_arquivo_so_acrescentar' IN SQLERRM) = 1 THEN v_n := v_n + 1; END IF; END;
    BEGIN TRUNCATE public.hr_legado_arquivo;
    EXCEPTION WHEN OTHERS THEN IF position('legado_arquivo_so_acrescentar' IN SQLERRM) = 1 THEN v_n := v_n + 1; END IF; END;
    IF v_n <> 3 THEN
      RAISE EXCEPTION 'Conferir: das 3 tentativas de reescrever ou apagar o arquivo (UPDATE, DELETE, TRUNCATE) so % foram recusadas.', v_n;
    END IF;
    RAISE EXCEPTION 'arquivo_ok' USING ERRCODE = 'HLX10';
  EXCEPTION
    WHEN SQLSTATE 'HLX10' THEN NULL;
  END;
  IF (SELECT count(*) FROM public.hr_legado_arquivo) <> v_arq_n THEN
    RAISE EXCEPTION 'Conferir: a prova do arquivo deixou linhas.';
  END IF;

  -- ---- B/C.1 As RPCs novas: atributos, privilegios iguais as antigas ------
  FOR v_t IN SELECT * FROM (VALUES (k_def_nova, k_def_velha), (k_he_nova, k_he_velha)) AS x(nova, velha) LOOP
    IF to_regprocedure(v_t.nova) IS NULL OR to_regprocedure(v_t.velha) IS NULL THEN
      RAISE EXCEPTION 'Conferir: falta % ou %.', v_t.nova, v_t.velha;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid = to_regprocedure(v_t.nova)::oid AND p.prosecdef
                      AND coalesce(p.proconfig, ARRAY[]::text[]) @> ARRAY['search_path=""']) THEN
      RAISE EXCEPTION 'Conferir: % devia ser SECURITY DEFINER com search_path vazio.', v_t.nova;
    END IF;
    SELECT coalesce(string_agg(DISTINCT pg_get_userbyid(a.grantee), ',' ORDER BY pg_get_userbyid(a.grantee)), '') INTO v_g1
      FROM pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
     WHERE p.oid = to_regprocedure(v_t.nova)::oid AND a.privilege_type = 'EXECUTE' AND a.grantee <> p.proowner;
    SELECT coalesce(string_agg(DISTINCT pg_get_userbyid(a.grantee), ',' ORDER BY pg_get_userbyid(a.grantee)), '') INTO v_g2
      FROM pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
     WHERE p.oid = to_regprocedure(v_t.velha)::oid AND a.privilege_type = 'EXECUTE' AND a.grantee <> p.proowner;
    IF v_g1 IS DISTINCT FROM v_g2 OR v_g1 = '' OR position('anon' IN v_g1) > 0 THEN
      RAISE EXCEPTION 'Conferir: EXECUTE de % ("%") devia ser igual ao da antiga ("%"), sem anon.', v_t.nova, v_g1, v_g2;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                WHERE p.oid = to_regprocedure(v_t.nova)::oid AND a.grantee = 0) THEN
      RAISE EXCEPTION 'Conferir: % da EXECUTE a PUBLIC.', v_t.nova;
    END IF;
  END LOOP;

  -- Duas assinaturas por nome, e nenhum conjunto de chaves do PostgREST serve
  -- as duas (os obrigatorios de cada uma nao cabem na outra).
  SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname::text = 'public'
     AND p.proname::text IN ('rpc_hr_retribuicao_definir_pessoal', 'rpc_hr_horas_extra_config_guardar');
  SELECT count(*) INTO v_m
    FROM pg_proc a
    JOIN pg_proc b ON b.proname = a.proname AND b.pronamespace = a.pronamespace AND a.oid < b.oid
   WHERE a.pronamespace = 'public'::regnamespace
     AND a.proname::text IN ('rpc_hr_retribuicao_definir_pessoal', 'rpc_hr_horas_extra_config_guardar')
     AND (a.proargnames[1:(a.pronargs - a.pronargdefaults)] || b.proargnames[1:(b.pronargs - b.pronargdefaults)])
         <@ a.proargnames[1:a.pronargs]
     AND (a.proargnames[1:(a.pronargs - a.pronargdefaults)] || b.proargnames[1:(b.pronargs - b.pronargdefaults)])
         <@ b.proargnames[1:b.pronargs];
  IF v_n <> 4 OR v_m <> 0 THEN
    RAISE EXCEPTION 'Conferir: esperavam-se 4 assinaturas (2 por RPC) sem conjunto de chaves ambiguo; ha % assinaturas e % par(es) ambiguo(s).', v_n, v_m;
  END IF;

  -- As antigas nao mudaram (md5 igual ao lido).
  FOR v_r IN SELECT e.fn, e.corpo FROM tmp_lx_esperado e WHERE e.fn IN (k_def_velha, k_he_velha) LOOP
    IF (SELECT md5(replace(p.prosrc, chr(13), '')) FROM pg_proc p WHERE p.oid = to_regprocedure(v_r.fn)::oid)
       IS DISTINCT FROM md5(replace(v_r.corpo, chr(13), '')) THEN
      RAISE EXCEPTION 'Conferir: a antiga % mudou.', v_r.fn;
    END IF;
  END LOOP;

  -- ---- D.1 hr_documento_variaveis mudou SO a expressao ---------------------
  SELECT t.ancora, t.novo, d.prosrc, d.prosecdef, d.proconfig, d.proacl, d.proowner INTO v_t
    FROM tmp_lx_troca t CROSS JOIN tmp_lx_doc d;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
     WHERE p.oid = to_regprocedure('public.hr_documento_variaveis(uuid, uuid, boolean)')::oid
       AND replace(p.prosrc, v_t.novo, v_t.ancora) = v_t.prosrc
       AND (length(p.prosrc) - length(replace(p.prosrc, v_t.novo, ''))) / length(v_t.novo) = 1
       AND p.prosecdef = v_t.prosecdef
       AND coalesce(array_to_string(p.proconfig, ','), '') = v_t.proconfig
       AND coalesce(p.proacl::text, '') = v_t.proacl
       AND p.proowner = v_t.proowner) THEN
    RAISE EXCEPTION 'Conferir: hr_documento_variaveis mudou mais do que a expressao do subsidio (ou perdeu atributos/privilegios).';
  END IF;

  -- ---- D.2 A mesma emissao antes e depois (HLX20, desfeito) ----------------
  PERFORM set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '{}', true);
  SELECT a.pessoa_id, a.mapa INTO v_pid, v_antes FROM tmp_lx_doc_antes a;
  IF v_pid IS NULL THEN
    RAISE EXCEPTION 'Conferir: na nike nao ha pessoa com retribuicao em vigor hoje; a prova de D nao correu.';
  END IF;
  v_j := public.hr_regras_salariais_em(k_nike, current_date);
  IF v_j IS NULL THEN
    v_esp := k_sem_regra;
  ELSE
    v_esp := replace(((v_j ->> 'subsidio_valor_dia')::numeric(10,2))::text, '.', ',') || ' ' || chr(8364);
  END IF;
  BEGIN
    v_depois := public.hr_documento_variaveis(v_pid, k_nike, true);
    RAISE EXCEPTION 'doc_depois_ok' USING ERRCODE = 'HLX20';
  EXCEPTION
    WHEN SQLSTATE 'HLX20' THEN NULL;
  END;
  IF (v_depois - 'retribuicao_subsidio_alimentacao') IS DISTINCT FROM (v_antes - 'retribuicao_subsidio_alimentacao') THEN
    RAISE EXCEPTION 'Conferir: a emissao da nike mudou noutros tokens alem de retribuicao_subsidio_alimentacao (o modo incluido).';
  END IF;
  IF (v_depois ->> 'retribuicao_subsidio_alimentacao') IS DISTINCT FROM v_esp THEN
    RAISE EXCEPTION 'Conferir: retribuicao_subsidio_alimentacao nao e o valor por dia da regra em vigor hoje (ou a linha em branco sem regra).';
  END IF;
  IF v_j IS NOT NULL THEN
    IF (v_depois ->> 'retribuicao_subsidio_alimentacao') !~ ('^[0-9]+,[0-9]{2} ' || chr(8364) || '$') THEN
      RAISE EXCEPTION 'Conferir: o subsidio no documento nao esta no formato portugues (virgula e simbolo do euro).';
    END IF;
    v_ramos := 'com regra';
  ELSE
    v_ramos := 'sem regra';
  END IF;

  -- Sem regra em vigor (fecha-se a versao de hoje na vespera, so na prova): a
  -- linha em branco (HLX21, desfeito).
  SELECT r.id, r.valido_de, r.valido_ate INTO v_regra
    FROM public.hr_regras_salariais r
   WHERE r.organization_id = k_nike AND r.substituida_em IS NULL
     AND r.valido_de <= current_date AND (r.valido_ate IS NULL OR r.valido_ate >= current_date)
   ORDER BY r.valido_de DESC
   LIMIT 1;
  IF v_regra.id IS NOT NULL AND v_regra.valido_ate IS NULL AND v_regra.valido_de < current_date THEN
    BEGIN
      UPDATE public.hr_regras_salariais SET valido_ate = current_date - 1 WHERE id = v_regra.id;
      IF public.hr_regras_salariais_em(k_nike, current_date) IS NOT NULL THEN
        RAISE EXCEPTION 'Conferir: fechada a versao na vespera, ainda ha regra hoje.';
      END IF;
      v_j := public.hr_documento_variaveis(v_pid, k_nike, true);
      IF (v_j ->> 'retribuicao_subsidio_alimentacao') IS DISTINCT FROM k_sem_regra
         OR (v_j - 'retribuicao_subsidio_alimentacao') IS DISTINCT FROM (v_antes - 'retribuicao_subsidio_alimentacao') THEN
        RAISE EXCEPTION 'Conferir: sem regra em vigor, o token devia ser a linha em branco e o resto igual.';
      END IF;
      RAISE EXCEPTION 'doc_sem_regra_ok' USING ERRCODE = 'HLX21';
    EXCEPTION
      WHEN SQLSTATE 'HLX21' THEN NULL;
    END;
    v_ramos := v_ramos || ' e sem regra';
  END IF;
  IF v_ramos NOT LIKE '%com regra%' OR v_ramos NOT LIKE '%sem regra%' THEN
    RAISE NOTICE 'Conferir D: so o ramo "%" foi exercitado (a regra da nike em vigor hoje nao se pode fechar na vespera, ou nao ha regra).', v_ramos;
  END IF;

  -- ---- B.2 Comportamento das duas assinaturas (HLX30, desfeito) ------------
  SELECT count(*) INTO v_ret_nike FROM public.pessoas_retribuicoes r WHERE r.organization_id = k_nike;
  BEGIN
    SELECT au.auth_user_id INTO v_uid
      FROM public.anew_memberships am
      JOIN public.anew_users au ON au.id = am.user_id
     WHERE am.organization_id = k_nike AND am.status = 'active' AND au.auth_user_id IS NOT NULL
       AND coalesce(public.has_anew_permission_in_org(au.auth_user_id, 'hr.pessoas.retribuicao.edit', k_nike), false)
     ORDER BY au.id
     LIMIT 1;
    IF v_uid IS NULL THEN
      RAISE EXCEPTION 'Conferir: na nike falta um utilizador activo com hr.pessoas.retribuicao.edit.';
    END IF;

    v_d := current_date + 7;
    SELECT p.id INTO v_pid
      FROM public.pessoas p
     WHERE p.organization_id = k_nike AND p.deleted_at IS NULL
       AND public.hr_pessoa_cargo_em(p.id, v_d) IS NOT NULL
       AND public.hr_pessoa_cargo_em(p.id, v_d + 4) IS NOT NULL
       AND EXISTS (SELECT 1 FROM public.pessoas_retribuicoes r
                    WHERE r.pessoa_id = p.id AND r.organization_id = k_nike AND r.deleted_at IS NULL
                      AND r.valido_de < v_d AND (r.valido_ate IS NULL OR r.valido_ate > v_d + 4))
     ORDER BY p.id
     LIMIT 1;
    IF v_pid IS NULL THEN
      RAISE EXCEPTION 'Conferir: na nike nao ha pessoa com cargo e uma so retribuicao a cobrir de % a %.', v_d, v_d + 4;
    END IF;
    SELECT r.subsidio_alimentacao INTO v_sub
      FROM public.pessoas_retribuicoes r
     WHERE r.pessoa_id = v_pid AND r.deleted_at IS NULL
       AND r.valido_de <= v_d AND (r.valido_ate IS NULL OR r.valido_ate > v_d)
     ORDER BY r.valido_de DESC
     LIMIT 1;

    -- Sem sessao e com sessao sem permissao: 42501.
    FOR v_i IN 1..2 LOOP
      IF v_i = 1 THEN
        PERFORM set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '{}', true);
      ELSE
        v_falso := gen_random_uuid();
        PERFORM set_config('request.jwt.claim.sub', v_falso::text, true),
                set_config('request.jwt.claims', json_build_object('sub', v_falso, 'role', 'authenticated')::text, true);
      END IF;
      v_st := NULL;
      BEGIN
        PERFORM public.rpc_hr_retribuicao_definir_pessoal(
          p_pessoa_id => v_pid, p_desde => v_d, p_subsidio_modo => 'cartao'::text,
          p_duodecimos_pct => 50::smallint, p_motivo => k_motivo);
      EXCEPTION WHEN OTHERS THEN v_st := SQLSTATE;
      END;
      IF v_st IS DISTINCT FROM '42501' THEN
        RAISE EXCEPTION 'Conferir: a nova definir_pessoal (caso %) devia dar 42501; deu %.', v_i, coalesce(v_st, 'aceite');
      END IF;
    END LOOP;

    PERFORM set_config('request.jwt.claim.sub', v_uid::text, true),
            set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);

    -- Pessoa inexistente: a mesma recusa e a mesma mensagem que sem permissao.
    v_st := NULL;
    v_msg := NULL;
    BEGIN
      PERFORM public.rpc_hr_retribuicao_definir_pessoal(
        p_pessoa_id => gen_random_uuid(), p_desde => v_d, p_subsidio_modo => 'cartao'::text,
        p_duodecimos_pct => 50::smallint, p_motivo => k_motivo);
    EXCEPTION WHEN OTHERS THEN v_st := SQLSTATE; v_msg := SQLERRM;
    END;
    IF v_st IS DISTINCT FROM '42501' OR position('insufficient_privilege: a pessoa nao existe' IN coalesce(v_msg, '')) <> 1 THEN
      RAISE EXCEPTION 'Conferir: pessoa inexistente devia dar a recusa 42501 de sem permissao; deu %.', coalesce(v_st, 'aceite');
    END IF;

    -- Validacoes: modo, duodecimos (HRC03), data em falta e fora do limite (HRC04).
    v_n := 0;
    BEGIN PERFORM public.rpc_hr_retribuicao_definir_pessoal(p_pessoa_id => v_pid, p_desde => v_d,
            p_subsidio_modo => 'cheque'::text, p_duodecimos_pct => 50::smallint);
    EXCEPTION WHEN SQLSTATE 'HRC03' THEN v_n := v_n + 1; END;
    BEGIN PERFORM public.rpc_hr_retribuicao_definir_pessoal(p_pessoa_id => v_pid, p_desde => v_d,
            p_subsidio_modo => 'cartao'::text, p_duodecimos_pct => 30::smallint);
    EXCEPTION WHEN SQLSTATE 'HRC03' THEN v_n := v_n + 1; END;
    BEGIN PERFORM public.rpc_hr_retribuicao_definir_pessoal(p_pessoa_id => v_pid, p_desde => NULL::date,
            p_subsidio_modo => 'cartao'::text, p_duodecimos_pct => 50::smallint);
    EXCEPTION WHEN SQLSTATE 'HRC04' THEN v_n := v_n + 1; END;
    BEGIN PERFORM public.rpc_hr_retribuicao_definir_pessoal(p_pessoa_id => v_pid, p_desde => current_date + 2200,
            p_subsidio_modo => 'cartao'::text, p_duodecimos_pct => 50::smallint);
    EXCEPTION WHEN SQLSTATE 'HRC04' THEN v_n := v_n + 1; END;
    IF v_n <> 4 THEN
      RAISE EXCEPTION 'Conferir: das 4 entradas invalidas na nova definir_pessoal so % foram recusadas com o codigo certo.', v_n;
    END IF;

    -- A nova, com motivo: o subsidio herda-se da versao que cobre a data.
    v_j := public.rpc_hr_retribuicao_definir_pessoal(
      p_pessoa_id => v_pid, p_desde => v_d, p_subsidio_modo => 'cartao'::text,
      p_duodecimos_pct => 50::smallint, p_motivo => k_motivo);
    IF coalesce((v_j ->> 'versoes_criadas')::integer, 0) < 1 OR (v_j ->> 'desde')::date IS DISTINCT FROM v_d THEN
      RAISE EXCEPTION 'Conferir: a nova definir_pessoal devia criar pelo menos uma versao desde %.', v_d;
    END IF;
    SELECT count(*) INTO v_n FROM public.pessoas_retribuicoes r
     WHERE r.pessoa_id = v_pid AND r.deleted_at IS NULL AND r.valido_de = v_d
       AND r.subsidio_alimentacao IS NOT DISTINCT FROM v_sub
       AND r.subsidio_alimentacao_modo = 'cartao' AND r.duodecimos_pct = 50
       AND r.origem = 'pessoa' AND r.motivo = k_motivo;
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'Conferir: a versao de % devia herdar o subsidio, com modo cartao, 50%% e origem pessoa (% linha(s)).', v_d, v_n;
    END IF;

    -- A nova, sem motivo (4 chaves, como o PostgREST as mandaria): motivo omisso.
    PERFORM public.rpc_hr_retribuicao_definir_pessoal(
      p_pessoa_id => v_pid, p_desde => v_d + 2, p_subsidio_modo => 'dinheiro'::text,
      p_duodecimos_pct => 100::smallint);
    SELECT count(*) INTO v_n FROM public.pessoas_retribuicoes r
     WHERE r.pessoa_id = v_pid AND r.deleted_at IS NULL AND r.valido_de = v_d + 2
       AND r.subsidio_alimentacao IS NOT DISTINCT FROM v_sub
       AND r.subsidio_alimentacao_modo = 'dinheiro' AND r.duodecimos_pct = 100
       AND r.motivo = 'Subsidio e duodecimos';
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'Conferir: sem motivo, a versao de % devia herdar o subsidio, com o motivo omisso (% linha(s)).', v_d + 2, v_n;
    END IF;

    -- A antiga continua a gravar o valor que recebe.
    PERFORM public.rpc_hr_retribuicao_definir_pessoal(
      p_pessoa_id => v_pid, p_desde => v_d + 4, p_subsidio => 7.50::numeric,
      p_subsidio_modo => 'dinheiro'::text, p_duodecimos_pct => 0::smallint, p_motivo => k_motivo);
    SELECT count(*) INTO v_n FROM public.pessoas_retribuicoes r
     WHERE r.pessoa_id = v_pid AND r.deleted_at IS NULL AND r.valido_de = v_d + 4
       AND r.subsidio_alimentacao = 7.50 AND r.duodecimos_pct = 0;
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'Conferir: a antiga definir_pessoal deixou de gravar o subsidio recebido (% linha(s)).', v_n;
    END IF;

    RAISE EXCEPTION 'definir_pessoal_ok' USING ERRCODE = 'HLX30';
  EXCEPTION
    WHEN SQLSTATE 'HLX30' THEN NULL;
  END;
  PERFORM set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '{}', true);
  IF (SELECT count(*) FROM public.pessoas_retribuicoes r WHERE r.organization_id = k_nike) <> v_ret_nike THEN
    RAISE EXCEPTION 'Conferir: a prova de B deixou retribuicoes na nike.';
  END IF;

  -- ---- C.2 Comportamento das duas assinaturas (HLX40/HLX41, desfeitos) -----
  SELECT to_jsonb(c) INTO v_cfg_antes FROM public.hr_horas_extra_config c WHERE c.organization_id = k_nike;
  SELECT pg_get_expr(d.adbin, d.adrelid)::text INTO v_def_ano
    FROM pg_attrdef d JOIN pg_attribute a ON a.attrelid = d.adrelid AND a.attnum = d.adnum
   WHERE d.adrelid = to_regclass('public.hr_horas_extra_config') AND a.attname::text = 'ano_min';

  SELECT au.auth_user_id INTO v_uid
    FROM public.anew_memberships am
    JOIN public.anew_users au ON au.id = am.user_id
   WHERE am.organization_id = k_nike AND am.status = 'active' AND au.auth_user_id IS NOT NULL
     AND coalesce(public.has_anew_permission_in_org(au.auth_user_id, 'hr.assiduidade.gerir', k_nike), false)
   ORDER BY au.id
   LIMIT 1;
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Conferir: na nike falta um utilizador activo com hr.assiduidade.gerir.';
  END IF;

  FOR v_i IN 1..2 LOOP
    IF v_i = 1 THEN
      PERFORM set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '{}', true);
    ELSE
      v_falso := gen_random_uuid();
      PERFORM set_config('request.jwt.claim.sub', v_falso::text, true),
              set_config('request.jwt.claims', json_build_object('sub', v_falso, 'role', 'authenticated')::text, true);
    END IF;
    v_st := NULL;
    BEGIN
      PERFORM public.rpc_hr_horas_extra_config_guardar(
        p_organization_id => k_nike, p_dia_min => 100, p_alerta_pct => 70, p_minimo_min => 20);
    EXCEPTION WHEN OTHERS THEN v_st := SQLSTATE;
    END;
    IF v_st IS DISTINCT FROM '42501' THEN
      RAISE EXCEPTION 'Conferir: a nova config_guardar (caso %) devia dar 42501; deu %.', v_i, coalesce(v_st, 'aceite');
    END IF;
  END LOOP;

  PERFORM set_config('request.jwt.claim.sub', v_uid::text, true),
          set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);

  v_n := 0;
  BEGIN PERFORM public.rpc_hr_horas_extra_config_guardar(p_organization_id => k_nike, p_dia_min => 0, p_alerta_pct => 70, p_minimo_min => 20);
  EXCEPTION WHEN SQLSTATE 'HRA81' THEN v_n := v_n + 1; END;
  BEGIN PERFORM public.rpc_hr_horas_extra_config_guardar(p_organization_id => k_nike, p_dia_min => 100, p_alerta_pct => 101, p_minimo_min => 20);
  EXCEPTION WHEN SQLSTATE 'HRA81' THEN v_n := v_n + 1; END;
  BEGIN PERFORM public.rpc_hr_horas_extra_config_guardar(p_organization_id => k_nike, p_dia_min => 100, p_alerta_pct => 70, p_minimo_min => 241);
  EXCEPTION WHEN SQLSTATE 'HRA81' THEN v_n := v_n + 1; END;
  IF v_n <> 3 THEN
    RAISE EXCEPTION 'Conferir: das 3 entradas invalidas na nova config_guardar so % deram HRA81.', v_n;
  END IF;

  -- Linha existente: a antiga grava ano_min; a nova muda os outros e nao o toca.
  BEGIN
    PERFORM public.rpc_hr_horas_extra_config_guardar(
      p_organization_id => k_nike, p_dia_min => 110, p_ano_min => 4321, p_alerta_pct => 60, p_minimo_min => 25);
    IF NOT EXISTS (SELECT 1 FROM public.hr_horas_extra_config c
                    WHERE c.organization_id = k_nike AND c.dia_min = 110 AND c.ano_min = 4321
                      AND c.alerta_pct = 60 AND c.minimo_min = 25) THEN
      RAISE EXCEPTION 'Conferir: a antiga config_guardar deixou de gravar os quatro limites.';
    END IF;
    v_j := public.rpc_hr_horas_extra_config_guardar(
      p_organization_id => k_nike, p_dia_min => 100, p_alerta_pct => 70, p_minimo_min => 20);
    IF NOT EXISTS (SELECT 1 FROM public.hr_horas_extra_config c
                    WHERE c.organization_id = k_nike AND c.dia_min = 100 AND c.ano_min = 4321
                      AND c.alerta_pct = 70 AND c.minimo_min = 20)
       OR v_j ? 'ano_min' OR (v_j ->> 'dia_min')::integer IS DISTINCT FROM 100
       OR (v_j ->> 'omissao')::boolean IS DISTINCT FROM false THEN
      RAISE EXCEPTION 'Conferir: a nova config_guardar devia mudar dia, alerta e minimo, deixar ano_min, e devolver sem ano_min.';
    END IF;
    RAISE EXCEPTION 'config_existente_ok' USING ERRCODE = 'HLX40';
  EXCEPTION
    WHEN SQLSTATE 'HLX40' THEN NULL;
  END;

  -- Sem linha: a nova cria-a com o DEFAULT da coluna em ano_min.
  BEGIN
    DELETE FROM public.hr_horas_extra_config c WHERE c.organization_id = k_nike;
    PERFORM public.rpc_hr_horas_extra_config_guardar(
      p_organization_id => k_nike, p_dia_min => 100, p_alerta_pct => 70, p_minimo_min => 20);
    IF NOT EXISTS (SELECT 1 FROM public.hr_horas_extra_config c
                    WHERE c.organization_id = k_nike AND c.dia_min = 100 AND c.alerta_pct = 70
                      AND c.minimo_min = 20 AND c.ano_min::text = v_def_ano) THEN
      RAISE EXCEPTION 'Conferir: sem linha, a nova config_guardar devia cria-la com ano_min = DEFAULT da coluna (%).', v_def_ano;
    END IF;
    RAISE EXCEPTION 'config_nova_ok' USING ERRCODE = 'HLX41';
  EXCEPTION
    WHEN SQLSTATE 'HLX41' THEN NULL;
  END;
  PERFORM set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '{}', true);
  IF (SELECT to_jsonb(c) FROM public.hr_horas_extra_config c WHERE c.organization_id = k_nike)
     IS DISTINCT FROM v_cfg_antes THEN
    RAISE EXCEPTION 'Conferir: a prova de C deixou a configuracao de horas extra da nike diferente.';
  END IF;

  -- ---- E Campos da admissao ------------------------------------------------
  -- Corpo novo = corpo esperado menos a linha; atributos e privilegios iguais.
  FOR v_r IN
    SELECT l.fn, l.linha, e.corpo, a.prosecdef, a.provolatile, a.proparallel, a.proconfig, a.proacl
      FROM tmp_lx_linha l JOIN tmp_lx_esperado e ON e.fn = l.fn JOIN tmp_lx_adm a ON a.fn = l.fn
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_proc p
       WHERE p.oid = to_regprocedure(v_r.fn)::oid
         AND replace(p.prosrc, chr(13), '') = replace(replace(v_r.corpo, chr(13), ''), v_r.linha || chr(10), '')
         AND p.prosecdef = v_r.prosecdef
         AND p.provolatile::text = v_r.provolatile
         AND p.proparallel::text = v_r.proparallel
         AND coalesce(array_to_string(p.proconfig, ','), '') = v_r.proconfig
         AND coalesce(p.proacl::text, '') = v_r.proacl) THEN
      RAISE EXCEPTION 'Conferir: % nao ficou igual ao corpo lido menos a linha de subsidio_alimentacao (ou mudou atributos/privilegios).', v_r.fn;
    END IF;
  END LOOP;

  -- Resultados: depois = antes menos as linhas de subsidio_alimentacao (as
  -- duas listas e a lista da nike com a posicao).
  IF EXISTS (SELECT 1 FROM tmp_lx_adm_depois d WHERE d.linha ->> 'codigo' = 'subsidio_alimentacao') THEN
    RAISE EXCEPTION 'Conferir: subsidio_alimentacao continua nas listas da admissao.';
  END IF;
  SELECT count(*) INTO v_n FROM tmp_lx_adm_antes a WHERE a.linha ->> 'codigo' = 'subsidio_alimentacao';
  SELECT count(*) INTO v_m
    FROM ((SELECT a.fn, a.linha FROM tmp_lx_adm_antes a WHERE a.linha ->> 'codigo' <> 'subsidio_alimentacao'
           EXCEPT ALL
           SELECT d.fn, d.linha FROM tmp_lx_adm_depois d)
          UNION ALL
          (SELECT d.fn, d.linha FROM tmp_lx_adm_depois d
           EXCEPT ALL
           SELECT a.fn, a.linha FROM tmp_lx_adm_antes a WHERE a.linha ->> 'codigo' <> 'subsidio_alimentacao')) dif;
  IF v_n <> 3 OR v_m <> 0 THEN
    RAISE EXCEPTION 'Conferir: esperava-se tirar 3 linhas de subsidio_alimentacao (campos, permissao, nike) e mais nada; tiraram-se % e % outras mudaram.', v_n, v_m;
  END IF;

  -- Pendencias da nike iguais (o filtro de hr_admissao_pendencias ja o excluia).
  SELECT count(*) INTO v_m
    FROM ((SELECT a.pessoa_id, a.codigo, a.origem, a.posicao FROM tmp_lx_pend_antes a
           EXCEPT ALL
           SELECT d.pessoa_id, d.codigo, d.origem, d.posicao FROM tmp_lx_pend_depois d)
          UNION ALL
          (SELECT d.pessoa_id, d.codigo, d.origem, d.posicao FROM tmp_lx_pend_depois d
           EXCEPT ALL
           SELECT a.pessoa_id, a.codigo, a.origem, a.posicao FROM tmp_lx_pend_antes a)) dif;
  IF v_m <> 0 THEN
    RAISE EXCEPTION 'Conferir: % pendencia(s) da nike mudaram; deviam ficar iguais.', v_m;
  END IF;
  SELECT count(*) INTO v_n FROM tmp_lx_pend_antes;
  IF v_n = 0 THEN
    RAISE NOTICE 'Conferir E: a nike nao tem pendencias de admissao; a comparacao antes/depois nao exercitou hr_admissao_pendencias.';
  END IF;

  RAISE NOTICE 'Conferido: arquivo com % linha(s) (igual a origem; arquivar outra vez acrescenta 0; UPDATE, DELETE e TRUNCATE recusados); definir_pessoal e config_guardar novas com os privilegios das antigas, sem ambiguidade de chaves, provadas na nike com as antigas intactas; documento com o subsidio da regra (ramos: %); campos de admissao sem subsidio_alimentacao, pendencias da nike iguais (% antes).',
    v_arq_n, v_ramos, v_n;
END;
$conferir$;

-- ==============================================================================
-- ANTES DO db push
--
-- 1. "supabase migration list --linked" imediatamente antes, a partir do
--    worktree rh-pessoas (project-ref uetjghdkwbywbftedtth): so este ficheiro
--    pendente, com carimbo acima do maximo do remoto.
-- 2. Prova na nike ANTES do push: este ficheiro inteiro numa transaccao
--    terminada por um RAISE EXCEPTION (desfaz tudo, incluindo o arquivo). O
--    G2 confirma os quatro corpos do remoto; o conferir prova A a E.
-- 3. vitest antes do push: os testes que leem a ULTIMA definicao de
--    hr_admissao_campos_obrigatorios / _campo_permissao nas migrations passam
--    a ler esta (sem subsidio_alimentacao).
-- 4. O cliente pode continuar com as antigas; passar a usar as novas e uma
--    mudanca separada (tirar p_subsidio e p_ano_min dos pedidos).
-- ==============================================================================

COMMIT;
