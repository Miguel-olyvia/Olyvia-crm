-- ============================================================
-- Dar acesso ao portal deixa de criar uma segunda ficha de pessoa
-- ============================================================
--
-- Sintoma: ao dar acesso ao portal a um cliente que já tem ficha
-- (anew_entities), nascia uma SEGUNDA ficha para a mesma pessoa — e pior
-- do que a original: o nome inteiro em first_name e last_name a NULL.
-- Medido no remoto: 644 nomes com mais de uma ficha, 1624 linhas onde
-- deviam estar 644.
--
-- Causa: create-client-portal-access cria a conta com
-- auth.admin.createUser({ user_metadata: { full_name } }) sem
-- admin_created. O trigger on_auth_user_created -> handle_new_user()
-- corre, cria o anew_users, vê entity_id NULL (conta acabada de nascer)
-- e cria anew_entities + anew_entity_emails de raiz.
--
-- Porque NÃO se resolve com admin_created='true': a Edge Function
-- ESPERA que o trigger crie a linha em anew_users (loop de ~5 tentativas)
-- e, se ela não aparecer, apaga a conta de autenticação e devolve
-- "Falha ao registar o utilizador no sistema". O trigger TEM de
-- continuar a criar o anew_users; o que deixa de fazer é criar a ficha.
--
-- Correcção: a Edge Function passa agora também entity_id no
-- user_metadata (sabe qual é a ficha certa antes de criar a conta — é a
-- mesma que escreve em client_portal_users.entity_id). Quando esse campo
-- vem preenchido e a ficha existe, o trigger LIGA anew_users.entity_id a
-- ela em vez de criar uma nova. Sem esse campo o comportamento é
-- exactamente o de hoje, por isso o auto-registo normal continua a criar
-- a sua própria ficha.
--
-- NOTA (herdada de 20260909010000): o campo tem de vir de
-- raw_user_meta_data, NUNCA de raw_app_meta_data — o GoTrue grava o
-- app_metadata num UPDATE ~20ms depois do INSERT, por isso um trigger
-- AFTER INSERT nunca o vê. O raw_user_meta_data é visível (é de lá que
-- sai o full_name que este trigger já lê).
--
-- Não mexe em dados existentes: as fichas duplicadas que já lá estão
-- ficam como estão, para decisão separada.
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_anew_user_id uuid;
  v_entity_id uuid;
  v_full_name text;
  v_meta_entity_id uuid;
BEGIN
  IF NEW.raw_user_meta_data ->> 'admin_created' = 'true' THEN
    RETURN NEW;
  END IF;

  v_full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', 'New User');

  -- Ficha indicada por quem criou a conta (portal de clientes).
  -- Texto inválido não pode rebentar o registo: cai para NULL e o
  -- comportamento antigo (criar ficha) toma conta.
  BEGIN
    v_meta_entity_id := NULLIF(NEW.raw_user_meta_data->>'entity_id', '')::uuid;
  EXCEPTION WHEN others THEN
    v_meta_entity_id := NULL;
  END;

  IF v_meta_entity_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.anew_entities WHERE id = v_meta_entity_id) THEN
    v_meta_entity_id := NULL;
  END IF;

  INSERT INTO public.anew_users (auth_user_id, name, email, status, registration_origin)
  VALUES (NEW.id, v_full_name, COALESCE(NEW.email, ''), 'active', 'self_registration')
  ON CONFLICT (auth_user_id) DO NOTHING;

  SELECT id INTO v_anew_user_id FROM public.anew_users WHERE auth_user_id = NEW.id;

  IF v_anew_user_id IS NOT NULL THEN
    SELECT entity_id INTO v_entity_id FROM public.anew_users WHERE id = v_anew_user_id;

    IF v_entity_id IS NULL THEN
      IF v_meta_entity_id IS NOT NULL THEN
        -- A pessoa já tem ficha: ligar, não duplicar. O email dela já está
        -- em anew_entity_emails (é de lá que a Edge Function tirou o
        -- endereço da conta), por isso não há nada a inserir.
        UPDATE public.anew_users SET entity_id = v_meta_entity_id WHERE id = v_anew_user_id;
      ELSE
        INSERT INTO public.anew_entities (type, display_name, first_name, status, created_by)
        VALUES ('person', v_full_name, v_full_name, 'active', v_anew_user_id)
        RETURNING id INTO v_entity_id;

        INSERT INTO public.anew_entity_emails (entity_id, email, email_type, is_primary, is_verified)
        VALUES (v_entity_id, COALESCE(NEW.email, ''), 'personal', true, true);

        UPDATE public.anew_users SET entity_id = v_entity_id WHERE id = v_anew_user_id;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.handle_new_user() IS
  'Cria o perfil anew_users de cada conta nova. Sai à entrada para contas criadas pelo admin (user_metadata.admin_created). Desde 20261117010000: quando user_metadata.entity_id aponta para uma ficha existente (acesso ao portal de clientes), liga anew_users.entity_id a essa ficha em vez de criar uma segunda; sem esse campo, o auto-registo continua a criar a sua própria ficha e o email associado.';
