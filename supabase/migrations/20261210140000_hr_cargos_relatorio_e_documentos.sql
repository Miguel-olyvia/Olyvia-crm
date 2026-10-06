-- ==============================================================================
-- Relatorio de divergencias entre a retribuicao em vigor e o salario do cargo, e
-- os documentos a usarem o cargo do catalogo.
--
-- POR APLICAR. Sem dependencia de codigo: nada do que existe hoje muda de
-- comportamento visivel (o relatorio e novo; nos documentos, pessoa_cargo
-- passa a vir do cargo do catalogo e cai para o texto antigo quando a pessoa
-- nao tem cargo hoje).
--
--
-- -- O PROBLEMA ----------------------------------------------------------------
--
-- 1. Com o salario a vir do cargo (20261210100000 a 20261210130000), tem de
--    haver uma forma de CONFIRMAR OS DADOS: nenhuma pessoa com cargo deve ter,
--    hoje, uma retribuicao diferente da do cargo. Deve dar zero linhas.
-- 2. Os documentos (declaracoes, contratos) emitem {{pessoa_cargo}} a partir do
--    texto livre pessoas.cargo, que pode divergir do cargo do catalogo.
--
--
-- -- A REGRA NOVA --------------------------------------------------------------
--
-- 1. hr_cargos_retribuicoes_divergentes(organizacao) -- molde de
--    hr_cargos_salarios_divergentes (20261202070000): gate
--    hr.pessoas.retribuicao.view e registo de acesso sensivel (hr_registar_acesso_sensivel,
--    uma linha por pessoa listada). Devolve, para cada pessoa com cargo hoje cuja
--    versao de retribuicao em vigor hoje difere do salario do cargo hoje, a
--    pessoa, o cargo, a versao e o que se esperava. A consulta vive numa
--    funcao interna (sem EXECUTE para ninguem), para poder ser testada sem
--    sessao. hr_cargos_salarios_divergentes (texto legado) NAO muda.
-- 2. hr_documento_variaveis(uuid, uuid, boolean) e SUBSTITUIDA: copia INTEGRAL
--    do corpo de 20261202020000 (a versao vigente), mudando SO a linha de
--    pessoa_cargo: o nome do cargo do catalogo em vigor hoje
--    (hr_pessoa_cargo_em), com pessoas.cargo (texto) quando a pessoa nao tem
--    cargo hoje. A parte da retribuicao nao se toca. Mesmo SECURITY DEFINER,
--    mesmo search_path, mesmos REVOKE e GRANT (so service_role).
--
--
-- -- O QUE FICA DE FORA --------------------------------------------------------
--
-- - Nenhum dado de RH e alterado. O relatorio so le, mas REGISTA o acesso: cada
--   pessoa que o relatorio lista fica em pessoas_acessos_sensiveis (campo
--   retribuicao, accao revelar), porque lista salarios de pessoas (a funcao
--   publica passa a VOLATILE por isso). Zero linhas, nada registado.
-- - O catalogo de variaveis (hr_documento_variaveis_catalogo) nao muda: o
--   token continua a ser pessoa_cargo.
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- Sem ficheiro de reversao nesta pasta, de proposito. A mao:
--   DROP FUNCTION IF EXISTS public.hr_cargos_retribuicoes_divergentes(uuid);
--   DROP FUNCTION IF EXISTS public.hr_cargos_retribuicoes_divergentes_dados(uuid);
--   e repor hr_documento_variaveis(uuid, uuid, boolean) com o corpo de
--   20261202020000.
--
--
-- Prerequisitos:
--   20261210100000  hr_cargo_salario_em
--   20261210110000  hr_pessoa_cargo_em
--   20261202020000  hr_documento_variaveis (versao vigente)
-- ==============================================================================

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
BEGIN
  IF to_regprocedure('public.hr_cargo_salario_em(uuid,date)') IS NULL THEN
    RAISE EXCEPTION 'hr_cargo_salario_em nao existe. Aplicar 20261210100000 primeiro.';
  END IF;

  IF to_regprocedure('public.hr_pessoa_cargo_em(uuid,date)') IS NULL THEN
    RAISE EXCEPTION 'hr_pessoa_cargo_em nao existe. Aplicar 20261210110000 primeiro.';
  END IF;

  IF to_regprocedure('public.hr_documento_variaveis(uuid,uuid,boolean)') IS NULL THEN
    RAISE EXCEPTION 'hr_documento_variaveis(uuid,uuid,boolean) nao existe. Aplicar 20261202020000 primeiro.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.anew_permissions WHERE code = 'hr.pessoas.retribuicao.view') THEN
    RAISE EXCEPTION 'hr.pessoas.retribuicao.view nao esta no catalogo.';
  END IF;

  IF to_regprocedure('public.hr_registar_acesso_sensivel(uuid,uuid,text,text)') IS NULL THEN
    RAISE EXCEPTION 'hr_registar_acesso_sensivel(uuid,uuid,text,text) nao existe. Aplicar 20261120040000 primeiro.';
  END IF;
END;
$guardas$;

-- ==============================================================================
-- 1. Relatorio de divergencias
-- ==============================================================================

-- A consulta, INTERNA (sem EXECUTE para ninguem). Exclusiva (valido_ate) como
-- no resto do fluxo: a versao em vigor hoje e a que comecou e ainda nao
-- terminou. Pessoas sem cargo hoje nao entram (nada com que comparar).
CREATE OR REPLACE FUNCTION public.hr_cargos_retribuicoes_divergentes_dados(p_organization_id uuid)
RETURNS TABLE (
  pessoa_id             uuid,
  pessoa_nome           text,
  cargo_id              uuid,
  cargo_nome            text,
  retribuicao_id        uuid,
  valor_base            numeric,
  periodicidade         text,
  valido_de             date,
  esperado_valor_base   numeric,
  esperado_periodicidade text
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT p.id, p.nome_completo, c.id, c.nome, r.id,
         r.valor_base, r.periodicidade, r.valido_de,
         s.salario_base, s.periodicidade
    FROM public.pessoas p
    JOIN public.pessoas_retribuicoes r
      ON r.pessoa_id = p.id
     AND r.organization_id = p.organization_id
     AND r.deleted_at IS NULL
     AND r.valido_de <= current_date
     AND (r.valido_ate IS NULL OR r.valido_ate > current_date)
    CROSS JOIN LATERAL (SELECT public.hr_pessoa_cargo_em(p.id, current_date) AS cargo_id) pc
    JOIN public.hr_cargos c
      ON c.id = pc.cargo_id
     AND c.organization_id = p.organization_id
    CROSS JOIN LATERAL public.hr_cargo_salario_em(c.id, current_date) s
   WHERE p.organization_id = p_organization_id
     AND p.deleted_at IS NULL
     AND (r.valor_base IS DISTINCT FROM s.salario_base
          OR r.periodicidade IS DISTINCT FROM s.periodicidade)
   ORDER BY p.nome_completo, r.valido_de
$$;

REVOKE ALL ON FUNCTION public.hr_cargos_retribuicoes_divergentes_dados(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_cargos_retribuicoes_divergentes_dados(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.hr_cargos_retribuicoes_divergentes_dados(uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.hr_cargos_retribuicoes_divergentes_dados(uuid) FROM service_role;

COMMENT ON FUNCTION public.hr_cargos_retribuicoes_divergentes_dados(uuid) IS
'INTERNA, sem gate (ninguem tem EXECUTE; so a funcao publica hr_cargos_retribuicoes_divergentes a chama, depois do gate). Pessoas com cargo hoje cuja versao de retribuicao em vigor hoje difere do salario do cargo hoje (valor ou periodicidade).';

-- A funcao publica, com gate.
CREATE OR REPLACE FUNCTION public.hr_cargos_retribuicoes_divergentes(p_organization_id uuid)
RETURNS TABLE (
  pessoa_id             uuid,
  pessoa_nome           text,
  cargo_id              uuid,
  cargo_nome            text,
  retribuicao_id        uuid,
  valor_base            numeric,
  periodicidade         text,
  valido_de             date,
  esperado_valor_base   numeric,
  esperado_periodicidade text
)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
#variable_conflict use_column
DECLARE
  v_pessoa uuid;
BEGIN
  IF NOT public.has_anew_permission_in_org(auth.uid(), 'hr.pessoas.retribuicao.view', p_organization_id) THEN
    RAISE EXCEPTION 'insufficient_privilege: ver as divergencias de retribuicao exige hr.pessoas.retribuicao.view.'
      USING ERRCODE = '42501';
  END IF;

  -- Lista salarios de pessoas: regista o acesso, uma linha por pessoa listada.
  FOR v_pessoa IN
    SELECT DISTINCT d.pessoa_id
      FROM public.hr_cargos_retribuicoes_divergentes_dados(p_organization_id) d
  LOOP
    PERFORM public.hr_registar_acesso_sensivel(v_pessoa, p_organization_id, 'retribuicao', 'revelar');
  END LOOP;

  RETURN QUERY
  SELECT d.pessoa_id, d.pessoa_nome, d.cargo_id, d.cargo_nome, d.retribuicao_id,
         d.valor_base, d.periodicidade, d.valido_de,
         d.esperado_valor_base, d.esperado_periodicidade
    FROM public.hr_cargos_retribuicoes_divergentes_dados(p_organization_id) d;
END;
$$;

REVOKE ALL ON FUNCTION public.hr_cargos_retribuicoes_divergentes(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_cargos_retribuicoes_divergentes(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.hr_cargos_retribuicoes_divergentes(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hr_cargos_retribuicoes_divergentes(uuid) TO service_role;

COMMENT ON FUNCTION public.hr_cargos_retribuicoes_divergentes(uuid) IS
'Diagnostico de leitura, nao altera dados de RH: pessoas com cargo hoje cuja versao de retribuicao em vigor hoje difere do salario do cargo hoje (valor ou periodicidade), com o que se esperava. Deve dar ZERO linhas -- serve para confirmar os dados depois de adoptar o cargo como fonte do salario. Exige hr.pessoas.retribuicao.view na organizacao pedida (42501 sem ela). Cada pessoa listada fica registada em pessoas_acessos_sensiveis (retribuicao, revelar) por hr_registar_acesso_sensivel. hr_cargos_salarios_divergentes (texto legado) nao muda.';

-- ==============================================================================
-- 2. hr_documento_variaveis: copia integral de 20261202020000, mudando so a
--    linha de pessoa_cargo.
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.hr_documento_variaveis(
  p_pessoa_id uuid,
  p_organization_id uuid,
  p_incluir_retribuicao boolean
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_pessoa       public.pessoas%ROWTYPE;
  v_dados        public.pessoas_dados_pessoais%ROWTYPE;
  v_ident        public.pessoas_identificacao%ROWTYPE;
  v_morada       public.pessoas_moradas%ROWTYPE;
  v_vinculo      public.pessoas_vinculos%ROWTYPE;
  v_retribuicao  public.pessoas_retribuicoes%ROWTYPE;
  v_empresa_org  uuid;
  v_empresa_nome text;
  v_local_nome   text;
  v_mapa         jsonb := '{}'::jsonb;
BEGIN
  SELECT * INTO v_pessoa FROM public.pessoas p
   WHERE p.id = p_pessoa_id AND p.organization_id = p_organization_id AND p.deleted_at IS NULL;

  IF v_pessoa.id IS NULL THEN
    RAISE EXCEPTION 'Pessoa % nao encontrada na organizacao %.', p_pessoa_id, p_organization_id;
  END IF;

  SELECT * INTO v_dados FROM public.pessoas_dados_pessoais WHERE pessoa_id = p_pessoa_id;
  SELECT * INTO v_ident FROM public.pessoas_identificacao WHERE pessoa_id = p_pessoa_id;

  SELECT * INTO v_morada FROM public.pessoas_moradas
   WHERE pessoa_id = p_pessoa_id
   ORDER BY is_principal DESC, (tipo = 'residencia') DESC, created_at ASC
   LIMIT 1;

  SELECT * INTO v_vinculo FROM public.pessoas_vinculos
   WHERE pessoa_id = p_pessoa_id AND organization_id = p_organization_id
     AND estado = 'activo' AND deleted_at IS NULL
   ORDER BY data_inicio DESC
   LIMIT 1;

  v_empresa_org := coalesce(v_pessoa.entidade_legal_org_id, p_organization_id);
  SELECT name INTO v_empresa_nome FROM public.anew_organizations WHERE id = v_empresa_org;

  -- pessoa_local_trabalho: mesma regra do LEITOR documentada em
  -- 20261120170000 -- local_id (hr_locais_trabalho.nome) primeiro, e so cai
  -- para o texto legado pessoas.local_trabalho quando local_id for nulo.
  -- Sem isto, uma ficha nova (local escolhido no selector, local_trabalho
  -- nunca preenchido) emitia o token em branco em silencio.
  v_local_nome := NULL;
  IF v_pessoa.local_id IS NOT NULL THEN
    SELECT hlt.nome INTO v_local_nome
      FROM public.hr_locais_trabalho hlt
     WHERE hlt.id = v_pessoa.local_id
       AND hlt.organization_id = p_organization_id
       AND hlt.deleted_at IS NULL;
  END IF;

  v_mapa := jsonb_build_object(
    'pessoa_nome_completo',     v_pessoa.nome_completo,
    'pessoa_primeiro_nome',     v_pessoa.primeiro_nome,
    'pessoa_apelido',           v_pessoa.apelido,
    'pessoa_numero_interno',    v_pessoa.numero_interno,
    'pessoa_cargo',             COALESCE((SELECT hc.nome FROM public.hr_cargos hc WHERE hc.id = public.hr_pessoa_cargo_em(p_pessoa_id, current_date) AND hc.organization_id = p_organization_id), v_pessoa.cargo),
    'pessoa_local_trabalho',    coalesce(v_local_nome, v_pessoa.local_trabalho),
    'pessoa_email_trabalho',    v_pessoa.email_trabalho,
    'pessoa_telefone_trabalho', v_pessoa.telefone_trabalho,
    'pessoa_data_admissao',     to_char(v_pessoa.data_admissao, 'DD/MM/YYYY'),
    'pessoa_data_antiguidade',  to_char(v_pessoa.data_antiguidade, 'DD/MM/YYYY'),
    'pessoa_data_nascimento',   to_char(v_dados.data_nascimento, 'DD/MM/YYYY'),
    'pessoa_nacionalidade',     v_dados.nacionalidade,
    'pessoa_estado_civil',      CASE v_dados.estado_civil
      WHEN 'solteiro' THEN 'Solteiro(a)'
      WHEN 'casado' THEN 'Casado(a)'
      WHEN 'uniao_de_facto' THEN 'Uniao de facto'
      WHEN 'divorciado' THEN 'Divorciado(a)'
      WHEN 'viuvo' THEN 'Viuvo(a)'
      WHEN 'separado' THEN 'Separado(a)'
      ELSE NULL
    END,
    'pessoa_nif',                v_ident.nif,
    'pessoa_tipo_documento',     CASE v_ident.tipo_documento
      WHEN 'cartao_cidadao' THEN 'Cartao de Cidadao'
      WHEN 'passaporte' THEN 'Passaporte'
      WHEN 'titulo_residencia' THEN 'Titulo de Residencia'
      WHEN 'outro' THEN 'Outro'
      ELSE NULL
    END,
    'pessoa_numero_documento',   v_ident.numero_documento,
    'pessoa_validade_documento', to_char(v_ident.validade_documento, 'DD/MM/YYYY'),
    'pessoa_niss_ultimos4',      v_ident.niss_ultimos4,
    'pessoa_morada',             btrim(concat_ws(', ', v_morada.linha1, v_morada.linha2)),
    'pessoa_codigo_postal',      v_morada.codigo_postal,
    'pessoa_localidade',         v_morada.localidade,
    'vinculo_tipo_contrato',     CASE v_vinculo.tipo_contrato
      WHEN 'sem_termo' THEN 'Sem termo'
      WHEN 'termo_certo' THEN 'A termo certo'
      WHEN 'termo_incerto' THEN 'A termo incerto'
      WHEN 'estagio' THEN 'Estagio'
      WHEN 'prestacao_servicos' THEN 'Prestacao de servicos'
      WHEN 'temporario' THEN 'Temporario'
      ELSE NULL
    END,
    'vinculo_regime',            CASE v_vinculo.regime
      WHEN 'tempo_inteiro' THEN 'Tempo inteiro'
      WHEN 'tempo_parcial' THEN 'Tempo parcial'
      ELSE NULL
    END,
    'vinculo_data_inicio',       to_char(v_vinculo.data_inicio, 'DD/MM/YYYY'),
    'vinculo_data_fim',          to_char(v_vinculo.data_fim, 'DD/MM/YYYY'),
    'vinculo_motivo_termo',      v_vinculo.motivo_termo,
    'vinculo_periodo_experimental_ate', to_char(v_vinculo.periodo_experimental_ate, 'DD/MM/YYYY'),
    'vinculo_horas_semanais',    v_vinculo.horas_semanais_equivalentes::text,
    'empresa_nome',              v_empresa_nome
  );

  IF p_incluir_retribuicao THEN
    SELECT * INTO v_retribuicao FROM public.pessoas_retribuicoes
     WHERE pessoa_id = p_pessoa_id AND organization_id = p_organization_id
       AND deleted_at IS NULL
       AND valido_de <= current_date
       AND (valido_ate IS NULL OR valido_ate >= current_date)
     ORDER BY valido_de DESC
     LIMIT 1;

    IF v_retribuicao.id IS NULL THEN
      RAISE EXCEPTION
        'O modelo usa uma variavel de retribuicao e a pessoa % nao tem retribuicao em vigor hoje. A emissao aborta -- nunca se emite um contrato com o salario em branco.',
        p_pessoa_id;
    END IF;

    PERFORM public.hr_registar_acesso_sensivel(p_pessoa_id, p_organization_id, 'retribuicao', 'revelar');

    v_mapa := v_mapa || jsonb_build_object(
      'retribuicao_valor_base',    v_retribuicao.valor_base::text,
      'retribuicao_periodicidade', CASE v_retribuicao.periodicidade
        WHEN 'mensal' THEN 'Mensal'
        WHEN 'anual' THEN 'Anual'
        WHEN 'hora' THEN 'Por hora'
        ELSE NULL
      END,
      'retribuicao_moeda',                       v_retribuicao.moeda,
      'retribuicao_subsidio_alimentacao',        v_retribuicao.subsidio_alimentacao::text,
      'retribuicao_subsidio_alimentacao_modo',   CASE v_retribuicao.subsidio_alimentacao_modo
        WHEN 'dinheiro' THEN 'Dinheiro'
        WHEN 'cartao' THEN 'Cartao'
        ELSE NULL
      END
    );
  END IF;

  RETURN v_mapa;
END;
$$;

REVOKE ALL ON FUNCTION public.hr_documento_variaveis(uuid, uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_documento_variaveis(uuid, uuid, boolean) FROM anon;
REVOKE ALL ON FUNCTION public.hr_documento_variaveis(uuid, uuid, boolean) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.hr_documento_variaveis(uuid, uuid, boolean) TO service_role;

COMMENT ON FUNCTION public.hr_documento_variaveis(uuid, uuid, boolean) IS
'Resolve o mapa token->valor de UMA pessoa (nao inclui os tokens documento_* -- esses sao do modelo/momento de emissao, resolvidos dentro de rpc_hr_documento_emitir). SECURITY DEFINER: le vinculo, morada, identificacao e (quando p_incluir_retribuicao) retribuicao, ignorando RLS -- so e chamada de dentro de rpc_hr_documento_emitir, nunca directamente por authenticated. Quando p_incluir_retribuicao e verdadeiro e nao ha retribuicao em vigor hoje, ABORTA com excepcao. Audita SEMPRE a leitura de retribuicao em pessoas_acessos_sensiveis antes de a devolver. pessoa_local_trabalho le pessoas.local_id (hr_locais_trabalho.nome) primeiro e so cai para o texto legado pessoas.local_trabalho quando local_id for nulo (mesma regra do LEITOR de 20261120170000). pessoa_cargo le o nome do cargo do catalogo em vigor hoje (hr_pessoa_cargo_em) e so cai para o texto legado pessoas.cargo quando a pessoa nao tem cargo hoje (desde 20261210140000).';

-- ==============================================================================
-- Conferir. Estrutura + teste fabricado (organizacao, cargo e pessoas proprios)
-- dentro de um bloco aninhado que TERMINA sempre em HR900.
-- ==============================================================================
DO $conferir$
DECLARE
  v_def    text;
  v_secdef boolean;
  v_conf   text;
  v_vol    "char";
  v_def_pub text;
BEGIN
  -- 0. A funcao publica regista o acesso: VOLATILE e chama hr_registar_acesso_sensivel.
  SELECT p.provolatile, pg_get_functiondef(p.oid) INTO v_vol, v_def_pub
    FROM pg_proc p
   WHERE p.oid = to_regprocedure('public.hr_cargos_retribuicoes_divergentes(uuid)');
  IF v_vol IS DISTINCT FROM 'v' OR position('hr_registar_acesso_sensivel' IN coalesce(v_def_pub, '')) = 0 THEN
    RAISE EXCEPTION 'hr_cargos_retribuicoes_divergentes devia ser VOLATILE e chamar hr_registar_acesso_sensivel.';
  END IF;

  -- 1. Privilegios
  IF has_function_privilege('anon', 'public.hr_cargos_retribuicoes_divergentes(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'hr_cargos_retribuicoes_divergentes nao devia ser executavel por anon.';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.hr_cargos_retribuicoes_divergentes(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'hr_cargos_retribuicoes_divergentes devia ser executavel por authenticated.';
  END IF;
  IF has_function_privilege('anon', 'public.hr_cargos_retribuicoes_divergentes_dados(uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.hr_cargos_retribuicoes_divergentes_dados(uuid)', 'EXECUTE')
     OR has_function_privilege('service_role', 'public.hr_cargos_retribuicoes_divergentes_dados(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'hr_cargos_retribuicoes_divergentes_dados e interna: ninguem alem do dono devia poder executa-la.';
  END IF;

  -- 2. hr_documento_variaveis: continua definer, mesmo search_path, mesmos
  --    privilegios (so service_role), e usa hr_pessoa_cargo_em.
  SELECT p.prosecdef, array_to_string(p.proconfig, ','), pg_get_functiondef(p.oid)
    INTO v_secdef, v_conf, v_def
    FROM pg_proc p
   WHERE p.oid = to_regprocedure('public.hr_documento_variaveis(uuid,uuid,boolean)');

  IF v_secdef IS NOT TRUE THEN
    RAISE EXCEPTION 'hr_documento_variaveis deixou de ser SECURITY DEFINER.';
  END IF;
  IF position('search_path' IN coalesce(v_conf, '')) = 0
     OR position('pg_temp' IN coalesce(v_conf, '')) = 0 THEN
    RAISE EXCEPTION 'hr_documento_variaveis perdeu o search_path fixo (public, pg_temp): %.', coalesce(v_conf, '(nenhum)');
  END IF;
  IF position('hr_pessoa_cargo_em' IN v_def) = 0 THEN
    RAISE EXCEPTION 'O corpo de hr_documento_variaveis nao usa hr_pessoa_cargo_em.';
  END IF;
  IF has_function_privilege('anon', 'public.hr_documento_variaveis(uuid,uuid,boolean)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.hr_documento_variaveis(uuid,uuid,boolean)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.hr_documento_variaveis(uuid,uuid,boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION 'hr_documento_variaveis devia ser executavel so por service_role.';
  END IF;

  -- 3. Teste fabricado
  DECLARE
    v_org     uuid;
    v_cargo   uuid;
    v_ana     uuid;
    v_bruno   uuid;
    v_futura  uuid;
    v_hoje    date := current_date;
    v_n       integer;
    v_mapa    jsonb;
    v_linha   record;
    v_msg     text;
  BEGIN
    INSERT INTO public.anew_organizations (name)
    VALUES ('Teste migracao 20261210140000 (descartavel)')
    RETURNING id INTO v_org;

    INSERT INTO public.hr_cargos (organization_id, nome, salario_base, periodicidade)
    VALUES (v_org, 'Cargo do catalogo 20261210140000', 1000, 'mensal') RETURNING id INTO v_cargo;

    INSERT INTO public.pessoas (organization_id, primeiro_nome, apelido, cargo_id, data_admissao, cargo)
    VALUES (v_org, 'Ana', 'Teste 20261210140000', v_cargo, v_hoje - 60, 'Texto antigo da Ana') RETURNING id INTO v_ana;
    INSERT INTO public.pessoas (organization_id, primeiro_nome, apelido, cargo_id, data_admissao)
    VALUES (v_org, 'Bruno', 'Teste 20261210140000', v_cargo, v_hoje - 60) RETURNING id INTO v_bruno;
    -- Admissao futura: hoje ainda nao tem cargo (hr_pessoa_cargo_em e estrito).
    INSERT INTO public.pessoas (organization_id, primeiro_nome, apelido, cargo_id, data_admissao, cargo)
    VALUES (v_org, 'Futura', 'Teste 20261210140000', v_cargo, v_hoje + 10, 'Texto legado') RETURNING id INTO v_futura;

    INSERT INTO public.pessoas_retribuicoes
      (pessoa_id, organization_id, valor_base, moeda, periodicidade, valido_de, valido_ate, motivo)
    VALUES
      (v_ana,   v_org, 1000, 'EUR', 'mensal', v_hoje - 60, NULL, 'teste'),
      (v_bruno, v_org, 1000, 'EUR', 'mensal', v_hoje - 60, NULL, 'teste');

    -- Caso normal: nenhuma divergencia.
    SELECT count(*) INTO v_n FROM public.hr_cargos_retribuicoes_divergentes_dados(v_org);
    IF v_n <> 0 THEN
      RAISE EXCEPTION 'O relatorio devia dar 0 linhas no caso normal e deu %.', v_n USING ERRCODE = 'HR901';
    END IF;

    -- Documentos: o cargo do catalogo, e o texto legado so quando nao ha cargo hoje.
    v_mapa := public.hr_documento_variaveis(v_ana, v_org, false);
    IF v_mapa ->> 'pessoa_cargo' IS DISTINCT FROM 'Cargo do catalogo 20261210140000' THEN
      RAISE EXCEPTION 'pessoa_cargo devia ser o nome do cargo do catalogo, e %.', coalesce(v_mapa ->> 'pessoa_cargo', '(nulo)')
        USING ERRCODE = 'HR902';
    END IF;
    v_mapa := public.hr_documento_variaveis(v_futura, v_org, false);
    IF v_mapa ->> 'pessoa_cargo' IS DISTINCT FROM 'Texto legado' THEN
      RAISE EXCEPTION 'Sem cargo hoje, pessoa_cargo devia cair para o texto legado, e %.', coalesce(v_mapa ->> 'pessoa_cargo', '(nulo)')
        USING ERRCODE = 'HR903';
    END IF;

    -- Estrutura do retorno: com uma divergencia fabricada (o periodo do cargo
    -- passa a 1200 por baixo das versoes de 1000) o relatorio devolve as duas
    -- pessoas com o que se esperava.
    UPDATE public.hr_cargos_periodos SET salario_base = 1200 WHERE cargo_id = v_cargo;

    SELECT count(*) INTO v_n FROM public.hr_cargos_retribuicoes_divergentes_dados(v_org);
    IF v_n <> 2 THEN
      RAISE EXCEPTION 'O relatorio devia dar 2 linhas com o cargo a 1200 e deu %.', v_n USING ERRCODE = 'HR904';
    END IF;

    SELECT * INTO v_linha
      FROM public.hr_cargos_retribuicoes_divergentes_dados(v_org)
     ORDER BY pessoa_nome
     LIMIT 1;
    IF v_linha.pessoa_id IS DISTINCT FROM v_ana
       OR v_linha.cargo_id IS DISTINCT FROM v_cargo
       OR v_linha.cargo_nome IS DISTINCT FROM 'Cargo do catalogo 20261210140000'
       OR v_linha.valor_base IS DISTINCT FROM 1000::numeric
       OR v_linha.periodicidade IS DISTINCT FROM 'mensal'
       OR v_linha.valido_de IS DISTINCT FROM v_hoje - 60
       OR v_linha.esperado_valor_base IS DISTINCT FROM 1200::numeric
       OR v_linha.esperado_periodicidade IS DISTINCT FROM 'mensal'
       OR v_linha.retribuicao_id IS NULL
       OR v_linha.pessoa_nome IS NULL THEN
      RAISE EXCEPTION 'A estrutura do relatorio nao bate com o esperado para a Ana: valor %, esperado %.',
        v_linha.valor_base, v_linha.esperado_valor_base
        USING ERRCODE = 'HR905';
    END IF;

    -- Com uma sessao de utilizador FABRICADA (request.jwt.claim.sub = um uuid
    -- qualquer, sem papeis), a funcao publica recusa (42501) e nao regista nada.
    PERFORM set_config('request.jwt.claim.sub', x.u::text, true),
                  set_config('request.jwt.claims', json_build_object('sub', x.u, 'role', 'authenticated')::text, true)
      FROM (SELECT gen_random_uuid() AS u) x;
    v_msg := NULL;
    BEGIN
      PERFORM * FROM public.hr_cargos_retribuicoes_divergentes(v_org);
    EXCEPTION
      WHEN SQLSTATE '42501' THEN v_msg := SQLERRM;
    END;
    IF v_msg IS NULL THEN
      RAISE EXCEPTION 'hr_cargos_retribuicoes_divergentes devia recusar (42501) quem nao tem hr.pessoas.retribuicao.view.' USING ERRCODE = 'HR906';
    END IF;
    SELECT count(*) INTO v_n FROM public.pessoas_acessos_sensiveis
     WHERE organization_id = v_org AND accao = 'revelar';
    IF v_n <> 0 THEN
      RAISE EXCEPTION 'Um acesso recusado nao devia ficar registado como revelacao (ficaram % linhas).', v_n USING ERRCODE = 'HR907';
    END IF;
    PERFORM set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '{}', true);

    RAISE EXCEPTION 'teste_cargos_relatorio_e_documentos_20261210140000_ok' USING ERRCODE = 'HR900';
  EXCEPTION
    WHEN SQLSTATE 'HR900' THEN
      NULL; -- sucesso: tudo o que o teste criou e desfeito pela subtransaccao
    WHEN OTHERS THEN
      RAISE EXCEPTION
        'Um dos testes ao vivo desta migration (relatorio e documentos) falhou -- SQLSTATE %: %',
        SQLSTATE, SQLERRM;
  END;

  RAISE NOTICE
    'OK: relatorio de divergencias criado (0 linhas no caso normal, estrutura do retorno confirmada, so authenticated e service_role), hr_documento_variaveis continua definer com o mesmo search_path e so service_role, e pessoa_cargo vem do cargo do catalogo (texto legado so sem cargo hoje).';
END;
$conferir$;

-- ==============================================================================
-- ANTES DO db push
--
-- 1. "supabase migration list --linked" imediatamente antes: so podem estar
--    pendentes os cinco ficheiros do fluxo 2.
-- 2. Depois do push, na nike (so leitura, organization_id da nike explicito, como
--    utilizador real): hr_cargos_retribuicoes_divergentes devolve zero linhas.
-- 3. Sem dependencia de codigo (o relatorio passa a registar o acesso a cada
--    pessoa que lista). hr_documento_variaveis foi comparada linha a
--    linha com 20261202020000 (so pessoa_cargo e o COMMENT mudam).
-- ==============================================================================
