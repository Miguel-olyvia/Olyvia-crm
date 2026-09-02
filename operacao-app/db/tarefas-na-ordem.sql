-- ============================================================
--  Operações — acrescentar trabalho na própria ordem
-- ============================================================
--  Correr DEPOIS de: schema.sql, permissoes.sql, rpcs.sql, rpcs-tarefas.sql.
--  Pode voltar a correr numa base já completa.
--
--  ⚠ PORQUE É QUE ISTO EXISTE
--
--  Para registar uma leitura numa ordem era preciso: ir a Definições, criar a
--  medição, abrir a checklist, pendurá-la numa tarefa, publicar a checklist, e
--  só depois escolher essa checklist ao abrir a ordem. Seis passos e dois
--  ecrãs para escrever "12,4 bar".
--
--  Quem estava a montar a operação disse-o assim: "não achas super complexo e
--  longo? Não podemos fazer logo tudo na ordem, opcionalmente? Haverá sempre
--  situações específicas e temos de estar prontos."
--
--  Tinha razão nas duas coisas. O caminho longo continua a ser o certo para o
--  trabalho que se repete — uma checklist publicada é o que faz doze visitas
--  serem comparáveis. Mas o trabalho que **não** se repete não cabe lá: o
--  técnico que chega ao local e encontra mais uma coisa para verificar não vai
--  a Definições publicar uma checklist nova. Ou regista ali, ou não regista.
--
--  ⚠ O QUE ISTO **NÃO** FAZ
--
--  Uma tarefa acrescentada à mão vive **só nesta ordem**. Não entra em
--  checklist nenhuma, não passa à visita seguinte, e não conta para o
--  cumprimento do plano. É de propósito: se entrasse, uma decisão de um
--  técnico num dia passava a ser procedimento da casa sem ninguém decidir.
--
--  Para uma leitura com limites não é preciso `ops_medicao_def` nenhuma: a
--  própria tarefa já tem `unidade`, `limite_min`, `limite_max` e `valor_num`,
--  e o veredicto sai da comparação, tal como nas outras. O catálogo de
--  medições continua a existir para o que se repete.
-- ============================================================

BEGIN;

-- ============================================================
-- 1. Acrescentar uma tarefa a uma ordem
-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_ops_acrescentar_tarefa(
  p_ordem_id    uuid,
  p_nome        text,
  p_tipo        text    DEFAULT 'inspecao',
  p_obrigatoria boolean DEFAULT true,
  p_unidade     text    DEFAULT NULL,
  p_limite_min  numeric DEFAULT NULL,
  p_limite_max  numeric DEFAULT NULL,
  p_observacoes text    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_user    uuid;
  v_funcao  text;
  v_o       record;
  v_alvo    uuid;
  v_pos     integer;
  v_tipo    text;
  v_nome    text := nullif(btrim(coalesce(p_nome, '')), '');
  v_id      uuid;
BEGIN
  v_user := public.current_business_user_id();
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Sessão inválida.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_nome IS NULL THEN
    RAISE EXCEPTION 'A tarefa precisa de um nome — é o que o técnico vai ler no telemóvel.';
  END IF;

  SELECT * INTO v_o FROM public.ops_ordem WHERE id = p_ordem_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Essa ordem não existe.' USING ERRCODE = 'no_data_found';
  END IF;

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

  -- Uma ordem fechada é uma fotografia do que aconteceu. Acrescentar trabalho
  -- depois de a fechar é reescrever o passado — e o relatório do cliente já
  -- pode ter saído.
  IF v_o.estado IN ('fechada', 'confirmada', 'cancelada') THEN
    RAISE EXCEPTION 'Esta ordem já está %. Reabre-a, ou abre uma ordem nova.', v_o.estado;
  END IF;

  -- Limites sem número não querem dizer nada, e um número sem limites é uma
  -- leitura sem veredicto — que também é legítima (um contador, por exemplo).
  v_tipo := coalesce(nullif(btrim(p_tipo), ''), 'inspecao');
  IF p_limite_min IS NOT NULL OR p_limite_max IS NOT NULL THEN
    v_tipo := 'numero';
  END IF;
  IF v_tipo NOT IN ('inspecao','medicao','numero','texto','foto','assinatura') THEN
    RAISE EXCEPTION 'Feitio de tarefa desconhecido: %.', v_tipo;
  END IF;

  IF p_limite_min IS NOT NULL AND p_limite_max IS NOT NULL
     AND p_limite_min > p_limite_max THEN
    RAISE EXCEPTION 'O mínimo não pode ser maior do que o máximo.';
  END IF;

  -- Vai para o fim da lista, e junto ao mesmo alvo das outras: uma tarefa
  -- pendurada noutro sítio aparecia sozinha num grupo só dela.
  SELECT COALESCE(max(posicao), 0) + 1 INTO v_pos
    FROM public.ops_ordem_tarefa WHERE ordem_id = p_ordem_id;

  SELECT id INTO v_alvo FROM public.ops_ordem_alvo
   WHERE ordem_id = p_ordem_id ORDER BY id LIMIT 1;

  INSERT INTO public.ops_ordem_tarefa
    (ordem_id, ordem_alvo_id, posicao, nome, tipo, obrigatoria,
     unidade, limite_min, limite_max, observacoes)
  VALUES
    (p_ordem_id, v_alvo, v_pos, v_nome, v_tipo, coalesce(p_obrigatoria, true),
     nullif(btrim(coalesce(p_unidade, '')), ''), p_limite_min, p_limite_max,
     nullif(btrim(coalesce(p_observacoes, '')), ''))
  RETURNING id INTO v_id;

  INSERT INTO public.ops_evento
    (organization_id, entidade, entidade_id, tipo, descricao, autor_id, depois)
  VALUES
    (v_o.organization_id, 'ordem', p_ordem_id, 'tarefa_acrescentada',
     v_nome, v_user,
     jsonb_build_object('tarefa_id', v_id, 'tipo', v_tipo,
                        'unidade', p_unidade,
                        'limite_min', p_limite_min, 'limite_max', p_limite_max));

  RETURN jsonb_build_object('ok', true, 'id', v_id, 'tipo', v_tipo, 'posicao', v_pos);
END
$$;

REVOKE ALL ON FUNCTION public.rpc_ops_acrescentar_tarefa(uuid, text, text, boolean, text, numeric, numeric, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_ops_acrescentar_tarefa(uuid, text, text, boolean, text, numeric, numeric, text)
  TO authenticated;


-- ============================================================
-- 2. Tirar uma tarefa que se acrescentou por engano
-- ============================================================
-- Só uma tarefa **por responder**. Uma tarefa respondida é trabalho feito, e
-- apagar trabalho feito não é corrigir um engano: é apagar a prova.

CREATE OR REPLACE FUNCTION public.rpc_ops_remover_tarefa(p_tarefa_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_user   uuid;
  v_t      record;
  v_o      record;
  v_funcao text;
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
  IF v_funcao IS NULL AND NOT public.is_system_admin_user(v_uid) THEN
    RAISE EXCEPTION 'Sem função atribuída em Operações nesta organização.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_t.estado <> 'pendente' THEN
    RAISE EXCEPTION 'Essa tarefa já foi respondida. Trabalho feito não se apaga.';
  END IF;

  IF v_o.estado IN ('fechada', 'confirmada', 'cancelada') THEN
    RAISE EXCEPTION 'Esta ordem já está %.', v_o.estado;
  END IF;

  DELETE FROM public.ops_ordem_tarefa WHERE id = p_tarefa_id;

  INSERT INTO public.ops_evento
    (organization_id, entidade, entidade_id, tipo, descricao, autor_id, antes)
  VALUES
    (v_o.organization_id, 'ordem', v_t.ordem_id, 'tarefa_removida',
     v_t.nome, v_user,
     jsonb_build_object('tarefa_id', p_tarefa_id, 'tipo', v_t.tipo));

  RETURN jsonb_build_object('ok', true);
END
$$;

REVOKE ALL ON FUNCTION public.rpc_ops_remover_tarefa(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_ops_remover_tarefa(uuid) TO authenticated;


-- ============================================================
-- 3. Verificação
-- ============================================================

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.rpc_ops_acrescentar_tarefa(uuid,text,text,boolean,text,numeric,numeric,text)',
    'public.rpc_ops_remover_tarefa(uuid)'
  ] LOOP
    IF to_regprocedure(f) IS NULL THEN
      RAISE EXCEPTION 'Não ficou criada: %', f;
    END IF;
  END LOOP;

  -- Sem isto, o botão dá erro a quem tem sessão e ninguém percebe porquê.
  IF NOT has_function_privilege('authenticated',
       'public.rpc_ops_acrescentar_tarefa(uuid,text,text,boolean,text,numeric,numeric,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated não pode executar rpc_ops_acrescentar_tarefa';
  END IF;

  RAISE NOTICE 'Tarefas na própria ordem: prontas.';
END
$$;

COMMIT;
