-- ============================================================
-- 20270112730000 — rpc_hr_documento_ver_conteudo: documento com retribuição exige hr.pessoas.retribuicao.view
-- ============================================================
-- O que faz: o conteúdo de um documento emitido de um modelo com variáveis {{retribuicao_*}} tem os valores da
--   retribuição da pessoa (o corpo é gravado já substituído). Emiti-lo exige hr.pessoas.retribuicao.view, mas lê-lo só
--   exigia hr.pessoas.documentos.conteudo.view — quem tinha esta e não a de retribuição via o salário no documento.
--   Passa a exigir também hr.pessoas.retribuicao.view na organização do documento (has_anew_permission_in_org, o mesmo
--   helper e âmbito que a função já usa), salvo para a própria pessoa do documento
--   (pessoa_id = hr_pessoa_do_utilizador(auth.uid(), organização), a mesma regra do ramo view.own).
--
-- Como se sabe que o documento tem retribuição: pessoas_documentos não tem marca própria (e não se criam colunas);
--   lê-se o modelo de origem (modelo_id) com a MESMA expressão de rpc_hr_documento_emitir depois de 20270112720000:
--   corpo_html ~* '\{\{\s*retribuicao_'. O modelo lê-se mesmo apagado. Sem modelo (modelo_id NULL) = sem retribuição.
--   Limitação conhecida: se o modelo for editado DEPOIS da emissão para tirar a variável, os documentos antigos deixam de
--   ser reconhecidos (em 10/11/2026 nenhum documento tem o modelo alterado depois da emissão).
--
-- A recusa usa ERRCODE insufficient_privilege (42501), que o cliente (isPermissionError em src/lib/hr/hrDb.ts) trata
--   como falta de permissão; vem ANTES de hr_registar_acesso_sensivel, como a recusa que já existia (uma recusa não fica
--   registada como «revelar»). Nada mais muda: mesma assinatura, SECURITY DEFINER/search_path, mesmas mensagens;
--   CREATE OR REPLACE mantém os GRANTs (authenticated, service_role).
--
-- ATENÇÃO (fora desta migração): a edge function hr-documento-ficheiro-url diz aplicar «a mesma regra» para o ficheiro
--   anexado (PDF assinado) e não tem esta verificação — tem de a ganhar para não ficar uma porta lateral.
--
-- Parte do pg_get_functiondef vivo de 10/11/2026 (ramo uetjghdkwbywbftedtth), md5 9123cde7a2d60e5cbc7a9d0a37359e68.
-- Reversão: recriar a função sem o bloco 20270112730000 e sem v_tem_retribuicao.
-- ============================================================
SET lock_timeout = '5s';

DO $guarda$
BEGIN
  IF md5(pg_get_functiondef('public.rpc_hr_documento_ver_conteudo(uuid)'::regprocedure)) <> '9123cde7a2d60e5cbc7a9d0a37359e68' THEN
    RAISE EXCEPTION 'Guarda: rpc_hr_documento_ver_conteudo mudou desde 10/11/2026 (md5). Rever esta migration contra a função viva.';
  END IF;
END $guarda$;

CREATE OR REPLACE FUNCTION public.rpc_hr_documento_ver_conteudo(p_documento_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_auth      uuid := auth.uid();
  v_doc       public.pessoas_documentos%ROWTYPE;
  v_e_proprio boolean := false;
  v_tem_retribuicao boolean := false;
BEGIN
  IF v_auth IS NULL THEN
    RAISE EXCEPTION 'rpc_hr_documento_ver_conteudo exige um utilizador autenticado.';
  END IF;

  SELECT * INTO v_doc
    FROM public.pessoas_documentos
   WHERE id = p_documento_id AND deleted_at IS NULL;

  IF v_doc.id IS NULL THEN
    RAISE EXCEPTION 'Documento % nao encontrado ou apagado.', p_documento_id;
  END IF;

  IF public.has_anew_permission_in_org(v_auth, 'hr.pessoas.documentos.conteudo.view', v_doc.organization_id) THEN
    NULL;
  ELSIF public.has_anew_permission_in_org(v_auth, 'hr.pessoas.documentos.view.own', v_doc.organization_id)
    AND v_doc.pessoa_id = public.hr_pessoa_do_utilizador(v_auth, v_doc.organization_id) THEN
    v_e_proprio := true;
  ELSE
    RAISE EXCEPTION 'Sem permissao para ver o conteudo deste documento.';
  END IF;

  -- 20270112730000: documento emitido de um modelo com {{retribuicao_*}} (mesma
  -- deteccao de rpc_hr_documento_emitir e do substituidor: espacos e qualquer
  -- grafia) tem os valores da retribuicao no corpo. Ver o conteudo exige entao
  -- tambem hr.pessoas.retribuicao.view na organizacao do documento -- a mesma
  -- exigencia de quem o emitiu. Excepcao: a propria pessoa do documento.
  -- O modelo le-se mesmo apagado (o documento continua a ter os valores).
  SELECT m.corpo_html ~* '\{\{\s*retribuicao_'
    INTO v_tem_retribuicao
    FROM public.pessoas_documentos_modelos m
   WHERE m.id = v_doc.modelo_id;

  IF coalesce(v_tem_retribuicao, false)
     AND v_doc.pessoa_id IS DISTINCT FROM public.hr_pessoa_do_utilizador(v_auth, v_doc.organization_id)
     AND NOT public.has_anew_permission_in_org(v_auth, 'hr.pessoas.retribuicao.view', v_doc.organization_id) THEN
    RAISE EXCEPTION 'Sem permissao para ver o conteudo deste documento: tem dados de retribuicao (exige hr.pessoas.retribuicao.view nesta organizacao).'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  PERFORM public.hr_registar_acesso_sensivel(v_doc.pessoa_id, v_doc.organization_id, 'documento', 'revelar');

  RETURN v_doc.corpo_html;
END;
$function$;

DO $verificar$
BEGIN
  IF strpos(pg_get_functiondef('public.rpc_hr_documento_ver_conteudo(uuid)'::regprocedure), 'hr.pessoas.retribuicao.view') = 0 THEN
    RAISE EXCEPTION 'Verificação: rpc_hr_documento_ver_conteudo não ficou a exigir hr.pessoas.retribuicao.view.';
  END IF;
END $verificar$;
