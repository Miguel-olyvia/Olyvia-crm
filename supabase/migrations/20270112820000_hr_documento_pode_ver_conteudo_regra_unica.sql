-- ============================================================
-- 20270112820000 — fn_hr_documento_pode_ver_conteudo: uma só regra para ver o conteúdo de um documento de RH
-- ============================================================
-- Porquê: 20270112730000 passou a exigir hr.pessoas.retribuicao.view para ver o conteúdo (corpo_html) de um documento
--   emitido de um modelo com {{retribuicao_*}}, mas a edge function hr-documento-ficheiro-url (PDF anexado ao mesmo
--   documento) repetia a regra antiga em TypeScript e não ganhou essa verificação — porta lateral: quem tinha
--   hr.pessoas.documentos.conteudo.view sem retribuição abria o PDF assinado com o salário.
--
-- O que faz: a regra sai de rpc_hr_documento_ver_conteudo para uma função própria, que passa a ser a ÚNICA fonte:
--   fn_hr_documento_pode_ver_conteudo(p_documento_id, p_auth_uid) devolve a decisão em texto:
--     'permitido'      — pode ver;
--     'nao_encontrado' — documento inexistente ou apagado;
--     'sem_permissao'  — nem hr.pessoas.documentos.conteudo.view na organização, nem view.own + ser a própria pessoa;
--     'retribuicao'    — passou o anterior, mas o documento tem retribuição e falta hr.pessoas.retribuicao.view
--                        (a própria pessoa do documento está isenta).
--   É exatamente a lógica viva de rpc_hr_documento_ver_conteudo (pg_get_functiondef de 10/11/2026, md5
--   afbd9b0ae35dfea1ac2eb9d99a276420), só que com o utilizador recebido por parâmetro em vez de auth.uid(): a edge
--   fala com a base por service_role, onde auth.uid() é NULL.
--   - rpc_hr_documento_ver_conteudo passa a chamá-la e a traduzir a decisão nas MESMAS exceções de antes (mensagens e
--     ERRCODE iguais: a recusa por retribuição continua 42501; as outras continuam P0001). A auditoria continua no mesmo
--     sítio (só depois de permitido). Assinatura, SECURITY DEFINER, search_path e GRANTs mantêm-se (CREATE OR REPLACE).
--   - A edge hr-documento-ficheiro-url passa a chamá-la (rpc) em vez de repetir as verificações.
--
-- Segurança da função nova: recebe o utilizador por parâmetro, por isso NÃO pode ser chamada por authenticated/anon
--   (deixaria sondar permissões de terceiros) — EXECUTE só para service_role (a edge) e o dono (postgres, que é quem
--   corre rpc_hr_documento_ver_conteudo, SECURITY DEFINER). Supabase dá EXECUTE por omissão a anon/authenticated em
--   funções novas de public: revoga-se explicitamente. SECURITY INVOKER chega (service_role e postgres leem as tabelas)
--   e é STABLE (só lê). p_auth_uid NULL = 'sem_permissao' (nunca permitido sem utilizador).
--
-- Storage (verificado em 10/11/2026, nada a mudar): hr-documentos é privado e storage.objects tem RESTRICTIVE
--   hr_documentos_block_select/insert/update/delete para authenticated (bucket_id <> 'hr-documentos'); anon não tem
--   nenhuma policy permissiva; não há policies permissivas de SELECT sem filtro de bucket. Ler o PDF só é possível com
--   URL assinado emitido pela edge. pessoas_documentos.corpo_html não tem GRANT de coluna para authenticated.
--
-- Ordem de deploy: esta migração ANTES da edge (a edge nova chama a função; sem ela devolve 500 — falha fechada).
-- Reversão: DROP FUNCTION public.fn_hr_documento_pode_ver_conteudo(uuid, uuid) depois de repor
--   rpc_hr_documento_ver_conteudo com o corpo de 20270112730000 (e a edge anterior).
-- ============================================================
SET lock_timeout = '5s';

DO $guarda$
BEGIN
  IF md5(pg_get_functiondef('public.rpc_hr_documento_ver_conteudo(uuid)'::regprocedure)) <> 'afbd9b0ae35dfea1ac2eb9d99a276420' THEN
    RAISE EXCEPTION 'Guarda: rpc_hr_documento_ver_conteudo mudou desde 10/11/2026 (md5). Rever esta migration contra a função viva.';
  END IF;
  IF to_regprocedure('public.fn_hr_documento_pode_ver_conteudo(uuid, uuid)') IS NOT NULL THEN
    RAISE EXCEPTION 'Guarda: fn_hr_documento_pode_ver_conteudo(uuid, uuid) já existe. Rever esta migration.';
  END IF;
END $guarda$;

CREATE FUNCTION public.fn_hr_documento_pode_ver_conteudo(p_documento_id uuid, p_auth_uid uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_doc             public.pessoas_documentos%ROWTYPE;
  v_tem_retribuicao boolean := false;
BEGIN
  IF p_auth_uid IS NULL THEN
    RETURN 'sem_permissao';
  END IF;

  SELECT * INTO v_doc
    FROM public.pessoas_documentos
   WHERE id = p_documento_id AND deleted_at IS NULL;

  IF v_doc.id IS NULL THEN
    RETURN 'nao_encontrado';
  END IF;

  -- Regra base (20261123030000): conteudo.view NAQUELA organizacao, OU view.own
  -- + ser a propria pessoa (resolvida por hr_pessoa_do_utilizador).
  IF NOT (
       public.has_anew_permission_in_org(p_auth_uid, 'hr.pessoas.documentos.conteudo.view', v_doc.organization_id)
    OR (public.has_anew_permission_in_org(p_auth_uid, 'hr.pessoas.documentos.view.own', v_doc.organization_id)
        AND v_doc.pessoa_id = public.hr_pessoa_do_utilizador(p_auth_uid, v_doc.organization_id))
  ) THEN
    RETURN 'sem_permissao';
  END IF;

  -- 20270112730000: documento emitido de um modelo com {{retribuicao_*}} (mesma
  -- deteccao de rpc_hr_documento_emitir: espacos e qualquer grafia) tem os
  -- valores da retribuicao. Exige tambem hr.pessoas.retribuicao.view na
  -- organizacao do documento, salvo a propria pessoa. Modelo le-se mesmo apagado.
  SELECT m.corpo_html ~* '\{\{\s*retribuicao_'
    INTO v_tem_retribuicao
    FROM public.pessoas_documentos_modelos m
   WHERE m.id = v_doc.modelo_id;

  IF coalesce(v_tem_retribuicao, false)
     AND v_doc.pessoa_id IS DISTINCT FROM public.hr_pessoa_do_utilizador(p_auth_uid, v_doc.organization_id)
     AND NOT public.has_anew_permission_in_org(p_auth_uid, 'hr.pessoas.retribuicao.view', v_doc.organization_id) THEN
    RETURN 'retribuicao';
  END IF;

  RETURN 'permitido';
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_hr_documento_pode_ver_conteudo(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_hr_documento_pode_ver_conteudo(uuid, uuid) TO service_role;

COMMENT ON FUNCTION public.fn_hr_documento_pode_ver_conteudo(uuid, uuid) IS
  'Regra unica para ver o conteudo de um documento de RH (corpo_html e ficheiro anexado): permitido | nao_encontrado | sem_permissao | retribuicao. Usada por rpc_hr_documento_ver_conteudo e pela edge hr-documento-ficheiro-url. So service_role/postgres.';

CREATE OR REPLACE FUNCTION public.rpc_hr_documento_ver_conteudo(p_documento_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_auth    uuid := auth.uid();
  v_doc     public.pessoas_documentos%ROWTYPE;
  v_decisao text;
BEGIN
  IF v_auth IS NULL THEN
    RAISE EXCEPTION 'rpc_hr_documento_ver_conteudo exige um utilizador autenticado.';
  END IF;

  -- 20270112820000: a regra vive em fn_hr_documento_pode_ver_conteudo (a mesma
  -- que a edge hr-documento-ficheiro-url usa para o ficheiro anexado). Aqui so
  -- se traduz a decisao nas excecoes de sempre.
  v_decisao := public.fn_hr_documento_pode_ver_conteudo(p_documento_id, v_auth);

  IF v_decisao = 'nao_encontrado' THEN
    RAISE EXCEPTION 'Documento % nao encontrado ou apagado.', p_documento_id;
  ELSIF v_decisao = 'sem_permissao' THEN
    RAISE EXCEPTION 'Sem permissao para ver o conteudo deste documento.';
  ELSIF v_decisao = 'retribuicao' THEN
    RAISE EXCEPTION 'Sem permissao para ver o conteudo deste documento: tem dados de retribuicao (exige hr.pessoas.retribuicao.view nesta organizacao).'
      USING ERRCODE = 'insufficient_privilege';
  ELSIF v_decisao IS DISTINCT FROM 'permitido' THEN
    RAISE EXCEPTION 'rpc_hr_documento_ver_conteudo: decisao inesperada (%).', v_decisao;
  END IF;

  SELECT * INTO v_doc
    FROM public.pessoas_documentos
   WHERE id = p_documento_id AND deleted_at IS NULL;

  IF v_doc.id IS NULL THEN
    RAISE EXCEPTION 'Documento % nao encontrado ou apagado.', p_documento_id;
  END IF;

  PERFORM public.hr_registar_acesso_sensivel(v_doc.pessoa_id, v_doc.organization_id, 'documento', 'revelar');

  RETURN v_doc.corpo_html;
END;
$function$;

DO $verificar$
DECLARE
  v_acl text;
BEGIN
  IF strpos(pg_get_functiondef('public.rpc_hr_documento_ver_conteudo(uuid)'::regprocedure), 'fn_hr_documento_pode_ver_conteudo') = 0 THEN
    RAISE EXCEPTION 'Verificação: rpc_hr_documento_ver_conteudo não ficou a delegar em fn_hr_documento_pode_ver_conteudo.';
  END IF;
  IF strpos(pg_get_functiondef('public.fn_hr_documento_pode_ver_conteudo(uuid, uuid)'::regprocedure), 'hr.pessoas.retribuicao.view') = 0 THEN
    RAISE EXCEPTION 'Verificação: fn_hr_documento_pode_ver_conteudo não exige hr.pessoas.retribuicao.view.';
  END IF;
  IF has_function_privilege('authenticated', 'public.fn_hr_documento_pode_ver_conteudo(uuid, uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.fn_hr_documento_pode_ver_conteudo(uuid, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Verificação: fn_hr_documento_pode_ver_conteudo não pode ser executável por anon/authenticated.';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.fn_hr_documento_pode_ver_conteudo(uuid, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Verificação: service_role tem de poder executar fn_hr_documento_pode_ver_conteudo.';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.rpc_hr_documento_ver_conteudo(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Verificação: rpc_hr_documento_ver_conteudo perdeu o EXECUTE para authenticated.';
  END IF;
END $verificar$;
