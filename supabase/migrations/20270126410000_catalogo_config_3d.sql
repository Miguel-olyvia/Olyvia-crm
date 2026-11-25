-- =============================================================================
-- Catálogo — CONFIGURAÇÃO 3D POR PRODUTO E POR CATEGORIA (Emylia): que medida vai para cada eixo do modelo
-- (largura/altura/profundidade) e que atributo pinta que zona (ligações). Herança por parte: eixos e ligações
-- resolvem-se cada um por si, produto > subcategoria > categoria > automático (o que o 3D faz hoje).
--
-- !!! SÓ PARA A BASE DE RH (uetjghdkwbywbftedtth) — NUNCA NA PRINCIPAL; confirmar o project-ref antes do push
-- !!! (supabase/.temp/project-ref tem de dizer uetjghdkwbywbftedtth).
-- !!! ATENÇÃO: esta base tem a Mudelar e mais 4 organizações além da nike (6 no total, lido a 25/11). A tabela
-- !!! nasce vazia e nada existente muda; provas só na nike.
--
-- !!! PRECISA DE CÓDIGO NOVO NO BROWSER (ramo feature/rh-pessoas, escrito em paralelo): MIGRATION E CÓDIGO ENTRAM
-- !!! JUNTOS (mesmo envio). A ficha do produto chama cat_ler_config_3d ao abrir o 3D e grava com
-- !!! cat_definir_config_3d; o ecrã das categorias faz o mesmo com p_alvo = 'categoria'. Sem esse código a migration
-- !!! não parte nada (tabela vazia = o 3D comporta-se exactamente como hoje), mas a funcionalidade não existe.
-- =============================================================================
--
-- CONTRATO (combinado com o código do browser; os nomes não mudam)
--  1. fn_cat_config_3d_forma(p_eixos jsonb, p_ligacoes jsonb) → boolean. LANGUAGE sql IMMUTABLE, só olha para o
--     JSON (vai num CHECK). eixos: NULL, ou objecto com exactamente largura/altura/profundidade, cada um
--     largura|comprimento|espessura e os três diferentes. ligacoes: NULL, ou lista de ≤ 60 objectos com exactamente
--     {atributo: uuid em texto (minúsculas), zona: ^[a-z_]{1,20}$, aplicar: boolean}, sem pares (atributo, zona)
--     repetidos. A lista das zonas vive no código (zonasGlb.ts + a pseudo-zona 'tudo'): a base só vê o formato.
--     Ordem garantida por CASE (um AND não garante): jsonb_array_length só corre sobre um array.
--  2. Tabela cat_config_3d: uma linha por alvo (produto OU categoria/subcategoria), eixos e/ou ligacoes.
--     Ligações em JSON, sem FK aos atributos (escolha consciente): a leitura larga as de atributos apagados e
--     conta-as em 'orfas'. ON DELETE CASCADE do produto/categoria.
--     Privilégios: o default ACL desta base dá arwdDxtm a anon e authenticated numa tabela nova (lido a 25/11):
--     REVOKE ALL a PUBLIC/anon/authenticated e depois só SELECT a authenticated (RLS por organização: products.view
--     OU services.view OU products.edit) e tudo a service_role. Sem políticas nem GRANT de escrita: escreve-se só
--     por cat_definir_config_3d, que valida que cada atributo é da organização.
--  3. cat_definir_config_3d(p_org, p_alvo, p_id, p_eixos, p_ligacoes) → {alvo, id, eixos, ligacoes, anterior:{…}}.
--     Exige products.edit. p_alvo ∈ produto|categoria (a subcategoria é uma categoria). JSON null = NULL. Os dois
--     NULL = apaga a linha (volta a herdar). '[]' em ligacoes é válido: pára a herança. Última escrita ganha.
--  4. cat_ler_config_3d(p_org, p_alvo, p_id) → {proprio:{eixos, ligacoes, orfas}|null,
--     subcategoria:{id, nome, eixos, ligacoes}|null, categoria:{id, nome, eixos, ligacoes}|null,
--     efectiva:{eixos, eixos_origem, ligacoes, ligacoes_origem}}, origem ∈ produto|subcategoria|categoria|automatico.
--     Exige products.view OU services.view OU products.edit (decisão do dono, 25/11).
--     Produto: o próprio, a subcategoria (p.subcategory_id) e a categoria coalesce(p.category_id, s.parent_id),
--     igual a cat_ler_produto. Categoria: a própria (origem 'subcategoria' se tiver pai, senão 'categoria') e o pai
--     em 'categoria'. Ligações filtradas aos atributos vivos (não apagados, não medidas) da organização.
--     Custo: três buscas por índice único + junção a ≤ 60 atributos por nível; nada de catálogos pg_*. Uma chamada
--     por produto aberto; não entra em nenhuma leitura em lote.
--
-- O QUE NÃO MUDA: nenhuma tabela nem função existente. Sem DROP FUNCTION e sem sobrecargas.
-- EFEITOS LATERAIS: trigger update_updated_at_column (o mesmo de product_categories). Sem auditoria nesta fase
-- (SUPOSIÇÃO: fn_generic_entity_audit não foi lida para saber se serve a uma tabela sem colunas *_id habituais).
-- Sem índice em organization_id: as leituras vão pelos UNIQUE; a política por organização só filtra o SELECT
-- directo, que o ecrã não usa.
--
-- ORDEM: independente de 20270126400000 (pode ir antes ou depois). `supabase db push` aplica TUDO o que estiver
-- pendente (a 25/11, 57 ficheiros do ramo): empurrar de um workdir isolado e listar com
-- `supabase migration list --linked` imediatamente antes.
-- =============================================================================

SET lock_timeout = '5s';
SET statement_timeout = '2min';

-- ---- Guarda ------------------------------------------------------------------------------------------------------
DO $guarda$
BEGIN
  IF to_regclass('public.cat_config_3d') IS NOT NULL THEN
    RAISE EXCEPTION 'Guarda: a tabela cat_config_3d já existe (ver o que está na base).';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
             AND p.proname IN ('cat_ler_config_3d', 'cat_definir_config_3d', 'fn_cat_config_3d_forma')) THEN
    RAISE EXCEPTION 'Guarda: cat_ler_config_3d, cat_definir_config_3d ou fn_cat_config_3d_forma já existem.';
  END IF;
  IF to_regprocedure('public.fn_cat_pode(uuid,text)') IS NULL
     OR to_regprocedure('public.fn_cat_exigir(uuid,text)') IS NULL
     OR to_regprocedure('public.fn_cat_exigir_uma(uuid,text[])') IS NULL
     OR to_regprocedure('public.update_updated_at_column()') IS NULL THEN
    RAISE EXCEPTION 'Guarda: faltam fn_cat_pode, fn_cat_exigir, fn_cat_exigir_uma ou update_updated_at_column.';
  END IF;
  IF (SELECT count(*) FROM information_schema.columns c
      WHERE c.table_schema = 'public' AND c.table_name IN ('products', 'product_categories')
        AND c.column_name = 'modelo_3d') <> 2 THEN
    RAISE EXCEPTION 'Guarda: falta modelo_3d em products ou product_categories (20270126320000 aplicada?).';
  END IF;
  IF to_regclass('public.anew_organizations') IS NULL OR to_regclass('public.anew_users') IS NULL THEN
    RAISE EXCEPTION 'Guarda: faltam anew_organizations ou anew_users.';
  END IF;
END
$guarda$;

-- ---- 1. fn_cat_config_3d_forma (pura: vai no CHECK) --------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_cat_config_3d_forma(p_eixos jsonb, p_ligacoes jsonb)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'pg_catalog'
AS $function$
  SELECT
    -- eixos: NULL, ou {largura, altura, profundidade} com uma permutação de largura | comprimento | espessura
    CASE
      WHEN p_eixos IS NULL THEN true
      WHEN jsonb_typeof(p_eixos) <> 'object' THEN false
      ELSE coalesce(
             (p_eixos - ARRAY['largura', 'altura', 'profundidade']) = '{}'::jsonb
             AND p_eixos ?& ARRAY['largura', 'altura', 'profundidade']
             AND (p_eixos ->> 'largura') IN ('largura', 'comprimento', 'espessura')
             AND (p_eixos ->> 'altura') IN ('largura', 'comprimento', 'espessura')
             AND (p_eixos ->> 'profundidade') IN ('largura', 'comprimento', 'espessura')
             AND (p_eixos ->> 'largura') <> (p_eixos ->> 'altura')
             AND (p_eixos ->> 'largura') <> (p_eixos ->> 'profundidade')
             AND (p_eixos ->> 'altura') <> (p_eixos ->> 'profundidade'),
           false)
    END
    AND
    -- ligações: NULL, ou lista de até 60 {atributo, zona, aplicar} sem (atributo, zona) repetidos
    CASE
      WHEN p_ligacoes IS NULL THEN true
      WHEN jsonb_typeof(p_ligacoes) <> 'array' THEN false
      WHEN jsonb_array_length(p_ligacoes) > 60 THEN false
      ELSE NOT EXISTS (
             SELECT 1 FROM jsonb_array_elements(p_ligacoes) AS e(x)
             WHERE NOT coalesce(
                     CASE WHEN jsonb_typeof(e.x) <> 'object' THEN false
                          ELSE (e.x - ARRAY['atributo', 'zona', 'aplicar']) = '{}'::jsonb
                               AND e.x ?& ARRAY['atributo', 'zona', 'aplicar']
                               AND jsonb_typeof(e.x -> 'atributo') = 'string'
                               AND (e.x ->> 'atributo') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                               AND jsonb_typeof(e.x -> 'zona') = 'string'
                               AND (e.x ->> 'zona') ~ '^[a-z_]{1,20}$'
                               AND jsonb_typeof(e.x -> 'aplicar') = 'boolean' END,
                     false))
           AND (SELECT count(*) = count(DISTINCT (e.x ->> 'atributo') || '|' || (e.x ->> 'zona'))
                FROM jsonb_array_elements(p_ligacoes) AS e(x))
    END
$function$;

REVOKE ALL ON FUNCTION public.fn_cat_config_3d_forma(jsonb,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_cat_config_3d_forma(jsonb,jsonb) TO authenticated, service_role;
COMMENT ON FUNCTION public.fn_cat_config_3d_forma(jsonb,jsonb) IS
  'Forma do JSON da configuração 3D (eixos e ligações). Pura; usada no CHECK de cat_config_3d e em cat_definir_config_3d.';

-- ---- 2. Tabela cat_config_3d -------------------------------------------------------------------------------------
CREATE TABLE public.cat_config_3d (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.anew_organizations(id),
  produto_id uuid NULL REFERENCES public.products(id) ON DELETE CASCADE,
  categoria_id uuid NULL REFERENCES public.product_categories(id) ON DELETE CASCADE,
  eixos jsonb NULL,
  ligacoes jsonb NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid NULL REFERENCES public.anew_users(id) ON DELETE SET NULL,
  CONSTRAINT cat_config_3d_alvo_check CHECK (num_nonnulls(produto_id, categoria_id) = 1),
  CONSTRAINT cat_config_3d_algum_check CHECK (eixos IS NOT NULL OR ligacoes IS NOT NULL),
  CONSTRAINT cat_config_3d_forma_check CHECK (public.fn_cat_config_3d_forma(eixos, ligacoes)),
  -- NULLs distintos: servem de índice ao CASCADE, à leitura e ao ON CONFLICT
  CONSTRAINT cat_config_3d_produto_id_key UNIQUE (produto_id),
  CONSTRAINT cat_config_3d_categoria_id_key UNIQUE (categoria_id)
);

COMMENT ON TABLE public.cat_config_3d IS
  'Configuração 3D de um produto ou de uma categoria/subcategoria: eixos (medida → eixo) e ligações (atributo → zona). NULL = herda. Escreve-se só por cat_definir_config_3d; lê-se por cat_ler_config_3d.';

-- a ordem importa: o default ACL desta base dá tudo a anon e authenticated numa tabela nova
ALTER TABLE public.cat_config_3d ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cat_config_3d FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.cat_config_3d TO authenticated;
GRANT ALL ON public.cat_config_3d TO service_role;

CREATE POLICY cat_config_3d_ler ON public.cat_config_3d
  FOR SELECT TO authenticated
  USING (public.fn_cat_pode(organization_id, 'products.view')
         OR public.fn_cat_pode(organization_id, 'services.view')
         OR public.fn_cat_pode(organization_id, 'products.edit'));

CREATE TRIGGER update_cat_config_3d_updated_at
  BEFORE UPDATE ON public.cat_config_3d
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---- 3. cat_definir_config_3d ------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cat_definir_config_3d(p_org uuid, p_alvo text, p_id uuid, p_eixos jsonb, p_ligacoes jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  c_max_bytes constant integer := 32768;
  c_max_ligacoes constant integer := 60;
  c_eixos constant text[] := ARRAY['largura', 'altura', 'profundidade'];
  c_medidas constant text[] := ARRAY['largura', 'comprimento', 'espessura'];
  c_chaves constant text[] := ARRAY['atributo', 'zona', 'aplicar'];
  c_re_uuid constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  c_re_zona constant text := '^[a-z_]{1,20}$';
  v_user uuid;
  v_by uuid;
  v_alvo text := lower(btrim(coalesce(p_alvo, '')));
  v_eixos jsonb;
  v_lig jsonb;
  v_norm jsonb;
  v_el jsonb;
  v_k text;
  v_med text;
  v_atr text;
  v_zona text;
  v_n integer;
  v_ok integer;
  v_ant_eixos jsonb;
  v_ant_lig jsonb;
BEGIN
  -- a mesma permissão que cat_definir_modelo_3d (CT001 sem ela)
  v_user := public.fn_cat_exigir(p_org, 'products.edit');

  IF v_alvo NOT IN ('produto', 'categoria') THEN
    RAISE EXCEPTION 'Indique se a configuração 3D é de um produto ou de uma categoria.' USING ERRCODE = 'CT002';
  END IF;
  IF p_id IS NULL THEN
    RAISE EXCEPTION 'Falta indicar o produto ou a categoria.' USING ERRCODE = 'CT002';
  END IF;
  -- JSON absurdo: recusado antes de qualquer trabalho
  IF pg_column_size(p_ligacoes) > c_max_bytes OR pg_column_size(p_eixos) > c_max_bytes THEN
    RAISE EXCEPTION 'A configuração 3D é demasiado grande.' USING ERRCODE = 'CT002';
  END IF;

  -- JSON null = NULL (volta a herdar essa parte)
  v_eixos := CASE WHEN p_eixos IS NULL OR jsonb_typeof(p_eixos) = 'null' THEN NULL ELSE p_eixos END;
  v_lig := CASE WHEN p_ligacoes IS NULL OR jsonb_typeof(p_ligacoes) = 'null' THEN NULL ELSE p_ligacoes END;

  -- eixos (a ordem e as regras de fn_cat_config_3d_forma, com mensagens próprias)
  IF v_eixos IS NOT NULL THEN
    IF jsonb_typeof(v_eixos) <> 'object' OR (v_eixos - c_eixos) <> '{}'::jsonb OR NOT (v_eixos ?& c_eixos) THEN
      RAISE EXCEPTION 'Os eixos têm de indicar exactamente largura, altura e profundidade.' USING ERRCODE = 'CT002';
    END IF;
    v_norm := '{}'::jsonb;
    FOREACH v_k IN ARRAY c_eixos LOOP
      v_med := CASE WHEN jsonb_typeof(v_eixos -> v_k) = 'string' THEN lower(btrim(v_eixos ->> v_k)) END;
      IF v_med IS NULL OR NOT (v_med = ANY (c_medidas)) THEN
        RAISE EXCEPTION 'O eixo «%» tem de ser largura, comprimento ou espessura.', v_k USING ERRCODE = 'CT002';
      END IF;
      v_norm := v_norm || jsonb_build_object(v_k, v_med);
    END LOOP;
    IF (v_norm ->> 'largura') IN (v_norm ->> 'altura', v_norm ->> 'profundidade')
       OR (v_norm ->> 'altura') = (v_norm ->> 'profundidade') THEN
      RAISE EXCEPTION 'Cada medida (largura, comprimento ou espessura) só pode ir para um eixo.' USING ERRCODE = 'CT002';
    END IF;
    v_eixos := v_norm;
  END IF;

  -- ligações
  IF v_lig IS NOT NULL THEN
    IF jsonb_typeof(v_lig) <> 'array' THEN
      RAISE EXCEPTION 'As ligações têm de ser uma lista.' USING ERRCODE = 'CT002';
    END IF;
    IF jsonb_array_length(v_lig) > c_max_ligacoes THEN
      RAISE EXCEPTION 'No máximo % ligações.', c_max_ligacoes USING ERRCODE = 'CT002';
    END IF;
    v_norm := '[]'::jsonb;
    FOR v_el IN SELECT e.x FROM jsonb_array_elements(v_lig) WITH ORDINALITY AS e(x, i) ORDER BY e.i LOOP
      IF jsonb_typeof(v_el) <> 'object' OR (v_el - c_chaves) <> '{}'::jsonb OR NOT (v_el ?& c_chaves) THEN
        RAISE EXCEPTION 'Cada ligação tem de ter atributo, zona e aplicar.' USING ERRCODE = 'CT002';
      END IF;
      v_atr := CASE WHEN jsonb_typeof(v_el -> 'atributo') = 'string' THEN lower(btrim(v_el ->> 'atributo')) END;
      IF v_atr IS NULL OR v_atr !~ c_re_uuid THEN
        RAISE EXCEPTION 'Uma ligação tem um atributo que não é válido.' USING ERRCODE = 'CT002';
      END IF;
      v_zona := CASE WHEN jsonb_typeof(v_el -> 'zona') = 'string' THEN lower(btrim(v_el ->> 'zona')) END;
      IF v_zona IS NULL OR v_zona !~ c_re_zona THEN
        RAISE EXCEPTION 'A zona «%» não é válida: só letras minúsculas sem acentos e _ (até 20).',
          left(coalesce(v_el ->> 'zona', ''), 40) USING ERRCODE = 'CT002';
      END IF;
      IF jsonb_typeof(v_el -> 'aplicar') IS DISTINCT FROM 'boolean' THEN
        RAISE EXCEPTION 'Em cada ligação, «aplicar» tem de ser verdadeiro ou falso.' USING ERRCODE = 'CT002';
      END IF;
      IF v_norm @> jsonb_build_array(jsonb_build_object('atributo', v_atr, 'zona', v_zona)) THEN
        RAISE EXCEPTION 'O mesmo atributo está ligado duas vezes à zona «%».', v_zona USING ERRCODE = 'CT002';
      END IF;
      v_norm := v_norm || jsonb_build_array(jsonb_build_object('atributo', v_atr, 'zona', v_zona, 'aplicar', v_el -> 'aplicar'));
    END LOOP;
    v_lig := v_norm;
  END IF;

  -- rede de segurança: a mesma regra do CHECK (uma mensagem nossa em vez do 23514 em bruto)
  IF NOT public.fn_cat_config_3d_forma(v_eixos, v_lig) THEN
    RAISE EXCEPTION 'A configuração 3D não é válida.' USING ERRCODE = 'CT002';
  END IF;

  -- o alvo tem de ser desta organização (IDOR); preso contra apagar até ao fim
  IF v_alvo = 'produto' THEN
    PERFORM 1 FROM products p
    WHERE p.id = p_id AND p.organization_id = p_org AND p.tipo_catalogo IS NOT NULL AND NOT p.is_deleted
    FOR KEY SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Produto não encontrado.' USING ERRCODE = 'CT003'; END IF;
  ELSE
    -- a mesma chave e a mesma ordem de cat_guardar_categoria_produto e cat_definir_modelo_3d
    PERFORM pg_advisory_xact_lock(hashtextextended('cat_categorias_produto:' || p_org::text, 0));
    IF EXISTS (SELECT 1 FROM product_categories pc
               WHERE pc.id = p_id AND pc.deleted_at IS NULL AND pc.organization_id IS NULL) THEN
      RAISE EXCEPTION 'Categoria partilhada: não se pode alterar aqui.' USING ERRCODE = 'CT002';
    END IF;
    PERFORM 1 FROM product_categories pc
    WHERE pc.id = p_id AND pc.deleted_at IS NULL AND pc.organization_id = p_org
    FOR KEY SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Categoria não encontrada.' USING ERRCODE = 'CT003'; END IF;
  END IF;

  -- os atributos das ligações: vivos, desta organização, de lista (um de outra organização = inexistente)
  IF v_lig IS NOT NULL AND jsonb_array_length(v_lig) > 0 THEN
    SELECT count(DISTINCT x.a)::integer, count(DISTINCT pa.id)::integer INTO v_n, v_ok
    FROM (SELECT (e.x ->> 'atributo')::uuid AS a FROM jsonb_array_elements(v_lig) AS e(x)) x
    LEFT JOIN product_attributes pa
      ON pa.id = x.a AND pa.organization_id = p_org AND pa.deleted_at IS NULL AND NOT pa.is_measurement;
    IF v_ok <> v_n THEN
      RAISE EXCEPTION 'Há ligações a atributos que não existem nesta organização (ou que são medidas).' USING ERRCODE = 'CT002';
    END IF;
  END IF;

  -- a configuração anterior (para o ecrã avisar se alguém mudou entretanto)
  IF v_alvo = 'produto' THEN
    SELECT c.eixos, c.ligacoes INTO v_ant_eixos, v_ant_lig FROM cat_config_3d c
    WHERE c.produto_id = p_id AND c.organization_id = p_org FOR UPDATE;
  ELSE
    SELECT c.eixos, c.ligacoes INTO v_ant_eixos, v_ant_lig FROM cat_config_3d c
    WHERE c.categoria_id = p_id AND c.organization_id = p_org FOR UPDATE;
  END IF;

  v_by := (SELECT u.id FROM anew_users u WHERE u.id = v_user);

  IF v_eixos IS NULL AND v_lig IS NULL THEN
    -- nada próprio: apaga a linha e volta a herdar
    IF v_alvo = 'produto' THEN
      DELETE FROM cat_config_3d c WHERE c.produto_id = p_id AND c.organization_id = p_org;
    ELSE
      DELETE FROM cat_config_3d c WHERE c.categoria_id = p_id AND c.organization_id = p_org;
    END IF;
  ELSIF v_alvo = 'produto' THEN
    INSERT INTO cat_config_3d AS c (organization_id, produto_id, eixos, ligacoes, updated_by)
    VALUES (p_org, p_id, v_eixos, v_lig, v_by)
    ON CONFLICT (produto_id) DO UPDATE
      SET organization_id = EXCLUDED.organization_id, eixos = EXCLUDED.eixos, ligacoes = EXCLUDED.ligacoes,
          updated_by = EXCLUDED.updated_by
      WHERE (c.organization_id, c.eixos, c.ligacoes) IS DISTINCT FROM (EXCLUDED.organization_id, EXCLUDED.eixos, EXCLUDED.ligacoes);
  ELSE
    INSERT INTO cat_config_3d AS c (organization_id, categoria_id, eixos, ligacoes, updated_by)
    VALUES (p_org, p_id, v_eixos, v_lig, v_by)
    ON CONFLICT (categoria_id) DO UPDATE
      SET organization_id = EXCLUDED.organization_id, eixos = EXCLUDED.eixos, ligacoes = EXCLUDED.ligacoes,
          updated_by = EXCLUDED.updated_by
      WHERE (c.organization_id, c.eixos, c.ligacoes) IS DISTINCT FROM (EXCLUDED.organization_id, EXCLUDED.eixos, EXCLUDED.ligacoes);
  END IF;

  RETURN jsonb_build_object('alvo', v_alvo, 'id', p_id, 'eixos', v_eixos, 'ligacoes', v_lig,
                            'anterior', jsonb_build_object('eixos', v_ant_eixos, 'ligacoes', v_ant_lig));
END $function$;

-- a ordem importa: primeiro tirar (o CREATE dá EXECUTE a PUBLIC e o default ACL a anon), depois dar
REVOKE ALL ON FUNCTION public.cat_definir_config_3d(uuid,text,uuid,jsonb,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cat_definir_config_3d(uuid,text,uuid,jsonb,jsonb) TO authenticated, service_role;
COMMENT ON FUNCTION public.cat_definir_config_3d(uuid,text,uuid,jsonb,jsonb) IS
  'Grava (ou apaga, com os dois NULL) a configuração 3D de um produto ou categoria/subcategoria: eixos e ligações atributo → zona. Devolve {alvo, id, eixos, ligacoes, anterior}. Exige products.edit.';

-- ---- 4. cat_ler_config_3d ----------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cat_ler_config_3d(p_org uuid, p_alvo text, p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_alvo text := lower(btrim(coalesce(p_alvo, '')));
  v_nivel text;
  v_sub_id uuid;
  v_sub_nome text;
  v_cat_id uuid;
  v_cat_nome text;
  v_raw jsonb;
  v_pr_tem boolean := false;
  v_pr_eixos jsonb;
  v_pr_lig jsonb;
  v_pr_orfas integer := 0;
  v_sub_eixos jsonb;
  v_sub_lig jsonb;
  v_cat_eixos jsonb;
  v_cat_lig jsonb;
BEGIN
  -- decisão do dono (25/11): ler com products.view OU services.view OU products.edit
  PERFORM public.fn_cat_exigir_uma(p_org, ARRAY['products.view', 'services.view', 'products.edit']);

  IF v_alvo NOT IN ('produto', 'categoria') THEN
    RAISE EXCEPTION 'Indique se a configuração 3D é de um produto ou de uma categoria.' USING ERRCODE = 'CT002';
  END IF;
  IF p_id IS NULL THEN
    RAISE EXCEPTION 'Falta indicar o produto ou a categoria.' USING ERRCODE = 'CT002';
  END IF;

  IF v_alvo = 'produto' THEN
    -- o produto do Catálogo desta organização; categoria resolvida como em cat_ler_produto
    SELECT p.subcategory_id, coalesce(p.category_id, s.parent_id) INTO v_sub_id, v_cat_id
    FROM products p
    LEFT JOIN product_categories s ON s.id = p.subcategory_id
    WHERE p.id = p_id AND p.organization_id = p_org AND p.tipo_catalogo IS NOT NULL AND NOT p.is_deleted;
    IF NOT FOUND THEN RAISE EXCEPTION 'Produto não encontrado.' USING ERRCODE = 'CT003'; END IF;
    v_nivel := 'produto';
    SELECT c.eixos, c.ligacoes INTO v_pr_eixos, v_raw FROM cat_config_3d c
    WHERE c.produto_id = p_id AND c.organization_id = p_org;
    v_pr_tem := FOUND;
  ELSE
    -- a categoria (da organização ou partilhada); se tiver pai é uma subcategoria e o pai é a 'categoria'
    SELECT pc.parent_id INTO v_cat_id FROM product_categories pc
    WHERE pc.id = p_id AND pc.deleted_at IS NULL AND (pc.organization_id = p_org OR pc.organization_id IS NULL);
    IF NOT FOUND THEN RAISE EXCEPTION 'Categoria não encontrada.' USING ERRCODE = 'CT003'; END IF;
    v_nivel := CASE WHEN v_cat_id IS NULL THEN 'categoria' ELSE 'subcategoria' END;
    SELECT c.eixos, c.ligacoes INTO v_pr_eixos, v_raw FROM cat_config_3d c
    WHERE c.categoria_id = p_id AND c.organization_id = p_org;
    v_pr_tem := FOUND;
  END IF;

  -- ligações do próprio: só as de atributos vivos da organização; as que caem contam em 'orfas'
  IF v_raw IS NOT NULL THEN
    SELECT coalesce(jsonb_agg(e.x ORDER BY e.i) FILTER (WHERE pa.id IS NOT NULL), '[]'::jsonb),
           (count(*) FILTER (WHERE pa.id IS NULL))::integer
    INTO v_pr_lig, v_pr_orfas
    FROM jsonb_array_elements(v_raw) WITH ORDINALITY AS e(x, i)
    LEFT JOIN product_attributes pa
      ON pa.id = (e.x ->> 'atributo')::uuid AND pa.organization_id = p_org AND pa.deleted_at IS NULL AND NOT pa.is_measurement;
  END IF;

  IF v_sub_id IS NOT NULL THEN
    SELECT s.name INTO v_sub_nome FROM product_categories s WHERE s.id = v_sub_id;
    v_raw := NULL;
    SELECT c.eixos, c.ligacoes INTO v_sub_eixos, v_raw FROM cat_config_3d c
    WHERE c.categoria_id = v_sub_id AND c.organization_id = p_org;
    IF v_raw IS NOT NULL THEN
      SELECT coalesce(jsonb_agg(e.x ORDER BY e.i) FILTER (WHERE pa.id IS NOT NULL), '[]'::jsonb) INTO v_sub_lig
      FROM jsonb_array_elements(v_raw) WITH ORDINALITY AS e(x, i)
      LEFT JOIN product_attributes pa
        ON pa.id = (e.x ->> 'atributo')::uuid AND pa.organization_id = p_org AND pa.deleted_at IS NULL AND NOT pa.is_measurement;
    END IF;
  END IF;

  IF v_cat_id IS NOT NULL THEN
    SELECT c0.name INTO v_cat_nome FROM product_categories c0 WHERE c0.id = v_cat_id;
    v_raw := NULL;
    SELECT c.eixos, c.ligacoes INTO v_cat_eixos, v_raw FROM cat_config_3d c
    WHERE c.categoria_id = v_cat_id AND c.organization_id = p_org;
    IF v_raw IS NOT NULL THEN
      SELECT coalesce(jsonb_agg(e.x ORDER BY e.i) FILTER (WHERE pa.id IS NOT NULL), '[]'::jsonb) INTO v_cat_lig
      FROM jsonb_array_elements(v_raw) WITH ORDINALITY AS e(x, i)
      LEFT JOIN product_attributes pa
        ON pa.id = (e.x ->> 'atributo')::uuid AND pa.organization_id = p_org AND pa.deleted_at IS NULL AND NOT pa.is_measurement;
    END IF;
  END IF;

  -- efectiva: cada parte por si, do mais próprio para o mais geral; '[]' nas ligações pára a herança
  RETURN jsonb_build_object(
    'proprio', CASE WHEN v_pr_tem THEN jsonb_build_object('eixos', v_pr_eixos, 'ligacoes', v_pr_lig, 'orfas', v_pr_orfas) END,
    'subcategoria', CASE WHEN v_sub_id IS NOT NULL
                         THEN jsonb_build_object('id', v_sub_id, 'nome', v_sub_nome, 'eixos', v_sub_eixos, 'ligacoes', v_sub_lig) END,
    'categoria', CASE WHEN v_cat_id IS NOT NULL
                      THEN jsonb_build_object('id', v_cat_id, 'nome', v_cat_nome, 'eixos', v_cat_eixos, 'ligacoes', v_cat_lig) END,
    'efectiva', jsonb_build_object(
      'eixos', coalesce(v_pr_eixos, v_sub_eixos, v_cat_eixos),
      'eixos_origem', CASE WHEN v_pr_eixos IS NOT NULL THEN v_nivel
                           WHEN v_sub_eixos IS NOT NULL THEN 'subcategoria'
                           WHEN v_cat_eixos IS NOT NULL THEN 'categoria'
                           ELSE 'automatico' END,
      'ligacoes', coalesce(v_pr_lig, v_sub_lig, v_cat_lig),
      'ligacoes_origem', CASE WHEN v_pr_lig IS NOT NULL THEN v_nivel
                              WHEN v_sub_lig IS NOT NULL THEN 'subcategoria'
                              WHEN v_cat_lig IS NOT NULL THEN 'categoria'
                              ELSE 'automatico' END));
END $function$;

REVOKE ALL ON FUNCTION public.cat_ler_config_3d(uuid,text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cat_ler_config_3d(uuid,text,uuid) TO authenticated, service_role;
COMMENT ON FUNCTION public.cat_ler_config_3d(uuid,text,uuid) IS
  'Lê a configuração 3D de um produto ou categoria, com a herança (subcategoria, categoria) e a efectiva com a origem de cada parte. Exige products.view, services.view ou products.edit.';

-- ---- 5. Conferir: falha a migration se alguma coisa não ficou como descrito -----------------------------------
DO $conferir$
DECLARE
  r record;
  v_oid oid;
  v_n integer;
  v_def text;
  c_uuid constant text := '0f0e0d0c-0b0a-4908-8706-050403020100';
BEGIN
  -- colunas
  SELECT count(*)::integer INTO v_n FROM information_schema.columns c
  WHERE c.table_schema = 'public' AND c.table_name = 'cat_config_3d'
    AND (c.column_name::text, c.data_type::text, c.is_nullable::text) IN (
      ('id', 'uuid', 'NO'), ('organization_id', 'uuid', 'NO'), ('produto_id', 'uuid', 'YES'),
      ('categoria_id', 'uuid', 'YES'), ('eixos', 'jsonb', 'YES'), ('ligacoes', 'jsonb', 'YES'),
      ('updated_at', 'timestamp with time zone', 'NO'), ('updated_by', 'uuid', 'YES'));
  IF v_n <> 8 THEN
    RAISE EXCEPTION '%', format('Conferir: cat_config_3d tem %s de 8 colunas com o tipo e a nulidade esperados.', v_n);
  END IF;
  SELECT count(*)::integer INTO v_n FROM information_schema.columns c
  WHERE c.table_schema = 'public' AND c.table_name = 'cat_config_3d';
  IF v_n <> 8 THEN
    RAISE EXCEPTION '%', format('Conferir: cat_config_3d tem %s colunas (esperado 8).', v_n);
  END IF;

  -- CHECKs validados e UNIQUEs (::text em contype: é do tipo "char"; to_regclass só aqui, já com a tabela)
  FOR r IN SELECT * FROM (VALUES
      ('cat_config_3d_alvo_check', 'c', 'num_nonnulls'),
      ('cat_config_3d_algum_check', 'c', 'ligacoes'),
      ('cat_config_3d_forma_check', 'c', 'fn_cat_config_3d_forma'),
      ('cat_config_3d_produto_id_key', 'u', 'produto_id'),
      ('cat_config_3d_categoria_id_key', 'u', 'categoria_id')
    ) AS t(nome, tipo, agulha)
  LOOP
    v_def := NULL;
    SELECT pg_get_constraintdef(co.oid) INTO v_def FROM pg_constraint co
    WHERE co.conname = r.nome AND co.contype::text = r.tipo AND co.convalidated
      AND co.conrelid = to_regclass('public.cat_config_3d');
    IF v_def IS NULL OR position(r.agulha IN v_def) = 0 THEN
      RAISE EXCEPTION '%', format('Conferir: a restrição %s em falta ou diferente (%s).', r.nome, coalesce(v_def, 'nenhuma'));
    END IF;
  END LOOP;

  -- RLS ligada, uma só política (SELECT, authenticated, com as três permissões)
  IF NOT (SELECT c.relrowsecurity FROM pg_class c WHERE c.oid = to_regclass('public.cat_config_3d')) THEN
    RAISE EXCEPTION 'Conferir: RLS desligada em cat_config_3d.';
  END IF;
  SELECT count(*)::integer INTO v_n FROM pg_policies p
  WHERE p.schemaname = 'public' AND p.tablename = 'cat_config_3d';
  IF v_n <> 1 THEN
    RAISE EXCEPTION '%', format('Conferir: cat_config_3d tem %s políticas (esperado 1).', v_n);
  END IF;
  SELECT count(*)::integer INTO v_n FROM pg_policies p
  WHERE p.schemaname = 'public' AND p.tablename = 'cat_config_3d' AND p.policyname = 'cat_config_3d_ler'
    AND p.cmd = 'SELECT' AND p.permissive = 'PERMISSIVE' AND p.roles = ARRAY['authenticated']::name[]
    AND position('products.view' IN p.qual) > 0 AND position('services.view' IN p.qual) > 0
    AND position('products.edit' IN p.qual) > 0;
  IF v_n <> 1 THEN RAISE EXCEPTION 'Conferir: a política cat_config_3d_ler não ficou como descrito.'; END IF;

  -- privilégios: anon nada; authenticated só SELECT; nada a PUBLIC
  IF has_table_privilege('anon', 'public.cat_config_3d', 'SELECT')
     OR has_table_privilege('anon', 'public.cat_config_3d', 'INSERT')
     OR has_table_privilege('anon', 'public.cat_config_3d', 'UPDATE')
     OR has_table_privilege('anon', 'public.cat_config_3d', 'DELETE') THEN
    RAISE EXCEPTION 'Conferir: anon tem privilégios em cat_config_3d (esperado nenhum).';
  END IF;
  IF NOT has_table_privilege('authenticated', 'public.cat_config_3d', 'SELECT')
     OR has_table_privilege('authenticated', 'public.cat_config_3d', 'INSERT')
     OR has_table_privilege('authenticated', 'public.cat_config_3d', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.cat_config_3d', 'DELETE')
     OR has_table_privilege('authenticated', 'public.cat_config_3d', 'TRUNCATE')
     OR has_table_privilege('authenticated', 'public.cat_config_3d', 'REFERENCES')
     OR has_table_privilege('authenticated', 'public.cat_config_3d', 'TRIGGER') THEN
    RAISE EXCEPTION 'Conferir: authenticated em cat_config_3d não ficou só com SELECT.';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class c, aclexplode(c.relacl) x
             WHERE c.oid = to_regclass('public.cat_config_3d') AND x.grantee = 0) THEN
    RAISE EXCEPTION 'Conferir: PUBLIC tem privilégios em cat_config_3d.';
  END IF;

  -- tabela vazia
  SELECT count(*)::integer INTO v_n FROM public.cat_config_3d;
  IF v_n <> 0 THEN RAISE EXCEPTION '%', format('Conferir: cat_config_3d tem %s linhas (esperado 0).', v_n); END IF;

  -- as duas RPC: uma só versão, assinatura, resultado, SECURITY DEFINER, search_path, volatilidade e privilégios
  FOR r IN SELECT * FROM (VALUES
      ('cat_definir_config_3d', 'p_org uuid, p_alvo text, p_id uuid, p_eixos jsonb, p_ligacoes jsonb', 'v'),
      ('cat_ler_config_3d',     'p_org uuid, p_alvo text, p_id uuid',                                  's')
    ) AS t(nome, args, vol)
  LOOP
    SELECT count(*)::integer INTO v_n FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace AND p.proname = r.nome;
    IF v_n <> 1 THEN
      RAISE EXCEPTION '%', format('Conferir: %s tem %s versões (esperado 1).', r.nome, v_n);
    END IF;
    v_oid := NULL;
    SELECT p.oid INTO v_oid FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace AND p.proname = r.nome
      AND pg_get_function_identity_arguments(p.oid) = r.args
      AND pg_get_function_result(p.oid) = 'jsonb'
      AND p.prosecdef AND p.provolatile::text = r.vol
      AND p.proconfig::text = '{"search_path=public, pg_temp"}';
    IF v_oid IS NULL THEN
      RAISE EXCEPTION '%', format('Conferir: %s não tem a assinatura (%s) → jsonb, SECURITY DEFINER e search_path esperados.', r.nome, r.args);
    END IF;
    IF NOT has_function_privilege('authenticated', v_oid, 'EXECUTE')
       OR NOT has_function_privilege('service_role', v_oid, 'EXECUTE')
       OR has_function_privilege('anon', v_oid, 'EXECUTE')
       OR EXISTS (SELECT 1 FROM pg_proc p, aclexplode(p.proacl) x WHERE p.oid = v_oid AND x.grantee = 0) THEN
      RAISE EXCEPTION '%', format('Conferir: os privilégios de %s divergem (esperado EXECUTE só a authenticated e service_role, nada a anon/PUBLIC).', r.nome);
    END IF;
  END LOOP;

  -- a função de forma: pura (IMMUTABLE, sem SECURITY DEFINER, search_path pg_catalog), sem anon/PUBLIC
  v_oid := NULL;
  SELECT p.oid INTO v_oid FROM pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace AND p.proname = 'fn_cat_config_3d_forma'
    AND pg_get_function_identity_arguments(p.oid) = 'p_eixos jsonb, p_ligacoes jsonb'
    AND pg_get_function_result(p.oid) = 'boolean'
    AND NOT p.prosecdef AND p.provolatile::text = 'i'
    AND p.proconfig::text = '{search_path=pg_catalog}';
  IF v_oid IS NULL THEN
    RAISE EXCEPTION 'Conferir: fn_cat_config_3d_forma não ficou IMMUTABLE, sem SECURITY DEFINER e com search_path pg_catalog.';
  END IF;
  IF has_function_privilege('anon', v_oid, 'EXECUTE')
     OR NOT has_function_privilege('authenticated', v_oid, 'EXECUTE')
     OR EXISTS (SELECT 1 FROM pg_proc p, aclexplode(p.proacl) x WHERE p.oid = v_oid AND x.grantee = 0) THEN
    RAISE EXCEPTION 'Conferir: os privilégios de fn_cat_config_3d_forma divergem.';
  END IF;

  -- a função de forma decide como o desenho diz (casos certos e errados)
  FOR r IN SELECT * FROM (VALUES
      (NULL::jsonb, NULL::jsonb, true, 'tudo NULL'),
      ('{"largura":"comprimento","altura":"espessura","profundidade":"largura"}'::jsonb, NULL::jsonb, true, 'permutação certa'),
      ('{"largura":"largura","altura":"largura","profundidade":"espessura"}'::jsonb, NULL::jsonb, false, 'medida repetida'),
      ('{"largura":"largura","altura":"comprimento"}'::jsonb, NULL::jsonb, false, 'eixo em falta'),
      ('{"largura":"largura","altura":"comprimento","profundidade":"espessura","x":"y"}'::jsonb, NULL::jsonb, false, 'chave a mais'),
      ('[1]'::jsonb, NULL::jsonb, false, 'eixos não objecto'),
      (NULL::jsonb, '[]'::jsonb, true, 'lista vazia'),
      (NULL::jsonb, '{"a":1}'::jsonb, false, 'ligações não lista'),
      (NULL::jsonb, '[1]'::jsonb, false, 'ligação não objecto'),
      (NULL::jsonb, jsonb_build_array(jsonb_build_object('atributo', c_uuid, 'zona', 'frente', 'aplicar', true),
                                      jsonb_build_object('atributo', c_uuid, 'zona', 'tudo', 'aplicar', false)), true, 'duas zonas'),
      (NULL::jsonb, jsonb_build_array(jsonb_build_object('atributo', c_uuid, 'zona', 'frente', 'aplicar', true),
                                      jsonb_build_object('atributo', c_uuid, 'zona', 'frente', 'aplicar', false)), false, 'ligação repetida'),
      (NULL::jsonb, jsonb_build_array(jsonb_build_object('atributo', 'nao-e-uuid', 'zona', 'frente', 'aplicar', true)), false, 'uuid inválido'),
      (NULL::jsonb, jsonb_build_array(jsonb_build_object('atributo', c_uuid, 'zona', 'Frente', 'aplicar', true)), false, 'zona inválida'),
      (NULL::jsonb, jsonb_build_array(jsonb_build_object('atributo', c_uuid, 'zona', 'frente', 'aplicar', 'sim')), false, 'aplicar não boolean')
    ) AS t(eixos, ligacoes, esperado, caso)
  LOOP
    IF public.fn_cat_config_3d_forma(r.eixos, r.ligacoes) IS DISTINCT FROM r.esperado THEN
      RAISE EXCEPTION '%', format('Conferir: fn_cat_config_3d_forma falhou o caso «%s» (esperado %s).', r.caso, r.esperado);
    END IF;
  END LOOP;

  -- 61 ligações distintas e bem formadas: recusadas pelo máximo de 60
  SELECT count(*)::integer INTO v_n
  FROM (SELECT jsonb_agg(jsonb_build_object('atributo', c_uuid, 'zona', 'z' || chr(97 + g % 26) || chr(97 + g / 26),
                                            'aplicar', true)) AS l
        FROM generate_series(0, 60) AS g) x
  WHERE public.fn_cat_config_3d_forma(NULL, x.l);
  IF v_n <> 0 THEN RAISE EXCEPTION 'Conferir: fn_cat_config_3d_forma aceitou 61 ligações (máximo 60).'; END IF;
END
$conferir$;

RESET lock_timeout;
RESET statement_timeout;
