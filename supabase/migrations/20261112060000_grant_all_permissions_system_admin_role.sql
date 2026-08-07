-- Regista em migration a alteracao ja aplicada diretamente na base de dados:
-- o papel de sistema "System Admin" (role_id = 03a43423-9b3c-4640-9dbe-31687f829869,
-- papel global, is_system = true) so tinha uma fracao das permissoes existentes
-- em anew_permissions. Decisao explicita do responsavel: o papel System Admin
-- deve ter, por definicao, TODAS as permissoes existentes na aplicacao.
--
-- ATENCAO: a tabela public.anew_role_permissions tem dois triggers que, por
-- desenho, protegem os papeis de sistema contra alteracoes de permissoes
-- (trg_protect_system_role_perms) e auditam alteracoes (trg_audit_anew_role_permissions).
-- Esta migration desativa deliberadamente os dois, insere as permissoes em
-- falta, e volta a ativa-los antes de terminar a transacao, exatamente como
-- foi feito manualmente nesta sessao. Isto contorna uma protecao existente de
-- forma intencional e autorizada -- nao remover os triggers, apenas
-- suspende-los durante esta operacao pontual.
--
-- A insercao deriva os codigos de anew_permissions em vez de fixar uma lista
-- literal, e usa ON CONFLICT DO NOTHING para ser idempotente (seguro voltar a
-- correr esta migration em qualquer ambiente, incluindo este, sem duplicar
-- nem falhar).

BEGIN;

ALTER TABLE public.anew_role_permissions DISABLE TRIGGER USER;

INSERT INTO public.anew_role_permissions (role_id, permission_code, created_by)
SELECT
  '03a43423-9b3c-4640-9dbe-31687f829869'::uuid AS role_id,
  p.code AS permission_code,
  NULL::uuid AS created_by
FROM public.anew_permissions p
ON CONFLICT (role_id, permission_code) DO NOTHING;

ALTER TABLE public.anew_role_permissions ENABLE TRIGGER USER;

DO $$
DECLARE
  v_missing int;
  v_trigger_status text;
BEGIN
  SELECT COUNT(*)
  INTO v_missing
  FROM public.anew_permissions p
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.anew_role_permissions rp
    WHERE rp.role_id = '03a43423-9b3c-4640-9dbe-31687f829869'
      AND rp.permission_code = p.code
  );

  IF v_missing > 0 THEN
    RAISE EXCEPTION 'System Admin continua sem % permissoes apos a insercao', v_missing;
  END IF;

  SELECT tgenabled INTO v_trigger_status
  FROM pg_trigger
  WHERE tgrelid = 'public.anew_role_permissions'::regclass
    AND tgname = 'trg_protect_system_role_perms';

  IF v_trigger_status IS DISTINCT FROM 'O' THEN
    RAISE EXCEPTION 'trg_protect_system_role_perms nao ficou ativo (tgenabled=%)', v_trigger_status;
  END IF;

  SELECT tgenabled INTO v_trigger_status
  FROM pg_trigger
  WHERE tgrelid = 'public.anew_role_permissions'::regclass
    AND tgname = 'trg_audit_anew_role_permissions';

  IF v_trigger_status IS DISTINCT FROM 'O' THEN
    RAISE EXCEPTION 'trg_audit_anew_role_permissions nao ficou ativo (tgenabled=%)', v_trigger_status;
  END IF;
END $$;

COMMIT;
