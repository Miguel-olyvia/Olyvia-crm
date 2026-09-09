-- ============================================================
--  Operações — pôr os dados lá dentro
-- ============================================================
--  Correr DEPOIS de todos os outros.
--
--  Até aqui, tudo o que o módulo faz depende de dados que só se metiam por
--  SQL à mão: locais, equipamentos, checklists, medições, e quem é técnico.
--  Construiu-se o carro todo e não havia forma de o abastecer.
--
--  Este ficheiro dá as três coisas que faltavam à base para os ecrãs de
--  configuração existirem:
--
--   · códigos automáticos (LOC-0001, AT-0001, CL-0001, MED-0001), porque
--     obrigar alguém a inventar um código único é um convite ao engano;
--   · gravar uma checklist inteira de uma vez — cabeçalho, tarefas e
--     medições — numa transação só. Meia checklist gravada é pior do que
--     nenhuma;
--   · versionar ao publicar: uma checklist publicada é imutável, e editá-la
--     cria a versão seguinte. Sem isto, corrigir uma tarefa hoje reescreveria
--     o que foi feito o ano passado.
--
--  Escreve fora de `ops_*`? NÃO.
-- ============================================================

BEGIN;

-- ============================================================
-- 1. Um código que ninguém tem de inventar
-- ============================================================
-- `ops_proximo_codigo_interno` já existe para ordens (OT) e planos (PLN).
-- Aqui expõe-se à app, com uma lista fechada de prefixos: sem ela, alguém
-- podia pedir códigos numa sequência que não existe e ficar com buracos.

CREATE OR REPLACE FUNCTION public.rpc_ops_proximo_codigo(
  p_organization_id uuid,
  p_prefixo         text
)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_user uuid; v_funcao text;
BEGIN
  IF p_prefixo NOT IN ('LOC','AT','CL','MED','CAT') THEN
    RAISE EXCEPTION 'Prefixo desconhecido: %.', p_prefixo;
  END IF;

  SELECT q.utilizador_id, q.funcao INTO v_user, v_funcao
    FROM public.ops_quem_sou(p_organization_id) q;

  RETURN public.ops_proximo_codigo_interno(p_organization_id, p_prefixo);
END
$$;

REVOKE ALL ON FUNCTION public.rpc_ops_proximo_codigo(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_ops_proximo_codigo(uuid, text) TO authenticated, service_role;


-- ============================================================
-- 2. Gravar uma checklist inteira
-- ============================================================
-- Cabeçalho, tarefas e as medições de cada tarefa, numa transação só.
--
-- Duas regras que valem a pena dizer em voz alta:
--
--  · uma checklist PUBLICADA não se edita. Editá-la criaria uma versão nova
--    da mesma checklist, e as ordens já criadas continuam a apontar para a
--    versão antiga — que é o que `checklist_versao` sempre quis dizer;
--  · as tarefas são substituídas por inteiro. Reconciliar linha a linha
--    daria a impressão de que se preservam respostas, e não se preservam:
--    as respostas vivem em `ops_ordem_tarefa`, noutra tabela.

CREATE OR REPLACE FUNCTION public.rpc_ops_gravar_checklist(
  p_checklist_id uuid,          -- NULL = criar
  p_nome         text,
  p_org_id       uuid,
  p_tarefas      jsonb DEFAULT '[]'::jsonb,
  p_publicar     boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user     uuid;
  v_funcao   text;
  v_nome     text := nullif(btrim(coalesce(p_nome, '')), '');
  v_id       uuid := p_checklist_id;
  v_codigo   text;
  v_versao   integer := 1;
  v_estado   text;
  v_t        jsonb;
  v_tid      uuid;
  v_pos      integer := 0;
  v_n        integer := 0;
  v_nova     boolean := false;
  v_med      jsonb;
BEGIN
  IF v_nome IS NULL THEN
    RAISE EXCEPTION 'Uma checklist precisa de um nome.';
  END IF;

  SELECT q.utilizador_id, q.funcao INTO v_user, v_funcao FROM public.ops_quem_sou(p_org_id) q;

  IF NOT (
    public.is_system_admin_user(auth.uid())
    OR public.has_anew_permission(auth.uid(), 'operations.checklists.manage')
  ) THEN
    RAISE EXCEPTION 'Sem permissão para gerir checklists.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_id IS NULL THEN
    v_codigo := public.ops_proximo_codigo_interno(p_org_id, 'CL');
    v_nova := true;
  ELSE
    SELECT codigo, versao, estado INTO v_codigo, v_versao, v_estado
      FROM public.ops_checklist WHERE id = v_id AND organization_id = p_org_id;

    IF v_codigo IS NULL THEN
      RAISE EXCEPTION 'Checklist não encontrada nesta organização.' USING ERRCODE = 'no_data_found';
    END IF;

    -- Publicada = imutável. Editar cria a versão seguinte, e a anterior fica
    -- arquivada — as ordens antigas continuam a apontar para ela.
    IF v_estado = 'publicada' THEN
      UPDATE public.ops_checklist SET estado = 'arquivada' WHERE id = v_id;
      v_versao := v_versao + 1;
      v_id := NULL;
      v_nova := true;
    END IF;
  END IF;

  IF v_nova THEN
    INSERT INTO public.ops_checklist (organization_id, codigo, nome, versao, estado, publicada_em)
    VALUES (p_org_id, v_codigo, v_nome, v_versao,
            CASE WHEN p_publicar THEN 'publicada' ELSE 'rascunho' END,
            CASE WHEN p_publicar THEN now() END)
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.ops_checklist SET
      nome         = v_nome,
      estado       = CASE WHEN p_publicar THEN 'publicada' ELSE estado END,
      publicada_em = CASE WHEN p_publicar THEN now() ELSE publicada_em END
    WHERE id = v_id;
  END IF;

  -- As tarefas, substituídas por inteiro.
  DELETE FROM public.ops_checklist_tarefa WHERE checklist_id = v_id;

  FOR v_t IN SELECT * FROM jsonb_array_elements(COALESCE(p_tarefas, '[]'::jsonb)) LOOP
    IF nullif(btrim(coalesce(v_t->>'nome', '')), '') IS NULL THEN
      RAISE EXCEPTION 'A tarefa na posição % não tem nome.', v_pos + 1;
    END IF;

    IF COALESCE(v_t->>'tipo', 'inspecao')
       NOT IN ('inspecao','correcao','limpeza','proacao','substituicao') THEN
      RAISE EXCEPTION 'Tipo de tarefa inválido: %.', v_t->>'tipo';
    END IF;

    INSERT INTO public.ops_checklist_tarefa (
      checklist_id, posicao, nome, descricao, tipo, obrigatoria, privada,
      foto_obrigatoria, tempo_estimado)
    VALUES (
      v_id, v_pos, btrim(v_t->>'nome'),
      nullif(btrim(coalesce(v_t->>'descricao', '')), ''),
      COALESCE(v_t->>'tipo', 'inspecao'),
      COALESCE((v_t->>'obrigatoria')::boolean, true),
      COALESCE((v_t->>'privada')::boolean, false),
      COALESCE((v_t->>'foto_obrigatoria')::boolean, false),
      COALESCE((v_t->>'tempo_estimado')::integer, 0))
    RETURNING id INTO v_tid;

    -- As medições que esta tarefa recolhe.
    FOR v_med IN SELECT * FROM jsonb_array_elements(COALESCE(v_t->'medicoes', '[]'::jsonb)) LOOP
      IF NOT EXISTS (SELECT 1 FROM public.ops_medicao_def
                      WHERE id = (v_med#>>'{}')::uuid AND organization_id = p_org_id) THEN
        RAISE EXCEPTION 'Uma das medições não existe nesta organização.'
          USING ERRCODE = 'insufficient_privilege';
      END IF;

      INSERT INTO public.ops_checklist_tarefa_medicao (checklist_tarefa_id, medicao_def_id, posicao)
      VALUES (v_tid, (v_med#>>'{}')::uuid, 0)
      ON CONFLICT DO NOTHING;
    END LOOP;

    v_pos := v_pos + 1;
    v_n := v_n + 1;
  END LOOP;

  INSERT INTO public.ops_evento
    (organization_id, entidade, entidade_id, tipo, descricao, autor_id, antes, depois)
  VALUES
    (p_org_id, 'checklist', v_id,
     CASE WHEN p_publicar THEN 'publicada' ELSE 'gravada' END, v_nome, v_user, NULL,
     jsonb_build_object('codigo', v_codigo, 'versao', v_versao, 'tarefas', v_n));

  RETURN jsonb_build_object(
    'ok', true, 'id', v_id, 'codigo', v_codigo, 'versao', v_versao,
    'tarefas', v_n, 'publicada', p_publicar);
END
$$;

REVOKE ALL ON FUNCTION public.rpc_ops_gravar_checklist(uuid, text, uuid, jsonb, boolean)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_ops_gravar_checklist(uuid, text, uuid, jsonb, boolean)
  TO authenticated, service_role;


-- ============================================================
-- 3. Gravar uma medição e as suas opções
-- ============================================================
-- Uma medição de escolha sem opções é uma pergunta sem respostas possíveis.
-- Recusa-se, em vez de a deixar gravar e só falhar no telhado.

CREATE OR REPLACE FUNCTION public.rpc_ops_gravar_medicao(
  p_medicao_id  uuid,          -- NULL = criar
  p_org_id      uuid,
  p_nome        text,
  p_tipo        text,
  p_categoria_id uuid    DEFAULT NULL,
  p_unidade     text     DEFAULT NULL,
  p_limite_min  numeric  DEFAULT NULL,
  p_limite_max  numeric  DEFAULT NULL,
  p_opcoes      jsonb    DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user uuid;
  v_funcao text;
  v_nome text := nullif(btrim(coalesce(p_nome, '')), '');
  v_id   uuid := p_medicao_id;
  v_o    jsonb;
  v_pos  integer := 0;
  v_n    integer := 0;
BEGIN
  IF v_nome IS NULL THEN
    RAISE EXCEPTION 'Uma medição precisa de um nome.';
  END IF;

  IF p_tipo NOT IN ('gama','acumulado','escolha','texto') THEN
    RAISE EXCEPTION 'Tipo de medição inválido: %.', p_tipo;
  END IF;

  SELECT q.utilizador_id, q.funcao INTO v_user, v_funcao FROM public.ops_quem_sou(p_org_id) q;

  IF NOT (
    public.is_system_admin_user(auth.uid())
    OR public.has_anew_permission(auth.uid(), 'operations.checklists.manage')
    OR public.has_anew_permission(auth.uid(), 'operations.settings.manage')
  ) THEN
    RAISE EXCEPTION 'Sem permissão para gerir medições.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_tipo = 'escolha' AND jsonb_array_length(COALESCE(p_opcoes, '[]'::jsonb)) = 0 THEN
    RAISE EXCEPTION
      'Uma medição de escolha precisa de pelo menos uma opção — senão é uma pergunta sem respostas.';
  END IF;

  IF p_tipo = 'gama' AND p_limite_min IS NULL AND p_limite_max IS NULL THEN
    RAISE EXCEPTION
      'Uma gama sem limites nunca dá veredicto nenhum. Põe um mínimo, um máximo, ou os dois.';
  END IF;

  IF p_limite_min IS NOT NULL AND p_limite_max IS NOT NULL AND p_limite_min > p_limite_max THEN
    RAISE EXCEPTION 'O mínimo (%) é maior do que o máximo (%).', p_limite_min, p_limite_max;
  END IF;

  IF p_categoria_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.ops_categoria_ativo
     WHERE id = p_categoria_id AND organization_id = p_org_id) THEN
    RAISE EXCEPTION 'Essa categoria não é desta organização.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_id IS NULL THEN
    INSERT INTO public.ops_medicao_def (
      organization_id, categoria_ativo_id, nome, tipo, unidade, limite_min, limite_max)
    VALUES (p_org_id, p_categoria_id, v_nome, p_tipo, nullif(btrim(coalesce(p_unidade,'')), ''),
            p_limite_min, p_limite_max)
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.ops_medicao_def SET
      categoria_ativo_id = p_categoria_id,
      nome       = v_nome,
      tipo       = p_tipo,
      unidade    = nullif(btrim(coalesce(p_unidade,'')), ''),
      limite_min = p_limite_min,
      limite_max = p_limite_max
    WHERE id = v_id AND organization_id = p_org_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Medição não encontrada nesta organização.' USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  -- As opções são substituídas, mas por nome: assim uma leitura antiga que
  -- aponta para "Não conforme" continua a apontar para a mesma linha.
  DELETE FROM public.ops_medicao_opcao o
   WHERE o.medicao_def_id = v_id
     AND NOT EXISTS (
       SELECT 1 FROM jsonb_array_elements(COALESCE(p_opcoes, '[]'::jsonb)) x
        WHERE btrim(x->>'nome') = o.nome);

  FOR v_o IN SELECT * FROM jsonb_array_elements(COALESCE(p_opcoes, '[]'::jsonb)) LOOP
    INSERT INTO public.ops_medicao_opcao
      (medicao_def_id, nome, posicao, e_nao_conforme, cria_corretiva)
    VALUES (
      v_id, btrim(v_o->>'nome'), v_pos,
      COALESCE((v_o->>'e_nao_conforme')::boolean, false),
      COALESCE((v_o->>'cria_corretiva')::boolean, false))
    ON CONFLICT (medicao_def_id, nome) DO UPDATE SET
      posicao        = EXCLUDED.posicao,
      e_nao_conforme = EXCLUDED.e_nao_conforme,
      cria_corretiva = EXCLUDED.cria_corretiva;
    v_pos := v_pos + 1;
    v_n := v_n + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'id', v_id, 'opcoes', v_n);
END
$$;

REVOKE ALL ON FUNCTION public.rpc_ops_gravar_medicao(
  uuid, uuid, text, text, uuid, text, numeric, numeric, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_ops_gravar_medicao(
  uuid, uuid, text, text, uuid, text, numeric, numeric, jsonb) TO authenticated, service_role;


-- ============================================================
-- 4. Quem é da equipa, e o que faz
-- ============================================================
-- `ops_utilizador_perfil` já tem RLS que exige `operations.settings.manage`.
-- Esta RPC existe por causa do `custo_hora`: é o número que faz o custo real
-- de mão de obra existir, e mexer nele sem deixar rasto seria a maneira mais
-- silenciosa de tornar todos os relatórios de custo errados.

CREATE OR REPLACE FUNCTION public.rpc_ops_gravar_perfil(
  p_org_id     uuid,
  p_utilizador uuid,
  p_funcao     text,
  p_custo_hora numeric DEFAULT NULL,
  p_ativo      boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user   uuid;
  v_funcao text;
  v_antes  record;
BEGIN
  SELECT q.utilizador_id, q.funcao INTO v_user, v_funcao FROM public.ops_quem_sou(p_org_id) q;

  IF NOT (
    public.is_system_admin_user(auth.uid())
    OR public.has_anew_permission(auth.uid(), 'operations.settings.manage')
  ) THEN
    RAISE EXCEPTION 'Sem permissão para gerir a equipa.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_funcao NOT IN ('admin','gestor','operador','tecnico') THEN
    RAISE EXCEPTION 'Função inválida: %.', p_funcao;
  END IF;

  IF p_custo_hora IS NOT NULL AND p_custo_hora < 0 THEN
    RAISE EXCEPTION 'O custo à hora não pode ser negativo.';
  END IF;

  -- A pessoa tem de existir no CRM e ter acesso a esta organização. Sem isto,
  -- dava-se um perfil de Operações a alguém que nem consegue entrar.
  IF NOT EXISTS (
    SELECT 1 FROM public.anew_memberships
     WHERE user_id = p_utilizador AND organization_id = p_org_id AND status = 'active') THEN
    RAISE EXCEPTION 'Essa pessoa não tem acesso ativo a esta organização no Olyvia.';
  END IF;

  -- Ninguém se despromove nem se desliga a si próprio: é a maneira mais fácil
  -- de uma organização ficar sem ninguém que possa gerir nada.
  IF p_utilizador = v_user AND v_funcao IN ('admin','gestor')
     AND (p_funcao NOT IN ('admin','gestor') OR NOT p_ativo) THEN
    RAISE EXCEPTION
      'Não te podes tirar a ti próprio a gestão. Pede a outra pessoa com acesso.';
  END IF;

  SELECT funcao, custo_hora, ativo INTO v_antes
    FROM public.ops_utilizador_perfil
   WHERE utilizador_id = p_utilizador AND organization_id = p_org_id;

  INSERT INTO public.ops_utilizador_perfil
    (organization_id, utilizador_id, funcao, custo_hora, ativo)
  VALUES (p_org_id, p_utilizador, p_funcao, p_custo_hora, COALESCE(p_ativo, true))
  ON CONFLICT (organization_id, utilizador_id) DO UPDATE SET
    funcao     = EXCLUDED.funcao,
    custo_hora = EXCLUDED.custo_hora,
    ativo      = EXCLUDED.ativo;

  INSERT INTO public.ops_evento
    (organization_id, entidade, entidade_id, tipo, descricao, autor_id, antes, depois)
  VALUES
    (p_org_id, 'perfil', p_utilizador, 'perfil_alterado',
     COALESCE((SELECT name FROM public.anew_users WHERE id = p_utilizador), '—'), v_user,
     CASE WHEN v_antes IS NULL THEN NULL
          ELSE jsonb_build_object('funcao', v_antes.funcao,
                                  'custo_hora', v_antes.custo_hora,
                                  'ativo', v_antes.ativo) END,
     jsonb_build_object('funcao', p_funcao, 'custo_hora', p_custo_hora, 'ativo', p_ativo));

  RETURN jsonb_build_object('ok', true, 'utilizador_id', p_utilizador);
END
$$;

REVOKE ALL ON FUNCTION public.rpc_ops_gravar_perfil(uuid, uuid, text, numeric, boolean)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_ops_gravar_perfil(uuid, uuid, text, numeric, boolean)
  TO authenticated, service_role;


-- ============================================================
-- 5. Quem pode entrar na equipa
-- ============================================================
-- As pessoas com acesso a esta organização no Olyvia, e o perfil de Operações
-- que já tenham. É a lista que o ecrã da equipa mostra.
--
-- `security_invoker` outra vez: sem ele, esta vista mostraria toda a gente de
-- todas as organizações a quem a abrisse.

CREATE OR REPLACE VIEW public.ops_v_pessoas
WITH (security_invoker = true) AS
SELECT
  u.id                                   AS utilizador_id,
  m.organization_id,
  COALESCE(nullif(btrim(u.name), ''), u.email, '—') AS nome,
  u.email,
  p.funcao,
  p.ativo,
  (p.utilizador_id IS NOT NULL)          AS em_operacoes
FROM public.anew_memberships m
JOIN public.anew_users u ON u.id = m.user_id
LEFT JOIN public.ops_utilizador_perfil p
       ON p.utilizador_id = u.id AND p.organization_id = m.organization_id
WHERE m.status = 'active';

REVOKE ALL ON public.ops_v_pessoas FROM PUBLIC, anon;
GRANT SELECT ON public.ops_v_pessoas TO authenticated, service_role;

COMMIT;


-- ============================================================
-- Verificação
-- ============================================================
DO $v$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM pg_proc
   WHERE pronamespace = 'public'::regnamespace
     AND proname IN ('rpc_ops_proximo_codigo','rpc_ops_gravar_checklist',
                     'rpc_ops_gravar_medicao','rpc_ops_gravar_perfil');
  IF n <> 4 THEN
    RAISE EXCEPTION 'Faltam funções de configuração: esperava 4, encontrei %.', n;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_class WHERE relname = 'ops_v_pessoas'
      AND relnamespace = 'public'::regnamespace
      AND 'security_invoker=true' = ANY (reloptions)) THEN
    RAISE EXCEPTION 'ops_v_pessoas ficou sem security_invoker — mostraria gente de outras organizações.';
  END IF;

  RAISE NOTICE 'Configuração pronta. Já se metem locais, equipamentos, checklists e equipa sem SQL.';
END
$v$;
