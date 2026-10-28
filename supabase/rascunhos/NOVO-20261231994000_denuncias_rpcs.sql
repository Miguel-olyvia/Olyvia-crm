-- ==============================================================================
-- 20261231994000_denuncias_rpcs  (RASCUNHO -- nao aplicar sem decisao)
-- ==============================================================================
-- Base: RH (uetjghdkwbywbftedtth). Desenho: supabase/rascunhos/DESENHO-denuncias.md,
-- com as correccoes da revisao de 28/10 (seis achados HIGH) incorporadas.
--
-- -- O QUE FAZ -----------------------------------------------------------------
--
-- Toda a logica do canal de denuncias, em funcoes. As tabelas
-- (20261231993000) estao fechadas a todos; estas funcoes sao o unico caminho.
--
-- A) INTERNAS (sem EXECUTE para PUBLIC, anon, authenticated nem service_role):
--    denuncias_eu, denuncias_membro_ativo, denuncias_visiveis, denuncias_trancar,
--    denuncias_evento, denuncias_auditar, denuncias_instante, denuncias_texto,
--    denuncias_texto_mensagem, denuncias_resumo, denuncias_proximo_codigo,
--    denuncias_limite_consumir, denuncias_limite_publico, denuncias_vista_gestor,
--    denuncias_vista_denunciante, denuncias_sessao.
--    denuncias_visiveis e a definicao UNICA de "posso ver este caso":
--      - sou elegivel (designado activo + denuncias.gerir; denuncias_elegiveis);
--      - nao estou impedido (visado ou conflito) neste caso;
--      - o caso e meu, OU nao tem responsavel elegivel E (foi recebido no dia da
--        minha designacao ou depois, OU nao ha outro elegivel nao impedido
--        designado antes dele). Correccao HIGH de escalada: quem se designa hoje
--        nao ve os casos antigos na fila; so se lhos atribuirem.
--
-- B) DO GESTOR (EXECUTE so a authenticated; SECURITY DEFINER; search_path fixo).
--    Todas recebem p_organization_id e filtram por id E organizacao; as que
--    alteram o caso fazem SELECT ... FOR UPDATE e devolvem o caso actualizado.
--      rpc_denuncias_listar(org)                 lista do que posso ver. O RESUMO
--                                                so vem nos casos atribuidos a mim
--                                                (correccao HIGH de conflito).
--      rpc_denuncias_por_confirmar(org)          contador do menu (0 sem acesso).
--      rpc_denuncia_abrir(org, id)               o caso sem identidade; abrir um
--                                                caso que nao e meu deixa o evento
--                                                'consultada' (uma vez por dia).
--      rpc_denuncia_confirmar_rececao(org, id, mensagem)
--      rpc_denuncia_gravidade(org, id, g)        rpc_denuncia_avaliacao(org, id, t)
--      rpc_denuncia_atribuir(org, id, user)      auto-atribuicao vai a auditoria.
--      rpc_denuncia_impedir(org, id, user, motivo)  conflito so do proprio; visado
--                                                de qualquer um, com auditoria.
--      rpc_denuncia_pedir_informacao / _mensagem (recusa em recebida, D5) / _nota
--      rpc_denuncia_concluir / _arquivar / _reabrir
--      rpc_denuncia_identidade_ver(org, id, motivo)  regista ANTES de devolver.
--      rpc_denuncia_exportar(org, id, motivo)    so o responsavel atribuido.
--      rpc_denuncias_responsaveis(org)
--      rpc_denuncias_canal_ler(org) / rpc_denuncias_canal_guardar(org, ativo, slug)
--      rpc_denuncias_responsavel_designar(org, user) / _remover(org, user)
--      rpc_denuncia_impedimento_retirar(org, id, user)
--      rpc_denuncias_canal_auditoria(org, limite)
--    Do DENUNCIANTE IDENTIFICADO (authenticated, basta sessao):
--      rpc_denuncias_minhas(org), rpc_denuncia_minha_responder(org, id, texto)
--
-- C) DE SERVICO (EXECUTE so a service_role: so a Edge canal-denuncias as chama;
--    correccao HIGH: sem este REVOKE, anon chamava a _criar com um PIN escolhido
--    por si e em nome de outrem):
--      rpc_denuncia_publica_limitar(balde, chave_ip)   so 'canal' e 'sessao'
--      rpc_denuncia_publica_canal(slug)   -> {ativo, organization_id, organizacao,
--                                            responsaveis}; a Edge so passa o
--                                            nome ao browser (o id serve o HMAC).
--      rpc_denuncia_publica_reservar_codigo(slug, chave_ip, reserva_hash)
--      rpc_denuncia_publica_criar(slug, codigo, reserva_hash, dados, pin_hash,
--                                 identidade, auth_user_id, impedidos)
--      rpc_denuncia_publica_entrar(slug, codigo, pin_hash, sessao_hash, chave_ip)
--    CONTRATO COM A EDGE (supabase/functions/denuncia-publica): estes nomes de
--    argumentos e estas respostas sao os que o handler usa; p_dados so leva
--    anonima (booleano, obrigatorio), tipo, descricao, quando, onde, envolvidos,
--    ainda_acontece, testemunhas, ja_reportado e boa_fe. Os visados indicados
--    pelo denunciante vao em p_impedidos, nunca dentro de p_dados.
--      rpc_denuncia_publica_ler(sessao_hash) / _responder(sessao_hash, texto)
--      rpc_denuncia_publica_sair(sessao_hash)
--      rpc_denuncias_limpar()
--    SO O DONO (sem GRANT, sem job): rpc_denuncias_conservacao_executar().
--
-- -- LIMITE DE PEDIDOS (correccao HIGH) ----------------------------------------
--
-- Na base, atomico (INSERT ... ON CONFLICT DO UPDATE), por hora, em
-- denuncias_limites, dentro da mesma transaccao da RPC (a Edge nao o pode
-- saltar):
--                      por IP     global da org    org sem IP valido
--   criar (reservar)   5 / h      30 / h           10 / h
--   entrar             20 / h     300 / h          60 / h
--                      por IP     global (todas as organizacoes)
--   canal              60 / h     3000 / h
--   sessao (ler/resp.) 120 / h    3000 / h
-- (canal e sessao por rpc_denuncia_publica_limitar; nunca pelo hash da sessao,
-- que ligaria a contagem a uma denuncia.)
-- O limite de criar so se gasta em reservar_codigo, por isso a _criar so aceita
-- um codigo com RESERVA VIVA em denuncias_reservas (mesmo nonce da Edge, desta
-- hora ou da anterior) e apaga-a: um codigo nunca reservado (do ano anterior,
-- adivinhado, ou de uma reserva alheia sem o nonce) da HRD26 sem criar nada.
-- A chave do IP e um HMAC hex de 64 calculado na Edge com um pepper que roda
-- todos os dias (DENUNCIAS_IP_PEPPER + data); o IP vem da ULTIMA entrada fiavel
-- que a plataforma acrescenta, nunca do primeiro x-forwarded-for. Sem chave
-- valida conta so no balde "sem IP" da organizacao (mais baixo), nunca num balde
-- partilhado por todas. Criar acima do limite: HRD22 (e a transaccao desfaz-se,
-- o limite ja estava cheio). Entrar acima do limite: false, como um PIN errado.
--
-- -- PIN E SESSAO --------------------------------------------------------------
--
-- pin_hash = HMAC-SHA-256(DENUNCIAS_PIN_PEPPER, 'den-pin|' || organization_id ||
-- '|' || codigo || '|' || pin), hex, calculado na Edge. A base so compara dois
-- hex de 64. Bloqueio por denuncia: 5 falhas -> 15 min, a dobrar ate 24 h (D2,
-- recomendacao A). Codigo inexistente, PIN errado, bloqueada e limite excedido
-- devolvem o MESMO false. Sessao: a Edge gera 32 bytes, a base guarda o SHA-256;
-- 30 minutos, renovada a cada leitura ou resposta.
--
-- -- ANONIMATO (correccao HIGH) ------------------------------------------------
--
-- Numa anonima, o evento 'recebida', as mensagens do denunciante e o evento
-- 'denunciante_respondeu' ficam com a hora a 00:00 de Lisboa desse dia
-- (denuncias_instante). A _criar descarta identidade e auth_user_id se a
-- denuncia e anonima, e a origem fica 'publica' (nao revela que veio da app).
-- Tudo o que a _criar grava fica ao dia numa anonima: tambem registado_em dos
-- visados indicados pelo denunciante (denuncias_impedidos), e a reserva do
-- codigo apaga-se na mesma transaccao.
-- O que fica FORA da base e vai ao juridico: registos da plataforma (Supabase,
-- alojamento) com IP e hora de cada pedido; a sessao_expira_em, que guarda o
-- instante da ultima actividade + 30 min ate a limpeza.
--
-- -- CODIGOS DE ERRO (MESSAGE = codigo, ERRCODE = HRDxx) -----------------------
--
--   HRD01 transicao_invalida   HRD02 denunciado          HRD03 conflito
--   HRD04 texto_vazio          HRD05 motivo_curto        HRD06 resultado_em_falta
--   HRD07 fundamentacao_em_falta  HRD08 fechada          (os oito ja existem em
--                                                         acoes.ts e nas traducoes)
--   NOVOS (traducoes em canalDenunciasPt.ts/En.ts e lista de traducoes.test.ts):
--   HRD09 nao_encontrada       HRD10 confirmar_primeiro  HRD11 anonima
--   HRD12 motivo_identidade    HRD13 limite_anexos (reservado, fase 2)
--   HRD14 nao_e_responsavel    HRD15 impedimento_invalido HRD16 so_responsavel
--   HRD17 sem_permissao        HRD18 slug_em_uso         HRD19 canal_inativo
--   HRD20 anonima_imutavel     HRD21 visado_em_caso_aberto HRD22 limite_excedido
--   HRD23 dados_invalidos      HRD24 sessao_invalida     HRD25 limite_mensagens
--   HRD26 codigo_invalido      HRD27 campo_imutavel      HRD28 sem_responsaveis
--   42501 sem sessao (RPCs do gestor e "as minhas" chamadas sem JWT).
--   Eventos novos no historico (cd.hist.<acao>): consultada, visado_registado,
--   impedimento_retirado, responsavel_libertado, avaliacao_alterada,
--   identidade_vista, exportada.
--
-- -- CODIGO QUE TEM DE ENTRAR COM ESTA MIGRATION -------------------------------
--
-- Nada parte se o cliente nao vier logo (a UI continua em memoria). Para LIGAR:
-- 1. Segredos DENUNCIAS_PIN_PEPPER e DENUNCIAS_IP_PEPPER (>= 32 caracteres) e a
--    Edge canal-denuncias (verify_jwt = false), que: calcula o HMAC do PIN e da
--    chave do IP; usa o IP fiavel da plataforma; nao regista IP, user-agent,
--    corpo, PIN, sessao nem JWT (Sentry so accao e SQLSTATE; confirmar que o
--    beforeSend tira request e headers); valida o JWT de quem se identifica dentro
--    da app e passa p_auth_user_id (a base resolve o anew_users.id e recusa
--    quem nao e membro activo, HRD17); ignora qualquer JWT numa anonima.
-- 2. O cliente: FonteDenuncias real, traducoes HRD09..HRD28, rota e menu com
--    denuncias.gerir NO MESMO ENVIO, dialogo de motivo antes de ver a identidade,
--    ecra de responsaveis e auditoria para quem tem denuncias.configurar.
-- 3. Passo "Provas" do formulario diz que nesta fase nao se enviam ficheiros.
--
-- -- ORDEM DE PUBLICACAO -------------------------------------------------------
--
-- 20261231992000 -> 20261231993000 -> ESTA (mesmo push) -> segredos + Edge ->
-- cliente -> na nike, atribuir permissoes, designar responsaveis e ligar o
-- canal. Testes (TESTE-denuncias.sql) ANTES do push, em BEGIN ... ROLLBACK.
-- Listar o pendente imediatamente antes do db push.
--
-- -- A CONFIRMAR COM O JURIDICO (interpretacao da Lei 93/2021) -----------------
--
-- Prazos (7 dias para confirmar; 3 meses desde a rececao); conservacao 5 anos
-- desde o fecho e o que se apaga; se o super-admin pode ficar sem acesso aos
-- casos; se o HMAC do IP agregado por hora (24 h) e compativel com o anonimato;
-- se os registos da plataforma sao aceitaveis; o que o denunciante recebe como
-- desfecho (aqui: resultado e medidas, sem fundamentacao).
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- Numa migration nova: DROP de todas as funcoes rpc_denuncia% e as internas
-- desta migration. Os dados ficam nas tabelas.
--
-- Prerequisitos: 20261231992000, 20261231993000.
-- ==============================================================================

SET LOCAL lock_timeout = '3s';

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
DECLARE
  v_n integer;
BEGIN
  IF to_regclass('public.denuncias') IS NULL OR to_regclass('public.denuncias_limites') IS NULL
     OR to_regclass('public.denuncias_canal_auditoria') IS NULL OR to_regclass('public.denuncias_reservas') IS NULL THEN
    RAISE EXCEPTION 'As tabelas do canal nao existem. Aplicar 20261231993000 primeiro.';
  END IF;
  IF to_regprocedure('public.denuncias_elegiveis(uuid)') IS NULL
     OR to_regprocedure('public.denuncias_hoje()') IS NULL THEN
    RAISE EXCEPTION 'denuncias_elegiveis(uuid) / denuncias_hoje() nao existem. Aplicar 20261231993000 primeiro.';
  END IF;
  SELECT count(*) INTO v_n
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND (p.proname LIKE 'denuncia%' OR p.proname LIKE 'rpc_denuncia%');
  IF v_n <> 7 THEN
    RAISE EXCEPTION 'Esperavam-se so as 7 funcoes de 20261231993000; ha % funcoes de denuncias. Investigar.', v_n;
  END IF;
  SELECT count(*) INTO v_n FROM pg_attribute
   WHERE attrelid = to_regclass('public.anew_memberships')
     AND attname IN ('user_id', 'organization_id', 'status', 'role_is_client') AND NOT attisdropped;
  IF v_n <> 4 THEN
    RAISE EXCEPTION 'anew_memberships nao tem user_id, organization_id, status e role_is_client (encontradas %).', v_n;
  END IF;
  IF to_regclass('public.pessoas_contas') IS NULL THEN
    RAISE EXCEPTION 'public.pessoas_contas nao existe.';
  END IF;
END;
$guardas$;

-- ==============================================================================
-- A. Funcoes internas
-- ==============================================================================

CREATE FUNCTION public.denuncias_eu()
RETURNS uuid
LANGUAGE sql STABLE
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT u.id FROM public.anew_users u
   WHERE u.auth_user_id = auth.uid() AND u.deleted_at IS NULL
$$;

CREATE FUNCTION public.denuncias_membro_ativo(p_organization_id uuid, p_user uuid)
RETURNS boolean
LANGUAGE sql STABLE
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.anew_memberships m
      JOIN public.anew_users u ON u.id = m.user_id
     WHERE m.user_id = p_user AND m.organization_id = p_organization_id
       AND m.status = 'active' AND m.role_is_client IS NOT TRUE
       AND u.deleted_at IS NULL)
$$;

-- Definicao UNICA de "posso ver/tratar este caso" (p_so = NULL: todos).
CREATE FUNCTION public.denuncias_visiveis(p_organization_id uuid, p_eu uuid, p_so uuid)
RETURNS TABLE (denuncia_id uuid)
LANGUAGE sql STABLE
SET search_path TO 'public', 'pg_temp'
AS $$
  WITH el AS MATERIALIZED (
    SELECT e.anew_user_id, e.desde FROM public.denuncias_elegiveis(p_organization_id) e
  ), me AS (
    SELECT el.desde FROM el WHERE el.anew_user_id = p_eu
  )
  SELECT d.id
    FROM public.denuncias d
   CROSS JOIN me
   WHERE d.organization_id = p_organization_id
     AND (p_so IS NULL OR d.id = p_so)
     AND NOT EXISTS (SELECT 1 FROM public.denuncias_impedidos i
                      WHERE i.denuncia_id = d.id AND i.anew_user_id = p_eu AND i.retirado_em IS NULL)
     AND (
       d.responsavel_id = p_eu
       OR (
         (d.responsavel_id IS NULL OR NOT EXISTS (SELECT 1 FROM el x WHERE x.anew_user_id = d.responsavel_id))
         AND (
           me.desde <= d.recebida_em
           OR NOT EXISTS (
             SELECT 1 FROM el o
              WHERE o.anew_user_id <> p_eu
                AND o.desde <= d.recebida_em
                AND NOT EXISTS (SELECT 1 FROM public.denuncias_impedidos i2
                                 WHERE i2.denuncia_id = d.id AND i2.anew_user_id = o.anew_user_id
                                   AND i2.retirado_em IS NULL)))))
$$;

-- Carrega o caso para alterar: visivel, trancado, e visivel outra vez depois do lock.
CREATE FUNCTION public.denuncias_trancar(p_organization_id uuid, p_denuncia_id uuid, p_eu uuid)
RETURNS public.denuncias
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_d public.denuncias;
BEGIN
  IF p_eu IS NULL THEN
    RAISE EXCEPTION 'sem_sessao' USING ERRCODE = '42501';
  END IF;
  IF p_organization_id IS NULL OR p_denuncia_id IS NULL
     OR NOT EXISTS (SELECT 1 FROM public.denuncias_visiveis(p_organization_id, p_eu, p_denuncia_id)) THEN
    RAISE EXCEPTION 'nao_encontrada' USING ERRCODE = 'HRD09';
  END IF;
  SELECT d.* INTO v_d FROM public.denuncias d
   WHERE d.id = p_denuncia_id AND d.organization_id = p_organization_id
   FOR UPDATE;
  IF NOT FOUND
     OR NOT EXISTS (SELECT 1 FROM public.denuncias_visiveis(p_organization_id, p_eu, p_denuncia_id)) THEN
    RAISE EXCEPTION 'nao_encontrada' USING ERRCODE = 'HRD09';
  END IF;
  RETURN v_d;
END;
$$;

CREATE FUNCTION public.denuncias_evento(p_organization_id uuid, p_denuncia_id uuid, p_tipo text,
                                        p_quem uuid, p_dados jsonb, p_em timestamptz)
RETURNS void
LANGUAGE sql
SET search_path TO 'public', 'pg_temp'
AS $$
  INSERT INTO public.denuncias_eventos (organization_id, denuncia_id, tipo, quem_user_id, dados, criado_em)
  VALUES (p_organization_id, p_denuncia_id, p_tipo, p_quem, coalesce(p_dados, '{}'::jsonb), coalesce(p_em, now()))
$$;

CREATE FUNCTION public.denuncias_auditar(p_organization_id uuid, p_tipo text, p_quem uuid, p_alvo uuid,
                                         p_denuncia_id uuid, p_dados jsonb)
RETURNS void
LANGUAGE sql
SET search_path TO 'public', 'pg_temp'
AS $$
  INSERT INTO public.denuncias_canal_auditoria (organization_id, tipo, quem_user_id, alvo_user_id, denuncia_id, dados)
  VALUES (p_organization_id, p_tipo, p_quem, p_alvo, p_denuncia_id, coalesce(p_dados, '{}'::jsonb))
$$;

-- Instante do lado do denunciante: numa anonima, 00:00 de Lisboa desse dia.
CREATE FUNCTION public.denuncias_instante(p_anonima boolean)
RETURNS timestamptz
LANGUAGE sql STABLE
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT CASE WHEN p_anonima
              THEN date_trunc('day', now() AT TIME ZONE 'Europe/Lisbon') AT TIME ZONE 'Europe/Lisbon'
              ELSE now() END
$$;

-- Texto opcional de um jsonb: nulo se ausente ou vazio; HRD23 se nao e texto ou e longo.
CREATE FUNCTION public.denuncias_texto(p jsonb, p_chave text, p_max integer)
RETURNS text
LANGUAGE plpgsql IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_v jsonb := p -> p_chave;
  v_t text;
BEGIN
  IF v_v IS NULL OR jsonb_typeof(v_v) = 'null' THEN
    RETURN NULL;
  END IF;
  IF jsonb_typeof(v_v) <> 'string' THEN
    RAISE EXCEPTION 'dados_invalidos' USING ERRCODE = 'HRD23';
  END IF;
  v_t := btrim(v_v #>> '{}');
  IF v_t = '' THEN
    RETURN NULL;
  END IF;
  IF length(v_t) > p_max THEN
    RAISE EXCEPTION 'dados_invalidos' USING ERRCODE = 'HRD23';
  END IF;
  RETURN v_t;
END;
$$;

-- Texto obrigatorio de uma mensagem ou nota.
CREATE FUNCTION public.denuncias_texto_mensagem(p_texto text)
RETURNS text
LANGUAGE plpgsql IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_t text := btrim(coalesce(p_texto, ''));
BEGIN
  IF v_t = '' THEN
    RAISE EXCEPTION 'texto_vazio' USING ERRCODE = 'HRD04';
  END IF;
  IF length(v_t) > 4000 THEN
    RAISE EXCEPTION 'dados_invalidos' USING ERRCODE = 'HRD23';
  END IF;
  RETURN v_t;
END;
$$;

-- A primeira linha da descricao, cortada a 90 (= resumirTexto de formulario.ts).
CREATE FUNCTION public.denuncias_resumo(p_descricao text)
RETURNS text
LANGUAGE sql IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT CASE WHEN length(l.linha) <= 90 THEN l.linha
              ELSE rtrim(left(l.linha, 89)) || '…' END
    FROM (SELECT rtrim(split_part(btrim(p_descricao), E'\n', 1), E'\r') AS linha) l
$$;

-- Codigo seguinte da organizacao (transaccional: o UPDATE tranca a linha do canal).
CREATE FUNCTION public.denuncias_proximo_codigo(p_organization_id uuid)
RETURNS text
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_ano integer := extract(year FROM public.denuncias_hoje())::integer;
  v_num integer;
BEGIN
  UPDATE public.denuncias_canal c
     SET ultimo_numero = CASE WHEN c.ultimo_ano = v_ano THEN c.ultimo_numero + 1 ELSE 1 END,
         ultimo_ano = v_ano
   WHERE c.organization_id = p_organization_id AND c.ativo
  RETURNING c.ultimo_numero INTO v_num;
  IF v_num IS NULL THEN
    RAISE EXCEPTION 'canal_inativo' USING ERRCODE = 'HRD19';
  END IF;
  IF v_num > 999999 THEN
    RAISE EXCEPTION 'limite_excedido' USING ERRCODE = 'HRD22';
  END IF;
  RETURN 'DEN-' || v_ano::text || '-' || lpad(v_num::text, 4, '0');
END;
$$;

-- Conta um pedido na hora corrente; true se ainda dentro do maximo. Atomico.
CREATE FUNCTION public.denuncias_limite_consumir(p_balde text, p_chave text, p_max integer)
RETURNS boolean
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_n integer;
BEGIN
  INSERT INTO public.denuncias_limites AS l (balde, chave, janela, contagem)
  VALUES (p_balde, p_chave, date_trunc('hour', now()), 1)
  ON CONFLICT (balde, chave, janela) DO UPDATE SET contagem = l.contagem + 1
  RETURNING l.contagem INTO v_n;
  RETURN v_n <= p_max;
END;
$$;

-- Os baldes de um pedido publico (todos contam; true so se todos dentro).
CREATE FUNCTION public.denuncias_limite_publico(p_balde text, p_organization_id uuid, p_chave_ip text)
RETURNS boolean
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_ip_ok   boolean := true;
  v_org_ok  boolean := true;
  v_sem_ok  boolean := true;
  v_max_ip  integer := CASE p_balde WHEN 'criar' THEN 5 ELSE 20 END;
  v_max_org integer := CASE p_balde WHEN 'criar' THEN 30 ELSE 300 END;
  v_max_sem integer := CASE p_balde WHEN 'criar' THEN 10 ELSE 60 END;
BEGIN
  IF p_balde NOT IN ('criar', 'entrar') THEN
    RAISE EXCEPTION 'dados_invalidos' USING ERRCODE = 'HRD23';
  END IF;
  IF p_chave_ip IS NOT NULL AND p_chave_ip ~ '^[0-9a-f]{64}$' THEN
    v_ip_ok := public.denuncias_limite_consumir(p_balde, 'ip:' || p_chave_ip, v_max_ip);
  ELSIF p_organization_id IS NOT NULL THEN
    v_sem_ok := public.denuncias_limite_consumir(p_balde, 'semip:' || p_organization_id::text, v_max_sem);
  ELSE
    RETURN false;
  END IF;
  IF p_organization_id IS NOT NULL THEN
    v_org_ok := public.denuncias_limite_consumir(p_balde, 'org:' || p_organization_id::text, v_max_org);
  END IF;
  RETURN v_ip_ok AND v_org_ok AND v_sem_ok;
END;
$$;

-- O caso visto pela gestao: tudo menos identidade, PIN e sessao.
CREATE FUNCTION public.denuncias_vista_gestor(p_denuncia_id uuid)
RETURNS jsonb
LANGUAGE sql STABLE
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT jsonb_build_object(
    'id', d.id, 'organization_id', d.organization_id, 'codigo', d.codigo, 'tipo', d.tipo,
    'resumo', d.resumo, 'descricao', d.descricao, 'quando', d.quando, 'onde', d.onde,
    'envolvidos', d.envolvidos, 'ainda_acontece', d.ainda_acontece, 'testemunhas', d.testemunhas,
    'ja_reportado', d.ja_reportado, 'anonima', d.anonima, 'origem', d.origem, 'estado', d.estado,
    'gravidade', d.gravidade, 'avaliacao_inicial', d.avaliacao_inicial,
    'responsavel_id', d.responsavel_id, 'responsavel_nome', ru.name,
    'recebida_em', d.recebida_em, 'prazo_confirmar', d.prazo_confirmar,
    'prazo_seguimento', d.prazo_seguimento, 'confirmada_em', d.confirmada_em,
    'decisao', CASE WHEN d.resultado IS NULL THEN NULL ELSE jsonb_build_object(
                 'resultado', d.resultado, 'medidas', d.medidas, 'fundamentacao', d.fundamentacao,
                 'em', d.decidida_em) END,
    'motivo_arquivo', d.motivo_arquivo, 'fechada_em', d.fechada_em, 'conservar_ate', d.conservar_ate,
    'tem_identidade', EXISTS (SELECT 1 FROM public.denuncias_identidade i WHERE i.denuncia_id = d.id),
    'identidade_so_responsavel', (SELECT i.so_responsavel FROM public.denuncias_identidade i WHERE i.denuncia_id = d.id),
    'mensagens', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', m.id, 'autor', m.autor, 'autor_id', m.autor_user_id,
                                          'autor_nome', mu.name, 'pedido_informacao', m.pedido_informacao,
                                          'texto', m.texto, 'em', m.criada_em) ORDER BY m.seq)
        FROM public.denuncias_mensagens m LEFT JOIN public.anew_users mu ON mu.id = m.autor_user_id
       WHERE m.denuncia_id = d.id), '[]'::jsonb),
    'notas', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', n.id, 'autor_id', n.autor_user_id, 'autor_nome', nu.name,
                                          'texto', n.texto, 'em', n.criada_em) ORDER BY n.seq)
        FROM public.denuncias_notas n JOIN public.anew_users nu ON nu.id = n.autor_user_id
       WHERE n.denuncia_id = d.id), '[]'::jsonb),
    'eventos', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', e.id, 'tipo', e.tipo, 'quem_id', e.quem_user_id,
                                          'quem_nome', eu.name, 'dados', e.dados, 'em', e.criado_em) ORDER BY e.seq)
        FROM public.denuncias_eventos e LEFT JOIN public.anew_users eu ON eu.id = e.quem_user_id
       WHERE e.denuncia_id = d.id), '[]'::jsonb),
    -- O conflito automatico do PROPRIO denunciante (motivo 'conflito', sem
    -- registado_por: so a _criar o grava) nunca sai, nem contado: dizia quem
    -- denunciou a quem abre o caso, sem motivo e sem identidade_vista. Continua
    -- a valer em denuncias_visiveis (o denunciante nunca ve o proprio caso).
    'impedidos', coalesce((
      SELECT jsonb_agg(jsonb_build_object('anew_user_id', i.anew_user_id, 'nome', iu.name, 'motivo', i.motivo,
                                          'pelo_denunciante', i.registado_por IS NULL) ORDER BY i.registado_em)
        FROM public.denuncias_impedidos i JOIN public.anew_users iu ON iu.id = i.anew_user_id
       WHERE i.denuncia_id = d.id AND i.retirado_em IS NULL
         AND NOT (i.motivo = 'conflito' AND i.registado_por IS NULL)), '[]'::jsonb))
    FROM public.denuncias d
    LEFT JOIN public.anew_users ru ON ru.id = d.responsavel_id
   WHERE d.id = p_denuncia_id
$$;

-- O caso visto pelo denunciante: estado, datas, desfecho e conversa. Nunca notas,
-- gravidade, avaliacao, responsavel, eventos nem quem escreveu do lado do canal.
CREATE FUNCTION public.denuncias_vista_denunciante(p_denuncia_id uuid)
RETURNS jsonb
LANGUAGE sql STABLE
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT jsonb_build_object(
    'id', d.id, 'codigo', d.codigo, 'tipo', d.tipo, 'descricao', d.descricao, 'quando', d.quando,
    'onde', d.onde, 'anonima', d.anonima, 'estado', d.estado, 'recebida_em', d.recebida_em,
    'confirmada_em', (d.confirmada_em AT TIME ZONE 'Europe/Lisbon')::date,
    'prazo_confirmar', d.prazo_confirmar, 'prazo_seguimento', d.prazo_seguimento,
    'fechada_em', (d.fechada_em AT TIME ZONE 'Europe/Lisbon')::date,
    'desfecho', CASE d.estado
                  WHEN 'concluida' THEN jsonb_build_object('resultado', d.resultado, 'medidas', d.medidas)
                  WHEN 'arquivada' THEN jsonb_build_object('arquivada', true)
                  ELSE NULL END,
    'mensagens', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', m.id, 'autor', m.autor, 'pedido_informacao', m.pedido_informacao,
                                          'texto', m.texto, 'em', m.criada_em) ORDER BY m.seq)
        FROM public.denuncias_mensagens m WHERE m.denuncia_id = d.id), '[]'::jsonb))
    FROM public.denuncias d
   WHERE d.id = p_denuncia_id
$$;

-- Sessao publica valida -> id do caso, trancando o acesso e renovando 30 min.
CREATE FUNCTION public.denuncias_sessao(p_sessao_hash text)
RETURNS uuid
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_sessao_hash IS NULL OR p_sessao_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'sessao_invalida' USING ERRCODE = 'HRD24';
  END IF;
  SELECT a.denuncia_id INTO v_id FROM public.denuncias_acesso a
   WHERE a.sessao_hash = p_sessao_hash AND a.sessao_expira_em > now()
   FOR UPDATE;
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'sessao_invalida' USING ERRCODE = 'HRD24';
  END IF;
  UPDATE public.denuncias_acesso a SET sessao_expira_em = now() + interval '30 minutes'
   WHERE a.denuncia_id = v_id;
  RETURN v_id;
END;
$$;

-- ==============================================================================
-- B. RPCs do gestor
-- ==============================================================================

CREATE FUNCTION public.rpc_denuncias_listar(p_organization_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_eu uuid := public.denuncias_eu();
  v_r  jsonb;
BEGIN
  IF v_eu IS NULL THEN
    RAISE EXCEPTION 'sem_sessao' USING ERRCODE = '42501';
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'id', d.id, 'codigo', d.codigo, 'tipo', d.tipo,
           'resumo', CASE WHEN d.responsavel_id = v_eu THEN d.resumo ELSE NULL END,
           'estado', d.estado, 'gravidade', d.gravidade, 'origem', d.origem, 'anonima', d.anonima,
           'responsavel_id', d.responsavel_id, 'responsavel_nome', ru.name,
           'recebida_em', d.recebida_em, 'prazo_confirmar', d.prazo_confirmar,
           'prazo_seguimento', d.prazo_seguimento, 'confirmada_em', d.confirmada_em,
           'fechada_em', d.fechada_em,
           'mensagens_denunciante', coalesce(mm.n_den, 0), 'ultima_mensagem_de', mm.ultimo)
           ORDER BY d.recebida_em DESC, d.codigo DESC), '[]'::jsonb)
    INTO v_r
    FROM public.denuncias_visiveis(p_organization_id, v_eu, NULL) v
    JOIN public.denuncias d ON d.id = v.denuncia_id AND d.organization_id = p_organization_id
    LEFT JOIN public.anew_users ru ON ru.id = d.responsavel_id
    LEFT JOIN LATERAL (
      SELECT count(*) FILTER (WHERE m.autor = 'denunciante') AS n_den,
             (array_agg(m.autor ORDER BY m.seq DESC))[1] AS ultimo
        FROM public.denuncias_mensagens m WHERE m.denuncia_id = d.id) mm ON true;
  RETURN v_r;
END;
$$;

CREATE FUNCTION public.rpc_denuncias_por_confirmar(p_organization_id uuid)
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT count(*)::integer
    FROM public.denuncias_visiveis(p_organization_id, public.denuncias_eu(), NULL) v
    JOIN public.denuncias d ON d.id = v.denuncia_id
   WHERE d.organization_id = p_organization_id AND d.estado = 'recebida'
$$;

CREATE FUNCTION public.rpc_denuncia_abrir(p_organization_id uuid, p_denuncia_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_eu uuid := public.denuncias_eu();
  v_resp uuid;
BEGIN
  IF v_eu IS NULL THEN
    RAISE EXCEPTION 'sem_sessao' USING ERRCODE = '42501';
  END IF;
  IF p_denuncia_id IS NULL
     OR NOT EXISTS (SELECT 1 FROM public.denuncias_visiveis(p_organization_id, v_eu, p_denuncia_id)) THEN
    RAISE EXCEPTION 'nao_encontrada' USING ERRCODE = 'HRD09';
  END IF;
  SELECT d.responsavel_id INTO v_resp FROM public.denuncias d WHERE d.id = p_denuncia_id;
  -- Ler um caso que nao e meu fica no historico (no maximo uma vez por dia e pessoa).
  IF v_resp IS DISTINCT FROM v_eu AND NOT EXISTS (
       SELECT 1 FROM public.denuncias_eventos e
        WHERE e.denuncia_id = p_denuncia_id AND e.tipo = 'consultada' AND e.quem_user_id = v_eu
          AND e.criado_em > now() - interval '1 day') THEN
    PERFORM public.denuncias_evento(p_organization_id, p_denuncia_id, 'consultada', v_eu, NULL, NULL);
  END IF;
  RETURN public.denuncias_vista_gestor(p_denuncia_id) || jsonb_build_object('eu', v_eu);
END;
$$;

CREATE FUNCTION public.rpc_denuncia_confirmar_rececao(p_organization_id uuid, p_denuncia_id uuid,
                                                      p_mensagem text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_eu uuid := public.denuncias_eu();
  v_d  public.denuncias;
  v_t  text;
BEGIN
  v_d := public.denuncias_trancar(p_organization_id, p_denuncia_id, v_eu);
  IF v_d.estado <> 'recebida' THEN
    RAISE EXCEPTION 'transicao_invalida' USING ERRCODE = 'HRD01';
  END IF;
  UPDATE public.denuncias d SET estado = 'em_analise', confirmada_em = now() WHERE d.id = v_d.id;
  PERFORM public.denuncias_evento(v_d.organization_id, v_d.id, 'rececao_confirmada', v_eu, NULL, NULL);
  IF btrim(coalesce(p_mensagem, '')) <> '' THEN
    v_t := public.denuncias_texto_mensagem(p_mensagem);
    INSERT INTO public.denuncias_mensagens (organization_id, denuncia_id, autor, autor_user_id, texto)
    VALUES (v_d.organization_id, v_d.id, 'canal', v_eu, v_t);
    PERFORM public.denuncias_evento(v_d.organization_id, v_d.id, 'mensagem_enviada', v_eu, NULL, NULL);
  END IF;
  RETURN public.denuncias_vista_gestor(v_d.id) || jsonb_build_object('eu', v_eu);
END;
$$;

CREATE FUNCTION public.rpc_denuncia_gravidade(p_organization_id uuid, p_denuncia_id uuid, p_gravidade text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_eu uuid := public.denuncias_eu();
  v_d  public.denuncias;
BEGIN
  v_d := public.denuncias_trancar(p_organization_id, p_denuncia_id, v_eu);
  IF p_gravidade IS NULL OR p_gravidade NOT IN ('baixa', 'media', 'alta') THEN
    RAISE EXCEPTION 'dados_invalidos' USING ERRCODE = 'HRD23';
  END IF;
  IF p_gravidade <> v_d.gravidade THEN
    UPDATE public.denuncias d SET gravidade = p_gravidade WHERE d.id = v_d.id;
    PERFORM public.denuncias_evento(v_d.organization_id, v_d.id, 'gravidade_alterada', v_eu,
                                    jsonb_build_object('de', v_d.gravidade, 'para', p_gravidade), NULL);
  END IF;
  RETURN public.denuncias_vista_gestor(v_d.id) || jsonb_build_object('eu', v_eu);
END;
$$;

CREATE FUNCTION public.rpc_denuncia_avaliacao(p_organization_id uuid, p_denuncia_id uuid, p_texto text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_eu uuid := public.denuncias_eu();
  v_d  public.denuncias;
  v_t  text := nullif(btrim(coalesce(p_texto, '')), '');
BEGIN
  v_d := public.denuncias_trancar(p_organization_id, p_denuncia_id, v_eu);
  IF v_d.estado IN ('concluida', 'arquivada') THEN
    RAISE EXCEPTION 'fechada' USING ERRCODE = 'HRD08';
  END IF;
  IF length(v_t) > 2000 THEN
    RAISE EXCEPTION 'dados_invalidos' USING ERRCODE = 'HRD23';
  END IF;
  IF v_t IS DISTINCT FROM v_d.avaliacao_inicial THEN
    UPDATE public.denuncias d SET avaliacao_inicial = v_t WHERE d.id = v_d.id;
    PERFORM public.denuncias_evento(v_d.organization_id, v_d.id, 'avaliacao_alterada', v_eu, NULL, NULL);
  END IF;
  RETURN public.denuncias_vista_gestor(v_d.id) || jsonb_build_object('eu', v_eu);
END;
$$;

CREATE FUNCTION public.rpc_denuncia_atribuir(p_organization_id uuid, p_denuncia_id uuid, p_user uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_eu uuid := public.denuncias_eu();
  v_d  public.denuncias;
BEGIN
  v_d := public.denuncias_trancar(p_organization_id, p_denuncia_id, v_eu);
  IF p_user IS NULL THEN
    RAISE EXCEPTION 'nao_e_responsavel' USING ERRCODE = 'HRD14';
  END IF;
  IF p_user IS DISTINCT FROM v_d.responsavel_id THEN
    -- O gatilho denuncias_regras recusa visado (HRD02), conflito (HRD03) e nao elegivel (HRD14).
    UPDATE public.denuncias d SET responsavel_id = p_user WHERE d.id = v_d.id;
    PERFORM public.denuncias_evento(v_d.organization_id, v_d.id, 'responsavel_atribuido', v_eu,
                                    jsonb_build_object('alvo', p_user), NULL);
    IF p_user = v_eu THEN
      PERFORM public.denuncias_auditar(v_d.organization_id, 'autoatribuicao', v_eu, v_eu, v_d.id, NULL);
    END IF;
  END IF;
  RETURN public.denuncias_vista_gestor(v_d.id) || jsonb_build_object('eu', v_eu);
END;
$$;

CREATE FUNCTION public.rpc_denuncia_impedir(p_organization_id uuid, p_denuncia_id uuid, p_user uuid, p_motivo text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_eu uuid := public.denuncias_eu();
  v_d  public.denuncias;
BEGIN
  v_d := public.denuncias_trancar(p_organization_id, p_denuncia_id, v_eu);
  IF p_user IS NULL OR p_motivo IS NULL OR p_motivo NOT IN ('visado', 'conflito')
     OR (p_motivo = 'conflito' AND p_user <> v_eu)
     OR NOT public.denuncias_membro_ativo(v_d.organization_id, p_user) THEN
    RAISE EXCEPTION 'impedimento_invalido' USING ERRCODE = 'HRD15';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.denuncias_impedidos i
                  WHERE i.denuncia_id = v_d.id AND i.anew_user_id = p_user AND i.retirado_em IS NULL) THEN
    INSERT INTO public.denuncias_impedidos (organization_id, denuncia_id, anew_user_id, motivo, registado_por)
    VALUES (v_d.organization_id, v_d.id, p_user, p_motivo, v_eu);
    IF v_d.responsavel_id = p_user THEN
      UPDATE public.denuncias d SET responsavel_id = NULL WHERE d.id = v_d.id;
      PERFORM public.denuncias_evento(v_d.organization_id, v_d.id, 'responsavel_libertado', v_eu,
                                      jsonb_build_object('alvo', p_user), NULL);
    END IF;
    PERFORM public.denuncias_evento(v_d.organization_id, v_d.id,
                                    CASE p_motivo WHEN 'conflito' THEN 'conflito_declarado' ELSE 'visado_registado' END,
                                    v_eu, jsonb_build_object('alvo', p_user), NULL);
    PERFORM public.denuncias_auditar(v_d.organization_id,
                                     CASE p_motivo WHEN 'conflito' THEN 'conflito_declarado' ELSE 'visado_registado' END,
                                     v_eu, p_user, v_d.id, NULL);
  END IF;

  -- Quem se impediu a si proprio deixa de ver o caso.
  IF p_user = v_eu THEN
    RETURN jsonb_build_object('impedido', true, 'id', v_d.id);
  END IF;
  RETURN public.denuncias_vista_gestor(v_d.id) || jsonb_build_object('eu', v_eu);
END;
$$;

CREATE FUNCTION public.rpc_denuncia_pedir_informacao(p_organization_id uuid, p_denuncia_id uuid, p_texto text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_eu uuid := public.denuncias_eu();
  v_d  public.denuncias;
  v_t  text;
BEGIN
  v_d := public.denuncias_trancar(p_organization_id, p_denuncia_id, v_eu);
  IF v_d.estado <> 'em_analise' THEN
    RAISE EXCEPTION 'transicao_invalida' USING ERRCODE = 'HRD01';
  END IF;
  v_t := public.denuncias_texto_mensagem(p_texto);
  INSERT INTO public.denuncias_mensagens (organization_id, denuncia_id, autor, autor_user_id, pedido_informacao, texto)
  VALUES (v_d.organization_id, v_d.id, 'canal', v_eu, true, v_t);
  UPDATE public.denuncias d SET estado = 'mais_info' WHERE d.id = v_d.id;
  PERFORM public.denuncias_evento(v_d.organization_id, v_d.id, 'informacao_pedida', v_eu, NULL, NULL);
  RETURN public.denuncias_vista_gestor(v_d.id) || jsonb_build_object('eu', v_eu);
END;
$$;

CREATE FUNCTION public.rpc_denuncia_mensagem(p_organization_id uuid, p_denuncia_id uuid, p_texto text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_eu uuid := public.denuncias_eu();
  v_d  public.denuncias;
  v_t  text;
BEGIN
  v_d := public.denuncias_trancar(p_organization_id, p_denuncia_id, v_eu);
  IF v_d.estado IN ('concluida', 'arquivada') THEN
    RAISE EXCEPTION 'fechada' USING ERRCODE = 'HRD08';
  END IF;
  IF v_d.estado = 'recebida' THEN
    RAISE EXCEPTION 'confirmar_primeiro' USING ERRCODE = 'HRD10';
  END IF;
  v_t := public.denuncias_texto_mensagem(p_texto);
  INSERT INTO public.denuncias_mensagens (organization_id, denuncia_id, autor, autor_user_id, texto)
  VALUES (v_d.organization_id, v_d.id, 'canal', v_eu, v_t);
  PERFORM public.denuncias_evento(v_d.organization_id, v_d.id, 'mensagem_enviada', v_eu, NULL, NULL);
  RETURN public.denuncias_vista_gestor(v_d.id) || jsonb_build_object('eu', v_eu);
END;
$$;

CREATE FUNCTION public.rpc_denuncia_nota(p_organization_id uuid, p_denuncia_id uuid, p_texto text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_eu uuid := public.denuncias_eu();
  v_d  public.denuncias;
  v_t  text;
BEGIN
  v_d := public.denuncias_trancar(p_organization_id, p_denuncia_id, v_eu);
  v_t := public.denuncias_texto_mensagem(p_texto);
  INSERT INTO public.denuncias_notas (organization_id, denuncia_id, autor_user_id, texto)
  VALUES (v_d.organization_id, v_d.id, v_eu, v_t);
  PERFORM public.denuncias_evento(v_d.organization_id, v_d.id, 'nota_adicionada', v_eu, NULL, NULL);
  RETURN public.denuncias_vista_gestor(v_d.id) || jsonb_build_object('eu', v_eu);
END;
$$;

CREATE FUNCTION public.rpc_denuncia_concluir(p_organization_id uuid, p_denuncia_id uuid, p_resultado text,
                                             p_medidas text, p_fundamentacao text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_eu  uuid := public.denuncias_eu();
  v_d   public.denuncias;
  v_med text := nullif(btrim(coalesce(p_medidas, '')), '');
  v_fun text := btrim(coalesce(p_fundamentacao, ''));
BEGIN
  v_d := public.denuncias_trancar(p_organization_id, p_denuncia_id, v_eu);
  IF v_d.estado NOT IN ('em_analise', 'mais_info') THEN
    RAISE EXCEPTION 'transicao_invalida' USING ERRCODE = 'HRD01';
  END IF;
  IF btrim(coalesce(p_resultado, '')) = '' THEN
    RAISE EXCEPTION 'resultado_em_falta' USING ERRCODE = 'HRD06';
  END IF;
  IF p_resultado NOT IN ('procedente', 'parcialmente_procedente', 'improcedente', 'sem_competencia') THEN
    RAISE EXCEPTION 'dados_invalidos' USING ERRCODE = 'HRD23';
  END IF;
  IF v_fun = '' THEN
    RAISE EXCEPTION 'fundamentacao_em_falta' USING ERRCODE = 'HRD07';
  END IF;
  IF length(v_fun) > 4000 OR length(v_med) > 4000 THEN
    RAISE EXCEPTION 'dados_invalidos' USING ERRCODE = 'HRD23';
  END IF;
  UPDATE public.denuncias d
     SET estado = 'concluida', resultado = p_resultado, medidas = v_med, fundamentacao = v_fun,
         decidida_em = now(), fechada_em = now(),
         conservar_ate = (public.denuncias_hoje() + interval '5 years')::date
   WHERE d.id = v_d.id;
  PERFORM public.denuncias_evento(v_d.organization_id, v_d.id, 'concluida', v_eu,
                                  jsonb_build_object('resultado', p_resultado), NULL);
  RETURN public.denuncias_vista_gestor(v_d.id) || jsonb_build_object('eu', v_eu);
END;
$$;

CREATE FUNCTION public.rpc_denuncia_arquivar(p_organization_id uuid, p_denuncia_id uuid, p_motivo text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_eu uuid := public.denuncias_eu();
  v_d  public.denuncias;
  v_m  text := btrim(coalesce(p_motivo, ''));
BEGIN
  v_d := public.denuncias_trancar(p_organization_id, p_denuncia_id, v_eu);
  IF length(v_m) < 3 THEN
    RAISE EXCEPTION 'motivo_curto' USING ERRCODE = 'HRD05';
  END IF;
  IF length(v_m) > 2000 THEN
    RAISE EXCEPTION 'dados_invalidos' USING ERRCODE = 'HRD23';
  END IF;
  IF v_d.estado NOT IN ('recebida', 'em_analise', 'mais_info') THEN
    RAISE EXCEPTION 'transicao_invalida' USING ERRCODE = 'HRD01';
  END IF;
  UPDATE public.denuncias d
     SET estado = 'arquivada', motivo_arquivo = v_m, fechada_em = now(),
         conservar_ate = (public.denuncias_hoje() + interval '5 years')::date
   WHERE d.id = v_d.id;
  PERFORM public.denuncias_evento(v_d.organization_id, v_d.id, 'arquivada', v_eu,
                                  jsonb_build_object('motivo', left(v_m, 300)), NULL);
  RETURN public.denuncias_vista_gestor(v_d.id) || jsonb_build_object('eu', v_eu);
END;
$$;

CREATE FUNCTION public.rpc_denuncia_reabrir(p_organization_id uuid, p_denuncia_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_eu uuid := public.denuncias_eu();
  v_d  public.denuncias;
BEGIN
  v_d := public.denuncias_trancar(p_organization_id, p_denuncia_id, v_eu);
  IF v_d.estado NOT IN ('concluida', 'arquivada') THEN
    RAISE EXCEPTION 'transicao_invalida' USING ERRCODE = 'HRD01';
  END IF;
  UPDATE public.denuncias d
     SET estado = 'em_analise', resultado = NULL, medidas = NULL, fundamentacao = NULL, decidida_em = NULL,
         motivo_arquivo = NULL, fechada_em = NULL, conservar_ate = NULL,
         confirmada_em = coalesce(d.confirmada_em, now())
   WHERE d.id = v_d.id;
  PERFORM public.denuncias_evento(v_d.organization_id, v_d.id, 'reaberta', v_eu, NULL, NULL);
  RETURN public.denuncias_vista_gestor(v_d.id) || jsonb_build_object('eu', v_eu);
END;
$$;

CREATE FUNCTION public.rpc_denuncia_identidade_ver(p_organization_id uuid, p_denuncia_id uuid, p_motivo text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_eu uuid := public.denuncias_eu();
  v_d  public.denuncias;
  v_i  public.denuncias_identidade;
  v_m  text := btrim(coalesce(p_motivo, ''));
BEGIN
  v_d := public.denuncias_trancar(p_organization_id, p_denuncia_id, v_eu);
  IF v_d.anonima THEN
    RAISE EXCEPTION 'anonima' USING ERRCODE = 'HRD11';
  END IF;
  IF length(v_m) < 3 THEN
    RAISE EXCEPTION 'motivo_identidade' USING ERRCODE = 'HRD12';
  END IF;
  SELECT i.* INTO v_i FROM public.denuncias_identidade i WHERE i.denuncia_id = v_d.id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'anonima' USING ERRCODE = 'HRD11';
  END IF;
  IF v_i.so_responsavel AND v_d.responsavel_id IS DISTINCT FROM v_eu THEN
    RAISE EXCEPTION 'so_responsavel' USING ERRCODE = 'HRD16';
  END IF;
  -- O registo vem ANTES de devolver, na mesma transaccao.
  PERFORM public.denuncias_evento(v_d.organization_id, v_d.id, 'identidade_vista', v_eu,
                                  jsonb_build_object('motivo', left(v_m, 300)), NULL);
  RETURN jsonb_build_object('nome', v_i.nome, 'email', v_i.email, 'telefone', v_i.telefone,
                            'pode_contactar', v_i.pode_contactar, 'so_responsavel', v_i.so_responsavel,
                            'pessoa_id', v_i.pessoa_id, 'da_aplicacao', v_i.anew_user_id IS NOT NULL);
END;
$$;

CREATE FUNCTION public.rpc_denuncia_exportar(p_organization_id uuid, p_denuncia_id uuid, p_motivo text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_eu uuid := public.denuncias_eu();
  v_d  public.denuncias;
  v_m  text := btrim(coalesce(p_motivo, ''));
BEGIN
  v_d := public.denuncias_trancar(p_organization_id, p_denuncia_id, v_eu);
  IF v_d.responsavel_id IS DISTINCT FROM v_eu THEN
    RAISE EXCEPTION 'so_responsavel' USING ERRCODE = 'HRD16';
  END IF;
  IF length(v_m) < 3 THEN
    RAISE EXCEPTION 'motivo_identidade' USING ERRCODE = 'HRD12';
  END IF;
  PERFORM public.denuncias_evento(v_d.organization_id, v_d.id, 'exportada', v_eu,
                                  jsonb_build_object('motivo', left(v_m, 300)), NULL);
  RETURN public.denuncias_vista_gestor(v_d.id) || jsonb_build_object('exportada_por', v_eu, 'exportada_em', now());
END;
$$;

CREATE FUNCTION public.rpc_denuncias_responsaveis(p_organization_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_eu   uuid := public.denuncias_eu();
  v_conf boolean;
  v_el   boolean;
  v_r    jsonb;
BEGIN
  IF v_eu IS NULL THEN
    RAISE EXCEPTION 'sem_sessao' USING ERRCODE = '42501';
  END IF;
  v_conf := public.has_anew_permission_in_org(auth.uid(), 'denuncias.configurar', p_organization_id);
  v_el := EXISTS (SELECT 1 FROM public.denuncias_elegiveis(p_organization_id) e WHERE e.anew_user_id = v_eu);
  IF NOT v_conf AND NOT v_el THEN
    RAISE EXCEPTION 'sem_permissao' USING ERRCODE = 'HRD17';
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'anew_user_id', r.anew_user_id, 'nome', u.name, 'ativo', r.ativo,
           'pode_tratar', e.anew_user_id IS NOT NULL, 'designado_em', r.designado_em)
           ORDER BY u.name), '[]'::jsonb)
    INTO v_r
    FROM public.denuncias_responsaveis r
    JOIN public.anew_users u ON u.id = r.anew_user_id
    LEFT JOIN public.denuncias_elegiveis(p_organization_id) e ON e.anew_user_id = r.anew_user_id
   WHERE r.organization_id = p_organization_id
     AND (v_conf OR e.anew_user_id IS NOT NULL);
  RETURN v_r;
END;
$$;

CREATE FUNCTION public.rpc_denuncias_canal_ler(p_organization_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_eu   uuid := public.denuncias_eu();
  v_conf boolean;
  v_c    public.denuncias_canal;
  v_orfaos integer := NULL;
BEGIN
  IF v_eu IS NULL THEN
    RAISE EXCEPTION 'sem_sessao' USING ERRCODE = '42501';
  END IF;
  v_conf := public.has_anew_permission_in_org(auth.uid(), 'denuncias.configurar', p_organization_id);
  IF NOT v_conf AND NOT EXISTS (SELECT 1 FROM public.denuncias_elegiveis(p_organization_id) e
                                 WHERE e.anew_user_id = v_eu) THEN
    RAISE EXCEPTION 'sem_permissao' USING ERRCODE = 'HRD17';
  END IF;
  SELECT c.* INTO v_c FROM public.denuncias_canal c WHERE c.organization_id = p_organization_id;
  IF v_conf THEN
    -- Casos abertos sem nenhum elegivel nao impedido: so a contagem, nunca o conteudo.
    SELECT count(*)::integer INTO v_orfaos
      FROM public.denuncias d
     WHERE d.organization_id = p_organization_id
       AND d.estado NOT IN ('concluida', 'arquivada')
       AND NOT EXISTS (
         SELECT 1 FROM public.denuncias_elegiveis(p_organization_id) e
          WHERE NOT EXISTS (SELECT 1 FROM public.denuncias_impedidos i
                             WHERE i.denuncia_id = d.id AND i.anew_user_id = e.anew_user_id
                               AND i.retirado_em IS NULL));
  END IF;
  RETURN jsonb_build_object('configurado', v_c.organization_id IS NOT NULL,
                            'ativo', coalesce(v_c.ativo, false), 'slug_publico', v_c.slug_publico,
                            'pode_configurar', v_conf, 'casos_sem_quem_trate', v_orfaos);
END;
$$;

CREATE FUNCTION public.rpc_denuncias_canal_guardar(p_organization_id uuid, p_ativo boolean, p_slug text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_eu   uuid := public.denuncias_eu();
  v_slug text := lower(btrim(coalesce(p_slug, '')));
BEGIN
  IF v_eu IS NULL THEN
    RAISE EXCEPTION 'sem_sessao' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_anew_permission_in_org(auth.uid(), 'denuncias.configurar', p_organization_id) THEN
    RAISE EXCEPTION 'sem_permissao' USING ERRCODE = 'HRD17';
  END IF;
  IF p_ativo IS NULL OR v_slug !~ '^[a-z0-9]([a-z0-9-]{2,38})[a-z0-9]$' THEN
    RAISE EXCEPTION 'dados_invalidos' USING ERRCODE = 'HRD23';
  END IF;
  -- Ligar sem ninguem para tratar mandava denuncias para o vazio.
  IF p_ativo AND NOT EXISTS (SELECT 1 FROM public.denuncias_elegiveis(p_organization_id)) THEN
    RAISE EXCEPTION 'sem_responsaveis' USING ERRCODE = 'HRD28';
  END IF;
  BEGIN
    INSERT INTO public.denuncias_canal AS c (organization_id, ativo, slug_publico, atualizado_por, atualizado_em)
    VALUES (p_organization_id, p_ativo, v_slug, v_eu, now())
    ON CONFLICT (organization_id) DO UPDATE
      SET ativo = EXCLUDED.ativo, slug_publico = EXCLUDED.slug_publico,
          atualizado_por = EXCLUDED.atualizado_por, atualizado_em = EXCLUDED.atualizado_em;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'slug_em_uso' USING ERRCODE = 'HRD18';
  END;
  PERFORM public.denuncias_auditar(p_organization_id, 'canal_alterado', v_eu, NULL, NULL,
                                   jsonb_build_object('ativo', p_ativo, 'slug_publico', v_slug));
  RETURN public.rpc_denuncias_canal_ler(p_organization_id);
END;
$$;

CREATE FUNCTION public.rpc_denuncias_responsavel_designar(p_organization_id uuid, p_user uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_eu uuid := public.denuncias_eu();
BEGIN
  IF v_eu IS NULL THEN
    RAISE EXCEPTION 'sem_sessao' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_anew_permission_in_org(auth.uid(), 'denuncias.configurar', p_organization_id) THEN
    RAISE EXCEPTION 'sem_permissao' USING ERRCODE = 'HRD17';
  END IF;
  IF p_user IS NULL OR NOT public.denuncias_membro_ativo(p_organization_id, p_user) THEN
    RAISE EXCEPTION 'dados_invalidos' USING ERRCODE = 'HRD23';
  END IF;
  -- Quem e visado num caso aberto nao entra para o canal.
  IF EXISTS (SELECT 1 FROM public.denuncias_impedidos i
               JOIN public.denuncias d ON d.id = i.denuncia_id
              WHERE i.organization_id = p_organization_id AND i.anew_user_id = p_user
                AND i.motivo = 'visado' AND i.retirado_em IS NULL
                AND d.estado NOT IN ('concluida', 'arquivada')) THEN
    RAISE EXCEPTION 'visado_em_caso_aberto' USING ERRCODE = 'HRD21';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.denuncias_responsaveis r
                  WHERE r.organization_id = p_organization_id AND r.anew_user_id = p_user AND r.ativo) THEN
    INSERT INTO public.denuncias_responsaveis AS r (organization_id, anew_user_id, ativo, designado_por, designado_em)
    VALUES (p_organization_id, p_user, true, v_eu, now())
    ON CONFLICT (organization_id, anew_user_id) DO UPDATE
      SET ativo = true, designado_por = EXCLUDED.designado_por, designado_em = EXCLUDED.designado_em,
          removido_por = NULL, removido_em = NULL;
    PERFORM public.denuncias_auditar(p_organization_id, 'responsavel_designado', v_eu, p_user, NULL, NULL);
  END IF;
  RETURN public.rpc_denuncias_responsaveis(p_organization_id);
END;
$$;

CREATE FUNCTION public.rpc_denuncias_responsavel_remover(p_organization_id uuid, p_user uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_eu uuid := public.denuncias_eu();
  v_id uuid;
BEGIN
  IF v_eu IS NULL THEN
    RAISE EXCEPTION 'sem_sessao' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_anew_permission_in_org(auth.uid(), 'denuncias.configurar', p_organization_id) THEN
    RAISE EXCEPTION 'sem_permissao' USING ERRCODE = 'HRD17';
  END IF;
  UPDATE public.denuncias_responsaveis r SET ativo = false, removido_por = v_eu, removido_em = now()
   WHERE r.organization_id = p_organization_id AND r.anew_user_id = p_user AND r.ativo;
  IF FOUND THEN
    -- Os casos abertos dele voltam a fila.
    FOR v_id IN
      SELECT d.id FROM public.denuncias d
       WHERE d.organization_id = p_organization_id AND d.responsavel_id = p_user
         AND d.estado NOT IN ('concluida', 'arquivada')
       FOR UPDATE
    LOOP
      UPDATE public.denuncias d SET responsavel_id = NULL WHERE d.id = v_id;
      PERFORM public.denuncias_evento(p_organization_id, v_id, 'responsavel_libertado', v_eu,
                                      jsonb_build_object('alvo', p_user), NULL);
    END LOOP;
    PERFORM public.denuncias_auditar(p_organization_id, 'responsavel_removido', v_eu, p_user, NULL, NULL);
  END IF;
  RETURN public.rpc_denuncias_responsaveis(p_organization_id);
END;
$$;

CREATE FUNCTION public.rpc_denuncia_impedimento_retirar(p_organization_id uuid, p_denuncia_id uuid, p_user uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_eu uuid := public.denuncias_eu();
  v_i  uuid;
BEGIN
  IF v_eu IS NULL THEN
    RAISE EXCEPTION 'sem_sessao' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_anew_permission_in_org(auth.uid(), 'denuncias.configurar', p_organization_id) THEN
    RAISE EXCEPTION 'sem_permissao' USING ERRCODE = 'HRD17';
  END IF;
  -- Ninguem retira o proprio impedimento; so o 'visado' registado por um responsavel
  -- (o que o denunciante indicou e os conflitos ficam).
  SELECT i.id INTO v_i FROM public.denuncias_impedidos i
   WHERE i.organization_id = p_organization_id AND i.denuncia_id = p_denuncia_id
     AND i.anew_user_id = p_user AND i.retirado_em IS NULL
     AND i.motivo = 'visado' AND i.registado_por IS NOT NULL
   FOR UPDATE;
  IF v_i IS NULL OR p_user = v_eu THEN
    RAISE EXCEPTION 'impedimento_invalido' USING ERRCODE = 'HRD15';
  END IF;
  UPDATE public.denuncias_impedidos i SET retirado_em = now(), retirado_por = v_eu WHERE i.id = v_i;
  PERFORM public.denuncias_evento(p_organization_id, p_denuncia_id, 'impedimento_retirado', v_eu,
                                  jsonb_build_object('alvo', p_user), NULL);
  PERFORM public.denuncias_auditar(p_organization_id, 'impedimento_retirado', v_eu, p_user, p_denuncia_id, NULL);
  RETURN jsonb_build_object('retirado', true);
END;
$$;

CREATE FUNCTION public.rpc_denuncias_canal_auditoria(p_organization_id uuid, p_limite integer DEFAULT 200)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_eu   uuid := public.denuncias_eu();
  v_conf boolean;
  v_r    jsonb;
BEGIN
  IF v_eu IS NULL THEN
    RAISE EXCEPTION 'sem_sessao' USING ERRCODE = '42501';
  END IF;
  v_conf := public.has_anew_permission_in_org(auth.uid(), 'denuncias.configurar', p_organization_id);
  IF NOT v_conf AND NOT EXISTS (SELECT 1 FROM public.denuncias_elegiveis(p_organization_id) e
                                 WHERE e.anew_user_id = v_eu) THEN
    RAISE EXCEPTION 'sem_permissao' USING ERRCODE = 'HRD17';
  END IF;
  SELECT coalesce(jsonb_agg(x.o ORDER BY x.seq DESC), '[]'::jsonb) INTO v_r
    FROM (
      SELECT a.seq, jsonb_build_object('tipo', a.tipo, 'quem_id', a.quem_user_id, 'quem_nome', qu.name,
                                       'alvo_id', a.alvo_user_id, 'alvo_nome', au.name,
                                       'codigo', d.codigo, 'dados', a.dados, 'em', a.criado_em) AS o
        FROM public.denuncias_canal_auditoria a
        JOIN public.anew_users qu ON qu.id = a.quem_user_id
        LEFT JOIN public.anew_users au ON au.id = a.alvo_user_id
        LEFT JOIN public.denuncias d ON d.id = a.denuncia_id
       WHERE a.organization_id = p_organization_id
         -- O visado nao fica a saber, por aqui, que foi indicado num caso.
         AND (a.alvo_user_id IS DISTINCT FROM v_eu OR a.tipo NOT IN ('visado_registado', 'impedimento_retirado'))
       ORDER BY a.seq DESC
       LIMIT greatest(1, least(coalesce(p_limite, 200), 500))) x;
  RETURN v_r;
END;
$$;

-- ---- Denunciante identificado ("As minhas") ---------------------------------

CREATE FUNCTION public.rpc_denuncias_minhas(p_organization_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_eu uuid := public.denuncias_eu();
  v_r  jsonb;
BEGIN
  IF v_eu IS NULL THEN
    RAISE EXCEPTION 'sem_sessao' USING ERRCODE = '42501';
  END IF;
  SELECT coalesce(jsonb_agg(public.denuncias_vista_denunciante(d.id) ORDER BY d.recebida_em DESC, d.codigo DESC),
                  '[]'::jsonb)
    INTO v_r
    FROM public.denuncias_identidade i
    JOIN public.denuncias d ON d.id = i.denuncia_id AND d.organization_id = i.organization_id
   WHERE i.organization_id = p_organization_id AND i.anew_user_id = v_eu;
  RETURN v_r;
END;
$$;

CREATE FUNCTION public.rpc_denuncia_minha_responder(p_organization_id uuid, p_denuncia_id uuid, p_texto text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_eu uuid := public.denuncias_eu();
  v_d  public.denuncias;
  v_t  text;
BEGIN
  IF v_eu IS NULL THEN
    RAISE EXCEPTION 'sem_sessao' USING ERRCODE = '42501';
  END IF;
  SELECT d.* INTO v_d
    FROM public.denuncias d
    JOIN public.denuncias_identidade i ON i.denuncia_id = d.id
   WHERE d.id = p_denuncia_id AND d.organization_id = p_organization_id AND i.anew_user_id = v_eu
   FOR UPDATE OF d;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'nao_encontrada' USING ERRCODE = 'HRD09';
  END IF;
  IF v_d.estado IN ('concluida', 'arquivada') THEN
    RAISE EXCEPTION 'fechada' USING ERRCODE = 'HRD08';
  END IF;
  v_t := public.denuncias_texto_mensagem(p_texto);
  IF (SELECT count(*) FROM public.denuncias_mensagens m
       WHERE m.denuncia_id = v_d.id AND m.autor = 'denunciante') >= 50 THEN
    RAISE EXCEPTION 'limite_mensagens' USING ERRCODE = 'HRD25';
  END IF;
  INSERT INTO public.denuncias_mensagens (organization_id, denuncia_id, autor, texto)
  VALUES (v_d.organization_id, v_d.id, 'denunciante', v_t);
  IF v_d.estado = 'mais_info' THEN
    UPDATE public.denuncias d SET estado = 'em_analise' WHERE d.id = v_d.id;
  END IF;
  PERFORM public.denuncias_evento(v_d.organization_id, v_d.id, 'denunciante_respondeu', NULL, NULL, NULL);
  RETURN public.denuncias_vista_denunciante(v_d.id);
END;
$$;

-- ==============================================================================
-- C. RPCs de servico (so a Edge canal-denuncias, com a chave de servico)
-- ==============================================================================

CREATE FUNCTION public.rpc_denuncia_publica_canal(p_slug text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_org  uuid;
  v_nome text;
BEGIN
  SELECT c.organization_id, o.name INTO v_org, v_nome
    FROM public.denuncias_canal c
    JOIN public.anew_organizations o ON o.id = c.organization_id
   WHERE c.slug_publico = lower(btrim(coalesce(p_slug, ''))) AND c.ativo AND o.deleted_at IS NULL;
  IF v_org IS NULL THEN
    RETURN jsonb_build_object('ativo', false);
  END IF;
  -- A lista de responsaveis serve para o denunciante indicar quem esta envolvido (D3).
  -- organization_id so serve a Edge (sal do HMAC do PIN em entrar); nao sai para o browser.
  RETURN jsonb_build_object(
    'ativo', true, 'organization_id', v_org, 'organizacao', v_nome,
    'responsaveis', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', e.anew_user_id, 'nome', u.name) ORDER BY u.name)
        FROM public.denuncias_elegiveis(v_org) e JOIN public.anew_users u ON u.id = e.anew_user_id), '[]'::jsonb));
END;
$$;

-- Limite dos pedidos publicos que nao tocam num caso pelo codigo: ver o canal e
-- ler/responder com sessao. Por IP (HMAC) e global; sem chave valida so o global.
-- Nunca pela sessao (o hash dela liga-se a uma denuncia). Atomico, true = dentro.
CREATE FUNCTION public.rpc_denuncia_publica_limitar(p_balde text, p_chave_ip text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_ip_ok     boolean := true;
  v_global_ok boolean;
  v_max_ip    integer;
BEGIN
  IF p_balde IS NULL OR p_balde NOT IN ('canal', 'sessao') THEN
    RAISE EXCEPTION 'dados_invalidos' USING ERRCODE = 'HRD23';
  END IF;
  v_max_ip := CASE p_balde WHEN 'canal' THEN 60 ELSE 120 END;
  IF p_chave_ip IS NOT NULL AND p_chave_ip ~ '^[0-9a-f]{64}$' THEN
    v_ip_ok := public.denuncias_limite_consumir(p_balde, 'ip:' || p_chave_ip, v_max_ip);
  END IF;
  -- Os dois contam sempre (variaveis, nunca um AND que pudesse saltar o segundo).
  v_global_ok := public.denuncias_limite_consumir(p_balde, 'global', 3000);
  RETURN v_ip_ok AND v_global_ok;
END;
$$;

-- Gasta o limite de criar e reserva o codigo seguinte para o nonce da Edge
-- (p_reserva_hash, 64 hex, gerado por pedido). So a _criar com o MESMO nonce o usa.
CREATE FUNCTION public.rpc_denuncia_publica_reservar_codigo(p_slug text, p_chave_ip text, p_reserva_hash text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_org    uuid;
  v_codigo text;
BEGIN
  IF p_reserva_hash IS NULL OR p_reserva_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'dados_invalidos' USING ERRCODE = 'HRD23';
  END IF;
  SELECT c.organization_id INTO v_org FROM public.denuncias_canal c
   WHERE c.slug_publico = lower(btrim(coalesce(p_slug, ''))) AND c.ativo;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'canal_inativo' USING ERRCODE = 'HRD19';
  END IF;
  IF NOT public.denuncias_limite_publico('criar', v_org, p_chave_ip) THEN
    RAISE EXCEPTION 'limite_excedido' USING ERRCODE = 'HRD22';
  END IF;
  v_codigo := public.denuncias_proximo_codigo(v_org);
  INSERT INTO public.denuncias_reservas (organization_id, codigo, reserva_hash, hora)
  VALUES (v_org, v_codigo, p_reserva_hash, date_trunc('hour', now()));
  RETURN jsonb_build_object('organization_id', v_org, 'codigo', v_codigo);
END;
$$;

CREATE FUNCTION public.rpc_denuncia_publica_criar(p_slug text, p_codigo text, p_reserva_hash text, p_dados jsonb,
                                                  p_pin_hash text, p_identidade jsonb, p_auth_user_id uuid,
                                                  p_impedidos uuid[])
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  k_chaves constant text[] := ARRAY['anonima', 'tipo', 'descricao', 'quando', 'onde', 'envolvidos',
                                    'ainda_acontece', 'testemunhas', 'ja_reportado', 'boa_fe'];
  v_c      public.denuncias_canal;
  v_codigo text := upper(regexp_replace(coalesce(p_codigo, ''), '\s', '', 'g'));
  v_anon   boolean;
  v_em     timestamptz;
  v_tipo   text;
  v_desc   text;
  v_id     uuid;
  v_nome   text;
  v_email  text;
  v_tel    text;
  v_pessoa uuid;
  v_user   uuid;
  v_boa_fe boolean;
  v_contac boolean := false;
  v_so_resp boolean := true;
BEGIN
  SELECT c.* INTO v_c FROM public.denuncias_canal c
   WHERE c.slug_publico = lower(btrim(coalesce(p_slug, ''))) AND c.ativo
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'canal_inativo' USING ERRCODE = 'HRD19';
  END IF;

  -- Codigo: SO com reserva viva desta organizacao e do mesmo nonce (a reserva e
  -- que gastou o limite de criar). Apaga-se aqui: nunca serve duas vezes, e um
  -- codigo nunca reservado (por exemplo do ano anterior) nao cria nada. Se a
  -- criacao falhar mais abaixo, a transaccao desfaz tambem o DELETE.
  IF v_codigo !~ '^DEN-[0-9]{4}-[0-9]{4,6}$'
     OR p_reserva_hash IS NULL OR p_reserva_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'codigo_invalido' USING ERRCODE = 'HRD26';
  END IF;
  DELETE FROM public.denuncias_reservas r
   WHERE r.organization_id = v_c.organization_id AND r.codigo = v_codigo
     AND r.reserva_hash = p_reserva_hash
     AND r.hora >= date_trunc('hour', now()) - interval '1 hour';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'codigo_invalido' USING ERRCODE = 'HRD26';
  END IF;

  IF p_pin_hash IS NULL OR p_pin_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'dados_invalidos' USING ERRCODE = 'HRD23';
  END IF;

  -- Formulario (= formulario.ts): so as chaves conhecidas.
  IF p_dados IS NULL OR jsonb_typeof(p_dados) <> 'object' OR octet_length(p_dados::text) > 20000
     OR EXISTS (SELECT 1 FROM jsonb_object_keys(p_dados) k WHERE NOT (k = ANY (k_chaves))) THEN
    RAISE EXCEPTION 'dados_invalidos' USING ERRCODE = 'HRD23';
  END IF;
  -- O modo e OBRIGATORIO e booleano: sem ele recusa-se (HRD23) em vez de passar
  -- a anonima em silencio e deitar fora a identidade de quem se identificou. A
  -- Edge envia-o sempre (modo "anonima" -> true; "identificada" -> false).
  IF jsonb_typeof(p_dados -> 'anonima') IS DISTINCT FROM 'boolean' THEN
    RAISE EXCEPTION 'dados_invalidos' USING ERRCODE = 'HRD23';
  END IF;
  v_anon := (p_dados ->> 'anonima')::boolean;
  -- O instante de TUDO o que esta funcao grava ligado ao caso: ao dia numa anonima.
  v_em := public.denuncias_instante(v_anon);
  -- Os booleanos so se convertem depois de confirmado o tipo (CASE, nunca OR).
  IF jsonb_typeof(p_dados -> 'boa_fe') IS DISTINCT FROM 'boolean' THEN
    RAISE EXCEPTION 'dados_invalidos' USING ERRCODE = 'HRD23';
  END IF;
  v_boa_fe := (p_dados ->> 'boa_fe')::boolean;
  v_tipo := public.denuncias_texto(p_dados, 'tipo', 40);
  v_desc := public.denuncias_texto(p_dados, 'descricao', 4000);
  IF v_tipo IS NULL OR v_tipo NOT IN ('assedio', 'discriminacao', 'corrupcao', 'fraude', 'seguranca',
                                      'dados', 'conflito', 'outro')
     OR v_desc IS NULL OR length(v_desc) < 30
     OR coalesce(length(public.denuncias_texto(p_dados, 'quando', 200)), 0) < 2
     OR coalesce(p_dados ->> 'ainda_acontece', 'nao_sei') NOT IN ('sim', 'nao', 'nao_sei')
     OR coalesce(p_dados ->> 'testemunhas', 'nao_sei') NOT IN ('sim', 'nao', 'nao_sei')
     OR NOT v_boa_fe THEN
    RAISE EXCEPTION 'dados_invalidos' USING ERRCODE = 'HRD23';
  END IF;

  -- Identidade: so numa identificada. Numa anonima, p_identidade e p_auth_user_id
  -- sao DESCARTADOS (nunca chegam a nenhuma tabela).
  IF NOT v_anon THEN
    IF p_identidade IS NOT NULL AND jsonb_typeof(p_identidade) <> 'object' THEN
      RAISE EXCEPTION 'dados_invalidos' USING ERRCODE = 'HRD23';
    END IF;
    v_tel := public.denuncias_texto(p_identidade, 'telefone', 40);
    IF p_auth_user_id IS NOT NULL THEN
      -- Dentro da app: a Edge validou o JWT e passa o id do Auth; a conta e a
      -- de anew_users desse id, e tem de ser membro activo desta organizacao.
      -- Nome e email vem da conta, nao do corpo (pessoaLigada.ts).
      SELECT u.id INTO v_user FROM public.anew_users u
       WHERE u.auth_user_id = p_auth_user_id AND u.deleted_at IS NULL
       LIMIT 1;
      IF v_user IS NULL OR NOT public.denuncias_membro_ativo(v_c.organization_id, v_user) THEN
        RAISE EXCEPTION 'sem_permissao' USING ERRCODE = 'HRD17';
      END IF;
      SELECT nullif(btrim(left(u.name, 200)), ''), CASE WHEN u.email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
                                          AND length(u.email) <= 254 THEN u.email END
        INTO v_nome, v_email
        FROM public.anew_users u WHERE u.id = v_user;
      SELECT pc.pessoa_id INTO v_pessoa FROM public.pessoas_contas pc
       WHERE pc.anew_user_id = v_user AND pc.organization_id = v_c.organization_id AND pc.estado = 'activa'
       LIMIT 1;
    ELSE
      v_nome := public.denuncias_texto(p_identidade, 'nome', 200);
      v_email := public.denuncias_texto(p_identidade, 'email', 254);
      IF v_email IS NOT NULL AND v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
        RAISE EXCEPTION 'dados_invalidos' USING ERRCODE = 'HRD23';
      END IF;
    END IF;
    IF coalesce(jsonb_typeof(p_identidade -> 'pode_contactar'), 'null') NOT IN ('boolean', 'null')
       OR coalesce(jsonb_typeof(p_identidade -> 'so_responsavel'), 'null') NOT IN ('boolean', 'null') THEN
      RAISE EXCEPTION 'dados_invalidos' USING ERRCODE = 'HRD23';
    END IF;
    IF jsonb_typeof(p_identidade -> 'pode_contactar') = 'boolean' THEN
      v_contac := (p_identidade ->> 'pode_contactar')::boolean;
    END IF;
    IF jsonb_typeof(p_identidade -> 'so_responsavel') = 'boolean' THEN
      v_so_resp := (p_identidade ->> 'so_responsavel')::boolean;
    END IF;
    IF v_contac AND v_email IS NULL AND v_tel IS NULL THEN
      RAISE EXCEPTION 'dados_invalidos' USING ERRCODE = 'HRD23';
    END IF;
  END IF;

  BEGIN
    INSERT INTO public.denuncias (organization_id, codigo, anonima, origem, tipo, descricao, resumo, quando, onde,
                                  envolvidos, ainda_acontece, testemunhas, ja_reportado, boa_fe,
                                  recebida_em, prazo_confirmar, prazo_seguimento)
    VALUES (v_c.organization_id, v_codigo, v_anon,
            CASE WHEN NOT v_anon AND v_user IS NOT NULL THEN 'aplicacao' ELSE 'publica' END,
            v_tipo, v_desc, public.denuncias_resumo(v_desc), public.denuncias_texto(p_dados, 'quando', 200),
            public.denuncias_texto(p_dados, 'onde', 1000), public.denuncias_texto(p_dados, 'envolvidos', 1000),
            coalesce(p_dados ->> 'ainda_acontece', 'nao_sei'), coalesce(p_dados ->> 'testemunhas', 'nao_sei'),
            public.denuncias_texto(p_dados, 'ja_reportado', 1000), true,
            public.denuncias_hoje(), public.denuncias_hoje() + 7,
            (public.denuncias_hoje() + interval '3 months')::date)
    RETURNING id INTO v_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'codigo_invalido' USING ERRCODE = 'HRD26';
  END;

  INSERT INTO public.denuncias_acesso (denuncia_id, organization_id, pin_hash)
  VALUES (v_id, v_c.organization_id, p_pin_hash);

  IF NOT v_anon THEN
    INSERT INTO public.denuncias_identidade (denuncia_id, organization_id, anew_user_id, pessoa_id, nome, email,
                                             telefone, pode_contactar, so_responsavel)
    VALUES (v_id, v_c.organization_id, v_user, v_pessoa, v_nome, v_email, v_tel, v_contac, v_so_resp);
    -- Quem denuncia nunca trata o proprio caso. Esta linha ('conflito' sem
    -- registado_por) so a _criar a grava, e denuncias_vista_gestor nunca a mostra
    -- (nem contada): dizia quem denunciou a quem abre o caso.
    IF v_user IS NOT NULL THEN
      INSERT INTO public.denuncias_impedidos (organization_id, denuncia_id, anew_user_id, motivo, registado_por,
                                              registado_em)
      VALUES (v_c.organization_id, v_id, v_user, 'conflito', NULL, v_em);
    END IF;
  END IF;

  -- D3: responsaveis indicados pelo denunciante ficam impedidos desde a entrada.
  -- So contam ids de responsaveis designados desta organizacao; o resto ignora-se.
  -- registado_em ao dia numa anonima (v_em): o default now() gravava o instante
  -- de chegada da denuncia, ligado ao caso por denuncia_id.
  INSERT INTO public.denuncias_impedidos (organization_id, denuncia_id, anew_user_id, motivo, registado_por,
                                          registado_em)
  SELECT v_c.organization_id, v_id, r.anew_user_id, 'visado', NULL, v_em
    FROM public.denuncias_responsaveis r
   WHERE r.organization_id = v_c.organization_id AND r.ativo
     AND r.anew_user_id = ANY (coalesce(p_impedidos[1:20], '{}'::uuid[]))
     AND r.anew_user_id IS DISTINCT FROM v_user;

  PERFORM public.denuncias_evento(v_c.organization_id, v_id, 'recebida', NULL, NULL, v_em);
  RETURN jsonb_build_object('codigo', v_codigo);
END;
$$;

CREATE FUNCTION public.rpc_denuncia_publica_entrar(p_slug text, p_codigo text, p_pin_hash text,
                                                   p_sessao_hash text, p_chave_ip text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  k_falso  constant text := repeat('0', 64);
  v_org    uuid;
  v_codigo text := upper(regexp_replace(coalesce(p_codigo, ''), '\s', '', 'g'));
  v_a      public.denuncias_acesso;
  v_ok     boolean;
BEGIN
  SELECT c.organization_id INTO v_org FROM public.denuncias_canal c
   WHERE c.slug_publico = lower(btrim(coalesce(p_slug, '')));
  -- O limite conta sempre (mesmo organizacao desconhecida) e nao lanca erro: o
  -- contador fica gravado e a resposta e o mesmo false.
  IF NOT public.denuncias_limite_publico('entrar', v_org, p_chave_ip) THEN
    RETURN false;
  END IF;
  IF v_org IS NULL OR p_pin_hash IS NULL OR p_pin_hash !~ '^[0-9a-f]{64}$'
     OR p_sessao_hash IS NULL OR p_sessao_hash !~ '^[0-9a-f]{64}$' THEN
    RETURN false;
  END IF;

  SELECT a.* INTO v_a
    FROM public.denuncias d JOIN public.denuncias_acesso a ON a.denuncia_id = d.id
   WHERE d.organization_id = v_org AND d.codigo = v_codigo
   FOR UPDATE OF a;
  IF NOT FOUND THEN
    v_ok := (k_falso = p_pin_hash);  -- o mesmo trabalho de uma comparacao real
    RETURN false;
  END IF;
  IF v_a.bloqueada_ate IS NOT NULL AND v_a.bloqueada_ate > now() THEN
    RETURN false;
  END IF;

  IF v_a.pin_hash = p_pin_hash THEN
    UPDATE public.denuncias_acesso a
       SET tentativas_falhadas = 0, bloqueada_ate = NULL,
           sessao_hash = p_sessao_hash, sessao_expira_em = now() + interval '30 minutes'
     WHERE a.denuncia_id = v_a.denuncia_id;
    RETURN true;
  END IF;

  IF v_a.tentativas_falhadas + 1 >= 5 THEN
    UPDATE public.denuncias_acesso a
       SET tentativas_falhadas = 0, bloqueios = a.bloqueios + 1,
           bloqueada_ate = now() + least(interval '15 minutes' * (2 ^ least(a.bloqueios, 10)), interval '24 hours')
     WHERE a.denuncia_id = v_a.denuncia_id;
  ELSE
    UPDATE public.denuncias_acesso a SET tentativas_falhadas = a.tentativas_falhadas + 1
     WHERE a.denuncia_id = v_a.denuncia_id;
  END IF;
  RETURN false;
END;
$$;

CREATE FUNCTION public.rpc_denuncia_publica_ler(p_sessao_hash text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  RETURN public.denuncias_vista_denunciante(public.denuncias_sessao(p_sessao_hash));
END;
$$;

CREATE FUNCTION public.rpc_denuncia_publica_responder(p_sessao_hash text, p_texto text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_id uuid := public.denuncias_sessao(p_sessao_hash);
  v_d  public.denuncias;
  v_t  text;
  v_em timestamptz;
BEGIN
  SELECT d.* INTO v_d FROM public.denuncias d WHERE d.id = v_id FOR UPDATE;
  IF v_d.estado IN ('concluida', 'arquivada') THEN
    RAISE EXCEPTION 'fechada' USING ERRCODE = 'HRD08';
  END IF;
  v_t := public.denuncias_texto_mensagem(p_texto);
  IF (SELECT count(*) FROM public.denuncias_mensagens m
       WHERE m.denuncia_id = v_d.id AND m.autor = 'denunciante') >= 50 THEN
    RAISE EXCEPTION 'limite_mensagens' USING ERRCODE = 'HRD25';
  END IF;
  v_em := public.denuncias_instante(v_d.anonima);
  INSERT INTO public.denuncias_mensagens (organization_id, denuncia_id, autor, texto, criada_em)
  VALUES (v_d.organization_id, v_d.id, 'denunciante', v_t, v_em);
  IF v_d.estado = 'mais_info' THEN
    UPDATE public.denuncias d SET estado = 'em_analise' WHERE d.id = v_d.id;
  END IF;
  PERFORM public.denuncias_evento(v_d.organization_id, v_d.id, 'denunciante_respondeu', NULL, NULL, v_em);
  RETURN public.denuncias_vista_denunciante(v_d.id);
END;
$$;

CREATE FUNCTION public.rpc_denuncia_publica_sair(p_sessao_hash text)
RETURNS void
LANGUAGE sql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  UPDATE public.denuncias_acesso a SET sessao_hash = NULL, sessao_expira_em = NULL
   WHERE a.sessao_hash = p_sessao_hash
$$;

CREATE FUNCTION public.rpc_denuncias_limpar()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_a integer;
  v_b integer;
BEGIN
  DELETE FROM public.denuncias_limites l WHERE l.janela < now() - interval '24 hours';
  GET DIAGNOSTICS v_a = ROW_COUNT;
  -- Reservas que ja nao servem (a _criar so aceita a hora corrente e a anterior).
  DELETE FROM public.denuncias_reservas r WHERE r.hora < date_trunc('hour', now()) - interval '1 hour';
  GET DIAGNOSTICS v_b = ROW_COUNT;
  v_a := v_a + v_b;
  UPDATE public.denuncias_acesso a SET sessao_hash = NULL, sessao_expira_em = NULL
   WHERE a.sessao_expira_em IS NOT NULL AND a.sessao_expira_em < now();
  GET DIAGNOSTICS v_b = ROW_COUNT;
  RETURN v_a + v_b;
END;
$$;

-- So o dono (sem GRANT, sem job ate decisao D8 e parecer juridico).
CREATE FUNCTION public.rpc_denuncias_conservacao_executar()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_n integer;
BEGIN
  PERFORM set_config('denuncias.conservacao', 'on', true);
  DELETE FROM public.denuncias d
   WHERE d.conservar_ate IS NOT NULL AND d.conservar_ate < public.denuncias_hoje()
     AND d.estado IN ('concluida', 'arquivada');
  GET DIAGNOSTICS v_n = ROW_COUNT;
  PERFORM set_config('denuncias.conservacao', 'off', true);
  RETURN v_n;
END;
$$;

-- ==============================================================================
-- D. Privilegios: tudo fechado, depois so o que cada lista diz
-- ==============================================================================
DO $privilegios$
DECLARE
  v_f text;
BEGIN
  FOR v_f IN
    SELECT p.oid::regprocedure::text
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND (p.proname LIKE 'denuncia%' OR p.proname LIKE 'rpc_denuncia%')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated, service_role', v_f);
  END LOOP;
END;
$privilegios$;

GRANT EXECUTE ON FUNCTION
  public.rpc_denuncias_listar(uuid),
  public.rpc_denuncias_por_confirmar(uuid),
  public.rpc_denuncia_abrir(uuid, uuid),
  public.rpc_denuncia_confirmar_rececao(uuid, uuid, text),
  public.rpc_denuncia_gravidade(uuid, uuid, text),
  public.rpc_denuncia_avaliacao(uuid, uuid, text),
  public.rpc_denuncia_atribuir(uuid, uuid, uuid),
  public.rpc_denuncia_impedir(uuid, uuid, uuid, text),
  public.rpc_denuncia_pedir_informacao(uuid, uuid, text),
  public.rpc_denuncia_mensagem(uuid, uuid, text),
  public.rpc_denuncia_nota(uuid, uuid, text),
  public.rpc_denuncia_concluir(uuid, uuid, text, text, text),
  public.rpc_denuncia_arquivar(uuid, uuid, text),
  public.rpc_denuncia_reabrir(uuid, uuid),
  public.rpc_denuncia_identidade_ver(uuid, uuid, text),
  public.rpc_denuncia_exportar(uuid, uuid, text),
  public.rpc_denuncias_responsaveis(uuid),
  public.rpc_denuncias_canal_ler(uuid),
  public.rpc_denuncias_canal_guardar(uuid, boolean, text),
  public.rpc_denuncias_responsavel_designar(uuid, uuid),
  public.rpc_denuncias_responsavel_remover(uuid, uuid),
  public.rpc_denuncia_impedimento_retirar(uuid, uuid, uuid),
  public.rpc_denuncias_canal_auditoria(uuid, integer),
  public.rpc_denuncias_minhas(uuid),
  public.rpc_denuncia_minha_responder(uuid, uuid, text)
TO authenticated;

GRANT EXECUTE ON FUNCTION
  public.rpc_denuncia_publica_limitar(text, text),
  public.rpc_denuncia_publica_canal(text),
  public.rpc_denuncia_publica_reservar_codigo(text, text, text),
  public.rpc_denuncia_publica_criar(text, text, text, jsonb, text, jsonb, uuid, uuid[]),
  public.rpc_denuncia_publica_entrar(text, text, text, text, text),
  public.rpc_denuncia_publica_ler(text),
  public.rpc_denuncia_publica_responder(text, text),
  public.rpc_denuncia_publica_sair(text),
  public.rpc_denuncias_limpar()
TO service_role;

COMMENT ON FUNCTION public.denuncias_visiveis(uuid, uuid, uuid) IS
'INTERNA: definicao unica de "posso ver/tratar este caso": elegivel, nao impedido, e o caso e meu ou esta na fila (sem responsavel elegivel) e foi recebido desde a minha designacao (ou nao ha outro elegivel nao impedido designado antes dele). Desde 20261231994000.';
COMMENT ON FUNCTION public.rpc_denuncia_identidade_ver(uuid, uuid, text) IS
'Ver a identidade de uma denuncia identificada: exige motivo (>= 3), respeita so_responsavel, e regista identidade_vista ANTES de devolver. Cada chamada regista. Desde 20261231994000.';
COMMENT ON FUNCTION public.rpc_denuncia_publica_criar(text, text, text, jsonb, text, jsonb, uuid, uuid[]) IS
'SO service_role (Edge denuncia-publica). Cria a denuncia com um codigo de reserva viva (mesmo nonce; a reserva apaga-se) e o HMAC do PIN. p_auth_user_id e o id do Auth (validado pela Edge) e a base resolve anew_users. Numa anonima descarta identidade e conta, e tudo o que grava fica ao dia. Desde 20261231994000.';
COMMENT ON FUNCTION public.rpc_denuncia_publica_limitar(text, text) IS
'SO service_role (Edge denuncia-publica). Limite por hora de ver o canal (60/IP) e de ler/responder com sessao (120/IP), mais o global (3000). Chave = HMAC do IP; nunca a sessao. Desde 20261231994000.';
COMMENT ON FUNCTION public.rpc_denuncias_conservacao_executar() IS
'SO O DONO, sem job: apaga os casos fechados com conservar_ate passado (5 anos). Nao ligar a pg_cron sem a decisao D8 e o parecer juridico. Desde 20261231994000.';

-- ==============================================================================
-- E. Conferir
-- ==============================================================================
DO $conferir$
DECLARE
  k_gestor constant text[] := ARRAY[
    'rpc_denuncias_listar(uuid)', 'rpc_denuncias_por_confirmar(uuid)', 'rpc_denuncia_abrir(uuid,uuid)',
    'rpc_denuncia_confirmar_rececao(uuid,uuid,text)', 'rpc_denuncia_gravidade(uuid,uuid,text)',
    'rpc_denuncia_avaliacao(uuid,uuid,text)', 'rpc_denuncia_atribuir(uuid,uuid,uuid)',
    'rpc_denuncia_impedir(uuid,uuid,uuid,text)', 'rpc_denuncia_pedir_informacao(uuid,uuid,text)',
    'rpc_denuncia_mensagem(uuid,uuid,text)', 'rpc_denuncia_nota(uuid,uuid,text)',
    'rpc_denuncia_concluir(uuid,uuid,text,text,text)', 'rpc_denuncia_arquivar(uuid,uuid,text)',
    'rpc_denuncia_reabrir(uuid,uuid)', 'rpc_denuncia_identidade_ver(uuid,uuid,text)',
    'rpc_denuncia_exportar(uuid,uuid,text)', 'rpc_denuncias_responsaveis(uuid)',
    'rpc_denuncias_canal_ler(uuid)', 'rpc_denuncias_canal_guardar(uuid,boolean,text)',
    'rpc_denuncias_responsavel_designar(uuid,uuid)', 'rpc_denuncias_responsavel_remover(uuid,uuid)',
    'rpc_denuncia_impedimento_retirar(uuid,uuid,uuid)', 'rpc_denuncias_canal_auditoria(uuid,integer)',
    'rpc_denuncias_minhas(uuid)', 'rpc_denuncia_minha_responder(uuid,uuid,text)'];
  k_servico constant text[] := ARRAY[
    'rpc_denuncia_publica_limitar(text,text)',
    'rpc_denuncia_publica_canal(text)', 'rpc_denuncia_publica_reservar_codigo(text,text,text)',
    'rpc_denuncia_publica_criar(text,text,text,jsonb,text,jsonb,uuid,uuid[])',
    'rpc_denuncia_publica_entrar(text,text,text,text,text)', 'rpc_denuncia_publica_ler(text)',
    'rpc_denuncia_publica_responder(text,text)', 'rpc_denuncia_publica_sair(text)',
    'rpc_denuncias_limpar()'];
  k_internas constant integer := 7 + 16 + 1;  -- 993000 + secao A + conservacao
  v_r     record;
  v_n     integer;
  v_grupo text;
  v_quem  text;
  v_tem   boolean;
  v_deve  boolean;
BEGIN
  -- Todas as listadas existem, cada nome uma so vez.
  FOREACH v_quem IN ARRAY k_gestor || k_servico LOOP
    IF to_regprocedure('public.' || v_quem) IS NULL THEN
      RAISE EXCEPTION 'CONFERIR: a funcao % nao existe.', v_quem;
    END IF;
  END LOOP;
  SELECT count(*) INTO v_n FROM (
    SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND (p.proname LIKE 'denuncia%' OR p.proname LIKE 'rpc_denuncia%')
     GROUP BY p.proname HAVING count(*) > 1) x;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'CONFERIR: % nome(s) de funcao de denuncias com mais de uma assinatura.', v_n;
  END IF;
  SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND (p.proname LIKE 'denuncia%' OR p.proname LIKE 'rpc_denuncia%');
  IF v_n <> array_length(k_gestor, 1) + array_length(k_servico, 1) + k_internas THEN
    RAISE EXCEPTION 'CONFERIR: % funcoes de denuncias; esperavam-se %.', v_n,
      array_length(k_gestor, 1) + array_length(k_servico, 1) + k_internas;
  END IF;

  FOR v_r IN
    SELECT p.oid AS oid, p.proname::text AS nome,
           replace(p.oid::regprocedure::text, 'public.', '') AS assinatura,
           p.prosecdef AS secdef, p.proconfig AS cfg
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND (p.proname LIKE 'denuncia%' OR p.proname LIKE 'rpc_denuncia%')
  LOOP
    v_grupo := CASE WHEN replace(v_r.assinatura, ' ', '') = ANY (k_gestor) THEN 'authenticated'
                    WHEN replace(v_r.assinatura, ' ', '') = ANY (k_servico) THEN 'service_role'
                    ELSE 'ninguem' END;

    IF NOT ('search_path=public, pg_temp' = ANY (coalesce(v_r.cfg, '{}'::text[]))) THEN
      RAISE EXCEPTION 'CONFERIR: % sem search_path fixo.', v_r.assinatura;
    END IF;
    IF v_r.nome LIKE 'rpc_%' AND NOT v_r.secdef THEN
      RAISE EXCEPTION 'CONFERIR: % devia ser SECURITY DEFINER.', v_r.assinatura;
    END IF;
    IF v_r.nome NOT LIKE 'rpc_%' AND v_r.secdef THEN
      RAISE EXCEPTION 'CONFERIR: a interna % nao devia ser SECURITY DEFINER.', v_r.assinatura;
    END IF;

    FOREACH v_quem IN ARRAY ARRAY['public', 'anon', 'authenticated', 'service_role'] LOOP
      v_tem := has_function_privilege(v_quem, v_r.oid, 'EXECUTE');
      v_deve := (v_quem = v_grupo);
      IF v_tem IS DISTINCT FROM v_deve THEN
        RAISE EXCEPTION 'CONFERIR: EXECUTE de % em % e %, devia ser %.', v_quem, v_r.assinatura, v_tem, v_deve;
      END IF;
    END LOOP;
  END LOOP;

  -- As tabelas continuam fechadas (nenhuma RPC lhes deu GRANT por engano).
  SELECT count(*) INTO v_n FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind::text = 'r' AND c.relname LIKE 'denuncias%'
     AND (has_table_privilege('authenticated', c.oid, 'SELECT') OR has_table_privilege('anon', c.oid, 'SELECT')
          OR has_table_privilege('service_role', c.oid, 'SELECT'));
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'CONFERIR: % tabela(s) do canal legiveis por anon/authenticated/service_role.', v_n;
  END IF;

  -- Nenhum job de conservacao ligado.
  IF to_regclass('cron.job') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM cron.job WHERE command ILIKE ''%denuncias%''' INTO v_n;
    IF v_n <> 0 THEN
      RAISE EXCEPTION 'CONFERIR: ha % job(s) pg_cron do canal; a conservacao so se liga depois de D8.', v_n;
    END IF;
  END IF;

  RAISE NOTICE 'Conferido: % RPCs do gestor so para authenticated, % de servico so para service_role, % internas sem EXECUTE; search_path fixo em todas; tabelas fechadas; sem job.',
    array_length(k_gestor, 1), array_length(k_servico, 1), k_internas;
END;
$conferir$;
