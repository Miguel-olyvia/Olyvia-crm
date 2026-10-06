-- Campos configuráveis por empresa (06/10/2026).
-- Forward-only. Não editar migrações já aplicadas.
--
-- O que muda: cada empresa adapta as fichas ao seu negócio — ficha do local,
-- diagnóstico do negócio, cliente e lead — e os nomes das coisas
-- (Cliente / Local / Obra / Negócio / Lead).
--
-- Desenho (porquê assim):
--   • Os campos "de sistema" continuam a ser COLUNAS (anew_address_building,
--     deal_needs.diag_*). O motor de planeamento das Operações e as sugestões
--     de proteções/logística leem essas colunas pelo nome — o nome da coluna
--     é o "papel" no motor. Por isso o motor NÃO muda. A empresa só pode
--     mudar-lhes o rótulo, a ajuda, os rótulos das opções, a ordem, se é
--     obrigatório e esconder (ativo = false). Valores, tipo e limites são da
--     Olyvia (mudam-se por migração, como até aqui).
--   • Os campos "da empresa" (sistema = false) são livres: tipo, opções,
--     limites, unidade, secção e condição "só aparece se…". Os valores vão
--     para jsonb e são validados por UMA função (fn_cfg_validar_valores) a
--     partir da definição — não há regras escritas à mão em dois sítios.
--   • Sem linhas em cfg_campos = a ficha de sempre (a da Mudelar). Não há
--     dados a migrar: nada muda para quem não configurar.
--
-- Onde ficam os valores dos campos da empresa:
--   • ficha do local → anew_address_extra (address_id, organization_id).
--     A ficha é da morada FÍSICA (partilhada entre clientes e empresas);
--     a chave inclui a empresa para que dois negócios não pisem os campos um
--     do outro. Tabela à parte (e não uma coluna em anew_address_building)
--     porque fn_gravar_ficha_edificio apaga a linha quando as colunas ficam
--     todas vazias.
--   • diagnóstico → deal_needs.diag_extra (nova, jsonb).
--   • cliente → anew_clients.custom_fields (já existe; "vip" fica reservado).
--   • lead → anew_leads.field_values (já existe; os formulários das campanhas
--     usam o mesmo saco — a mesma chave é o mesmo campo).
--   A gravação junta: chaves de campos ativos da empresa são substituídas;
--   tudo o resto (campos escondidos, apagados, de formulários) mantém-se.
--
-- "Obrigatório" não bloqueia a gravação (decisão da reunião de 02/10: tudo
-- opcional por agora, obrigatórios mais tarde com aviso). O ecrã avisa.
--
-- Quem configura: quem tem settings.update NA empresa
-- (current_user_has_permission_in_org). Ler: qualquer membro (RLS).
--
-- Idempotente.

SET lock_timeout = '5s';

-- ============================================================
-- 1. Tabelas de configuração
-- ============================================================
CREATE TABLE IF NOT EXISTS public.cfg_campos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.anew_organizations(id) ON DELETE CASCADE,
  ficha           text NOT NULL,
  chave           text NOT NULL,
  sistema         boolean NOT NULL DEFAULT false,
  seccao          text,
  rotulo          text,
  ajuda           text,
  tipo            text,
  opcoes          jsonb NOT NULL DEFAULT '[]'::jsonb,
  minimo          numeric,
  maximo          numeric,
  casas_decimais  integer NOT NULL DEFAULT 0,
  unidade         text,
  obrigatorio     boolean NOT NULL DEFAULT false,
  ativo           boolean NOT NULL DEFAULT true,
  ordem           integer NOT NULL DEFAULT 0,
  condicao        jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  updated_by      uuid,
  CONSTRAINT cfg_campos_unico UNIQUE (organization_id, ficha, chave),
  CONSTRAINT cfg_campos_ficha_chk CHECK (ficha IN ('local', 'diagnostico', 'cliente', 'lead')),
  CONSTRAINT cfg_campos_chave_chk CHECK (chave ~ '^[a-z][a-z0-9_]{0,39}$'),
  CONSTRAINT cfg_campos_tipo_chk CHECK (
    tipo IS NULL OR tipo IN ('sim_nao', 'escolha', 'numero', 'texto', 'texto_longo', 'data')),
  CONSTRAINT cfg_campos_tipo_obrig_chk CHECK (sistema OR tipo IS NOT NULL),
  CONSTRAINT cfg_campos_opcoes_chk CHECK (jsonb_typeof(opcoes) = 'array'),
  CONSTRAINT cfg_campos_casas_chk CHECK (casas_decimais BETWEEN 0 AND 4)
);

COMMENT ON TABLE public.cfg_campos IS
  'Campos das fichas por empresa (20261209100000). sistema = ajuste a um campo que é coluna (rótulo/ordem/esconder); senão campo da empresa, com valores em jsonb.';

CREATE INDEX IF NOT EXISTS cfg_campos_org_ficha_idx ON public.cfg_campos (organization_id, ficha, ordem);

CREATE TABLE IF NOT EXISTS public.cfg_empresa (
  organization_id uuid PRIMARY KEY REFERENCES public.anew_organizations(id) ON DELETE CASCADE,
  modelo_setor    text,
  termos          jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  updated_by      uuid,
  CONSTRAINT cfg_empresa_termos_chk CHECK (jsonb_typeof(termos) = 'object')
);

COMMENT ON TABLE public.cfg_empresa IS
  'Nomes por empresa (cliente, local, obra, negocio, lead → {singular, plural}) e o modelo de setor aplicado (20261209100000).';

ALTER TABLE public.cfg_campos  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cfg_empresa ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cfg_campos_ler ON public.cfg_campos;
CREATE POLICY cfg_campos_ler ON public.cfg_campos FOR SELECT TO authenticated
  USING (organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid())));

DROP POLICY IF EXISTS cfg_empresa_ler ON public.cfg_empresa;
CREATE POLICY cfg_empresa_ler ON public.cfg_empresa FOR SELECT TO authenticated
  USING (organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid())));

-- Escrita só pelas RPCs.
REVOKE ALL ON public.cfg_campos, public.cfg_empresa FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.cfg_campos, public.cfg_empresa TO authenticated;
GRANT ALL ON public.cfg_campos, public.cfg_empresa TO service_role;

-- ============================================================
-- 2. Onde ficam os valores
-- ============================================================
CREATE TABLE IF NOT EXISTS public.anew_address_extra (
  address_id      uuid NOT NULL REFERENCES public.anew_addresses(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.anew_organizations(id) ON DELETE CASCADE,
  valores         jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  updated_by      uuid,
  PRIMARY KEY (address_id, organization_id),
  CONSTRAINT anew_address_extra_obj_chk CHECK (jsonb_typeof(valores) = 'object')
);

COMMENT ON TABLE public.anew_address_extra IS
  'Campos da empresa na ficha do local (20261209100000). Só por RPC.';

ALTER TABLE public.anew_address_extra ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.anew_address_extra FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.anew_address_extra TO service_role;

ALTER TABLE public.deal_needs
  ADD COLUMN IF NOT EXISTS diag_extra jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.deal_needs
  DROP CONSTRAINT IF EXISTS deal_needs_diag_extra_chk;
ALTER TABLE public.deal_needs
  ADD CONSTRAINT deal_needs_diag_extra_chk CHECK (jsonb_typeof(diag_extra) = 'object');

COMMENT ON COLUMN public.deal_needs.diag_extra IS
  'Campos da empresa no diagnóstico (20261209100000). Grava-se por rpc_diag_extra_gravar.';

-- ============================================================
-- 3. Catálogo dos campos de sistema (são colunas; o nome é o papel no motor)
-- ============================================================
-- Tem de dizer o mesmo que src/lib/campos/catalogo.ts (o teste
-- catalogo.test.ts lê este ficheiro e compara).
CREATE OR REPLACE FUNCTION public.fn_cfg_chaves_sistema(p_ficha text)
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT CASE p_ficha
    WHEN 'local' THEN ARRAY[
      'acesso', 'impacto_percent', 'estacionamento', 'zona_estacionamento',
      'tem_elevador', 'n_elevadores', 'n_andares', 'n_fracoes_por_andar',
      'tipologia', 'area_util_m2', 'n_divisoes', 'n_casas_banho', 'ano_construcao',
      'pavimento', 'eletrica', 'quadro_diferencial', 'canalizacao', 'gas', 'amianto',
      'habitada_durante_obra', 'animais', 'notas_interior']
    WHEN 'diagnostico' THEN ARRAY[
      'diag_tipo_area', 'diag_m2_pavimento', 'diag_perimetro_m', 'diag_pe_direito_m',
      'diag_altura_revestimento', 'diag_pontos_agua', 'diag_pontos_eletricos',
      'diag_portas_proteger', 'diag_janela', 'diag_toalheiro', 'diag_local_cortes',
      'diag_gas', 'diag_distancia_entrada', 'diag_mobilada', 'diag_cliente_recusou_fotos']
    ELSE ARRAY[]::text[]
  END
$function$;

-- Chaves que um campo da empresa não pode usar (já têm dono).
CREATE OR REPLACE FUNCTION public.fn_cfg_chaves_reservadas(p_ficha text)
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT public.fn_cfg_chaves_sistema(p_ficha) || CASE p_ficha
    WHEN 'local' THEN ARRAY['piso', 'andar_texto', 'address_id', 'mobilada', 'distancia_entrada', 'toalheiro']
    WHEN 'diagnostico' THEN ARRAY['diag_area_m2', 'diag_demolir_descricao', 'diag_demolir_m2',
      'diag_proteger_descricao', 'diag_intervencao_tipo', 'diag_intervencao_descricao', 'diag_extra']
    WHEN 'cliente' THEN ARRAY['vip']
    WHEN 'lead' THEN ARRAY['name', 'email', 'phone', 'nif', 'notes']
    ELSE ARRAY[]::text[]
  END
$function$;

GRANT EXECUTE ON FUNCTION public.fn_cfg_chaves_sistema(text), public.fn_cfg_chaves_reservadas(text)
  TO authenticated, service_role;

-- ============================================================
-- 4. Validação dos valores a partir da definição
-- ============================================================
-- Devolve os valores limpos dos campos ATIVOS da empresa (vazios saem; um
-- campo cuja condição não se cumpre sai). Erro check_violation com o rótulo.
-- p_contexto: os valores das colunas (para condições sobre campos de sistema).
CREATE OR REPLACE FUNCTION public.fn_cfg_validar_valores(
  p_org      uuid,
  p_ficha    text,
  p_valores  jsonb,
  p_contexto jsonb DEFAULT '{}'::jsonb
)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  d       record;
  v       jsonb;
  t       text;
  n       numeric;
  r       jsonb := '{}'::jsonb;
  ctx     jsonb;
  cond_v  jsonb;
  mudou   boolean := true;
  lim     integer;
BEGIN
  IF p_valores IS NULL OR jsonb_typeof(p_valores) <> 'object' THEN
    p_valores := '{}'::jsonb;
  END IF;

  FOR d IN
    SELECT * FROM public.cfg_campos c
    WHERE c.organization_id = p_org AND c.ficha = p_ficha
      AND NOT c.sistema AND c.ativo
    ORDER BY c.ordem, c.chave
  LOOP
    v := p_valores -> d.chave;
    IF v IS NULL OR jsonb_typeof(v) = 'null'
       OR (jsonb_typeof(v) = 'string' AND btrim(v #>> '{}') = '') THEN
      CONTINUE;
    END IF;

    CASE d.tipo
      WHEN 'sim_nao' THEN
        IF jsonb_typeof(v) <> 'boolean' THEN
          RAISE EXCEPTION '%: tem de ser sim ou não', d.rotulo USING ERRCODE = 'check_violation';
        END IF;
      WHEN 'escolha' THEN
        IF jsonb_typeof(v) <> 'string' OR NOT EXISTS (
             SELECT 1 FROM jsonb_array_elements(d.opcoes) o WHERE o->>'valor' = v #>> '{}') THEN
          RAISE EXCEPTION '%: opção inválida', d.rotulo USING ERRCODE = 'check_violation';
        END IF;
      WHEN 'numero' THEN
        IF jsonb_typeof(v) = 'string' THEN
          t := replace(btrim(v #>> '{}'), ',', '.');
          IF t !~ '^-?[0-9]+(\.[0-9]+)?$' THEN
            RAISE EXCEPTION '%: tem de ser um número', d.rotulo USING ERRCODE = 'check_violation';
          END IF;
          n := t::numeric;
        ELSIF jsonb_typeof(v) = 'number' THEN
          n := (v #>> '{}')::numeric;
        ELSE
          RAISE EXCEPTION '%: tem de ser um número', d.rotulo USING ERRCODE = 'check_violation';
        END IF;
        IF n <> round(n, d.casas_decimais) THEN
          RAISE EXCEPTION '%: no máximo % casa(s) decimal(is)', d.rotulo, d.casas_decimais
            USING ERRCODE = 'check_violation';
        END IF;
        IF (d.minimo IS NOT NULL AND n < d.minimo) OR (d.maximo IS NOT NULL AND n > d.maximo) THEN
          RAISE EXCEPTION '%: tem de estar entre % e %', d.rotulo,
            COALESCE(d.minimo::text, '−∞'), COALESCE(d.maximo::text, '∞')
            USING ERRCODE = 'check_violation';
        END IF;
        v := to_jsonb(n);
      WHEN 'texto', 'texto_longo' THEN
        IF jsonb_typeof(v) <> 'string' THEN
          RAISE EXCEPTION '%: tem de ser texto', d.rotulo USING ERRCODE = 'check_violation';
        END IF;
        t := btrim(v #>> '{}');
        lim := CASE d.tipo WHEN 'texto' THEN 200 ELSE 2000 END;
        IF char_length(t) > lim THEN
          RAISE EXCEPTION '%: no máximo % caracteres', d.rotulo, lim USING ERRCODE = 'check_violation';
        END IF;
        v := to_jsonb(t);
      WHEN 'data' THEN
        IF jsonb_typeof(v) <> 'string' OR (v #>> '{}') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
          RAISE EXCEPTION '%: data inválida (AAAA-MM-DD)', d.rotulo USING ERRCODE = 'check_violation';
        END IF;
        BEGIN
          PERFORM (v #>> '{}')::date;
        EXCEPTION WHEN others THEN
          RAISE EXCEPTION '%: data inválida', d.rotulo USING ERRCODE = 'check_violation';
        END;
      ELSE
        CONTINUE;
    END CASE;

    r := r || jsonb_build_object(d.chave, v);
  END LOOP;

  -- Condições "só aparece se": tira o que deixou de fazer sentido. Repete até
  -- estabilizar (uma condição pode depender de um campo que acabou de sair).
  WHILE mudou LOOP
    mudou := false;
    ctx := COALESCE(p_contexto, '{}'::jsonb) || r;
    FOR d IN
      SELECT c.chave, c.condicao FROM public.cfg_campos c
      WHERE c.organization_id = p_org AND c.ficha = p_ficha
        AND NOT c.sistema AND c.ativo AND c.condicao IS NOT NULL
    LOOP
      IF NOT (r ? d.chave) THEN CONTINUE; END IF;
      cond_v := ctx -> (d.condicao->>'campo');
      IF cond_v IS NULL OR jsonb_typeof(cond_v) = 'null' OR NOT EXISTS (
           SELECT 1 FROM jsonb_array_elements_text(d.condicao->'valores') x
           WHERE x = (cond_v #>> '{}')) THEN
        r := r - d.chave;
        mudou := true;
      END IF;
    END LOOP;
  END LOOP;

  RETURN r;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_cfg_validar_valores(uuid, text, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_cfg_validar_valores(uuid, text, jsonb, jsonb) TO service_role;

-- Junta: tira do guardado as chaves dos campos ativos da empresa e põe as novas.
CREATE OR REPLACE FUNCTION public.fn_cfg_juntar_valores(
  p_org      uuid,
  p_ficha    text,
  p_guardado jsonb,
  p_novos    jsonb
)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT (COALESCE(p_guardado, '{}'::jsonb) - COALESCE((
            SELECT array_agg(c.chave) FROM public.cfg_campos c
            WHERE c.organization_id = p_org AND c.ficha = p_ficha AND NOT c.sistema AND c.ativo
          ), ARRAY[]::text[])) || COALESCE(p_novos, '{}'::jsonb)
$function$;

REVOKE ALL ON FUNCTION public.fn_cfg_juntar_valores(uuid, text, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_cfg_juntar_valores(uuid, text, jsonb, jsonb) TO service_role;

-- ============================================================
-- 5. Gravar a configuração
-- ============================================================
-- Substitui TODA a configuração de uma ficha da empresa (o ecrã manda a lista
-- inteira). Apagar um campo da empresa NÃO apaga os valores já guardados: se
-- voltar a ser criado com a mesma chave, reaparecem.
CREATE OR REPLACE FUNCTION public.rpc_cfg_gravar_ficha(p_org uuid, p_ficha text, p_campos jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  e         jsonb;
  o         jsonb;
  v_chave   text;
  v_sistema boolean;
  v_tipo    text;
  v_rotulo  text;
  v_chaves  text[] := ARRAY[]::text[];
  v_sist    text[];
  v_reserv  text[];
  v_ops     text[];
  v_n       integer := 0;
  v_actor   uuid := public.current_business_user_id();
BEGIN
  IF NOT public.current_user_has_permission_in_org('settings.update', p_org) THEN
    RAISE EXCEPTION 'Sem permissão para configurar os campos desta empresa'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_ficha NOT IN ('local', 'diagnostico', 'cliente', 'lead') THEN
    RAISE EXCEPTION 'Ficha desconhecida: %', p_ficha USING ERRCODE = 'check_violation';
  END IF;
  IF p_campos IS NULL OR jsonb_typeof(p_campos) <> 'array' THEN
    RAISE EXCEPTION 'Lista de campos inválida' USING ERRCODE = 'check_violation';
  END IF;
  IF jsonb_array_length(p_campos) > 200 THEN
    RAISE EXCEPTION 'No máximo 200 campos por ficha' USING ERRCODE = 'check_violation';
  END IF;

  v_sist   := public.fn_cfg_chaves_sistema(p_ficha);
  v_reserv := public.fn_cfg_chaves_reservadas(p_ficha);

  -- 1.ª passagem: chaves (para validar as condições).
  FOR e IN SELECT * FROM jsonb_array_elements(p_campos) LOOP
    v_chave := e->>'chave';
    IF v_chave IS NULL OR v_chave !~ '^[a-z][a-z0-9_]{0,39}$' THEN
      RAISE EXCEPTION 'Chave inválida: % (minúsculas, números e _; começa por letra)', COALESCE(v_chave, '(vazia)')
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_chave = ANY (v_chaves) THEN
      RAISE EXCEPTION 'Chave repetida: %', v_chave USING ERRCODE = 'check_violation';
    END IF;
    v_chaves := v_chaves || v_chave;
  END LOOP;

  DELETE FROM public.cfg_campos WHERE organization_id = p_org AND ficha = p_ficha;

  FOR e IN SELECT * FROM jsonb_array_elements(p_campos) LOOP
    v_chave   := e->>'chave';
    v_sistema := COALESCE((e->>'sistema')::boolean, false);
    v_rotulo  := NULLIF(btrim(COALESCE(e->>'rotulo', '')), '');
    v_tipo    := e->>'tipo';

    IF v_sistema AND NOT (v_chave = ANY (v_sist)) THEN
      RAISE EXCEPTION 'O campo % não é um campo de sistema desta ficha', v_chave USING ERRCODE = 'check_violation';
    END IF;
    IF NOT v_sistema AND v_chave = ANY (v_reserv) THEN
      RAISE EXCEPTION 'A chave % já está em uso pelo sistema; escolha outra', v_chave USING ERRCODE = 'check_violation';
    END IF;
    IF v_rotulo IS NOT NULL AND char_length(v_rotulo) > 80 THEN
      RAISE EXCEPTION 'Rótulo de % com mais de 80 caracteres', v_chave USING ERRCODE = 'check_violation';
    END IF;
    IF NOT v_sistema AND v_rotulo IS NULL THEN
      RAISE EXCEPTION 'O campo % precisa de um rótulo', v_chave USING ERRCODE = 'check_violation';
    END IF;
    IF char_length(COALESCE(e->>'ajuda', '')) > 200 THEN
      RAISE EXCEPTION 'Ajuda de % com mais de 200 caracteres', v_chave USING ERRCODE = 'check_violation';
    END IF;
    IF NULLIF(e->>'seccao', '') IS NOT NULL AND (e->>'seccao') !~ '^[a-z][a-z0-9_]{0,39}$' THEN
      RAISE EXCEPTION 'Secção inválida em %', v_chave USING ERRCODE = 'check_violation';
    END IF;

    -- Opções: lista de {valor, rotulo}. Nos campos de sistema só mudam rótulos.
    IF e ? 'opcoes' AND jsonb_typeof(e->'opcoes') <> 'array' THEN
      RAISE EXCEPTION 'Opções inválidas em %', v_chave USING ERRCODE = 'check_violation';
    END IF;
    v_ops := ARRAY[]::text[];
    FOR o IN SELECT * FROM jsonb_array_elements(COALESCE(e->'opcoes', '[]'::jsonb)) LOOP
      IF (o->>'valor') IS NULL OR (o->>'valor') !~ '^[a-z0-9][a-z0-9_+-]{0,39}$' THEN
        RAISE EXCEPTION 'Valor de opção inválido em %: %', v_chave, COALESCE(o->>'valor', '(vazio)')
          USING ERRCODE = 'check_violation';
      END IF;
      IF (o->>'valor') = ANY (v_ops) THEN
        RAISE EXCEPTION 'Opção repetida em %: %', v_chave, o->>'valor' USING ERRCODE = 'check_violation';
      END IF;
      IF NULLIF(btrim(COALESCE(o->>'rotulo', '')), '') IS NULL OR char_length(o->>'rotulo') > 60 THEN
        RAISE EXCEPTION 'Cada opção de % precisa de um rótulo (até 60 caracteres)', v_chave
          USING ERRCODE = 'check_violation';
      END IF;
      v_ops := v_ops || (o->>'valor');
    END LOOP;

    IF NOT v_sistema THEN
      IF v_tipo IS NULL OR v_tipo NOT IN ('sim_nao', 'escolha', 'numero', 'texto', 'texto_longo', 'data') THEN
        RAISE EXCEPTION 'Tipo inválido em %', v_chave USING ERRCODE = 'check_violation';
      END IF;
      IF v_tipo = 'escolha' AND (cardinality(v_ops) < 1 OR cardinality(v_ops) > 30) THEN
        RAISE EXCEPTION 'O campo % precisa de 1 a 30 opções', v_chave USING ERRCODE = 'check_violation';
      END IF;
      IF v_tipo <> 'escolha' AND cardinality(v_ops) > 0 THEN
        RAISE EXCEPTION 'Só os campos de escolha têm opções (%)', v_chave USING ERRCODE = 'check_violation';
      END IF;
      IF v_tipo = 'numero' AND (e->>'minimo') IS NOT NULL AND (e->>'maximo') IS NOT NULL
         AND (e->>'minimo')::numeric > (e->>'maximo')::numeric THEN
        RAISE EXCEPTION 'Em %, o mínimo é maior que o máximo', v_chave USING ERRCODE = 'check_violation';
      END IF;
    ELSE
      v_tipo := NULL;
    END IF;

    IF e->'condicao' IS NOT NULL AND jsonb_typeof(e->'condicao') <> 'null' THEN
      IF v_sistema THEN
        RAISE EXCEPTION 'Os campos de sistema já têm as suas regras (%)', v_chave USING ERRCODE = 'check_violation';
      END IF;
      IF jsonb_typeof(e->'condicao') <> 'object'
         OR NOT ((e->'condicao'->>'campo') = ANY (v_chaves || v_sist))
         OR (e->'condicao'->>'campo') = v_chave
         OR jsonb_typeof(e->'condicao'->'valores') <> 'array'
         OR jsonb_array_length(e->'condicao'->'valores') NOT BETWEEN 1 AND 30 THEN
        RAISE EXCEPTION 'Condição inválida em %', v_chave USING ERRCODE = 'check_violation';
      END IF;
    END IF;

    INSERT INTO public.cfg_campos (
      organization_id, ficha, chave, sistema, seccao, rotulo, ajuda, tipo, opcoes,
      minimo, maximo, casas_decimais, unidade, obrigatorio, ativo, ordem, condicao, updated_by)
    VALUES (
      p_org, p_ficha, v_chave, v_sistema,
      NULLIF(e->>'seccao', ''),
      v_rotulo,
      NULLIF(btrim(COALESCE(e->>'ajuda', '')), ''),
      v_tipo,
      COALESCE(e->'opcoes', '[]'::jsonb),
      CASE WHEN v_tipo = 'numero' THEN (e->>'minimo')::numeric END,
      CASE WHEN v_tipo = 'numero' THEN (e->>'maximo')::numeric END,
      CASE WHEN v_tipo = 'numero' THEN LEAST(GREATEST(COALESCE((e->>'casas_decimais')::int, 0), 0), 4) ELSE 0 END,
      CASE WHEN v_tipo = 'numero' THEN NULLIF(left(btrim(COALESCE(e->>'unidade', '')), 12), '') END,
      COALESCE((e->>'obrigatorio')::boolean, false),
      COALESCE((e->>'ativo')::boolean, true),
      COALESCE((e->>'ordem')::int, v_n),
      CASE WHEN jsonb_typeof(e->'condicao') = 'object' THEN e->'condicao' END,
      v_actor);
    v_n := v_n + 1;
  END LOOP;

  RETURN v_n;
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_cfg_gravar_ficha(uuid, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_cfg_gravar_ficha(uuid, text, jsonb) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.rpc_cfg_gravar_empresa(p_org uuid, p_modelo_setor text, p_termos jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  k text;
  v jsonb;
BEGIN
  IF NOT public.current_user_has_permission_in_org('settings.update', p_org) THEN
    RAISE EXCEPTION 'Sem permissão para configurar esta empresa' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_termos IS NULL OR jsonb_typeof(p_termos) <> 'object' THEN
    p_termos := '{}'::jsonb;
  END IF;
  FOR k, v IN SELECT * FROM jsonb_each(p_termos) LOOP
    IF k NOT IN ('cliente', 'local', 'obra', 'negocio', 'lead') THEN
      RAISE EXCEPTION 'Nome desconhecido: %', k USING ERRCODE = 'check_violation';
    END IF;
    IF jsonb_typeof(v) <> 'object'
       OR char_length(btrim(COALESCE(v->>'singular', ''))) NOT BETWEEN 1 AND 40
       OR char_length(btrim(COALESCE(v->>'plural', ''))) NOT BETWEEN 1 AND 40 THEN
      RAISE EXCEPTION 'O nome de % precisa de singular e plural (até 40 caracteres)', k
        USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;
  IF p_modelo_setor IS NOT NULL AND p_modelo_setor !~ '^[a-z][a-z0-9_]{0,39}$' THEN
    RAISE EXCEPTION 'Modelo de setor inválido' USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.cfg_empresa (organization_id, modelo_setor, termos, updated_at, updated_by)
  VALUES (p_org, p_modelo_setor, p_termos, now(), public.current_business_user_id())
  ON CONFLICT (organization_id) DO UPDATE
    SET modelo_setor = EXCLUDED.modelo_setor, termos = EXCLUDED.termos,
        updated_at = now(), updated_by = EXCLUDED.updated_by;
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_cfg_gravar_empresa(uuid, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_cfg_gravar_empresa(uuid, text, jsonb) TO authenticated, service_role;

-- ============================================================
-- 6. Ler e gravar os valores
-- ============================================================

-- 6.1 Ficha do local — por morada de entrega da entidade.
CREATE OR REPLACE FUNCTION public.rpc_local_extra_ler(p_entity_id uuid, p_org uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.fn_entity_delivery_address_access(p_entity_id, 'view') THEN
    RAISE EXCEPTION 'Sem permissão para ver as moradas deste cliente' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT (p_org IN (SELECT public.get_user_visible_org_ids(auth.uid()))) THEN
    RETURN '{}'::jsonb;
  END IF;
  RETURN COALESCE((
    SELECT jsonb_object_agg(x.address_id::text, x.valores)
    FROM public.anew_address_extra x
    WHERE x.organization_id = p_org
      AND x.address_id IN (
        SELECT ea.address_id FROM public.anew_entity_addresses ea
        WHERE ea.entity_id = p_entity_id AND ea.address_type = 'delivery'
          AND (ea.valid_to IS NULL OR ea.valid_to > now()))
  ), '{}'::jsonb);
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_local_extra_ler(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_local_extra_ler(uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.rpc_local_extra_gravar(
  p_entity_id  uuid,
  p_address_id uuid,
  p_org        uuid,
  p_valores    jsonb
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ctx  jsonb;
  v_novo jsonb;
  v_res  jsonb;
BEGIN
  -- 'add' cobre quem edita a ficha do cliente e quem cria/edita encomendas
  -- (as duas vias que gravam moradas de entrega).
  IF NOT (public.fn_entity_delivery_address_access(p_entity_id, 'edit')
          OR public.fn_entity_delivery_address_access(p_entity_id, 'add')) THEN
    RAISE EXCEPTION 'Sem permissão para alterar as moradas deste cliente' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.anew_entity_addresses ea
    WHERE ea.entity_id = p_entity_id AND ea.address_id = p_address_id
      AND ea.address_type = 'delivery' AND (ea.valid_to IS NULL OR ea.valid_to > now())) THEN
    RAISE EXCEPTION 'Morada não encontrada' USING ERRCODE = 'no_data_found';
  END IF;
  IF NOT (p_org IN (SELECT public.get_user_visible_org_ids(auth.uid()))) THEN
    RAISE EXCEPTION 'Sem acesso a esta empresa' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT COALESCE(to_jsonb(b), '{}'::jsonb) || jsonb_build_object('piso', a.floor)
    INTO v_ctx
  FROM public.anew_addresses a
  LEFT JOIN public.anew_address_building b ON b.address_id = a.id
  WHERE a.id = p_address_id;

  v_novo := public.fn_cfg_validar_valores(p_org, 'local', p_valores, COALESCE(v_ctx, '{}'::jsonb));

  INSERT INTO public.anew_address_extra AS x (address_id, organization_id, valores, updated_at, updated_by)
  VALUES (p_address_id, p_org, public.fn_cfg_juntar_valores(p_org, 'local', '{}'::jsonb, v_novo),
          now(), public.current_business_user_id())
  ON CONFLICT (address_id, organization_id) DO UPDATE
    SET valores = public.fn_cfg_juntar_valores(p_org, 'local', x.valores, v_novo),
        updated_at = now(), updated_by = EXCLUDED.updated_by
  RETURNING valores INTO v_res;

  IF v_res = '{}'::jsonb THEN
    DELETE FROM public.anew_address_extra WHERE address_id = p_address_id AND organization_id = p_org;
  END IF;
  RETURN v_res;
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_local_extra_gravar(uuid, uuid, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_local_extra_gravar(uuid, uuid, uuid, jsonb) TO authenticated, service_role;

-- 6.2 Diagnóstico — por necessidade do negócio. Ler: deal_needs.diag_extra
-- (RLS de deal_needs, como os outros diag_*).
CREATE OR REPLACE FUNCTION public.rpc_diag_extra_gravar(p_need_id uuid, p_valores jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_org  uuid;
  v_need jsonb;
  v_novo jsonb;
  v_res  jsonb;
BEGIN
  SELECT d.organization_id, to_jsonb(n) INTO v_org, v_need
  FROM public.deal_needs n
  JOIN public.deals d ON d.id = n.deal_id
  WHERE n.id = p_need_id;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Necessidade não encontrada' USING ERRCODE = 'no_data_found';
  END IF;
  -- A mesma verificação de rpc_update_deal_needs.
  IF NOT public.fn_deal_org_in_scope(v_org) THEN
    RAISE EXCEPTION 'Sem permissão para alterar este negócio' USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_novo := public.fn_cfg_validar_valores(v_org, 'diagnostico', p_valores, v_need);

  UPDATE public.deal_needs n
     SET diag_extra = public.fn_cfg_juntar_valores(v_org, 'diagnostico', n.diag_extra, v_novo)
   WHERE n.id = p_need_id
  RETURNING diag_extra INTO v_res;
  RETURN v_res;
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_diag_extra_gravar(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_diag_extra_gravar(uuid, jsonb) TO authenticated, service_role;

-- 6.3 Cliente — anew_clients.custom_fields (o "vip" e o resto mantêm-se).
CREATE OR REPLACE FUNCTION public.rpc_cliente_extra_gravar(p_client_id uuid, p_valores jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_org  uuid;
  v_novo jsonb;
  v_res  jsonb;
BEGIN
  SELECT c.organization_id INTO v_org
  FROM public.anew_clients c
  WHERE c.id = p_client_id AND c.deleted_at IS NULL;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Cliente não encontrado' USING ERRCODE = 'no_data_found';
  END IF;
  IF NOT (public.fn_deal_org_in_scope(v_org)
          AND public.has_anew_permission(auth.uid(), 'clients.edit')) THEN
    RAISE EXCEPTION 'Sem permissão para alterar este cliente' USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_novo := public.fn_cfg_validar_valores(v_org, 'cliente', p_valores,
              (SELECT COALESCE(c.custom_fields, '{}'::jsonb) FROM public.anew_clients c WHERE c.id = p_client_id));

  UPDATE public.anew_clients c
     SET custom_fields = public.fn_cfg_juntar_valores(v_org, 'cliente', c.custom_fields, v_novo)
   WHERE c.id = p_client_id
  RETURNING custom_fields INTO v_res;
  RETURN v_res;
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_cliente_extra_gravar(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_cliente_extra_gravar(uuid, jsonb) TO authenticated, service_role;

-- 6.4 Lead — anew_leads.field_values (os campos dos formulários mantêm-se).
CREATE OR REPLACE FUNCTION public.rpc_lead_extra_gravar(p_lead_id uuid, p_valores jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_org  uuid;
  v_root uuid;
  v_novo jsonb;
  v_res  jsonb;
BEGIN
  SELECT l.organization_id, l.root_organization_id INTO v_org, v_root
  FROM public.anew_leads l
  WHERE l.id = p_lead_id;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Lead não encontrada' USING ERRCODE = 'no_data_found';
  END IF;
  IF NOT (public.fn_lead_org_in_scope(v_org, v_root)
          AND public.has_anew_permission(auth.uid(), 'leads.edit')) THEN
    RAISE EXCEPTION 'Sem permissão para alterar esta lead' USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_novo := public.fn_cfg_validar_valores(v_org, 'lead', p_valores,
              (SELECT COALESCE(l.field_values, '{}'::jsonb) FROM public.anew_leads l WHERE l.id = p_lead_id));

  UPDATE public.anew_leads l
     SET field_values = public.fn_cfg_juntar_valores(v_org, 'lead', l.field_values, v_novo)
   WHERE l.id = p_lead_id
  RETURNING field_values INTO v_res;
  RETURN v_res;
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_lead_extra_gravar(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_lead_extra_gravar(uuid, jsonb) TO authenticated, service_role;

-- ============================================================
-- CONFERIR
-- ============================================================
DO $$
DECLARE
  v_n int;
BEGIN
  SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace s ON s.oid = p.pronamespace
  WHERE s.nspname = 'public' AND p.proname IN (
    'fn_cfg_chaves_sistema', 'fn_cfg_chaves_reservadas', 'fn_cfg_validar_valores', 'fn_cfg_juntar_valores',
    'rpc_cfg_gravar_ficha', 'rpc_cfg_gravar_empresa', 'rpc_local_extra_ler', 'rpc_local_extra_gravar',
    'rpc_diag_extra_gravar', 'rpc_cliente_extra_gravar', 'rpc_lead_extra_gravar');
  IF v_n <> 11 THEN
    RAISE EXCEPTION 'CONFERIR: esperava 11 funções (uma de cada), há %', v_n;
  END IF;

  IF cardinality(public.fn_cfg_chaves_sistema('local')) <> 22
     OR cardinality(public.fn_cfg_chaves_sistema('diagnostico')) <> 15 THEN
    RAISE EXCEPTION 'CONFERIR: catálogo de sistema com tamanho inesperado';
  END IF;

  -- As chaves de sistema do diagnóstico têm de ser colunas de deal_needs.
  SELECT count(*) INTO v_n
  FROM unnest(public.fn_cfg_chaves_sistema('diagnostico')) k
  WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns c
                    WHERE c.table_schema = 'public' AND c.table_name = 'deal_needs' AND c.column_name = k);
  IF v_n > 0 THEN
    RAISE EXCEPTION 'CONFERIR: % chave(s) de sistema do diagnóstico não são colunas de deal_needs', v_n;
  END IF;

  SELECT count(*) INTO v_n
  FROM unnest(public.fn_cfg_chaves_sistema('local')) k
  WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns c
                    WHERE c.table_schema = 'public' AND c.table_name = 'anew_address_building' AND c.column_name = k);
  IF v_n > 0 THEN
    RAISE EXCEPTION 'CONFERIR: % chave(s) de sistema do local não são colunas de anew_address_building', v_n;
  END IF;

  IF has_table_privilege('authenticated', 'public.cfg_campos', 'INSERT')
     OR has_table_privilege('authenticated', 'public.anew_address_extra', 'SELECT') THEN
    RAISE EXCEPTION 'CONFERIR: permissões de tabela demasiado largas';
  END IF;

  RAISE NOTICE 'CONFERIR: campos configuráveis OK';
END $$;
