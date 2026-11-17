-- 17/11: retirar um técnico/ofício (perfil de mão de obra, ops_skill) no Catálogo apaga-o na base.
--
-- Até aqui o botão «Retirar» dos Custos só o tirava do ecrã: gravarCatalogo.ts não mandava nada à base e o perfil voltava
-- ao recarregar. Apaga-se (não se desativa) porque há um índice único (organization_id, nome): um perfil desativado
-- impedia criar outro com o mesmo nome.
--
-- Só se apaga se não estiver em uso. As chaves estrangeiras para ops_skill fariam estragos em silêncio (SET NULL nos passos
-- das receitas e nas tarefas das obras/checklists/ordens; CASCADE nos cargos, pessoas e utilizadores) ou rebentariam sem
-- explicação (NO ACTION nas linhas das adendas). Por isso conta-se antes e, se houver uso, recusa-se com o sítio:
--   «Pintor» está em uso em 2 cargos e 1 pessoa: não se pode retirar.
-- As cópias por chave nos orçamentos (quote_line_oficios, orcamento_linha_oficios, quote_lines.perfil_chave) guardam o nome
-- e o custo do momento: não contam.
--
-- Erros: CT001 sem permissão (fn_cat_exigir, services.edit, como cat_guardar_perfil); CT003 não encontrado nesta organização;
--        CT005 em uso (novo; CT004 já é «nome repetido» nos atributos).
-- Sem tabelas, colunas nem políticas novas.

CREATE OR REPLACE FUNCTION public.cat_retirar_perfil(p_org uuid, p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_nome text;
  v_partes text[] := '{}';
  v_n integer;
  v_txt text;
BEGIN
  PERFORM public.fn_cat_exigir(p_org, 'services.edit');

  -- o lock da linha faz esperar quem esteja a ligar alguma coisa a este perfil (a FK pede FOR KEY SHARE): o que se conta
  -- a seguir é o que existe quando se apaga
  SELECT nome INTO v_nome FROM ops_skill WHERE id = p_id AND organization_id = p_org FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Perfil não encontrado.' USING ERRCODE = 'CT003'; END IF;

  SELECT count(DISTINCT t.servico_id) INTO v_n FROM ops_obra_servico_tarefa t JOIN services s ON s.id = t.servico_id
   WHERE t.skill_id = p_id AND NOT coalesce(s.is_deleted, false);
  IF v_n > 0 THEN v_partes := v_partes || (v_n || CASE WHEN v_n = 1 THEN ' serviço' ELSE ' serviços' END); END IF;

  SELECT count(DISTINCT cargo_id) INTO v_n FROM hr_cargos_oficios WHERE skill_id = p_id;
  IF v_n > 0 THEN v_partes := v_partes || (v_n || CASE WHEN v_n = 1 THEN ' cargo' ELSE ' cargos' END); END IF;

  SELECT count(DISTINCT pessoa_id) INTO v_n FROM pessoas_oficios WHERE skill_id = p_id;
  IF v_n > 0 THEN v_partes := v_partes || (v_n || CASE WHEN v_n = 1 THEN ' pessoa' ELSE ' pessoas' END); END IF;

  SELECT count(*) INTO v_n FROM ops_utilizador_skill WHERE skill_id = p_id;
  IF v_n > 0 THEN v_partes := v_partes || (v_n || CASE WHEN v_n = 1 THEN ' utilizador' ELSE ' utilizadores' END); END IF;

  SELECT count(DISTINCT obra_id) INTO v_n FROM ops_obra_tarefa WHERE skill_id = p_id;
  IF v_n > 0 THEN v_partes := v_partes || (v_n || CASE WHEN v_n = 1 THEN ' obra' ELSE ' obras' END); END IF;

  SELECT count(DISTINCT adenda_id) INTO v_n FROM adenda_linhas WHERE perfil_id = p_id;
  IF v_n > 0 THEN v_partes := v_partes || (v_n || CASE WHEN v_n = 1 THEN ' adenda' ELSE ' adendas' END); END IF;

  SELECT count(DISTINCT checklist_id) INTO v_n FROM ops_checklist_tarefa WHERE skill_id = p_id;
  IF v_n > 0 THEN v_partes := v_partes || (v_n || CASE WHEN v_n = 1 THEN ' checklist' ELSE ' checklists' END); END IF;

  SELECT count(DISTINCT ordem_id) INTO v_n FROM ops_ordem_tarefa WHERE skill_id = p_id;
  IF v_n > 0 THEN v_partes := v_partes || (v_n || CASE WHEN v_n = 1 THEN ' ordem de trabalho' ELSE ' ordens de trabalho' END); END IF;

  IF cardinality(v_partes) > 0 THEN
    v_txt := CASE WHEN cardinality(v_partes) = 1 THEN v_partes[1]
                  ELSE array_to_string(v_partes[1:cardinality(v_partes) - 1], ', ') || ' e ' || v_partes[cardinality(v_partes)] END;
    RAISE EXCEPTION '«%» está em uso em %: não se pode retirar.', v_nome, v_txt USING ERRCODE = 'CT005';
  END IF;

  DELETE FROM ops_skill WHERE id = p_id AND organization_id = p_org;
END $$;

COMMENT ON FUNCTION public.cat_retirar_perfil(uuid, uuid) IS
  'Catálogo (20270118800000): apaga um técnico/ofício (ops_skill) da organização. Recusa (CT005, com o sítio na mensagem) se estiver em uso em serviços vivos, cargos, pessoas, utilizadores, obras, adendas, checklists ou ordens de trabalho. Permissão services.edit.';

REVOKE ALL ON FUNCTION public.cat_retirar_perfil(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cat_retirar_perfil(uuid, uuid) TO authenticated, service_role;
