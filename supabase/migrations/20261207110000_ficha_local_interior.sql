-- "Ficha do local" das moradas de entrega: à ficha técnica do edifício
-- (20261206160000 — passa a ser a secção EXTERIOR: acessos, estacionamento,
-- elevador, andares, frações) junta-se a secção INTERIOR (a casa).
-- Forward-only. Não editar migrações já aplicadas.
--
-- Onde fica o interior: colunas novas na MESMA tabela anew_address_building.
--   • A ficha é 1:1 com anew_addresses, e uma linha de anew_addresses é a
--     morada física completa — rua, número, ANDAR e FRAÇÃO (fazem parte do
--     address_key). O 2.º Esq e o 3.º Dto do mesmo prédio são linhas
--     diferentes, por isso a linha já identifica a casa e o interior cabe aí.
--   • Uma tabela à parte (anew_address_interior) daria outro LEFT JOIN, outra
--     regra de "apagar quando vazia" e outro par de funções internas, sem
--     ganho: as duas secções leem-se e gravam-se sempre juntas (mesmo
--     formulário, mesmas RPCs).
--   • Custo assumido: o exterior repete-se em cada fração do prédio (já era
--     assim antes desta migração).
--
-- 1. anew_address_building: 14 colunas novas (todas opcionais) + CHECKs.
-- 2. fn_validar_ficha_edificio / fn_gravar_ficha_edificio: recriadas com o
--    interior (DROP das assinaturas anteriores — são internas, só as RPCs
--    abaixo as chamam). fn_validar passa de IMMUTABLE a STABLE (o ano de
--    construção compara com o ano atual). fn_gravar grava por secção: uma
--    secção que não é para gravar mantém o que lá está.
-- 3. rpc_list_entity_delivery_addresses devolve também o interior (muda o
--    tipo de retorno => DROP + CREATE; nenhuma view/função SQL depende dela —
--    só o frontend e um comentário de 20261207100000).
-- 4. rpc_add_entity_delivery_address: 14 parâmetros novos no FIM, todos
--    DEFAULT NULL. Cada secção só é gravada quando vem com algum dado (como
--    antes: tudo NULL = não mexe na ficha de uma morada reutilizada).
-- 5. rpc_update_entity_delivery_address: os mesmos 14 + p_com_interior
--    boolean DEFAULT NULL no FIM. O exterior é substituído como antes (tudo
--    NULL = apagar). O interior só é substituído com p_com_interior = true ou
--    quando vem algum campo do interior: as chamadas antigas (frontend em
--    cache, sem os campos novos) continuam a funcionar e NÃO apagam o
--    interior gravado.
-- Chamadas com os parâmetros de hoje (por nome, via PostgREST) continuam a
-- resolver: os nomes e a ordem dos parâmetros antigos não mudam e os novos
-- têm DEFAULT. As assinaturas antigas são apagadas antes do CREATE (senão
-- ficariam duas sobrecargas e o PostgREST não as distingue). Grants/REVOKE/
-- COMMENT repostos como estavam (anon sem EXECUTE; internas só service_role).
-- No fim, um bloco CONFERIR verifica sobrecargas, permissões, parâmetros e
-- algumas regras.
--
-- Idempotente: ADD COLUMN IF NOT EXISTS, DROP CONSTRAINT IF EXISTS + ADD,
-- DROP FUNCTION IF EXISTS + CREATE OR REPLACE, REVOKE/GRANT.

SET lock_timeout = '5s';

-- ============================================================
-- 1. Colunas do interior + CHECKs
-- ============================================================
ALTER TABLE public.anew_address_building
  ADD COLUMN IF NOT EXISTS tipologia             text,
  ADD COLUMN IF NOT EXISTS area_util_m2          numeric(7,2),
  ADD COLUMN IF NOT EXISTS n_divisoes            integer,
  ADD COLUMN IF NOT EXISTS n_casas_banho         integer,
  ADD COLUMN IF NOT EXISTS ano_construcao        integer,
  ADD COLUMN IF NOT EXISTS pavimento             text,
  ADD COLUMN IF NOT EXISTS eletrica              text,
  ADD COLUMN IF NOT EXISTS quadro_diferencial    boolean,
  ADD COLUMN IF NOT EXISTS canalizacao           text,
  ADD COLUMN IF NOT EXISTS gas                   text,
  ADD COLUMN IF NOT EXISTS amianto               text,
  ADD COLUMN IF NOT EXISTS habitada_durante_obra boolean,
  ADD COLUMN IF NOT EXISTS animais               boolean,
  ADD COLUMN IF NOT EXISTS notas_interior        text;

ALTER TABLE public.anew_address_building
  DROP CONSTRAINT IF EXISTS anew_address_building_tipologia_chk,
  DROP CONSTRAINT IF EXISTS anew_address_building_area_chk,
  DROP CONSTRAINT IF EXISTS anew_address_building_divisoes_chk,
  DROP CONSTRAINT IF EXISTS anew_address_building_casas_banho_chk,
  DROP CONSTRAINT IF EXISTS anew_address_building_ano_chk,
  DROP CONSTRAINT IF EXISTS anew_address_building_pavimento_chk,
  DROP CONSTRAINT IF EXISTS anew_address_building_eletrica_chk,
  DROP CONSTRAINT IF EXISTS anew_address_building_canalizacao_chk,
  DROP CONSTRAINT IF EXISTS anew_address_building_gas_chk,
  DROP CONSTRAINT IF EXISTS anew_address_building_amianto_chk,
  DROP CONSTRAINT IF EXISTS anew_address_building_notas_chk;

ALTER TABLE public.anew_address_building
  ADD CONSTRAINT anew_address_building_tipologia_chk
    CHECK (tipologia IS NULL OR tipologia IN ('T0', 'T1', 'T2', 'T3', 'T4', 'T5+')),
  ADD CONSTRAINT anew_address_building_area_chk
    CHECK (area_util_m2 IS NULL OR (area_util_m2 > 0 AND area_util_m2 <= 10000)),
  ADD CONSTRAINT anew_address_building_divisoes_chk
    CHECK (n_divisoes IS NULL OR n_divisoes BETWEEN 0 AND 100),
  ADD CONSTRAINT anew_address_building_casas_banho_chk
    CHECK (n_casas_banho IS NULL OR n_casas_banho BETWEEN 0 AND 50),
  -- O limite de cima é o ano atual. current_date num CHECK só é avaliado ao
  -- gravar a linha; como o limite só sobe com o tempo, uma linha válida nunca
  -- deixa de o ser (um restore não falha).
  ADD CONSTRAINT anew_address_building_ano_chk
    CHECK (ano_construcao IS NULL OR ano_construcao BETWEEN 1800 AND extract(year FROM current_date)::integer),
  ADD CONSTRAINT anew_address_building_pavimento_chk
    CHECK (pavimento IS NULL OR pavimento IN ('ceramico', 'madeira', 'flutuante', 'vinilico', 'outro')),
  ADD CONSTRAINT anew_address_building_eletrica_chk
    CHECK (eletrica IS NULL OR eletrica IN ('antiga', 'renovada')),
  ADD CONSTRAINT anew_address_building_canalizacao_chk
    CHECK (canalizacao IS NULL OR canalizacao IN ('ferro', 'pvc', 'multicamada', 'cobre', 'misto', 'nao_sei')),
  ADD CONSTRAINT anew_address_building_gas_chk
    CHECK (gas IS NULL OR gas IN ('canalizado', 'garrafa', 'sem')),
  ADD CONSTRAINT anew_address_building_amianto_chk
    CHECK (amianto IS NULL OR amianto IN ('sim', 'nao', 'nao_sei')),
  ADD CONSTRAINT anew_address_building_notas_chk
    CHECK (notas_interior IS NULL OR char_length(notas_interior) BETWEEN 1 AND 2000);

COMMENT ON TABLE public.anew_address_building IS
  'Ficha do local de uma morada (1:1 com anew_addresses; usada nas moradas de entrega). Exterior — edifício e acessos (20261206160000; o piso é anew_addresses.floor) — e Interior — a casa (20261207110000). Escrita só por rpc_add/rpc_update_entity_delivery_address.';
COMMENT ON COLUMN public.anew_address_building.tipologia IS 'Interior: T0, T1, T2, T3, T4 ou T5+.';
COMMENT ON COLUMN public.anew_address_building.area_util_m2 IS 'Interior: área útil em m² (> 0 e ≤ 10000).';
COMMENT ON COLUMN public.anew_address_building.ano_construcao IS 'Interior: ano de construção (1800 até ao ano atual).';
COMMENT ON COLUMN public.anew_address_building.habitada_durante_obra IS 'Interior: a casa continua habitada durante o serviço.';
COMMENT ON COLUMN public.anew_address_building.notas_interior IS 'Interior: notas livres (até 2000 caracteres).';

-- ============================================================
-- 2. Validação e gravação (internas)
-- ============================================================
DROP FUNCTION IF EXISTS public.fn_validar_ficha_edificio(text, text, integer, text, text, boolean, integer, integer, integer);
DROP FUNCTION IF EXISTS public.fn_gravar_ficha_edificio(uuid, uuid, text, integer, text, text, boolean, integer, integer, integer);

-- ─── Validação da ficha do local (RAISE em PT) ───────────────────────────────
-- Mesmas regras e mensagens que validarFichaTecnica() em
-- src/lib/addresses/fichaTecnicaEdificio.ts. Os booleanos do interior não
-- precisam de validação e não entram. STABLE por causa do ano atual.
CREATE OR REPLACE FUNCTION public.fn_validar_ficha_edificio(
  p_floor               text,
  p_acesso              text,
  p_impacto_percent     integer,
  p_estacionamento      text,
  p_zona_estacionamento text,
  p_tem_elevador        boolean,
  p_n_elevadores        integer,
  p_n_andares           integer,
  p_n_fracoes_por_andar integer,
  p_tipologia           text,
  p_area_util_m2        numeric,
  p_n_divisoes          integer,
  p_n_casas_banho       integer,
  p_ano_construcao      integer,
  p_pavimento           text,
  p_eletrica            text,
  p_canalizacao         text,
  p_gas                 text,
  p_amianto             text,
  p_notas_interior      text
)
RETURNS void
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_piso integer;
BEGIN
  -- ─── Exterior (igual a 20261206160000) ───
  IF p_acesso IS NOT NULL AND p_acesso NOT IN ('facil', 'dificil') THEN
    RAISE EXCEPTION 'Acesso inválido (fácil ou difícil)' USING ERRCODE = 'check_violation';
  END IF;
  IF p_impacto_percent IS NOT NULL AND p_impacto_percent NOT BETWEEN 0 AND 100 THEN
    RAISE EXCEPTION 'O impacto tem de ser um número inteiro entre 0 e 100' USING ERRCODE = 'check_violation';
  END IF;
  IF p_impacto_percent IS NOT NULL AND p_acesso IS DISTINCT FROM 'dificil' THEN
    RAISE EXCEPTION 'O impacto só se indica com acesso difícil' USING ERRCODE = 'check_violation';
  END IF;
  IF p_estacionamento IS NOT NULL AND p_estacionamento NOT IN ('pago', 'nao_pago', 'sem_estacionamento') THEN
    RAISE EXCEPTION 'Estacionamento inválido' USING ERRCODE = 'check_violation';
  END IF;
  IF p_zona_estacionamento IS NOT NULL AND p_zona_estacionamento NOT IN ('verde', 'amarela', 'vermelha') THEN
    RAISE EXCEPTION 'Zona de estacionamento inválida' USING ERRCODE = 'check_violation';
  END IF;
  IF p_zona_estacionamento IS NOT NULL AND p_estacionamento IS DISTINCT FROM 'pago' AND p_estacionamento IS DISTINCT FROM 'nao_pago' THEN
    RAISE EXCEPTION 'A zona só se indica quando há estacionamento' USING ERRCODE = 'check_violation';
  END IF;
  IF p_n_elevadores IS NOT NULL AND p_n_elevadores NOT BETWEEN 1 AND 50 THEN
    RAISE EXCEPTION 'O número de elevadores tem de ser um número inteiro entre 1 e 50' USING ERRCODE = 'check_violation';
  END IF;
  IF p_n_elevadores IS NOT NULL AND p_tem_elevador IS NOT TRUE THEN
    RAISE EXCEPTION 'O número de elevadores só se indica quando há elevador' USING ERRCODE = 'check_violation';
  END IF;
  IF p_n_andares IS NOT NULL AND p_n_andares NOT BETWEEN 0 AND 200 THEN
    RAISE EXCEPTION 'O número de andares tem de ser um número inteiro entre 0 e 200' USING ERRCODE = 'check_violation';
  END IF;
  IF p_n_fracoes_por_andar IS NOT NULL AND p_n_fracoes_por_andar NOT BETWEEN 0 AND 200 THEN
    RAISE EXCEPTION 'O número de frações por andar tem de ser um número inteiro entre 0 e 200' USING ERRCODE = 'check_violation';
  END IF;
  v_piso := public.fn_piso_numerico(p_floor);
  IF v_piso IS NOT NULL AND p_n_andares IS NOT NULL AND v_piso > p_n_andares THEN
    RAISE EXCEPTION 'O piso não pode ser acima do número de andares do edifício' USING ERRCODE = 'check_violation';
  END IF;

  -- ─── Interior ───
  IF p_tipologia IS NOT NULL AND p_tipologia NOT IN ('T0', 'T1', 'T2', 'T3', 'T4', 'T5+') THEN
    RAISE EXCEPTION 'Tipologia inválida (T0 a T5+)' USING ERRCODE = 'check_violation';
  END IF;
  IF p_area_util_m2 IS NOT NULL
     AND (p_area_util_m2 <= 0 OR p_area_util_m2 > 10000 OR p_area_util_m2 <> round(p_area_util_m2, 2)) THEN
    RAISE EXCEPTION 'A área útil tem de ser maior que 0 e até 10000 m² (no máximo 2 casas decimais)' USING ERRCODE = 'check_violation';
  END IF;
  IF p_n_divisoes IS NOT NULL AND p_n_divisoes NOT BETWEEN 0 AND 100 THEN
    RAISE EXCEPTION 'O número de divisões tem de ser um número inteiro entre 0 e 100' USING ERRCODE = 'check_violation';
  END IF;
  IF p_n_casas_banho IS NOT NULL AND p_n_casas_banho NOT BETWEEN 0 AND 50 THEN
    RAISE EXCEPTION 'O número de casas de banho tem de ser um número inteiro entre 0 e 50' USING ERRCODE = 'check_violation';
  END IF;
  IF p_ano_construcao IS NOT NULL
     AND p_ano_construcao NOT BETWEEN 1800 AND extract(year FROM current_date)::integer THEN
    RAISE EXCEPTION 'O ano de construção tem de ser um ano entre 1800 e o ano atual' USING ERRCODE = 'check_violation';
  END IF;
  IF p_pavimento IS NOT NULL AND p_pavimento NOT IN ('ceramico', 'madeira', 'flutuante', 'vinilico', 'outro') THEN
    RAISE EXCEPTION 'Pavimento inválido' USING ERRCODE = 'check_violation';
  END IF;
  IF p_eletrica IS NOT NULL AND p_eletrica NOT IN ('antiga', 'renovada') THEN
    RAISE EXCEPTION 'Instalação elétrica inválida (antiga ou renovada)' USING ERRCODE = 'check_violation';
  END IF;
  IF p_canalizacao IS NOT NULL AND p_canalizacao NOT IN ('ferro', 'pvc', 'multicamada', 'cobre', 'misto', 'nao_sei') THEN
    RAISE EXCEPTION 'Canalização inválida' USING ERRCODE = 'check_violation';
  END IF;
  IF p_gas IS NOT NULL AND p_gas NOT IN ('canalizado', 'garrafa', 'sem') THEN
    RAISE EXCEPTION 'Gás inválido (canalizado, garrafa ou sem gás)' USING ERRCODE = 'check_violation';
  END IF;
  IF p_amianto IS NOT NULL AND p_amianto NOT IN ('sim', 'nao', 'nao_sei') THEN
    RAISE EXCEPTION 'Amianto inválido (sim, não ou não sei)' USING ERRCODE = 'check_violation';
  END IF;
  IF p_notas_interior IS NOT NULL AND char_length(btrim(p_notas_interior)) > 2000 THEN
    RAISE EXCEPTION 'As notas do interior têm no máximo 2000 caracteres' USING ERRCODE = 'check_violation';
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_validar_ficha_edificio(text, text, integer, text, text, boolean, integer, integer, integer, text, numeric, integer, integer, integer, text, text, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_validar_ficha_edificio(text, text, integer, text, text, boolean, integer, integer, integer, text, numeric, integer, integer, integer, text, text, text, text, text, text) TO service_role;

-- ─── Gravar a ficha por secção ───────────────────────────────────────────────
-- Interna. p_gravar_exterior / p_gravar_interior dizem que secções se
-- substituem pelo enviado (NULL apaga o campo); a outra secção fica como está.
-- Se a linha ficar toda a NULL, é apagada. As notas gravam-se sem espaços nas
-- pontas ('' = NULL).
CREATE OR REPLACE FUNCTION public.fn_gravar_ficha_edificio(
  p_address_id            uuid,
  p_actor                 uuid,
  p_gravar_exterior       boolean,
  p_acesso                text,
  p_impacto_percent       integer,
  p_estacionamento        text,
  p_zona_estacionamento   text,
  p_tem_elevador          boolean,
  p_n_elevadores          integer,
  p_n_andares             integer,
  p_n_fracoes_por_andar   integer,
  p_gravar_interior       boolean,
  p_tipologia             text,
  p_area_util_m2          numeric,
  p_n_divisoes            integer,
  p_n_casas_banho         integer,
  p_ano_construcao        integer,
  p_pavimento             text,
  p_eletrica              text,
  p_quadro_diferencial    boolean,
  p_canalizacao           text,
  p_gas                   text,
  p_amianto               text,
  p_habitada_durante_obra boolean,
  p_animais               boolean,
  p_notas_interior        text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_ext   boolean := COALESCE(p_gravar_exterior, false);
  v_int   boolean := COALESCE(p_gravar_interior, false);
  v_notas text    := nullif(btrim(COALESCE(p_notas_interior, '')), '');
BEGIN
  IF NOT v_ext AND NOT v_int THEN
    RETURN;
  END IF;

  INSERT INTO public.anew_address_building AS b (
    address_id,
    acesso, impacto_percent, estacionamento, zona_estacionamento,
    tem_elevador, n_elevadores, n_andares, n_fracoes_por_andar,
    tipologia, area_util_m2, n_divisoes, n_casas_banho, ano_construcao, pavimento,
    eletrica, quadro_diferencial, canalizacao, gas, amianto, habitada_durante_obra,
    animais, notas_interior,
    created_by, updated_by
  ) VALUES (
    p_address_id,
    CASE WHEN v_ext THEN p_acesso END,
    CASE WHEN v_ext THEN p_impacto_percent END,
    CASE WHEN v_ext THEN p_estacionamento END,
    CASE WHEN v_ext THEN p_zona_estacionamento END,
    CASE WHEN v_ext THEN p_tem_elevador END,
    CASE WHEN v_ext THEN p_n_elevadores END,
    CASE WHEN v_ext THEN p_n_andares END,
    CASE WHEN v_ext THEN p_n_fracoes_por_andar END,
    CASE WHEN v_int THEN p_tipologia END,
    CASE WHEN v_int THEN p_area_util_m2 END,
    CASE WHEN v_int THEN p_n_divisoes END,
    CASE WHEN v_int THEN p_n_casas_banho END,
    CASE WHEN v_int THEN p_ano_construcao END,
    CASE WHEN v_int THEN p_pavimento END,
    CASE WHEN v_int THEN p_eletrica END,
    CASE WHEN v_int THEN p_quadro_diferencial END,
    CASE WHEN v_int THEN p_canalizacao END,
    CASE WHEN v_int THEN p_gas END,
    CASE WHEN v_int THEN p_amianto END,
    CASE WHEN v_int THEN p_habitada_durante_obra END,
    CASE WHEN v_int THEN p_animais END,
    CASE WHEN v_int THEN v_notas END,
    p_actor, p_actor
  )
  ON CONFLICT (address_id) DO UPDATE SET
    acesso                = CASE WHEN v_ext THEN EXCLUDED.acesso                ELSE b.acesso END,
    impacto_percent       = CASE WHEN v_ext THEN EXCLUDED.impacto_percent       ELSE b.impacto_percent END,
    estacionamento        = CASE WHEN v_ext THEN EXCLUDED.estacionamento        ELSE b.estacionamento END,
    zona_estacionamento   = CASE WHEN v_ext THEN EXCLUDED.zona_estacionamento   ELSE b.zona_estacionamento END,
    tem_elevador          = CASE WHEN v_ext THEN EXCLUDED.tem_elevador          ELSE b.tem_elevador END,
    n_elevadores          = CASE WHEN v_ext THEN EXCLUDED.n_elevadores          ELSE b.n_elevadores END,
    n_andares             = CASE WHEN v_ext THEN EXCLUDED.n_andares             ELSE b.n_andares END,
    n_fracoes_por_andar   = CASE WHEN v_ext THEN EXCLUDED.n_fracoes_por_andar   ELSE b.n_fracoes_por_andar END,
    tipologia             = CASE WHEN v_int THEN EXCLUDED.tipologia             ELSE b.tipologia END,
    area_util_m2          = CASE WHEN v_int THEN EXCLUDED.area_util_m2          ELSE b.area_util_m2 END,
    n_divisoes            = CASE WHEN v_int THEN EXCLUDED.n_divisoes            ELSE b.n_divisoes END,
    n_casas_banho         = CASE WHEN v_int THEN EXCLUDED.n_casas_banho         ELSE b.n_casas_banho END,
    ano_construcao        = CASE WHEN v_int THEN EXCLUDED.ano_construcao        ELSE b.ano_construcao END,
    pavimento             = CASE WHEN v_int THEN EXCLUDED.pavimento             ELSE b.pavimento END,
    eletrica              = CASE WHEN v_int THEN EXCLUDED.eletrica              ELSE b.eletrica END,
    quadro_diferencial    = CASE WHEN v_int THEN EXCLUDED.quadro_diferencial    ELSE b.quadro_diferencial END,
    canalizacao           = CASE WHEN v_int THEN EXCLUDED.canalizacao           ELSE b.canalizacao END,
    gas                   = CASE WHEN v_int THEN EXCLUDED.gas                   ELSE b.gas END,
    amianto               = CASE WHEN v_int THEN EXCLUDED.amianto               ELSE b.amianto END,
    habitada_durante_obra = CASE WHEN v_int THEN EXCLUDED.habitada_durante_obra ELSE b.habitada_durante_obra END,
    animais               = CASE WHEN v_int THEN EXCLUDED.animais               ELSE b.animais END,
    notas_interior        = CASE WHEN v_int THEN EXCLUDED.notas_interior        ELSE b.notas_interior END,
    updated_at            = now(),
    updated_by            = EXCLUDED.updated_by;

  -- Ficha toda vazia => sem linha (como antes: tudo NULL = apagar).
  DELETE FROM public.anew_address_building b
  WHERE b.address_id = p_address_id
    AND b.acesso IS NULL AND b.impacto_percent IS NULL AND b.estacionamento IS NULL
    AND b.zona_estacionamento IS NULL AND b.tem_elevador IS NULL AND b.n_elevadores IS NULL
    AND b.n_andares IS NULL AND b.n_fracoes_por_andar IS NULL
    AND b.tipologia IS NULL AND b.area_util_m2 IS NULL AND b.n_divisoes IS NULL
    AND b.n_casas_banho IS NULL AND b.ano_construcao IS NULL AND b.pavimento IS NULL
    AND b.eletrica IS NULL AND b.quadro_diferencial IS NULL AND b.canalizacao IS NULL
    AND b.gas IS NULL AND b.amianto IS NULL AND b.habitada_durante_obra IS NULL
    AND b.animais IS NULL AND b.notas_interior IS NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_gravar_ficha_edificio(uuid, uuid, boolean, text, integer, text, text, boolean, integer, integer, integer, boolean, text, numeric, integer, integer, integer, text, text, boolean, text, text, text, boolean, boolean, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_gravar_ficha_edificio(uuid, uuid, boolean, text, integer, text, text, boolean, integer, integer, integer, boolean, text, numeric, integer, integer, integer, text, text, boolean, text, text, text, boolean, boolean, text) TO service_role;

-- ============================================================
-- 3. rpc_list_entity_delivery_addresses — devolve também o interior
-- ============================================================
-- Muda o tipo de retorno => DROP + CREATE + GRANTs reaplicados. Resto igual
-- a 20261206160000 (colunas novas no fim).
DROP FUNCTION IF EXISTS public.rpc_list_entity_delivery_addresses(uuid);

CREATE OR REPLACE FUNCTION public.rpc_list_entity_delivery_addresses(p_entity_id uuid)
RETURNS TABLE(
  entity_address_id     uuid,
  address_id            uuid,
  street                text,
  number                text,
  floor                 text,
  unit                  text,
  postal_code           text,
  city                  text,
  formatted             text,
  created_at            timestamptz,
  has_building          boolean,
  acesso                text,
  impacto_percent       integer,
  estacionamento        text,
  zona_estacionamento   text,
  tem_elevador          boolean,
  n_elevadores          integer,
  n_andares             integer,
  n_fracoes_por_andar   integer,
  tipologia             text,
  area_util_m2          numeric,
  n_divisoes            integer,
  n_casas_banho         integer,
  ano_construcao        integer,
  pavimento             text,
  eletrica              text,
  quadro_diferencial    boolean,
  canalizacao           text,
  gas                   text,
  amianto               text,
  habitada_durante_obra boolean,
  animais               boolean,
  notas_interior        text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF p_entity_id IS NULL THEN
    RAISE EXCEPTION 'entity_id é obrigatório' USING ERRCODE = 'check_violation';
  END IF;

  IF NOT public.fn_entity_delivery_address_access(p_entity_id, 'view') THEN
    RAISE EXCEPTION 'Sem permissão para ver as moradas deste cliente' USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  SELECT
    ea.id,
    a.id,
    a.street,
    a.number,
    a.floor,
    a.unit,
    a.postal_code,
    a.city,
    nullif(concat_ws(', ',
      nullif(btrim(a.street), ''),
      nullif(btrim(a.number), ''),
      nullif(btrim(a.postal_code), ''),
      nullif(btrim(a.city), '')
    ), ''),
    ea.created_at,
    (b.address_id IS NOT NULL),
    b.acesso,
    b.impacto_percent,
    b.estacionamento,
    b.zona_estacionamento,
    b.tem_elevador,
    b.n_elevadores,
    b.n_andares,
    b.n_fracoes_por_andar,
    b.tipologia,
    b.area_util_m2,
    b.n_divisoes,
    b.n_casas_banho,
    b.ano_construcao,
    b.pavimento,
    b.eletrica,
    b.quadro_diferencial,
    b.canalizacao,
    b.gas,
    b.amianto,
    b.habitada_durante_obra,
    b.animais,
    b.notas_interior
  FROM public.anew_entity_addresses ea
  JOIN public.anew_addresses a ON a.id = ea.address_id
  LEFT JOIN public.anew_address_building b ON b.address_id = a.id
  WHERE ea.entity_id = p_entity_id
    AND ea.address_type = 'delivery'
    AND (ea.valid_to IS NULL OR ea.valid_to > now())
  ORDER BY ea.created_at, ea.id;
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_list_entity_delivery_addresses(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_list_entity_delivery_addresses(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_list_entity_delivery_addresses(uuid) TO authenticated;

COMMENT ON FUNCTION public.rpc_list_entity_delivery_addresses(uuid) IS
  'Moradas de entrega ativas de uma entidade, com a ficha do local (exterior + interior, 20261207110000). has_building = há ficha.';

-- ============================================================
-- 4. rpc_add_entity_delivery_address — aceita o interior
-- ============================================================
-- Parte da definição de 20261206160000. 14 parâmetros novos no fim, DEFAULT
-- NULL. Cada secção da ficha só é gravada quando vem com algum dado; sem
-- dados nessa secção, a da morada (se for reutilizada) não é tocada.
DROP FUNCTION IF EXISTS public.rpc_add_entity_delivery_address(uuid, text, text, text, text, text, text, text, integer, text, text, boolean, integer, integer, integer);

CREATE OR REPLACE FUNCTION public.rpc_add_entity_delivery_address(
  p_entity_id             uuid,
  p_street                text,
  p_number                text DEFAULT NULL::text,
  p_postal_code           text DEFAULT NULL::text,
  p_city                  text DEFAULT NULL::text,
  p_floor                 text DEFAULT NULL::text,
  p_unit                  text DEFAULT NULL::text,
  p_acesso                text DEFAULT NULL::text,
  p_impacto_percent       integer DEFAULT NULL::integer,
  p_estacionamento        text DEFAULT NULL::text,
  p_zona_estacionamento   text DEFAULT NULL::text,
  p_tem_elevador          boolean DEFAULT NULL::boolean,
  p_n_elevadores          integer DEFAULT NULL::integer,
  p_n_andares             integer DEFAULT NULL::integer,
  p_n_fracoes_por_andar   integer DEFAULT NULL::integer,
  p_tipologia             text DEFAULT NULL::text,
  p_area_util_m2          numeric DEFAULT NULL::numeric,
  p_n_divisoes            integer DEFAULT NULL::integer,
  p_n_casas_banho         integer DEFAULT NULL::integer,
  p_ano_construcao        integer DEFAULT NULL::integer,
  p_pavimento             text DEFAULT NULL::text,
  p_eletrica              text DEFAULT NULL::text,
  p_quadro_diferencial    boolean DEFAULT NULL::boolean,
  p_canalizacao           text DEFAULT NULL::text,
  p_gas                   text DEFAULT NULL::text,
  p_amianto               text DEFAULT NULL::text,
  p_habitada_durante_obra boolean DEFAULT NULL::boolean,
  p_animais               boolean DEFAULT NULL::boolean,
  p_notas_interior        text DEFAULT NULL::text
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_actor      uuid;
  v_street     text := btrim(coalesce(p_street, ''));
  v_number     text := btrim(coalesce(p_number, ''));
  v_floor      text := nullif(btrim(coalesce(p_floor, '')), '');
  v_unit       text := nullif(btrim(coalesce(p_unit, '')), '');
  v_postal     text := btrim(coalesce(p_postal_code, ''));
  v_city       text := btrim(coalesce(p_city, ''));
  v_notas      text := nullif(btrim(coalesce(p_notas_interior, '')), '');
  v_country    text := 'PT';
  v_key        text;
  v_address_id uuid;
  v_link_id    uuid;
  v_existing   boolean := false;
  v_formatted  text;
  v_tem_ext    boolean;
  v_tem_int    boolean;
BEGIN
  IF p_entity_id IS NULL THEN
    RAISE EXCEPTION 'entity_id é obrigatório' USING ERRCODE = 'check_violation';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.anew_entities e WHERE e.id = p_entity_id) THEN
    RAISE EXCEPTION 'Cliente não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT public.fn_entity_delivery_address_access(p_entity_id, 'add') THEN
    RAISE EXCEPTION 'Sem permissão para alterar as moradas deste cliente' USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_street = '' THEN
    RAISE EXCEPTION 'A rua é obrigatória' USING ERRCODE = 'check_violation';
  END IF;
  IF v_postal = '' THEN
    RAISE EXCEPTION 'O código postal é obrigatório' USING ERRCODE = 'check_violation';
  END IF;
  -- Mesmo formato da ficha (POSTAL_CODE_PT_PATTERN / sync_entity_primary_address).
  IF v_postal !~ '^[0-9]{4}-[0-9]{3}$' OR v_postal = '0000-000' THEN
    RAISE EXCEPTION 'Código postal inválido (formato 0000-000)' USING ERRCODE = 'check_violation';
  END IF;
  IF v_city = '' THEN
    RAISE EXCEPTION 'A localidade é obrigatória' USING ERRCODE = 'check_violation';
  END IF;

  PERFORM public.fn_validar_ficha_edificio(
    v_floor, p_acesso, p_impacto_percent, p_estacionamento, p_zona_estacionamento,
    p_tem_elevador, p_n_elevadores, p_n_andares, p_n_fracoes_por_andar,
    p_tipologia, p_area_util_m2, p_n_divisoes, p_n_casas_banho, p_ano_construcao,
    p_pavimento, p_eletrica, p_canalizacao, p_gas, p_amianto, v_notas);

  v_tem_ext := p_acesso IS NOT NULL OR p_impacto_percent IS NOT NULL OR p_estacionamento IS NOT NULL
    OR p_zona_estacionamento IS NOT NULL OR p_tem_elevador IS NOT NULL OR p_n_elevadores IS NOT NULL
    OR p_n_andares IS NOT NULL OR p_n_fracoes_por_andar IS NOT NULL;
  v_tem_int := p_tipologia IS NOT NULL OR p_area_util_m2 IS NOT NULL OR p_n_divisoes IS NOT NULL
    OR p_n_casas_banho IS NOT NULL OR p_ano_construcao IS NOT NULL OR p_pavimento IS NOT NULL
    OR p_eletrica IS NOT NULL OR p_quadro_diferencial IS NOT NULL OR p_canalizacao IS NOT NULL
    OR p_gas IS NOT NULL OR p_amianto IS NOT NULL OR p_habitada_durante_obra IS NOT NULL
    OR p_animais IS NOT NULL OR v_notas IS NOT NULL;

  -- Mesmo cálculo de address_key que assign_address_to_org.
  v_key :=
    lower(v_street) || '|' ||
    lower(v_number) || '|' ||
    lower(coalesce(v_floor, '')) || '|' ||
    lower(coalesce(v_unit, '')) || '|' ||
    lower(v_postal) || '|' ||
    lower(v_city) || '|' ||
    lower(v_country);

  -- Reutiliza uma morada existente (nunca lhe faz UPDATE); senão cria.
  SELECT a.id INTO v_address_id
  FROM public.anew_addresses a
  WHERE a.address_key = v_key
  ORDER BY a.created_at
  LIMIT 1;

  IF v_address_id IS NULL THEN
    INSERT INTO public.anew_addresses (
      street, number, floor, unit, postal_code, city, country, address_key, created_by
    ) VALUES (
      v_street, v_number, v_floor, v_unit, v_postal, v_city, v_country, v_key, v_actor
    )
    RETURNING id INTO v_address_id;
  ELSE
    -- Já ligada a esta entidade como entrega ativa? Devolve a existente.
    SELECT ea.id INTO v_link_id
    FROM public.anew_entity_addresses ea
    WHERE ea.entity_id = p_entity_id
      AND ea.address_id = v_address_id
      AND ea.address_type = 'delivery'
      AND (ea.valid_to IS NULL OR ea.valid_to > now())
    ORDER BY ea.created_at
    LIMIT 1;
    v_existing := v_link_id IS NOT NULL;
  END IF;

  IF v_link_id IS NULL THEN
    INSERT INTO public.anew_entity_addresses (
      entity_id, address_id, address_type, is_primary, is_fiscal, valid_from, created_by
    ) VALUES (
      p_entity_id, v_address_id, 'delivery', false, false, now(), v_actor
    )
    RETURNING id INTO v_link_id;
  END IF;

  -- Ficha do local: cada secção só quando veio alguma coisa nela.
  IF v_tem_ext OR v_tem_int THEN
    PERFORM public.fn_gravar_ficha_edificio(
      v_address_id, v_actor,
      v_tem_ext, p_acesso, p_impacto_percent, p_estacionamento, p_zona_estacionamento,
      p_tem_elevador, p_n_elevadores, p_n_andares, p_n_fracoes_por_andar,
      v_tem_int, p_tipologia, p_area_util_m2, p_n_divisoes, p_n_casas_banho, p_ano_construcao,
      p_pavimento, p_eletrica, p_quadro_diferencial, p_canalizacao, p_gas, p_amianto,
      p_habitada_durante_obra, p_animais, v_notas);
  END IF;

  SELECT nullif(concat_ws(', ',
           nullif(btrim(a.street), ''),
           nullif(btrim(a.number), ''),
           nullif(btrim(a.postal_code), ''),
           nullif(btrim(a.city), '')
         ), '')
    INTO v_formatted
  FROM public.anew_addresses a
  WHERE a.id = v_address_id;

  RETURN jsonb_build_object(
    'entity_address_id', v_link_id,
    'address_id',        v_address_id,
    'formatted',         v_formatted,
    'already_existed',   v_existing
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_add_entity_delivery_address(uuid, text, text, text, text, text, text, text, integer, text, text, boolean, integer, integer, integer, text, numeric, integer, integer, integer, text, text, boolean, text, text, text, boolean, boolean, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_add_entity_delivery_address(uuid, text, text, text, text, text, text, text, integer, text, text, boolean, integer, integer, integer, text, numeric, integer, integer, integer, text, text, boolean, text, text, text, boolean, boolean, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_add_entity_delivery_address(uuid, text, text, text, text, text, text, text, integer, text, text, boolean, integer, integer, integer, text, numeric, integer, integer, integer, text, text, boolean, text, text, text, boolean, boolean, text) TO authenticated;

COMMENT ON FUNCTION public.rpc_add_entity_delivery_address(uuid, text, text, text, text, text, text, text, integer, text, text, boolean, integer, integer, integer, text, numeric, integer, integer, integer, text, text, boolean, text, text, text, boolean, boolean, text) IS
  'Acrescenta uma morada de entrega a uma entidade (reutiliza anew_addresses pelo address_key). Ficha do local opcional (anew_address_building): exterior (20261206160000) e interior (20261207110000); uma secção sem dados não mexe nessa secção da ficha existente.';

-- ============================================================
-- 5. rpc_update_entity_delivery_address — aceita o interior
-- ============================================================
-- Parte da definição de 20261206160000. 14 parâmetros do interior +
-- p_com_interior no fim, DEFAULT NULL.
--   • Exterior: substituído pelo enviado (tudo NULL = apagar), como antes.
--   • Interior: substituído quando p_com_interior = true OU quando vem algum
--     campo do interior; senão (chamadas antigas) fica o que estava. O
--     frontend envia sempre p_com_interior = true (para poder limpar).
-- Se a morada mudar de linha (address_key), a ficha grava-se na morada final;
-- numa chamada antiga o interior da morada final fica como estiver.
DROP FUNCTION IF EXISTS public.rpc_update_entity_delivery_address(uuid, text, text, text, text, text, text, text, integer, text, text, boolean, integer, integer, integer);

CREATE OR REPLACE FUNCTION public.rpc_update_entity_delivery_address(
  p_entity_address_id     uuid,
  p_street                text,
  p_number                text DEFAULT NULL::text,
  p_postal_code           text DEFAULT NULL::text,
  p_city                  text DEFAULT NULL::text,
  p_floor                 text DEFAULT NULL::text,
  p_unit                  text DEFAULT NULL::text,
  p_acesso                text DEFAULT NULL::text,
  p_impacto_percent       integer DEFAULT NULL::integer,
  p_estacionamento        text DEFAULT NULL::text,
  p_zona_estacionamento   text DEFAULT NULL::text,
  p_tem_elevador          boolean DEFAULT NULL::boolean,
  p_n_elevadores          integer DEFAULT NULL::integer,
  p_n_andares             integer DEFAULT NULL::integer,
  p_n_fracoes_por_andar   integer DEFAULT NULL::integer,
  p_tipologia             text DEFAULT NULL::text,
  p_area_util_m2          numeric DEFAULT NULL::numeric,
  p_n_divisoes            integer DEFAULT NULL::integer,
  p_n_casas_banho         integer DEFAULT NULL::integer,
  p_ano_construcao        integer DEFAULT NULL::integer,
  p_pavimento             text DEFAULT NULL::text,
  p_eletrica              text DEFAULT NULL::text,
  p_quadro_diferencial    boolean DEFAULT NULL::boolean,
  p_canalizacao           text DEFAULT NULL::text,
  p_gas                   text DEFAULT NULL::text,
  p_amianto               text DEFAULT NULL::text,
  p_habitada_durante_obra boolean DEFAULT NULL::boolean,
  p_animais               boolean DEFAULT NULL::boolean,
  p_notas_interior        text DEFAULT NULL::text,
  p_com_interior          boolean DEFAULT NULL::boolean
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_actor          uuid;
  v_street         text := btrim(coalesce(p_street, ''));
  v_number         text := btrim(coalesce(p_number, ''));
  v_floor          text := nullif(btrim(coalesce(p_floor, '')), '');
  v_unit           text := nullif(btrim(coalesce(p_unit, '')), '');
  v_postal         text := btrim(coalesce(p_postal_code, ''));
  v_city           text := btrim(coalesce(p_city, ''));
  v_notas          text := nullif(btrim(coalesce(p_notas_interior, '')), '');
  v_country        text := 'PT';
  v_key            text;
  v_entity_id      uuid;
  v_type           text;
  v_valid_to       timestamptz;
  v_old_address_id uuid;
  v_old_key        text;
  v_address_id     uuid;
  v_formatted      text;
  v_com_interior   boolean;
BEGIN
  IF p_entity_address_id IS NULL THEN
    RAISE EXCEPTION 'entity_address_id é obrigatório' USING ERRCODE = 'check_violation';
  END IF;

  SELECT ea.entity_id, ea.address_type, ea.valid_to, ea.address_id
    INTO v_entity_id, v_type, v_valid_to, v_old_address_id
  FROM public.anew_entity_addresses ea
  WHERE ea.id = p_entity_address_id
  FOR UPDATE;

  IF v_entity_id IS NULL THEN
    RAISE EXCEPTION 'Morada não encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  -- Permissão antes de revelar o tipo/estado da linha.
  IF NOT public.fn_entity_delivery_address_access(v_entity_id, 'edit') THEN
    RAISE EXCEPTION 'Sem permissão para alterar as moradas deste cliente' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_type IS DISTINCT FROM 'delivery' THEN
    RAISE EXCEPTION 'Só é possível editar moradas de entrega' USING ERRCODE = 'check_violation';
  END IF;

  IF v_valid_to IS NOT NULL AND v_valid_to <= now() THEN
    RAISE EXCEPTION 'Esta morada de entrega foi removida' USING ERRCODE = 'check_violation';
  END IF;

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_street = '' THEN
    RAISE EXCEPTION 'A rua é obrigatória' USING ERRCODE = 'check_violation';
  END IF;
  IF v_postal = '' THEN
    RAISE EXCEPTION 'O código postal é obrigatório' USING ERRCODE = 'check_violation';
  END IF;
  IF v_postal !~ '^[0-9]{4}-[0-9]{3}$' OR v_postal = '0000-000' THEN
    RAISE EXCEPTION 'Código postal inválido (formato 0000-000)' USING ERRCODE = 'check_violation';
  END IF;
  IF v_city = '' THEN
    RAISE EXCEPTION 'A localidade é obrigatória' USING ERRCODE = 'check_violation';
  END IF;

  PERFORM public.fn_validar_ficha_edificio(
    v_floor, p_acesso, p_impacto_percent, p_estacionamento, p_zona_estacionamento,
    p_tem_elevador, p_n_elevadores, p_n_andares, p_n_fracoes_por_andar,
    p_tipologia, p_area_util_m2, p_n_divisoes, p_n_casas_banho, p_ano_construcao,
    p_pavimento, p_eletrica, p_canalizacao, p_gas, p_amianto, v_notas);

  v_com_interior := COALESCE(p_com_interior, false)
    OR p_tipologia IS NOT NULL OR p_area_util_m2 IS NOT NULL OR p_n_divisoes IS NOT NULL
    OR p_n_casas_banho IS NOT NULL OR p_ano_construcao IS NOT NULL OR p_pavimento IS NOT NULL
    OR p_eletrica IS NOT NULL OR p_quadro_diferencial IS NOT NULL OR p_canalizacao IS NOT NULL
    OR p_gas IS NOT NULL OR p_amianto IS NOT NULL OR p_habitada_durante_obra IS NOT NULL
    OR p_animais IS NOT NULL OR v_notas IS NOT NULL;

  -- Mesmo cálculo de address_key que rpc_add_entity_delivery_address.
  v_key :=
    lower(v_street) || '|' ||
    lower(v_number) || '|' ||
    lower(coalesce(v_floor, '')) || '|' ||
    lower(coalesce(v_unit, '')) || '|' ||
    lower(v_postal) || '|' ||
    lower(v_city) || '|' ||
    lower(v_country);

  SELECT a.address_key INTO v_old_key FROM public.anew_addresses a WHERE a.id = v_old_address_id;

  IF v_old_key IS NOT DISTINCT FROM v_key THEN
    v_address_id := v_old_address_id;
  ELSE
    SELECT a.id INTO v_address_id
    FROM public.anew_addresses a
    WHERE a.address_key = v_key
    ORDER BY a.created_at
    LIMIT 1;

    IF v_address_id IS NULL THEN
      INSERT INTO public.anew_addresses (
        street, number, floor, unit, postal_code, city, country, address_key, created_by
      ) VALUES (
        v_street, v_number, v_floor, v_unit, v_postal, v_city, v_country, v_key, v_actor
      )
      RETURNING id INTO v_address_id;
    ELSIF EXISTS (
      SELECT 1
      FROM public.anew_entity_addresses ea
      WHERE ea.entity_id = v_entity_id
        AND ea.address_id = v_address_id
        AND ea.address_type = 'delivery'
        AND ea.id <> p_entity_address_id
        AND (ea.valid_to IS NULL OR ea.valid_to > now())
    ) THEN
      RAISE EXCEPTION 'Este cliente já tem esta morada de entrega' USING ERRCODE = 'unique_violation';
    END IF;

    IF v_address_id IS DISTINCT FROM v_old_address_id THEN
      UPDATE public.anew_entity_addresses
         SET address_id = v_address_id
       WHERE id = p_entity_address_id;
    END IF;
  END IF;

  PERFORM public.fn_gravar_ficha_edificio(
    v_address_id, v_actor,
    true, p_acesso, p_impacto_percent, p_estacionamento, p_zona_estacionamento,
    p_tem_elevador, p_n_elevadores, p_n_andares, p_n_fracoes_por_andar,
    v_com_interior, p_tipologia, p_area_util_m2, p_n_divisoes, p_n_casas_banho, p_ano_construcao,
    p_pavimento, p_eletrica, p_quadro_diferencial, p_canalizacao, p_gas, p_amianto,
    p_habitada_durante_obra, p_animais, v_notas);

  SELECT nullif(concat_ws(', ',
           nullif(btrim(a.street), ''),
           nullif(btrim(a.number), ''),
           nullif(btrim(a.postal_code), ''),
           nullif(btrim(a.city), '')
         ), '')
    INTO v_formatted
  FROM public.anew_addresses a
  WHERE a.id = v_address_id;

  RETURN jsonb_build_object(
    'entity_address_id', p_entity_address_id,
    'address_id',        v_address_id,
    'formatted',         v_formatted,
    'address_changed',   v_address_id IS DISTINCT FROM v_old_address_id
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_update_entity_delivery_address(uuid, text, text, text, text, text, text, text, integer, text, text, boolean, integer, integer, integer, text, numeric, integer, integer, integer, text, text, boolean, text, text, text, boolean, boolean, text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_update_entity_delivery_address(uuid, text, text, text, text, text, text, text, integer, text, text, boolean, integer, integer, integer, text, numeric, integer, integer, integer, text, text, boolean, text, text, text, boolean, boolean, text, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_update_entity_delivery_address(uuid, text, text, text, text, text, text, text, integer, text, text, boolean, integer, integer, integer, text, numeric, integer, integer, integer, text, text, boolean, text, text, text, boolean, boolean, text, boolean) TO authenticated;

COMMENT ON FUNCTION public.rpc_update_entity_delivery_address(uuid, text, text, text, text, text, text, text, integer, text, text, boolean, integer, integer, integer, text, numeric, integer, integer, integer, text, text, boolean, text, text, text, boolean, boolean, text, boolean) IS
  'Edita uma morada de entrega (20261206160000). Nunca faz UPDATE a anew_addresses: se a morada mudou, reutiliza/cria pela address_key e repõe a ligação (mesmo entity_address_id). Ficha do local: o exterior é substituído (tudo NULL = apagar); o interior (20261207110000) só com p_com_interior = true ou com algum campo do interior — chamadas antigas não o apagam.';

-- ============================================================
-- CONFERIR
-- ============================================================
DO $$
DECLARE
  v_fn    text;
  v_oid   oid;
  v_names text[];
  v_col   text;
BEGIN
  -- Uma só sobrecarga de cada função alterada.
  FOREACH v_fn IN ARRAY ARRAY[
    'rpc_add_entity_delivery_address', 'rpc_list_entity_delivery_addresses',
    'rpc_update_entity_delivery_address', 'fn_validar_ficha_edificio', 'fn_gravar_ficha_edificio'
  ] LOOP
    IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = v_fn) <> 1 THEN
      RAISE EXCEPTION 'CONFERIR: % não tem exatamente uma sobrecarga', v_fn;
    END IF;
  END LOOP;

  -- RPCs: anon sem EXECUTE, authenticated com.
  FOREACH v_fn IN ARRAY ARRAY[
    'public.rpc_add_entity_delivery_address(uuid, text, text, text, text, text, text, text, integer, text, text, boolean, integer, integer, integer, text, numeric, integer, integer, integer, text, text, boolean, text, text, text, boolean, boolean, text)',
    'public.rpc_list_entity_delivery_addresses(uuid)',
    'public.rpc_update_entity_delivery_address(uuid, text, text, text, text, text, text, text, integer, text, text, boolean, integer, integer, integer, text, numeric, integer, integer, integer, text, text, boolean, text, text, text, boolean, boolean, text, boolean)'
  ] LOOP
    v_oid := v_fn::regprocedure;
    IF has_function_privilege('anon', v_oid, 'EXECUTE') THEN
      RAISE EXCEPTION 'CONFERIR: anon tem EXECUTE em %', v_fn;
    END IF;
    IF NOT has_function_privilege('authenticated', v_oid, 'EXECUTE') THEN
      RAISE EXCEPTION 'CONFERIR: authenticated sem EXECUTE em %', v_fn;
    END IF;
  END LOOP;

  -- Internas: fechadas a anon/authenticated.
  FOREACH v_fn IN ARRAY ARRAY[
    'public.fn_validar_ficha_edificio(text, text, integer, text, text, boolean, integer, integer, integer, text, numeric, integer, integer, integer, text, text, text, text, text, text)',
    'public.fn_gravar_ficha_edificio(uuid, uuid, boolean, text, integer, text, text, boolean, integer, integer, integer, boolean, text, numeric, integer, integer, integer, text, text, boolean, text, text, text, boolean, boolean, text)'
  ] LOOP
    IF has_function_privilege('authenticated', v_fn::regprocedure, 'EXECUTE')
       OR has_function_privilege('anon', v_fn::regprocedure, 'EXECUTE') THEN
      RAISE EXCEPTION 'CONFERIR: % devia ser interna', v_fn;
    END IF;
  END LOOP;

  IF has_table_privilege('authenticated', 'public.anew_address_building', 'SELECT')
     OR has_table_privilege('anon', 'public.anew_address_building', 'SELECT') THEN
    RAISE EXCEPTION 'CONFERIR: anew_address_building não devia ser legível diretamente';
  END IF;

  -- Compatibilidade: os 15 parâmetros de antes mantêm nome e posição, e todos
  -- os que vêm depois de p_street têm DEFAULT.
  SELECT p.proargnames[1:15] INTO v_names FROM pg_proc p
  WHERE p.oid = 'public.rpc_add_entity_delivery_address(uuid, text, text, text, text, text, text, text, integer, text, text, boolean, integer, integer, integer, text, numeric, integer, integer, integer, text, text, boolean, text, text, text, boolean, boolean, text)'::regprocedure;
  IF v_names IS DISTINCT FROM ARRAY['p_entity_id', 'p_street', 'p_number', 'p_postal_code', 'p_city', 'p_floor', 'p_unit',
      'p_acesso', 'p_impacto_percent', 'p_estacionamento', 'p_zona_estacionamento', 'p_tem_elevador',
      'p_n_elevadores', 'p_n_andares', 'p_n_fracoes_por_andar'] THEN
    RAISE EXCEPTION 'CONFERIR: parâmetros antigos de rpc_add_entity_delivery_address mudaram: %', v_names;
  END IF;
  IF (SELECT p.pronargdefaults FROM pg_proc p
      WHERE p.oid = 'public.rpc_add_entity_delivery_address(uuid, text, text, text, text, text, text, text, integer, text, text, boolean, integer, integer, integer, text, numeric, integer, integer, integer, text, text, boolean, text, text, text, boolean, boolean, text)'::regprocedure) <> 27 THEN
    RAISE EXCEPTION 'CONFERIR: rpc_add_entity_delivery_address devia ter 27 parâmetros com DEFAULT';
  END IF;

  SELECT p.proargnames[1:15] INTO v_names FROM pg_proc p
  WHERE p.oid = 'public.rpc_update_entity_delivery_address(uuid, text, text, text, text, text, text, text, integer, text, text, boolean, integer, integer, integer, text, numeric, integer, integer, integer, text, text, boolean, text, text, text, boolean, boolean, text, boolean)'::regprocedure;
  IF v_names IS DISTINCT FROM ARRAY['p_entity_address_id', 'p_street', 'p_number', 'p_postal_code', 'p_city', 'p_floor', 'p_unit',
      'p_acesso', 'p_impacto_percent', 'p_estacionamento', 'p_zona_estacionamento', 'p_tem_elevador',
      'p_n_elevadores', 'p_n_andares', 'p_n_fracoes_por_andar'] THEN
    RAISE EXCEPTION 'CONFERIR: parâmetros antigos de rpc_update_entity_delivery_address mudaram: %', v_names;
  END IF;
  IF (SELECT p.pronargdefaults FROM pg_proc p
      WHERE p.oid = 'public.rpc_update_entity_delivery_address(uuid, text, text, text, text, text, text, text, integer, text, text, boolean, integer, integer, integer, text, numeric, integer, integer, integer, text, text, boolean, text, text, text, boolean, boolean, text, boolean)'::regprocedure) <> 28 THEN
    RAISE EXCEPTION 'CONFERIR: rpc_update_entity_delivery_address devia ter 28 parâmetros com DEFAULT';
  END IF;

  -- Colunas e CHECKs do interior.
  FOREACH v_col IN ARRAY ARRAY[
    'tipologia', 'area_util_m2', 'n_divisoes', 'n_casas_banho', 'ano_construcao', 'pavimento',
    'eletrica', 'quadro_diferencial', 'canalizacao', 'gas', 'amianto', 'habitada_durante_obra',
    'animais', 'notas_interior'
  ] LOOP
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = 'public' AND table_name = 'anew_address_building' AND column_name = v_col) THEN
      RAISE EXCEPTION 'CONFERIR: falta a coluna anew_address_building.%', v_col;
    END IF;
  END LOOP;
  IF (SELECT count(*) FROM pg_constraint
      WHERE conrelid = 'public.anew_address_building'::regclass AND contype = 'c'
        AND conname IN ('anew_address_building_tipologia_chk', 'anew_address_building_area_chk',
          'anew_address_building_divisoes_chk', 'anew_address_building_casas_banho_chk',
          'anew_address_building_ano_chk', 'anew_address_building_pavimento_chk',
          'anew_address_building_eletrica_chk', 'anew_address_building_canalizacao_chk',
          'anew_address_building_gas_chk', 'anew_address_building_amianto_chk',
          'anew_address_building_notas_chk')) <> 11 THEN
    RAISE EXCEPTION 'CONFERIR: faltam CHECKs do interior em anew_address_building';
  END IF;

  -- Algumas regras do validador (cada uma tem de falhar).
  BEGIN
    PERFORM public.fn_validar_ficha_edificio(NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
      'T6', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
    RAISE EXCEPTION 'CONFERIR: tipologia T6 passou';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    PERFORM public.fn_validar_ficha_edificio(NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
      NULL, 95.555, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
    RAISE EXCEPTION 'CONFERIR: área com 3 casas decimais passou';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    PERFORM public.fn_validar_ficha_edificio(NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
      NULL, NULL, NULL, NULL, extract(year FROM current_date)::integer + 1, NULL, NULL, NULL, NULL, NULL, NULL);
    RAISE EXCEPTION 'CONFERIR: ano de construção no futuro passou';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  -- E uma ficha válida passa.
  PERFORM public.fn_validar_ficha_edificio('3', 'dificil', 15, 'pago', 'verde', true, 1, 5, 4,
    'T3', 95.5, 5, 2, 1985, 'ceramico', 'antiga', 'ferro', 'canalizado', 'nao_sei', 'Cão em casa');
END;
$$;
