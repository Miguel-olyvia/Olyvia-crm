-- =============================================================================
-- Olyvia · Operações — a máquina de estados, imposta na base
--
-- Até aqui as transições eram validadas no browser. O domínio decidia bem, mas
-- quem tivesse o token podia escrever `estado = 'confirmada'` diretamente e
-- saltar tudo: as guardas, as sessões de trabalho, o histórico. A RLS limitava
-- QUEM chega à ordem, nunca O QUE lhe pode fazer.
--
-- Este ficheiro fecha isso. Depois de o correr:
--
--   · o estado de uma ordem só muda através de `rpc_ops_transitar_ordem`;
--   · um UPDATE direto que mexa em `estado` é recusado por trigger;
--   · continuar a editar título, descrição ou responsável por UPDATE direto
--     mantém-se possível — não é o estado, não precisa de cerimónia.
--
-- Aditivo e idempotente. Só cria objetos `ops_*` e um trigger numa tabela
-- `ops_*`. Não toca em nada do CRM.
--
-- Correr DEPOIS de db/schema.sql.
-- =============================================================================

BEGIN;

DO $guarda$
BEGIN
  IF to_regclass('public.ops_ordem') IS NULL THEN
    RAISE EXCEPTION 'As tabelas de Operações não existem. Corre db/schema.sql primeiro.';
  END IF;
END
$guarda$;


-- ============================================================
-- 1. Custo de mão de obra
-- ============================================================
-- Apaga antes de inserir. Sem isto, reabrir e voltar a fechar uma ordem
-- duplicava a linha de custo — foi um defeito real, apanhado na construção.
--
-- Quem não tem custo/hora definido conta zero e é devolvido na resposta, para
-- o ecrã poder dizer que falta em vez de apresentar um total silenciosamente
-- errado.

CREATE OR REPLACE FUNCTION public.ops_recalcular_custo_mao_obra(_ordem_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_total     numeric(12,2) := 0;
  v_segundos  bigint := 0;
  v_sem_custo integer := 0;
  r           record;
BEGIN
  DELETE FROM public.ops_custo
   WHERE ordem_id = _ordem_id AND tipo = 'mao_obra' AND origem = 'calculado';

  FOR r IN
    SELECT s.utilizador_id,
           sum(EXTRACT(EPOCH FROM (COALESCE(s.fim, now()) - s.inicio)))::bigint AS segundos,
           max(p.custo_hora) AS custo_hora
      FROM public.ops_sessao_trabalho s
      JOIN public.ops_ordem o ON o.id = s.ordem_id
      LEFT JOIN public.ops_utilizador_perfil p
             ON p.utilizador_id = s.utilizador_id
            AND p.organization_id = o.organization_id
     WHERE s.ordem_id = _ordem_id
     GROUP BY s.utilizador_id
  LOOP
    v_segundos := v_segundos + GREATEST(r.segundos, 0);
    IF r.custo_hora IS NULL THEN
      IF r.segundos > 0 THEN v_sem_custo := v_sem_custo + 1; END IF;
    ELSE
      v_total := v_total + (GREATEST(r.segundos, 0) / 3600.0) * r.custo_hora;
    END IF;
  END LOOP;

  v_total := round(v_total, 2);

  IF v_segundos > 0 THEN
    INSERT INTO public.ops_custo (ordem_id, tipo, descricao, quantidade, valor_unit, total, origem)
    VALUES (_ordem_id, 'mao_obra',
            'Mão de obra — ' || to_char((v_segundos || ' seconds')::interval, 'HH24"h"MI"m"'),
            1, v_total, v_total, 'calculado');
  END IF;

  RETURN jsonb_build_object(
    'segundos', v_segundos,
    'total', v_total,
    'sem_custo_hora', v_sem_custo
  );
END
$$;


-- ============================================================
-- 2. A transição
-- ============================================================
-- Espelha `src/domain/estados.ts`. As duas cópias existem de propósito: a do
-- browser desenha os botões certos e responde de imediato; esta é a que manda.
-- Se divergirem, é esta que vale — e os testes em `supabase/tests` comparam-nas.

CREATE OR REPLACE FUNCTION public.rpc_ops_transitar_ordem(
  p_ordem_id        uuid,
  p_transicao       text,
  p_motivo          text DEFAULT NULL,
  p_retoma_prevista timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_user      uuid;
  v_funcao    text;
  v_o         record;
  v_atribuido boolean;
  v_de        text;
  v_para      text;
  v_pendentes integer;
  v_agora     timestamptz := now();
  v_motivo    text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_custo     jsonb := NULL;
BEGIN
  -- ── identidade ───────────────────────────────────────────────────────
  v_user := public.current_business_user_id();
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Sessão inválida.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_o FROM public.ops_ordem WHERE id = p_ordem_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ordem não encontrada.' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── âmbito ───────────────────────────────────────────────────────────
  IF NOT (
    public.is_system_admin_user(v_uid)
    OR v_o.organization_id IN (SELECT public.get_user_visible_org_ids(v_uid))
  ) THEN
    RAISE EXCEPTION 'Sem acesso a esta ordem.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ── função no módulo, NESTA organização ──────────────────────────────
  -- A função é por organização: pode ser gestor numa e técnico noutra.
  SELECT funcao INTO v_funcao
    FROM public.ops_utilizador_perfil
   WHERE utilizador_id = v_user
     AND organization_id = v_o.organization_id
     AND ativo;

  IF v_funcao IS NULL THEN
    IF public.is_system_admin_user(v_uid) THEN
      v_funcao := 'admin';
    ELSE
      RAISE EXCEPTION 'Sem função atribuída em Operações nesta organização.'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  v_de := v_o.estado;
  v_atribuido := (v_o.responsavel_id = v_user)
    OR EXISTS (SELECT 1 FROM public.ops_ordem_pessoa
                WHERE ordem_id = p_ordem_id AND utilizador_id = v_user);

  -- ── as regras ────────────────────────────────────────────────────────
  CASE p_transicao

    WHEN 'aprovar' THEN
      IF v_de <> 'por_aprovar' THEN RAISE EXCEPTION 'Só se aprova uma ordem por aprovar.'; END IF;
      IF v_funcao NOT IN ('admin','gestor') THEN RAISE EXCEPTION 'Sem permissão para aprovar.' USING ERRCODE='insufficient_privilege'; END IF;
      v_para := 'agendada';

    WHEN 'rejeitar' THEN
      IF v_de <> 'por_aprovar' THEN RAISE EXCEPTION 'Só se rejeita uma ordem por aprovar.'; END IF;
      IF v_funcao NOT IN ('admin','gestor') THEN RAISE EXCEPTION 'Sem permissão para rejeitar.' USING ERRCODE='insufficient_privilege'; END IF;
      IF v_motivo IS NULL THEN RAISE EXCEPTION 'Rejeitar exige um motivo.'; END IF;
      v_para := 'cancelada';

    WHEN 'iniciar' THEN
      IF v_de <> 'agendada' THEN RAISE EXCEPTION 'Só se inicia uma ordem agendada.'; END IF;
      IF v_funcao = 'tecnico' AND NOT v_atribuido THEN
        RAISE EXCEPTION 'Só quem está na ordem a pode iniciar.' USING ERRCODE='insufficient_privilege';
      END IF;
      v_para := 'em_curso';

    WHEN 'pausar' THEN
      IF v_de <> 'em_curso' THEN RAISE EXCEPTION 'Só se pausa uma ordem em curso.'; END IF;
      IF v_funcao = 'tecnico' AND NOT v_atribuido THEN
        RAISE EXCEPTION 'Só quem está na ordem a pode pausar.' USING ERRCODE='insufficient_privilege';
      END IF;
      IF v_motivo IS NULL THEN RAISE EXCEPTION 'Pausar exige um motivo.'; END IF;
      IF p_retoma_prevista IS NULL THEN RAISE EXCEPTION 'Pausar exige uma data de retoma prevista.'; END IF;
      v_para := 'pausada';

    WHEN 'retomar' THEN
      IF v_de <> 'pausada' THEN RAISE EXCEPTION 'Só se retoma uma ordem pausada.'; END IF;
      IF v_funcao = 'tecnico' AND NOT v_atribuido THEN
        RAISE EXCEPTION 'Só quem está na ordem a pode retomar.' USING ERRCODE='insufficient_privilege';
      END IF;
      v_para := 'em_curso';

    WHEN 'fechar' THEN
      IF v_de <> 'em_curso' THEN RAISE EXCEPTION 'Só se fecha uma ordem em curso.'; END IF;
      IF v_funcao = 'tecnico' AND NOT v_atribuido THEN
        RAISE EXCEPTION 'Só quem está na ordem a pode fechar.' USING ERRCODE='insufficient_privilege';
      END IF;
      SELECT count(*) INTO v_pendentes FROM public.ops_ordem_tarefa
       WHERE ordem_id = p_ordem_id AND obrigatoria AND estado = 'pendente';
      IF v_pendentes = 1 THEN
        RAISE EXCEPTION 'Falta responder a 1 tarefa obrigatória.';
      ELSIF v_pendentes > 1 THEN
        RAISE EXCEPTION 'Faltam responder a % tarefas obrigatórias.', v_pendentes;
      END IF;
      v_para := 'fechada';

    WHEN 'confirmar' THEN
      IF v_de <> 'fechada' THEN RAISE EXCEPTION 'Só se confirma uma ordem fechada.'; END IF;
      IF v_funcao NOT IN ('admin','gestor') THEN RAISE EXCEPTION 'Sem permissão para confirmar.' USING ERRCODE='insufficient_privilege'; END IF;
      v_para := 'confirmada';

    WHEN 'reabrir' THEN
      IF v_de <> 'fechada' THEN RAISE EXCEPTION 'Só se reabre uma ordem fechada.'; END IF;
      IF v_funcao NOT IN ('admin','gestor') THEN RAISE EXCEPTION 'Sem permissão para reabrir.' USING ERRCODE='insufficient_privilege'; END IF;
      v_para := 'em_curso';

    WHEN 'cancelar' THEN
      IF v_de NOT IN ('por_aprovar','agendada','em_curso','pausada') THEN
        RAISE EXCEPTION 'Não é possível cancelar uma ordem %.', replace(v_de,'_',' ');
      END IF;
      IF v_funcao NOT IN ('admin','gestor','operador') THEN RAISE EXCEPTION 'Sem permissão para cancelar.' USING ERRCODE='insufficient_privilege'; END IF;
      IF v_motivo IS NULL THEN RAISE EXCEPTION 'Cancelar exige um motivo.'; END IF;
      v_para := 'cancelada';

    ELSE
      RAISE EXCEPTION 'Transição desconhecida: %', p_transicao;
  END CASE;

  -- ── escrever ─────────────────────────────────────────────────────────
  -- Autoriza o trigger a deixar passar esta mudança de estado, e só esta.
  PERFORM set_config('ops.transicao', 'autorizada', true);

  UPDATE public.ops_ordem SET
    estado              = v_para,
    atualizada_em       = v_agora,
    aprovada_em         = CASE WHEN p_transicao = 'aprovar'   THEN v_agora ELSE aprovada_em END,
    aprovada_por        = CASE WHEN p_transicao = 'aprovar'   THEN v_user  ELSE aprovada_por END,
    iniciada_em         = CASE WHEN p_transicao = 'iniciar'   THEN COALESCE(iniciada_em, v_agora) ELSE iniciada_em END,
    fechada_em          = CASE WHEN p_transicao = 'fechar'    THEN v_agora
                               WHEN p_transicao = 'reabrir'   THEN NULL ELSE fechada_em END,
    confirmada_em       = CASE WHEN p_transicao = 'confirmar' THEN v_agora ELSE confirmada_em END,
    cancelada_em        = CASE WHEN p_transicao IN ('cancelar','rejeitar') THEN v_agora ELSE cancelada_em END,
    motivo_cancelamento = CASE WHEN p_transicao IN ('cancelar','rejeitar') THEN v_motivo ELSE motivo_cancelamento END,
    pausa_motivo        = CASE WHEN p_transicao = 'pausar'    THEN v_motivo
                               WHEN p_transicao = 'retomar'   THEN NULL ELSE pausa_motivo END,
    pausa_retoma_prevista = CASE WHEN p_transicao = 'pausar'  THEN p_retoma_prevista
                                 WHEN p_transicao = 'retomar' THEN NULL ELSE pausa_retoma_prevista END
  WHERE id = p_ordem_id;

  PERFORM set_config('ops.transicao', '', true);

  -- ── sessões de trabalho ──────────────────────────────────────────────
  -- É isto que faz o custo de mão de obra existir. Abrir ao iniciar e
  -- retomar; encerrar ao pausar e fechar.
  IF p_transicao IN ('iniciar','retomar') THEN
    IF NOT EXISTS (SELECT 1 FROM public.ops_sessao_trabalho
                    WHERE ordem_id = p_ordem_id AND utilizador_id = v_user AND fim IS NULL) THEN
      INSERT INTO public.ops_sessao_trabalho (ordem_id, utilizador_id, inicio, origem)
      VALUES (p_ordem_id, v_user, v_agora, 'web');
    END IF;
  END IF;

  IF p_transicao IN ('pausar','fechar','cancelar','rejeitar') THEN
    UPDATE public.ops_sessao_trabalho SET fim = v_agora
     WHERE ordem_id = p_ordem_id AND fim IS NULL;
  END IF;

  IF p_transicao = 'fechar' THEN
    v_custo := public.ops_recalcular_custo_mao_obra(p_ordem_id);
  END IF;

  -- ── histórico ────────────────────────────────────────────────────────
  INSERT INTO public.ops_evento
    (organization_id, entidade, entidade_id, tipo, descricao, autor_id, antes, depois)
  VALUES
    (v_o.organization_id, 'ordem', p_ordem_id, p_transicao, v_motivo, v_user,
     jsonb_build_object('estado', v_de),
     jsonb_build_object('estado', v_para));

  RETURN jsonb_build_object(
    'ok', true, 'de', v_de, 'para', v_para, 'custo_mao_obra', v_custo
  );
END
$$;


-- ============================================================
-- 3. A fechadura
-- ============================================================
-- Sem isto, tudo acima é conselho e não regra: bastava um UPDATE direto para
-- pôr uma ordem em qualquer estado.
--
-- O trigger deixa passar a mudança de estado apenas quando a RPC a autorizou
-- na mesma transação. Alterações a título, descrição ou responsável continuam
-- a passar por UPDATE direto — não são o estado.

CREATE OR REPLACE FUNCTION public.ops_guarda_estado()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.estado IS DISTINCT FROM OLD.estado
     AND coalesce(current_setting('ops.transicao', true), '') <> 'autorizada' THEN
    RAISE EXCEPTION
      'O estado de uma ordem só muda através de rpc_ops_transitar_ordem(). Tentativa: % → %.',
      OLD.estado, NEW.estado
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS ops_ordem_guarda_estado ON public.ops_ordem;
CREATE TRIGGER ops_ordem_guarda_estado
  BEFORE UPDATE ON public.ops_ordem
  FOR EACH ROW EXECUTE FUNCTION public.ops_guarda_estado();


-- ============================================================
-- 4. Grants
-- ============================================================

REVOKE ALL ON FUNCTION public.rpc_ops_transitar_ordem(uuid, text, text, timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ops_recalcular_custo_mao_obra(uuid)                     FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_ops_transitar_ordem(uuid, text, text, timestamptz) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ops_recalcular_custo_mao_obra(uuid)                    TO service_role;


-- ============================================================
-- 5. Verificação
-- ============================================================

DO $verificar$
DECLARE v_rpc integer; v_trg integer;
BEGIN
  SELECT count(*) INTO v_rpc FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname IN ('rpc_ops_transitar_ordem','ops_recalcular_custo_mao_obra','ops_guarda_estado');
  SELECT count(*) INTO v_trg FROM pg_trigger WHERE tgname = 'ops_ordem_guarda_estado' AND NOT tgisinternal;

  IF v_rpc <> 3 THEN RAISE EXCEPTION 'Esperadas 3 funções, encontradas %', v_rpc; END IF;
  IF v_trg <> 1 THEN RAISE EXCEPTION 'O trigger de guarda não ficou instalado.'; END IF;

  RAISE NOTICE 'Operações: máquina de estados imposta na base. UPDATE direto ao estado passa a ser recusado.';
END
$verificar$;

COMMIT;
