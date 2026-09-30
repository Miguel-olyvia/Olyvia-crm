-- Nike: passa a ter um dono (quem paga a conta) -- o utilizador 'Miguel tester'.
--
-- O QUE: define anew_organizations.created_by da organizacao nike como o
-- anew_users 'Miguel tester' (ba0b0ebf-1bdb-43f9-b82b-a2ade29848e2).
--
-- PORQUE: o criador original da nike ja nao existe (o id antigo nao e um
-- anew_users.id nem um auth_user_id), por isso ninguem podia ser dono da conta
-- e o novo ecra de Faturacao aparecia so de leitura para toda a gente. Decisao
-- do Miguel: o dono da nike passa a ser a conta de teste dele.
--
-- ESCOPO: SO a organizacao nike (b6ffce4f-f630-4933-833a-008649757a33). Nao
-- toca na sdfsdf, na Mudelar nem em nenhuma outra organizacao. Nao altera
-- subscricoes: a nike continua a resolver a faturacao para a propria linha.
--
-- SEGURANCA: re-executavel e segura numa base reconstruida do zero. Se a nike
-- ou o utilizador nao existirem, ou se o created_by ja nao for o valor antigo,
-- nao faz nada. A migration corre como postgres, por isso o trigger
-- trg_protect_created_by deixa passar; a verificacao final garante que uma
-- reversao silenciosa nunca passa despercebida (faz rollback de tudo).

SET LOCAL lock_timeout = '5s';

DO $$
DECLARE
  c_org    CONSTANT uuid := 'b6ffce4f-f630-4933-833a-008649757a33';
  c_user   CONSTANT uuid := 'ba0b0ebf-1bdb-43f9-b82b-a2ade29848e2';
  c_antigo CONSTANT uuid := 'c1631350-a74d-428f-ad26-57336dad05f8';
  v_atual  uuid;
  v_rows   integer;
  v_root   uuid;
  v_fat    uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.anew_organizations WHERE id = c_org) THEN
    RAISE NOTICE 'nike nao existe nesta base; nada a fazer.';
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.anew_users WHERE id = c_user) THEN
    RAISE NOTICE 'utilizador Miguel tester nao existe nesta base; nada a fazer.';
    RETURN;
  END IF;

  SELECT created_by INTO v_atual FROM public.anew_organizations WHERE id = c_org;
  IF v_atual IS DISTINCT FROM c_antigo THEN
    RAISE NOTICE 'created_by da nike ja nao e o valor antigo (%); nada a fazer.', v_atual;
    RETURN;
  END IF;

  UPDATE public.anew_organizations
     SET created_by = c_user
   WHERE id = c_org
     AND created_by = c_antigo;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'esperava atualizar 1 linha da nike, atualizou %', v_rows;
  END IF;

  v_root := public.resolve_root_payer_user_id(c_org);
  IF v_root IS DISTINCT FROM c_user THEN
    RAISE EXCEPTION 'o dono da nike nao ficou Miguel tester (resolve devolveu %)', v_root;
  END IF;

  v_fat := public.resolve_billing_organization_id(c_org);
  IF v_fat IS DISTINCT FROM c_org THEN
    RAISE EXCEPTION 'a faturacao da nike deixou de resolver para a propria nike (devolveu %)', v_fat;
  END IF;
END
$$;