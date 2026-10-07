-- ==============================================================================
-- Anexos pelo RH (2/3): as cinco RPCs so service_role que a Edge Function
-- hr-anexo-rh chama, e as duas funcoes internas de permissao.
--
-- POR APLICAR.
--
-- PRECISA DE CODIGO NOVO. Sem a Edge Function hr-anexo-rh (accoes url, confirmar e
-- remover) e o ecra novo, ninguem chama estas funcoes: EXECUTE e so de
-- service_role. Publicar na ordem: db push (250000, 260000, 270000), deploy de
-- hr-anexo-rh, ecra; a Edge e o cliente entram no mesmo commit. Depende de
-- 20261210250000 (colunas origem, carregado_por e apagado_por).
--
--
-- -- O MODELO -------------------------------------------------------------------
--
-- O RH carrega o ficheiro por URL assinado emitido pela Edge (service_role), como
-- o convite. A Edge NAO decide permissoes: passa o auth uid (p_auth_uid) as RPCs, que
-- leem a pessoa ou o anexo pela chave primaria, tiram a ORGANIZACAO DA LINHA e
-- verificam a permissao do TIPO nessa organizacao. Nenhum organization_id entra
-- por parametro.
--
-- Estados de um anexo do RH: pendente (quarentena, origem rh, sem convite), depois
-- PROMOVIDO directamente (sem passar por ligado: nao ha submissao a esperar) e
-- depois apagado (motivo rh quando o RH remove; substituido quando substitui;
-- upload_abandonado, formato_invalido ou demasiado_grande quando a Edge desfaz).
--
-- Caminhos: quarentena admissao/rh/<anexo_id>.<ext>; final
-- <organization_id>/<pessoa_id>/admissao/<anexo_id>.<ext> (IGUAL ao do convite, com a
-- extensao do tipo REAL). Reutilizar o caminho do convite e o que faz a limpeza
-- existente (hr_convite_anexos_limpar) apanhar os orfaos do RH sem mudar uma linha.
--
-- Permissoes de ESCRITA por tipo (na organizacao da pessoa): cartao de cidadao
-- hr.pessoas.identificacao.edit; comprovativo de IBAN hr.pessoas.bancarios.edit;
-- fotografia hr.pessoas.pessoais.edit. Alem disso exige hr.pessoas.view: sem ela a
-- resposta e pessoa_nao_encontrada (nao revela fichas de outra organizacao).
-- SUBSTITUIR e REMOVER exigem TAMBEM a permissao de LEITURA do tipo (a com que
-- hr-anexo-url abre o ficheiro): cartao de cidadao hr.pessoas.identificacao.reveal;
-- comprovativo de IBAN hr.pessoas.bancarios.edit (a mesma da escrita); fotografia
-- hr.pessoas.view. Quem so tem a de escrita anexa, mas nao substitui nem remove um
-- ficheiro que nao pode abrir; o codigo de recusa e o mesmo, sem_permissao.
--
-- Limites (os do convite, mais um tecto novo): 4 activos por pessoa; 2, 1 e 1 por
-- tipo (cartao, comprovativo, fotografia); 10 MB (fotografia 5 MB); e 20 reservas do
-- RH por pessoa em 24 horas, apagadas incluidas (o tecto que impede encher o
-- Storage em ciclo). Activos de uma pessoa = promovidos + pendentes de origem rh com
-- menos de 2 horas (um pendente mais velho e um envio abandonado: a limpeza di-lo
-- apagado as 3 horas e, ate la, nao ocupa lugar; ao promover, o proprio pendente
-- conta sempre); os pendentes e ligados de um convite aberto NAO contam (tem o
-- orcamento proprio).
--
-- Auditoria: anexar, substituir e remover o cartao de cidadao ou o comprovativo de
-- IBAN regista 'alterar' com o utilizador REAL (p_auth_uid), na mesma transaccao.
-- Se a auditoria falhar, falha tudo: promover e remover nao tem a subtransaccao que
-- engole erros. A fotografia nunca se audita.
--
-- Remover ou substituir APAGA o ficheiro de vez (decisao D2): ficam a auditoria e
-- apagado_por e apagado_em. A base MARCA, a Edge apaga o objecto do Storage e a
-- limpeza repete o que ficar.
--
-- Erros: estas funcoes devolvem jsonb com a chave erro (nao fazem RAISE), como as do
-- convite. Codigos novos face ao convite: sem_sessao, pessoa_nao_encontrada,
-- sem_permissao, anexo_substituto_invalido e anexo_limite_pessoa. Nenhum SQLSTATE
-- novo; a guarda de service_role usa HR911, como o precedente.
--
--
-- -- A LER COM ATENCAO ANTES DO PUSH -------------------------------------------
--
-- a) O molde e rpc_hr_documento_anexar_ficheiro (20261130065000): service_role mais
--    p_auth_uid mais permissao dentro. A guarda de service_role repete-se no corpo
--    de cada RPC para um EXECUTE futuro a authenticated nao reabrir a impersonacao.
-- b) Bloqueio: reservar, promover e remover bloqueiam a pessoa (FOR NO KEY UPDATE:
--    FOR UPDATE travava tambem os INSERTs com chave estrangeira para a pessoa) antes
--    do anexo, na mesma ordem (pessoa, anexo, substituto) que o bloco D1-A de
--    20261210270000: reservas concorrentes da mesma pessoa serializam-se e nao
--    passam as duas pelos limites, e nao ha ciclos de bloqueio.
--    Apagar (remover e substituir) deixa nome_original = 'apagado' e hash_sha256 NULL:
--    ficam apagado_em, apagado_por e apagado_motivo, que e o que a auditoria precisa.
-- c) Mudelar: nada disto la chega enquanto estiver no branch RH; ao levar para
--    producao, dizer ao utilizador o que muda (o RH passa a poder alterar a
--    fotografia, o cartao de cidadao e o comprovativo).
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- Sem ficheiro de reversao nesta pasta, de proposito (uma reversao na pasta e
-- aplicada pelo db push). A mao: largar as sete funcoes desta migration.
--
-- Prerequisitos:
--   20261210250000  origem, carregado_por, apagado_por e os CHECKs do RH
--   20261210050000  pessoas_anexos, pessoas.fotografia_anexo_id e o trigger
--   20261130200000  hr_registar_acesso_sensivel com 5 argumentos
-- ==============================================================================

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
DECLARE
  v_n integer;
BEGIN
  SELECT count(*) INTO v_n
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'pessoas_anexos'
     AND column_name IN ('origem', 'carregado_por', 'apagado_por');
  IF v_n <> 3 THEN
    RAISE EXCEPTION 'pessoas_anexos nao tem origem, carregado_por e apagado_por. Aplicar 20261210250000 primeiro.';
  END IF;

  SELECT count(*) INTO v_n
    FROM pg_constraint
   WHERE conrelid = 'public.pessoas_anexos'::regclass
     AND conname IN ('pessoas_anexos_rh_sem_convite', 'pessoas_anexos_rh_tem_autor', 'pessoas_anexos_origem_valida');
  IF v_n <> 3 THEN
    RAISE EXCEPTION 'Faltam os CHECKs do RH de pessoas_anexos (20261210250000); encontrei % de 3.', v_n;
  END IF;

  IF to_regprocedure('public.hr_registar_acesso_sensivel(uuid, uuid, text, text, uuid)') IS NULL THEN
    RAISE EXCEPTION 'hr_registar_acesso_sensivel(uuid, uuid, text, text, uuid) nao existe. Aplicar 20261130200000 primeiro.';
  END IF;

  IF to_regprocedure('public.has_anew_permission_in_org(uuid, text, uuid)') IS NULL THEN
    RAISE EXCEPTION 'has_anew_permission_in_org(uuid, text, uuid) nao existe.';
  END IF;

  SELECT count(*) INTO v_n
    FROM public.anew_permissions
   WHERE code IN ('hr.pessoas.identificacao.edit', 'hr.pessoas.bancarios.edit', 'hr.pessoas.pessoais.edit', 'hr.pessoas.view',
                  'hr.pessoas.identificacao.reveal');
  IF v_n <> 5 THEN
    RAISE EXCEPTION 'O catalogo devia ter as 5 permissoes de que os anexos do RH dependem (view, identificacao.edit, identificacao.reveal, bancarios.edit, pessoais.edit); encontrei % (20261120020000).', v_n;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgrelid = 'public.pessoas'::regclass AND tgname = 'trg_pessoas_fotografia_valida' AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'O trigger trg_pessoas_fotografia_valida nao existe. Aplicar 20261210050000 primeiro.';
  END IF;
END;
$guardas$;

-- ==============================================================================
-- 0. Internas: a permissao de escrita de cada tipo e a autorizacao
--    Sem EXECUTE para ninguem; so as RPCs desta migration (SECURITY DEFINER, como
--    o dono) as chamam.
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.hr_anexo_rh_permissao_escrita(p_tipo text)
RETURNS text
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE p_tipo
    WHEN 'cartao_cidadao'    THEN 'hr.pessoas.identificacao.edit'
    WHEN 'comprovativo_iban' THEN 'hr.pessoas.bancarios.edit'
    WHEN 'fotografia'        THEN 'hr.pessoas.pessoais.edit'
  END;
$$;

REVOKE ALL ON FUNCTION public.hr_anexo_rh_permissao_escrita(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_anexo_rh_permissao_escrita(text) FROM anon;
REVOKE ALL ON FUNCTION public.hr_anexo_rh_permissao_escrita(text) FROM authenticated;
REVOKE ALL ON FUNCTION public.hr_anexo_rh_permissao_escrita(text) FROM service_role;

COMMENT ON FUNCTION public.hr_anexo_rh_permissao_escrita(text) IS
'INTERNA, sem EXECUTE para ninguem: a permissao de escrita de cada tipo de anexo do RH (cartao_cidadao hr.pessoas.identificacao.edit, comprovativo_iban hr.pessoas.bancarios.edit, fotografia hr.pessoas.pessoais.edit); NULL para um tipo desconhecido. Tem de ser igual a PERMISSAO_ESCRITA_POR_TIPO de src/lib/hr/anexosRh.ts (o teste de contrato confere). Desde 20261210260000.';

CREATE OR REPLACE FUNCTION public.hr_anexo_rh_autorizar(p_auth_uid uuid, p_org uuid, p_tipo text)
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_permissao text;
BEGIN
  -- Sem hr.pessoas.view na organizacao a resposta e a mesma de uma pessoa que nao
  -- existe: nao se revelam fichas de outra organizacao.
  IF p_auth_uid IS NULL OR p_org IS NULL
     OR NOT public.has_anew_permission_in_org(p_auth_uid, 'hr.pessoas.view', p_org) THEN
    RETURN 'pessoa_nao_encontrada';
  END IF;

  v_permissao := public.hr_anexo_rh_permissao_escrita(p_tipo);
  IF v_permissao IS NULL THEN
    RETURN 'anexo_tipo_invalido';
  END IF;

  IF NOT public.has_anew_permission_in_org(p_auth_uid, v_permissao, p_org) THEN
    RETURN 'sem_permissao';
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.hr_anexo_rh_autorizar(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_anexo_rh_autorizar(uuid, uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.hr_anexo_rh_autorizar(uuid, uuid, text) FROM authenticated;
REVOKE ALL ON FUNCTION public.hr_anexo_rh_autorizar(uuid, uuid, text) FROM service_role;

COMMENT ON FUNCTION public.hr_anexo_rh_autorizar(uuid, uuid, text) IS
'INTERNA, sem EXECUTE para ninguem: pode este utilizador anexar este tipo de ficheiro na ficha de uma pessoa desta organizacao? Devolve NULL se sim; pessoa_nao_encontrada se nao tem hr.pessoas.view na organizacao (igual a uma ficha inexistente); anexo_tipo_invalido para um tipo desconhecido; sem_permissao se falta a permissao de escrita do tipo. A organizacao e SEMPRE a da linha da pessoa ou do anexo, nunca um parametro do pedido. Desde 20261210260000.';

CREATE OR REPLACE FUNCTION public.hr_anexo_rh_permissao_leitura(p_tipo text)
RETURNS text
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE p_tipo
    WHEN 'cartao_cidadao'    THEN 'hr.pessoas.identificacao.reveal'
    WHEN 'comprovativo_iban' THEN 'hr.pessoas.bancarios.edit'
    WHEN 'fotografia'        THEN 'hr.pessoas.view'
  END;
$$;

REVOKE ALL ON FUNCTION public.hr_anexo_rh_permissao_leitura(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_anexo_rh_permissao_leitura(text) FROM anon;
REVOKE ALL ON FUNCTION public.hr_anexo_rh_permissao_leitura(text) FROM authenticated;
REVOKE ALL ON FUNCTION public.hr_anexo_rh_permissao_leitura(text) FROM service_role;

COMMENT ON FUNCTION public.hr_anexo_rh_permissao_leitura(text) IS
'INTERNA, sem EXECUTE para ninguem: a permissao de LEITURA de cada tipo de anexo, a mesma com que a Edge Function hr-anexo-url abre o ficheiro (cartao_cidadao hr.pessoas.identificacao.reveal, comprovativo_iban hr.pessoas.bancarios.edit, fotografia hr.pessoas.view); NULL para um tipo desconhecido. Substituir e remover exigem-na alem da de escrita: quem so escreve anexa mas nao substitui nem remove um ficheiro que nao pode abrir. Tem de ser igual a PERMISSAO_POR_TIPO de supabase/functions/hr-anexo-url/regras.ts (o teste de contrato confere). Desde 20261210260000.';

CREATE OR REPLACE FUNCTION public.hr_anexo_rh_autorizar_leitura(p_auth_uid uuid, p_org uuid, p_tipo text)
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_permissao text;
BEGIN
  -- Chama-se SEMPRE depois de hr_anexo_rh_autorizar (que ja recusou o tipo
  -- desconhecido e quem nao ve a pessoa): aqui so falta a leitura do tipo. Um tipo
  -- sem permissao de leitura nunca se autoriza.
  v_permissao := public.hr_anexo_rh_permissao_leitura(p_tipo);

  IF p_auth_uid IS NULL OR p_org IS NULL OR v_permissao IS NULL
     OR NOT public.has_anew_permission_in_org(p_auth_uid, v_permissao, p_org) THEN
    RETURN 'sem_permissao';
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.hr_anexo_rh_autorizar_leitura(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_anexo_rh_autorizar_leitura(uuid, uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.hr_anexo_rh_autorizar_leitura(uuid, uuid, text) FROM authenticated;
REVOKE ALL ON FUNCTION public.hr_anexo_rh_autorizar_leitura(uuid, uuid, text) FROM service_role;

COMMENT ON FUNCTION public.hr_anexo_rh_autorizar_leitura(uuid, uuid, text) IS
'INTERNA, sem EXECUTE para ninguem: este utilizador pode LER este tipo de ficheiro na organizacao? Devolve NULL se sim e sem_permissao se nao (o mesmo codigo da escrita). Exigida a substituir e a remover, depois de hr_anexo_rh_autorizar. A organizacao e SEMPRE a da linha da pessoa ou do anexo. Desde 20261210260000.';

-- ==============================================================================
-- 1. rpc_hr_anexo_rh_reservar
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.rpc_hr_anexo_rh_reservar(
  p_auth_uid          uuid,
  p_pessoa_id         uuid,
  p_tipo              text,
  p_nome_original     text,
  p_tamanho_declarado bigint,
  p_mime_declarado    text,
  p_substitui_anexo_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  c_max_activos      constant integer := 4;
  c_max_bytes        constant bigint  := 10485760;
  c_max_bytes_foto   constant bigint  := 5242880;
  c_max_reservas_24h constant integer := 20;
  v_request_role text := nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'role';
  v_org          uuid;
  v_erro         text;
  v_limite_tipo  integer;
  v_activos      integer;
  v_do_tipo      integer;
  v_reservas     integer;
  v_ext          text;
  v_nome         text;
  v_id           uuid := gen_random_uuid();
  v_caminho      text;
BEGIN
  -- So service_role: sem esta guarda um EXECUTE futuro a authenticated deixaria
  -- qualquer utilizador passar o uid de outra pessoa.
  IF v_request_role IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'p_auth_uid so pode ser fornecido por service_role.'
      USING ERRCODE = 'HR911';
  END IF;

  IF p_auth_uid IS NULL THEN
    RETURN jsonb_build_object('erro', 'sem_sessao');
  END IF;

  -- A pessoa fica bloqueada ate ao fim: duas reservas em simultaneo da mesma
  -- pessoa nao passam as duas pelos limites. A organizacao vem DESTA linha.
  SELECT organization_id INTO v_org
    FROM public.pessoas WHERE id = p_pessoa_id FOR NO KEY UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('erro', 'pessoa_nao_encontrada');
  END IF;

  v_erro := public.hr_anexo_rh_autorizar(p_auth_uid, v_org, p_tipo);
  IF v_erro IS NOT NULL THEN
    RETURN jsonb_build_object('erro', v_erro);
  END IF;

  IF p_tipo IS NULL OR p_tipo NOT IN ('cartao_cidadao', 'comprovativo_iban', 'fotografia') THEN
    RETURN jsonb_build_object('erro', 'anexo_tipo_invalido');
  END IF;

  IF p_mime_declarado IS NULL
     OR p_mime_declarado NOT IN ('application/pdf', 'image/png', 'image/jpeg') THEN
    RETURN jsonb_build_object('erro', 'anexo_formato_invalido');
  END IF;

  IF p_tipo = 'fotografia' AND p_mime_declarado NOT IN ('image/png', 'image/jpeg') THEN
    RETURN jsonb_build_object('erro', 'anexo_fotografia_formato');
  END IF;

  IF p_tamanho_declarado IS NULL OR p_tamanho_declarado <= 0 THEN
    RETURN jsonb_build_object('erro', 'anexo_vazio');
  END IF;

  IF p_tipo = 'fotografia' THEN
    IF p_tamanho_declarado > c_max_bytes_foto THEN
      RETURN jsonb_build_object('erro', 'anexo_fotografia_demasiado_grande');
    END IF;
  ELSIF p_tamanho_declarado > c_max_bytes THEN
    RETURN jsonb_build_object('erro', 'anexo_demasiado_grande');
  END IF;

  -- O que se quer substituir: um promovido DESTA pessoa e DESTE tipo. Substituir
  -- exige tambem poder LER o tipo (sem isto, quem so escreve apagava o que nao abre).
  IF p_substitui_anexo_id IS NOT NULL THEN
    v_erro := public.hr_anexo_rh_autorizar_leitura(p_auth_uid, v_org, p_tipo);
    IF v_erro IS NOT NULL THEN
      RETURN jsonb_build_object('erro', v_erro);
    END IF;

    IF NOT EXISTS (
      SELECT 1
        FROM public.pessoas_anexos a
       WHERE a.id = p_substitui_anexo_id
         AND a.pessoa_id = p_pessoa_id
         AND a.tipo = p_tipo
         AND a.estado = 'promovido'
    ) THEN
      RETURN jsonb_build_object('erro', 'anexo_substituto_invalido');
    END IF;
  END IF;

  v_limite_tipo := CASE p_tipo
    WHEN 'cartao_cidadao'     THEN 2
    WHEN 'comprovativo_iban'  THEN 1
    WHEN 'fotografia'         THEN 1
  END;

  -- Activos de uma pessoa: promovidos mais pendentes do RH com menos de 2 horas. Os
  -- do convite nao contam, e um pendente mais velho e um envio abandonado (a limpeza
  -- di-lo apagado as 3 horas): enquanto la esta, nao ocupa lugar nem enche o tecto.
  SELECT count(*),
         count(*) FILTER (WHERE a.tipo = p_tipo)
    INTO v_activos, v_do_tipo
    FROM public.pessoas_anexos a
   WHERE a.pessoa_id = p_pessoa_id
     AND (a.estado = 'promovido'
          OR (a.estado = 'pendente' AND a.origem = 'rh' AND a.criado_em > now() - interval '2 hours'));

  -- O que se substitui deixa de contar: sai quando o novo entra.
  IF p_substitui_anexo_id IS NOT NULL THEN
    v_activos := v_activos - 1;
    v_do_tipo := v_do_tipo - 1;
  END IF;

  IF v_activos >= c_max_activos THEN
    RETURN jsonb_build_object('erro', 'anexo_maximo_ficheiros');
  END IF;
  IF v_do_tipo >= v_limite_tipo THEN
    RETURN jsonb_build_object('erro', 'anexo_tipo_cheio');
  END IF;

  -- Os apagados tambem contam: sem isto, carregar e remover em ciclo nunca
  -- esbarrava em limite nenhum e enchia o Storage.
  SELECT count(*) INTO v_reservas
    FROM public.pessoas_anexos a
   WHERE a.pessoa_id = p_pessoa_id
     AND a.origem = 'rh'
     AND a.criado_em > now() - interval '24 hours';
  IF v_reservas >= c_max_reservas_24h THEN
    RETURN jsonb_build_object('erro', 'anexo_limite_pessoa');
  END IF;

  v_ext := CASE p_mime_declarado
    WHEN 'application/pdf' THEN 'pdf'
    WHEN 'image/png'       THEN 'png'
    ELSE 'jpg'
  END;

  -- So o nome para mostrar: sem caracteres de controlo e com o tamanho limitado.
  -- O ficheiro nunca se guarda com este nome (o caminho usa o id).
  v_nome := left(btrim(regexp_replace(coalesce(p_nome_original, ''), '[[:cntrl:]]', '', 'g')), 200);
  IF v_nome = '' THEN
    v_nome := 'ficheiro';
  END IF;

  v_caminho := 'admissao/rh/' || v_id::text || '.' || v_ext;

  -- caminho_quarentena guarda o caminho da quarentena ATE AO FIM (promover muda so
  -- `caminho`, que passa a ser o final): e o que deixa a limpeza apagar a copia.
  INSERT INTO public.pessoas_anexos (
    id, organization_id, pessoa_id, tipo, estado, bucket,
    caminho, caminho_quarentena, nome_original, origem, carregado_por
  ) VALUES (
    v_id, v_org, p_pessoa_id, p_tipo, 'pendente', 'hr-documentos-quarantine',
    v_caminho, v_caminho, v_nome, 'rh', p_auth_uid
  );

  RETURN jsonb_build_object('anexo_id', v_id, 'caminho', v_caminho);
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_hr_anexo_rh_reservar(uuid, uuid, text, text, bigint, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_hr_anexo_rh_reservar(uuid, uuid, text, text, bigint, text, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.rpc_hr_anexo_rh_reservar(uuid, uuid, text, text, bigint, text, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_anexo_rh_reservar(uuid, uuid, text, text, bigint, text, uuid) TO service_role;

COMMENT ON FUNCTION public.rpc_hr_anexo_rh_reservar(uuid, uuid, text, text, bigint, text, uuid) IS
'Reserva um anexo do RH numa ficha: bloqueia a pessoa, le a organizacao da linha, verifica hr.pessoas.view e a permissao de escrita do tipo, valida tipo, formato declarado, tamanho, substituto (que exige tambem a permissao de LEITURA do tipo) e limites (4 activos, cartao 2, comprovativo 1, fotografia 1, com os pendentes do RH de mais de 2 horas fora da conta; 20 reservas do RH por pessoa em 24 horas) e cria a linha pendente na quarentena (admissao/rh/<id>.<ext>, origem rh, carregado_por = p_auth_uid). Devolve {anexo_id, caminho} ou {erro}. Nunca devolve organizacao nem pessoa. SO service_role (Edge Function hr-anexo-rh, accao url); fora de service_role, HR911. Desde 20261210260000.';

-- ==============================================================================
-- 2. rpc_hr_anexo_rh_contexto
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.rpc_hr_anexo_rh_contexto(
  p_auth_uid uuid,
  p_anexo_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_request_role text := nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'role';
  v_anexo        record;
  v_org          uuid;
  v_erro         text;
BEGIN
  IF v_request_role IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'p_auth_uid so pode ser fornecido por service_role.'
      USING ERRCODE = 'HR911';
  END IF;

  IF p_auth_uid IS NULL THEN
    RETURN jsonb_build_object('erro', 'sem_sessao');
  END IF;

  SELECT a.id, a.tipo, a.estado, a.caminho, a.organization_id, a.pessoa_id, a.origem, a.carregado_por
    INTO v_anexo
    FROM public.pessoas_anexos a
   WHERE a.id = p_anexo_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('erro', 'anexo_nao_encontrado');
  END IF;

  -- Um anexo de outra origem ou reservado por outro utilizador e um anexo
  -- inexistente: so quem reservou confirma.
  IF v_anexo.origem <> 'rh' OR v_anexo.carregado_por IS DISTINCT FROM p_auth_uid THEN
    RETURN jsonb_build_object('erro', 'anexo_nao_encontrado');
  END IF;

  IF v_anexo.estado <> 'pendente' THEN
    RETURN jsonb_build_object('erro', 'anexo_estado_invalido');
  END IF;

  v_org := v_anexo.organization_id;
  v_erro := public.hr_anexo_rh_autorizar(p_auth_uid, v_org, v_anexo.tipo);
  IF v_erro IS NOT NULL THEN
    RETURN jsonb_build_object('erro', v_erro);
  END IF;

  -- Uso interno da Edge Function: precisa da organizacao e da pessoa para
  -- construir o caminho final. Nunca se reenvia ao browser.
  RETURN jsonb_build_object(
    'anexo_id', v_anexo.id,
    'tipo', v_anexo.tipo,
    'caminho', v_anexo.caminho,
    'organization_id', v_org,
    'pessoa_id', v_anexo.pessoa_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_hr_anexo_rh_contexto(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_hr_anexo_rh_contexto(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.rpc_hr_anexo_rh_contexto(uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_anexo_rh_contexto(uuid, uuid) TO service_role;

COMMENT ON FUNCTION public.rpc_hr_anexo_rh_contexto(uuid, uuid) IS
'Contexto de um anexo pendente do RH, para a Edge Function o confirmar: {anexo_id, tipo, caminho, organization_id, pessoa_id}. Um anexo inexistente, de outra origem ou reservado por outro utilizador da anexo_nao_encontrado; um que ja nao esta pendente da anexo_estado_invalido; autoriza contra a organizacao DA LINHA. Uso INTERNO da Edge Function: a resposta com organizacao e pessoa nunca chega ao browser. SO service_role. Desde 20261210260000.';

-- ==============================================================================
-- 3. rpc_hr_anexo_rh_promover
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.rpc_hr_anexo_rh_promover(
  p_auth_uid           uuid,
  p_anexo_id           uuid,
  p_caminho_final      text,
  p_mime               text,
  p_tamanho            bigint,
  p_hash               text,
  p_substitui_anexo_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  c_max_activos    constant integer := 4;
  c_max_bytes      constant bigint  := 10485760;
  c_max_bytes_foto constant bigint  := 5242880;
  v_request_role text := nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'role';
  v_pessoa_id    uuid;
  v_org          uuid;
  v_anexo        record;
  v_subst        record;
  v_erro         text;
  v_limite_tipo  integer;
  v_activos      integer;
  v_do_tipo      integer;
  v_ext          text;
  v_esperado     text;
  v_campo        text;
  v_substituido  jsonb := NULL;
BEGIN
  IF v_request_role IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'p_auth_uid so pode ser fornecido por service_role.'
      USING ERRCODE = 'HR911';
  END IF;

  IF p_auth_uid IS NULL THEN
    RETURN jsonb_build_object('erro', 'sem_sessao');
  END IF;

  -- Bloqueia a pessoa e depois o anexo, na mesma ordem de reservar e remover.
  SELECT a.pessoa_id INTO v_pessoa_id
    FROM public.pessoas_anexos a
   WHERE a.id = p_anexo_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('erro', 'anexo_nao_encontrado');
  END IF;

  SELECT organization_id INTO v_org
    FROM public.pessoas WHERE id = v_pessoa_id FOR NO KEY UPDATE;

  SELECT a.id, a.tipo, a.estado, a.nome_original, a.origem, a.carregado_por
    INTO v_anexo
    FROM public.pessoas_anexos a WHERE a.id = p_anexo_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('erro', 'anexo_nao_encontrado');
  END IF;

  IF v_anexo.origem <> 'rh' OR v_anexo.carregado_por IS DISTINCT FROM p_auth_uid THEN
    RETURN jsonb_build_object('erro', 'anexo_nao_encontrado');
  END IF;

  IF v_anexo.estado <> 'pendente' THEN
    RETURN jsonb_build_object('erro', 'anexo_estado_invalido');
  END IF;

  v_erro := public.hr_anexo_rh_autorizar(p_auth_uid, v_org, v_anexo.tipo);
  IF v_erro IS NOT NULL THEN
    RETURN jsonb_build_object('erro', v_erro);
  END IF;

  -- Daqui para baixo, o tipo e o tamanho sao os REAIS (os bytes que a Edge
  -- Function leu), nao os que o browser declarou ao reservar.
  IF p_mime IS NULL OR p_mime NOT IN ('application/pdf', 'image/png', 'image/jpeg') THEN
    RETURN jsonb_build_object('erro', 'anexo_formato_invalido');
  END IF;

  IF v_anexo.tipo = 'fotografia' AND p_mime NOT IN ('image/png', 'image/jpeg') THEN
    RETURN jsonb_build_object('erro', 'anexo_fotografia_formato');
  END IF;

  IF p_tamanho IS NULL OR p_tamanho <= 0 THEN
    RETURN jsonb_build_object('erro', 'anexo_vazio');
  END IF;

  IF v_anexo.tipo = 'fotografia' THEN
    IF p_tamanho > c_max_bytes_foto THEN
      RETURN jsonb_build_object('erro', 'anexo_fotografia_demasiado_grande');
    END IF;
  ELSIF p_tamanho > c_max_bytes THEN
    RETURN jsonb_build_object('erro', 'anexo_demasiado_grande');
  END IF;

  IF p_hash IS NULL OR p_hash !~ '^[0-9a-f]{64}$' THEN
    RETURN jsonb_build_object('erro', 'anexo_falha_envio');
  END IF;

  -- O substituto fica bloqueado: promovido, desta pessoa, deste tipo, e nao e o proprio.
  -- Substituir exige tambem a permissao de LEITURA do tipo.
  IF p_substitui_anexo_id IS NOT NULL THEN
    v_erro := public.hr_anexo_rh_autorizar_leitura(p_auth_uid, v_org, v_anexo.tipo);
    IF v_erro IS NOT NULL THEN
      RETURN jsonb_build_object('erro', v_erro);
    END IF;

    SELECT a.id, a.bucket, a.caminho, a.caminho_quarentena, a.quarentena_removida_em
      INTO v_subst
      FROM public.pessoas_anexos a
     WHERE a.id = p_substitui_anexo_id
       AND a.id <> p_anexo_id
       AND a.pessoa_id = v_pessoa_id
       AND a.tipo = v_anexo.tipo
       AND a.estado = 'promovido'
     FOR UPDATE;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('erro', 'anexo_substituto_invalido');
    END IF;
  END IF;

  v_limite_tipo := CASE v_anexo.tipo
    WHEN 'cartao_cidadao'     THEN 2
    WHEN 'comprovativo_iban'  THEN 1
    WHEN 'fotografia'         THEN 1
  END;

  -- O anexo que se promove conta como activo (esta pendente, seja qual for a idade):
  -- so recusa se ja passou do limite. Os outros pendentes do RH so contam com menos
  -- de 2 horas (os mais velhos estao abandonados). O que se substitui sai quando
  -- este entra.
  SELECT count(*),
         count(*) FILTER (WHERE a.tipo = v_anexo.tipo)
    INTO v_activos, v_do_tipo
    FROM public.pessoas_anexos a
   WHERE a.pessoa_id = v_pessoa_id
     AND (a.estado = 'promovido'
          OR (a.estado = 'pendente' AND a.origem = 'rh'
              AND (a.id = v_anexo.id OR a.criado_em > now() - interval '2 hours')));

  IF p_substitui_anexo_id IS NOT NULL THEN
    v_activos := v_activos - 1;
    v_do_tipo := v_do_tipo - 1;
  END IF;

  IF v_activos > c_max_activos THEN
    RETURN jsonb_build_object('erro', 'anexo_maximo_ficheiros');
  END IF;
  IF v_do_tipo > v_limite_tipo THEN
    RETURN jsonb_build_object('erro', 'anexo_tipo_cheio');
  END IF;

  v_ext := CASE p_mime
    WHEN 'application/pdf' THEN 'pdf'
    WHEN 'image/png'       THEN 'png'
    ELSE 'jpg'
  END;

  -- O caminho final e o unico possivel, construido dos valores da propria linha.
  v_esperado := v_org::text || '/' || v_pessoa_id::text || '/admissao/' || v_anexo.id::text || '.' || v_ext;

  IF p_caminho_final IS DISTINCT FROM v_esperado THEN
    RETURN jsonb_build_object('erro', 'anexo_falha_envio');
  END IF;

  -- 1. A linha passa a promovido. ligado_em preenchido faz a limpeza tratar a linha
  --    como ja copiada se um dia for apagada.
  UPDATE public.pessoas_anexos
     SET estado        = 'promovido',
         bucket        = 'hr-documentos',
         caminho       = p_caminho_final,
         mime_type     = p_mime,
         tamanho_bytes = p_tamanho,
         hash_sha256   = p_hash,
         ligado_em = now(), promovido_em = now()
   WHERE id = v_anexo.id;

  -- 2. A fotografia passa pelo trigger de integridade (so aceita uma fotografia
  --    promovida desta pessoa e organizacao).
  IF v_anexo.tipo = 'fotografia' THEN
    UPDATE public.pessoas SET fotografia_anexo_id = v_anexo.id WHERE id = v_pessoa_id;
  END IF;

  -- 3. O que se substitui fica apagado de vez (a Edge remove os objectos).
  IF p_substitui_anexo_id IS NOT NULL THEN
    UPDATE public.pessoas_anexos
       SET estado = 'apagado', apagado_motivo = 'substituido', apagado_por = p_auth_uid, apagado_em = now(),
           nome_original = 'apagado', hash_sha256 = NULL
     WHERE id = v_subst.id;

    v_substituido := jsonb_build_object(
      'anexo_id', v_subst.id,
      'bucket', v_subst.bucket,
      'caminho', v_subst.caminho,
      'caminho_quarentena',
        CASE WHEN v_subst.quarentena_removida_em IS NULL
                  AND v_subst.caminho_quarentena IS DISTINCT FROM v_subst.caminho
             THEN v_subst.caminho_quarentena END
    );
  END IF;

  -- 4. O cartao e o comprovativo ficam auditados com o utilizador REAL, na mesma
  --    transaccao. Se a auditoria falhar, falha tudo. A fotografia nunca se audita.
  v_campo := CASE v_anexo.tipo
    WHEN 'cartao_cidadao'    THEN 'anexo_cartao_cidadao'
    WHEN 'comprovativo_iban' THEN 'anexo_comprovativo_iban'
  END;
  IF v_campo IS NOT NULL THEN
    PERFORM public.hr_registar_acesso_sensivel(v_pessoa_id, v_org, v_campo, 'alterar', p_auth_uid);
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'anexo', jsonb_build_object(
      'id', v_anexo.id,
      'tipo', v_anexo.tipo,
      'nome_original', v_anexo.nome_original,
      'tamanho_bytes', p_tamanho,
      'mime_type', p_mime
    ),
    'substituido', v_substituido
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_hr_anexo_rh_promover(uuid, uuid, text, text, bigint, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_hr_anexo_rh_promover(uuid, uuid, text, text, bigint, text, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.rpc_hr_anexo_rh_promover(uuid, uuid, text, text, bigint, text, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_anexo_rh_promover(uuid, uuid, text, text, bigint, text, uuid) TO service_role;

COMMENT ON FUNCTION public.rpc_hr_anexo_rh_promover(uuid, uuid, text, text, bigint, text, uuid) IS
'Promove um anexo pendente do RH depois de a Edge Function verificar os bytes: bloqueia a pessoa e a linha, repete origem rh, autor, estado pendente e a autorizacao com o tipo e o tamanho REAIS, exige o caminho final exacto <org>/<pessoa>/admissao/<anexo_id>.<ext> e, na MESMA transaccao e por esta ordem, passa a linha a promovido (hr-documentos, mime, tamanho, hash), aponta pessoas.fotografia_anexo_id para a fotografia, apaga o substituto (motivo substituido, apagado_por; exige a leitura do tipo; nome_original passa a apagado e o hash a NULL) e audita o cartao de cidadao ou o comprovativo de IBAN (alterar, com p_auth_uid). A falha da auditoria falha tudo. Devolve {ok, anexo, substituido} (substituido: anexo_id, bucket, caminho e caminho_quarentena, ou null) ou {erro}. SO service_role; fora de service_role, HR911. Desde 20261210260000.';

-- ==============================================================================
-- 4. rpc_hr_anexo_rh_descartar
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.rpc_hr_anexo_rh_descartar(
  p_auth_uid uuid,
  p_anexo_id uuid,
  p_motivo   text
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_request_role text := nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'role';
  v_anexo        record;
  v_org          uuid;
  v_erro         text;
BEGIN
  IF v_request_role IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'p_auth_uid so pode ser fornecido por service_role.'
      USING ERRCODE = 'HR911';
  END IF;

  IF p_auth_uid IS NULL THEN
    RETURN jsonb_build_object('erro', 'sem_sessao');
  END IF;

  -- So a Edge Function a desfazer o proprio trabalho: nunca "removido pelo RH".
  IF p_motivo IS NULL
     OR p_motivo NOT IN ('upload_abandonado', 'formato_invalido', 'demasiado_grande') THEN
    RETURN jsonb_build_object('erro', 'pedido_invalido');
  END IF;

  SELECT a.id, a.tipo, a.estado, a.bucket, a.caminho, a.caminho_quarentena,
         a.organization_id, a.origem, a.carregado_por
    INTO v_anexo
    FROM public.pessoas_anexos a
   WHERE a.id = p_anexo_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('erro', 'anexo_nao_encontrado');
  END IF;

  IF v_anexo.origem <> 'rh' OR v_anexo.carregado_por IS DISTINCT FROM p_auth_uid THEN
    RETURN jsonb_build_object('erro', 'anexo_nao_encontrado');
  END IF;

  -- Um anexo ja promovido faz parte da ficha: nunca se descarta por aqui.
  IF v_anexo.estado = 'promovido' THEN
    RETURN jsonb_build_object('erro', 'anexo_estado_invalido');
  END IF;

  IF v_anexo.estado = 'apagado' THEN
    -- Idempotente para a Edge Function: repetir o descarte devolve onde esta o objecto.
    RETURN jsonb_build_object('ok', true, 'bucket', v_anexo.bucket, 'caminho', v_anexo.caminho,
                              'caminho_quarentena',
                              CASE WHEN v_anexo.caminho_quarentena IS DISTINCT FROM v_anexo.caminho
                                   THEN v_anexo.caminho_quarentena END);
  END IF;

  v_org := v_anexo.organization_id;
  v_erro := public.hr_anexo_rh_autorizar(p_auth_uid, v_org, v_anexo.tipo);
  IF v_erro IS NOT NULL THEN
    RETURN jsonb_build_object('erro', v_erro);
  END IF;

  UPDATE public.pessoas_anexos
     SET estado         = 'apagado',
         apagado_em     = now(),
         apagado_motivo = p_motivo
   WHERE id = v_anexo.id;

  RETURN jsonb_build_object('ok', true, 'bucket', v_anexo.bucket, 'caminho', v_anexo.caminho,
                            'caminho_quarentena',
                            CASE WHEN v_anexo.caminho_quarentena IS DISTINCT FROM v_anexo.caminho
                                 THEN v_anexo.caminho_quarentena END);
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_hr_anexo_rh_descartar(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_hr_anexo_rh_descartar(uuid, uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.rpc_hr_anexo_rh_descartar(uuid, uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_anexo_rh_descartar(uuid, uuid, text) TO service_role;

COMMENT ON FUNCTION public.rpc_hr_anexo_rh_descartar(uuid, uuid, text) IS
'So para a Edge Function desfazer o proprio trabalho: marca como apagado um anexo PENDENTE do RH reservado por este utilizador, com o motivo upload_abandonado, formato_invalido ou demasiado_grande (outro motivo da pedido_invalido). Um promovido da anexo_estado_invalido; um anexo inexistente, de outra origem ou de outro autor da anexo_nao_encontrado. Idempotente: repetir devolve onde esta o objecto. Devolve {ok, bucket, caminho, caminho_quarentena} ou {erro}. SO service_role. Desde 20261210260000.';

-- ==============================================================================
-- 5. rpc_hr_anexo_rh_remover
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.rpc_hr_anexo_rh_remover(
  p_auth_uid uuid,
  p_anexo_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_request_role text := nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'role';
  v_pessoa_id    uuid;
  v_org          uuid;
  v_anexo        record;
  v_erro         text;
  v_campo        text;
BEGIN
  IF v_request_role IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'p_auth_uid so pode ser fornecido por service_role.'
      USING ERRCODE = 'HR911';
  END IF;

  IF p_auth_uid IS NULL THEN
    RETURN jsonb_build_object('erro', 'sem_sessao');
  END IF;

  SELECT a.pessoa_id INTO v_pessoa_id
    FROM public.pessoas_anexos a
   WHERE a.id = p_anexo_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('erro', 'anexo_nao_encontrado');
  END IF;

  SELECT organization_id INTO v_org
    FROM public.pessoas WHERE id = v_pessoa_id FOR NO KEY UPDATE;

  SELECT a.id, a.tipo, a.estado, a.bucket, a.caminho, a.caminho_quarentena,
         a.quarentena_removida_em, a.origem, a.carregado_por
    INTO v_anexo
    FROM public.pessoas_anexos a WHERE a.id = p_anexo_id FOR UPDATE;

  -- Apagado ou inexistente: nao ha nada a remover.
  IF NOT FOUND THEN
    RETURN jsonb_build_object('erro', 'anexo_nao_encontrado');
  END IF;
  IF v_anexo.estado = 'apagado' THEN
    RETURN jsonb_build_object('erro', 'anexo_nao_encontrado');
  END IF;

  -- A permissao do TIPO da linha, na organizacao da linha. Quem nao ve a pessoa
  -- (outra organizacao) recebe o MESMO codigo de um anexo que nao existe: nao se
  -- revela que o uuid pertence a uma ficha de outra organizacao.
  v_erro := public.hr_anexo_rh_autorizar(p_auth_uid, v_org, v_anexo.tipo);
  IF v_erro IS NOT NULL THEN
    IF v_erro = 'pessoa_nao_encontrada' THEN
      RETURN jsonb_build_object('erro', 'anexo_nao_encontrado');
    END IF;
    RETURN jsonb_build_object('erro', v_erro);
  END IF;

  -- Remover exige tambem poder LER o tipo.
  v_erro := public.hr_anexo_rh_autorizar_leitura(p_auth_uid, v_org, v_anexo.tipo);
  IF v_erro IS NOT NULL THEN
    RETURN jsonb_build_object('erro', v_erro);
  END IF;

  -- Um ligado, ou um pendente de um convite, e do convite: o RH nao lhe toca.
  IF v_anexo.estado = 'ligado' OR (v_anexo.estado = 'pendente' AND v_anexo.origem <> 'rh') THEN
    RETURN jsonb_build_object('erro', 'anexo_estado_invalido');
  END IF;

  -- Aceita um promovido de QUALQUER origem (e assim que o RH tira a fotografia que
  -- veio do convite) ou um pendente do RH reservado por este mesmo utilizador.
  IF NOT (v_anexo.estado = 'promovido'
          OR (v_anexo.estado = 'pendente' AND v_anexo.origem = 'rh' AND v_anexo.carregado_por = p_auth_uid)) THEN
    RETURN jsonb_build_object('erro', 'anexo_nao_encontrado');
  END IF;

  -- O avatar PRIMEIRO: o trigger de integridade so dispara ao escrever
  -- fotografia_anexo_id, por isso apagar o anexo nao limpava o avatar.
  IF v_anexo.tipo = 'fotografia' THEN
    UPDATE public.pessoas SET fotografia_anexo_id = NULL
     WHERE id = v_pessoa_id AND fotografia_anexo_id = p_anexo_id;
  END IF;

  UPDATE public.pessoas_anexos
     SET estado = 'apagado', apagado_motivo = 'rh', apagado_por = p_auth_uid, apagado_em = now(),
         nome_original = 'apagado', hash_sha256 = NULL
   WHERE id = v_anexo.id;

  -- So se audita o que ja fazia parte da ficha (o cartao e o comprovativo promovidos).
  IF v_anexo.estado = 'promovido' THEN
    v_campo := CASE v_anexo.tipo
      WHEN 'cartao_cidadao'    THEN 'anexo_cartao_cidadao'
      WHEN 'comprovativo_iban' THEN 'anexo_comprovativo_iban'
    END;
    IF v_campo IS NOT NULL THEN
      PERFORM public.hr_registar_acesso_sensivel(v_pessoa_id, v_org, v_campo, 'alterar', p_auth_uid);
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'bucket', v_anexo.bucket,
    'caminho', v_anexo.caminho,
    'caminho_quarentena',
      CASE WHEN v_anexo.quarentena_removida_em IS NULL
                AND v_anexo.caminho_quarentena IS DISTINCT FROM v_anexo.caminho
           THEN v_anexo.caminho_quarentena END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_hr_anexo_rh_remover(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_hr_anexo_rh_remover(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.rpc_hr_anexo_rh_remover(uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_anexo_rh_remover(uuid, uuid) TO service_role;

COMMENT ON FUNCTION public.rpc_hr_anexo_rh_remover(uuid, uuid) IS
'O RH remove um anexo: aceita um promovido de QUALQUER origem (inclui a fotografia que veio do convite) ou um pendente do RH reservado por este utilizador; autoriza com a permissao de escrita do TIPO da linha na organizacao da linha e exige tambem a de leitura do tipo (sem_permissao). Por esta ordem e na mesma transaccao: se for o avatar, fotografia_anexo_id fica NULL; a linha passa a apagado (motivo rh, apagado_por, apagado_em; nome_original apagado e hash NULL); o cartao e o comprovativo promovidos ficam auditados (alterar, com p_auth_uid). A falha da auditoria falha tudo. Apagado, inexistente ou de outra organizacao da o MESMO codigo, anexo_nao_encontrado. Devolve {ok, bucket, caminho, caminho_quarentena} ou {erro}: a Edge apaga os objectos e a limpeza repete o que ficar. SO service_role; fora de service_role, HR911. Desde 20261210260000.';

-- ==============================================================================
-- Conferir (estrutura): falha o push se algo estiver diferente do esperado.
-- ==============================================================================
DO $conferir$
DECLARE
  v_sig     text;
  v_src     text;
  v_n       integer;
  v_publicas text[] := ARRAY[
    'public.rpc_hr_anexo_rh_reservar(uuid, uuid, text, text, bigint, text, uuid)',
    'public.rpc_hr_anexo_rh_contexto(uuid, uuid)',
    'public.rpc_hr_anexo_rh_promover(uuid, uuid, text, text, bigint, text, uuid)',
    'public.rpc_hr_anexo_rh_descartar(uuid, uuid, text)',
    'public.rpc_hr_anexo_rh_remover(uuid, uuid)'
  ];
  v_internas text[] := ARRAY[
    'public.hr_anexo_rh_permissao_escrita(text)',
    'public.hr_anexo_rh_autorizar(uuid, uuid, text)',
    'public.hr_anexo_rh_permissao_leitura(text)',
    'public.hr_anexo_rh_autorizar_leitura(uuid, uuid, text)'
  ];
BEGIN
  -- 1. Cada funcao existe uma so vez (uma segunda candidata deixa o PostgREST sem saber qual escolher).
  SELECT count(*) INTO v_n
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public'
     AND p.proname IN ('rpc_hr_anexo_rh_reservar', 'rpc_hr_anexo_rh_contexto', 'rpc_hr_anexo_rh_promover',
                       'rpc_hr_anexo_rh_descartar', 'rpc_hr_anexo_rh_remover',
                       'hr_anexo_rh_permissao_escrita', 'hr_anexo_rh_autorizar',
                       'hr_anexo_rh_permissao_leitura', 'hr_anexo_rh_autorizar_leitura');
  IF v_n <> 9 THEN
    RAISE EXCEPTION 'Esperavam-se 9 funcoes (uma de cada); ha %.', v_n;
  END IF;

  -- 2. As cinco publicas: EXECUTE so para service_role, e o corpo traz a guarda e a autorizacao.
  FOREACH v_sig IN ARRAY v_publicas LOOP
    IF to_regprocedure(v_sig) IS NULL THEN
      RAISE EXCEPTION '% nao existe.', v_sig;
    END IF;
    IF has_function_privilege('authenticated', v_sig, 'EXECUTE')
       OR has_function_privilege('anon', v_sig, 'EXECUTE')
       OR NOT has_function_privilege('service_role', v_sig, 'EXECUTE') THEN
      RAISE EXCEPTION '% tem de ser so service_role.', v_sig;
    END IF;

    SELECT p.prosrc INTO v_src FROM pg_proc p WHERE p.oid = to_regprocedure(v_sig);
    IF v_src NOT LIKE '%request.jwt.claims%' OR v_src NOT LIKE '%service_role%' OR v_src NOT LIKE '%HR911%' THEN
      RAISE EXCEPTION '% nao tem a guarda de service_role.', v_sig;
    END IF;
    IF v_src NOT LIKE '%hr_anexo_rh_autorizar%' THEN
      RAISE EXCEPTION '% nao chama hr_anexo_rh_autorizar.', v_sig;
    END IF;
    IF NOT (SELECT p.prosecdef FROM pg_proc p WHERE p.oid = to_regprocedure(v_sig)) THEN
      RAISE EXCEPTION '% devia ser SECURITY DEFINER.', v_sig;
    END IF;
  END LOOP;

  -- 3. As duas internas: ninguem as executa por fora (nem o service_role).
  FOREACH v_sig IN ARRAY v_internas LOOP
    IF to_regprocedure(v_sig) IS NULL THEN
      RAISE EXCEPTION '% nao existe.', v_sig;
    END IF;
    IF has_function_privilege('authenticated', v_sig, 'EXECUTE')
       OR has_function_privilege('anon', v_sig, 'EXECUTE')
       OR has_function_privilege('service_role', v_sig, 'EXECUTE') THEN
      RAISE EXCEPTION '% e interna: ninguem a pode executar por fora.', v_sig;
    END IF;
  END LOOP;

  -- 4. Promover e remover nao engolem erros: a falha da auditoria falha tudo.
  FOREACH v_sig IN ARRAY ARRAY[
    'public.rpc_hr_anexo_rh_promover(uuid, uuid, text, text, bigint, text, uuid)',
    'public.rpc_hr_anexo_rh_remover(uuid, uuid)'
  ] LOOP
    SELECT p.prosrc INTO v_src FROM pg_proc p WHERE p.oid = to_regprocedure(v_sig);
    IF v_src LIKE '%WHEN OTHERS%' THEN
      RAISE EXCEPTION '% nao pode ter uma subtransaccao que engole erros.', v_sig;
    END IF;
    IF v_src NOT LIKE '%hr_registar_acesso_sensivel%' THEN
      RAISE EXCEPTION '% devia auditar o cartao e o comprovativo.', v_sig;
    END IF;
  END LOOP;

  -- 5. A permissao por tipo executada: so a funcao interna a devolve.
  IF public.hr_anexo_rh_permissao_escrita('cartao_cidadao') IS DISTINCT FROM 'hr.pessoas.identificacao.edit'
     OR public.hr_anexo_rh_permissao_escrita('comprovativo_iban') IS DISTINCT FROM 'hr.pessoas.bancarios.edit'
     OR public.hr_anexo_rh_permissao_escrita('fotografia') IS DISTINCT FROM 'hr.pessoas.pessoais.edit'
     OR public.hr_anexo_rh_permissao_escrita('outro') IS NOT NULL THEN
    RAISE EXCEPTION 'hr_anexo_rh_permissao_escrita devolveu uma permissao inesperada.';
  END IF;

  IF public.hr_anexo_rh_permissao_leitura('cartao_cidadao') IS DISTINCT FROM 'hr.pessoas.identificacao.reveal'
     OR public.hr_anexo_rh_permissao_leitura('comprovativo_iban') IS DISTINCT FROM 'hr.pessoas.bancarios.edit'
     OR public.hr_anexo_rh_permissao_leitura('fotografia') IS DISTINCT FROM 'hr.pessoas.view'
     OR public.hr_anexo_rh_permissao_leitura('outro') IS NOT NULL THEN
    RAISE EXCEPTION 'hr_anexo_rh_permissao_leitura devolveu uma permissao inesperada.';
  END IF;

  -- Promover, reservar e remover exigem a leitura do tipo ao substituir/remover.
  FOREACH v_sig IN ARRAY ARRAY[
    'public.rpc_hr_anexo_rh_reservar(uuid, uuid, text, text, bigint, text, uuid)',
    'public.rpc_hr_anexo_rh_promover(uuid, uuid, text, text, bigint, text, uuid)',
    'public.rpc_hr_anexo_rh_remover(uuid, uuid)'
  ] LOOP
    SELECT p.prosrc INTO v_src FROM pg_proc p WHERE p.oid = to_regprocedure(v_sig);
    IF v_src NOT LIKE '%hr_anexo_rh_autorizar_leitura%' OR v_src NOT LIKE '%FOR NO KEY UPDATE%' THEN
      RAISE EXCEPTION '% devia exigir a leitura do tipo e bloquear a pessoa com FOR NO KEY UPDATE.', v_sig;
    END IF;
  END LOOP;

  RAISE NOTICE 'OK: cinco RPCs so service_role com a guarda e a autorizacao no corpo, quatro internas sem EXECUTE, promover e remover sem WHEN OTHERS, permissoes de escrita e de leitura por tipo.';
END;
$conferir$;

-- ==============================================================================
-- Conferir (ao vivo, so na organizacao nike): percorre as RPCs com dados de teste
-- e DESFAZ tudo com a sentinela HR900. Corre com request.jwt.claims de
-- service_role (set_config local) e o auth uid de um super_admin activo da nike;
-- se nao houver, salta. Os objectos de Storage nao entram aqui (caminhos
-- ficticios). Nada se escreve fora da nike.
-- ==============================================================================
DO $conferir_vivo$
DECLARE
  v_org_nike  uuid := 'b6ffce4f-f630-4933-833a-008649757a33'::uuid;
  v_uid       uuid;
  v_cargo     uuid;
  v_pessoa    uuid;
  v_r         jsonb;
  v_ctx       jsonb;
  v_foto1     uuid;
  v_foto2     uuid;
  v_cartao    uuid;
  v_id        uuid;
  v_caminho   text;
  v_estado    text;
  v_motivo    text;
  v_por       uuid;
  v_avatar    uuid;
  v_n         integer;
  v_falhou    boolean;
  v_nome      text;
  v_hash      text;
  v_apagado   timestamptz;
  v_tipo      text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.anew_organizations WHERE id = v_org_nike) THEN
    RAISE NOTICE 'Org nike nao encontrada neste ambiente -- o conferir ao vivo dos anexos do RH foi saltado.';
    RETURN;
  END IF;

  SELECT au.auth_user_id INTO v_uid
    FROM public.anew_memberships am
    JOIN public.anew_users au ON au.id = am.user_id
    JOIN public.anew_roles ar ON ar.id = am.role_id AND ar.code = 'super_admin'
   WHERE am.organization_id = v_org_nike AND am.status = 'active' AND au.auth_user_id IS NOT NULL
   ORDER BY au.auth_user_id
   LIMIT 1;

  IF v_uid IS NULL
     OR NOT public.has_anew_permission_in_org(v_uid, 'hr.pessoas.view', v_org_nike)
     OR NOT public.has_anew_permission_in_org(v_uid, 'hr.pessoas.pessoais.edit', v_org_nike)
     OR NOT public.has_anew_permission_in_org(v_uid, 'hr.pessoas.identificacao.edit', v_org_nike)
     OR NOT public.has_anew_permission_in_org(v_uid, 'hr.pessoas.identificacao.reveal', v_org_nike)
     OR NOT public.has_anew_permission_in_org(v_uid, 'hr.pessoas.bancarios.edit', v_org_nike) THEN
    -- Um aviso (nao um NOTICE perdido no meio do push): sem este utilizador as RPCs
    -- ficam SEM prova ao vivo. Nao falha o push porque a falta de um utilizador de
    -- teste num ambiente nao e um defeito das RPCs (as outras migrations do ramo
    -- saltam do mesmo modo), mas tem de se ver e rever a mao.
    RAISE WARNING 'CONFERIR AO VIVO dos anexos do RH NAO CORREU: nao ha super_admin activo na nike com hr.pessoas.view, pessoais.edit, identificacao.edit, identificacao.reveal e bancarios.edit. As RPCs ficaram sem prova ao vivo.';
    RETURN;
  END IF;

  BEGIN
    PERFORM set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);

    -- Escritas SO na nike (organization_id confirmado acima).
    -- O trigger de cargos (20261210110000, HRC08) recusa uma ficha sem cargo: fabrica-se
    -- primeiro um cargo activo de teste na nike, com nome unico (hr_cargo_nome_chave,
    -- 20261210160000). Desfeito com tudo o resto pela sentinela HR900.
    INSERT INTO public.hr_cargos (organization_id, nome, salario_base, periodicidade)
    VALUES (v_org_nike, 'TESTE MIGRACAO cargo 20261210260000 ' || gen_random_uuid()::text, 0, 'mensal')
    RETURNING id INTO v_cargo;

    INSERT INTO public.pessoas (organization_id, primeiro_nome, apelido, cargo_id, data_admissao)
    VALUES (v_org_nike, 'TESTE MIGRACAO', '20261210260000 -- apagar', v_cargo, current_date)
    RETURNING id INTO v_pessoa;

    -- ---- reservar e promover uma fotografia: o avatar aponta para ela --------
    v_r := public.rpc_hr_anexo_rh_reservar(v_uid, v_pessoa, 'fotografia', 'foto.png', 1000, 'image/png');
    v_foto1 := (v_r->>'anexo_id')::uuid;
    IF v_foto1 IS NULL OR (v_r->>'caminho') NOT LIKE 'admissao/rh/%' THEN
      RAISE EXCEPTION 'reservar devia devolver anexo_id e um caminho admissao/rh/; devolveu %.', v_r USING ERRCODE = 'HR961';
    END IF;

    v_ctx := public.rpc_hr_anexo_rh_contexto(v_uid, v_foto1);
    IF (v_ctx->>'organization_id')::uuid IS DISTINCT FROM v_org_nike
       OR (v_ctx->>'pessoa_id')::uuid IS DISTINCT FROM v_pessoa OR (v_ctx->>'tipo') <> 'fotografia' THEN
      RAISE EXCEPTION 'contexto devia devolver a organizacao e a pessoa da linha; devolveu %.', v_ctx USING ERRCODE = 'HR961';
    END IF;
    IF public.rpc_hr_anexo_rh_contexto(gen_random_uuid(), v_foto1)->>'erro' IS DISTINCT FROM 'anexo_nao_encontrado' THEN
      RAISE EXCEPTION 'so quem reservou devia ver o contexto (anexo_nao_encontrado para outro utilizador).' USING ERRCODE = 'HR961';
    END IF;

    v_caminho := v_org_nike::text || '/' || v_pessoa::text || '/admissao/' || v_foto1::text || '.png';
    v_r := public.rpc_hr_anexo_rh_promover(v_uid, v_foto1, v_caminho, 'image/png', 1000, repeat('a', 64));
    IF (v_r->>'ok') IS DISTINCT FROM 'true' THEN
      RAISE EXCEPTION 'promover a fotografia devia devolver ok; devolveu %.', v_r USING ERRCODE = 'HR961';
    END IF;
    SELECT fotografia_anexo_id INTO v_avatar FROM public.pessoas WHERE id = v_pessoa;
    IF v_avatar IS DISTINCT FROM v_foto1 THEN
      RAISE EXCEPTION 'o avatar devia apontar para a fotografia promovida.' USING ERRCODE = 'HR961';
    END IF;

    -- ---- uma segunda fotografia sem substituto: o tipo esta cheio ------------
    v_r := public.rpc_hr_anexo_rh_reservar(v_uid, v_pessoa, 'fotografia', 'foto2.png', 1000, 'image/png');
    IF (v_r->>'erro') IS DISTINCT FROM 'anexo_tipo_cheio' THEN
      RAISE EXCEPTION 'a segunda fotografia sem substituto devia dar anexo_tipo_cheio; deu %.', v_r USING ERRCODE = 'HR961';
    END IF;

    -- ---- com substituto: a antiga fica apagada (substituido) e o avatar muda -
    v_r := public.rpc_hr_anexo_rh_reservar(v_uid, v_pessoa, 'fotografia', 'foto2.png', 1000, 'image/png', v_foto1);
    v_foto2 := (v_r->>'anexo_id')::uuid;
    IF v_foto2 IS NULL THEN
      RAISE EXCEPTION 'reservar com substituto devia ter sucesso; devolveu %.', v_r USING ERRCODE = 'HR961';
    END IF;
    v_caminho := v_org_nike::text || '/' || v_pessoa::text || '/admissao/' || v_foto2::text || '.png';
    v_r := public.rpc_hr_anexo_rh_promover(v_uid, v_foto2, v_caminho, 'image/png', 1000, repeat('b', 64), v_foto1);
    IF (v_r->>'ok') IS DISTINCT FROM 'true' OR (v_r->'substituido'->>'anexo_id')::uuid IS DISTINCT FROM v_foto1 THEN
      RAISE EXCEPTION 'promover com substituto devia devolver ok e o substituido; devolveu %.', v_r USING ERRCODE = 'HR961';
    END IF;
    SELECT estado, apagado_motivo, apagado_por INTO v_estado, v_motivo, v_por
      FROM public.pessoas_anexos WHERE id = v_foto1;
    IF v_estado <> 'apagado' OR v_motivo <> 'substituido' OR v_por IS DISTINCT FROM v_uid THEN
      RAISE EXCEPTION 'a fotografia antiga devia ficar apagada (substituido) por este utilizador; esta % (%).', v_estado, v_motivo
        USING ERRCODE = 'HR961';
    END IF;
    SELECT fotografia_anexo_id INTO v_avatar FROM public.pessoas WHERE id = v_pessoa;
    IF v_avatar IS DISTINCT FROM v_foto2 THEN
      RAISE EXCEPTION 'o avatar devia passar para a fotografia nova.' USING ERRCODE = 'HR961';
    END IF;
    SELECT nome_original, hash_sha256, apagado_em INTO v_nome, v_hash, v_apagado
      FROM public.pessoas_anexos WHERE id = v_foto1;
    IF v_nome IS DISTINCT FROM 'apagado' OR v_hash IS NOT NULL OR v_apagado IS NULL THEN
      RAISE EXCEPTION 'a fotografia substituida devia perder nome e hash e guardar apagado_em; ficou % / % / %.', v_nome, v_hash, v_apagado
        USING ERRCODE = 'HR961';
    END IF;

    -- ---- remover a fotografia: avatar NULL, motivo rh ------------------------
    v_r := public.rpc_hr_anexo_rh_remover(v_uid, v_foto2);
    IF (v_r->>'ok') IS DISTINCT FROM 'true' THEN
      RAISE EXCEPTION 'remover a fotografia devia devolver ok; devolveu %.', v_r USING ERRCODE = 'HR961';
    END IF;
    SELECT fotografia_anexo_id INTO v_avatar FROM public.pessoas WHERE id = v_pessoa;
    IF v_avatar IS NOT NULL THEN
      RAISE EXCEPTION 'o avatar devia ficar NULL depois de remover a fotografia.' USING ERRCODE = 'HR961';
    END IF;
    SELECT estado, apagado_motivo, apagado_por INTO v_estado, v_motivo, v_por
      FROM public.pessoas_anexos WHERE id = v_foto2;
    IF v_estado <> 'apagado' OR v_motivo <> 'rh' OR v_por IS DISTINCT FROM v_uid THEN
      RAISE EXCEPTION 'a fotografia removida devia ficar apagada (rh) por este utilizador; esta % (%).', v_estado, v_motivo
        USING ERRCODE = 'HR961';
    END IF;
    SELECT nome_original, hash_sha256, apagado_em INTO v_nome, v_hash, v_apagado
      FROM public.pessoas_anexos WHERE id = v_foto2;
    IF v_nome IS DISTINCT FROM 'apagado' OR v_hash IS NOT NULL OR v_apagado IS NULL THEN
      RAISE EXCEPTION 'a fotografia removida devia perder nome e hash e guardar apagado_em; ficou % / % / %.', v_nome, v_hash, v_apagado
        USING ERRCODE = 'HR961';
    END IF;
    IF (public.rpc_hr_anexo_rh_remover(v_uid, v_foto2)->>'erro') IS DISTINCT FROM 'anexo_nao_encontrado' THEN
      RAISE EXCEPTION 'remover um anexo ja apagado devia dar anexo_nao_encontrado.' USING ERRCODE = 'HR961';
    END IF;
    -- Um uuid que nao existe, e um anexo que o utilizador nao ve (um uid sem permissoes
    -- na organizacao da linha: o caso de outra organizacao), respondem o mesmo codigo.
    IF (public.rpc_hr_anexo_rh_remover(v_uid, gen_random_uuid())->>'erro') IS DISTINCT FROM 'anexo_nao_encontrado' THEN
      RAISE EXCEPTION 'remover um uuid inexistente devia dar anexo_nao_encontrado.' USING ERRCODE = 'HR961';
    END IF;

    -- ---- o cartao promovido: uma linha de auditoria alterar com o uid --------
    v_r := public.rpc_hr_anexo_rh_reservar(v_uid, v_pessoa, 'cartao_cidadao', 'cartao.pdf', 2000, 'application/pdf');
    v_cartao := (v_r->>'anexo_id')::uuid;
    IF v_cartao IS NULL THEN
      RAISE EXCEPTION 'reservar o cartao devia ter sucesso; devolveu %.', v_r USING ERRCODE = 'HR961';
    END IF;
    v_caminho := v_org_nike::text || '/' || v_pessoa::text || '/admissao/' || v_cartao::text || '.pdf';
    v_r := public.rpc_hr_anexo_rh_promover(v_uid, v_cartao, v_caminho, 'application/pdf', 2000, repeat('c', 64));
    IF (v_r->>'ok') IS DISTINCT FROM 'true' THEN
      RAISE EXCEPTION 'promover o cartao devia devolver ok; devolveu %.', v_r USING ERRCODE = 'HR961';
    END IF;
    SELECT count(*) INTO v_n FROM public.pessoas_acessos_sensiveis
     WHERE pessoa_id = v_pessoa AND campo = 'anexo_cartao_cidadao' AND accao = 'alterar' AND auth_user_id = v_uid;
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'devia haver 1 linha de auditoria (anexo_cartao_cidadao, alterar) com o uid do utilizador; ha %.', v_n
        USING ERRCODE = 'HR961';
    END IF;

    -- ---- descartar: nunca um promovido, e so tres motivos --------------------
    IF (public.rpc_hr_anexo_rh_descartar(v_uid, v_cartao, 'upload_abandonado')->>'erro') IS DISTINCT FROM 'anexo_estado_invalido' THEN
      RAISE EXCEPTION 'descartar um promovido devia dar anexo_estado_invalido.' USING ERRCODE = 'HR961';
    END IF;
    IF (public.rpc_hr_anexo_rh_descartar(v_uid, v_cartao, 'rh')->>'erro') IS DISTINCT FROM 'pedido_invalido' THEN
      RAISE EXCEPTION 'descartar com o motivo rh devia dar pedido_invalido.' USING ERRCODE = 'HR961';
    END IF;

    -- ---- um uid aleatorio nao ve a pessoa -------------------------------------
    v_r := public.rpc_hr_anexo_rh_reservar(gen_random_uuid(), v_pessoa, 'fotografia', 'foto.png', 1000, 'image/png');
    IF (v_r->>'erro') IS DISTINCT FROM 'pessoa_nao_encontrada' THEN
      RAISE EXCEPTION 'um uid sem permissoes devia dar pessoa_nao_encontrada; deu %.', v_r USING ERRCODE = 'HR961';
    END IF;

    -- ---- remover um anexo de que o uid nao ve a ficha: o mesmo codigo do inexistente
    IF (public.rpc_hr_anexo_rh_remover(gen_random_uuid(), v_cartao)->>'erro') IS DISTINCT FROM 'anexo_nao_encontrado' THEN
      RAISE EXCEPTION 'remover um anexo que o uid nao ve devia dar anexo_nao_encontrado, como o inexistente.' USING ERRCODE = 'HR961';
    END IF;

    -- ---- a leitura do tipo: quem a tem passa, quem nao a tem recebe sem_permissao
    -- (so a funcao interna: os casos de escrita sem leitura precisam de um utilizador
    -- fabricado, que esta migration nao cria).
    FOREACH v_tipo IN ARRAY ARRAY['cartao_cidadao', 'comprovativo_iban', 'fotografia'] LOOP
      IF public.hr_anexo_rh_autorizar_leitura(v_uid, v_org_nike, v_tipo) IS NOT NULL THEN
        RAISE EXCEPTION 'o super_admin devia poder ler o tipo %.', v_tipo USING ERRCODE = 'HR961';
      END IF;
      IF public.hr_anexo_rh_autorizar_leitura(gen_random_uuid(), v_org_nike, v_tipo) IS DISTINCT FROM 'sem_permissao' THEN
        RAISE EXCEPTION 'um uid sem permissoes devia dar sem_permissao a ler o tipo %.', v_tipo USING ERRCODE = 'HR961';
      END IF;
    END LOOP;
    IF public.hr_anexo_rh_autorizar_leitura(v_uid, v_org_nike, 'outro') IS DISTINCT FROM 'sem_permissao' THEN
      RAISE EXCEPTION 'um tipo desconhecido nunca se autoriza a ler.' USING ERRCODE = 'HR961';
    END IF;

    -- ---- pendentes do RH com mais de 2 horas nao contam nos limites ----------
    -- Ha 1 activo (o cartao). Quatro pendentes de ha 3 horas, contados, davam 5.
    INSERT INTO public.pessoas_anexos
      (organization_id, pessoa_id, tipo, estado, bucket, caminho, caminho_quarentena, nome_original,
       origem, carregado_por, criado_em)
    SELECT v_org_nike, v_pessoa, 'comprovativo_iban', 'pendente', 'hr-documentos-quarantine',
           'admissao/rh/velho-' || gen_random_uuid()::text || '.pdf',
           'admissao/rh/velho-' || gen_random_uuid()::text || '.pdf',
           'velho.pdf', 'rh', v_uid, now() - interval '3 hours'
      FROM generate_series(1, 4);
    v_r := public.rpc_hr_anexo_rh_reservar(v_uid, v_pessoa, 'fotografia', 'foto3.png', 1000, 'image/png');
    IF (v_r->>'anexo_id') IS NULL THEN
      RAISE EXCEPTION 'pendentes do RH de ha 3 horas nao deviam contar nos limites; reservar devolveu %.', v_r USING ERRCODE = 'HR961';
    END IF;
    DELETE FROM public.pessoas_anexos WHERE pessoa_id = v_pessoa AND estado = 'pendente';

    -- ---- sem role service_role: HR911 ------------------------------------------
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
    v_falhou := false;
    BEGIN
      PERFORM public.rpc_hr_anexo_rh_reservar(v_uid, v_pessoa, 'fotografia', 'foto.png', 1000, 'image/png');
    EXCEPTION WHEN SQLSTATE 'HR911' THEN
      v_falhou := true;
    END;
    IF NOT v_falhou THEN
      RAISE EXCEPTION 'chamar sem o role service_role devia dar HR911.' USING ERRCODE = 'HR961';
    END IF;
    PERFORM set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);

    -- ---- o tecto de 20 reservas em 24 horas: apagadas incluidas ---------------
    -- Ja ha 3 (duas fotografias e o cartao); mais 17 reservas descartadas fazem 20.
    FOR i IN 1..17 LOOP
      v_r := public.rpc_hr_anexo_rh_reservar(v_uid, v_pessoa, 'fotografia', 'ciclo.png', 1000, 'image/png');
      v_id := (v_r->>'anexo_id')::uuid;
      IF v_id IS NULL THEN
        RAISE EXCEPTION 'a reserva % do ciclo devia ter sucesso; devolveu %.', i, v_r USING ERRCODE = 'HR961';
      END IF;
      v_r := public.rpc_hr_anexo_rh_descartar(v_uid, v_id, 'upload_abandonado');
      IF (v_r->>'ok') IS DISTINCT FROM 'true' THEN
        RAISE EXCEPTION 'descartar a reserva % devia devolver ok; devolveu %.', i, v_r USING ERRCODE = 'HR961';
      END IF;
    END LOOP;
    SELECT count(*) INTO v_n FROM public.pessoas_anexos WHERE pessoa_id = v_pessoa AND origem = 'rh';
    IF v_n <> 20 THEN
      RAISE EXCEPTION 'devia haver 20 reservas do RH desta pessoa; ha %.', v_n USING ERRCODE = 'HR961';
    END IF;
    v_r := public.rpc_hr_anexo_rh_reservar(v_uid, v_pessoa, 'fotografia', 'ciclo.png', 1000, 'image/png');
    IF (v_r->>'erro') IS DISTINCT FROM 'anexo_limite_pessoa' THEN
      RAISE EXCEPTION 'a 21.a reserva em 24 horas devia dar anexo_limite_pessoa; deu %.', v_r USING ERRCODE = 'HR961';
    END IF;

    RAISE EXCEPTION 'teste_hr_anexos_rh_rpcs_20261210260000_ok' USING ERRCODE = 'HR900';
  EXCEPTION
    WHEN SQLSTATE 'HR900' THEN
      NULL; -- sucesso: tudo desfeito pela subtransaccao (linhas e claims).
    WHEN OTHERS THEN
      RAISE EXCEPTION 'O conferir ao vivo dos anexos do RH (RPCs) falhou -- SQLSTATE %: %', SQLSTATE, SQLERRM;
  END;

  RAISE NOTICE 'CONFERIR AO VIVO (nike): reservar e promover a fotografia (avatar), tipo cheio, substituicao e remocao (sem nome nem hash, avatar NULL, motivo rh), auditoria do cartao com o uid, descartar, uid sem permissoes, leitura por tipo, pendentes velhos fora da conta, mesmo codigo para anexo inexistente, HR911 fora de service_role e o tecto de 20 reservas em 24 horas. Tudo desfeito.';
END;
$conferir_vivo$;

-- ==============================================================================
-- ANTES DO db push
--
-- 1. PRECISA DE CODIGO NOVO: ver o cabecalho. Ordem: db push das tres migrations
--    (250000, 260000, 270000), deploy de hr-anexo-rh, ecra. A Edge e o cliente
--    entram no mesmo commit.
--
-- 2. Listar o que esta pendente IMEDIATAMENTE antes do push
--    (supabase migration list --linked): o push aplica TUDO o que estiver na
--    pasta, por ordem. Antes de escolher estas versoes, listar tambem o remoto:
--    migrations de outros ramos ficam aplicadas na base partilhada sem ficheiro
--    aqui. Nunca migration repair.
--
-- 3. Antes de escrever uma migration para uma funcao que ja existe, procurar a
--    versao MAIS RECENTE. Estas sao funcoes novas (nenhuma com este nome existe);
--    confirmar por leitura no remoto que nenhum outro ramo as criou.
--
-- 4. Nao ha vermelho a demonstrar contra o remoto: tudo e novo. Depois do push NAO
--    se volta atras para demonstrar nada.
-- ==============================================================================
