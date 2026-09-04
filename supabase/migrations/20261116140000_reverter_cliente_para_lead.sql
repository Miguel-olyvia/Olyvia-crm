-- Desfazer a conversão de uma lead em cliente.
--
-- Hoje não existe. Verificado ao vivo: num cliente que veio de uma lead o botão
-- "Reverter para Lead" nem aparece, e quem converteu por engano não tem forma
-- nenhuma, dentro da aplicação, de voltar atrás. O botão que existe está virado
-- para o módulo de Contactos, que já não existe, e promete repor uma lead que
-- nunca repõe.
--
-- ── Porque é seguro apagar a linha de cliente ─────────────────────────────
-- Medido no remoto: orçamentos e propostas ligam-se SÓ à entidade; dos 244
-- contratos, 234 têm entidade e apenas 1 depende só do cliente; dos 1002
-- negócios, 995 têm entidade e nenhum depende só do cliente; e dos 491 acessos
-- ao portal, todos têm entidade e só 14 referem cliente.
--
-- Ou seja: tudo está preso à PESSOA, não ao papel. Tirar o papel de cliente não
-- deixa nada órfão -- os documentos continuam onde estavam. É por isso que esta
-- reversão não precisa de guardas contra contratos ou acessos ao portal: não há
-- nada a proteger deles.
--
-- ── O estado anterior da lead ────────────────────────────────────────────
-- A conversão escreve `status = 'converted'` por cima do que lá estava e não
-- guarda o anterior. Das 69 leads convertidas, só 14 têm esse estado
-- recuperável na auditoria -- nas outras 55 está perdido.
--
-- Passa a ser guardado, e por GATILHO e não dentro da conversão: há mais do que
-- um caminho que converte (o botão, e o contrato assinado), e um gatilho apanha
-- todos sem ter de mexer em nenhum. Nas conversões antigas, que não o têm, a
-- lead volta a 'negotiation' -- de onde vieram 7 das 14 conhecidas -- e o ecrã
-- diz que o estado anterior não ficou registado, em vez de fingir que sabe.
--
-- ── A ordem não é escolha ────────────────────────────────────────────────
-- A lead tem chave estrangeira para o cliente e BLOQUEIA o apagar. Por isso:
-- limpar primeiro a marca na lead, só depois apagar o cliente. Ao contrário,
-- rebenta.

-- ============================================================
-- 1. Onde fica o estado anterior
-- ============================================================

ALTER TABLE "public"."anew_leads"
  ADD COLUMN IF NOT EXISTS "status_before_conversion" "text";

COMMENT ON COLUMN "public"."anew_leads"."status_before_conversion" IS
  'Estado da lead imediatamente antes de ser convertida em cliente, para a reversão poder repô-lo. Preenchido pelo gatilho trg_anew_leads_guardar_estado_antes_de_converter. NULL nas conversões anteriores a 2026-09-03, em que o estado anterior não foi guardado por ninguém.';

CREATE OR REPLACE FUNCTION "public"."fn_guardar_estado_antes_de_converter"()
RETURNS "trigger"
LANGUAGE "plpgsql"
AS $$
BEGIN
  -- O gatilho só dispara na transição PARA converted (ver o WHEN abaixo), por
  -- isso OLD.status é sempre o estado real de antes.
  NEW.status_before_conversion := OLD.status;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "trg_anew_leads_guardar_estado_antes_de_converter" ON "public"."anew_leads";

CREATE TRIGGER "trg_anew_leads_guardar_estado_antes_de_converter"
  BEFORE UPDATE ON "public"."anew_leads"
  FOR EACH ROW
  WHEN (NEW."status" = 'converted' AND OLD."status" IS DISTINCT FROM 'converted')
  EXECUTE FUNCTION "public"."fn_guardar_estado_antes_de_converter"();

-- ============================================================
-- 2. A reversão
-- ============================================================

CREATE OR REPLACE FUNCTION "public"."rpc_revert_client_to_lead"("p_client_id" "uuid")
RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_actor   uuid;
  v_client  public.anew_clients;
  v_lead    public.anew_leads;
  v_estado  text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Autenticacao necessaria' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_client FROM public.anew_clients WHERE id = p_client_id FOR UPDATE;
  IF v_client.id IS NULL THEN
    RAISE EXCEPTION 'Cliente nao encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- SECURITY: nunca confiar no id enviado pelo cliente para decidir o ambito.
  -- Reconfere-se sobre a organizacao gravada no proprio registo, com o mesmo
  -- criterio das outras operacoes deste modulo.
  IF NOT (
    public.is_system_admin(auth.uid())
    OR v_client.organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid()))
  ) THEN
    RAISE EXCEPTION 'Cliente fora do ambito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador nao encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- A lead de origem. Sem ela nao ha nada a repor: este cliente nao veio de
  -- lead nenhuma (foi criado a mao, por contrato, ou veio da migracao).
  SELECT * INTO v_lead
  FROM public.anew_leads
  WHERE converted_to_client_id = p_client_id
    AND deleted_at IS NULL
  ORDER BY converted_at DESC NULLS LAST
  LIMIT 1;

  IF v_lead.id IS NULL THEN
    RAISE EXCEPTION 'Este cliente nao veio de nenhuma lead, por isso nao ha conversao para desfazer'
      USING ERRCODE = 'no_data_found';
  END IF;

  v_estado := COALESCE(NULLIF(v_lead.status_before_conversion, ''), 'negotiation');

  -- 1. A lead primeiro: enquanto apontar ao cliente, a base recusa apaga-lo.
  UPDATE public.anew_leads
  SET status                   = v_estado,
      converted_to_client_id   = NULL,
      converted_at             = NULL,
      converted_by             = NULL,
      status_before_conversion = NULL
  WHERE id = v_lead.id;

  -- 2. A entidade deixa de ter papel de cliente, e volta a ter o de lead.
  DELETE FROM public.anew_entity_roles
  WHERE organization_id = v_client.organization_id
    AND entity_id = v_client.entity_id
    AND role = 'client';

  UPDATE public.anew_entity_roles
  SET status = 'active', deleted_at = NULL, deleted_by = NULL
  WHERE organization_id = v_client.organization_id
    AND entity_id = v_client.entity_id
    AND role = 'lead';

  -- 3. So agora se apaga o cliente. Nada fica orfao: contratos, propostas,
  --    orcamentos, negocios e acessos ao portal estao presos a entidade.
  DELETE FROM public.anew_clients WHERE id = p_client_id;

  RETURN jsonb_build_object(
    'lead_id', v_lead.id,
    'entity_id', v_client.entity_id,
    'status', v_estado,
    'estado_anterior_conhecido', v_lead.status_before_conversion IS NOT NULL
  );
END;
$$;

GRANT EXECUTE ON FUNCTION "public"."rpc_revert_client_to_lead"("uuid") TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."rpc_revert_client_to_lead"("uuid") TO "service_role";

COMMENT ON FUNCTION "public"."rpc_revert_client_to_lead"("uuid") IS
  'Desfaz a conversão de uma lead em cliente: repõe a lead no estado que tinha (ou em negociação, quando esse estado não ficou registado), tira o papel de cliente à entidade e apaga a linha de cliente. Nada fica órfão — documentos e acessos estão presos à entidade, não ao papel.';
