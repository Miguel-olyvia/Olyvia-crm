-- =============================================================================
-- Operações sem rede — as ações feitas no telemóvel sem ligação (06/10/2026)
--
-- Corre DEPOIS de db/obras.sql. Idempotente: pode correr-se as vezes que for.
--
-- Porquê no servidor, e não só no telemóvel: o técnico carrega em "Iniciar" às
-- 10:00 numa cave sem rede e a ação só chega à base às 12:00. As RPCs normais
-- usam now(), e a tarefa ficava com duas horas a menos — e, no "Terminar", a
-- justificação era pedida (ou não) com o tempo errado. E uma ação que chegou
-- à base mas cuja resposta se perdeu na rede não pode ser aplicada duas vezes.
--
-- Por isso:
--   · cada ação traz um identificador gerado no telemóvel (p_acao_id). A
--     segunda vez que chega, devolve-se o resultado da primeira — não se
--     aplica outra vez;
--   · cada ação traz a hora do telemóvel (p_quando). Usa-se essa hora, mas
--     nunca no futuro, nunca há mais de 72 h, e nunca antes do fim do último
--     relógio da pessoa (não se sobrepõem tempos);
--   · as regras são as das RPCs de sempre (rpc_ops_obra_iniciar_tarefa e
--     rpc_ops_obra_terminar_tarefa são chamadas por dentro): quem pode, que
--     estados, a justificação obrigatória. Se uma recusar, nada fica escrito.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.ops_offline_acao (
  id              uuid PRIMARY KEY,                 -- gerado no telemóvel
  organization_id uuid NOT NULL,
  utilizador_id   uuid NOT NULL,                    -- → anew_users.id
  tipo            text NOT NULL,
  tarefa_id       uuid,
  quando          timestamptz,                      -- a hora usada (já limitada)
  resultado       jsonb NOT NULL,
  recebida_em     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ops_offline_acao_utilizador_idx
  ON public.ops_offline_acao (utilizador_id, recebida_em DESC);

-- Só pela RPC: ninguém lê nem escreve a tabela diretamente.
ALTER TABLE public.ops_offline_acao ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ops_offline_acao FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.rpc_ops_obra_offline(
  p_acao_id     uuid,
  p_tipo        text,          -- 'iniciar' | 'pausar' | 'concluir'
  p_tarefa_id   uuid,
  p_quando      timestamptz,
  p_motivo      text    DEFAULT NULL,
  p_nota        text    DEFAULT NULL,
  p_medida_real numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_t      record;
  v_quem   record;
  v_ant    record;
  v_q      timestamptz;
  v_min    timestamptz;
  v_r      jsonb;
BEGIN
  IF p_acao_id IS NULL THEN
    RAISE EXCEPTION 'Ação sem identificador.';
  END IF;
  IF p_tipo IS NULL OR p_tipo NOT IN ('iniciar','pausar','concluir') THEN
    RAISE EXCEPTION 'Tipo de ação desconhecido: %.', coalesce(p_tipo, '(vazio)');
  END IF;

  SELECT t.id, t.organization_id, t.obra_id, t.estado, t.minutos_previstos INTO v_t
    FROM public.ops_obra_tarefa t WHERE t.id = p_tarefa_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tarefa não encontrada.' USING ERRCODE = 'no_data_found';
  END IF;
  SELECT * INTO v_quem FROM public.ops_obra_exigir(
    v_t.organization_id, 'operations.orders.execute', NULL, NULL);

  -- Já chegou antes (a resposta perdeu-se na rede): devolve o mesmo.
  SELECT * INTO v_ant FROM public.ops_offline_acao WHERE id = p_acao_id;
  IF FOUND THEN
    IF v_ant.utilizador_id <> v_quem.o_utilizador THEN
      RAISE EXCEPTION 'Este identificador de ação já foi usado por outra pessoa.';
    END IF;
    RETURN v_ant.resultado || jsonb_build_object('repetida', true);
  END IF;

  -- A hora do telemóvel, com limites: nem no futuro, nem há mais de 72 h,
  -- nem antes do fim do meu último relógio.
  v_q := LEAST(now(), GREATEST(COALESCE(p_quando, now()), now() - interval '72 hours'));
  SELECT max(fim) INTO v_min FROM public.ops_obra_registo
   WHERE utilizador_id = v_quem.o_utilizador AND fim IS NOT NULL;
  IF v_min IS NOT NULL AND v_q < v_min THEN
    v_q := LEAST(v_min, now());
  END IF;

  IF p_tipo = 'iniciar' THEN
    v_r := public.rpc_ops_obra_iniciar_tarefa(p_tarefa_id);
    UPDATE public.ops_obra_registo SET inicio = v_q
     WHERE tarefa_id = p_tarefa_id AND utilizador_id = v_quem.o_utilizador AND fim IS NULL;
    UPDATE public.ops_obra_tarefa SET iniciada_em = v_q
     WHERE id = p_tarefa_id AND iniciada_em > v_q;
    UPDATE public.ops_obra SET iniciada_em = v_q
     WHERE id = v_t.obra_id AND iniciada_em > v_q;
    v_r := v_r || jsonb_build_object('minutos_reais', public.ops_obra_minutos_reais(p_tarefa_id));

  ELSIF p_tipo = 'pausar' THEN
    -- As mesmas regras da pausa em rpc_ops_obra_terminar_tarefa(…, false).
    IF v_quem.o_funcao NOT IN ('admin','gestor') AND NOT EXISTS (
      SELECT 1 FROM public.ops_obra_tarefa_pessoa
       WHERE tarefa_id = p_tarefa_id AND utilizador_id = v_quem.o_utilizador) THEN
      RAISE EXCEPTION 'Não estás nesta tarefa.' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF v_t.estado <> 'em_curso' THEN
      RAISE EXCEPTION 'Só se termina uma tarefa em curso (esta está %).', replace(v_t.estado,'_',' ');
    END IF;
    UPDATE public.ops_obra_registo SET fim = GREATEST(v_q, inicio)
     WHERE tarefa_id = p_tarefa_id AND utilizador_id = v_quem.o_utilizador AND fim IS NULL;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Não tens relógio a correr nesta tarefa.';
    END IF;
    v_r := jsonb_build_object('ok', true, 'estado', 'em_curso',
      'minutos_reais', public.ops_obra_minutos_reais(p_tarefa_id),
      'minutos_previstos', v_t.minutos_previstos);

  ELSE  -- concluir
    -- Fecham-se os relógios à hora do telemóvel ANTES do terminar normal: é
    -- com estes tempos que ele conta o real e decide se pede justificação.
    -- Se ele recusar, a transação inteira volta atrás.
    UPDATE public.ops_obra_registo SET fim = GREATEST(v_q, inicio)
     WHERE tarefa_id = p_tarefa_id AND fim IS NULL;
    v_r := public.rpc_ops_obra_terminar_tarefa(p_tarefa_id, true, p_motivo, p_nota, p_medida_real);
    UPDATE public.ops_obra_tarefa SET terminada_em = v_q WHERE id = p_tarefa_id;
  END IF;

  v_r := v_r || jsonb_build_object('quando', v_q);
  INSERT INTO public.ops_offline_acao (id, organization_id, utilizador_id, tipo, tarefa_id, quando, resultado)
  VALUES (p_acao_id, v_t.organization_id, v_quem.o_utilizador, p_tipo, p_tarefa_id, v_q, v_r);
  RETURN v_r;
END
$$;

REVOKE ALL ON FUNCTION public.rpc_ops_obra_offline(uuid, text, uuid, timestamptz, text, text, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_ops_obra_offline(uuid, text, uuid, timestamptz, text, text, numeric) TO authenticated, service_role;
