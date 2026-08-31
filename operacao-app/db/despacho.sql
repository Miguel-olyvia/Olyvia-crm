-- ============================================================
--  Operações — criar, atribuir, agendar
-- ============================================================
--  Correr DEPOIS de: schema.sql, permissoes.sql, rpcs.sql, rpcs-tarefas.sql,
--  planos.sql, correcoes-modelo.sql, medicoes.sql.
--
--  Até aqui as ordens só nasciam sozinhas: de um plano preventivo, ou de uma
--  não conformidade. Faltava o caso mais comum de todos — o telefone toca.
--
--  Três operações, e a razão de cada uma ser uma RPC e não um INSERT:
--
--   · criar     — o código (OT-2026-00842) tem de sair de um sítio só, senão
--                 dois pedidos ao mesmo tempo geram o mesmo número;
--   · atribuir  — quem entra na ordem passa a poder executá-la, e isso é uma
--                 decisão de autorização, não uma edição de campo;
--   · agendar   — marcar alguém que já está noutro sítio à mesma hora é o erro
--                 que mais custa. Aqui avisa-se antes, com o nome da outra ordem.
--
--  Escreve fora de `ops_*`? NÃO. Nem uma linha.
-- ============================================================

BEGIN;

-- ============================================================
-- 1. Quem é quem, sem repetir a mesma verificação três vezes
-- ============================================================
-- Devolve o utilizador de negócio e a função em Operações, ou rebenta com uma
-- mensagem que se pode ler a alguém. As três RPCs abaixo começam por aqui.

CREATE OR REPLACE FUNCTION public.ops_quem_sou(_org_id uuid)
RETURNS TABLE (utilizador_id uuid, funcao text)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_user   uuid;
  v_funcao text;
BEGIN
  v_user := public.current_business_user_id();
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Sessão inválida.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT (
    public.is_system_admin_user(v_uid)
    OR _org_id IN (SELECT public.get_user_visible_org_ids(v_uid))
  ) THEN
    RAISE EXCEPTION 'Sem acesso a esta organização.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT p.funcao INTO v_funcao FROM public.ops_utilizador_perfil p
   WHERE p.utilizador_id = v_user AND p.organization_id = _org_id AND p.ativo;

  IF v_funcao IS NULL THEN
    IF public.is_system_admin_user(v_uid) THEN v_funcao := 'admin';
    ELSE RAISE EXCEPTION 'Sem função atribuída em Operações nesta organização.'
      USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  RETURN QUERY SELECT v_user, v_funcao;
END
$$;

REVOKE ALL ON FUNCTION public.ops_quem_sou(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ops_quem_sou(uuid) TO authenticated, service_role;


-- ============================================================
-- 2. Criar uma ordem
-- ============================================================
-- O caso do telefone a tocar: alguém liga a dizer que o portão não abre.
--
-- Nasce em 'por_aprovar' quando quem a cria é técnico, e em 'agendada' quando
-- é gestor ou admin. Não é burocracia: um técnico que abre uma ordem está a
-- reportar um problema, e quem distribui trabalho é que decide se ela entra
-- na fila. Um gestor que a abre já está a decidir.

CREATE OR REPLACE FUNCTION public.ops_criar_ordem_impl(
  p_titulo            text,
  p_cliente_id        uuid,
  p_origem            text    DEFAULT 'corretiva',
  p_prioridade        text    DEFAULT 'normal',
  p_descricao         text    DEFAULT NULL,
  p_local_id          uuid    DEFAULT NULL,
  p_ativo_id          uuid    DEFAULT NULL,
  p_checklist_id      uuid    DEFAULT NULL,
  p_area              text    DEFAULT NULL,
  p_tipo              text    DEFAULT NULL,
  p_contacto_nome     text    DEFAULT NULL,
  p_contacto_telefone text    DEFAULT NULL,
  p_agendada_para     timestamptz DEFAULT NULL,
  p_responsavel_id    uuid    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user     uuid;
  v_funcao   text;
  v_org      uuid;
  v_titulo   text := nullif(btrim(coalesce(p_titulo, '')), '');
  v_codigo   text;
  v_estado   text;
  v_id       uuid;
  v_alvo     uuid;
  v_versao   integer;
  v_local    uuid := p_local_id;
BEGIN
  IF v_titulo IS NULL THEN
    RAISE EXCEPTION 'Uma ordem precisa de um título. É o que aparece na lista.';
  END IF;

  IF p_cliente_id IS NULL THEN
    RAISE EXCEPTION 'Uma ordem precisa de um cliente.';
  END IF;

  -- A organização vem do cliente, não de um parâmetro: assim não há como criar
  -- uma ordem numa organização e apontá-la a um cliente de outra.
  SELECT organization_id INTO v_org FROM public.anew_clients WHERE id = p_cliente_id;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Cliente não encontrado.' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT q.utilizador_id, q.funcao INTO v_user, v_funcao FROM public.ops_quem_sou(v_org) q;

  IF NOT (
    public.is_system_admin_user(auth.uid())
    OR public.has_anew_permission(auth.uid(), 'operations.orders.create')
  ) THEN
    RAISE EXCEPTION 'Sem permissão para criar ordens.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_origem NOT IN ('preventiva','corretiva','obra') THEN
    RAISE EXCEPTION 'Origem inválida: %. Vale preventiva, corretiva ou obra.', p_origem;
  END IF;
  IF p_prioridade NOT IN ('baixa','normal','alta','urgente') THEN
    RAISE EXCEPTION 'Prioridade inválida: %.', p_prioridade;
  END IF;

  -- Um local ou um ativo de outra organização seria uma fuga de dados entre
  -- clientes. Verifica-se, em vez de confiar no que o browser mandou.
  IF p_local_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.ops_local WHERE id = p_local_id AND organization_id = v_org) THEN
    RAISE EXCEPTION 'Esse local não é desta organização.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_ativo_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.ops_ativo
                    WHERE id = p_ativo_id AND organization_id = v_org) THEN
      RAISE EXCEPTION 'Esse ativo não é desta organização.' USING ERRCODE = 'insufficient_privilege';
    END IF;
    -- Sem local indicado, herda-se o do ativo: o técnico tem de saber onde é.
    IF v_local IS NULL THEN
      SELECT local_id INTO v_local FROM public.ops_ativo WHERE id = p_ativo_id;
    END IF;
  END IF;

  IF p_checklist_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.ops_checklist
     WHERE id = p_checklist_id AND organization_id = v_org AND estado = 'publicada') THEN
    RAISE EXCEPTION 'Essa checklist não existe, não é desta organização, ou não está publicada.';
  END IF;

  IF p_responsavel_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.ops_utilizador_perfil
     WHERE utilizador_id = p_responsavel_id AND organization_id = v_org AND ativo) THEN
    RAISE EXCEPTION 'Essa pessoa não está ativa em Operações nesta organização.';
  END IF;

  v_estado := CASE WHEN v_funcao = 'tecnico' THEN 'por_aprovar' ELSE 'agendada' END;
  v_codigo := public.ops_proximo_codigo_interno(v_org, 'OT');

  INSERT INTO public.ops_ordem (
    organization_id, codigo, origem, estado, prioridade, area, tipo,
    cliente_id, local_id, titulo, descricao,
    contacto_nome, contacto_telefone, agendada_para, responsavel_id, criada_por
  ) VALUES (
    v_org, v_codigo, p_origem, v_estado, p_prioridade, p_area, p_tipo,
    p_cliente_id, v_local, v_titulo, nullif(btrim(coalesce(p_descricao,'')), ''),
    nullif(btrim(coalesce(p_contacto_nome,'')), ''),
    nullif(btrim(coalesce(p_contacto_telefone,'')), ''),
    p_agendada_para, p_responsavel_id, v_user
  ) RETURNING id INTO v_id;

  -- Um alvo só nasce se houver alguma coisa para lá pôr. Uma linha de alvo
  -- vazia seria recusada pelo CHECK da tabela, e com razão.
  IF p_ativo_id IS NOT NULL OR v_local IS NOT NULL OR p_checklist_id IS NOT NULL THEN
    SELECT versao INTO v_versao FROM public.ops_checklist WHERE id = p_checklist_id;

    INSERT INTO public.ops_ordem_alvo
      (ordem_id, ativo_id, local_id, checklist_id, checklist_versao, posicao)
    VALUES (v_id, p_ativo_id, v_local, p_checklist_id, v_versao, 0)
    RETURNING id INTO v_alvo;

    -- As tarefas da checklist copiam-se agora, com a versão congelada. É o
    -- mesmo que a materialização de planos faz — republicar a checklist
    -- amanhã não muda o que esta ordem manda fazer.
    IF p_checklist_id IS NOT NULL THEN
      INSERT INTO public.ops_ordem_tarefa (
        ordem_id, ordem_alvo_id, checklist_tarefa_id, posicao, codigo, nome,
        tipo, skill_id, privada, obrigatoria, tempo_estimado
      )
      SELECT v_id, v_alvo, ct.id, ct.posicao, ct.codigo, ct.nome, ct.tipo,
             ct.skill_id, ct.privada, ct.obrigatoria, ct.tempo_estimado
        FROM public.ops_checklist_tarefa ct
       WHERE ct.checklist_id = p_checklist_id
       ORDER BY ct.posicao;

      INSERT INTO public.ops_ordem_tarefa_medicao (
        ordem_tarefa_id, medicao_def_id, nome, tipo, unidade, limite_min, limite_max)
      SELECT ot.id, md.id, md.nome, md.tipo, md.unidade, md.limite_min, md.limite_max
        FROM public.ops_ordem_tarefa ot
        JOIN public.ops_checklist_tarefa_medicao ctm
          ON ctm.checklist_tarefa_id = ot.checklist_tarefa_id
        JOIN public.ops_medicao_def md ON md.id = ctm.medicao_def_id
       WHERE ot.ordem_id = v_id
      ON CONFLICT (ordem_tarefa_id, medicao_def_id) DO NOTHING;
    END IF;
  END IF;

  IF p_responsavel_id IS NOT NULL THEN
    INSERT INTO public.ops_ordem_pessoa (ordem_id, utilizador_id, papel)
    VALUES (v_id, p_responsavel_id, 'responsavel')
    ON CONFLICT DO NOTHING;
  END IF;

  INSERT INTO public.ops_evento
    (organization_id, entidade, entidade_id, tipo, descricao, autor_id, antes, depois)
  VALUES
    (v_org, 'ordem', v_id, 'criada', v_titulo, v_user, NULL,
     jsonb_build_object('codigo', v_codigo, 'estado', v_estado, 'origem', p_origem));

  RETURN jsonb_build_object(
    'ok', true,
    'id', v_id,
    'codigo', v_codigo,
    'estado', v_estado,
    'tarefas', (SELECT count(*) FROM public.ops_ordem_tarefa WHERE ordem_id = v_id)
  );
END
$$;

REVOKE ALL ON FUNCTION public.ops_criar_ordem_impl(
  text, uuid, text, text, text, uuid, uuid, uuid, text, text, text, text, timestamptz, uuid)
  FROM PUBLIC, anon, authenticated;

-- O invólucro autoriza a fechadura das leituras, porque semear as medições da
-- checklist é escrever em `ops_ordem_tarefa_medicao`.
CREATE OR REPLACE FUNCTION public.rpc_ops_criar_ordem(
  p_titulo            text,
  p_cliente_id        uuid,
  p_origem            text    DEFAULT 'corretiva',
  p_prioridade        text    DEFAULT 'normal',
  p_descricao         text    DEFAULT NULL,
  p_local_id          uuid    DEFAULT NULL,
  p_ativo_id          uuid    DEFAULT NULL,
  p_checklist_id      uuid    DEFAULT NULL,
  p_area              text    DEFAULT NULL,
  p_tipo              text    DEFAULT NULL,
  p_contacto_nome     text    DEFAULT NULL,
  p_contacto_telefone text    DEFAULT NULL,
  p_agendada_para     timestamptz DEFAULT NULL,
  p_responsavel_id    uuid    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE r jsonb;
BEGIN
  PERFORM set_config('ops.medicao', 'autorizada', true);
  r := public.ops_criar_ordem_impl(
         p_titulo, p_cliente_id, p_origem, p_prioridade, p_descricao, p_local_id,
         p_ativo_id, p_checklist_id, p_area, p_tipo, p_contacto_nome,
         p_contacto_telefone, p_agendada_para, p_responsavel_id);
  PERFORM set_config('ops.medicao', '', true);
  RETURN r;
END
$$;

REVOKE ALL ON FUNCTION public.rpc_ops_criar_ordem(
  text, uuid, text, text, text, uuid, uuid, uuid, text, text, text, text, timestamptz, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_ops_criar_ordem(
  text, uuid, text, text, text, uuid, uuid, uuid, text, text, text, text, timestamptz, uuid)
  TO authenticated, service_role;


-- ============================================================
-- 3. Atribuir
-- ============================================================
-- Quem está na ordem passa a poder executá-la — é por isso que isto não é uma
-- edição de campo qualquer. `p_equipa` substitui a equipa inteira; o
-- responsável entra nela sempre, mesmo que venha esquecido da lista.

CREATE OR REPLACE FUNCTION public.rpc_ops_atribuir_ordem(
  p_ordem_id       uuid,
  p_responsavel_id uuid,
  p_equipa         uuid[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user   uuid;
  v_funcao text;
  v_o      record;
  v_antes  uuid;
  v_equipa uuid[];
  v_mau    uuid;
BEGIN
  SELECT * INTO v_o FROM public.ops_ordem WHERE id = p_ordem_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ordem não encontrada.' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT q.utilizador_id, q.funcao INTO v_user, v_funcao
    FROM public.ops_quem_sou(v_o.organization_id) q;

  -- Distribuir trabalho é decisão de quem coordena. Um técnico não se
  -- auto-atribui a uma ordem que não é dele.
  IF v_funcao = 'tecnico' THEN
    RAISE EXCEPTION 'Só quem coordena distribui o trabalho.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT (
    public.is_system_admin_user(auth.uid())
    OR public.has_anew_permission(auth.uid(), 'operations.orders.edit')
  ) THEN
    RAISE EXCEPTION 'Sem permissão para editar ordens.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_o.estado IN ('fechada','confirmada','cancelada') THEN
    RAISE EXCEPTION 'Não se atribui uma ordem % — o trabalho já acabou.',
      replace(v_o.estado, '_', ' ');
  END IF;

  v_equipa := COALESCE(p_equipa, ARRAY[]::uuid[]);
  IF p_responsavel_id IS NOT NULL AND NOT (p_responsavel_id = ANY (v_equipa)) THEN
    v_equipa := v_equipa || p_responsavel_id;
  END IF;

  -- Toda a gente de uma vez, com o nome do primeiro que não serve. Recusar
  -- sem dizer quem obriga a adivinhar.
  SELECT u INTO v_mau FROM unnest(v_equipa) AS u
   WHERE NOT EXISTS (
     SELECT 1 FROM public.ops_utilizador_perfil
      WHERE utilizador_id = u AND organization_id = v_o.organization_id AND ativo)
   LIMIT 1;

  IF v_mau IS NOT NULL THEN
    RAISE EXCEPTION '% não está ativo em Operações nesta organização.',
      COALESCE((SELECT name FROM public.anew_users WHERE id = v_mau), 'Essa pessoa');
  END IF;

  v_antes := v_o.responsavel_id;

  UPDATE public.ops_ordem
     SET responsavel_id = p_responsavel_id, atualizada_em = now()
   WHERE id = p_ordem_id;

  DELETE FROM public.ops_ordem_pessoa
   WHERE ordem_id = p_ordem_id AND NOT (utilizador_id = ANY (v_equipa));

  INSERT INTO public.ops_ordem_pessoa (ordem_id, utilizador_id, papel)
  SELECT p_ordem_id, u,
         CASE WHEN u = p_responsavel_id THEN 'responsavel' ELSE 'executante' END
    FROM unnest(v_equipa) AS u
  ON CONFLICT (ordem_id, utilizador_id) DO UPDATE
    SET papel = EXCLUDED.papel;

  INSERT INTO public.ops_evento
    (organization_id, entidade, entidade_id, tipo, descricao, autor_id, antes, depois)
  VALUES
    (v_o.organization_id, 'ordem', p_ordem_id, 'atribuida',
     COALESCE((SELECT name FROM public.anew_users WHERE id = p_responsavel_id),
              'sem responsável'),
     v_user,
     jsonb_build_object('responsavel_id', v_antes),
     jsonb_build_object('responsavel_id', p_responsavel_id,
                        'equipa', to_jsonb(v_equipa)));

  -- Só quando o responsável MUDA, e nunca para quem carregou no botão. Quem
  -- se atribui a si próprio já sabe; quem reatribui à mesma pessoa não mudou
  -- nada. Sem estas duas condições, o sino toca por tudo e deixa de contar.
  IF p_responsavel_id IS NOT NULL
     AND p_responsavel_id IS DISTINCT FROM v_antes
     AND p_responsavel_id IS DISTINCT FROM v_user
     AND to_regprocedure('public.ops_notificar(uuid,uuid,text,text,text,text,uuid,text)')
         IS NOT NULL THEN
    PERFORM public.ops_notificar(
      v_o.organization_id, p_responsavel_id, 'operacoes_ordem_atribuida',
      v_o.codigo || ' é tua',
      v_o.titulo
        || CASE WHEN v_o.agendada_para IS NOT NULL
                THEN ' · ' || to_char(v_o.agendada_para, 'DD/MM às HH24:MI')
                ELSE '' END,
      '/operacao/ordens/' || v_o.codigo, p_ordem_id,
      CASE v_o.prioridade WHEN 'urgente' THEN 'urgent'
                          WHEN 'alta'    THEN 'high'
                          ELSE 'medium' END);
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'responsavel_id', p_responsavel_id,
    'equipa', (SELECT count(*) FROM public.ops_ordem_pessoa WHERE ordem_id = p_ordem_id)
  );
END
$$;

REVOKE ALL ON FUNCTION public.rpc_ops_atribuir_ordem(uuid, uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_ops_atribuir_ordem(uuid, uuid, uuid[])
  TO authenticated, service_role;


-- ============================================================
-- 4. Quem já está ocupado a essa hora
-- ============================================================
-- Só olha para ordens de Operações. O CRM tem o seu próprio motor de agenda
-- (`schedule_items`, `check_schedule_conflict`), mas esse trabalha com
-- "recursos", não com utilizadores, e ligar as duas coisas exige um mapa que
-- hoje não existe. Ligar isso é uma decisão a tomar, não um pressuposto.

CREATE OR REPLACE FUNCTION public.ops_conflitos_de_agenda(
  _utilizador_id uuid,
  _inicio        timestamptz,
  _fim           timestamptz,
  _excluir_ordem uuid DEFAULT NULL
)
RETURNS TABLE (ordem_id uuid, codigo text, titulo text, agendada_para timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT o.id, o.codigo, o.titulo, o.agendada_para
    FROM public.ops_ordem o
   WHERE o.agendada_para IS NOT NULL
     AND o.estado IN ('agendada','em_curso','pausada')
     AND (_excluir_ordem IS NULL OR o.id <> _excluir_ordem)
     AND (o.responsavel_id = _utilizador_id
          OR EXISTS (SELECT 1 FROM public.ops_ordem_pessoa p
                      WHERE p.ordem_id = o.id AND p.utilizador_id = _utilizador_id))
     -- Sem janela declarada, assume-se uma hora. É melhor do que assumir zero,
     -- que faria duas visitas à mesma hora nunca chocarem.
     AND tstzrange(COALESCE(o.janela_inicio, o.agendada_para),
                   COALESCE(o.janela_fim, o.agendada_para + interval '1 hour'), '[)')
         && tstzrange(_inicio, COALESCE(_fim, _inicio + interval '1 hour'), '[)')
   ORDER BY o.agendada_para
$$;

REVOKE ALL ON FUNCTION public.ops_conflitos_de_agenda(uuid, timestamptz, timestamptz, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ops_conflitos_de_agenda(uuid, timestamptz, timestamptz, uuid)
  TO authenticated, service_role;


-- ============================================================
-- 5. Agendar
-- ============================================================
-- O choque de agenda AVISA, não impede. Há dias em que se marca mesmo duas
-- coisas seguidas e se sabe porquê; o que não pode acontecer é marcar-se sem
-- dar por isso. Por isso a resposta traz sempre os conflitos, e o ecrã
-- mostra-os — mas a ordem fica agendada.

CREATE OR REPLACE FUNCTION public.rpc_ops_agendar_ordem(
  p_ordem_id      uuid,
  p_agendada_para timestamptz,
  p_janela_inicio timestamptz DEFAULT NULL,
  p_janela_fim    timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user      uuid;
  v_funcao    text;
  v_o         record;
  v_conflitos jsonb := '[]'::jsonb;
  v_ini       timestamptz;
  v_fim       timestamptz;
BEGIN
  SELECT * INTO v_o FROM public.ops_ordem WHERE id = p_ordem_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ordem não encontrada.' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT q.utilizador_id, q.funcao INTO v_user, v_funcao
    FROM public.ops_quem_sou(v_o.organization_id) q;

  IF v_funcao = 'tecnico' THEN
    RAISE EXCEPTION 'Só quem coordena marca as datas.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT (
    public.is_system_admin_user(auth.uid())
    OR public.has_anew_permission(auth.uid(), 'operations.orders.edit')
  ) THEN
    RAISE EXCEPTION 'Sem permissão para editar ordens.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_o.estado IN ('fechada','confirmada','cancelada') THEN
    RAISE EXCEPTION 'Não se agenda uma ordem % — o trabalho já acabou.',
      replace(v_o.estado, '_', ' ');
  END IF;

  IF p_agendada_para IS NULL THEN
    RAISE EXCEPTION 'Falta a data.';
  END IF;

  IF p_janela_inicio IS NOT NULL AND p_janela_fim IS NOT NULL
     AND p_janela_fim <= p_janela_inicio THEN
    RAISE EXCEPTION 'A janela de visita acaba antes de começar.';
  END IF;

  v_ini := COALESCE(p_janela_inicio, p_agendada_para);
  v_fim := COALESCE(p_janela_fim, v_ini + interval '1 hour');

  UPDATE public.ops_ordem
     SET agendada_para = p_agendada_para,
         janela_inicio = p_janela_inicio,
         janela_fim    = p_janela_fim,
         atualizada_em = now()
   WHERE id = p_ordem_id;

  IF v_o.responsavel_id IS NOT NULL THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'codigo', c.codigo, 'titulo', c.titulo, 'agendada_para', c.agendada_para)), '[]'::jsonb)
      INTO v_conflitos
      FROM public.ops_conflitos_de_agenda(v_o.responsavel_id, v_ini, v_fim, p_ordem_id) c;
  END IF;

  INSERT INTO public.ops_evento
    (organization_id, entidade, entidade_id, tipo, descricao, autor_id, antes, depois)
  VALUES
    (v_o.organization_id, 'ordem', p_ordem_id, 'agendada',
     to_char(p_agendada_para, 'YYYY-MM-DD HH24:MI'), v_user,
     jsonb_build_object('agendada_para', v_o.agendada_para),
     jsonb_build_object('agendada_para', p_agendada_para,
                        'janela_inicio', p_janela_inicio,
                        'janela_fim', p_janela_fim,
                        'conflitos', jsonb_array_length(v_conflitos)));

  RETURN jsonb_build_object(
    'ok', true,
    'agendada_para', p_agendada_para,
    'conflitos', v_conflitos
  );
END
$$;

REVOKE ALL ON FUNCTION public.rpc_ops_agendar_ordem(uuid, timestamptz, timestamptz, timestamptz)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_ops_agendar_ordem(uuid, timestamptz, timestamptz, timestamptz)
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
     AND proname IN ('ops_quem_sou','ops_criar_ordem_impl','rpc_ops_criar_ordem',
                     'rpc_ops_atribuir_ordem','ops_conflitos_de_agenda',
                     'rpc_ops_agendar_ordem');
  IF n <> 6 THEN
    RAISE EXCEPTION 'Faltam funções de despacho: esperava 6, encontrei %.', n;
  END IF;

  RAISE NOTICE 'Despacho pronto. Já se cria, atribui e agenda uma ordem sem esperar por um plano.';
END
$v$;
