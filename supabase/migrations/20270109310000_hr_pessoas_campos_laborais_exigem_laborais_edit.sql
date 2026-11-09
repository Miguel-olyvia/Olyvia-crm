-- ==============================================================================
-- Ronda 2 de permissões (05/11/2026), RH ponto 4: o inverso dos Laborais.
--
-- 20270108420000 deixou quem só tem hr.pessoas.laborais.edit gravar os campos do
-- separador Laborais (e só esses). Faltava o inverso: hr.pessoas.edit sem
-- hr.pessoas.laborais.edit continuava a gravar os campos laborais pela API.
--
-- Agora, no acesso direto com sessão (current_user = authenticated):
--   - mudar um campo do separador Laborais exige hr.pessoas.laborais.edit;
--   - mudar qualquer outro campo continua a exigir hr.pessoas.edit.
-- Campos do separador (os mesmos de 20270108420000): email_trabalho,
-- telefone_trabalho, numero_interno, cargo, data_admissao, data_antiguidade,
-- data_saida, reporta_a_pessoa_id. Colunas de sistema (updated_at, updated_by)
-- e a gerada nome_completo não contam. Compara-se o valor (IS DISTINCT FROM):
-- reenviar o mesmo valor não é mudar.
-- RPCs SECURITY DEFINER (mudar cargo, admissão…) e a service_role não passam aqui.
--
-- Ninguém perde acesso: antes de apertar, todos os papéis com hr.pessoas.edit
-- recebem hr.pessoas.laborais.edit (hoje System Admin, Super Admin e
-- Teste RH - Gestão já a têm; o INSERT é idempotente para o caso de outro papel
-- a ter ganho entretanto). neg_papeis_permissoes não tem permissões hr.*.
-- Sem tabelas nem colunas novas.
-- ==============================================================================

DO $pre$
DECLARE
  v_md5 text;
BEGIN
  SELECT md5(pg_get_functiondef('public.hr_pessoas_laborais_so_campos()'::regprocedure)) INTO v_md5;
  IF v_md5 IS DISTINCT FROM '3fd4c004d19e453478c3096edccc1ef3' THEN
    RAISE EXCEPTION 'pre-condicao: hr_pessoas_laborais_so_campos() mudou no vivo (md5 %), reler antes de aplicar', v_md5;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_pessoas_laborais_so_campos'
                   AND tgrelid = 'public.pessoas'::regclass) THEN
    RAISE EXCEPTION 'pre-condicao: trg_pessoas_laborais_so_campos nao existe em pessoas';
  END IF;
END
$pre$;

-- 1. Quem tem hr.pessoas.edit passa a ter também hr.pessoas.laborais.edit.
INSERT INTO public.anew_role_permissions (role_id, permission_code)
SELECT DISTINCT rp.role_id, 'hr.pessoas.laborais.edit'
  FROM public.anew_role_permissions rp
 WHERE rp.permission_code = 'hr.pessoas.edit'
   AND NOT EXISTS (SELECT 1 FROM public.anew_role_permissions x
                    WHERE x.role_id = rp.role_id
                      AND x.permission_code = 'hr.pessoas.laborais.edit');

-- 2. O gatilho passa a separar os dois grupos de campos.
CREATE OR REPLACE FUNCTION public.hr_pessoas_laborais_so_campos()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  -- Campos do separador Laborais.
  v_laborais text[] := ARRAY[
    'email_trabalho', 'telefone_trabalho', 'numero_interno', 'cargo',
    'data_admissao', 'data_antiguidade', 'data_saida', 'reporta_a_pessoa_id'
  ];
  -- Colunas de sistema. nome_completo é coluna gerada (primeiro_nome/apelido,
  -- que continuam comparados): num BEFORE vem por calcular.
  v_sistema text[] := ARRAY['updated_at', 'updated_by', 'nome_completo'];
  v_novo  jsonb;
  v_velho jsonb;
BEGIN
  IF current_user <> 'authenticated' THEN
    RETURN NEW;
  END IF;

  v_novo  := to_jsonb(NEW) - v_sistema;
  v_velho := to_jsonb(OLD) - v_sistema;

  -- Campos fora do separador: hr.pessoas.edit.
  IF (v_novo - v_laborais) IS DISTINCT FROM (v_velho - v_laborais)
     AND NOT public.has_anew_permission_in_org(auth.uid(), 'hr.pessoas.edit', OLD.organization_id) THEN
    RAISE EXCEPTION
      'pessoas_laborais_so_campos: com hr.pessoas.laborais.edit (sem hr.pessoas.edit) so se mudam os campos do separador Laborais.'
      USING ERRCODE = '42501';
  END IF;

  -- Campos do separador: hr.pessoas.laborais.edit.
  IF (NEW.email_trabalho, NEW.telefone_trabalho, NEW.numero_interno, NEW.cargo,
      NEW.data_admissao, NEW.data_antiguidade, NEW.data_saida, NEW.reporta_a_pessoa_id)
     IS DISTINCT FROM
     (OLD.email_trabalho, OLD.telefone_trabalho, OLD.numero_interno, OLD.cargo,
      OLD.data_admissao, OLD.data_antiguidade, OLD.data_saida, OLD.reporta_a_pessoa_id)
     AND NOT public.has_anew_permission_in_org(auth.uid(), 'hr.pessoas.laborais.edit', OLD.organization_id) THEN
    RAISE EXCEPTION
      'pessoas_laborais_exige_laborais_edit: mudar os campos do separador Laborais exige hr.pessoas.laborais.edit.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;
