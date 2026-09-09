-- ============================================================
--  Operações — responder a medições
-- ============================================================
--  Correr DEPOIS de: schema.sql, permissoes.sql, rpcs.sql, rpcs-tarefas.sql,
--  planos.sql, correcoes-modelo.sql.
--
--  Uma tarefa diz o que há a fazer. Uma medição é o que se leu ao fazê-lo:
--  12,4 bar, "Conforme", 45.812 horas de contador, uma nota escrita.
--
--  Três regras, e a razão de cada uma:
--
--   1. As leituras nascem com a ordem, vazias, com os limites congelados.
--      Mudar os limites amanhã não reescreve o veredicto de ontem.
--
--   2. O veredicto de uma medição não é opinião. Uma gama decide-se pelos
--      limites; uma escolha decide-se pela opção. Só o texto fica sem
--      veredicto, porque não há como o dar.
--
--   3. A tarefa acerta-se sozinha. Quando a última medição é respondida, a
--      tarefa fica conforme ou não conforme conforme as leituras — ninguém
--      tem de dizer duas vezes a mesma coisa.
--
--  Escreve fora de `ops_*`? NÃO. Nem uma linha.
-- ============================================================

BEGIN;

-- ============================================================
-- 0. Que corretiva saiu de que leitura
-- ============================================================
-- Sem isto, a regra de "não gerar duas vezes" tinha de adivinhar pelo estado
-- da conformidade — e adivinhava mal: passar de "Ilegível" (problema sem
-- trabalho) para "Não conforme" (problema com trabalho) deixava de gerar a
-- ordem, porque as duas leituras são não conformes. A pergunta certa não é
-- "já estava mal?", é "já saiu daqui uma ordem?".

ALTER TABLE public.ops_ordem_tarefa_medicao
  ADD COLUMN IF NOT EXISTS corretiva_ordem_id uuid
    REFERENCES public.ops_ordem(id) ON DELETE SET NULL;


-- ============================================================
-- 1. A fechadura das leituras
-- ============================================================
-- Sem isto, um UPDATE direto marcava `conforme = true` numa leitura fora de
-- limites e ninguém saberia. O veredicto é da base, não do browser.

CREATE OR REPLACE FUNCTION public.ops_guarda_medicao()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF coalesce(current_setting('ops.medicao', true), '') = 'autorizada' THEN
    RETURN NEW;
  END IF;

  -- Uma leitura por fazer não é um veredicto — é uma linha em branco à espera.
  -- Semeá-la é o que a materialização faz quando a ordem nasce, e não há nada
  -- a proteger nisso. O que se protege é o veredicto.
  IF TG_OP = 'INSERT' AND NEW.lida_em IS NULL AND NEW.conforme IS NULL
     AND NEW.valor_num IS NULL AND NEW.valor_texto IS NULL AND NEW.opcao_id IS NULL THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION
    'Uma leitura de medição só se escreve através de rpc_ops_responder_medicao().'
    USING ERRCODE = 'insufficient_privilege';
END
$$;

DROP TRIGGER IF EXISTS ops_medicao_guarda ON public.ops_ordem_tarefa_medicao;
CREATE TRIGGER ops_medicao_guarda
  BEFORE INSERT OR UPDATE ON public.ops_ordem_tarefa_medicao
  FOR EACH ROW EXECUTE FUNCTION public.ops_guarda_medicao();


-- ============================================================
-- 2. O veredicto de uma leitura
-- ============================================================
-- Devolve TRUE (conforme), FALSE (não conforme) ou NULL (não há como saber).
-- NULL é uma resposta legítima: um campo de texto livre não tem veredicto, e
-- inventar um seria pior do que não ter.

CREATE OR REPLACE FUNCTION public.ops_avaliar_leitura(
  _tipo       text,
  _valor_num  numeric,
  _min        numeric,
  _max        numeric,
  _opcao_má   boolean
)
RETURNS boolean
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE _tipo
    WHEN 'escolha' THEN NOT coalesce(_opcao_má, false)
    WHEN 'gama' THEN CASE
      WHEN _valor_num IS NULL THEN NULL
      WHEN _min IS NULL AND _max IS NULL THEN NULL
      WHEN _min IS NOT NULL AND _valor_num < _min THEN false
      WHEN _max IS NOT NULL AND _valor_num > _max THEN false
      ELSE true
    END
    -- Um contador não é conforme nem não conforme: é um número que sobe.
    -- O que interessa nele é a diferença, e essa lê-se no histórico.
    ELSE NULL
  END
$$;


-- ============================================================
-- 3. Responder a uma medição
-- ============================================================

CREATE OR REPLACE FUNCTION public.ops_responder_medicao_impl(
  p_tarefa_id      uuid,
  p_medicao_def_id uuid,
  p_valor_num      numeric DEFAULT NULL,
  p_valor_texto    text    DEFAULT NULL,
  p_opcao_id       uuid    DEFAULT NULL
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
  v_l          record;   -- a linha da leitura, já semeada ou a criar
  v_def        record;
  -- Escalares, e não um `record`: em plpgsql, referir um record por atribuir
  -- rebenta mesmo dentro de um ramo de CASE que não chega a ser seguido.
  v_opcao_nome text;
  v_opcao_ma   boolean;
  v_opcao_cria boolean;
  v_atribuido  boolean;
  v_conforme   boolean;
  v_anterior   numeric;
  v_texto      text := nullif(btrim(coalesce(p_valor_texto, '')), '');
  v_nova_cod   text;
  v_detalhe    text;
  v_unidade    text;
  v_por_ler    integer;
  v_mas        integer;
  v_estado_t   text;
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

  IF v_o.estado <> 'em_curso' THEN
    RAISE EXCEPTION 'Só se lê numa ordem em curso (esta está %).',
      replace(v_o.estado, '_', ' ');
  END IF;

  v_atribuido := (v_o.responsavel_id = v_user)
    OR EXISTS (SELECT 1 FROM public.ops_ordem_pessoa
                WHERE ordem_id = v_o.id AND utilizador_id = v_user);
  IF v_funcao = 'tecnico' AND NOT v_atribuido THEN
    RAISE EXCEPTION 'Só quem está na ordem pode registar leituras.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ── a linha da leitura ───────────────────────────────────────────────
  -- Normalmente já existe, semeada quando a ordem nasceu, com os limites
  -- congelados. Se não existir (medição acrescentada à mão a uma ordem já
  -- aberta), copia-se a definição agora — e é esse instante que fica gravado.
  SELECT * INTO v_l FROM public.ops_ordem_tarefa_medicao
   WHERE ordem_tarefa_id = p_tarefa_id AND medicao_def_id = p_medicao_def_id;

  IF NOT FOUND THEN
    SELECT * INTO v_def FROM public.ops_medicao_def
     WHERE id = p_medicao_def_id AND organization_id = v_o.organization_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Medição desconhecida nesta organização.' USING ERRCODE = 'no_data_found';
    END IF;

    INSERT INTO public.ops_ordem_tarefa_medicao (
      ordem_tarefa_id, medicao_def_id, nome, tipo, unidade, limite_min, limite_max)
    VALUES (p_tarefa_id, p_medicao_def_id, v_def.nome, v_def.tipo, v_def.unidade,
            v_def.limite_min, v_def.limite_max)
    RETURNING * INTO v_l;
  END IF;

  -- ── o que a leitura tem de trazer ────────────────────────────────────
  -- Recusar cedo e por escrito é melhor do que gravar uma linha vazia que
  -- depois ninguém sabe interpretar.
  IF v_l.tipo IN ('gama','acumulado') AND p_valor_num IS NULL THEN
    RAISE EXCEPTION '"%" espera um valor numérico.', v_l.nome;
  END IF;

  IF v_l.tipo = 'escolha' THEN
    IF p_opcao_id IS NULL THEN
      RAISE EXCEPTION '"%" espera que se escolha uma opção.', v_l.nome;
    END IF;
    SELECT nome, e_nao_conforme, cria_corretiva
      INTO v_opcao_nome, v_opcao_ma, v_opcao_cria
      FROM public.ops_medicao_opcao
     WHERE id = p_opcao_id AND medicao_def_id = p_medicao_def_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Essa opção não pertence a "%".', v_l.nome;
    END IF;
  END IF;

  IF v_l.tipo = 'texto' AND v_texto IS NULL THEN
    RAISE EXCEPTION '"%" espera texto.', v_l.nome;
  END IF;

  -- Um contador não anda para trás. Se andou, ou se leu mal ou o equipamento
  -- foi substituído — nos dois casos alguém tem de olhar, e não é o software
  -- que decide sozinho.
  IF v_l.tipo = 'acumulado' THEN
    SELECT m.valor_num INTO v_anterior
      FROM public.ops_ordem_tarefa_medicao m
      JOIN public.ops_ordem_tarefa t ON t.id = m.ordem_tarefa_id
      JOIN public.ops_ordem_alvo a   ON a.id = t.ordem_alvo_id
     WHERE m.medicao_def_id = p_medicao_def_id
       AND m.lida_em IS NOT NULL
       AND m.ordem_tarefa_id <> p_tarefa_id
       AND a.ativo_id IS NOT DISTINCT FROM (
             SELECT ativo_id FROM public.ops_ordem_alvo WHERE id = v_t.ordem_alvo_id)
     ORDER BY m.lida_em DESC
     LIMIT 1;

    IF v_anterior IS NOT NULL AND p_valor_num < v_anterior THEN
      RAISE EXCEPTION 'Um contador não desce. "%" estava em %, e leu-se %.',
        v_l.nome, v_anterior, p_valor_num;
    END IF;
  END IF;

  v_conforme := public.ops_avaliar_leitura(
    v_l.tipo, p_valor_num, v_l.limite_min, v_l.limite_max,
    v_opcao_ma);

  UPDATE public.ops_ordem_tarefa_medicao SET
    valor_num   = CASE WHEN v_l.tipo IN ('gama','acumulado') THEN p_valor_num ELSE valor_num END,
    valor_texto = COALESCE(v_texto, valor_texto),
    opcao_id    = CASE WHEN v_l.tipo = 'escolha' THEN p_opcao_id ELSE opcao_id END,
    conforme    = v_conforme,
    lida_em     = now(),
    lida_por    = v_user
  WHERE id = v_l.id;

  -- ── a corretiva ──────────────────────────────────────────────────────
  -- Uma leitura gera trabalho uma vez. Corrigir um engano de dedo, ou piorar
  -- de "ilegível" para "não conforme", não abre uma segunda ordem sobre a
  -- mesma leitura.
  --
  -- Numa gama, sair dos limites é sempre motivo. Numa escolha, quem manda é a
  -- caixa da opção: há opções que assinalam um problema sem exigir trabalho.
  IF v_conforme IS FALSE AND v_l.corretiva_ordem_id IS NULL THEN
    IF v_l.tipo = 'gama' OR (v_l.tipo = 'escolha' AND v_opcao_cria) THEN
      v_unidade := CASE WHEN v_l.unidade IS NOT NULL THEN ' ' || v_l.unidade ELSE '' END;

      IF v_l.tipo = 'gama' THEN
        v_detalhe := v_l.nome || ': ' || p_valor_num || v_unidade
          || ' ('
          || concat_ws(', ',
               CASE WHEN v_l.limite_min IS NOT NULL THEN 'mín. ' || v_l.limite_min || v_unidade END,
               CASE WHEN v_l.limite_max IS NOT NULL THEN 'máx. ' || v_l.limite_max || v_unidade END)
          || ').';
      ELSE
        v_detalhe := v_l.nome || ': ' || v_opcao_nome || '.';
      END IF;

      IF v_texto IS NOT NULL THEN
        v_detalhe := v_detalhe || E'\n' || 'Nota do técnico: ' || v_texto;
      END IF;

      v_nova_cod := public.ops_criar_corretiva(p_tarefa_id, v_detalhe, v_user);

      UPDATE public.ops_ordem_tarefa_medicao
         SET corretiva_ordem_id = (SELECT id FROM public.ops_ordem WHERE codigo = v_nova_cod)
       WHERE id = v_l.id;
    END IF;
  END IF;

  -- ── a tarefa acerta-se sozinha ───────────────────────────────────────
  -- Enquanto faltarem leituras, a tarefa fica como está. Quando a última
  -- entra, o veredicto sai das leituras: uma não conforme chega para a tarefa
  -- ficar não conforme.
  SELECT count(*) FILTER (WHERE lida_em IS NULL),
         count(*) FILTER (WHERE conforme IS false)
    INTO v_por_ler, v_mas
    FROM public.ops_ordem_tarefa_medicao
   WHERE ordem_tarefa_id = p_tarefa_id;

  v_estado_t := v_t.estado;
  IF v_por_ler = 0 THEN
    v_estado_t := CASE WHEN v_mas > 0 THEN 'nao_conforme' ELSE 'feita' END;

    IF v_estado_t <> v_t.estado THEN
      PERFORM set_config('ops.tarefa', 'autorizada', true);
      UPDATE public.ops_ordem_tarefa
         SET estado = v_estado_t,
             executada_por = v_user,
             inicio = COALESCE(inicio, now()),
             fim = now()
       WHERE id = p_tarefa_id;
      PERFORM set_config('ops.tarefa', '', true);
    END IF;
  END IF;

  INSERT INTO public.ops_evento
    (organization_id, entidade, entidade_id, tipo, descricao, autor_id, antes, depois)
  VALUES
    (v_o.organization_id, 'tarefa', p_tarefa_id, 'medicao', v_l.nome, v_user,
     jsonb_build_object('conforme', v_l.conforme),
     jsonb_build_object('conforme', v_conforme, 'valor_num', p_valor_num,
                        'valor_texto', v_texto, 'opcao_id', p_opcao_id));

  RETURN jsonb_build_object(
    'ok', true,
    'conforme', v_conforme,
    'por_ler', v_por_ler,
    'estado_tarefa', v_estado_t,
    'corretiva_gerada', v_nova_cod
  );
END
$$;

REVOKE ALL ON FUNCTION public.ops_responder_medicao_impl(uuid, uuid, numeric, text, uuid)
  FROM PUBLIC, anon, authenticated;


-- ============================================================
-- 4. A RPC
-- ============================================================
-- Autoriza as duas fechaduras, delega, e desautoriza. As flags vivem só nesta
-- transação, por isso não há como ficarem ligadas por engano.

CREATE OR REPLACE FUNCTION public.rpc_ops_responder_medicao(
  p_tarefa_id      uuid,
  p_medicao_def_id uuid,
  p_valor_num      numeric DEFAULT NULL,
  p_valor_texto    text    DEFAULT NULL,
  p_opcao_id       uuid    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE r jsonb;
BEGIN
  PERFORM set_config('ops.medicao', 'autorizada', true);
  r := public.ops_responder_medicao_impl(
         p_tarefa_id, p_medicao_def_id, p_valor_num, p_valor_texto, p_opcao_id);
  PERFORM set_config('ops.medicao', '', true);
  RETURN r;
END
$$;

REVOKE ALL ON FUNCTION public.rpc_ops_responder_medicao(uuid, uuid, numeric, text, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_ops_responder_medicao(uuid, uuid, numeric, text, uuid)
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
     AND proname IN ('ops_guarda_medicao','ops_avaliar_leitura',
                     'ops_responder_medicao_impl','rpc_ops_responder_medicao');
  IF n <> 4 THEN
    RAISE EXCEPTION 'Faltam funções de medição: esperava 4, encontrei %.', n;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'ops_medicao_guarda') THEN
    RAISE EXCEPTION 'A fechadura das leituras não ficou instalada.';
  END IF;

  RAISE NOTICE 'Medições prontas. As leituras entram pela RPC, e o veredicto é da base.';
END
$v$;
