-- ============================================================
--  Operações — mandar o relatório ao cliente à mão
-- ============================================================
--  Correr DEPOIS de: relatorio-automatico.sql.
--
--  O automático manda quando a ordem é confirmada, e só se a organização o
--  tiver ligado. Falta o caso normal do dia a dia: o cliente ligou a pedir o
--  relatório, ou a ficha dele não tinha email na altura e já tem, ou a
--  organização não quer isto automático mas quer poder mandar.
--
--  ⚠ ESTE BOTÃO MANDA MESMO COM O AUTOMÁTICO DESLIGADO
--
--  E é de propósito. Desligado quer dizer "não quero que saia sozinho", não
--  quer dizer "não quero mandar nunca". Quem carrega no botão está a decidir.
--
--  ⚠ NÃO SE ESCOLHE O DESTINATÁRIO
--
--  O email é o da ficha do cliente no CRM, e mais nenhum. Um campo livre aqui
--  transformava o módulo numa maneira de mandar HTML para qualquer endereço a
--  partir do SMTP da empresa — que é exatamente a peça que se usa para
--  disfarçar um email de phishing de empresa a sério. Quem quiser mandar para
--  outro sítio corrige a ficha do cliente, que é onde essa decisão pertence.
--
--  Escreve fora de `ops_*`? A mesma linha em `scheduled_emails` do ficheiro
--  automático. Nada de novo.
-- ============================================================

BEGIN;

DO $requisitos$
BEGIN
  IF to_regprocedure('public.ops_relatorio_html(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Falta db/relatorio-automatico.sql.';
  END IF;
END
$requisitos$;


-- ============================================================
-- 1. Para quem é que isto ia
-- ============================================================
-- Perguntar antes de mandar. Um email não se chama de volta, e a diferença
-- entre "vai para geral@" e "vai para o Sr. Costa" decide-se antes e não
-- depois.

CREATE OR REPLACE FUNCTION public.rpc_ops_destino_do_relatorio(p_ordem_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user  uuid := public.current_business_user_id();
  v_o     record;
  v_email text;
  v_ja    timestamptz;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Sem sessão.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT id, organization_id, cliente_id, estado INTO v_o
    FROM public.ops_ordem WHERE id = p_ordem_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Essa ordem não existe.'; END IF;

  IF v_o.organization_id NOT IN (SELECT public.get_user_visible_org_ids(auth.uid())) THEN
    RAISE EXCEPTION 'Essa ordem é de outra organização.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT m.email INTO v_email
    FROM public.anew_clients cl
    JOIN public.anew_entity_emails m ON m.entity_id = cl.entity_id
   WHERE cl.id = v_o.cliente_id
   ORDER BY m.is_primary DESC NULLS LAST, m.created_at
   LIMIT 1;

  SELECT max(created_at) INTO v_ja
    FROM public.scheduled_emails
   WHERE entity_type = 'ops_ordem' AND entity_id = p_ordem_id
     AND status IN ('pending', 'sent');

  RETURN jsonb_build_object(
    'email',      nullif(btrim(COALESCE(v_email, '')), ''),
    'estado',     v_o.estado,
    'ja_enviado', v_ja
  );
END
$$;

REVOKE ALL ON FUNCTION public.rpc_ops_destino_do_relatorio(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_ops_destino_do_relatorio(uuid) TO authenticated;


-- ============================================================
-- 2. Mandar
-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_ops_enviar_relatorio(p_ordem_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user   uuid := public.current_business_user_id();
  v_funcao text;
  v_o      record;
  v_email  text;
  v_html   text;
  v_autor  uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Sem sessão.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF to_regclass('public.scheduled_emails') IS NULL THEN
    RAISE EXCEPTION 'Esta instalação não tem fila de emails.';
  END IF;

  SELECT id, organization_id, cliente_id, codigo, titulo, estado INTO v_o
    FROM public.ops_ordem WHERE id = p_ordem_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Essa ordem não existe.'; END IF;

  IF v_o.organization_id NOT IN (SELECT public.get_user_visible_org_ids(auth.uid())) THEN
    RAISE EXCEPTION 'Essa ordem é de outra organização.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Escrever a um cliente é um ato para fora da empresa. O técnico faz o
  -- trabalho; quem responde pelo que sai é quem gere.
  SELECT funcao INTO v_funcao
    FROM public.ops_utilizador_perfil
   WHERE utilizador_id = v_user AND organization_id = v_o.organization_id AND ativo;

  IF COALESCE(v_funcao, '') NOT IN ('admin', 'gestor')
     AND NOT public.is_system_admin_user(auth.uid()) THEN
    RAISE EXCEPTION 'Mandar o relatório ao cliente é de quem gere.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Um relatório de trabalho a meio não é um relatório: é uma promessa.
  IF v_o.estado NOT IN ('fechada', 'confirmada') THEN
    RAISE EXCEPTION 'A ordem ainda não está fechada. O relatório sai quando o trabalho acaba.';
  END IF;

  SELECT m.email INTO v_email
    FROM public.anew_clients cl
    JOIN public.anew_entity_emails m ON m.entity_id = cl.entity_id
   WHERE cl.id = v_o.cliente_id
   ORDER BY m.is_primary DESC NULLS LAST, m.created_at
   LIMIT 1;

  v_email := nullif(btrim(COALESCE(v_email, '')), '');
  IF v_email IS NULL THEN
    RAISE EXCEPTION 'A ficha deste cliente não tem email. Põe-lhe um e volta a tentar.';
  END IF;

  v_html := public.ops_relatorio_html(p_ordem_id);
  IF v_html IS NULL THEN
    RAISE EXCEPTION 'Não foi possível montar o relatório desta ordem.';
  END IF;

  SELECT COALESCE(u.auth_user_id, u.id) INTO v_autor
    FROM public.anew_users u WHERE u.id = v_user;
  IF v_autor IS NULL THEN
    RAISE EXCEPTION 'Não se sabe por que conta havia de sair este email.';
  END IF;

  INSERT INTO public.scheduled_emails
    (user_id, organization_id, entity_type, entity_id,
     to_email, subject, body_html, scheduled_for, status)
  VALUES
    (v_autor, v_o.organization_id, 'ops_ordem', p_ordem_id,
     v_email, v_o.codigo || ' — ' || v_o.titulo, v_html, now(), 'pending');

  /* Ao contrário do automático, aqui não há guarda contra repetir: se alguém
     carrega no botão outra vez é porque quer mandar outra vez — o cliente
     apagou, mudou de email, pediu ao telefone. O que fica é o rasto: cada
     envio é um evento, com quem mandou e para onde. */
  INSERT INTO public.ops_evento
    (organization_id, entidade, entidade_id, tipo, descricao, autor_id, antes, depois)
  VALUES
    (v_o.organization_id, 'ordem', p_ordem_id, 'relatorio_enviado',
     'Relatório enviado à mão para ' || v_email,
     v_user, NULL,
     jsonb_build_object('para', v_email, 'automatico', false));

  RETURN jsonb_build_object('ok', true, 'para', v_email);
END
$$;

REVOKE ALL ON FUNCTION public.rpc_ops_enviar_relatorio(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_ops_enviar_relatorio(uuid) TO authenticated;


-- ============================================================
-- 3. Verificação
-- ============================================================

DO $verificar$
BEGIN
  IF to_regprocedure('public.rpc_ops_enviar_relatorio(uuid)') IS NULL
     OR to_regprocedure('public.rpc_ops_destino_do_relatorio(uuid)') IS NULL THEN
    RAISE EXCEPTION 'As funções do envio à mão não ficaram criadas.';
  END IF;

  IF has_function_privilege('anon', 'public.rpc_ops_enviar_relatorio(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Quem não tem sessão não manda emails.';
  END IF;

  RAISE NOTICE 'Operações: o relatório também se manda à mão.';
END
$verificar$;

COMMIT;
