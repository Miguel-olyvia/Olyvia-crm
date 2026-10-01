-- ============================================================
--  Operações — tempo real por pessoa e por tarefa
-- ============================================================
--  Correr DEPOIS de: seguranca.sql.
--  Correr ANTES de:  obras.sql.
--
--  O tempo é o que faz o custo de mão de obra existir. Três defeitos faziam
--  esse número mentir:
--
--   1. INICIAR abria sessão só para quem carregava no botão, mas PAUSAR e
--      FECHAR fechavam as de toda a gente. Numa equipa de três, depois de uma
--      pausa só um voltava a contar — os outros trabalhavam de graça.
--      Agora cada pessoa liga e desliga o SEU relógio (`rpc_ops_sessao`).
--      As transições só mexem no que é delas:
--        · iniciar/retomar abrem o relógio de quem carrega no botão, se essa
--          pessoa está na ordem (ou se a ordem não tem equipa — então quem a
--          inicia é quem a faz). Um gestor que inicia à distância não conta;
--        · pausar, fechar, cancelar e rejeitar fecham os relógios de todos,
--          porque a ordem parou para todos — e fica escrito porquê
--          (`motivo_fim`);
--        · os outros da equipa voltam a contar quando eles próprios entram.
--
--   2. Responder a uma tarefa escrevia `inicio` e `fim` no mesmo instante:
--      o tempo por tarefa era sempre zero. Agora uma sessão pode ser de uma
--      tarefa (`ordem_tarefa_id`): `rpc_ops_tarefa_iniciar` começa a contar
--      nessa tarefa, e responder-lhe (ou `rpc_ops_tarefa_terminar`) fecha-a e
--      continua a contar na ordem — responder não é ir embora.
--      `ops_v_tarefa_tempo` mostra real contra `tempo_estimado`.
--
--   3. A mão de obra só se calculava ao fechar. Uma obra de três semanas
--      mostrava 0,00 € até ao último dia. `ops_v_ordem_custo` passa a contar
--      as sessões ao vivo (as abertas até agora) enquanto a ordem não está
--      fechada; fechada ou confirmada, vale a linha calculada no fecho. Uma
--      fonte de cada vez — nunca as duas somadas.
--
--  Também aqui: a transição `confirmar` (e `reabrir`) passa a aceitar o
--  supervisor, que é quem valida o trabalho no terreno.
--
--  Escreve fora de `ops_*`? NÃO.
-- ============================================================

BEGIN;

DO $guarda$
BEGIN
  IF to_regprocedure('public.ops_pode(uuid,text)') IS NULL
     OR to_regprocedure('public.ops_nivel_funcao(text)') IS NULL THEN
    RAISE EXCEPTION 'Falta db/seguranca.sql. Corre-o primeiro.';
  END IF;
END
$guarda$;


-- ============================================================
-- 1. Sessões: de que tarefa, e porque acabaram
-- ============================================================

ALTER TABLE public.ops_sessao_trabalho
  -- NULL = tempo na ordem sem tarefa em particular (deslocação, preparação…)
  ADD COLUMN IF NOT EXISTS ordem_tarefa_id uuid
    REFERENCES public.ops_ordem_tarefa(id) ON DELETE SET NULL,
  -- Porque é que o relógio parou. Sem isto não se distingue "fui almoçar" de
  -- "o gestor pausou a ordem".
  ADD COLUMN IF NOT EXISTS motivo_fim text;

ALTER TABLE public.ops_sessao_trabalho DROP CONSTRAINT IF EXISTS ops_sessao_motivo_fim_check;
ALTER TABLE public.ops_sessao_trabalho
  ADD CONSTRAINT ops_sessao_motivo_fim_check CHECK (
    motivo_fim IS NULL
    OR motivo_fim IN ('pessoa','troca','tarefa','pausa','fecho','cancelamento'));

CREATE INDEX IF NOT EXISTS ops_sessao_tarefa_idx
  ON public.ops_sessao_trabalho (ordem_tarefa_id) WHERE ordem_tarefa_id IS NOT NULL;

-- Uma pessoa tem, no máximo, UM relógio aberto por ordem. Duas sessões
-- abertas da mesma pessoa contavam o mesmo minuto duas vezes.
--
-- Se já houver duplicados (não devia — a RPC verificava antes de abrir), a
-- mais antiga fica e as outras fecham no próprio instante em que abriram:
-- duração zero, nada inventado, nada apagado.
UPDATE public.ops_sessao_trabalho s
   SET fim = s.inicio, motivo_fim = 'pessoa'
 WHERE s.fim IS NULL
   AND EXISTS (
     SELECT 1 FROM public.ops_sessao_trabalho x
      WHERE x.ordem_id = s.ordem_id AND x.utilizador_id = s.utilizador_id
        AND x.fim IS NULL
        AND (x.inicio, x.id) < (s.inicio, s.id));

CREATE UNIQUE INDEX IF NOT EXISTS ops_sessao_uma_aberta
  ON public.ops_sessao_trabalho (ordem_id, utilizador_id) WHERE fim IS NULL;


-- ============================================================
-- 2. Abrir e fechar relógios — peças internas
-- ============================================================
-- Não são dadas a `authenticated`: só se chega aqui pelas RPCs, que já
-- verificaram quem é quem.

CREATE OR REPLACE FUNCTION public.ops_sessao_fechar(
  _ordem_id uuid,
  _user     uuid,        -- NULL = de toda a gente
  _motivo   text,
  _agora    timestamptz DEFAULT now()
)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_n integer;
BEGIN
  UPDATE public.ops_sessao_trabalho
     SET fim = GREATEST(_agora, inicio), motivo_fim = _motivo
   WHERE ordem_id = _ordem_id AND fim IS NULL
     AND (_user IS NULL OR utilizador_id = _user);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END
$$;

-- Abre o relógio de uma pessoa, na ordem ou numa tarefa. Se já tinha um
-- aberto noutra coisa, fecha-o primeiro ('troca'): a pessoa mudou de tarefa,
-- não se desdobrou.
CREATE OR REPLACE FUNCTION public.ops_sessao_abrir(
  _ordem_id  uuid,
  _user      uuid,
  _tarefa_id uuid DEFAULT NULL,
  _agora     timestamptz DEFAULT now()
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_id uuid;
BEGIN
  SELECT id INTO v_id FROM public.ops_sessao_trabalho
   WHERE ordem_id = _ordem_id AND utilizador_id = _user AND fim IS NULL
     AND ordem_tarefa_id IS NOT DISTINCT FROM _tarefa_id;
  IF v_id IS NOT NULL THEN
    RETURN v_id;     -- já está a contar nisso mesmo
  END IF;

  PERFORM public.ops_sessao_fechar(_ordem_id, _user, 'troca', _agora);

  INSERT INTO public.ops_sessao_trabalho (ordem_id, utilizador_id, inicio, origem, ordem_tarefa_id)
  VALUES (_ordem_id, _user, _agora, 'web', _tarefa_id)
  RETURNING id INTO v_id;
  RETURN v_id;
END
$$;

REVOKE ALL ON FUNCTION public.ops_sessao_fechar(uuid, uuid, text, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ops_sessao_abrir(uuid, uuid, uuid, timestamptz)   FROM PUBLIC, anon, authenticated;


-- ============================================================
-- 3. A transição — a versão que vale
-- ============================================================
-- Espelha `src/domain/estados.ts`. A paridade das duas é verificada por
-- `tools/validar-estados.mjs`, que corre TODAS as combinações de estado,
-- transição, função e atribuição contra esta função e contra o TypeScript.
--
-- Diferenças para a versão de rpcs.sql:
--   · confirmar e reabrir: admin, gestor e SUPERVISOR;
--   · cancelar: também o supervisor (está acima do operador);
--   · sessões: ver o cabeçalho deste ficheiro.

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
  v_sem_equipa boolean;
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
  -- COALESCE: numa ordem sem responsável, `NULL = x` dá NULL, e `NOT NULL`
  -- não recusa nada — um técnico de fora passava (auditoria 01/10/2026).
  v_atribuido := COALESCE(v_o.responsavel_id = v_user, false)
    OR EXISTS (SELECT 1 FROM public.ops_ordem_pessoa
                WHERE ordem_id = p_ordem_id AND utilizador_id = v_user);
  v_sem_equipa := v_o.responsavel_id IS NULL
    AND NOT EXISTS (SELECT 1 FROM public.ops_ordem_pessoa WHERE ordem_id = p_ordem_id);

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

    -- Validar o trabalho: confirmar que ficou bem, ou devolvê-lo.
    WHEN 'confirmar' THEN
      IF v_de <> 'fechada' THEN RAISE EXCEPTION 'Só se confirma uma ordem fechada.'; END IF;
      IF v_funcao NOT IN ('admin','gestor','supervisor') THEN RAISE EXCEPTION 'Sem permissão para confirmar.' USING ERRCODE='insufficient_privilege'; END IF;
      v_para := 'confirmada';

    WHEN 'reabrir' THEN
      IF v_de <> 'fechada' THEN RAISE EXCEPTION 'Só se reabre uma ordem fechada.'; END IF;
      IF v_funcao NOT IN ('admin','gestor','supervisor') THEN RAISE EXCEPTION 'Sem permissão para reabrir.' USING ERRCODE='insufficient_privilege'; END IF;
      v_para := 'em_curso';

    WHEN 'cancelar' THEN
      IF v_de NOT IN ('por_aprovar','agendada','em_curso','pausada') THEN
        RAISE EXCEPTION 'Não é possível cancelar uma ordem %.', replace(v_de,'_',' ');
      END IF;
      IF v_funcao NOT IN ('admin','gestor','supervisor','operador') THEN RAISE EXCEPTION 'Sem permissão para cancelar.' USING ERRCODE='insufficient_privilege'; END IF;
      IF v_motivo IS NULL THEN RAISE EXCEPTION 'Cancelar exige um motivo.'; END IF;
      v_para := 'cancelada';

    ELSE
      RAISE EXCEPTION 'Transição desconhecida: %', p_transicao;
  END CASE;

  -- ── escrever ─────────────────────────────────────────────────────────
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

  -- ── relógios ─────────────────────────────────────────────────────────
  -- Cada um liga o seu. A transição só liga o de quem carregou no botão, e
  -- só se essa pessoa vai mesmo trabalhar (está na ordem, ou a ordem não
  -- tem equipa). Parar a ordem pára toda a gente, com o motivo escrito.
  IF p_transicao IN ('iniciar','retomar') AND (v_atribuido OR v_sem_equipa) THEN
    PERFORM public.ops_sessao_abrir(p_ordem_id, v_user, NULL, v_agora);
  END IF;

  IF p_transicao = 'pausar' THEN
    PERFORM public.ops_sessao_fechar(p_ordem_id, NULL, 'pausa', v_agora);
  ELSIF p_transicao = 'fechar' THEN
    PERFORM public.ops_sessao_fechar(p_ordem_id, NULL, 'fecho', v_agora);
  ELSIF p_transicao IN ('cancelar','rejeitar') THEN
    PERFORM public.ops_sessao_fechar(p_ordem_id, NULL, 'cancelamento', v_agora);
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

REVOKE ALL ON FUNCTION public.rpc_ops_transitar_ordem(uuid, text, text, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_ops_transitar_ordem(uuid, text, text, timestamptz) TO authenticated, service_role;


-- ============================================================
-- 4. Quem pode mexer no relógio de uma ordem
-- ============================================================
-- A mesma pergunta para as três RPCs abaixo. Devolve a ordem e o utilizador,
-- ou rebenta com uma frase que se pode ler.

CREATE OR REPLACE FUNCTION public.ops_contexto_de_execucao(_ordem_id uuid)
RETURNS TABLE (utilizador_id uuid, funcao text, organization_id uuid, estado text, atribuido boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_o      record;
  v_user   uuid;
  v_funcao text;
  v_atr    boolean;
BEGIN
  SELECT * INTO v_o FROM public.ops_ordem WHERE id = _ordem_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ordem não encontrada.' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT q.utilizador_id, q.funcao INTO v_user, v_funcao
    FROM public.ops_quem_sou(v_o.organization_id) q;

  IF NOT public.ops_pode(v_o.organization_id, 'operations.orders.execute') THEN
    RAISE EXCEPTION 'Sem permissão para executar ordens.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_atr := COALESCE(v_o.responsavel_id = v_user, false)
    OR EXISTS (SELECT 1 FROM public.ops_ordem_pessoa op
                WHERE op.ordem_id = _ordem_id AND op.utilizador_id = v_user);

  IF v_funcao = 'tecnico' AND NOT v_atr THEN
    RAISE EXCEPTION 'Só quem está na ordem conta tempo nela.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY SELECT v_user, v_funcao, v_o.organization_id, v_o.estado, v_atr;
END
$$;

REVOKE ALL ON FUNCTION public.ops_contexto_de_execucao(uuid) FROM PUBLIC, anon, authenticated;


-- ============================================================
-- 5. O meu relógio: entrar e sair
-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_ops_sessao(p_ordem_id uuid, p_acao text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_c  record;
  v_id uuid;
  v_n  integer := 0;
BEGIN
  IF p_acao NOT IN ('entrar','sair') THEN
    RAISE EXCEPTION 'Ação desconhecida: %. Vale entrar ou sair.', p_acao;
  END IF;

  SELECT * INTO v_c FROM public.ops_contexto_de_execucao(p_ordem_id);

  IF p_acao = 'entrar' THEN
    IF v_c.estado <> 'em_curso' THEN
      RAISE EXCEPTION 'Só se conta tempo numa ordem em curso (esta está %).',
        replace(v_c.estado, '_', ' ');
    END IF;
    -- Já a contar (na ordem ou numa tarefa)? Fica como está.
    SELECT id INTO v_id FROM public.ops_sessao_trabalho
     WHERE ordem_id = p_ordem_id AND utilizador_id = v_c.utilizador_id AND fim IS NULL;
    IF v_id IS NULL THEN
      v_id := public.ops_sessao_abrir(p_ordem_id, v_c.utilizador_id, NULL, now());
    END IF;
    RETURN jsonb_build_object('ok', true, 'a_contar', true, 'sessao_id', v_id);
  END IF;

  v_n := public.ops_sessao_fechar(p_ordem_id, v_c.utilizador_id, 'pessoa', now());
  RETURN jsonb_build_object('ok', true, 'a_contar', false, 'fechadas', v_n);
END
$$;

REVOKE ALL ON FUNCTION public.rpc_ops_sessao(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_ops_sessao(uuid, text) TO authenticated, service_role;


-- ============================================================
-- 6. Tempo por tarefa
-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_ops_tarefa_iniciar(p_tarefa_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_t  record;
  v_c  record;
  v_id uuid;
BEGIN
  SELECT * INTO v_t FROM public.ops_ordem_tarefa WHERE id = p_tarefa_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tarefa não encontrada.' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT * INTO v_c FROM public.ops_contexto_de_execucao(v_t.ordem_id);

  IF v_c.estado <> 'em_curso' THEN
    RAISE EXCEPTION 'Só se começa uma tarefa de uma ordem em curso (esta está %).',
      replace(v_c.estado, '_', ' ');
  END IF;
  IF v_t.estado <> 'pendente' THEN
    RAISE EXCEPTION 'Essa tarefa já está respondida.';
  END IF;

  v_id := public.ops_sessao_abrir(v_t.ordem_id, v_c.utilizador_id, p_tarefa_id, now());

  -- O início da tarefa é a primeira vez que alguém lhe pegou.
  UPDATE public.ops_ordem_tarefa SET inicio = COALESCE(inicio, now())
   WHERE id = p_tarefa_id;

  RETURN jsonb_build_object('ok', true, 'sessao_id', v_id);
END
$$;

-- Parar de contar numa tarefa SEM a responder (vou buscar uma peça). O
-- relógio continua na ordem: parar a tarefa não é ir embora.
CREATE OR REPLACE FUNCTION public.rpc_ops_tarefa_terminar(p_tarefa_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_t  record;
  v_c  record;
  v_n  integer;
  v_s  bigint;
BEGIN
  SELECT * INTO v_t FROM public.ops_ordem_tarefa WHERE id = p_tarefa_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tarefa não encontrada.' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT * INTO v_c FROM public.ops_contexto_de_execucao(v_t.ordem_id);

  UPDATE public.ops_sessao_trabalho
     SET fim = GREATEST(now(), inicio), motivo_fim = 'tarefa'
   WHERE ordem_id = v_t.ordem_id AND utilizador_id = v_c.utilizador_id
     AND ordem_tarefa_id = p_tarefa_id AND fim IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;

  IF v_n > 0 AND v_c.estado = 'em_curso' THEN
    PERFORM public.ops_sessao_abrir(v_t.ordem_id, v_c.utilizador_id, NULL, now());
  END IF;

  SELECT COALESCE(sum(EXTRACT(EPOCH FROM (COALESCE(fim, now()) - inicio))), 0)::bigint INTO v_s
    FROM public.ops_sessao_trabalho WHERE ordem_tarefa_id = p_tarefa_id;

  RETURN jsonb_build_object('ok', true, 'fechadas', v_n, 'segundos_na_tarefa', v_s);
END
$$;

REVOKE ALL ON FUNCTION public.rpc_ops_tarefa_iniciar(uuid)  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_ops_tarefa_terminar(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_ops_tarefa_iniciar(uuid)  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_ops_tarefa_terminar(uuid) TO authenticated, service_role;

-- ── Responder a uma tarefa fecha o relógio dela, e continua na ordem ─────
-- Num trigger, e não nas RPCs de resposta, porque há duas (tarefa e
-- medição) e as duas mudam o estado da tarefa. Uma regra, um sítio.
--
-- BEFORE: o `inicio` da tarefa passa a ser o da primeira sessão nela, em vez
-- do instante da resposta. AFTER: as sessões abertas nessa tarefa fecham, e
-- quem estava nelas continua a contar na ordem.

CREATE OR REPLACE FUNCTION public.ops_tarefa_tempo_antes()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.estado <> 'pendente' AND NEW.estado IS DISTINCT FROM OLD.estado THEN
    NEW.inicio := COALESCE(
      (SELECT min(s.inicio) FROM public.ops_sessao_trabalho s WHERE s.ordem_tarefa_id = NEW.id),
      OLD.inicio, NEW.inicio);
  END IF;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION public.ops_tarefa_tempo_depois()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  r       record;
  v_agora timestamptz := now();
  v_curso boolean;
BEGIN
  IF NEW.estado = 'pendente' OR NEW.estado IS NOT DISTINCT FROM OLD.estado THEN
    RETURN NULL;
  END IF;

  SELECT estado = 'em_curso' INTO v_curso FROM public.ops_ordem WHERE id = NEW.ordem_id;

  FOR r IN
    UPDATE public.ops_sessao_trabalho
       SET fim = GREATEST(v_agora, inicio), motivo_fim = 'tarefa'
     WHERE ordem_tarefa_id = NEW.id AND fim IS NULL
    RETURNING utilizador_id
  LOOP
    IF v_curso THEN
      INSERT INTO public.ops_sessao_trabalho (ordem_id, utilizador_id, inicio, origem)
      VALUES (NEW.ordem_id, r.utilizador_id, v_agora, 'web')
      ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;

  RETURN NULL;
END
$$;

REVOKE ALL ON FUNCTION public.ops_tarefa_tempo_antes()  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ops_tarefa_tempo_depois() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS ops_tarefa_tempo_antes ON public.ops_ordem_tarefa;
CREATE TRIGGER ops_tarefa_tempo_antes
  BEFORE UPDATE ON public.ops_ordem_tarefa
  FOR EACH ROW EXECUTE FUNCTION public.ops_tarefa_tempo_antes();

DROP TRIGGER IF EXISTS ops_tarefa_tempo_depois ON public.ops_ordem_tarefa;
CREATE TRIGGER ops_tarefa_tempo_depois
  AFTER UPDATE ON public.ops_ordem_tarefa
  FOR EACH ROW EXECUTE FUNCTION public.ops_tarefa_tempo_depois();


-- ============================================================
-- 7. Mão de obra ao vivo
-- ============================================================
-- O mesmo cálculo de `ops_recalcular_custo_mao_obra`, sem escrever nada:
-- tempo de cada pessoa (as sessões abertas contam até agora) × o custo/hora
-- dela nesta organização.
--
-- SECURITY DEFINER porque o custo/hora está escondido pela RLS — e por isso
-- verifica à mão: só quem vê a ordem recebe o tempo, e só quem vê custos
-- NESTA organização recebe euros.

CREATE OR REPLACE FUNCTION public.ops_mao_obra_viva(_ordem_id uuid)
RETURNS TABLE (segundos bigint, total numeric(12,2), sessoes_abertas integer, sem_custo_hora integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_org   uuid;
  v_uid   uuid := auth.uid();
  v_seg   bigint := 0;
  v_total numeric := 0;
  v_ab    integer := 0;
  v_sem   integer := 0;
  r       record;
BEGIN
  SELECT organization_id INTO v_org FROM public.ops_ordem WHERE id = _ordem_id;
  IF v_org IS NULL THEN RETURN; END IF;
  IF v_uid IS NOT NULL AND NOT public.ops_pode_ver_ordem(v_uid, _ordem_id) THEN RETURN; END IF;

  FOR r IN
    SELECT s.utilizador_id,
           sum(GREATEST(EXTRACT(EPOCH FROM (COALESCE(s.fim, now()) - s.inicio)), 0))::bigint AS seg,
           count(*) FILTER (WHERE s.fim IS NULL)::integer AS abertas,
           max(p.custo_hora) AS custo_hora
      FROM public.ops_sessao_trabalho s
      LEFT JOIN public.ops_utilizador_perfil p
             ON p.utilizador_id = s.utilizador_id AND p.organization_id = v_org
     WHERE s.ordem_id = _ordem_id
     GROUP BY s.utilizador_id
  LOOP
    v_seg := v_seg + r.seg;
    v_ab  := v_ab + r.abertas;
    IF r.custo_hora IS NULL THEN
      IF r.seg > 0 THEN v_sem := v_sem + 1; END IF;
    ELSE
      v_total := v_total + (r.seg / 3600.0) * r.custo_hora;
    END IF;
  END LOOP;

  RETURN QUERY SELECT
    v_seg,
    CASE WHEN v_uid IS NULL OR public.ops_pode(v_org, 'operations.costs.view')
         THEN round(v_total, 2)::numeric(12,2) END,
    v_ab,
    v_sem;
END
$$;

REVOKE ALL ON FUNCTION public.ops_mao_obra_viva(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ops_mao_obra_viva(uuid) TO authenticated, service_role;

-- Previsto contra real, com a mão de obra ao vivo.
--
-- As colunas de sempre ficam no mesmo sítio e com o mesmo tipo (é o que o
-- `CREATE OR REPLACE VIEW` exige, e o que a app já lê). As novas vão no fim.
--
-- A regra que evita contar duas vezes:
--   · ordem fechada ou confirmada → a mão de obra é a linha 'calculado' que
--     o fecho escreveu em `ops_custo` (é o número que fica para a história);
--   · qualquer outro estado → a mão de obra sai das sessões, ao vivo, e a
--     linha 'calculado' (se ficou de um fecho anterior, antes de reabrir) é
--     ignorada.
-- Mão de obra lançada à mão (não devia haver — a RPC recusa) soma sempre.
--
-- Só mostra linhas a quem vê custos NESSA organização: para os outros a
-- vista vem vazia, que é o que a app espera ("sem permissão = sem números").

CREATE OR REPLACE VIEW public.ops_v_ordem_custo
WITH (security_invoker = true) AS
SELECT
  o.id                       AS ordem_id,
  o.organization_id,
  o.codigo,
  o.titulo,
  o.estado,
  o.orcamento_id,
  p.previsto,
  r.real_material,
  m.real_mao_obra,
  r.real_outros,
  (COALESCE(r.real_material, 0) + COALESCE(m.real_mao_obra, 0)
   + COALESCE(r.real_outros, 0))::numeric(12,2) AS real_total,
  CASE WHEN p.previsto IS NULL THEN NULL
       ELSE (COALESCE(r.real_material, 0) + COALESCE(m.real_mao_obra, 0)
             + COALESCE(r.real_outros, 0) - p.previsto)::numeric(12,2)
  END                        AS desvio,
  CASE WHEN p.previsto IS NULL OR p.previsto = 0 THEN NULL
       ELSE round((COALESCE(r.real_material, 0) + COALESCE(m.real_mao_obra, 0)
                   + COALESCE(r.real_outros, 0) - p.previsto) / p.previsto * 100, 1)
  END                        AS desvio_percent,
  -- ── novas ──
  COALESCE(v.segundos, 0)::bigint           AS segundos_trabalho,
  COALESCE(v.sessoes_abertas, 0)::integer   AS sessoes_abertas,
  (o.estado NOT IN ('fechada','confirmada') AND COALESCE(v.sessoes_abertas, 0) > 0)
                                            AS mao_obra_em_curso,
  COALESCE(v.sem_custo_hora, 0)::integer    AS sem_custo_hora
FROM public.ops_ordem o
LEFT JOIN LATERAL (
  SELECT sum(x.total_sem_iva)::numeric(12,2) AS previsto
    FROM public.ops_ordem_previsto x WHERE x.ordem_id = o.id
) p ON true
LEFT JOIN LATERAL (
  SELECT
    sum(c.total) FILTER (WHERE c.tipo = 'material')::numeric(12,2)                         AS real_material,
    sum(c.total) FILTER (WHERE c.tipo = 'mao_obra' AND c.origem = 'calculado')::numeric(12,2) AS mao_obra_fecho,
    sum(c.total) FILTER (WHERE c.tipo = 'mao_obra' AND c.origem <> 'calculado')::numeric(12,2) AS mao_obra_manual,
    sum(c.total) FILTER (WHERE c.tipo NOT IN ('material','mao_obra'))::numeric(12,2)       AS real_outros
    FROM public.ops_custo c WHERE c.ordem_id = o.id
) r ON true
LEFT JOIN LATERAL public.ops_mao_obra_viva(o.id) v ON true
LEFT JOIN LATERAL (
  SELECT (CASE
           WHEN o.estado IN ('fechada','confirmada') AND r.mao_obra_fecho IS NULL AND r.mao_obra_manual IS NULL
             THEN NULL
           WHEN o.estado IN ('fechada','confirmada')
             THEN (COALESCE(r.mao_obra_fecho, 0) + COALESCE(r.mao_obra_manual, 0))::numeric(12,2)
           WHEN COALESCE(v.segundos, 0) = 0 AND r.mao_obra_manual IS NULL
             THEN NULL
           ELSE (COALESCE(v.total, 0) + COALESCE(r.mao_obra_manual, 0))::numeric(12,2)
         END)::numeric(12,2) AS real_mao_obra
) m ON true
WHERE (SELECT auth.uid()) IS NULL
   OR public.ops_pode(o.organization_id, 'operations.costs.view');

REVOKE ALL ON public.ops_v_ordem_custo FROM PUBLIC, anon;
GRANT SELECT ON public.ops_v_ordem_custo TO authenticated, service_role;


-- ============================================================
-- 8. Real contra estimado, tarefa a tarefa
-- ============================================================
-- `security_invoker`: a RLS das tarefas e das sessões aplica-se a quem lê —
-- só vê o tempo das tarefas das ordens que vê.

CREATE OR REPLACE VIEW public.ops_v_tarefa_tempo
WITH (security_invoker = true) AS
SELECT
  t.id                                   AS ordem_tarefa_id,
  t.ordem_id,
  t.nome,
  t.estado,
  t.tempo_estimado,                      -- segundos
  COALESCE(s.segundos, 0)::bigint        AS tempo_real,
  COALESCE(s.abertas, 0) > 0             AS a_contar,
  COALESCE(s.quem, ARRAY[]::uuid[])      AS a_contar_por,
  CASE WHEN t.tempo_estimado > 0
       THEN (COALESCE(s.segundos, 0) - t.tempo_estimado)::bigint END AS desvio,
  t.inicio,
  t.fim
FROM public.ops_ordem_tarefa t
LEFT JOIN LATERAL (
  SELECT sum(GREATEST(EXTRACT(EPOCH FROM (COALESCE(x.fim, now()) - x.inicio)), 0))::bigint AS segundos,
         count(*) FILTER (WHERE x.fim IS NULL)::integer                                   AS abertas,
         array_agg(x.utilizador_id) FILTER (WHERE x.fim IS NULL)                          AS quem
    FROM public.ops_sessao_trabalho x
   WHERE x.ordem_tarefa_id = t.id
) s ON true;

REVOKE ALL ON public.ops_v_tarefa_tempo FROM PUBLIC, anon;
GRANT SELECT ON public.ops_v_tarefa_tempo TO authenticated, service_role;

COMMIT;


-- ============================================================
-- Verificação
-- ============================================================
DO $v$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM pg_proc
   WHERE pronamespace = 'public'::regnamespace
     AND proname IN ('ops_sessao_fechar','ops_sessao_abrir','ops_contexto_de_execucao',
                     'rpc_ops_sessao','rpc_ops_tarefa_iniciar','rpc_ops_tarefa_terminar',
                     'ops_tarefa_tempo_antes','ops_tarefa_tempo_depois','ops_mao_obra_viva');
  IF n <> 9 THEN
    RAISE EXCEPTION 'Faltam funções de tempo: esperava 9, encontrei %.', n;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'ops_sessao_uma_aberta') THEN
    RAISE EXCEPTION 'Falta a regra de um relógio aberto por pessoa e ordem.';
  END IF;

  IF (SELECT count(*) FROM pg_class
       WHERE relname IN ('ops_v_ordem_custo','ops_v_tarefa_tempo')
         AND relnamespace = 'public'::regnamespace
         AND 'security_invoker=true' = ANY (reloptions)) <> 2 THEN
    RAISE EXCEPTION 'Uma das vistas de tempo ficou sem security_invoker.';
  END IF;

  IF position('supervisor' IN pg_get_functiondef(
       'public.rpc_ops_transitar_ordem(uuid,text,text,timestamptz)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'A transição em vigor não é a deste ficheiro (falta o supervisor).';
  END IF;

  IF has_function_privilege('authenticated', 'public.ops_sessao_abrir(uuid,uuid,uuid,timestamptz)', 'EXECUTE') THEN
    RAISE EXCEPTION 'ops_sessao_abrir ficou ao alcance de authenticated.';
  END IF;

  RAISE NOTICE 'Tempos prontos: cada um conta o seu, por tarefa, e a mão de obra vê-se ao vivo.';
END
$v$;
