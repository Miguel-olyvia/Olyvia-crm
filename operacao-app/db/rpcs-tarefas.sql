-- =============================================================================
-- Olyvia · Operações — responder a tarefas, e a corretiva que daí nasce
--
-- Esta é a peça que o Infraspeak não tem.
--
-- No histórico dos ativos da instância observada há relatos escritos pelos
-- técnicos — portões avariados, geradores que não arrancam — que nunca viraram
-- ordem nenhuma, porque não havia nada que os transformasse em trabalho. A
-- informação existia; o que faltava era o mecanismo.
--
-- Aqui, marcar uma tarefa como não conforme cria a ordem corretiva, herda o
-- cliente, o local, o ativo e o que o técnico escreveu, e deixa as duas ordens
-- ligadas por `gerada_por_tarefa_id`. O ciclo fecha-se sozinho e é auditável.
--
-- Duas coisas acontecem sem ninguém decidir:
--   · uma medição fora dos limites É não conformidade — 31 °C num limite de
--     16–24 não precisa de julgamento;
--   · a descrição da ordem nova diz o valor lido e o limite violado, porque
--     "não conforme" sozinho não chega para alguém agir.
--
-- Aditivo e idempotente. Correr DEPOIS de db/rpcs.sql.
-- =============================================================================

BEGIN;

DO $guarda$
BEGIN
  IF to_regprocedure('public.rpc_ops_transitar_ordem(uuid,text,text,timestamptz)') IS NULL THEN
    RAISE EXCEPTION 'Falta db/rpcs.sql. Corre-o primeiro.';
  END IF;
END
$guarda$;


-- ============================================================
-- 1. Numeração interna
-- ============================================================
-- `ops_proximo_codigo()` exige `operations.orders.create` a quem a chama, e
-- bem: é a porta para alguém criar ordens à mão. Mas a corretiva não é criada
-- por uma pessoa — é criada pelo sistema, em nome de um técnico que só tem
-- `operations.orders.execute`. Daí uma variante sem a verificação, que NÃO é
-- dada a `authenticated` e só é alcançável de dentro de outra RPC.

CREATE OR REPLACE FUNCTION public.ops_proximo_codigo_interno(_org_id uuid, _prefixo text)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_chave text := _prefixo || '-' || to_char(now(), 'YYYY');
  v_valor integer;
BEGIN
  INSERT INTO public.ops_sequencia (organization_id, chave, valor)
  VALUES (_org_id, v_chave, 1)
  ON CONFLICT (organization_id, chave)
  DO UPDATE SET valor = public.ops_sequencia.valor + 1
  RETURNING valor INTO v_valor;

  RETURN _prefixo || '-' || to_char(now(), 'YYYY') || '-' || lpad(v_valor::text, 5, '0');
END
$$;

REVOKE ALL ON FUNCTION public.ops_proximo_codigo_interno(uuid, text) FROM PUBLIC, anon, authenticated;


-- ============================================================
-- 2. Avaliar uma medição
-- ============================================================
-- Função pura, espelho de `avaliarMedicao()` em src/domain/conformidade.ts.
-- `NULL` = sem valor lido, logo sem veredicto.

CREATE OR REPLACE FUNCTION public.ops_avaliar_medicao(
  _valor numeric, _min numeric, _max numeric
)
RETURNS text
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE
    WHEN _valor IS NULL THEN NULL
    WHEN _min IS NOT NULL AND _valor < _min THEN 'nao_conforme'
    WHEN _max IS NOT NULL AND _valor > _max THEN 'nao_conforme'
    ELSE 'feita'
  END
$$;


-- ============================================================
-- 2b. A corretiva
-- ============================================================
-- Uma não conformidade gera trabalho. Antes isto vivia dentro de
-- `ops_responder_tarefa_impl`; agora vive aqui porque as medições também
-- precisam de gerar corretivas, e duas cópias da mesma regra divergem sempre.
--
-- `_detalhe` é o que muda de caso para caso — o valor lido, a opção escolhida,
-- as observações. O resto (onde, título, alvo, evento) é igual em todos.
CREATE OR REPLACE FUNCTION public.ops_criar_corretiva(
  _tarefa_id uuid,
  _detalhe   text DEFAULT NULL,
  _autor_id  uuid DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_t          record;
  v_o          record;
  v_ativo_id   uuid;
  v_local_id   uuid;
  v_ativo_nome text;
  v_local_nome text;
  v_onde       text;
  v_descricao  text;
  v_nova_id    uuid;
  v_nova_cod   text;
BEGIN
  SELECT * INTO v_t FROM public.ops_ordem_tarefa WHERE id = _tarefa_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO v_o FROM public.ops_ordem WHERE id = v_t.ordem_id;

  SELECT a.ativo_id, COALESCE(a.local_id, v_o.local_id)
    INTO v_ativo_id, v_local_id
    FROM public.ops_ordem_alvo a WHERE a.id = v_t.ordem_alvo_id;
  v_local_id := COALESCE(v_local_id, v_o.local_id);

  SELECT nome INTO v_ativo_nome FROM public.ops_ativo WHERE id = v_ativo_id;
  SELECT nome INTO v_local_nome FROM public.ops_local WHERE id = v_local_id;
  v_onde := nullif(concat_ws(' — ', v_ativo_nome, v_local_nome), '');

  v_descricao := 'Não conformidade detetada em "' || v_t.nome || '".';
  IF nullif(btrim(coalesce(_detalhe, '')), '') IS NOT NULL THEN
    v_descricao := v_descricao || E'
' || _detalhe;
  END IF;
  v_descricao := v_descricao || E'
' || 'Gerada a partir de ' || v_o.codigo || '.';

  v_nova_cod := public.ops_proximo_codigo_interno(v_o.organization_id, 'OT');

  INSERT INTO public.ops_ordem (
    organization_id, codigo, origem, estado, prioridade,
    area, tipo, cliente_id, local_id, titulo, descricao,
    gerada_por_tarefa_id, criada_por
  ) VALUES (
    v_o.organization_id, v_nova_cod, 'corretiva', 'por_aprovar', 'alta',
    v_o.area, v_o.tipo, v_o.cliente_id, v_local_id,
    COALESCE(v_t.nome || CASE WHEN v_onde IS NOT NULL THEN ' — ' || v_onde ELSE '' END, v_t.nome),
    v_descricao, _tarefa_id, _autor_id
  ) RETURNING id INTO v_nova_id;

  -- O ativo em causa fica como alvo da ordem nova, para quem a receber saber
  -- exatamente o que ir ver.
  IF v_ativo_id IS NOT NULL OR v_local_id IS NOT NULL THEN
    INSERT INTO public.ops_ordem_alvo (ordem_id, ativo_id, local_id)
    VALUES (v_nova_id, v_ativo_id, v_local_id);
  END IF;

  INSERT INTO public.ops_evento
    (organization_id, entidade, entidade_id, tipo, descricao, autor_id, antes, depois)
  VALUES
    (v_o.organization_id, 'ordem', v_nova_id, 'gerada_por_nao_conformidade',
     'Gerada a partir da tarefa "' || v_t.nome || '" da ordem ' || v_o.codigo,
     _autor_id, NULL, jsonb_build_object('codigo', v_nova_cod));

  RETURN v_nova_cod;
END
$$;

REVOKE ALL ON FUNCTION public.ops_criar_corretiva(uuid, text, uuid)
  FROM PUBLIC, anon, authenticated;


-- ============================================================
-- 3. Responder a uma tarefa
-- ============================================================

-- A implementação. Separada do invólucro porque o invólucro precisa de
-- autorizar o trigger antes de lhe chamar — e o trigger só existe mais abaixo.
-- Não é dada a `authenticated`: só se lá chega pela RPC.
CREATE OR REPLACE FUNCTION public.ops_responder_tarefa_impl(
  p_tarefa_id   uuid,
  p_estado      text DEFAULT NULL,
  p_valor_num   numeric DEFAULT NULL,
  p_valor_texto text DEFAULT NULL,
  p_observacoes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid        uuid := auth.uid();
  v_user       uuid;
  v_funcao     text;
  v_t          record;
  v_o          record;
  v_atribuido  boolean;
  v_estado     text;
  v_agora      timestamptz := now();
  v_obs        text := nullif(btrim(coalesce(p_observacoes, '')), '');
  v_nova_cod   text;
  v_descricao  text;
  v_unidade    text;
BEGIN
  v_user := public.current_business_user_id();
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Sessão inválida.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_t FROM public.ops_ordem_tarefa WHERE id = p_tarefa_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tarefa não encontrada.' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT * INTO v_o FROM public.ops_ordem WHERE id = v_t.ordem_id;

  IF NOT (
    public.is_system_admin_user(v_uid)
    OR v_o.organization_id IN (SELECT public.get_user_visible_org_ids(v_uid))
  ) THEN
    RAISE EXCEPTION 'Sem acesso a esta ordem.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT funcao INTO v_funcao FROM public.ops_utilizador_perfil
   WHERE utilizador_id = v_user AND organization_id = v_o.organization_id AND ativo;
  IF v_funcao IS NULL THEN
    IF public.is_system_admin_user(v_uid) THEN v_funcao := 'admin';
    ELSE RAISE EXCEPTION 'Sem função atribuída em Operações nesta organização.'
      USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  -- Responder é executar. Só se executa uma ordem em curso: numa fechada
  -- estaríamos a reescrever o que já foi dado por feito.
  IF v_o.estado <> 'em_curso' THEN
    RAISE EXCEPTION 'Só se responde a tarefas de uma ordem em curso (esta está %).',
      replace(v_o.estado, '_', ' ');
  END IF;

  v_atribuido := (v_o.responsavel_id = v_user)
    OR EXISTS (SELECT 1 FROM public.ops_ordem_pessoa
                WHERE ordem_id = v_o.id AND utilizador_id = v_user);
  IF v_funcao = 'tecnico' AND NOT v_atribuido THEN
    RAISE EXCEPTION 'Só quem está na ordem pode responder às tarefas.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ── o veredicto ──────────────────────────────────────────────────────
  -- Uma tarefa com limites decide-se sozinha; nas outras vale o que o
  -- técnico disser. O critério é ter limites, não o tipo: depois de separar
  -- a natureza do trabalho do formato da resposta, uma 'correcao' também
  -- pode pedir um valor com gama de aceitação.
  IF (v_t.limite_min IS NOT NULL OR v_t.limite_max IS NOT NULL)
     AND p_valor_num IS NOT NULL THEN
    v_estado := public.ops_avaliar_medicao(p_valor_num, v_t.limite_min, v_t.limite_max);
  ELSE
    v_estado := p_estado;
  END IF;

  IF v_estado IS NULL THEN
    RAISE EXCEPTION 'Falta dizer o estado da tarefa.';
  END IF;
  IF v_estado NOT IN ('pendente','feita','nao_conforme','nao_aplicavel') THEN
    RAISE EXCEPTION 'Estado de tarefa inválido: %', v_estado;
  END IF;

  UPDATE public.ops_ordem_tarefa SET
    estado        = v_estado,
    valor_num     = COALESCE(p_valor_num, valor_num),
    valor_texto   = COALESCE(p_valor_texto, valor_texto),
    observacoes   = COALESCE(v_obs, observacoes),
    executada_por = v_user,
    inicio        = COALESCE(inicio, v_agora),
    fim           = CASE WHEN v_estado = 'pendente' THEN NULL ELSE v_agora END
  WHERE id = p_tarefa_id;

  -- ── a corretiva ──────────────────────────────────────────────────────
  -- Só quando a tarefa PASSA a não conforme. Responder duas vezes à mesma
  -- tarefa não gera duas ordens.
  IF v_estado = 'nao_conforme' AND v_t.estado <> 'nao_conforme' THEN
    v_unidade := CASE WHEN v_t.unidade IS NOT NULL THEN ' ' || v_t.unidade ELSE '' END;
    v_descricao := NULL;

    IF p_valor_num IS NOT NULL THEN
      v_descricao := 'Valor lido: ' || p_valor_num || v_unidade;
      IF v_t.limite_min IS NOT NULL OR v_t.limite_max IS NOT NULL THEN
        v_descricao := v_descricao || ' ('
          || concat_ws(', ',
               CASE WHEN v_t.limite_min IS NOT NULL THEN 'mín. ' || v_t.limite_min || v_unidade END,
               CASE WHEN v_t.limite_max IS NOT NULL THEN 'máx. ' || v_t.limite_max || v_unidade END)
          || ')';
      END IF;
      v_descricao := v_descricao || '.';
    END IF;

    IF v_obs IS NOT NULL THEN
      v_descricao := concat_ws(E'
', v_descricao, 'Observações do técnico: ' || v_obs);
    END IF;

    v_nova_cod := public.ops_criar_corretiva(p_tarefa_id, v_descricao, v_user);
  END IF;

  INSERT INTO public.ops_evento
    (organization_id, entidade, entidade_id, tipo, descricao, autor_id, antes, depois)
  VALUES
    (v_o.organization_id, 'tarefa', p_tarefa_id, 'responder', v_obs, v_user,
     jsonb_build_object('estado', v_t.estado),
     jsonb_build_object('estado', v_estado, 'valor_num', p_valor_num));

  RETURN jsonb_build_object(
    'ok', true,
    'estado', v_estado,
    'avaliada_automaticamente',
      ((v_t.limite_min IS NOT NULL OR v_t.limite_max IS NOT NULL)
       AND p_valor_num IS NOT NULL),
    'corretiva_gerada', v_nova_cod
  );
END
$$;

REVOKE ALL ON FUNCTION public.ops_responder_tarefa_impl(uuid, text, numeric, text, text)
  FROM PUBLIC, anon, authenticated;


-- ============================================================
-- 4. A fechadura das tarefas
-- ============================================================
-- Mesmo princípio das ordens: sem isto, um UPDATE direto marcava uma tarefa
-- como conforme e nunca ninguém saberia que foi por fora.

CREATE OR REPLACE FUNCTION public.ops_guarda_tarefa()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.estado IS DISTINCT FROM OLD.estado
     AND coalesce(current_setting('ops.tarefa', true), '') <> 'autorizada' THEN
    RAISE EXCEPTION
      'O estado de uma tarefa só muda através de rpc_ops_responder_tarefa(). Tentativa: % → %.',
      OLD.estado, NEW.estado
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS ops_tarefa_guarda_estado ON public.ops_ordem_tarefa;
CREATE TRIGGER ops_tarefa_guarda_estado
  BEFORE UPDATE ON public.ops_ordem_tarefa
  FOR EACH ROW EXECUTE FUNCTION public.ops_guarda_tarefa();


-- ============================================================
-- 5. A RPC
-- ============================================================
-- Autoriza o trigger, delega, e desautoriza. A flag vive só nesta transação,
-- por isso não há como ficar ligada por engano.
CREATE OR REPLACE FUNCTION public.rpc_ops_responder_tarefa(
  p_tarefa_id   uuid,
  p_estado      text DEFAULT NULL,
  p_valor_num   numeric DEFAULT NULL,
  p_valor_texto text DEFAULT NULL,
  p_observacoes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE r jsonb;
BEGIN
  PERFORM set_config('ops.tarefa', 'autorizada', true);
  r := public.ops_responder_tarefa_impl(p_tarefa_id, p_estado, p_valor_num, p_valor_texto, p_observacoes);
  PERFORM set_config('ops.tarefa', '', true);
  RETURN r;
END
$$;

REVOKE ALL ON FUNCTION public.rpc_ops_responder_tarefa(uuid, text, numeric, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_ops_responder_tarefa(uuid, text, numeric, text, text)
  TO authenticated, service_role;

COMMIT;
