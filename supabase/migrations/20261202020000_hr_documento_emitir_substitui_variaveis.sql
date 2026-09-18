-- ==============================================================================
-- Substituicao de variaveis {{token}} DENTRO de rpc_hr_documento_emitir.
--
-- POR APLICAR.
--
--
-- -- O FACTO QUE DECIDE TUDO ----------------------------------------------------
--
-- pessoas_documentos.corpo_html NAO TEM PRIVILEGIO NENHUM para authenticated
-- (nem SELECT nem INSERT/UPDATE -- guarda de 20261123030000). Logo a
-- substituicao real SO PODE correr no servidor, dentro da RPC que grava o
-- corpo. O cliente nunca escreve um corpo ja substituido nem o le depois; o
-- lado do cliente serve so para pre-visualizar com dados de exemplo
-- (src/utils/hr/variaveisDocumentoRH.ts), nunca para a emissao real.
--
--
-- -- ESTA MIGRACAO ALTERA UMA FUNCAO EXISTENTE E TEM DE ENTRAR JUNTA -----------
--
-- rpc_hr_documento_emitir(uuid, uuid[]) e substituida NO LUGAR -- mesma
-- assinatura, para o PostgREST nunca ter duas versoes a escolher entre si (a
-- mesma ambiguidade que ja parou o botao de resolver submissoes neste
-- repositorio). O codigo do editor (ConfiguracaoModelosDocumentos.tsx,
-- SelectorClausulasRH.tsx, variaveisDocumentoRH.ts) entra NA MESMA leva desta
-- migracao -- aplicar so a migracao sem o codigo nao parte nada de imediato
-- (o corpo antigo sem tokens continua a emitir-se sem eles), mas aplicar so o
-- codigo sem a migracao gravava {{token}} cru em todos os documentos novos.
--
--
-- -- VARIAVEIS: TOKEN PLANO {{prefixo_campo}}, SEM PONTO ------------------------
--
-- Uma so classe de caracteres ([a-z0-9_]) para o regex de extraccao em TS e
-- para o replace em plpgsql. hr_documento_variaveis_catalogo() e a fonte
-- CANONICA (usada pelo teste de paridade em variaveisDocumentoRH.test.ts) --
-- so os tokens aqui listados sao resolvidos; qualquer {{...}} que sobreviva a
-- substituicao (token desconhecido, ou pessoa sem o dado) fica
-- "____________" -- nunca {{token}} cru num documento emitido.
--
-- A CONVENCAO E TOLERANTE A ESPACOS E MAIUSCULAS EM AMBOS OS LADOS: o TS
-- (extrairTokensRH/substituirVariaveisRH, PADRAO_TOKEN =
-- /\{\{\s*([a-z0-9_]+)\s*\}\}/gi) ja aceitava "{{ pessoa_nome_completo }}" e
-- "{{PESSOA_NOME_COMPLETO}}" na pre-visualizacao; hr_documento_substituir_variaveis
-- tem agora de aceitar exactamente o MESMO -- senao um token escrito assim
-- fica verde no editor e sai cru (nao substituido, nao mascarado) no
-- documento real emitido pela RPC.
--
-- pessoa_local_trabalho: passa a ler pessoas.local_id primeiro (FK para
-- hr_locais_trabalho, 20261120170000) e so cair para o texto legado
-- pessoas.local_trabalho quando local_id for nulo -- o mesmo fallback que o
-- cabecalho dessa migracao documenta para o resto do modulo.
--
--
-- -- RETRIBUICAO: GATE + AUDITORIA, ABORTA SE VAZIA -----------------------------
--
-- rpc_hr_documento_emitir e SECURITY DEFINER e por isso le retribuicao mesmo
-- que quem emite nao tivesse SELECT directo. Por isso, se o corpo do modelo
-- usa QUALQUER {{retribuicao_*}}, esta migracao EXIGE hr.pessoas.retribuicao.view
-- na organizacao ANTES de resolver esses tokens, e regista em
-- pessoas_acessos_sensiveis (campo='retribuicao', accao='revelar') por cada
-- pessoa cuja retribuicao foi lida -- sem isto, emitir um modelo com
-- retribuicao seria a porta lateral para ler salarios sem auditoria. Uma
-- retribuicao em vigor sem valor (pessoa sem pessoas_retribuicoes valida a
-- hoje) ABORTA a emissao para essa pessoa com erro claro -- nunca se emite em
-- silencio um contrato com o salario em branco.
--
--
-- -- NISS: DE FORA nesta ronda ---------------------------------------------------
--
-- So {{pessoa_niss_ultimos4}} (coluna gerada, ja mascarada). Resolver o NISS
-- em claro obrigaria a replicar a verificacao de rpc_hr_revelar_niss e a
-- auditar por pessoa do lote -- fica para ronda propria, registado como
-- lacuna assumida, nao esquecimento.
--
--
-- -- ESCOLHA DE VINCULO E RETRIBUICAO --------------------------------------------
--
-- Vinculo: o de estado='activo' mais recente (data_inicio desc) da pessoa. Se
-- nao houver nenhum, os tokens {{vinculo_*}} ficam "____________" -- um
-- vinculo em falta nao e motivo para abortar a emissao de OUTROS documentos
-- (uma declaracao pode nao precisar de vinculo nenhum).
-- Retribuicao: a de valido_de<=hoje e valido_ate NULL ou futuro, mais recente
-- por valido_de. Esta SIM aborta se o corpo pedir retribuicao e nao houver
-- nenhuma -- ver acima.
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- Sem ficheiro de reversao nesta pasta, de proposito. A mao:
--   DROP FUNCTION IF EXISTS public.hr_documento_variaveis(uuid, uuid);
--   DROP FUNCTION IF EXISTS public.hr_documento_variaveis_catalogo();
--   DROP FUNCTION IF EXISTS public.hr_documento_substituir_variaveis(text, jsonb);
-- E depois reaplicar o corpo de rpc_hr_documento_emitir de 20261123030000
-- (copia byte-a-byte, sem substituicao).
--
--
-- Prerequisitos:
--   20261120040000  hr_registar_acesso_sensivel(uuid,uuid,text,text), pessoas_acessos_sensiveis aceita campo='retribuicao'
--   20261120060000  pessoas_vinculos, pessoas_retribuicoes
--   20261120170000  pessoas.local_id (FK para hr_locais_trabalho) -- fallback de pessoa_local_trabalho
--   20261123030000  rpc_hr_documento_emitir(uuid, uuid[])
--   20261202010000  pessoas_documentos_clausulas (nao referenciada por FK aqui, so contextual)
-- ==============================================================================

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'rpc_hr_documento_emitir' AND p.pronargs = 2
  ) THEN
    RAISE EXCEPTION 'public.rpc_hr_documento_emitir(uuid, uuid[]) nao existe. Aplicar 20261123030000 primeiro.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'hr_registar_acesso_sensivel' AND p.pronargs = 4
  ) THEN
    RAISE EXCEPTION 'public.hr_registar_acesso_sensivel(uuid,uuid,text,text) nao existe.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conrelid = 'public.pessoas_acessos_sensiveis'::regclass
       AND c.conname = 'pessoas_acessos_sensiveis_campo_valido'
       AND pg_get_constraintdef(c.oid) LIKE '%retribuicao%'
  ) THEN
    RAISE EXCEPTION 'pessoas_acessos_sensiveis nao aceita campo=retribuicao. Aplicar 20261120040000/20261120220000 primeiro.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.anew_permissions WHERE code = 'hr.pessoas.retribuicao.view') THEN
    RAISE EXCEPTION 'hr.pessoas.retribuicao.view nao esta no catalogo. Aplicar 20261120060000 primeiro.';
  END IF;

  IF to_regclass('public.pessoas_dados_pessoais') IS NULL THEN
    RAISE EXCEPTION 'public.pessoas_dados_pessoais nao existe.';
  END IF;
  IF to_regclass('public.pessoas_identificacao') IS NULL THEN
    RAISE EXCEPTION 'public.pessoas_identificacao nao existe.';
  END IF;
  IF to_regclass('public.pessoas_moradas') IS NULL THEN
    RAISE EXCEPTION 'public.pessoas_moradas nao existe.';
  END IF;
  IF to_regclass('public.pessoas_vinculos') IS NULL THEN
    RAISE EXCEPTION 'public.pessoas_vinculos nao existe.';
  END IF;
  IF to_regclass('public.pessoas_retribuicoes') IS NULL THEN
    RAISE EXCEPTION 'public.pessoas_retribuicoes nao existe.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'pessoas_vinculos' AND column_name = 'horas_semanais_equivalentes'
  ) THEN
    RAISE EXCEPTION 'pessoas_vinculos.horas_semanais_equivalentes nao existe. Aplicar 20261130180000 primeiro.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'pessoas' AND column_name = 'local_id'
  ) THEN
    RAISE EXCEPTION 'pessoas.local_id nao existe. Aplicar 20261120170000 primeiro (fallback de pessoa_local_trabalho depende dela).';
  END IF;

  IF to_regclass('public.hr_locais_trabalho') IS NULL THEN
    RAISE EXCEPTION 'public.hr_locais_trabalho nao existe. Aplicar 20261120130000 primeiro.';
  END IF;
END;
$guardas$;

-- ==============================================================================
-- 1. Catalogo canonico dos tokens -- fonte para o teste de paridade TS/SQL
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.hr_documento_variaveis_catalogo()
RETURNS TABLE (token text, rotulo text, grupo text)
LANGUAGE sql IMMUTABLE
SET search_path TO 'public', 'pg_temp'
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
    ('documento_data_emissao',    'Data de emissao',            'documento')
  ) AS t(token, rotulo, grupo);
$$;

REVOKE ALL ON FUNCTION public.hr_documento_variaveis_catalogo() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_documento_variaveis_catalogo() FROM anon;
GRANT EXECUTE ON FUNCTION public.hr_documento_variaveis_catalogo() TO authenticated;
GRANT EXECUTE ON FUNCTION public.hr_documento_variaveis_catalogo() TO service_role;

COMMENT ON FUNCTION public.hr_documento_variaveis_catalogo() IS
'Lista canonica de tokens {{...}} que a emissao de documentos de RH resolve. Fonte de verdade para o teste de paridade em src/utils/hr/__tests__/variaveisDocumentoRH.test.ts -- o catalogo em TypeScript (para o popover do editor) tem de listar exactamente os mesmos tokens que esta funcao, para que o editor nunca ofereca um token que a emissao nao conhece.';

-- ==============================================================================
-- 2. Resolver o mapa token->valor de UMA pessoa (sem os tokens de documento,
--    que sao do MODELO/momento de emissao, resolvidos dentro da RPC)
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
    'pessoa_cargo',             v_pessoa.cargo,
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
'Resolve o mapa token->valor de UMA pessoa (nao inclui os tokens documento_* -- esses sao do modelo/momento de emissao, resolvidos dentro de rpc_hr_documento_emitir). SECURITY DEFINER: le vinculo, morada, identificacao e (quando p_incluir_retribuicao) retribuicao, ignorando RLS -- so e chamada de dentro de rpc_hr_documento_emitir, nunca directamente por authenticated. Quando p_incluir_retribuicao e verdadeiro e nao ha retribuicao em vigor hoje, ABORTA com excepcao. Audita SEMPRE a leitura de retribuicao em pessoas_acessos_sensiveis antes de a devolver. pessoa_local_trabalho le pessoas.local_id (hr_locais_trabalho.nome) primeiro e so cai para o texto legado pessoas.local_trabalho quando local_id for nulo (mesma regra do LEITOR de 20261120170000).';

-- ==============================================================================
-- 3. Substituir {{token}} no corpo, e apagar qualquer {{...}} que sobre
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.hr_documento_substituir_variaveis(
  p_corpo text,
  p_variaveis jsonb
)
RETURNS text
LANGUAGE plpgsql IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_corpo      text := p_corpo;
  v_match      text[];
  v_ocorrencia text;
  v_chave      text;
  v_valor      text;
BEGIN
  -- MESMA CONVENCAO DO LADO TS (PADRAO_TOKEN em variaveisDocumentoRH.ts):
  -- "{{ token }}" tolera espacos dentro das chavetas e ignora
  -- maiuscula/minuscula do nome do token. Grupo 1 = a ocorrencia exacta
  -- (com as chavetas e os espacos originais, para o replace() literal a
  -- seguir); grupo 2 = o nome do token, normalizado para minusculas antes
  -- de procurar no mapa -- assim "{{PESSOA_NOME_COMPLETO}}" e
  -- "{{ pessoa_nome_completo }}" resolvem para o MESMO valor, tal como na
  -- pre-visualizacao do editor.
  FOR v_match IN
    SELECT regexp_matches(v_corpo, '(\{\{\s*([A-Za-z0-9_]+)\s*\}\})', 'g')
  LOOP
    v_ocorrencia := v_match[1];
    v_chave := lower(v_match[2]);
    v_valor := p_variaveis ->> v_chave;
    v_corpo := replace(v_corpo, v_ocorrencia, coalesce(v_valor, '____________'));
  END LOOP;

  -- Qualquer {{...}} que sobreviva (token desconhecido, ou fora do
  -- catalogo), com ou sem espacos/maiusculas, nunca fica cru num documento
  -- emitido.
  v_corpo := regexp_replace(v_corpo, '\{\{\s*[A-Za-z0-9_]+\s*\}\}', '____________', 'gi');

  RETURN v_corpo;
END;
$$;

REVOKE ALL ON FUNCTION public.hr_documento_substituir_variaveis(text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_documento_substituir_variaveis(text, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.hr_documento_substituir_variaveis(text, jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.hr_documento_substituir_variaveis(text, jsonb) TO service_role;

COMMENT ON FUNCTION public.hr_documento_substituir_variaveis(text, jsonb) IS
'Substitui cada {{chave}} presente em p_variaveis pelo seu valor (ou "____________" se o valor for NULL), tolerando espacos dentro das chavetas e maiusculas/minusculas no nome do token -- MESMA convencao de PADRAO_TOKEN em src/utils/hr/variaveisDocumentoRH.ts. Depois apaga qualquer {{...}} restante (token desconhecido) para "____________" -- nunca se deixa {{token}} cru num documento emitido.';

-- ==============================================================================
-- 4. rpc_hr_documento_emitir -- MESMA ASSINATURA, agora substitui variaveis
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.rpc_hr_documento_emitir(
  p_modelo_id uuid,
  p_pessoa_ids uuid[]
)
RETURNS SETOF uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_modelo        public.pessoas_documentos_modelos%ROWTYPE;
  v_auth          uuid := auth.uid();
  v_emitido_por   uuid;
  v_pessoa_id     uuid;
  v_pessoa_org    uuid;
  v_novo_id       uuid;
  v_usa_retribuicao boolean;
  v_variaveis     jsonb;
  v_corpo         text;
BEGIN
  IF v_auth IS NULL THEN
    RAISE EXCEPTION 'rpc_hr_documento_emitir exige um utilizador autenticado.';
  END IF;

  IF p_pessoa_ids IS NULL OR array_length(p_pessoa_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'p_pessoa_ids nao pode ser vazio.';
  END IF;

  SELECT * INTO v_modelo
    FROM public.pessoas_documentos_modelos
   WHERE id = p_modelo_id AND deleted_at IS NULL;

  IF v_modelo.id IS NULL THEN
    RAISE EXCEPTION 'Modelo % nao encontrado ou apagado.', p_modelo_id;
  END IF;

  IF NOT v_modelo.activo THEN
    RAISE EXCEPTION 'Modelo % esta desactivado.', p_modelo_id;
  END IF;

  IF NOT public.has_anew_permission_in_org(v_auth, 'hr.pessoas.documentos.emitir', v_modelo.organization_id) THEN
    RAISE EXCEPTION 'Sem permissao hr.pessoas.documentos.emitir na organizacao do modelo.';
  END IF;

  -- O corpo usa {{retribuicao_*}}? Se sim, o gate de retribuicao aplica-se a
  -- TODAS as pessoas do lote -- decidido uma vez, aqui, nao pessoa a pessoa.
  v_usa_retribuicao := v_modelo.corpo_html LIKE '%{{retribuicao_%';

  IF v_usa_retribuicao AND NOT public.has_anew_permission_in_org(v_auth, 'hr.pessoas.retribuicao.view', v_modelo.organization_id) THEN
    RAISE EXCEPTION
      'O modelo "%" usa uma variavel de retribuicao; emiti-lo exige hr.pessoas.retribuicao.view nesta organizacao.',
      v_modelo.nome;
  END IF;

  SELECT au.id INTO v_emitido_por FROM public.anew_users au WHERE au.auth_user_id = v_auth LIMIT 1;

  FOREACH v_pessoa_id IN ARRAY p_pessoa_ids
  LOOP
    SELECT p.organization_id INTO v_pessoa_org
      FROM public.pessoas p
     WHERE p.id = v_pessoa_id;

    IF v_pessoa_org IS NULL THEN
      RAISE EXCEPTION 'Pessoa % nao encontrada.', v_pessoa_id;
    END IF;

    IF v_pessoa_org <> v_modelo.organization_id THEN
      RAISE EXCEPTION 'Pessoa % nao pertence a organizacao do modelo (%).', v_pessoa_id, v_modelo.organization_id;
    END IF;

    v_variaveis := public.hr_documento_variaveis(v_pessoa_id, v_modelo.organization_id, v_usa_retribuicao);

    -- Tokens do MODELO e do MOMENTO de emissao, iguais para todo o lote:
    -- documento_data_emissao usa now() -- a data grava-se UMA VEZ, aqui, no
    -- corpo; nunca recalculada depois (o mesmo erro que data_documento em
    -- contractVariables.ts do CRM ja teve de corrigir).
    v_variaveis := v_variaveis || jsonb_build_object(
      'documento_titulo',       v_modelo.nome,
      'documento_tipo',         v_modelo.tipo,
      'documento_data_emissao', to_char(now(), 'DD/MM/YYYY')
    );

    v_corpo := public.hr_documento_substituir_variaveis(v_modelo.corpo_html, v_variaveis);

    INSERT INTO public.pessoas_documentos (
      pessoa_id, organization_id, modelo_id,
      tipo, titulo, corpo_html,
      estado, emitido_em, emitido_por,
      created_by, updated_by
    ) VALUES (
      v_pessoa_id, v_modelo.organization_id, v_modelo.id,
      v_modelo.tipo, v_modelo.nome, v_corpo,
      'a_aguardar_assinatura', now(), v_emitido_por,
      v_emitido_por, v_emitido_por
    )
    RETURNING id INTO v_novo_id;

    RETURN NEXT v_novo_id;
  END LOOP;

  RETURN;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_hr_documento_emitir(uuid, uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_hr_documento_emitir(uuid, uuid[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_hr_documento_emitir(uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_documento_emitir(uuid, uuid[]) TO service_role;

COMMENT ON FUNCTION public.rpc_hr_documento_emitir(uuid, uuid[]) IS
'Emite um documento a uma ou varias pessoas a partir de um modelo, substituindo {{token}} pelo valor real de cada pessoa (hr_documento_variaveis) ANTES de gravar -- corpo_html so tem privilegio de escrita aqui dentro, por isso e o UNICO sitio onde a substituicao real pode correr. Exige hr.pessoas.documentos.emitir; se o corpo usar {{retribuicao_*}}, exige tambem hr.pessoas.retribuicao.view e audita a leitura por pessoa. Um token sem valor grava "____________"; retribuicao sem valor em vigor ABORTA a emissao. Continua a copiar o corpo (nao referenciar): alterar o modelo depois nao muda o documento emitido. Rejeita pessoas de outra organizacao.';

-- ==============================================================================
-- 5. O COMMENT de variaveis passa a descrever tokens detectados, nao nota livre
-- ==============================================================================
COMMENT ON COLUMN public.pessoas_documentos_modelos.variaveis IS
'Lista JSON dos tokens {{...}} DETECTADOS no corpo_html no momento de gravar o modelo (ver extrairTokensRH em src/utils/hr/variaveisDocumentoRH.ts) -- inclui tokens fora do catalogo, marcados na UI. Desde 20261202020000 estes tokens SAO substituidos por rpc_hr_documento_emitir; antes disso era so nota documental sem efeito.';

-- ---- Conferir ---------------------------------------------------------------
DO $conferir$
DECLARE
  v_org_teste  uuid;
  v_n          integer;
BEGIN
  SELECT count(*) INTO v_n
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'rpc_hr_documento_emitir';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'Ha % funcoes public.rpc_hr_documento_emitir; esperava-se exactamente 1 (sem sobrecarga).', v_n;
  END IF;

  IF has_function_privilege('anon', 'public.hr_documento_variaveis(uuid,uuid,boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon tem EXECUTE em hr_documento_variaveis; devia ser so service_role.';
  END IF;
  IF has_function_privilege('authenticated', 'public.hr_documento_variaveis(uuid,uuid,boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated tem EXECUTE directo em hr_documento_variaveis; contornaria o gate de retribuicao da RPC. Devia ser so service_role.';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.hr_documento_variaveis(uuid,uuid,boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION 'service_role perdeu EXECUTE em hr_documento_variaveis.';
  END IF;

  -- Substituicao pura: token conhecido substitui, desconhecido apaga para o
  -- placeholder, valor NULL tambem apaga -- provado sem escrever nada.
  IF public.hr_documento_substituir_variaveis(
       'Ola {{pessoa_nome_completo}}, {{token_desconhecido}}, salario {{retribuicao_valor_base}}.',
       jsonb_build_object('pessoa_nome_completo', 'Ana Ferreira', 'retribuicao_valor_base', NULL)
     ) <> 'Ola Ana Ferreira, ____________, salario ____________.'
  THEN
    RAISE EXCEPTION 'hr_documento_substituir_variaveis nao substituiu como esperado.';
  END IF;

  -- Paridade com o TS: espacos dentro das chavetas e maiusculas no nome do
  -- token tambem resolvem -- a mesma convencao de PADRAO_TOKEN em
  -- variaveisDocumentoRH.ts. Sem isto, um token escrito assim ficava verde
  -- na pre-visualizacao e saia CRU no documento real.
  IF public.hr_documento_substituir_variaveis(
       'Ola {{ Pessoa_Nome_Completo }}, {{TOKEN_DESCONHECIDO}}.',
       jsonb_build_object('pessoa_nome_completo', 'Ana Ferreira')
     ) <> 'Ola Ana Ferreira, ____________.'
  THEN
    RAISE EXCEPTION 'hr_documento_substituir_variaveis nao tolerou espacos/maiusculas no token -- deixa de concordar com o TS (extrairTokensRH/substituirVariaveisRH).';
  END IF;

  -- Catalogo canonico tem de listar pelo menos os grupos esperados, sem
  -- duplicados de token.
  SELECT count(*) INTO v_n FROM public.hr_documento_variaveis_catalogo();
  IF v_n < 30 THEN
    RAISE EXCEPTION 'hr_documento_variaveis_catalogo() devolveu % tokens, esperavam-se pelo menos 30.', v_n;
  END IF;
  IF (SELECT count(DISTINCT token) FROM public.hr_documento_variaveis_catalogo()) <> v_n THEN
    RAISE EXCEPTION 'hr_documento_variaveis_catalogo() tem tokens duplicados.';
  END IF;

  RAISE NOTICE 'Guardas passadas: rpc_hr_documento_emitir unica, hr_documento_variaveis so para service_role, substituicao pura confirmada, catalogo com % tokens sem duplicados.', v_n;
END;
$conferir$;
