-- ==============================================================================
-- Negocio: ligar um campo do formulario online a uma pergunta de fase
-- (Qualificacao). A resposta do formulario passa a pre-preencher a pergunta no
-- negocio, como sugestao. So na base RH (negocio_respostas e
-- form_submissions.negocio_id so existem aqui).
--
-- O CODIGO DO CLIENTE ENTRA JUNTO COM ESTA MIGRATION (mesmo PR, mesmo deploy):
--   src/emylia/sugestoesForm.ts, src/emylia/real/negocioBase.ts (lerNegocios),
--   src/components/forms/PerguntaFaseMapping.tsx + FormBuilder.tsx,
--   src/hooks/pessoas/workflow/useLigacoesFase.ts, src/emylia/CamposEditor.tsx,
--   src/pages/PendingFormSubmissions.tsx + PendingSubmissionFasePreview.tsx.
-- TUDO E ADITIVO e o cliente TOLERA A FALTA de qualquer peca: sem as funcoes
-- (PGRST202/42883) ou com qualquer erro nelas, os negocios abrem como hoje, a
-- pagina de pendentes fica exactamente como esta e o editor de formularios nao
-- mostra o bloco "Pergunta da fase".
--
-- REVISOES (bases de dados e seguranca, duas rondas), corrigido antes do push
--   HIGH-1 A ligacao NAO e uma coluna de form_fields (o anon le form_fields e a
--          politica "Users can view form fields" e USING (true)). Fica numa
--          tabela propria FECHADA, form_field_phase_links: RLS ligada e
--          forcada, sem politicas, sem privilegios para nenhum papel alem do
--          dono; so as funcoes DEFINER a leem e escrevem.
--   HIGH-2 Ambito por negocio em neg_sugestoes_formulario. Regra aplicada (a de
--          quem pode ver o negocio linha a linha), calculada uma vez por chamada:
--            system admin
--            OU papel do RH: organizacao CRM do utilizador E
--               fn_neg_papel_permite(org, 'pessoas.edit')  (= fn_neg_papel_conta,
--               o lado positivo de fn_neg_negocio_so_papel, 20270105700000)
--            OU a politica negocios_select: has_anew_permission(uid,
--               'pessoas.view') E organizacao CRM do utilizador E uma chave de
--               crm_scope_keys('pessoas.view') igual a org:*, org:assigned_to ou
--               org:created_by.
--          Nao se usa can_access_contact_row: resolve o ambito por outro
--          caminho (resolve_contact_access_context, com TEAM) e nao e a regra da
--          politica dos negocios. Nao se exige fn_form_entidade_no_ambito: pede
--          leads.view/clients.view, que quem so trabalha em Pessoas pode nao ter,
--          e bloquearia o negocio legitimo; o que sai e so o campo ligado, dentro
--          de um negocio que o utilizador ve. Negocios fora do ambito (com
--          p_negocios NULL ou ids arbitrarios) sao omitidos, sem erro nem
--          diferenca visivel.
--          NOTA: neg_ler_negocios (20270102210000) NAO filtra por ambito (so
--          pessoas.view na organizacao); esta RPC e mais estrita do que o ecra.
--   M     System admin sem membership. neg_sugestoes_formulario: passa (como em
--          neg_ler_negocios). neg_sugestoes_submissoes: NAO passa, de proposito -
--          fn_form_entidade_no_ambito chama can_access_contact_row, que chama
--          resolve_contact_access_context, que LANCA erro quando a organizacao
--          nao esta em get_user_crm_org_ids; e o mesmo portao de
--          rpc_resolve_form_submission e da RLS de form_submissions. Devolve [].
--   M     Escrever a ligacao exige pessoas.config (quem configura a
--          qualificacao): quem so edita formularios nao encaminha um campo
--          sensivel para os negocios.
--   M     p_mapping SQL NULL ou jsonb 'null' removem a ligacao.
--   M     Custo: os formularios com ligacoes activas calculam-se uma vez; ordem
--          estavel (numero DESC, id); limites 500 / 200 / 5000.
--          statement_timeout NAO se pos na definicao: o temporizador e armado no
--          inicio da instrucao de topo e um SET dentro da funcao nao o rearma
--          (seria um no-op enganador). Vale o limite do papel/PostgREST.
--   M     Conferir: nenhum papel alem do dono tem privilegios na tabela e nas
--          internas; nas RPCs so o dono e authenticated (aclexplode, PUBLIC
--          incluido).
--   M     fn_neg_valor_sugerido marcada STABLE (chama to_jsonb).
--   L     neg_guardar_ligacao_fase le o campo com FOR SHARE. Lacuna aceite: um
--          campo que mude de formulario DEPOIS de ligado fica com a ligacao
--          incoerente (o trigger so confere ao gravar a ligacao).
--   a/b   RPCs so para authenticated; LATERAL do valor com OFFSET 0.
--
-- O QUE MUDA
--   1. Tabela form_field_phase_links: uma ligacao por campo.
--        mapping = {"grupo":"Qualificacao","chave":"imovel",
--                   "valores":{"Cozinha":"Apartamento","Outro":null}}
--      CHECK por fn_neg_mapeamento_fase_valido (IMMUTABLE): so a FORMA.
--      organization_id e form_id conferidos por trigger contra form_fields e
--      forms. Unico (form_id, grupo, chave), tambem para campos inactivos.
--   2. RPCs (DEFINER, search_path vazio, so authenticated):
--        neg_ler_ligacao_fase(p_org, p_form_id)                 STABLE   pessoas.config
--        neg_guardar_ligacao_fase(p_org, p_field_id, p_mapping) VOLATILE pessoas.config
--        neg_ligacoes_fase(p_org)                               STABLE   pessoas.config
--        neg_sugestoes_formulario(p_org, p_negocios)            STABLE   pessoas.view + ambito
--        neg_sugestoes_submissoes(p_org, p_submissoes)          STABLE   pessoas.view + ambito
--   3. Internas (so o dono executa, nao DEFINER):
--        fn_neg_mapeamento_fase_valido(jsonb), fn_neg_valor_sugerido(jsonb),
--        fn_neg_sugestoes_de(uuid, uuid[]), fn_form_field_phase_links_coerente()
--
-- CODIGOS DE ERRO (MESSAGE = codigo, sem texto livre)
--   42501 insufficient_privilege  sem sessao ou sem a permissao (fn_cat_pode)
--   NG009 pedido_invalido         argumentos nulos ou acima dos limites
--   NG009 mapeamento_invalido     p_mapping com forma invalida
--   NG009 campo_indisponivel      o campo nao existe ou nao e de um formulario da org
--   NG009 formulario_indisponivel o formulario nao existe ou nao e da org
--   23505 ligacao_repetida        a pergunta ja esta ligada a outro campo do formulario
--
-- COMO SE REVERTE: sem ficheiro de reversao nesta pasta, de proposito. A mao:
-- largar as 9 funcoes e a tabela (perde as ligacoes).
-- ==============================================================================

SET lock_timeout = '5s';

-- ---- Guardas -----------------------------------------------------------------
DO $guardas$
DECLARE
  v_n integer;
BEGIN
  -- Dependencias: funcoes.
  IF to_regprocedure('public.fn_cat_pode(uuid, text)') IS NULL
     OR to_regprocedure('public.fn_form_entidade_no_ambito(uuid, uuid)') IS NULL
     OR to_regprocedure('public.get_user_crm_org_ids(uuid)') IS NULL
     OR to_regprocedure('public.is_system_admin_user(uuid)') IS NULL
     OR to_regprocedure('public.has_anew_permission(uuid, text)') IS NULL
     OR to_regprocedure('public.crm_scope_keys(text)') IS NULL
     OR to_regprocedure('public.fn_neg_papel_permite(uuid, text)') IS NULL THEN
    RAISE EXCEPTION 'Guarda: falta uma das funcoes de que a migration depende (permissao, ambito ou papel).';
  END IF;

  -- Dependencias: tabelas.
  IF to_regclass('public.forms') IS NULL
     OR to_regclass('public.form_fields') IS NULL
     OR to_regclass('public.form_submissions') IS NULL
     OR to_regclass('public.negocios') IS NULL
     OR to_regclass('public.negocio_respostas') IS NULL
     OR to_regclass('public.anew_organizations') IS NULL
     OR to_regclass('public.anew_users') IS NULL
     OR to_regclass('public.anew_permissions') IS NULL THEN
    RAISE EXCEPTION 'Guarda: falta uma das tabelas de que a migration depende.';
  END IF;

  -- Dependencias: colunas que as funcoes leem.
  SELECT count(*) INTO v_n FROM pg_attribute a
   WHERE a.attrelid = to_regclass('public.form_submissions') AND a.attnum > 0 AND NOT a.attisdropped
     AND a.attname::text IN ('id', 'organization_id', 'entity_id', 'form_id', 'negocio_id',
                             'field_values', 'created_at', 'deleted_at');
  IF v_n <> 8 THEN
    RAISE EXCEPTION 'Guarda: form_submissions nao tem as 8 colunas esperadas (encontradas %).', v_n;
  END IF;
  SELECT count(*) INTO v_n FROM pg_attribute a
   WHERE a.attrelid = to_regclass('public.forms') AND a.attnum > 0 AND NOT a.attisdropped
     AND a.attname::text IN ('id', 'organization_id', 'name');
  IF v_n <> 3 THEN
    RAISE EXCEPTION 'Guarda: forms nao tem id, organization_id e name (encontradas % de 3).', v_n;
  END IF;
  SELECT count(*) INTO v_n FROM pg_attribute a
   WHERE a.attrelid = to_regclass('public.form_fields') AND a.attnum > 0 AND NOT a.attisdropped
     AND a.attname::text IN ('id', 'form_id', 'field_key', 'field_label', 'field_type', 'is_active',
                             'step_number', 'sort_order');
  IF v_n <> 8 THEN
    RAISE EXCEPTION 'Guarda: form_fields nao tem as 8 colunas esperadas (encontradas %).', v_n;
  END IF;
  SELECT count(*) INTO v_n FROM pg_attribute a
   WHERE a.attrelid = to_regclass('public.negocios') AND a.attnum > 0 AND NOT a.attisdropped
     AND a.attname::text IN ('id', 'organization_id', 'deleted_at', 'numero', 'assigned_to', 'created_by');
  IF v_n <> 6 THEN
    RAISE EXCEPTION 'Guarda: negocios nao tem as 6 colunas esperadas (encontradas %).', v_n;
  END IF;
  SELECT count(*) INTO v_n FROM pg_attribute a
   WHERE a.attrelid = to_regclass('public.negocio_respostas') AND a.attnum > 0 AND NOT a.attisdropped
     AND a.attname::text IN ('negocio_id', 'campo_chave', 'divisao');
  IF v_n <> 3 THEN
    RAISE EXCEPTION 'Guarda: negocio_respostas nao tem negocio_id, campo_chave e divisao (encontradas % de 3).', v_n;
  END IF;
  SELECT count(*) INTO v_n FROM pg_attribute a
   WHERE a.attrelid = to_regclass('public.anew_users') AND a.attnum > 0 AND NOT a.attisdropped
     AND a.attname::text IN ('id', 'auth_user_id');
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'Guarda: anew_users nao tem id e auth_user_id (encontradas % de 2).', v_n;
  END IF;

  -- As permissoes reutilizadas existem (nenhuma nova).
  SELECT count(DISTINCT p.code) INTO v_n FROM public.anew_permissions p
   WHERE p.code IN ('pessoas.view', 'pessoas.edit', 'pessoas.config');
  IF v_n <> 3 THEN
    RAISE EXCEPTION 'Guarda: faltam permissoes no catalogo (encontradas % de 3).', v_n;
  END IF;

  -- Nada do que esta migration cria pode ja existir.
  IF to_regclass('public.form_field_phase_links') IS NOT NULL THEN
    RAISE EXCEPTION 'Guarda: a tabela form_field_phase_links ja existe. Investigar.';
  END IF;
  SELECT count(*) INTO v_n
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname::text = 'public'
     AND p.proname::text IN ('neg_sugestoes_formulario', 'neg_sugestoes_submissoes', 'neg_ligacoes_fase',
                             'neg_ler_ligacao_fase', 'neg_guardar_ligacao_fase',
                             'fn_neg_sugestoes_de', 'fn_neg_valor_sugerido', 'fn_neg_mapeamento_fase_valido',
                             'fn_form_field_phase_links_coerente');
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'Guarda: ja existem % funcao(oes) com nomes desta migration. Investigar.', v_n;
  END IF;

  -- O dono das funcoes tem de passar a RLS (a tabela nova fica com FORCE e sem politica).
  IF NOT EXISTS (SELECT 1 FROM pg_roles r WHERE r.rolname::text = current_user::text AND (r.rolsuper OR r.rolbypassrls)) THEN
    RAISE EXCEPTION 'Guarda: o papel que aplica (%) nao tem BYPASSRLS; com FORCE RLS as funcoes nao conseguiriam ler nem escrever.', current_user::text;
  END IF;
END;
$guardas$;

-- ==============================================================================
-- 1. Validador da forma do mapeamento (usado pelo CHECK e por guardar)
-- ==============================================================================
-- plpgsql para garantir a ordem das verificacoes: jsonb_object_keys num valor
-- que nao e objecto rebentaria em vez de devolver false.
CREATE FUNCTION public.fn_neg_mapeamento_fase_valido(p jsonb)
RETURNS boolean
LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE
SET search_path = ''
AS $fn$
DECLARE
  v_val jsonb;
BEGIN
  IF p IS NULL THEN
    RETURN false;
  END IF;
  IF jsonb_typeof(p) <> 'object' OR octet_length(p::text) > 8192 THEN
    RETURN false;
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_object_keys(p) AS k(k) WHERE k.k NOT IN ('grupo', 'chave', 'valores')) THEN
    RETURN false;
  END IF;

  -- grupo: texto 1..80, nao so espacos
  IF coalesce(jsonb_typeof(p -> 'grupo'), '') <> 'string'
     OR char_length(p ->> 'grupo') NOT BETWEEN 1 AND 80
     OR btrim(p ->> 'grupo') = '' THEN
    RETURN false;
  END IF;

  -- chave: k da pergunta (campos de sistema e c_... dos da empresa)
  IF coalesce(jsonb_typeof(p -> 'chave'), '') <> 'string'
     OR (p ->> 'chave') !~ '^[a-z][a-z0-9_]{0,59}$' THEN
    RETURN false;
  END IF;

  -- valores: opcional (ausente ou null); senao objecto ate 60 entradas,
  -- chaves 1..200, valores null ou texto 1..120
  v_val := p -> 'valores';
  IF v_val IS NULL OR jsonb_typeof(v_val) = 'null' THEN
    RETURN true;
  END IF;
  IF jsonb_typeof(v_val) <> 'object' THEN
    RETURN false;
  END IF;
  IF (SELECT count(*) FROM jsonb_object_keys(v_val)) > 60 THEN
    RETURN false;
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_each(v_val) AS e(k, v)
              WHERE char_length(e.k) NOT BETWEEN 1 AND 200
                 OR NOT (jsonb_typeof(e.v) = 'null'
                         OR (jsonb_typeof(e.v) = 'string' AND char_length(e.v #>> '{}') BETWEEN 1 AND 120))) THEN
    RETURN false;
  END IF;
  RETURN true;
END;
$fn$;

-- ==============================================================================
-- 2. Tabela fechada das ligacoes
-- ==============================================================================
CREATE TABLE public.form_field_phase_links (
  field_id        uuid PRIMARY KEY
                  CONSTRAINT form_field_phase_links_field_fkey REFERENCES public.form_fields(id) ON DELETE CASCADE,
  form_id         uuid NOT NULL
                  CONSTRAINT form_field_phase_links_form_fkey REFERENCES public.forms(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL
                  CONSTRAINT form_field_phase_links_org_fkey REFERENCES public.anew_organizations(id) ON DELETE CASCADE,
  mapping         jsonb NOT NULL
                  CONSTRAINT form_field_phase_links_mapping_check CHECK (public.fn_neg_mapeamento_fase_valido(mapping)),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  updated_by      uuid
                  CONSTRAINT form_field_phase_links_updated_by_fkey REFERENCES public.anew_users(id) ON DELETE SET NULL
);

-- Uma pergunta por formulario (vale tambem para campos inactivos: o is_active
-- esta noutra tabela, por isso o indice nao pode ser parcial). O form_id a
-- frente serve as leituras por formulario.
CREATE UNIQUE INDEX form_field_phase_links_pergunta_uk
  ON public.form_field_phase_links (form_id, (mapping ->> 'grupo'), (mapping ->> 'chave'));
CREATE INDEX form_field_phase_links_org_idx
  ON public.form_field_phase_links (organization_id);
CREATE INDEX form_field_phase_links_updated_by_idx
  ON public.form_field_phase_links (updated_by) WHERE updated_by IS NOT NULL;

ALTER TABLE public.form_field_phase_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.form_field_phase_links FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.form_field_phase_links FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON TABLE public.form_field_phase_links IS
'Liga um campo do formulario a uma pergunta de fase do Negocio (mapping {grupo, chave, valores?}). Fechada: RLS forcada sem politicas e sem privilegios para a API; so neg_guardar_ligacao_fase escreve e as RPCs neg_* leem. organization_id e form_id conferidos por trigger. Desde 20270106480000.';
COMMENT ON COLUMN public.form_field_phase_links.mapping IS
'{grupo, chave, valores?}: grupo = titulo estavel do grupo; chave = k da pergunta; valores = rotulo do formulario -> rotulo da pergunta ou null. So a forma e validada (fn_neg_mapeamento_fase_valido).';

-- form_id e organization_id tem de ser os do campo e do formulario.
CREATE FUNCTION public.fn_form_field_phase_links_coerente()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $fn$
DECLARE
  v_form uuid;
  v_org  uuid;
BEGIN
  SELECT ff.form_id, f.organization_id INTO v_form, v_org
    FROM public.form_fields ff
    JOIN public.forms f ON f.id = ff.form_id
   WHERE ff.id = NEW.field_id;
  IF NOT FOUND
     OR NEW.form_id IS DISTINCT FROM v_form
     OR NEW.organization_id IS DISTINCT FROM v_org THEN
    RAISE EXCEPTION 'ligacao_incoerente' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    NEW.created_at := OLD.created_at;
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END;
$fn$;

CREATE TRIGGER trg_form_field_phase_links_coerente
  BEFORE INSERT OR UPDATE ON public.form_field_phase_links
  FOR EACH ROW EXECUTE FUNCTION public.fn_form_field_phase_links_coerente();

-- ==============================================================================
-- 3. Internas
-- ==============================================================================

-- 3.1 O valor bruto da submissao, normalizado: texto nao vazio (ate 2000),
--     numero e booleano como texto, lista de textos nao vazios (ate 100 itens,
--     cada ate 2000); o resto (objecto, null, vazio) da NULL = sem sugestao.
--     STABLE (chama to_jsonb).
CREATE FUNCTION public.fn_neg_valor_sugerido(p jsonb)
RETURNS jsonb
LANGUAGE sql STABLE PARALLEL SAFE
SET search_path = ''
AS $fn$
  SELECT CASE jsonb_typeof(p)
    WHEN 'string' THEN
      CASE WHEN btrim(p #>> '{}') <> '' THEN to_jsonb(left(p #>> '{}', 2000)) END
    WHEN 'number' THEN to_jsonb(p #>> '{}')
    WHEN 'boolean' THEN to_jsonb(p #>> '{}')
    WHEN 'array' THEN (
      SELECT jsonb_agg(to_jsonb(left(e.el #>> '{}', 2000)) ORDER BY e.o)
        FROM jsonb_array_elements(p) WITH ORDINALITY AS e(el, o)
       WHERE e.o <= 100
         AND jsonb_typeof(e.el) IN ('string', 'number', 'boolean')
         AND btrim(e.el #>> '{}') <> '')
  END
$fn$;

-- 3.2 Nucleo: para as submissoes pedidas (da organizacao, nao apagadas, de um
--     formulario da organizacao), os campos activos ligados com valor.
--     NAO verifica permissao nem ambito: so e chamada pelas RPCs, depois de o
--     fazerem e de filtrarem p_subs.
CREATE FUNCTION public.fn_neg_sugestoes_de(p_org uuid, p_subs uuid[])
RETURNS TABLE (submissao_id uuid, grupo text, chave text, tipo_campo text, valor jsonb, valores jsonb)
LANGUAGE sql STABLE
SET search_path = ''
AS $fn$
  SELECT s.id,
         l.mapping ->> 'grupo',
         l.mapping ->> 'chave',
         ff.field_type,
         v.valor,
         CASE WHEN jsonb_typeof(l.mapping -> 'valores') = 'object' THEN l.mapping -> 'valores' END
    FROM public.form_submissions s
    JOIN public.forms f
      ON f.id = s.form_id AND f.organization_id = p_org
    JOIN public.form_field_phase_links l
      ON l.form_id = f.id AND l.organization_id = p_org
    JOIN public.form_fields ff
      ON ff.id = l.field_id AND ff.form_id = f.id AND ff.is_active
    CROSS JOIN LATERAL (
      SELECT public.fn_neg_valor_sugerido(s.field_values -> ff.field_key) AS valor
      OFFSET 0) v
   WHERE s.id = ANY (p_subs)
     AND s.organization_id = p_org
     AND s.deleted_at IS NULL
     AND jsonb_typeof(s.field_values) = 'object'
     AND v.valor IS NOT NULL
$fn$;

-- ==============================================================================
-- 4. RPCs da ligacao (editor de formularios e avisos do editor de campos)
-- ==============================================================================

-- 4.1 As ligacoes de um formulario: [{field_id, mapping}], incluindo as de
--     campos inactivos.
CREATE FUNCTION public.neg_ler_ligacao_fase(p_org uuid, p_form_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  r jsonb;
BEGIN
  IF p_org IS NULL OR p_form_id IS NULL THEN
    RAISE EXCEPTION 'pedido_invalido' USING ERRCODE = 'NG009';
  END IF;
  IF auth.uid() IS NULL OR NOT coalesce(public.fn_cat_pode(p_org, 'pessoas.config'), false) THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.forms f WHERE f.id = p_form_id AND f.organization_id = p_org) THEN
    RAISE EXCEPTION 'formulario_indisponivel' USING ERRCODE = 'NG009';
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object('field_id', l.field_id, 'mapping', l.mapping)
                            ORDER BY l.field_id), '[]'::jsonb)
    INTO r
    FROM public.form_field_phase_links l
   WHERE l.form_id = p_form_id AND l.organization_id = p_org;
  RETURN r;
END;
$fn$;

-- 4.2 Grava ou tira a ligacao de um campo. p_mapping NULL (SQL) ou 'null'
--     (jsonb) tira. Devolve {field_id, mapping, alterada}. A organizacao e o
--     formulario saem do proprio campo (conferidos contra p_org), nunca do
--     cliente.
CREATE FUNCTION public.neg_guardar_ligacao_fase(p_org uuid, p_field_id uuid, p_mapping jsonb)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_uid     uuid := auth.uid();
  v_remover boolean := p_mapping IS NULL OR jsonb_typeof(p_mapping) = 'null';
  v_user    uuid;
  v_form    uuid;
  v_n       integer;
BEGIN
  IF p_org IS NULL OR p_field_id IS NULL THEN
    RAISE EXCEPTION 'pedido_invalido' USING ERRCODE = 'NG009';
  END IF;
  IF v_uid IS NULL OR NOT coalesce(public.fn_cat_pode(p_org, 'pessoas.config'), false) THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
  END IF;
  IF NOT v_remover AND NOT public.fn_neg_mapeamento_fase_valido(p_mapping) THEN
    RAISE EXCEPTION 'mapeamento_invalido' USING ERRCODE = 'NG009';
  END IF;

  SELECT ff.form_id INTO v_form
    FROM public.form_fields ff
    JOIN public.forms f ON f.id = ff.form_id
   WHERE ff.id = p_field_id AND f.organization_id = p_org
   FOR SHARE OF ff;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'campo_indisponivel' USING ERRCODE = 'NG009';
  END IF;

  IF v_remover THEN
    DELETE FROM public.form_field_phase_links l
     WHERE l.field_id = p_field_id AND l.organization_id = p_org;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    RETURN jsonb_build_object('field_id', p_field_id, 'mapping', NULL, 'alterada', v_n > 0);
  END IF;

  SELECT au.id INTO v_user FROM public.anew_users au WHERE au.auth_user_id = v_uid LIMIT 1;

  BEGIN
    INSERT INTO public.form_field_phase_links AS l (field_id, form_id, organization_id, mapping, updated_by)
    VALUES (p_field_id, v_form, p_org, p_mapping, v_user)
    ON CONFLICT (field_id) DO UPDATE
      SET mapping = EXCLUDED.mapping,
          form_id = EXCLUDED.form_id,
          organization_id = EXCLUDED.organization_id,
          updated_by = EXCLUDED.updated_by;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'ligacao_repetida' USING ERRCODE = '23505';
  END;

  RETURN jsonb_build_object('field_id', p_field_id, 'mapping', p_mapping, 'alterada', true);
END;
$fn$;

-- 4.3 As ligacoes da organizacao (avisos do editor de campos das fases), so
--     dos campos activos.
CREATE FUNCTION public.neg_ligacoes_fase(p_org uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  r jsonb;
BEGIN
  IF p_org IS NULL THEN
    RAISE EXCEPTION 'pedido_invalido' USING ERRCODE = 'NG009';
  END IF;
  IF auth.uid() IS NULL OR NOT coalesce(public.fn_cat_pode(p_org, 'pessoas.config'), false) THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'form_id', f.id, 'form_nome', f.name,
           'field_id', ff.id, 'field_label', ff.field_label,
           'grupo', l.mapping ->> 'grupo',
           'chave', l.mapping ->> 'chave',
           'valores', CASE WHEN jsonb_typeof(l.mapping -> 'valores') = 'object' THEN l.mapping -> 'valores' END)
         ORDER BY f.name, f.id, ff.step_number, ff.sort_order, ff.id), '[]'::jsonb)
    INTO r
    FROM public.form_field_phase_links l
    JOIN public.forms f ON f.id = l.form_id AND f.organization_id = p_org
    JOIN public.form_fields ff ON ff.id = l.field_id AND ff.form_id = f.id AND ff.is_active
   WHERE l.organization_id = p_org;
  RETURN r;
END;
$fn$;

-- ==============================================================================
-- 5. RPCs das sugestoes
-- ==============================================================================

-- 5.1 As sugestoes dos negocios (lerNegocios). Devolve {sugestoes, truncado}.
--     So negocios no ambito do utilizador (regra no cabecalho, HIGH-2); os
--     outros sao omitidos sem erro. Por negocio, a submissao mais antiga ligada
--     a ele cujo formulario tem campos activos ligados. Exclui a pergunta que
--     ja tenha linha em negocio_respostas (divisao ''): dada, sugerida e
--     gravada, ou apagada de proposito (valor '' e sugerido false) nunca volta.
--     p_negocios NULL: no maximo 5000 negocios, os de numero mais alto
--     (truncado = true se havia mais).
CREATE FUNCTION public.neg_sugestoes_formulario(p_org uuid, p_negocios uuid[] DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  c_max     constant integer := 5000;
  v_uid     uuid := auth.uid();
  v_crm     boolean;
  v_todos   boolean;
  v_chaves  boolean;
  v_keys    text[];
  v_forms   uuid[];
  v_subs    uuid[];
  v_n       integer;
  v_trunc   boolean := false;
  r         jsonb;
BEGIN
  IF p_org IS NULL THEN
    RAISE EXCEPTION 'pedido_invalido' USING ERRCODE = 'NG009';
  END IF;
  IF v_uid IS NULL OR NOT coalesce(public.fn_cat_pode(p_org, 'pessoas.view'), false) THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
  END IF;
  IF p_negocios IS NOT NULL AND cardinality(p_negocios) > 500 THEN
    RAISE EXCEPTION 'pedido_invalido' USING ERRCODE = 'NG009';
  END IF;

  -- Ambito, calculado uma vez (HIGH-2).
  v_crm := EXISTS (SELECT 1 FROM public.get_user_crm_org_ids(v_uid) AS o(id) WHERE o.id = p_org);
  v_todos := coalesce(public.is_system_admin_user(v_uid), false)
             OR (v_crm AND coalesce(public.fn_neg_papel_permite(p_org, 'pessoas.edit'), false));
  v_chaves := false;
  IF NOT v_todos AND v_crm AND coalesce(public.has_anew_permission(v_uid, 'pessoas.view'), false) THEN
    v_keys := coalesce(public.crm_scope_keys('pessoas.view'), ARRAY[]::text[]);
    IF (p_org::text || ':*') = ANY (v_keys) THEN
      v_todos := true;
    ELSE
      v_chaves := EXISTS (SELECT 1 FROM unnest(v_keys) AS k(k) WHERE starts_with(k.k, p_org::text || ':'));
    END IF;
  END IF;
  IF NOT v_todos AND NOT v_chaves THEN
    RETURN jsonb_build_object('sugestoes', '[]'::jsonb, 'truncado', false);
  END IF;

  -- Formularios da organizacao com campos activos ligados, uma vez.
  SELECT coalesce(array_agg(DISTINCT l.form_id), ARRAY[]::uuid[]) INTO v_forms
    FROM public.form_field_phase_links l
    JOIN public.form_fields ff ON ff.id = l.field_id AND ff.is_active
   WHERE l.organization_id = p_org;
  IF cardinality(v_forms) = 0 THEN
    RETURN jsonb_build_object('sugestoes', '[]'::jsonb, 'truncado', false);
  END IF;

  SELECT coalesce(array_agg(t.id ORDER BY t.numero DESC, t.id), ARRAY[]::uuid[]), count(*)
    INTO v_subs, v_n
    FROM (
      SELECT c.id, c.numero
        FROM (
          SELECT DISTINCT ON (s.negocio_id) s.id, n.numero
            FROM public.form_submissions s
            JOIN public.negocios n
              ON n.id = s.negocio_id AND n.organization_id = p_org
             AND n.deleted_at IS NULL AND n.numero IS NOT NULL
           WHERE s.organization_id = p_org
             AND s.deleted_at IS NULL
             AND s.negocio_id IS NOT NULL
             AND s.form_id = ANY (v_forms)
             AND (p_negocios IS NULL OR s.negocio_id = ANY (p_negocios))
             AND (v_todos
                  OR (p_org::text || ':' || n.assigned_to::text) = ANY (v_keys)
                  OR (p_org::text || ':' || n.created_by::text) = ANY (v_keys))
           ORDER BY s.negocio_id, s.created_at, s.id
        ) c
       ORDER BY c.numero DESC, c.id
       LIMIT c_max + 1
    ) t;

  IF v_n > c_max THEN
    v_trunc := true;
    v_subs := v_subs[1:c_max];
  END IF;

  IF cardinality(v_subs) = 0 THEN
    RETURN jsonb_build_object('sugestoes', '[]'::jsonb, 'truncado', v_trunc);
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'negocio_id', s.negocio_id, 'submissao_id', x.submissao_id,
           'grupo', x.grupo, 'chave', x.chave, 'tipo_campo', x.tipo_campo,
           'valor', x.valor, 'valores', x.valores)
         ORDER BY s.negocio_id, x.grupo, x.chave), '[]'::jsonb)
    INTO r
    FROM public.fn_neg_sugestoes_de(p_org, v_subs) x
    JOIN public.form_submissions s ON s.id = x.submissao_id
   WHERE NOT EXISTS (SELECT 1 FROM public.negocio_respostas nr
                      WHERE nr.negocio_id = s.negocio_id
                        AND nr.campo_chave = x.chave
                        AND nr.divisao = '');
  RETURN jsonb_build_object('sugestoes', r, 'truncado', v_trunc);
END;
$fn$;

-- 5.2 As sugestoes das submissoes pendentes (antes de haver negocio): array.
--     O portao de rpc_resolve_form_submission (20261231200000:874-881):
--     organizacao CRM do utilizador (tambem para o system admin, de proposito:
--     ver cabecalho) e entidade no ambito. Fora do ambito, de outra
--     organizacao ou apagada: omitida, sem erro.
CREATE FUNCTION public.neg_sugestoes_submissoes(p_org uuid, p_submissoes uuid[])
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_uid  uuid := auth.uid();
  v_subs uuid[];
  r      jsonb;
BEGIN
  IF p_org IS NULL THEN
    RAISE EXCEPTION 'pedido_invalido' USING ERRCODE = 'NG009';
  END IF;
  IF v_uid IS NULL OR NOT coalesce(public.fn_cat_pode(p_org, 'pessoas.view'), false) THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
  END IF;
  IF p_submissoes IS NULL OR cardinality(p_submissoes) > 200 THEN
    RAISE EXCEPTION 'pedido_invalido' USING ERRCODE = 'NG009';
  END IF;
  IF cardinality(p_submissoes) = 0
     OR NOT EXISTS (SELECT 1 FROM public.get_user_crm_org_ids(v_uid) AS o(id) WHERE o.id = p_org) THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT coalesce(array_agg(s.id), ARRAY[]::uuid[]) INTO v_subs
    FROM public.form_submissions s
   WHERE s.id = ANY (p_submissoes)
     AND s.organization_id = p_org
     AND s.deleted_at IS NULL
     AND coalesce(public.fn_form_entidade_no_ambito(p_org, s.entity_id), false);

  IF cardinality(v_subs) = 0 THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'negocio_id', NULL, 'submissao_id', x.submissao_id,
           'grupo', x.grupo, 'chave', x.chave, 'tipo_campo', x.tipo_campo,
           'valor', x.valor, 'valores', x.valores)
         ORDER BY x.submissao_id, x.grupo, x.chave), '[]'::jsonb)
    INTO r
    FROM public.fn_neg_sugestoes_de(p_org, v_subs) x;
  RETURN r;
END;
$fn$;

-- ==============================================================================
-- 6. Privilegios e comentarios
-- ==============================================================================
REVOKE ALL ON FUNCTION public.neg_ler_ligacao_fase(uuid, uuid) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.neg_guardar_ligacao_fase(uuid, uuid, jsonb) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.neg_ligacoes_fase(uuid) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.neg_sugestoes_formulario(uuid, uuid[]) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.neg_sugestoes_submissoes(uuid, uuid[]) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.neg_ler_ligacao_fase(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.neg_guardar_ligacao_fase(uuid, uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.neg_ligacoes_fase(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.neg_sugestoes_formulario(uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.neg_sugestoes_submissoes(uuid, uuid[]) TO authenticated;

REVOKE ALL ON FUNCTION public.fn_neg_mapeamento_fase_valido(jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fn_neg_valor_sugerido(jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fn_neg_sugestoes_de(uuid, uuid[]) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fn_form_field_phase_links_coerente() FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION public.fn_neg_mapeamento_fase_valido(jsonb) IS
'INTERNA. CHECK de form_field_phase_links.mapping e validacao de neg_guardar_ligacao_fase: objecto so com grupo (texto 1..80), chave (^[a-z][a-z0-9_]{0,59}$) e valores opcional (objecto ate 60 entradas, chaves 1..200, valores null ou texto 1..120), ate 8 KB. NULL = false. So a forma. Desde 20270106480000.';
COMMENT ON FUNCTION public.fn_neg_valor_sugerido(jsonb) IS
'INTERNA. Normaliza um valor de form_submissions.field_values: texto nao vazio ate 2000, numero/booleano como texto, lista de textos nao vazios (ate 100, cada ate 2000); senao NULL. Desde 20270106480000.';
COMMENT ON FUNCTION public.fn_neg_sugestoes_de(uuid, uuid[]) IS
'INTERNA. Nucleo de neg_sugestoes_formulario e neg_sugestoes_submissoes: para as submissoes da organizacao (nao apagadas, formulario da organizacao), os campos activos ligados (form_field_phase_links) com valor. Nao verifica permissao nem ambito. Desde 20270106480000.';
COMMENT ON FUNCTION public.fn_form_field_phase_links_coerente() IS
'INTERNA. Trigger: form_id e organization_id de form_field_phase_links tem de ser os do campo e do formulario (23514 ligacao_incoerente). Desde 20270106480000.';
COMMENT ON FUNCTION public.neg_ler_ligacao_fase(uuid, uuid) IS
'Negocio (authenticated). As ligacoes de um formulario da organizacao, incluindo as de campos inactivos: [{field_id, mapping}]. pessoas.config (42501); formulario de outra organizacao ou inexistente: NG009 formulario_indisponivel. Desde 20270106480000.';
COMMENT ON FUNCTION public.neg_guardar_ligacao_fase(uuid, uuid, jsonb) IS
'Negocio (authenticated). Grava (upsert) ou tira (p_mapping NULL ou jsonb null) a ligacao de um campo a uma pergunta de fase; devolve {field_id, mapping, alterada}. pessoas.config (42501). NG009: pedido_invalido, mapeamento_invalido, campo_indisponivel. 23505 ligacao_repetida. Desde 20270106480000.';
COMMENT ON FUNCTION public.neg_ligacoes_fase(uuid) IS
'Negocio (authenticated). Campos activos ligados a perguntas de fase: [{form_id, form_nome, field_id, field_label, grupo, chave, valores}]. pessoas.config (42501). Desde 20270106480000.';
COMMENT ON FUNCTION public.neg_sugestoes_formulario(uuid, uuid[]) IS
'Negocio (authenticated). {sugestoes: [{negocio_id, submissao_id, grupo, chave, tipo_campo, valor, valores}], truncado}. So negocios no ambito do utilizador (system admin; papel do RH; ou a regra de negocios_select por crm_scope_keys), os outros omitidos sem erro. Por negocio, a submissao ligada mais antiga cujo formulario tem campos activos ligados; exclui a chave que ja tenha linha em negocio_respostas (divisao vazia). p_negocios NULL = no maximo 5000 (numero mais alto; truncado=true se havia mais); senao ate 500 (NG009). pessoas.view (42501). Desde 20270106480000.';
COMMENT ON FUNCTION public.neg_sugestoes_submissoes(uuid, uuid[]) IS
'Negocio (authenticated). Sugestoes das submissoes pendentes: array com negocio_id null; ate 200 ids (NG009). pessoas.view (42501). Exige a organizacao CRM do utilizador (tambem ao system admin) e a entidade no ambito (o portao de rpc_resolve_form_submission); o resto e omitido sem erro. Desde 20270106480000.';

-- ==============================================================================
-- 7. Conferir
-- ==============================================================================
DO $conferir$
DECLARE
  v_tab  regclass := to_regclass('public.form_field_phase_links');
  v_rpcs text[] := ARRAY[
    'public.neg_ler_ligacao_fase(uuid, uuid)',
    'public.neg_guardar_ligacao_fase(uuid, uuid, jsonb)',
    'public.neg_ligacoes_fase(uuid)',
    'public.neg_sugestoes_formulario(uuid, uuid[])',
    'public.neg_sugestoes_submissoes(uuid, uuid[])'];
  v_internas text[] := ARRAY[
    'public.fn_neg_mapeamento_fase_valido(jsonb)',
    'public.fn_neg_valor_sugerido(jsonb)',
    'public.fn_neg_sugestoes_de(uuid, uuid[])',
    'public.fn_form_field_phase_links_coerente()'];
  v_valid text := 'public.fn_neg_mapeamento_fase_valido(jsonb)';
  v_auth  oid := (SELECT r.oid FROM pg_roles r WHERE r.rolname::text = 'authenticated');
  v_fn    text;
  v_papel text;
  v_priv  text;
  v_col   text;
  v_dono  text;
  v_vol   text;
  v_n     integer;
  v_j     jsonb;
BEGIN
  -- 1. A tabela existe, RLS ligada e forcada, sem politicas.
  IF v_tab IS NULL THEN
    RAISE EXCEPTION 'Conferir: a tabela form_field_phase_links nao foi criada.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_class c WHERE c.oid = v_tab AND c.relrowsecurity AND c.relforcerowsecurity) THEN
    RAISE EXCEPTION 'Conferir: form_field_phase_links nao tem RLS ligada e forcada.';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policy pol WHERE pol.polrelid = v_tab) THEN
    RAISE EXCEPTION 'Conferir: form_field_phase_links tem politicas; o desenho e sem nenhuma.';
  END IF;

  -- 2. Privilegios da tabela: nenhum papel alem do dono (PUBLIC incluido,
  --    grantee 0), nem de tabela nem de coluna.
  SELECT count(*) INTO v_n
    FROM pg_class c, aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
   WHERE c.oid = v_tab AND a.grantee <> c.relowner;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'Conferir: form_field_phase_links tem % privilegio(s) de tabela para alem do dono.', v_n;
  END IF;
  SELECT count(*) INTO v_n
    FROM pg_attribute att, pg_class c, aclexplode(att.attacl) a
   WHERE att.attrelid = v_tab AND c.oid = v_tab AND att.attacl IS NOT NULL AND a.grantee <> c.relowner;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'Conferir: form_field_phase_links tem % privilegio(s) de coluna.', v_n;
  END IF;
  FOREACH v_papel IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    FOREACH v_priv IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] LOOP
      IF has_table_privilege(v_papel, v_tab, v_priv) THEN
        RAISE EXCEPTION 'Conferir: % tem % em form_field_phase_links.', v_papel, v_priv;
      END IF;
    END LOOP;
    FOR v_col IN
      SELECT a.attname::text FROM pg_attribute a
       WHERE a.attrelid = v_tab AND a.attnum > 0 AND NOT a.attisdropped
    LOOP
      FOREACH v_priv IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'REFERENCES'] LOOP
        IF has_column_privilege(v_papel, v_tab, v_col, v_priv) THEN
          RAISE EXCEPTION 'Conferir: % tem % na coluna form_field_phase_links.%.', v_papel, v_priv, v_col;
        END IF;
      END LOOP;
    END LOOP;
  END LOOP;

  -- 3. A ligacao NAO ficou como coluna de form_fields (legivel pelo anon).
  IF EXISTS (SELECT 1 FROM pg_attribute a
              WHERE a.attrelid = to_regclass('public.form_fields') AND NOT a.attisdropped
                AND a.attname::text = 'phase_field_mapping') THEN
    RAISE EXCEPTION 'Conferir: form_fields.phase_field_mapping existe; a ligacao tem de estar so na tabela fechada.';
  END IF;

  -- 4. Restricoes: CHECK validado e as quatro FK.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint c
                  WHERE c.conrelid = v_tab AND c.conname::text = 'form_field_phase_links_mapping_check'
                    AND c.contype::text = 'c' AND c.convalidated) THEN
    RAISE EXCEPTION 'Conferir: falta o CHECK form_field_phase_links_mapping_check.';
  END IF;
  SELECT count(*) INTO v_n FROM pg_constraint c
   WHERE c.conrelid = v_tab AND c.contype::text = 'f'
     AND c.conname::text IN ('form_field_phase_links_field_fkey', 'form_field_phase_links_form_fkey',
                             'form_field_phase_links_org_fkey', 'form_field_phase_links_updated_by_fkey');
  IF v_n <> 4 THEN
    RAISE EXCEPTION 'Conferir: esperadas 4 FK em form_field_phase_links, encontradas %.', v_n;
  END IF;

  -- 5. Indices.
  IF NOT EXISTS (SELECT 1 FROM pg_index i
                  WHERE i.indexrelid = to_regclass('public.form_field_phase_links_pergunta_uk')
                    AND i.indrelid = v_tab AND i.indisunique AND i.indisvalid) THEN
    RAISE EXCEPTION 'Conferir: falta o indice unico form_field_phase_links_pergunta_uk.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_index i
                   JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = i.indkey[0]
                  WHERE i.indrelid = v_tab AND a.attname::text = 'organization_id') THEN
    RAISE EXCEPTION 'Conferir: falta o indice por organization_id em form_field_phase_links.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_index i
                   JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = i.indkey[0]
                  WHERE i.indrelid = to_regclass('public.form_submissions') AND a.attname::text = 'negocio_id') THEN
    RAISE EXCEPTION 'Conferir: form_submissions nao tem indice a comecar por negocio_id.';
  END IF;

  -- 6. O trigger de coerencia existe e esta ligado.
  IF NOT EXISTS (SELECT 1 FROM pg_trigger t
                  WHERE t.tgrelid = v_tab AND t.tgname::text = 'trg_form_field_phase_links_coerente'
                    AND NOT t.tgisinternal AND t.tgenabled::text = 'O') THEN
    RAISE EXCEPTION 'Conferir: falta o trigger trg_form_field_phase_links_coerente (ou esta desligado).';
  END IF;

  -- 7. Uma so versao de cada funcao nova.
  SELECT count(*) INTO v_n
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname::text = 'public'
     AND p.proname::text IN ('neg_sugestoes_formulario', 'neg_sugestoes_submissoes', 'neg_ligacoes_fase',
                             'neg_ler_ligacao_fase', 'neg_guardar_ligacao_fase',
                             'fn_neg_sugestoes_de', 'fn_neg_valor_sugerido', 'fn_neg_mapeamento_fase_valido',
                             'fn_form_field_phase_links_coerente');
  IF v_n <> 9 THEN
    RAISE EXCEPTION 'Conferir: esperadas 9 funcoes novas, encontradas %.', v_n;
  END IF;

  -- 8. RPCs: DEFINER; EXECUTE so do dono e de authenticated (aclexplode,
  --    PUBLIC incluido); volatilidade.
  FOREACH v_fn IN ARRAY v_rpcs LOOP
    IF to_regprocedure(v_fn) IS NULL THEN
      RAISE EXCEPTION 'Conferir: a RPC % nao existe.', v_fn;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid = to_regprocedure(v_fn)::oid AND p.prosecdef) THEN
      RAISE EXCEPTION 'Conferir: % devia ser SECURITY DEFINER.', v_fn;
    END IF;
    SELECT count(*) INTO v_n
      FROM pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
     WHERE p.oid = to_regprocedure(v_fn)::oid AND a.grantee <> p.proowner AND a.grantee <> v_auth;
    IF v_n <> 0 THEN
      RAISE EXCEPTION 'Conferir: % tem % privilegio(s) para alem do dono e de authenticated.', v_fn, v_n;
    END IF;
    IF has_function_privilege('anon', v_fn, 'EXECUTE')
       OR has_function_privilege('service_role', v_fn, 'EXECUTE')
       OR NOT has_function_privilege('authenticated', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'Conferir: % devia ser so de authenticated.', v_fn;
    END IF;
    SELECT p.provolatile::text INTO v_vol FROM pg_proc p WHERE p.oid = to_regprocedure(v_fn)::oid;
    IF (v_fn = 'public.neg_guardar_ligacao_fase(uuid, uuid, jsonb)' AND v_vol <> 'v')
       OR (v_fn <> 'public.neg_guardar_ligacao_fase(uuid, uuid, jsonb)' AND v_vol <> 's') THEN
      RAISE EXCEPTION 'Conferir: % tem a volatilidade errada (%).', v_fn, v_vol;
    END IF;
  END LOOP;

  -- 9. Internas: nao DEFINER; EXECUTE so do dono (aclexplode, PUBLIC incluido).
  FOREACH v_fn IN ARRAY v_internas LOOP
    IF to_regprocedure(v_fn) IS NULL THEN
      RAISE EXCEPTION 'Conferir: a funcao interna % nao existe.', v_fn;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid = to_regprocedure(v_fn)::oid AND p.prosecdef) THEN
      RAISE EXCEPTION 'Conferir: a funcao interna % nao devia ser SECURITY DEFINER.', v_fn;
    END IF;
    SELECT count(*) INTO v_n
      FROM pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
     WHERE p.oid = to_regprocedure(v_fn)::oid AND a.grantee <> p.proowner;
    IF v_n <> 0 THEN
      RAISE EXCEPTION 'Conferir: a funcao interna % tem % privilegio(s) para alem do dono.', v_fn, v_n;
    END IF;
  END LOOP;
  SELECT count(*) INTO v_n FROM pg_proc p
   WHERE (p.oid = to_regprocedure('public.fn_neg_mapeamento_fase_valido(jsonb)')::oid AND p.provolatile::text = 'i')
      OR (p.oid = to_regprocedure('public.fn_neg_valor_sugerido(jsonb)')::oid AND p.provolatile::text = 's')
      OR (p.oid = to_regprocedure('public.fn_neg_sugestoes_de(uuid, uuid[])')::oid AND p.provolatile::text = 's');
  IF v_n <> 3 THEN
    RAISE EXCEPTION 'Conferir: volatilidade das internas errada (certas % de 3).', v_n;
  END IF;

  -- 10. O CHECK corre com quem escreve, e quem escreve e o dono das RPCs
  --     DEFINER: o dono de neg_guardar_ligacao_fase executa o validador e
  --     passa a RLS forcada.
  SELECT pg_get_userbyid(p.proowner)::text INTO v_dono
    FROM pg_proc p WHERE p.oid = to_regprocedure('public.neg_guardar_ligacao_fase(uuid, uuid, jsonb)')::oid;
  IF NOT has_function_privilege(v_dono, v_valid, 'EXECUTE') THEN
    RAISE EXCEPTION 'Conferir: o dono das RPCs (%) nao pode executar o validador do CHECK.', v_dono;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles r WHERE r.rolname::text = v_dono AND (r.rolsuper OR r.rolbypassrls)) THEN
    RAISE EXCEPTION 'Conferir: o dono das RPCs (%) nao passa a RLS forcada.', v_dono;
  END IF;

  -- 11. Todas as funcoes novas com search_path fixo e vazio.
  FOREACH v_fn IN ARRAY v_rpcs || v_internas LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_proc p
                    WHERE p.oid = to_regprocedure(v_fn)::oid
                      AND coalesce(p.proconfig, ARRAY[]::text[]) @> ARRAY['search_path=""']) THEN
      RAISE EXCEPTION 'Conferir: % nao tem search_path vazio.', v_fn;
    END IF;
  END LOOP;

  -- 12. Logica pura do validador, sobre valores literais.
  IF NOT public.fn_neg_mapeamento_fase_valido(jsonb_build_object(
          'grupo', 'Qualifica' || chr(231) || chr(227) || 'o', 'chave', 'imovel',
          'valores', jsonb_build_object('Cozinha', 'Apartamento', 'Outro', NULL::text)))
     OR NOT public.fn_neg_mapeamento_fase_valido(jsonb_build_object(
          'grupo', 'Qualifica' || chr(231) || chr(227) || 'o', 'chave', 'c_tipo_obra'))
     OR NOT public.fn_neg_mapeamento_fase_valido('{"grupo":"G","chave":"a","valores":null}'::jsonb)
     OR NOT public.fn_neg_mapeamento_fase_valido('{"grupo":"G","chave":"a","valores":{}}'::jsonb)
     -- 25 entradas grandes (cerca de 6,5 KB): dentro de todos os limites
     OR NOT public.fn_neg_mapeamento_fase_valido(jsonb_build_object('grupo', 'G', 'chave', 'a',
          'valores', (SELECT jsonb_object_agg(repeat('k', 150) || g::text, repeat('v', 100)) FROM generate_series(1, 25) AS g))) THEN
    RAISE EXCEPTION 'Conferir: o validador recusou um mapeamento valido.';
  END IF;
  IF public.fn_neg_mapeamento_fase_valido(NULL)
     OR public.fn_neg_mapeamento_fase_valido('[]'::jsonb)
     OR public.fn_neg_mapeamento_fase_valido('"x"'::jsonb)
     OR public.fn_neg_mapeamento_fase_valido('{}'::jsonb)
     OR public.fn_neg_mapeamento_fase_valido('{"grupo":"G"}'::jsonb)
     OR public.fn_neg_mapeamento_fase_valido('{"chave":"a"}'::jsonb)
     OR public.fn_neg_mapeamento_fase_valido('{"grupo":"G","chave":"a","extra":1}'::jsonb)
     OR public.fn_neg_mapeamento_fase_valido('{"grupo":"","chave":"a"}'::jsonb)
     OR public.fn_neg_mapeamento_fase_valido('{"grupo":"   ","chave":"a"}'::jsonb)
     OR public.fn_neg_mapeamento_fase_valido(jsonb_build_object('grupo', repeat('g', 81), 'chave', 'a'))
     OR public.fn_neg_mapeamento_fase_valido('{"grupo":"G","chave":"Imovel"}'::jsonb)
     OR public.fn_neg_mapeamento_fase_valido('{"grupo":"G","chave":"1a"}'::jsonb)
     OR public.fn_neg_mapeamento_fase_valido('{"grupo":"G","chave":"a-b"}'::jsonb)
     OR public.fn_neg_mapeamento_fase_valido(jsonb_build_object('grupo', 'G', 'chave', 'a' || repeat('b', 60)))
     OR public.fn_neg_mapeamento_fase_valido('{"grupo":1,"chave":"a"}'::jsonb)
     OR public.fn_neg_mapeamento_fase_valido('{"grupo":"G","chave":"a","valores":[]}'::jsonb)
     OR public.fn_neg_mapeamento_fase_valido('{"grupo":"G","chave":"a","valores":{"":"x"}}'::jsonb)
     OR public.fn_neg_mapeamento_fase_valido('{"grupo":"G","chave":"a","valores":{"x":""}}'::jsonb)
     OR public.fn_neg_mapeamento_fase_valido('{"grupo":"G","chave":"a","valores":{"x":1}}'::jsonb)
     OR public.fn_neg_mapeamento_fase_valido(jsonb_build_object('grupo', 'G', 'chave', 'a',
          'valores', jsonb_build_object('x', repeat('v', 121))))
     -- 61 entradas pequenas: passa o limite de 60
     OR public.fn_neg_mapeamento_fase_valido(jsonb_build_object('grupo', 'G', 'chave', 'a',
          'valores', (SELECT jsonb_object_agg('k' || g::text, 'v'::text) FROM generate_series(1, 61) AS g)))
     -- limite de 8 KB: 50 entradas grandes (cerca de 15 KB), cada uma valida
     OR public.fn_neg_mapeamento_fase_valido(jsonb_build_object('grupo', 'G', 'chave', 'a',
          'valores', (SELECT jsonb_object_agg(repeat('k', 190) || g::text, repeat('v', 100)) FROM generate_series(1, 50) AS g))) THEN
    RAISE EXCEPTION 'Conferir: o validador aceitou um mapeamento invalido.';
  END IF;

  -- 13. Logica pura do normalizador de valores.
  IF public.fn_neg_valor_sugerido('"abc"'::jsonb) IS DISTINCT FROM '"abc"'::jsonb
     OR public.fn_neg_valor_sugerido('"   "'::jsonb) IS NOT NULL
     OR public.fn_neg_valor_sugerido('""'::jsonb) IS NOT NULL
     OR public.fn_neg_valor_sugerido('null'::jsonb) IS NOT NULL
     OR public.fn_neg_valor_sugerido(NULL) IS NOT NULL
     OR public.fn_neg_valor_sugerido('{"a":1}'::jsonb) IS NOT NULL
     OR public.fn_neg_valor_sugerido('[]'::jsonb) IS NOT NULL
     OR public.fn_neg_valor_sugerido('["", " "]'::jsonb) IS NOT NULL
     OR public.fn_neg_valor_sugerido('12'::jsonb) IS DISTINCT FROM '"12"'::jsonb
     OR public.fn_neg_valor_sugerido('true'::jsonb) IS DISTINCT FROM '"true"'::jsonb
     OR public.fn_neg_valor_sugerido('["a", "", 2, {"x":1}, "b"]'::jsonb) IS DISTINCT FROM '["a", "2", "b"]'::jsonb THEN
    RAISE EXCEPTION 'Conferir: fn_neg_valor_sugerido nao normaliza como esperado.';
  END IF;
  v_j := public.fn_neg_valor_sugerido(to_jsonb(repeat('x', 2500)));
  IF char_length(v_j #>> '{}') <> 2000 THEN
    RAISE EXCEPTION 'Conferir: fn_neg_valor_sugerido nao trunca o texto a 2000.';
  END IF;
  v_j := public.fn_neg_valor_sugerido((SELECT jsonb_agg(g::text) FROM generate_series(1, 150) AS g));
  IF jsonb_array_length(v_j) <> 100 THEN
    RAISE EXCEPTION 'Conferir: fn_neg_valor_sugerido nao limita a lista a 100 itens.';
  END IF;
END;
$conferir$;

RESET lock_timeout;
