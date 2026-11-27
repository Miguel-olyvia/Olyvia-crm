-- ==============================================================================
-- 20270130300000_ativos_termos.sql
--
-- ATIVOS, fase 1, passo F1.4: termo de ENTREGA e de DEVOLUÇÃO de um ativo, gerado nos
-- documentos do RH (modelo do tipo «recibo») e assinado pelo colaborador no portal do RH
-- (OTP + SMS, o que já existe). Substitui as declarações em Word.
-- Desenho fechado: vault/ficheiros/ativos/ativos-plano-fase1-nike.md (secção 2, F1.4) e a
-- versão simples aprovada pelo dono (ativos-plano-fase1-nike-v2.md, passo 4).
-- Não há tabelas, colunas nem CHECKs novas: só funções. Ligação termo <-> entrega pelo
-- título (decisão D11 do plano). ESTA MIGRATION NÃO ENVIA NADA: não chama o envio para o
-- portal nem manda SMS ou emails; só cria o documento «a aguardar assinatura».
--
-- SÓ PARA A BASE DE RH (uetjghdkwbywbftedtth). NUNCA a principal (tzbfgw...).
--
-- O QUE O ECRÃ TEM DE FAZER (no mesmo envio):
--  * src/hooks/ativos/useTermoAtivo.ts e rh-exemplo/custo/TermoEquipamentoDialog.tsx: chamar
--    rpc_ativos_termo_emitir(p_organization_id, p_pessoa_equipamento_id, p_momento
--    ('entrega' | 'devolucao'), p_modelo_id) e ler {documento_id, pessoa_id, titulo, estado};
--    depois, se o utilizador escolher enviar, rpc_hr_portal_documento_enviar(documento_id,
--    NULL, true) (é o envio que já existe; o SMS é real).
--  * rh-exemplo/custo/CustoEquipamentos.tsx: ação «Termo de entrega/devolução» só a quem tem
--    hr.pessoas.documentos.emitir; «devolução» só em linhas já devolvidas.
--  * O catálogo de variáveis ganha o grupo «ativo» (8 tokens): acrescentar os MESMOS tokens a
--    src/components/rh-exemplo/lib/variaveisDocumentoRH.ts E src/utils/hr/variaveisDocumentoRH.ts
--    e ao snapshot TOKENS_CATALOGO_SQL de src/utils/hr/__tests__/variaveisDocumentoRH.test.ts
--    (paridade com hr_documento_variaveis_catalogo). Tokens: ativo_codigo, ativo_nome,
--    ativo_tipo, ativo_num_serie, ativo_entrega_data, ativo_devolucao_data,
--    ativo_devolucao_estado, termo_momento.
--  * Erros: 42501 sem hr.pessoas.documentos.emitir; ATV36 momento inválido, linha de outra
--    organização ou sem ativo, pessoa apagada, ou devolução de uma linha ainda não devolvida;
--    ATV37 modelo inválido (outra organização, apagado, inativo, tipo diferente de recibo, sem
--    corpo, ou com variáveis de retribuição). Traduzir ATV36 e ATV37 em
--    components/ativos/lib/errosAtivo.ts e ativos.erro.ATV36/ATV37 em src/translations/ativos.ts.
--
-- ORDEM DE APLICAÇÃO
--  1. Testes de texto (src/components/ativos/ativosTermosMigration.test.ts).
--  2. Confirmar supabase/.temp/project-ref = uetjghdkwbywbftedtth e correr
--     `supabase migration list --linked` IMEDIATAMENTE antes (o push aplica tudo o que
--     estiver pendente).
--  3. Independente de 20270130100000 e de 20270130200000.
--
-- O QUE FAZ
--  0. Guardas: base certa, nome novo livre, hr_documento_variaveis_catalogo como foi lida a
--     27/11 (md5 do corpo), funções de que depende, tokens novos ainda fora do catálogo,
--     permissão no catálogo, ATV36 e ATV37 livres.
--  1. hr_documento_variaveis_catalogo: MESMA assinatura e o mesmo search_path; acrescenta o
--     grupo «ativo» no fim (os 37 tokens de hoje ficam iguais e pela mesma ordem).
--  2. rpc_ativos_termo_emitir: permissão ANTES de ler; valida momento, linha e modelo; monta as
--     variáveis da pessoa (hr_documento_variaveis, SEM retribuição) + as do ativo + as do
--     documento; substitui (hr_documento_substituir_variaveis) e insere em pessoas_documentos
--     como rpc_hr_documento_emitir (estado a_aguardar_assinatura), com título «modelo · código».
--     Os textos livres do ativo (código, nome, número de série) e a variável documento_titulo
--     vão escapados para HTML (& < > " ' e as chavetas { }); a coluna titulo fica em texto simples.
--  3. Direitos: a rpc só para authenticated (o catálogo mantém os direitos de hoje).
--  4. Conferir o estado final.
--
-- ERROS NOVOS (RAISE 'ATVnn' USING ERRCODE = 'P0001'):
--   ATV36 termo com momento ou linha inválidos   ATV37 termo com modelo inválido
--
-- COMO SE REVERTE: sem ficheiro de reversão nesta pasta, de propósito.
-- ==============================================================================

BEGIN;
SET LOCAL lock_timeout = '5s';

-- ---- 0. Guardas (tudo do catálogo com ::text) ----------------------------------------
DO $guardas$
DECLARE
  v_n integer;
BEGIN
  -- G1 Esta é a base de RH (a nike existe aqui) e quem aplica passa a RLS.
  IF NOT EXISTS (SELECT 1 FROM public.anew_organizations o WHERE o.id = 'b6ffce4f-f630-4933-833a-008649757a33') THEN
    RAISE EXCEPTION 'G1: a organização nike não existe nesta base. É a base certa?';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles r WHERE r.rolname::text = current_user::text AND (r.rolsuper OR r.rolbypassrls)) THEN
    RAISE EXCEPTION 'G1: o papel que aplica (%) não tem BYPASSRLS.', current_user::text;
  END IF;

  -- G2 O nome novo está livre.
  SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname::text = 'public' AND p.proname::text = 'rpc_ativos_termo_emitir';
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'G2: já existe rpc_ativos_termo_emitir. Investigar.';
  END IF;

  -- G3 hr_documento_variaveis_catalogo: uma só sobrecarga, a assinatura e o corpo lidos a 27/11.
  SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname::text = 'public' AND p.proname::text = 'hr_documento_variaveis_catalogo';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'G3: hr_documento_variaveis_catalogo tem % sobrecarga(s) (esperada 1).', v_n;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
                  WHERE ns.nspname::text = 'public' AND p.proname::text = 'hr_documento_variaveis_catalogo'
                    AND pg_get_function_identity_arguments(p.oid)::text = ''
                    AND md5(p.prosrc::text) = '1ffd5bfab294386eb22d660a5f241573') THEN
    RAISE EXCEPTION 'G3: hr_documento_variaveis_catalogo não tem a assinatura ou o corpo lidos a 27/11. Ler a versão mais recente antes de aplicar.';
  END IF;
  SELECT count(*) INTO v_n FROM public.hr_documento_variaveis_catalogo() c
   WHERE c.token LIKE 'ativo\_%' OR c.token = 'termo_momento';
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'G3: o catálogo já tem % token(s) do grupo ativo. Investigar.', v_n;
  END IF;

  -- G4 Dependências e permissão.
  IF to_regprocedure('public.hr_documento_variaveis(uuid, uuid, boolean)') IS NULL
     OR to_regprocedure('public.hr_documento_substituir_variaveis(text, jsonb)') IS NULL
     OR to_regprocedure('public.has_anew_permission_in_org(uuid, text, uuid)') IS NULL THEN
    RAISE EXCEPTION 'G4: falta hr_documento_variaveis, hr_documento_substituir_variaveis ou has_anew_permission_in_org.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.anew_permissions p WHERE p.code = 'hr.pessoas.documentos.emitir') THEN
    RAISE EXCEPTION 'G4: falta a permissão hr.pessoas.documentos.emitir no catálogo.';
  END IF;

  -- G5 Códigos de erro novos ainda livres.
  SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname::text = 'public' AND p.prosrc ~ 'ATV3[67]';
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'G5: há % função(ões) que já usam ATV36 ou ATV37. Escolher outros.', v_n;
  END IF;
END;
$guardas$;

-- ==============================================================================
-- 1. Catálogo de variáveis: + grupo «ativo» (mesma assinatura e search_path de hoje)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.hr_documento_variaveis_catalogo()
RETURNS TABLE(token text, rotulo text, grupo text)
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT * FROM (VALUES
    ('pessoa_nome_completo',      'Nome completo',              'pessoa'),
    ('pessoa_primeiro_nome',      'Primeiro nome',              'pessoa'),
    ('pessoa_apelido',            'Apelido',                    'pessoa'),
    ('pessoa_numero_interno',     'Numero interno',             'pessoa'),
    ('pessoa_cargo',              'Cargo',                       'pessoa'),
    ('pessoa_local_trabalho',     'Local de trabalho',          'pessoa'),
    ('pessoa_email_trabalho',     'Email de trabalho',          'pessoa'),
    ('pessoa_telefone_trabalho',  'Telefone de trabalho',       'pessoa'),
    ('pessoa_data_admissao',      'Data de admissao',           'pessoa'),
    ('pessoa_data_antiguidade',   'Data de antiguidade',        'pessoa'),
    ('pessoa_data_nascimento',    'Data de nascimento',         'pessoa'),
    ('pessoa_nacionalidade',      'Nacionalidade (ISO)',        'pessoa'),
    ('pessoa_estado_civil',       'Estado civil',               'pessoa'),
    ('pessoa_nif',                'NIF',                         'identificacao'),
    ('pessoa_tipo_documento',     'Tipo de documento',          'identificacao'),
    ('pessoa_numero_documento',   'Numero do documento',        'identificacao'),
    ('pessoa_validade_documento', 'Validade do documento',      'identificacao'),
    ('pessoa_niss_ultimos4',      'NISS (ultimos 4 digitos)',   'identificacao'),
    ('pessoa_morada',             'Morada',                      'morada'),
    ('pessoa_codigo_postal',      'Codigo postal',               'morada'),
    ('pessoa_localidade',         'Localidade',                  'morada'),
    ('vinculo_tipo_contrato',     'Tipo de contrato',           'vinculo'),
    ('vinculo_regime',            'Regime (tempo inteiro/parcial)', 'vinculo'),
    ('vinculo_data_inicio',       'Data de inicio do vinculo',  'vinculo'),
    ('vinculo_data_fim',          'Data de fim do vinculo',     'vinculo'),
    ('vinculo_motivo_termo',      'Motivo de termo',            'vinculo'),
    ('vinculo_periodo_experimental_ate', 'Periodo experimental ate', 'vinculo'),
    ('vinculo_horas_semanais',    'Horas semanais equivalentes', 'vinculo'),
    ('retribuicao_valor_base',    'Retribuicao base',           'retribuicao'),
    ('retribuicao_periodicidade', 'Periodicidade da retribuicao', 'retribuicao'),
    ('retribuicao_moeda',         'Moeda',                       'retribuicao'),
    ('retribuicao_subsidio_alimentacao', 'Subsidio de alimentacao', 'retribuicao'),
    ('retribuicao_subsidio_alimentacao_modo', 'Modo do subsidio de alimentacao', 'retribuicao'),
    ('empresa_nome',              'Nome da empresa',            'empresa'),
    ('documento_titulo',          'Titulo do documento',        'documento'),
    ('documento_tipo',            'Tipo de documento',          'documento'),
    ('documento_data_emissao',    'Data de emissao',            'documento'),
    ('ativo_codigo',              'Codigo do ativo',            'ativo'),
    ('ativo_nome',                'Nome do ativo',              'ativo'),
    ('ativo_tipo',                'Tipo de ativo',              'ativo'),
    ('ativo_num_serie',           'Numero de serie',            'ativo'),
    ('ativo_entrega_data',        'Data de entrega',            'ativo'),
    ('ativo_devolucao_data',      'Data de devolucao',          'ativo'),
    ('ativo_devolucao_estado',    'Estado na devolucao',        'ativo'),
    ('termo_momento',             'Momento do termo (entrega ou devolucao)', 'ativo')
  ) AS t(token, rotulo, grupo);
$$;

-- ==============================================================================
-- 2. RPC: emitir o termo de entrega ou de devolução de um ativo
-- ==============================================================================
CREATE FUNCTION public.rpc_ativos_termo_emitir(
  p_organization_id uuid,
  p_pessoa_equipamento_id uuid,
  p_momento text,
  p_modelo_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_emissor   uuid;
  v_linha     record;
  v_modelo    public.pessoas_documentos_modelos%ROWTYPE;
  v_variaveis jsonb;
  v_corpo     text;
  v_titulo    text;
  v_doc       uuid;
BEGIN
  -- 1) permissão ANTES de ler dados
  IF v_uid IS NULL OR p_organization_id IS NULL
     OR NOT coalesce(public.has_anew_permission_in_org(v_uid, 'hr.pessoas.documentos.emitir', p_organization_id), false) THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501', DETAIL = 'Não tem permissão para emitir documentos do RH nesta organização.';
  END IF;

  -- 2) momento e linha (da mesma organização, com ativo, pessoa viva)
  IF p_momento IS NULL OR p_momento NOT IN ('entrega', 'devolucao') THEN
    RAISE EXCEPTION 'ATV36' USING ERRCODE = 'P0001', DETAIL = 'O momento do termo tem de ser entrega ou devolução.';
  END IF;
  SELECT pe.id, pe.pessoa_id, pe.estado, pe.entrega, pe.devolucao, pe.estado_devolucao,
         a.codigo, a.nome, a.grupo, a.tipo, a.num_serie
    INTO v_linha
    FROM public.pessoas_equipamentos pe
    JOIN public.ativo a ON a.id = pe.ativo_id AND a.organization_id = pe.organization_id
    JOIN public.pessoas p ON p.id = pe.pessoa_id AND p.organization_id = pe.organization_id AND p.deleted_at IS NULL
   WHERE pe.id = p_pessoa_equipamento_id AND pe.organization_id = p_organization_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ATV36' USING ERRCODE = 'P0001', DETAIL = 'A entrega não existe nesta organização, não tem ativo, ou a pessoa foi apagada.';
  END IF;
  IF p_momento = 'devolucao' AND (v_linha.estado <> 'devolvido' OR v_linha.devolucao IS NULL) THEN
    RAISE EXCEPTION 'ATV36' USING ERRCODE = 'P0001', DETAIL = 'Registe primeiro a devolução para emitir o termo de devolução.';
  END IF;

  -- 3) modelo: desta organização, vivo, ativo, do tipo recibo, com corpo e sem retribuição
  SELECT m.* INTO v_modelo
    FROM public.pessoas_documentos_modelos m
   WHERE m.id = p_modelo_id AND m.organization_id = p_organization_id AND m.deleted_at IS NULL;
  IF v_modelo.id IS NULL OR NOT v_modelo.activo OR v_modelo.tipo <> 'recibo'
     OR v_modelo.corpo_html IS NULL OR btrim(v_modelo.corpo_html) = ''
     OR v_modelo.corpo_html ~* '\{\{\s*retribuicao_' THEN
    RAISE EXCEPTION 'ATV37' USING ERRCODE = 'P0001', DETAIL = 'Escolha um modelo ativo do tipo recibo, desta organização e sem variáveis de retribuição.';
  END IF;

  SELECT au.id INTO v_emissor FROM public.anew_users au
   WHERE au.auth_user_id = v_uid AND au.deleted_at IS NULL LIMIT 1;

  -- 4) variáveis: pessoa (sem retribuição) + ativo + documento; os textos livres escapados
  --    para HTML (& < > " ') e as chavetas também (&#123; &#125;), para um código, nome ou número
  --    de série não poder trazer um {{token}} que a substituição expandisse. O título vai em texto
  --    simples na coluna titulo e ESCAPADO na variável documento_titulo (entra no corpo HTML).
  --    Sem código, o título usa o nome do ativo (titulo é NOT NULL).
  v_titulo := v_modelo.nome || ' · ' || coalesce(v_linha.codigo, v_linha.nome);
  v_variaveis := public.hr_documento_variaveis(v_linha.pessoa_id, p_organization_id, false)
    || jsonb_build_object(
      'ativo_codigo', replace(replace(replace(replace(replace(replace(replace(v_linha.codigo, '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;'), '''', '&#39;'), '{', '&#123;'), '}', '&#125;'),
      'ativo_nome', replace(replace(replace(replace(replace(replace(replace(v_linha.nome, '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;'), '''', '&#39;'), '{', '&#123;'), '}', '&#125;'),
      'ativo_tipo', CASE
          WHEN v_linha.grupo = 'servico' THEN 'Equipamento de serviço'
          ELSE CASE v_linha.tipo
            WHEN 'telemovel' THEN 'Telemóvel' WHEN 'portatil' THEN 'Portátil' WHEN 'viatura' THEN 'Viatura'
            WHEN 'fardamento' THEN 'Fardamento' WHEN 'ferramentas' THEN 'Ferramentas'
            WHEN 'instalacoes' THEN 'Instalações' WHEN 'mobiliario' THEN 'Mobiliário'
            WHEN 'eletronica' THEN 'Eletrónica' ELSE 'Outro' END
        END,
      'ativo_num_serie', replace(replace(replace(replace(replace(replace(replace(v_linha.num_serie, '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;'), '''', '&#39;'), '{', '&#123;'), '}', '&#125;'),
      'ativo_entrega_data', to_char(v_linha.entrega, 'DD/MM/YYYY'),
      'ativo_devolucao_data', to_char(v_linha.devolucao, 'DD/MM/YYYY'),
      'ativo_devolucao_estado', CASE v_linha.estado_devolucao
          WHEN 'bom' THEN 'Bom estado' WHEN 'desgaste' THEN 'Com desgaste' WHEN 'danificado' THEN 'Danificado'
          ELSE NULL END,
      'termo_momento', CASE p_momento WHEN 'entrega' THEN 'Entrega' ELSE 'Devolução' END,
      'documento_titulo', replace(replace(replace(replace(replace(replace(replace(v_titulo, '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;'), '''', '&#39;'), '{', '&#123;'), '}', '&#125;'),
      'documento_tipo', v_modelo.tipo,
      'documento_data_emissao', to_char(now() AT TIME ZONE 'Europe/Lisbon', 'DD/MM/YYYY'));
  v_corpo := public.hr_documento_substituir_variaveis(v_modelo.corpo_html, v_variaveis);

  -- 5) documento a aguardar assinatura (como rpc_hr_documento_emitir); nada é enviado aqui
  INSERT INTO public.pessoas_documentos (
    pessoa_id, organization_id, modelo_id,
    tipo, titulo, corpo_html,
    estado, emitido_em, emitido_por,
    created_by, updated_by
  ) VALUES (
    v_linha.pessoa_id, p_organization_id, v_modelo.id,
    v_modelo.tipo, v_titulo, v_corpo,
    'a_aguardar_assinatura', now(), v_emissor,
    v_emissor, v_emissor
  )
  RETURNING id INTO v_doc;

  RETURN jsonb_build_object(
    'documento_id', v_doc,
    'pessoa_id', v_linha.pessoa_id,
    'titulo', v_titulo,
    'estado', 'a_aguardar_assinatura');
END;
$$;

-- ==============================================================================
-- 3. Direitos: a rpc só para authenticated
-- ==============================================================================
REVOKE ALL ON FUNCTION public.rpc_ativos_termo_emitir(uuid, uuid, text, uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_ativos_termo_emitir(uuid, uuid, text, uuid) TO authenticated;

COMMENT ON FUNCTION public.rpc_ativos_termo_emitir(uuid, uuid, text, uuid) IS
  'Emite o termo de entrega ou de devolução de um ativo (hr.pessoas.documentos.emitir). Não envia: o envio é rpc_hr_portal_documento_enviar. ATV36 momento/linha; ATV37 modelo.';

-- ==============================================================================
-- 4. Conferir o estado final (catálogo lido com ::text)
-- ==============================================================================
DO $conferir$
DECLARE
  v_n integer;
BEGIN
  -- C1 A rpc existe, SECURITY DEFINER e search_path vazio.
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
                  WHERE ns.nspname::text = 'public' AND p.proname::text = 'rpc_ativos_termo_emitir'
                    AND pg_get_function_identity_arguments(p.oid)::text = 'p_organization_id uuid, p_pessoa_equipamento_id uuid, p_momento text, p_modelo_id uuid'
                    AND p.prosecdef
                    AND array_to_string(p.proconfig, ',')::text = 'search_path=""') THEN
    RAISE EXCEPTION 'C1: rpc_ativos_termo_emitir não ficou como devia.';
  END IF;

  -- C2 Direitos: anon sem nada; authenticated na rpc e no catálogo (como hoje).
  IF has_function_privilege('anon', 'public.rpc_ativos_termo_emitir(uuid, uuid, text, uuid)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.rpc_ativos_termo_emitir(uuid, uuid, text, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'C2: direitos errados em rpc_ativos_termo_emitir.';
  END IF;
  IF has_function_privilege('anon', 'public.hr_documento_variaveis_catalogo()', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.hr_documento_variaveis_catalogo()', 'EXECUTE') THEN
    RAISE EXCEPTION 'C2: os direitos de hr_documento_variaveis_catalogo mudaram.';
  END IF;

  -- C3 O catálogo tem os 37 tokens de hoje mais os 8 do ativo, sem repetidos.
  SELECT count(*) INTO v_n FROM public.hr_documento_variaveis_catalogo();
  IF v_n <> 45 THEN
    RAISE EXCEPTION 'C3: o catálogo tem % tokens (esperados 45).', v_n;
  END IF;
  SELECT count(DISTINCT c.token) INTO v_n FROM public.hr_documento_variaveis_catalogo() c;
  IF v_n <> 45 THEN
    RAISE EXCEPTION 'C3: o catálogo tem tokens repetidos.';
  END IF;
  SELECT count(*) INTO v_n FROM public.hr_documento_variaveis_catalogo() c WHERE c.grupo = 'ativo';
  IF v_n <> 8 THEN
    RAISE EXCEPTION 'C3: o grupo ativo tem % tokens (esperados 8).', v_n;
  END IF;
END;
$conferir$;

COMMIT;
