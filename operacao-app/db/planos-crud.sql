-- ============================================================
--  Operações — criar e editar planos preventivos
-- ============================================================
--  Correr DEPOIS de todos os outros.
--
--  `db/planos.sql` sabe MATERIALIZAR planos; faltava poder criá-los sem ser
--  por SQL à mão. Este ficheiro fecha esse buraco.
--
--  Uma nota sobre a regra de recorrência: ela é validada AQUI, expandindo-a de
--  verdade antes de gravar. Guardar uma RRULE que o expansor não sabe ler
--  daria um plano que fica em silêncio para sempre — nunca gera nada, e o
--  erro só aparece meses depois, quando alguém pergunta porque é que a
--  manutenção do AVAC nunca mais foi feita.
--
--  Escreve fora de `ops_*`? NÃO.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.ops_gravar_plano_impl(
  p_plano_id         uuid,        -- NULL = criar
  p_nome             text,
  p_cliente_id       uuid,
  p_tipo_recorrencia text        DEFAULT 'calendario',
  p_regra            text        DEFAULT NULL,
  p_intervalo_horas  integer     DEFAULT NULL,
  p_hora_prevista    time        DEFAULT '09:00',
  p_inicio_em        date        DEFAULT NULL,
  p_fim_em           date        DEFAULT NULL,
  p_responsavel_id   uuid        DEFAULT NULL,
  p_estado           text        DEFAULT 'ativo',
  p_duracao          integer     DEFAULT 0,
  p_alvos            jsonb       DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user   uuid;
  v_funcao text;
  v_org    uuid;
  v_nome   text := nullif(btrim(coalesce(p_nome, '')), '');
  v_codigo text;
  v_id     uuid := p_plano_id;
  v_teste  date;
  v_alvo   jsonb;
  v_n      integer := 0;
  v_criado boolean := (p_plano_id IS NULL);
BEGIN
  IF v_nome IS NULL THEN
    RAISE EXCEPTION 'Um plano precisa de um nome. É por ele que se encontra na lista.';
  END IF;

  IF p_cliente_id IS NULL THEN
    RAISE EXCEPTION 'Um plano precisa de um cliente.';
  END IF;

  SELECT organization_id INTO v_org FROM public.anew_clients WHERE id = p_cliente_id;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Cliente não encontrado.' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT q.utilizador_id, q.funcao INTO v_user, v_funcao FROM public.ops_quem_sou(v_org) q;

  IF NOT (
    public.is_system_admin_user(auth.uid())
    OR public.has_anew_permission(auth.uid(), 'operations.plans.manage')
  ) THEN
    RAISE EXCEPTION 'Sem permissão para gerir planos preventivos.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_tipo_recorrencia NOT IN ('calendario','dinamica') THEN
    RAISE EXCEPTION 'Tipo de recorrência inválido: %.', p_tipo_recorrencia;
  END IF;

  IF p_estado NOT IN ('ativo','suspenso','terminado') THEN
    RAISE EXCEPTION 'Estado de plano inválido: %.', p_estado;
  END IF;

  -- ── a regra, experimentada antes de ser gravada ──────────────────────
  IF p_tipo_recorrencia = 'calendario' THEN
    IF nullif(btrim(coalesce(p_regra, '')), '') IS NULL THEN
      RAISE EXCEPTION 'Um plano de calendário precisa de uma regra de recorrência.';
    END IF;

    -- Expandir a sério, num ano à frente. Se a regra não servir, o expansor
    -- rebenta aqui — e não daqui a três meses, em silêncio.
    BEGIN
      SELECT d INTO v_teste
        FROM public.ops_expandir_rrule(
               p_regra,
               COALESCE(p_inicio_em, CURRENT_DATE),
               COALESCE(p_inicio_em, CURRENT_DATE) + 365) d
       LIMIT 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'Essa regra não é suportada: %', SQLERRM;
    END;

    IF v_teste IS NULL THEN
      RAISE EXCEPTION
        'Essa regra não gera nenhuma data no próximo ano. Confirma o dia e a frequência.';
    END IF;

  ELSE
    IF p_intervalo_horas IS NULL OR p_intervalo_horas <= 0 THEN
      RAISE EXCEPTION 'Um plano dinâmico precisa de um intervalo em horas maior do que zero.';
    END IF;
  END IF;

  IF p_fim_em IS NOT NULL AND p_fim_em < COALESCE(p_inicio_em, CURRENT_DATE) THEN
    RAISE EXCEPTION 'O plano acaba antes de começar.';
  END IF;

  IF p_responsavel_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.ops_utilizador_perfil
     WHERE utilizador_id = p_responsavel_id AND organization_id = v_org AND ativo) THEN
    RAISE EXCEPTION 'Essa pessoa não está ativa em Operações nesta organização.';
  END IF;

  -- ── gravar ───────────────────────────────────────────────────────────
  IF v_criado THEN
    v_codigo := public.ops_proximo_codigo_interno(v_org, 'PLN');

    INSERT INTO public.ops_plano (
      organization_id, codigo, nome, cliente_id, estado, tipo_recorrencia,
      regra_recorrencia, intervalo_horas, hora_prevista, duracao_estimada,
      responsavel_id, inicio_em, fim_em)
    VALUES (
      v_org, v_codigo, v_nome, p_cliente_id, p_estado, p_tipo_recorrencia,
      CASE WHEN p_tipo_recorrencia = 'calendario' THEN p_regra END,
      CASE WHEN p_tipo_recorrencia = 'dinamica' THEN p_intervalo_horas END,
      COALESCE(p_hora_prevista, '09:00'), COALESCE(p_duracao, 0),
      p_responsavel_id, COALESCE(p_inicio_em, CURRENT_DATE), p_fim_em)
    RETURNING id INTO v_id;
  ELSE
    SELECT codigo INTO v_codigo FROM public.ops_plano
     WHERE id = v_id AND organization_id = v_org;
    IF v_codigo IS NULL THEN
      RAISE EXCEPTION 'Plano não encontrado nesta organização.' USING ERRCODE = 'no_data_found';
    END IF;

    -- `materializado_ate` volta a NULL: mudar a regra invalida a janela já
    -- gerada, e o job tem de reconsiderar tudo a partir do início.
    UPDATE public.ops_plano SET
      nome              = v_nome,
      cliente_id        = p_cliente_id,
      estado            = p_estado,
      tipo_recorrencia  = p_tipo_recorrencia,
      regra_recorrencia = CASE WHEN p_tipo_recorrencia = 'calendario' THEN p_regra END,
      intervalo_horas   = CASE WHEN p_tipo_recorrencia = 'dinamica' THEN p_intervalo_horas END,
      hora_prevista     = COALESCE(p_hora_prevista, '09:00'),
      duracao_estimada  = COALESCE(p_duracao, 0),
      responsavel_id    = p_responsavel_id,
      inicio_em         = COALESCE(p_inicio_em, inicio_em),
      fim_em            = p_fim_em,
      materializado_ate = NULL,
      atualizado_em     = now()
    WHERE id = v_id;
  END IF;

  -- ── os alvos ─────────────────────────────────────────────────────────
  -- Substituídos por inteiro. Um plano com os alvos meio antigos e meio novos
  -- geraria ordens para sítios onde já ninguém vai.
  IF p_alvos IS NOT NULL THEN
    DELETE FROM public.ops_plano_alvo WHERE plano_id = v_id;

    FOR v_alvo IN SELECT * FROM jsonb_array_elements(p_alvos) LOOP
      IF (v_alvo->>'local_id') IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.ops_local
         WHERE id = (v_alvo->>'local_id')::uuid AND organization_id = v_org) THEN
        RAISE EXCEPTION 'Um dos locais não é desta organização.'
          USING ERRCODE = 'insufficient_privilege';
      END IF;

      IF (v_alvo->>'ativo_id') IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.ops_ativo
         WHERE id = (v_alvo->>'ativo_id')::uuid AND organization_id = v_org) THEN
        RAISE EXCEPTION 'Um dos ativos não é desta organização.'
          USING ERRCODE = 'insufficient_privilege';
      END IF;

      IF (v_alvo->>'checklist_id') IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.ops_checklist
         WHERE id = (v_alvo->>'checklist_id')::uuid AND organization_id = v_org
           AND estado = 'publicada') THEN
        RAISE EXCEPTION 'Uma das checklists não existe aqui, ou não está publicada.';
      END IF;

      INSERT INTO public.ops_plano_alvo (plano_id, ativo_id, local_id, checklist_id)
      VALUES (
        v_id,
        (v_alvo->>'ativo_id')::uuid,
        (v_alvo->>'local_id')::uuid,
        (v_alvo->>'checklist_id')::uuid);
      v_n := v_n + 1;
    END LOOP;
  END IF;

  INSERT INTO public.ops_evento
    (organization_id, entidade, entidade_id, tipo, descricao, autor_id, antes, depois)
  VALUES
    (v_org, 'plano', v_id, CASE WHEN v_criado THEN 'criado' ELSE 'editado' END,
     v_nome, v_user, NULL,
     jsonb_build_object('codigo', v_codigo, 'tipo', p_tipo_recorrencia,
                        'regra', p_regra, 'alvos', v_n));

  RETURN jsonb_build_object(
    'ok', true, 'id', v_id, 'codigo', v_codigo, 'criado', v_criado, 'alvos', v_n);
END
$$;

REVOKE ALL ON FUNCTION public.ops_gravar_plano_impl(
  uuid, text, uuid, text, text, integer, time, date, date, uuid, text, integer, jsonb)
  FROM PUBLIC, anon, authenticated;

-- O invólucro autoriza as fechaduras que a materialização precisa, porque
-- gravar um plano não materializa nada — mas o alvo pode arrastar checklists,
-- e mais vale a flag existir do que descobrir que falta daqui a três meses.
CREATE OR REPLACE FUNCTION public.rpc_ops_gravar_plano(
  p_plano_id         uuid,
  p_nome             text,
  p_cliente_id       uuid,
  p_tipo_recorrencia text    DEFAULT 'calendario',
  p_regra            text    DEFAULT NULL,
  p_intervalo_horas  integer DEFAULT NULL,
  p_hora_prevista    time    DEFAULT '09:00',
  p_inicio_em        date    DEFAULT NULL,
  p_fim_em           date    DEFAULT NULL,
  p_responsavel_id   uuid    DEFAULT NULL,
  p_estado           text    DEFAULT 'ativo',
  p_duracao          integer DEFAULT 0,
  p_alvos            jsonb   DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE r jsonb;
BEGIN
  PERFORM set_config('ops.medicao', 'autorizada', true);
  r := public.ops_gravar_plano_impl(
         p_plano_id, p_nome, p_cliente_id, p_tipo_recorrencia, p_regra,
         p_intervalo_horas, p_hora_prevista, p_inicio_em, p_fim_em,
         p_responsavel_id, p_estado, p_duracao, p_alvos);
  PERFORM set_config('ops.medicao', '', true);
  RETURN r;
END
$$;

REVOKE ALL ON FUNCTION public.rpc_ops_gravar_plano(
  uuid, text, uuid, text, text, integer, time, date, date, uuid, text, integer, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_ops_gravar_plano(
  uuid, text, uuid, text, text, integer, time, date, date, uuid, text, integer, jsonb)
  TO authenticated, service_role;


-- ============================================================
-- Ver o que uma regra vai gerar, antes de gravar
-- ============================================================
-- O botão "experimentar" do formulário. Devolve as próximas datas sem tocar
-- em nada — é a diferença entre confiar numa regra e verificá-la.

CREATE OR REPLACE FUNCTION public.rpc_ops_experimentar_regra(
  p_regra   text,
  p_de      date DEFAULT NULL,
  p_quantas integer DEFAULT 6
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_de    date := COALESCE(p_de, CURRENT_DATE);
  v_datas date[];
BEGIN
  BEGIN
    SELECT array_agg(d ORDER BY d) INTO v_datas
      FROM (
        SELECT d FROM public.ops_expandir_rrule(p_regra, v_de, v_de + 730) d
         ORDER BY d LIMIT GREATEST(1, LEAST(COALESCE(p_quantas, 6), 24))
      ) x;
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'erro', SQLERRM);
  END;

  RETURN jsonb_build_object(
    'ok', true,
    'datas', COALESCE(to_jsonb(v_datas), '[]'::jsonb)
  );
END
$$;

REVOKE ALL ON FUNCTION public.rpc_ops_experimentar_regra(text, date, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_ops_experimentar_regra(text, date, integer)
  TO authenticated, service_role;

COMMIT;


-- ============================================================
-- Verificação
-- ============================================================
DO $v$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM pg_proc
   WHERE pronamespace = 'public'::regnamespace
     AND proname IN ('ops_gravar_plano_impl','rpc_ops_gravar_plano','rpc_ops_experimentar_regra');
  IF n <> 3 THEN
    RAISE EXCEPTION 'Faltam funções de planos: esperava 3, encontrei %.', n;
  END IF;

  RAISE NOTICE 'Planos prontos. Já se cria um plano preventivo sem escrever SQL.';
END
$v$;
