-- ==============================================================================
-- 20261210430000_hr_admissao_sessao_otp_leituras.sql
--
-- V3a DA ADMISSAO (etapa E3, pacote P1): sessao do portal, OTP por email,
-- leituras do portal e do RH, e o link do convite guardado cifrado no Vault.
-- NAO ESCREVE NA FICHA e nao muda nenhuma escrita existente: o rascunho, a
-- submissao e os anexos continuam pelas RPCs actuais ate a V3b.
--
-- POR APLICAR. Depende de 20261210420000 (V2) ja aplicada na dev.
--
--
-- -- PORQUE ---------------------------------------------------------------------
--
-- A especificacao (16/10) diz que o link abre o portal em CONSULTA LIMITADA, sem
-- dados sensiveis, e que para editar a pessoa confirma a identidade por OTP
-- enviado ao email do convite, abrindo uma sessao temporaria (decisao 12: 30 min
-- sem actividade ou 4 h no total). Hoje a _estado devolve o NIF, os ultimos 4 do
-- NISS e da conta e o rascunho a quem tiver o link. O RH precisa ainda de ver o
-- pipeline das admissoes e de rever o que foi submetido, e de reenviar o MESMO
-- link quando o email do convite falhou (desenho H10 a).
--
--
-- -- CODIGO QUE ENTRA NO MESMO PUSH (pacotes P2, P3 e P4 do desenho, seccao I) --
--
-- SEM ESTE CODIGO O PORTAL PARTE NO INSTANTE DO PUSH: a _estado deixa de
-- devolver rascunho, campos obrigatorios, nome completo, email, NIF e mascaras.
-- P2 Edge convite-admissao:
--   - correio.ts (SMTP da organizacao do processo, sem email_logs);
--   - accoes publicas otp_pedir, otp_verificar, sair, ler (portal_ler) e
--     sensiveis (sensiveis_gravar), com a sessao no CORPO do pedido e
--     sessao_hash = SHA-256 hex da sessao; o HMAC do OTP calculado na Edge com
--     um pepper; o resultado de otp_pedir (email_destino) nunca vai ao browser;
--   - a accao estado passa a enviar o cabecalho x-portal-sessao (o SHA-256 hex
--     da sessao) quando o browser a tem;
--   - criar chama rpc_hr_convite_link_guardar logo a seguir a _criar;
--   - accao do RH reenviar -> rpc_hr_convite_admissao_reenviar com p_actor
--     tirado do JWT; o token devolvido so serve para compor o email e NUNCA vai
--     para o browser nem para logs;
--   - mapear os codigos HRA novos (abaixo); nunca devolver error.details.
-- P3 Portal (substitui o antigo): useConviteAdmissaoPublico, useAdmissaoPublica,
--   passo de OTP quando precisa_otp, sessao em sessionStorage, formulario
--   montado pela portal_ler, NISS e IBAN pela sensiveis_gravar, mensagens
--   sessao_substituida e sessao_expirada.
-- P4 RH: useAdmissoesPipeline/PipelineAdmissoes (listar), useRevisaoAdmissao e
--   RevisaoAdmissaoDialog so de leitura (rever_ler), "Revelar" (rever_sensivel),
--   "Reenviar convite" em PessoaConviteAdmissaoEstado.
--
--
-- -- O QUE O UTILIZADOR VE ----------------------------------------------------
--
-- Pessoa: o link mostra so o primeiro nome, a organizacao, o estado e a
-- validade; para preencher pede um codigo por email; com o codigo abre o
-- formulario; num segundo dispositivo o primeiro passa a dizer que a sessao foi
-- substituida. RH: lista de admissoes por estado, revisao so de leitura com as
-- diferencas para a ficha, "Revelar" NISS/IBAN (registado), e "Reenviar
-- convite" com o mesmo link.
--
--
-- -- O QUE MUDA ----------------------------------------------------------------
--
-- 1. pessoas_convites_admissao ganha niss_segredo_id, iban_segredo_id e
--    link_segredo_id (referencias a vault.secrets, sem FK: outro schema),
--    submetido_em e submetido_sha256 (escritas so na V3b; CHECK novo
--    pessoas_convites_admissao_submetido_sha256_formato: hex de 64, como os
--    outros hashes da V2 -- detalhe decidido aqui). Nenhuma coluna fica
--    com SELECT para anon nem authenticated (o bloco da V2 repete-se).
--    Indices idx_pessoas_convites_admissao_pipeline (organization_id, estado,
--    created_at DESC, id) e idx_pessoas_convites_admissao_org_criado
--    (organization_id, created_at DESC, id), este para a listar sem filtro de
--    estado.
-- 1b. pessoas_acessos_sensiveis ganha o indice
--    idx_pessoas_acessos_sensiveis_auth_data (auth_user_id, created_at), com
--    CREATE INDEX IF NOT EXISTS: aditivo, so para o limite da rever_sensivel
--    deixar de ser varrimento. A tabela, as politicas e os CHECKs dela NAO mudam.
-- 2. Funcoes internas novas:
--    - hr_convite_sessao_valida(timestamptz, timestamptz, timestamptz): pura;
--      EXECUTE so para authenticated (teste de integracao com datas fixas);
--    - hr_convite_sessao_exigir(uuid, text) e hr_convite_link_token(uuid): SEM
--      EXECUTE para NENHUM papel, service_role incluido. So as chamam, por
--      dentro, as RPCs SECURITY DEFINER desta migration;
--    - hr_admissao_revisao_visivel(text, jsonb): pura, SEM EXECUTE para nenhum
--      papel; o mapa chave -> dominio da ficha da revisao (45 chaves do
--      rascunho, niss, iban e os 3 tipos de anexo), testado por comportamento
--      no bloco de conferir.
-- 3. RPCs novas so service_role: rpc_hr_convite_link_guardar,
--    rpc_hr_convite_admissao_otp_pedir, _otp_verificar, _sessao_terminar,
--    _portal_ler, _sensiveis_gravar, _reenviar.
-- 4. RPCs novas so authenticated: rpc_hr_admissao_listar, _rever_ler,
--    _rever_sensivel.
-- 5. CREATE OR REPLACE da rpc_hr_convite_admissao_estado(text) RETURNS jsonb,
--    mesma assinatura, mesmo retorno e mesmos grants (so service_role), corpo
--    novo: so o minimo publico.
-- NAO MUDA: a _criar, a _cancelar, a _rascunho, a _submeter, as RPCs de anexos,
-- o trigger transitorio da V2, os comentarios da V2 e o CHECK de
-- pessoas_acessos_sensiveis.
-- CONTAGEM: 14 funcoes novas, 1 funcao alterada (_estado), 5 colunas, 1 CHECK,
-- 3 indices (2 em pessoas_convites_admissao, 1 em pessoas_acessos_sensiveis).
--
--
-- -- CODIGOS DE ERRO NOVOS (MESSAGE = codigo) ----------------------------------
--
--   HRA42 otp_espera         HRA43 otp_limite_diario  HRA44 otp_expirado
--   HRA45 otp_bloqueado      HRA46 otp_invalido       HRA47 campo_bloqueado
--   HRA51 sessao_ausente     HRA52 sessao_expirada    HRA53 sessao_substituida
--   HRA56 link_indisponivel
-- HRA44, HRA45 e HRA46 saem em jsonb ({erro, restantes}) e nao por RAISE, para
-- o incremento de otp_tentativas ficar gravado. Reutilizados: HRA02
-- convite_ja_usado (portal encerrado), HRA03 convite_revogado, HRA04
-- convite_expirado, HRA05 convite_bloqueado (10 aberturas falhadas), HRA10
-- pedido_invalido, HRA12 niss_invalido, HRA16 iban_invalido, HRA31
-- nao_encontrado, HRA33 organizacao_nao_empregadora, HRA34 token_invalido,
-- HRA38 estado_invalido, HRA41 limite_excedido; 42501 sem sessao JWT ou p_actor
-- desconhecido.
--
--
-- -- DECISOES DE DETALHE TOMADAS AQUI (o desenho nao as fixava) -----------------
--
-- a) Ordem das recusas do portal, igual em todas as RPCs publicas: token
--    desconhecido HRA31; portal encerrado (ou used_at do fluxo antigo) HRA02;
--    revogado HRA03; expirado HRA04; 10 aberturas falhadas HRA05.
-- b) _estado: os erros mantem o padrao {erro} e o incremento de attempts da
--    versao anterior (convite_invalido, convite_ja_usado, convite_revogado,
--    convite_expirado, convite_bloqueado). Por isso, em sucesso, estado_portal e
--    sempre 'ativo' e 'bloqueado' significa OTP BLOQUEADO (5 tentativas gastas
--    num codigo ainda valido: e preciso pedir outro), nao o link bloqueado.
--    portal_aberto grava-se na 1.a abertura com sucesso, sem lock: duas
--    aberturas simultaneas podem gravar dois eventos (aceite).
-- c) otp_verificar: a 6.a tentativa (otp_bloqueado) tambem grava otp_falhado,
--    com erro_codigo; as tentativas gravadas tem tecto 1000 (o CHECK dos
--    metadados). So a PRIMEIRA tentativa excedente (a 6.a) grava otp_falhado;
--    as seguintes sobre o mesmo OTP bloqueado nao gravam nada, para o tecto
--    agregado contar uma vez por OTP. TECTO AGREGADO: com 15 ou mais
--    otp_falhado do processo nas ultimas 24 h, a otp_verificar devolve
--    otp_bloqueado SEM comparar e sem gravar outro evento, a otp_pedir recusa
--    com otp_bloqueado (HRA45, RAISE) SEM gravar nem enviar codigo, e a _estado
--    devolve bloqueado = true (o orcamento de palpites passa de 50 para 15 por
--    dia). A regeneracao do link NAO liberta o tecto (os eventos ficam); a V3b
--    traz a accao do RH "desbloquear OTP"
--    (rpc_hr_convite_admissao_otp_desbloquear) para o libertar. O erro e
--    otp_bloqueado, cujo codigo e HRA45 (o pedido da revisao dizia HRA46, que e
--    otp_invalido; seguiu-se a tabela de codigos). Um hash de sessao ja usado
--    noutro processo (unique_violation) sai em jsonb {erro: pedido_invalido} e
--    nao por RAISE, para o incremento nao se perder. A sessao anterior so conta
--    como "substituida" se ainda era valida. A resposta de sucesso devolve
--    sessao_expira_em = agora + 30 min (a janela de inactividade).
-- c2) otp_pedir e otp_verificar so nos estados editaveis (convidada,
--    em_preenchimento, devolvida); nos outros estado_invalido (HRA38). Assim so
--    se abrem sessoes nesses estados. A portal_ler nao abre sessoes: so le com
--    uma sessao valida ja aberta (que, entretanto, pode estar num estado de
--    consulta, como submetida na V3b).
-- d) sessao_exigir: sem sessao (argumento nulo e sem cabecalho, ou formato
--    invalido) HRA51; sessao terminada ou nunca aberta HRA52; sessao diferente
--    da activa HRA53; activa mas fora da janela HRA52. O argumento ganha ao
--    cabecalho x-portal-sessao.
-- e) link_guardar recusa (HRA38) se ja ha segredo ou se o processo nao esta
--    aberto ou tem o portal revogado/encerrado; nao e idempotente, de proposito.
-- f) reenviar conta para o limite de 60 eventos por hora do actor (o evento
--    reenviado e do actor), tem um tecto proprio de 3 reenvios por hora do
--    mesmo processo (eventos reenviado; ambos HRA41) e exige work organization
--    (HRA33), como a _prolongar. Serializa por actor com o mesmo
--    pg_advisory_xact_lock da rever_sensivel ANTES de contar os 60.
-- g) sensiveis_gravar: NULL ou texto vazio = nao mexer nesse campo; a
--    devolucao manda nas chaves editaveis em devolvida (HRA47). Nao regista em
--    pessoas_acessos_sensiveis: e staging do processo, nao a ficha.
-- h) portal_ler: campos_editaveis em em_preenchimento = as 45 chaves da lista
--    branca do rascunho (copia da constante de hr_convite_rascunho_valido) mais
--    niss e iban; documentos_editaveis = os 3 tipos de pessoas_anexos;
--    campos_obrigatorios = codigos de origem pessoa e posicao convite (so os
--    codigos; a marca "condicional" da versao antiga da _estado deixa de vir).
-- i) listar: ordena por created_at DESC, id ASC (a ordem dos indices); o
--    cursor e (p_apos_criado_em, p_apos_id), os dois ou nenhum (HRA10); estados
--    fora dos 11 e de 'terminado' dao HRA10; exclui fichas apagadas; os
--    contadores nao dependem do filtro nem do cursor; devolvida_em e
--    atualizado_em derivam-se dos eventos. SEM ORACULO DA MASCARA: sem restrito,
--    pedir cancelada, rejeitada ou terminado devolve sempre as duas; os itens
--    saem iguais (terminado, revogado, sem datas) e os contadores fundem-nas;
--    a ordem e o cursor so usam created_at e id, logo nada as distingue. O
--    cargo e o de hr_cargos da mesma organizacao.
-- j) rever_ler: campos = as chaves presentes no rascunho, cada uma com o
--    dominio da ficha onde a submissao a escreve (as chaves do ecra sem coluna
--    propria seguem o dominio onde a pessoa as escreve; sem dominio =
--    invisivel). Cada chave so e visivel com a permissao desse dominio na
--    organizacao da linha, lida em hr_admissao_campo_permissao() (a mesma da
--    RLS: hr.pessoas.view, pessoais.view -- dependentes_deficientes, dado de
--    saude, incluido --, identificacao.view, morada.view, laborais.view,
--    bancarios.view); sem ela sai {visivel: false, submetido: null, ficha: null,
--    difere: false}: o aprovador que nao ve um dominio na ficha tambem nao o ve
--    na revisao, nem o valor submetido. A MESMA regra vale para os anexos
--    (comprovativo_iban so com bancarios.view, cartao_cidadao com
--    identificacao.view, fotografia com pessoais.view; oculto = sem id) e para
--    os comentarios de devolucao.campos (oculto = comentario null). A
--    observacao da devolucao (texto livre escrito pelo proprio RH) e a lista de
--    documentos (so tipos) ficam visiveis a quem tem hr.onboarding.approve.
--    Uma ficha apagada (pessoas.deleted_at) da nao_encontrado, como na listar.
--    conta_formato le formato_conta da ficha. difere compara texto sem espacos nas
--    pontas e sem caixa, so quando os dois lados tem valor. A morada da ficha e
--    a de residencia (a principal primeiro). Processo cancelado ou rejeitado:
--    so o resumo (estado, datas, eventos, niss e iban como {preenchido}); NUNCA
--    campos, anexos, devolucao nem pendencias, mesmo com restrito. As
--    pendencias vem de hr_admissao_pendencias, que aplica o gate dela ao
--    auth.uid().
-- k) rever_sensivel: regista uma linha 'revelar' por cada leitura QUE DEVOLVE
--    VALOR (sem segredo nao ha revelacao, logo nao ha linha). Serializa por
--    actor com pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 0))
--    ANTES de contar, para chamadas concorrentes nao passarem juntas o limite.
-- l) Sessao substituida (decisao da revisao): sem coluna sessao_anterior_hash.
--    O dispositivo antigo recebe HRA52 (sessao terminada) ou HRA53 (outra
--    sessao activa), conforme o caso; a Edge devolve ao visitante o MESMO erro
--    nos dois casos ("a sua sessao terminou, confirme de novo"). Um aviso
--    especifico "sessao substituida noutro dispositivo" fica como decisao de
--    produto futura.
--
--
-- -- RISCOS CONHECIDOS -----------------------------------------------------------
--
-- - VAULT: as funcoes leem vault.decrypted_secrets como dono (postgres), e
--   service_role tambem le essa vista. A barreira real dos segredos (NISS, IBAN
--   e token do link) e a Edge e a chave de servico, nao a base. anon e
--   authenticated NAO tem USAGE no schema vault nem SELECT nas vistas
--   (confirmado na dev; o bloco de conferir verifica-o).
-- - OTP: o HMAC e HMAC-SHA256(pepper, token_hash || codigo), calculado na
--   Edge; as RPCs so recebem e comparam o HMAC, nunca o codigo. ORACULO ACEITE:
--   quem tem o link consegue gastar os 10 pedidos de OTP do dia (negacao de
--   servico ao proprio processo) e distinguir otp_espera de otp_limite_diario;
--   o link ja e um segredo do destinatario.
-- - RETENCAO: o NISS e o IBAN de staging ficam cifrados no Vault pelo menos ate
--   a V3b (a promocao para a ficha) e, depois, ate haver um prazo validado
--   juridicamente (decisao 10): nada os apaga automaticamente. O segredo do
--   link so se apaga ao cancelar a partir da V3b.
-- - O incremento de sessao_falhas perde-se quando a sessao falha com RAISE; o
--   limite real e o da Edge, por token.
-- - BRECHA V3a -> V3b: a _rascunho e a _submeter ACTUAIS (nao mudam aqui)
--   continuam sem exigir sessao. A Edge fecha as accoes rascunho e submeter com
--   HTTP 410 NO MESMO DEPLOY desta migration (P2): ate a V3b ninguem grava nem
--   submete pelo portal. As RPCs so sao executaveis por service_role.
-- - As internas da V2 (hr_convite_estado_aberto, hr_organizacao_empregadora e
--   as de trigger) continuam executaveis por service_role (privilegios por
--   omissao do Supabase); fica registado, sem corrigir aqui.
--
--
-- -- IMPACTO NUMA PUBLICACAO FUTURA (PRODUCAO / MUDELAR) -----------------------
--
-- Muda a _estado, partilhada com o portal de admissao da Mudelar: publicar
-- esta migration em producao EXIGE o P2 e o P3 no MESMO push; sem eles o portal
-- da Mudelar deixa de conseguir preencher (deixa de receber o rascunho e os
-- campos obrigatorios). Cria funcoes, colunas e indices novos (um deles em
-- pessoas_acessos_sensiveis, partilhada). Os convites abertos que ja existirem
-- nao tem link_segredo_id: o reenvio da HRA56 para eles (so a regeneracao, na
-- V3b, lhes guarda um link). Publicar em producao precisa de autorizacao
-- explicita.
--
--
-- -- SO SE PROVA A CORRER ------------------------------------------------------
--
-- O Vault a cifrar e a ler (create_secret/update_secret/decrypted_secrets); o
-- cabecalho x-portal-sessao a chegar a request.headers pelo PostgREST; o
-- contador de OTP sob pedidos concorrentes (o FOR UPDATE poe-nos em fila); dois
-- dispositivos (sessao_substituida); o tempo da listar com os indices novos; o
-- lock por actor da rever_sensivel sob concorrencia; a rever_ler com um
-- aprovador sem uma das permissoes de dominio; o tecto agregado de OTP; o
-- percurso OTP certo -> sessao, que precisa de SMTP de captura.
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- Sem ficheiro de reversao nesta pasta, de proposito. A mao: repor a _estado de
-- 20261210020000; largar as 13 funcoes novas e os 3 indices novos. As colunas
-- podem ficar (nulas). Os eventos ficam (sao historico).
--
--
-- Prerequisitos:
--   20261210420000  V2: estado, sessao_*, otp_*, eventos, hr_convite_estado_aberto,
--                   hr_organizacao_empregadora
--   20261210020000  rpc_hr_convite_admissao_estado (versao vigente, confirmada na dev)
--   20261130200000  hr_registar_acesso_sensivel (4 e 5 argumentos)
-- ==============================================================================

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
DECLARE
  v_n integer;
BEGIN
  IF to_regclass('public.pessoas_convites_admissao_eventos') IS NULL THEN
    RAISE EXCEPTION 'pessoas_convites_admissao_eventos nao existe. Aplicar 20261210420000 (V2) primeiro.';
  END IF;

  SELECT count(*) INTO v_n FROM pg_attribute
   WHERE attrelid = to_regclass('public.pessoas_convites_admissao')
     AND attname IN ('estado', 'sessao_hash', 'sessao_iniciada_em', 'sessao_ultima_atividade_em',
                     'otp_hmac', 'otp_expira_em', 'otp_tentativas', 'portal_encerrado_em', 'devolucao',
                     'rejeicao_mensagem')
     AND NOT attisdropped;
  IF v_n <> 10 THEN
    RAISE EXCEPTION 'pessoas_convites_admissao nao tem as colunas da V2 (encontradas % de 10).', v_n;
  END IF;

  SELECT count(*) INTO v_n FROM pg_attribute
   WHERE attrelid = to_regclass('public.pessoas_convites_admissao')
     AND attname IN ('niss_segredo_id', 'iban_segredo_id', 'link_segredo_id', 'submetido_em', 'submetido_sha256')
     AND NOT attisdropped;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'Ja existem % das 5 colunas novas da V3a. Investigar.', v_n;
  END IF;

  IF to_regclass('public.idx_pessoas_convites_admissao_pipeline') IS NOT NULL
     OR to_regclass('public.idx_pessoas_convites_admissao_org_criado') IS NOT NULL THEN
    RAISE EXCEPTION 'Um dos indices novos do pipeline ja existe. Investigar.';
  END IF;

  IF to_regclass('public.pessoas_acessos_sensiveis') IS NULL
     OR NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = to_regclass('public.hr_cargos')
                     AND attname = 'organization_id' AND NOT attisdropped)
     OR to_regprocedure('public.hr_admissao_campo_permissao()') IS NULL THEN
    RAISE EXCEPTION 'Falta pessoas_acessos_sensiveis, hr_cargos.organization_id ou hr_admissao_campo_permissao().';
  END IF;

  -- Nenhuma das funcoes novas existe, com nenhuma assinatura.
  SELECT count(*) INTO v_n
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public'
     AND p.proname IN ('hr_convite_sessao_valida', 'hr_convite_sessao_exigir', 'hr_convite_link_token',
                       'rpc_hr_convite_link_guardar', 'rpc_hr_convite_admissao_otp_pedir',
                       'rpc_hr_convite_admissao_otp_verificar', 'rpc_hr_convite_admissao_sessao_terminar',
                       'rpc_hr_convite_admissao_portal_ler', 'rpc_hr_convite_admissao_sensiveis_gravar',
                       'rpc_hr_convite_admissao_reenviar', 'rpc_hr_admissao_listar',
                       'rpc_hr_admissao_rever_ler', 'rpc_hr_admissao_rever_sensivel',
                       'hr_admissao_revisao_visivel');
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'Ja existem % funcao(oes) com os nomes das funcoes novas da V3a. Investigar.', v_n;
  END IF;

  -- A _estado vigente: uma so versao, (text) -> jsonb.
  SELECT count(*) INTO v_n
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public' AND p.proname = 'rpc_hr_convite_admissao_estado';
  IF v_n <> 1
     OR to_regprocedure('public.rpc_hr_convite_admissao_estado(text)') IS NULL
     OR pg_get_function_result(to_regprocedure('public.rpc_hr_convite_admissao_estado(text)')) IS DISTINCT FROM 'jsonb' THEN
    RAISE EXCEPTION 'rpc_hr_convite_admissao_estado(text) RETURNS jsonb nao e a unica versao (ha % com esse nome).', v_n;
  END IF;

  IF to_regprocedure('public.hr_convite_estado_aberto(text)') IS NULL
     OR to_regprocedure('public.hr_organizacao_empregadora(uuid)') IS NULL
     OR to_regprocedure('public.hr_convite_evento_metadados_validos(jsonb)') IS NULL
     OR to_regprocedure('public.has_anew_permission_in_org(uuid, text, uuid)') IS NULL
     OR to_regprocedure('public.hr_registar_acesso_sensivel(uuid, uuid, text, text)') IS NULL
     OR to_regprocedure('public.hr_admissao_pendencias(uuid)') IS NULL
     OR to_regprocedure('public.hr_admissao_campos_obrigatorios_org(uuid)') IS NULL
     OR to_regprocedure('public.hr_niss_valido(text)') IS NULL
     OR to_regprocedure('public.hr_iban_valido(text)') IS NULL
     OR to_regprocedure('vault.create_secret(text, text, text, uuid)') IS NULL
     OR to_regprocedure('vault.update_secret(uuid, text, text, text, uuid)') IS NULL
     OR to_regclass('vault.decrypted_secrets') IS NULL THEN
    RAISE EXCEPTION 'Falta uma funcao de que a V3a depende (V2, permissoes, pendencias, validadores ou Vault).';
  END IF;

  SELECT count(*) INTO v_n FROM public.anew_permissions
   WHERE code IN ('hr.pessoas.convite.enviar', 'hr.onboarding.approve',
                  'hr.onboarding.sensitive', 'hr.onboarding.restrito');
  IF v_n <> 4 THEN
    RAISE EXCEPTION 'O catalogo anew_permissions nao tem as 4 permissoes da admissao (encontradas %).', v_n;
  END IF;

  SELECT count(*) INTO v_n FROM pg_attribute
   WHERE attrelid = to_regclass('public.pessoas') AND attname IN ('primeiro_nome', 'nome_completo', 'cargo_id', 'deleted_at')
     AND NOT attisdropped;
  IF v_n <> 4 OR NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = to_regclass('public.hr_cargos') AND attname = 'nome' AND NOT attisdropped)
     OR NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = to_regclass('public.anew_organizations') AND attname = 'name' AND NOT attisdropped) THEN
    RAISE EXCEPTION 'pessoas (primeiro_nome, nome_completo, cargo_id, deleted_at), hr_cargos.nome ou anew_organizations.name em falta.';
  END IF;
END;
$guardas$;

-- ==============================================================================
-- 1. Colunas novas e indice do pipeline
-- ==============================================================================
ALTER TABLE public.pessoas_convites_admissao
  ADD COLUMN niss_segredo_id  uuid,
  ADD COLUMN iban_segredo_id  uuid,
  ADD COLUMN link_segredo_id  uuid,
  ADD COLUMN submetido_em     timestamptz,
  ADD COLUMN submetido_sha256 text;

ALTER TABLE public.pessoas_convites_admissao
  ADD CONSTRAINT pessoas_convites_admissao_submetido_sha256_formato
  CHECK (submetido_sha256 IS NULL OR submetido_sha256 ~ '^[0-9a-f]{64}$');

COMMENT ON COLUMN public.pessoas_convites_admissao.niss_segredo_id IS
'Referencia a vault.secrets(id) com o NISS que a pessoa deu no portal (staging do processo, nao a ficha). Sem FK: outro schema. Escreve-se so pela rpc_hr_convite_admissao_sensiveis_gravar. Sem SELECT para anon/authenticated. Desde 20261210430000.';
COMMENT ON COLUMN public.pessoas_convites_admissao.iban_segredo_id IS
'Referencia a vault.secrets(id) com o IBAN que a pessoa deu no portal (staging do processo, nao a ficha). Sem FK: outro schema. Escreve-se so pela rpc_hr_convite_admissao_sensiveis_gravar. Sem SELECT para anon/authenticated. Desde 20261210430000.';
COMMENT ON COLUMN public.pessoas_convites_admissao.link_segredo_id IS
'Referencia a vault.secrets(id) com o token em claro do link do portal, para reenviar o MESMO link (desenho H10 a). Guarda-se pela rpc_hr_convite_link_guardar; le-se so pela interna hr_convite_link_token, sem EXECUTE para nenhum papel. E uma credencial, nao um dado pessoal. Sem SELECT para anon/authenticated. Desde 20261210430000.';
COMMENT ON COLUMN public.pessoas_convites_admissao.submetido_em IS
'Quando a pessoa submeteu pelo portal novo (escrito a partir da V3b). Sem SELECT para anon/authenticated. Desde 20261210430000.';
COMMENT ON COLUMN public.pessoas_convites_admissao.submetido_sha256 IS
'SHA-256 hex do que foi submetido (escrito a partir da V3b). Sem SELECT para anon/authenticated. Desde 20261210430000.';
COMMENT ON COLUMN public.pessoas_convites_admissao.otp_pedidos_dia IS
'SEM USO desde 20261210430000: os limites de pedidos de OTP contam-se pelos eventos otp_pedido (desenho H8). Nao se larga.';
COMMENT ON COLUMN public.pessoas_convites_admissao.otp_ultimo_pedido_em IS
'SEM USO desde 20261210430000: a espera entre pedidos conta-se pelos eventos otp_pedido (desenho H8). Nao se larga.';

-- As colunas novas nao herdam nenhum direito de coluna, mas revoga-se
-- explicitamente (e todas as outras outra vez) antes de conferir.
REVOKE SELECT ON TABLE public.pessoas_convites_admissao FROM anon, authenticated;

DO $revogar$
DECLARE
  v_col text;
BEGIN
  FOR v_col IN
    SELECT a.attname::text FROM pg_attribute a
     WHERE a.attrelid = to_regclass('public.pessoas_convites_admissao')
       AND a.attnum > 0 AND NOT a.attisdropped
  LOOP
    EXECUTE format('REVOKE ALL (%I) ON TABLE public.pessoas_convites_admissao FROM anon, authenticated', v_col);
  END LOOP;
END;
$revogar$;

CREATE INDEX idx_pessoas_convites_admissao_pipeline
  ON public.pessoas_convites_admissao (organization_id, estado, created_at DESC, id);

COMMENT ON INDEX public.idx_pessoas_convites_admissao_pipeline IS
'Pipeline das admissoes (rpc_hr_admissao_listar): filtro por organizacao e estado, ordem created_at DESC, id, e contadores por estado. Desde 20261210430000.';

-- A lista sem filtro de estado (o indice acima so serve a ordem com um estado fixo).
CREATE INDEX idx_pessoas_convites_admissao_org_criado
  ON public.pessoas_convites_admissao (organization_id, created_at DESC, id);

COMMENT ON INDEX public.idx_pessoas_convites_admissao_org_criado IS
'Pipeline das admissoes sem filtro de estado (rpc_hr_admissao_listar): organizacao, ordem created_at DESC, id e cursor. Desde 20261210430000.';

-- O limite da rpc_hr_admissao_rever_sensivel (120 leituras por hora por actor)
-- conta por aqui; sem ele era um varrimento. Aditivo: IF NOT EXISTS.
CREATE INDEX IF NOT EXISTS idx_pessoas_acessos_sensiveis_auth_data
  ON public.pessoas_acessos_sensiveis (auth_user_id, created_at);

COMMENT ON INDEX public.idx_pessoas_acessos_sensiveis_auth_data IS
'Limite por actor da rpc_hr_admissao_rever_sensivel: leituras sensiveis de um auth_user_id na ultima hora. Desde 20261210430000.';

-- ==============================================================================
-- 2. Funcoes internas da sessao e do link
-- ==============================================================================

-- Pura, para se testar com datas fixas: 30 min sem actividade, 4 h no total.
CREATE FUNCTION public.hr_convite_sessao_valida(
  p_iniciada timestamptz,
  p_ultima   timestamptz,
  p_agora    timestamptz
)
RETURNS boolean
LANGUAGE sql IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT coalesce(
           p_iniciada IS NOT NULL
       AND p_ultima   IS NOT NULL
       AND p_agora    IS NOT NULL
       AND p_agora >= p_iniciada
       AND p_agora - p_ultima   <= interval '30 minutes'
       AND p_agora - p_iniciada <= interval '4 hours',
         false)
$$;

REVOKE ALL ON FUNCTION public.hr_convite_sessao_valida(timestamptz, timestamptz, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_convite_sessao_valida(timestamptz, timestamptz, timestamptz) FROM anon;
REVOKE ALL ON FUNCTION public.hr_convite_sessao_valida(timestamptz, timestamptz, timestamptz) FROM service_role;
GRANT EXECUTE ON FUNCTION public.hr_convite_sessao_valida(timestamptz, timestamptz, timestamptz) TO authenticated;

COMMENT ON FUNCTION public.hr_convite_sessao_valida(timestamptz, timestamptz, timestamptz) IS
'Pura: a sessao do portal e valida se p_agora esta a 30 min ou menos da ultima actividade e a 4 h ou menos do inicio (decisao 12). Sem dados; EXECUTE so para authenticated, para o teste de integracao a chamar com datas fixas. Desde 20261210430000.';

-- Exige a sessao activa do processo e renova a actividade. Sem EXECUTE para
-- ninguem: corre dentro das RPCs SECURITY DEFINER.
CREATE FUNCTION public.hr_convite_sessao_exigir(p_convite_id uuid, p_sessao_hash text)
RETURNS void
LANGUAGE plpgsql VOLATILE
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_hash text := nullif(btrim(p_sessao_hash), '');
  v_hdr  text;
  v_c    record;
BEGIN
  -- As RPCs existentes (V3b) nao mudam de assinatura: a sessao vem no cabecalho.
  IF v_hash IS NULL THEN
    v_hdr := nullif(current_setting('request.headers', true), '');
    IF v_hdr IS NOT NULL THEN
      BEGIN
        v_hash := nullif(btrim(v_hdr::jsonb ->> 'x-portal-sessao'), '');
      EXCEPTION WHEN invalid_text_representation THEN
        v_hash := NULL;
      END;
    END IF;
  END IF;

  IF v_hash IS NULL OR v_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'sessao_ausente' USING ERRCODE = 'HRA51';
  END IF;

  SELECT c.id, c.sessao_hash, c.sessao_iniciada_em, c.sessao_ultima_atividade_em INTO v_c
    FROM public.pessoas_convites_admissao c
   WHERE c.id = p_convite_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'nao_encontrado' USING ERRCODE = 'HRA31';
  END IF;

  IF v_c.sessao_hash IS NULL THEN
    RAISE EXCEPTION 'sessao_expirada' USING ERRCODE = 'HRA52';
  END IF;
  IF v_c.sessao_hash <> v_hash THEN
    RAISE EXCEPTION 'sessao_substituida' USING ERRCODE = 'HRA53';
  END IF;
  IF NOT public.hr_convite_sessao_valida(v_c.sessao_iniciada_em, v_c.sessao_ultima_atividade_em, now()) THEN
    RAISE EXCEPTION 'sessao_expirada' USING ERRCODE = 'HRA52';
  END IF;

  UPDATE public.pessoas_convites_admissao
     SET sessao_ultima_atividade_em = now()
   WHERE id = v_c.id;
END;
$$;

REVOKE ALL ON FUNCTION public.hr_convite_sessao_exigir(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_convite_sessao_exigir(uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.hr_convite_sessao_exigir(uuid, text) FROM authenticated;
REVOKE ALL ON FUNCTION public.hr_convite_sessao_exigir(uuid, text) FROM service_role;

COMMENT ON FUNCTION public.hr_convite_sessao_exigir(uuid, text) IS
'INTERNA, sem EXECUTE para nenhum papel (service_role incluido): so a chamam as RPCs SECURITY DEFINER da admissao. Exige a sessao activa do processo: p_sessao_hash, ou, se for nulo, o cabecalho x-portal-sessao de request.headers (SHA-256 hex). Recusas: sessao_ausente (HRA51), sessao_expirada (HRA52: terminada, nunca aberta ou fora da janela de hr_convite_sessao_valida), sessao_substituida (HRA53: outra sessao activa), nao_encontrado (HRA31). Renova sessao_ultima_atividade_em. Desde 20261210430000.';

-- O token em claro do link, para compor um email. Sem EXECUTE para ninguem.
CREATE FUNCTION public.hr_convite_link_token(p_convite_id uuid)
RETURNS text
LANGUAGE plpgsql STABLE
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_c     record;
  v_token text;
BEGIN
  SELECT c.id, c.estado, c.valid_until, c.used_at, c.revoked_at, c.portal_encerrado_em, c.link_segredo_id
    INTO v_c
    FROM public.pessoas_convites_admissao c
   WHERE c.id = p_convite_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'nao_encontrado' USING ERRCODE = 'HRA31';
  END IF;

  IF v_c.portal_encerrado_em IS NOT NULL OR v_c.used_at IS NOT NULL THEN
    RAISE EXCEPTION 'link_indisponivel' USING ERRCODE = 'HRA56';
  ELSIF v_c.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'convite_revogado' USING ERRCODE = 'HRA03';
  ELSIF NOT public.hr_convite_estado_aberto(v_c.estado) THEN
    RAISE EXCEPTION 'link_indisponivel' USING ERRCODE = 'HRA56';
  ELSIF v_c.valid_until <= now() THEN
    RAISE EXCEPTION 'convite_expirado' USING ERRCODE = 'HRA04';
  ELSIF v_c.link_segredo_id IS NULL THEN
    RAISE EXCEPTION 'link_indisponivel' USING ERRCODE = 'HRA56';
  END IF;

  SELECT s.decrypted_secret INTO v_token
    FROM vault.decrypted_secrets s
   WHERE s.id = v_c.link_segredo_id;
  IF v_token IS NULL THEN
    RAISE EXCEPTION 'link_indisponivel' USING ERRCODE = 'HRA56';
  END IF;

  RETURN v_token;
END;
$$;

REVOKE ALL ON FUNCTION public.hr_convite_link_token(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_convite_link_token(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.hr_convite_link_token(uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.hr_convite_link_token(uuid) FROM service_role;

COMMENT ON FUNCTION public.hr_convite_link_token(uuid) IS
'INTERNA, sem EXECUTE para nenhum papel (service_role incluido): devolve o token em claro do link do portal, lido no Vault, so com o portal ACTIVO. Chamada por dentro da rpc_hr_convite_admissao_reenviar (e, na V6, do lembrete). Recusas: nao_encontrado (HRA31), convite_revogado (HRA03), convite_expirado (HRA04), link_indisponivel (HRA56: portal encerrado, processo fechado, ou sem segredo guardado). Desde 20261210430000.';

-- O dominio da ficha de cada chave da revisao, e se o utilizador o pode ver.
-- Pura (o mapa de permissoes entra como argumento), para o bloco de conferir a
-- poder testar. Sem EXECUTE para nenhum papel: so a rever_ler a chama.
CREATE FUNCTION public.hr_admissao_revisao_visivel(p_chave text, p_perm jsonb)
RETURNS boolean
LANGUAGE sql IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $$
  -- Dominio (tabela da ficha) de: as 45 chaves da lista branca do rascunho (a
  -- tabela onde a submissao a escreve; as do ecra sem coluna propria seguem o
  -- dominio onde a pessoa as escreve); niss e iban (chaves que o RH pode
  -- devolver); e os 3 tipos de anexo (comprovativo_iban -> bancarios,
  -- cartao_cidadao -> identificacao, fotografia -> pessoais). p_perm e
  -- {tabela: boolean}, com as permissoes de hr_admissao_campo_permissao().
  -- Chave fora do mapa, ou dominio sem permissao: invisivel (falha fechada).
  SELECT coalesce((p_perm ->> ('{
      "email_pessoal": "pessoas", "assinatura_nome": "pessoas",
      "data_nascimento": "pessoas_dados_pessoais", "genero": "pessoas_dados_pessoais",
      "nacionalidade": "pessoas_dados_pessoais", "estado_civil": "pessoas_dados_pessoais",
      "dependentes": "pessoas_dados_pessoais", "dependentes_deficientes": "pessoas_dados_pessoais",
      "telefone_pessoal": "pessoas_dados_pessoais", "naturalidade_freguesia": "pessoas_dados_pessoais",
      "naturalidade_concelho": "pessoas_dados_pessoais", "naturalidade_pais": "pessoas_dados_pessoais",
      "conjuge_situacao_profissional": "pessoas_dados_pessoais", "habilitacao_academica": "pessoas_dados_pessoais",
      "habilitacao_data_conclusao": "pessoas_dados_pessoais",
      "tipo_documento": "pessoas_identificacao", "numero_documento": "pessoas_identificacao",
      "validade_documento": "pessoas_identificacao", "nif": "pessoas_identificacao",
      "carta_conducao_numero": "pessoas_identificacao", "carta_conducao_categorias": "pessoas_identificacao",
      "carta_conducao_validade": "pessoas_identificacao",
      "morada_linha1": "pessoas_moradas", "morada_linha2": "pessoas_moradas",
      "morada_codigo_postal": "pessoas_moradas", "morada_localidade": "pessoas_moradas",
      "morada_distrito": "pessoas_moradas", "morada_pais": "pessoas_moradas",
      "linha1": "pessoas_moradas", "linha2": "pessoas_moradas", "codigo_postal": "pessoas_moradas",
      "localidade": "pessoas_moradas", "distrito": "pessoas_moradas", "pais": "pessoas_moradas",
      "tamanho_cima": "pessoas_fardamento", "tamanho_cima_detalhe": "pessoas_fardamento",
      "tamanho_baixo": "pessoas_fardamento", "tamanho_baixo_detalhe": "pessoas_fardamento",
      "tamanho_calcado": "pessoas_fardamento", "tamanho_calcado_detalhe": "pessoas_fardamento",
      "conta_titular": "pessoas_dados_bancarios", "conta_banco": "pessoas_dados_bancarios",
      "conta_bic": "pessoas_dados_bancarios", "conta_swift": "pessoas_dados_bancarios",
      "conta_formato": "pessoas_dados_bancarios",
      "niss": "pessoas_identificacao", "iban": "pessoas_dados_bancarios",
      "cartao_cidadao": "pessoas_identificacao", "comprovativo_iban": "pessoas_dados_bancarios",
      "fotografia": "pessoas_dados_pessoais"
    }'::jsonb ->> p_chave))::boolean, false)
$$;

REVOKE ALL ON FUNCTION public.hr_admissao_revisao_visivel(text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_admissao_revisao_visivel(text, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.hr_admissao_revisao_visivel(text, jsonb) FROM authenticated;
REVOKE ALL ON FUNCTION public.hr_admissao_revisao_visivel(text, jsonb) FROM service_role;

COMMENT ON FUNCTION public.hr_admissao_revisao_visivel(text, jsonb) IS
'INTERNA, pura, sem EXECUTE para nenhum papel (service_role incluido): true se a chave da revisao (uma das 45 do rascunho, niss, iban, ou um tipo de anexo) pertence a um dominio da ficha que p_perm ({tabela: boolean}) deixa ver. Chave fora do mapa: false. Usada pela rpc_hr_admissao_rever_ler nos campos, na devolucao e nos anexos. Desde 20261210430000.';

-- ==============================================================================
-- 3. RPCs do portal (so service_role; a Edge valida e chama)
-- ==============================================================================

-- 3.1 Guardar o token do link no Vault, logo a seguir a _criar.
CREATE FUNCTION public.rpc_hr_convite_link_guardar(p_convite_id uuid, p_token text)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_c  record;
  v_id uuid;
BEGIN
  IF p_token IS NULL OR length(p_token) < 32 OR length(p_token) > 200 THEN
    RAISE EXCEPTION 'token_invalido' USING ERRCODE = 'HRA34';
  END IF;

  SELECT c.id, c.token_hash, c.estado, c.revoked_at, c.portal_encerrado_em, c.used_at, c.link_segredo_id
    INTO v_c
    FROM public.pessoas_convites_admissao c
   WHERE c.id = p_convite_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'nao_encontrado' USING ERRCODE = 'HRA31';
  END IF;

  -- O mesmo hash que a Edge calcula: SHA-256 hex do texto em UTF-8.
  IF encode(sha256(convert_to(p_token, 'UTF8')), 'hex') IS DISTINCT FROM v_c.token_hash THEN
    RAISE EXCEPTION 'token_invalido' USING ERRCODE = 'HRA34';
  END IF;

  IF v_c.link_segredo_id IS NOT NULL
     OR NOT public.hr_convite_estado_aberto(v_c.estado)
     OR v_c.revoked_at IS NOT NULL
     OR v_c.portal_encerrado_em IS NOT NULL
     OR v_c.used_at IS NOT NULL THEN
    RAISE EXCEPTION 'estado_invalido' USING ERRCODE = 'HRA38';
  END IF;

  v_id := vault.create_secret(
    p_token,
    'hr_convite_link:' || v_c.id::text || ':' || gen_random_uuid()::text,
    'Link do portal de admissao do processo ' || v_c.id::text);

  UPDATE public.pessoas_convites_admissao
     SET link_segredo_id = v_id
   WHERE id = v_c.id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_hr_convite_link_guardar(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_hr_convite_link_guardar(uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.rpc_hr_convite_link_guardar(uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_convite_link_guardar(uuid, text) TO service_role;

COMMENT ON FUNCTION public.rpc_hr_convite_link_guardar(uuid, text) IS
'SO service_role: a Edge convite-admissao chama-a logo a seguir a _criar, com o token que acabou de gerar. Confirma que SHA-256(p_token) e o token_hash do processo (senao token_invalido, HRA34) e guarda o token cifrado no Vault (link_segredo_id). Recusa com estado_invalido (HRA38) se ja ha segredo, ou se o processo nao esta aberto ou tem o portal revogado/encerrado. nao_encontrado (HRA31). A _criar nao muda. Desde 20261210430000.';

-- 3.2 Pedir um OTP do portal.
CREATE FUNCTION public.rpc_hr_convite_admissao_otp_pedir(p_token_hash text, p_otp_hmac text)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  c_tecto    constant integer  := 10;
  c_max_dia  constant integer  := 10;
  c_espera   constant interval := interval '60 seconds';
  c_janela   constant interval := interval '24 hours';
  c_validade constant interval := interval '10 minutes';
  c_falhas_dia constant integer := 15;
  v_c      record;
  v_n      integer;
  v_ultimo timestamptz;
  v_expira timestamptz := now() + c_validade;
BEGIN
  IF p_otp_hmac IS NULL OR p_otp_hmac !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'pedido_invalido' USING ERRCODE = 'HRA10';
  END IF;

  SELECT c.id, c.organization_id, c.estado, c.email_destino, c.valid_until, c.used_at,
         c.revoked_at, c.portal_encerrado_em, c.attempts
    INTO v_c
    FROM public.pessoas_convites_admissao c
   WHERE c.token_hash = p_token_hash
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'nao_encontrado' USING ERRCODE = 'HRA31';
  END IF;

  IF v_c.portal_encerrado_em IS NOT NULL OR v_c.used_at IS NOT NULL THEN
    RAISE EXCEPTION 'convite_ja_usado' USING ERRCODE = 'HRA02';
  ELSIF v_c.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'convite_revogado' USING ERRCODE = 'HRA03';
  ELSIF v_c.valid_until <= now() THEN
    RAISE EXCEPTION 'convite_expirado' USING ERRCODE = 'HRA04';
  ELSIF v_c.attempts >= c_tecto THEN
    RAISE EXCEPTION 'convite_bloqueado' USING ERRCODE = 'HRA05';
  END IF;

  -- So ha OTP (e sessao) nos estados em que a pessoa pode editar.
  IF v_c.estado NOT IN ('convidada', 'em_preenchimento', 'devolvida') THEN
    RAISE EXCEPTION 'estado_invalido' USING ERRCODE = 'HRA38';
  END IF;

  -- Os limites contam-se pelos eventos (desenho H8): o FOR UPDATE acima poe os
  -- pedidos concorrentes em fila; regenerar o link nao reinicia a contagem.
  SELECT count(*), max(e.criado_em) INTO v_n, v_ultimo
    FROM public.pessoas_convites_admissao_eventos e
   WHERE e.convite_id = v_c.id
     AND e.criado_em > now() - c_janela
     AND e.acao = 'otp_pedido'
     AND e.metadados ->> 'tipo' = 'portal';
  IF v_n >= c_max_dia THEN
    RAISE EXCEPTION 'otp_limite_diario' USING ERRCODE = 'HRA43';
  END IF;
  IF v_ultimo IS NOT NULL AND v_ultimo > now() - c_espera THEN
    RAISE EXCEPTION 'otp_espera' USING ERRCODE = 'HRA42';
  END IF;

  -- Tecto agregado (o mesmo da otp_verificar): com 15 ou mais otp_falhado do
  -- processo nas ultimas 24 h nao se grava nem se envia codigo novo.
  SELECT count(*) INTO v_n
    FROM public.pessoas_convites_admissao_eventos e
   WHERE e.convite_id = v_c.id
     AND e.criado_em > now() - c_janela
     AND e.acao = 'otp_falhado';
  IF v_n >= c_falhas_dia THEN
    RAISE EXCEPTION 'otp_bloqueado' USING ERRCODE = 'HRA45';
  END IF;

  UPDATE public.pessoas_convites_admissao
     SET otp_hmac       = p_otp_hmac,
         otp_expira_em  = v_expira,
         otp_tentativas = 0
   WHERE id = v_c.id;

  INSERT INTO public.pessoas_convites_admissao_eventos
    (convite_id, organization_id, acao, ator_tipo, ator_id, estado_anterior, estado_posterior, metadados)
  VALUES
    (v_c.id, v_c.organization_id, 'otp_pedido', 'pessoa', NULL, v_c.estado, v_c.estado,
     jsonb_build_object('tipo', 'portal'));

  -- Fica na Edge: o email e a organizacao nunca vao para o browser.
  RETURN jsonb_build_object('email_destino', v_c.email_destino,
                            'organization_id', v_c.organization_id,
                            'expira_em', v_expira);
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_hr_convite_admissao_otp_pedir(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_hr_convite_admissao_otp_pedir(text, text) FROM anon;
REVOKE ALL ON FUNCTION public.rpc_hr_convite_admissao_otp_pedir(text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_convite_admissao_otp_pedir(text, text) TO service_role;

COMMENT ON FUNCTION public.rpc_hr_convite_admissao_otp_pedir(text, text) IS
'SO service_role. Grava o HMAC (calculado na Edge com um pepper) de um OTP novo do portal, valido 10 minutos, e repoe otp_tentativas a 0; evento otp_pedido {tipo: portal}. Devolve {email_destino, organization_id, expira_em} SO para a Edge enviar o codigo (nunca para o browser). So nos estados editaveis (convidada, em_preenchimento, devolvida; senao estado_invalido, HRA38). Limites pelos eventos: 10 ou mais nas ultimas 24 h moveis -> otp_limite_diario (HRA43); menos de 60 s desde o ultimo -> otp_espera (HRA42); 15 ou mais otp_falhado do processo nas ultimas 24 h -> otp_bloqueado (HRA45), sem gravar nem enviar codigo. Recusas do portal: nao_encontrado (HRA31), convite_ja_usado (HRA02: encerrado), convite_revogado (HRA03), convite_expirado (HRA04), convite_bloqueado (HRA05); HMAC mal formado: pedido_invalido (HRA10). Desde 20261210430000.';

-- 3.3 Verificar o OTP e abrir a sessao.
CREATE FUNCTION public.rpc_hr_convite_admissao_otp_verificar(p_token_hash text, p_otp_hmac text, p_sessao_hash text)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  c_tecto        constant integer  := 10;
  c_max          constant integer  := 5;
  c_meta_max     constant integer  := 1000;
  c_inatividade  constant interval := interval '30 minutes';
  c_janela       constant interval := interval '24 hours';
  c_falhas_dia   constant integer  := 15;
  v_c       record;
  v_t       integer;
  v_falhas  integer;
  v_novo    text;
  v_ativa   boolean;
BEGIN
  IF p_otp_hmac IS NULL OR p_otp_hmac !~ '^[0-9a-f]{64}$'
     OR p_sessao_hash IS NULL OR p_sessao_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'pedido_invalido' USING ERRCODE = 'HRA10';
  END IF;

  SELECT c.id, c.organization_id, c.estado, c.valid_until, c.used_at, c.revoked_at,
         c.portal_encerrado_em, c.attempts, c.otp_hmac, c.otp_expira_em, c.otp_tentativas,
         c.sessao_hash, c.sessao_iniciada_em, c.sessao_ultima_atividade_em
    INTO v_c
    FROM public.pessoas_convites_admissao c
   WHERE c.token_hash = p_token_hash
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'nao_encontrado' USING ERRCODE = 'HRA31';
  END IF;

  IF v_c.portal_encerrado_em IS NOT NULL OR v_c.used_at IS NOT NULL THEN
    RAISE EXCEPTION 'convite_ja_usado' USING ERRCODE = 'HRA02';
  ELSIF v_c.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'convite_revogado' USING ERRCODE = 'HRA03';
  ELSIF v_c.valid_until <= now() THEN
    RAISE EXCEPTION 'convite_expirado' USING ERRCODE = 'HRA04';
  ELSIF v_c.attempts >= c_tecto THEN
    RAISE EXCEPTION 'convite_bloqueado' USING ERRCODE = 'HRA05';
  END IF;

  IF v_c.estado NOT IN ('convidada', 'em_preenchimento', 'devolvida') THEN
    RAISE EXCEPTION 'estado_invalido' USING ERRCODE = 'HRA38';
  END IF;

  -- Primeiro conta a tentativa; os erros seguintes saem em jsonb (sem RAISE),
  -- para este incremento ficar gravado.
  v_t := least(v_c.otp_tentativas + 1, c_meta_max);
  UPDATE public.pessoas_convites_admissao
     SET otp_tentativas = v_t
   WHERE id = v_c.id;

  IF v_c.otp_hmac IS NULL OR v_c.otp_expira_em IS NULL OR v_c.otp_expira_em <= now() THEN
    RETURN jsonb_build_object('erro', 'otp_expirado', 'restantes', 0);
  END IF;

  -- Tecto AGREGADO: 10 pedidos x 5 tentativas dariam 50 palpites por dia. Com 15
  -- ou mais falhas do processo nas ultimas 24 h, recusa sem comparar.
  SELECT count(*) INTO v_falhas
    FROM public.pessoas_convites_admissao_eventos e
   WHERE e.convite_id = v_c.id
     AND e.criado_em > now() - c_janela
     AND e.acao = 'otp_falhado';
  IF v_falhas >= c_falhas_dia THEN
    RETURN jsonb_build_object('erro', 'otp_bloqueado', 'restantes', 0);
  END IF;

  -- A 6.a tentativa e recusada mesmo com o codigo certo. So a PRIMEIRA tentativa
  -- excedente grava otp_falhado: o tecto agregado conta-a uma vez por OTP, e as
  -- seguintes sobre o mesmo OTP bloqueado nao enchem o historico.
  IF v_t > c_max THEN
    IF v_t = c_max + 1 THEN
      INSERT INTO public.pessoas_convites_admissao_eventos
        (convite_id, organization_id, acao, ator_tipo, ator_id, estado_anterior, estado_posterior, metadados)
      VALUES
        (v_c.id, v_c.organization_id, 'otp_falhado', 'pessoa', NULL, v_c.estado, v_c.estado,
         jsonb_build_object('tentativas', v_t, 'erro_codigo', 'otp_bloqueado'));
    END IF;
    RETURN jsonb_build_object('erro', 'otp_bloqueado', 'restantes', 0);
  END IF;

  IF v_c.otp_hmac <> p_otp_hmac THEN
    INSERT INTO public.pessoas_convites_admissao_eventos
      (convite_id, organization_id, acao, ator_tipo, ator_id, estado_anterior, estado_posterior, metadados)
    VALUES
      (v_c.id, v_c.organization_id, 'otp_falhado', 'pessoa', NULL, v_c.estado, v_c.estado,
       jsonb_build_object('tentativas', v_t));
    RETURN jsonb_build_object('erro', 'otp_invalido', 'restantes', greatest(c_max - v_t, 0));
  END IF;

  -- Certo: uso unico, sessao nova (substitui a anterior), primeira transicao.
  v_ativa := v_c.sessao_hash IS NOT NULL
         AND v_c.sessao_hash <> p_sessao_hash
         AND public.hr_convite_sessao_valida(v_c.sessao_iniciada_em, v_c.sessao_ultima_atividade_em, now());
  v_novo := CASE WHEN v_c.estado = 'convidada' THEN 'em_preenchimento' ELSE v_c.estado END;

  BEGIN
    UPDATE public.pessoas_convites_admissao
       SET otp_hmac                   = NULL,
           otp_expira_em              = NULL,
           otp_tentativas             = 0,
           sessao_hash                = p_sessao_hash,
           sessao_iniciada_em         = now(),
           sessao_ultima_atividade_em = now(),
           sessao_falhas              = 0,
           estado                     = v_novo
     WHERE id = v_c.id;
  EXCEPTION WHEN unique_violation THEN
    -- A sessao de outro processo com o mesmo hash. Sai em jsonb (sem RAISE) para
    -- nao desfazer o incremento de otp_tentativas; o OTP fica por consumir e a
    -- Edge gera outra sessao. Nunca se reenvia o DETAIL.
    RETURN jsonb_build_object('erro', 'pedido_invalido', 'restantes', greatest(c_max - v_t, 0));
  END;

  IF v_ativa THEN
    INSERT INTO public.pessoas_convites_admissao_eventos
      (convite_id, organization_id, acao, ator_tipo, ator_id, estado_anterior, estado_posterior, metadados)
    VALUES
      (v_c.id, v_c.organization_id, 'sessao_substituida', 'pessoa', NULL, v_c.estado, v_c.estado, '{}'::jsonb);
  END IF;

  INSERT INTO public.pessoas_convites_admissao_eventos
    (convite_id, organization_id, acao, ator_tipo, ator_id, estado_anterior, estado_posterior, metadados)
  VALUES
    (v_c.id, v_c.organization_id, 'otp_validado', 'pessoa', NULL, v_c.estado, v_novo,
     jsonb_build_object('tipo', 'portal', 'tentativas', v_t)),
    (v_c.id, v_c.organization_id, 'sessao_iniciada', 'pessoa', NULL, v_novo, v_novo, '{}'::jsonb);

  RETURN jsonb_build_object('ok', true, 'sessao_expira_em', now() + c_inatividade);
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_hr_convite_admissao_otp_verificar(text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_hr_convite_admissao_otp_verificar(text, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.rpc_hr_convite_admissao_otp_verificar(text, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_convite_admissao_otp_verificar(text, text, text) TO service_role;

COMMENT ON FUNCTION public.rpc_hr_convite_admissao_otp_verificar(text, text, text) IS
'SO service_role. So nos estados editaveis (convidada, em_preenchimento, devolvida; senao estado_invalido, HRA38, por RAISE). Incrementa otp_tentativas ANTES de comparar e devolve os erros em jsonb para o incremento ficar gravado: {erro: otp_expirado (HRA44: sem OTP ou expirado), restantes 0}; {erro: otp_bloqueado (HRA45: 6.a tentativa, mesmo com o codigo certo; ou 15 ou mais otp_falhado do processo nas ultimas 24 h, tecto agregado, sem comparar), restantes 0}; {erro: otp_invalido (HRA46), restantes = 5 - tentativas}, com evento otp_falhado {tentativas} (o bloqueado so na 6.a tentativa, com erro_codigo; as seguintes nao gravam). Certo: apaga o OTP (uso unico), abre a sessao p_sessao_hash (SHA-256 hex), substitui a anterior (evento sessao_substituida se ainda era valida), convidada passa a em_preenchimento, eventos otp_validado e sessao_iniciada; devolve {ok, sessao_expira_em}. Recusas do portal por RAISE: HRA31, HRA02, HRA03, HRA04, HRA05; argumentos mal formados: pedido_invalido (HRA10) por RAISE; hash de sessao em uso noutro processo: {erro: pedido_invalido} em jsonb, para o incremento ficar. Desde 20261210430000.';

-- 3.4 Terminar a sessao (sair).
CREATE FUNCTION public.rpc_hr_convite_admissao_sessao_terminar(p_token_hash text, p_sessao_hash text)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_c         record;
  v_terminada boolean := false;
BEGIN
  IF p_sessao_hash IS NULL OR p_sessao_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'pedido_invalido' USING ERRCODE = 'HRA10';
  END IF;

  SELECT c.id, c.sessao_hash INTO v_c
    FROM public.pessoas_convites_admissao c
   WHERE c.token_hash = p_token_hash
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'nao_encontrado' USING ERRCODE = 'HRA31';
  END IF;

  -- So a sessao activa se termina; outra sessao nao mexe nela.
  IF v_c.sessao_hash = p_sessao_hash THEN
    UPDATE public.pessoas_convites_admissao
       SET sessao_hash                = NULL,
           sessao_iniciada_em         = NULL,
           sessao_ultima_atividade_em = NULL
     WHERE id = v_c.id;
    v_terminada := true;
  END IF;

  RETURN jsonb_build_object('ok', true, 'terminada', v_terminada);
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_hr_convite_admissao_sessao_terminar(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_hr_convite_admissao_sessao_terminar(text, text) FROM anon;
REVOKE ALL ON FUNCTION public.rpc_hr_convite_admissao_sessao_terminar(text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_convite_admissao_sessao_terminar(text, text) TO service_role;

COMMENT ON FUNCTION public.rpc_hr_convite_admissao_sessao_terminar(text, text) IS
'SO service_role (accao sair). Apaga a sessao do portal se p_sessao_hash for a activa; devolve {ok, terminada}. Nao exige portal activo. nao_encontrado (HRA31), pedido_invalido (HRA10). Desde 20261210430000.';

-- 3.5 Ler o processo com sessao: monta o formulario do portal.
CREATE FUNCTION public.rpc_hr_convite_admissao_portal_ler(p_token_hash text, p_sessao_hash text)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  c_tecto constant integer := 10;
  -- Copia da lista branca de hr_convite_rascunho_valido (20261210420000); o
  -- bloco de conferir compara-a, chave a chave, com o comportamento da funcao.
  c_chaves constant text[] := ARRAY[
    'assinatura_nome', 'carta_conducao_categorias', 'carta_conducao_numero',
    'carta_conducao_validade', 'codigo_postal', 'conjuge_situacao_profissional',
    'conta_banco', 'conta_bic', 'conta_formato', 'conta_swift', 'conta_titular',
    'data_nascimento', 'dependentes', 'dependentes_deficientes', 'distrito',
    'email_pessoal', 'estado_civil', 'genero', 'habilitacao_academica',
    'habilitacao_data_conclusao', 'linha1', 'linha2', 'localidade',
    'morada_codigo_postal', 'morada_distrito', 'morada_linha1', 'morada_linha2',
    'morada_localidade', 'morada_pais', 'nacionalidade', 'naturalidade_concelho',
    'naturalidade_freguesia', 'naturalidade_pais', 'nif', 'numero_documento',
    'pais', 'tamanho_baixo', 'tamanho_baixo_detalhe', 'tamanho_calcado',
    'tamanho_calcado_detalhe', 'tamanho_cima', 'tamanho_cima_detalhe',
    'telefone_pessoal', 'tipo_documento', 'validade_documento'];
  c_tipos constant text[] := ARRAY['cartao_cidadao', 'comprovativo_iban', 'fotografia'];
  v_c          record;
  v_niss4      text;
  v_iban4      text;
  v_campos_dev jsonb;
  v_docs_dev   jsonb;
  v_editaveis  jsonb;
  v_docs       jsonb;
  v_obrig      jsonb;
  v_anexos     jsonb;
BEGIN
  SELECT c.id, c.organization_id, c.estado, c.valid_until, c.used_at, c.revoked_at,
         c.portal_encerrado_em, c.attempts, c.rascunho, c.devolucao, c.rejeicao_mensagem,
         c.niss_segredo_id, c.iban_segredo_id
    INTO v_c
    FROM public.pessoas_convites_admissao c
   WHERE c.token_hash = p_token_hash
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'nao_encontrado' USING ERRCODE = 'HRA31';
  END IF;

  IF v_c.portal_encerrado_em IS NOT NULL OR v_c.used_at IS NOT NULL THEN
    RAISE EXCEPTION 'convite_ja_usado' USING ERRCODE = 'HRA02';
  ELSIF v_c.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'convite_revogado' USING ERRCODE = 'HRA03';
  ELSIF v_c.valid_until <= now() THEN
    RAISE EXCEPTION 'convite_expirado' USING ERRCODE = 'HRA04';
  ELSIF v_c.attempts >= c_tecto THEN
    RAISE EXCEPTION 'convite_bloqueado' USING ERRCODE = 'HRA05';
  END IF;

  PERFORM public.hr_convite_sessao_exigir(v_c.id, p_sessao_hash);

  -- As mascaras calculam-se aqui, a partir do Vault; o valor nunca sai.
  IF v_c.niss_segredo_id IS NOT NULL THEN
    SELECT right(s.decrypted_secret, 4) INTO v_niss4 FROM vault.decrypted_secrets s WHERE s.id = v_c.niss_segredo_id;
  END IF;
  IF v_c.iban_segredo_id IS NOT NULL THEN
    SELECT right(s.decrypted_secret, 4) INTO v_iban4 FROM vault.decrypted_secrets s WHERE s.id = v_c.iban_segredo_id;
  END IF;

  v_campos_dev := CASE WHEN jsonb_typeof(v_c.devolucao -> 'campos') = 'object'
                       THEN v_c.devolucao -> 'campos' ELSE '{}'::jsonb END;
  v_docs_dev   := CASE WHEN jsonb_typeof(v_c.devolucao -> 'documentos') = 'array'
                       THEN v_c.devolucao -> 'documentos' ELSE '[]'::jsonb END;

  IF v_c.estado = 'em_preenchimento' THEN
    v_editaveis := to_jsonb(c_chaves || ARRAY['niss', 'iban']);
    v_docs      := to_jsonb(c_tipos);
  ELSIF v_c.estado = 'devolvida' THEN
    SELECT coalesce(jsonb_agg(k.chave ORDER BY k.chave), '[]'::jsonb) INTO v_editaveis
      FROM jsonb_object_keys(v_campos_dev) AS k(chave);
    SELECT coalesce(jsonb_agg(d.tipo ORDER BY d.tipo), '[]'::jsonb) INTO v_docs
      FROM jsonb_array_elements_text(v_docs_dev) AS d(tipo)
     WHERE d.tipo = ANY (c_tipos);
  ELSE
    v_editaveis := '[]'::jsonb;
    v_docs      := '[]'::jsonb;
  END IF;

  SELECT coalesce(jsonb_agg(o.codigo ORDER BY o.codigo), '[]'::jsonb) INTO v_obrig
    FROM public.hr_admissao_campos_obrigatorios_org(v_c.organization_id) o
   WHERE o.origem = 'pessoa' AND o.posicao = 'convite';

  SELECT coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'tipo', a.tipo, 'nome', a.nome_original,
                                               'estado', a.estado) ORDER BY a.criado_em, a.id), '[]'::jsonb)
    INTO v_anexos
    FROM public.pessoas_anexos a
   WHERE a.convite_id = v_c.id
     AND a.organization_id = v_c.organization_id
     AND a.estado IN ('pendente', 'ligado');

  -- Nunca o motivo interno, o email, o token, a sessao nem o OTP.
  RETURN jsonb_build_object(
    'estado',               v_c.estado,
    'rascunho',             coalesce(v_c.rascunho, '{}'::jsonb),
    'campos_obrigatorios',  v_obrig,
    'campos_editaveis',     v_editaveis,
    'documentos_editaveis', v_docs,
    'niss_ultimos4',        v_niss4,
    'iban_ultimos4',        v_iban4,
    'devolucao',            CASE WHEN v_c.devolucao IS NULL THEN NULL
                                 ELSE jsonb_build_object('campos', v_campos_dev,
                                                         'documentos', v_docs_dev,
                                                         'observacao', v_c.devolucao -> 'observacao') END,
    'anexos',               v_anexos,
    'rejeicao_mensagem',    CASE WHEN v_c.estado = 'rejeitada' THEN v_c.rejeicao_mensagem END);
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_hr_convite_admissao_portal_ler(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_hr_convite_admissao_portal_ler(text, text) FROM anon;
REVOKE ALL ON FUNCTION public.rpc_hr_convite_admissao_portal_ler(text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_convite_admissao_portal_ler(text, text) TO service_role;

COMMENT ON FUNCTION public.rpc_hr_convite_admissao_portal_ler(text, text) IS
'SO service_role (accao ler). Exige a sessao do portal (HRA51 a HRA53) e o portal activo (HRA31, HRA02 a HRA05). Devolve {estado, rascunho, campos_obrigatorios [codigos de origem pessoa e posicao convite], campos_editaveis (as 45 chaves da lista branca mais niss e iban em em_preenchimento; so as de devolucao.campos em devolvida; nenhuma nos outros), documentos_editaveis, niss_ultimos4, iban_ultimos4 (do Vault), devolucao {campos, documentos, observacao}, anexos [{id, tipo, nome, estado}] pendentes e ligados, rejeicao_mensagem}. Nunca o motivo interno, o email, o token, a sessao nem o OTP. Renova a actividade da sessao. Desde 20261210430000.';

-- 3.6 Gravar NISS e IBAN no Vault (staging do processo).
CREATE FUNCTION public.rpc_hr_convite_admissao_sensiveis_gravar(
  p_token_hash  text,
  p_sessao_hash text,
  p_niss        text,
  p_iban        text
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  c_tecto constant integer := 10;
  v_c       record;
  v_niss    text := nullif(regexp_replace(coalesce(p_niss, ''), '[[:space:]]', '', 'g'), '');
  v_iban    text := nullif(upper(regexp_replace(coalesce(p_iban, ''), '[[:space:]]', '', 'g')), '');
  v_campos  jsonb;
  v_niss_id uuid;
  v_iban_id uuid;
  v_niss4   text;
  v_iban4   text;
BEGIN
  SELECT c.id, c.estado, c.valid_until, c.used_at, c.revoked_at, c.portal_encerrado_em,
         c.attempts, c.devolucao, c.niss_segredo_id, c.iban_segredo_id
    INTO v_c
    FROM public.pessoas_convites_admissao c
   WHERE c.token_hash = p_token_hash
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'nao_encontrado' USING ERRCODE = 'HRA31';
  END IF;

  IF v_c.portal_encerrado_em IS NOT NULL OR v_c.used_at IS NOT NULL THEN
    RAISE EXCEPTION 'convite_ja_usado' USING ERRCODE = 'HRA02';
  ELSIF v_c.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'convite_revogado' USING ERRCODE = 'HRA03';
  ELSIF v_c.valid_until <= now() THEN
    RAISE EXCEPTION 'convite_expirado' USING ERRCODE = 'HRA04';
  ELSIF v_c.attempts >= c_tecto THEN
    RAISE EXCEPTION 'convite_bloqueado' USING ERRCODE = 'HRA05';
  END IF;

  PERFORM public.hr_convite_sessao_exigir(v_c.id, p_sessao_hash);

  IF v_c.estado NOT IN ('em_preenchimento', 'devolvida') THEN
    RAISE EXCEPTION 'estado_invalido' USING ERRCODE = 'HRA38';
  END IF;

  -- Em devolvida so se corrige o que o RH devolveu.
  IF v_c.estado = 'devolvida' THEN
    v_campos := CASE WHEN jsonb_typeof(v_c.devolucao -> 'campos') = 'object'
                     THEN v_c.devolucao -> 'campos' ELSE '{}'::jsonb END;
    IF (v_niss IS NOT NULL AND NOT (v_campos ? 'niss'))
       OR (v_iban IS NOT NULL AND NOT (v_campos ? 'iban')) THEN
      RAISE EXCEPTION 'campo_bloqueado' USING ERRCODE = 'HRA47';
    END IF;
  END IF;

  IF v_niss IS NOT NULL AND NOT public.hr_niss_valido(v_niss) THEN
    RAISE EXCEPTION 'niss_invalido' USING ERRCODE = 'HRA12';
  END IF;
  IF v_iban IS NOT NULL AND NOT public.hr_iban_valido(v_iban) THEN
    RAISE EXCEPTION 'iban_invalido' USING ERRCODE = 'HRA16';
  END IF;

  v_niss_id := v_c.niss_segredo_id;
  v_iban_id := v_c.iban_segredo_id;

  IF v_niss IS NOT NULL THEN
    IF v_niss_id IS NOT NULL THEN
      PERFORM vault.update_secret(v_niss_id, v_niss);
    ELSE
      v_niss_id := vault.create_secret(
        v_niss,
        'hr_convite_niss:' || v_c.id::text || ':' || gen_random_uuid()::text,
        'NISS dado no portal de admissao (processo ' || v_c.id::text || ')');
    END IF;
  END IF;

  IF v_iban IS NOT NULL THEN
    IF v_iban_id IS NOT NULL THEN
      PERFORM vault.update_secret(v_iban_id, v_iban);
    ELSE
      v_iban_id := vault.create_secret(
        v_iban,
        'hr_convite_iban:' || v_c.id::text || ':' || gen_random_uuid()::text,
        'IBAN dado no portal de admissao (processo ' || v_c.id::text || ')');
    END IF;
  END IF;

  UPDATE public.pessoas_convites_admissao
     SET niss_segredo_id = v_niss_id,
         iban_segredo_id = v_iban_id
   WHERE id = v_c.id;

  IF v_niss IS NOT NULL THEN
    v_niss4 := right(v_niss, 4);
  ELSIF v_niss_id IS NOT NULL THEN
    SELECT right(s.decrypted_secret, 4) INTO v_niss4 FROM vault.decrypted_secrets s WHERE s.id = v_niss_id;
  END IF;
  IF v_iban IS NOT NULL THEN
    v_iban4 := right(v_iban, 4);
  ELSIF v_iban_id IS NOT NULL THEN
    SELECT right(s.decrypted_secret, 4) INTO v_iban4 FROM vault.decrypted_secrets s WHERE s.id = v_iban_id;
  END IF;

  RETURN jsonb_build_object('niss_ultimos4', v_niss4, 'iban_ultimos4', v_iban4);
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_hr_convite_admissao_sensiveis_gravar(text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_hr_convite_admissao_sensiveis_gravar(text, text, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.rpc_hr_convite_admissao_sensiveis_gravar(text, text, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_convite_admissao_sensiveis_gravar(text, text, text, text) TO service_role;

COMMENT ON FUNCTION public.rpc_hr_convite_admissao_sensiveis_gravar(text, text, text, text) IS
'SO service_role (accao sensiveis). Exige a sessao do portal (HRA51 a HRA53), o portal activo (HRA31, HRA02 a HRA05) e o estado em_preenchimento ou devolvida (HRA38); em devolvida, niss ou iban fora de devolucao.campos dao campo_bloqueado (HRA47). Valida o NISS (HRA12) e o IBAN (HRA16) e grava-os no Vault (niss_segredo_id, iban_segredo_id): STAGING do processo, NAO escreve na ficha. NULL ou vazio = nao mexer. Devolve so as mascaras {niss_ultimos4, iban_ultimos4}. Desde 20261210430000.';

-- 3.7 Reenviar o MESMO link (accao do RH, pela Edge com p_actor do JWT).
CREATE FUNCTION public.rpc_hr_convite_admissao_reenviar(
  p_convite_id      uuid,
  p_organization_id uuid,
  p_actor           uuid
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  c_limite_hora    constant integer := 60;
  c_reenvios_hora  constant integer := 3;
  v_anew  uuid;
  v_org   uuid;
  v_c     record;
  v_token text;
  v_n     integer;
BEGIN
  -- Sob service_role auth.uid() e nulo: o actor e o p_actor que a Edge tirou do JWT.
  IF p_actor IS NULL THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
  END IF;
  SELECT au.id INTO v_anew FROM public.anew_users au WHERE au.auth_user_id = p_actor LIMIT 1;
  IF v_anew IS NULL THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
  END IF;

  -- Serializa as chamadas concorrentes do mesmo actor ate ao fim da transaccao,
  -- para a contagem dos 60 e a insercao do evento nao se cruzarem.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_actor::text, 0));
  SELECT count(*) INTO v_n
    FROM public.pessoas_convites_admissao_eventos e
   WHERE e.ator_id = p_actor AND e.criado_em > now() - interval '1 hour';
  IF v_n >= c_limite_hora THEN
    RAISE EXCEPTION 'limite_excedido' USING ERRCODE = 'HRA41';
  END IF;

  SELECT c.organization_id INTO v_org
    FROM public.pessoas_convites_admissao c
   WHERE c.id = p_convite_id;
  IF v_org IS NULL
     OR p_organization_id IS NULL
     OR v_org <> p_organization_id
     OR NOT public.has_anew_permission_in_org(p_actor, 'hr.pessoas.convite.enviar', v_org) THEN
    RAISE EXCEPTION 'nao_encontrado' USING ERRCODE = 'HRA31';
  END IF;

  IF NOT public.hr_organizacao_empregadora(v_org) THEN
    RAISE EXCEPTION 'organizacao_nao_empregadora' USING ERRCODE = 'HRA33';
  END IF;

  SELECT c.id, c.estado, c.email_destino, c.valid_until INTO v_c
    FROM public.pessoas_convites_admissao c
   WHERE c.id = p_convite_id AND c.organization_id = v_org
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'nao_encontrado' USING ERRCODE = 'HRA31';
  END IF;

  -- Tecto por processo: 3 reenvios por hora (o FOR UPDATE acima serializa).
  SELECT count(*) INTO v_n
    FROM public.pessoas_convites_admissao_eventos e
   WHERE e.convite_id = v_c.id
     AND e.acao = 'reenviado'
     AND e.criado_em > now() - interval '1 hour';
  IF v_n >= c_reenvios_hora THEN
    RAISE EXCEPTION 'limite_excedido' USING ERRCODE = 'HRA41';
  END IF;

  -- HRA03, HRA04 ou HRA56 se o portal nao estiver activo.
  v_token := public.hr_convite_link_token(v_c.id);

  INSERT INTO public.pessoas_convites_admissao_eventos
    (convite_id, organization_id, acao, ator_tipo, ator_id, estado_anterior, estado_posterior, metadados)
  VALUES
    (v_c.id, v_org, 'reenviado', 'rh', p_actor, v_c.estado, v_c.estado, '{}'::jsonb);

  -- O token so serve a Edge para compor o email: nunca vai para o browser.
  RETURN jsonb_build_object('token', v_token,
                            'email_destino', v_c.email_destino,
                            'valid_until', v_c.valid_until,
                            'organization_id', v_org);
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_hr_convite_admissao_reenviar(uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_hr_convite_admissao_reenviar(uuid, uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.rpc_hr_convite_admissao_reenviar(uuid, uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_convite_admissao_reenviar(uuid, uuid, uuid) TO service_role;

COMMENT ON FUNCTION public.rpc_hr_convite_admissao_reenviar(uuid, uuid, uuid) IS
'SO service_role (accao reenviar do RH): a Edge valida o JWT e passa p_actor (auth.users.id). Por dentro: p_actor tem de ser utilizador da aplicacao (42501), p_organization_id tem de ser a organizacao do processo e p_actor tem de ter hr.pessoas.convite.enviar nela (senao nao_encontrado, HRA31); work organization (HRA33); limite_excedido (HRA41) com 60 eventos por hora do actor (o reenvio conta para esse limite) ou 3 reenvios por hora do mesmo processo. Le o token pela hr_convite_link_token: convite_revogado (HRA03), convite_expirado (HRA04), link_indisponivel (HRA56). Evento reenviado. Devolve {token, email_destino, valid_until, organization_id} SO para a Edge compor o email: o token nunca vai para o browser. O link e o MESMO; o prazo nao muda. Desde 20261210430000.';

-- ==============================================================================
-- 4. rpc_hr_convite_admissao_estado: so o minimo publico
--    MESMA assinatura (text), MESMO retorno (jsonb), MESMOS grants (so
--    service_role) e mesma volatilidade da versao de 20261210020000 (confirmada
--    na dev). Mantem o padrao {erro} e o incremento de attempts.
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.rpc_hr_convite_admissao_estado(p_token_hash text)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  c_tecto   constant integer := 10;
  c_otp_max constant integer := 5;
  c_falhas_dia constant integer := 15;
  v_convite   record;
  v_motivo    text;
  v_primeiro  text;
  v_org_nome  text;
  v_hdr       text;
  v_sessao    text;
  v_sessao_ok boolean := false;
BEGIN
  SELECT c.id, c.organization_id, c.pessoa_id, c.estado, c.valid_until, c.used_at, c.revoked_at,
         c.portal_encerrado_em, c.attempts, c.sessao_hash, c.sessao_iniciada_em,
         c.sessao_ultima_atividade_em, c.otp_hmac, c.otp_expira_em, c.otp_tentativas
    INTO v_convite
    FROM public.pessoas_convites_admissao c
   WHERE c.token_hash = p_token_hash;

  IF v_convite.id IS NULL THEN
    RETURN jsonb_build_object('erro', 'convite_invalido');
  END IF;

  IF v_convite.portal_encerrado_em IS NOT NULL OR v_convite.used_at IS NOT NULL THEN
    v_motivo := 'convite_ja_usado';
  ELSIF v_convite.revoked_at IS NOT NULL THEN
    v_motivo := 'convite_revogado';
  ELSIF v_convite.valid_until <= now() THEN
    v_motivo := 'convite_expirado';
  ELSIF v_convite.attempts >= c_tecto THEN
    v_motivo := 'convite_bloqueado';
  END IF;

  IF v_motivo IS NOT NULL THEN
    IF v_convite.attempts < c_tecto THEN
      UPDATE public.pessoas_convites_admissao
         SET attempts = attempts + 1
       WHERE id = v_convite.id;
    END IF;
    RETURN jsonb_build_object('erro', v_motivo);
  END IF;

  SELECT p.primeiro_nome INTO v_primeiro
    FROM public.pessoas p
   WHERE p.id = v_convite.pessoa_id;
  SELECT o.name INTO v_org_nome
    FROM public.anew_organizations o
   WHERE o.id = v_convite.organization_id;

  -- A sessao, se a Edge a mandou no cabecalho; aqui so se le, nao se exige.
  v_hdr := nullif(current_setting('request.headers', true), '');
  IF v_hdr IS NOT NULL THEN
    BEGIN
      v_sessao := nullif(btrim(v_hdr::jsonb ->> 'x-portal-sessao'), '');
    EXCEPTION WHEN invalid_text_representation THEN
      v_sessao := NULL;
    END;
  END IF;
  v_sessao_ok := v_sessao IS NOT NULL
             AND v_convite.sessao_hash IS NOT NULL
             AND v_sessao = v_convite.sessao_hash
             AND public.hr_convite_sessao_valida(v_convite.sessao_iniciada_em,
                                                 v_convite.sessao_ultima_atividade_em, now());

  -- So a primeira abertura com sucesso fica no historico.
  IF NOT EXISTS (SELECT 1 FROM public.pessoas_convites_admissao_eventos e
                  WHERE e.convite_id = v_convite.id AND e.acao = 'portal_aberto') THEN
    INSERT INTO public.pessoas_convites_admissao_eventos
      (convite_id, organization_id, acao, ator_tipo, ator_id, estado_anterior, estado_posterior, metadados)
    VALUES
      (v_convite.id, v_convite.organization_id, 'portal_aberto', 'pessoa', NULL,
       v_convite.estado, v_convite.estado, '{}'::jsonb);
  END IF;

  -- NUNCA rascunho, campos obrigatorios, nome completo, email, NIF, NISS, conta,
  -- sessao nem OTP: isso so com sessao, pela rpc_hr_convite_admissao_portal_ler.
  RETURN jsonb_build_object(
    'existe',           true,
    'estado',           v_convite.estado,
    'estado_portal',    'ativo',
    'valid_until',      v_convite.valid_until,
    'primeiro_nome',    v_primeiro,
    'organizacao_nome', v_org_nome,
    -- OTP bloqueado: as 5 tentativas de um codigo ainda valido foram gastas, ou
    -- o tecto agregado de 24 h (15 otp_falhado) foi atingido.
    'bloqueado',        coalesce(v_convite.otp_hmac IS NOT NULL
                                 AND v_convite.otp_expira_em > now()
                                 AND v_convite.otp_tentativas >= c_otp_max, false)
                        OR (SELECT count(*) FROM public.pessoas_convites_admissao_eventos e
                             WHERE e.convite_id = v_convite.id
                               AND e.criado_em > now() - interval '24 hours'
                               AND e.acao = 'otp_falhado') >= c_falhas_dia,
    'precisa_otp',      coalesce(v_convite.estado IN ('convidada', 'em_preenchimento', 'devolvida')
                                 AND NOT v_sessao_ok, false)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_hr_convite_admissao_estado(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_hr_convite_admissao_estado(text) FROM anon;
REVOKE ALL ON FUNCTION public.rpc_hr_convite_admissao_estado(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_convite_admissao_estado(text) TO service_role;

COMMENT ON FUNCTION public.rpc_hr_convite_admissao_estado(text) IS
'Le o processo pelo hash do token, SEM sessao: so o minimo publico {existe, estado, estado_portal (ativo), valid_until, primeiro_nome, organizacao_nome, bloqueado (OTP bloqueado: 5 tentativas gastas num codigo ainda valido), precisa_otp (o estado permite editar -- convidada, em_preenchimento, devolvida -- e nao ha sessao valida no cabecalho x-portal-sessao)}. SO service_role. Os erros saem em jsonb ({"erro": convite_invalido, convite_ja_usado (portal encerrado), convite_revogado, convite_expirado, convite_bloqueado}) para o incremento de attempts (tecto 10) ficar gravado. Grava portal_aberto na 1.a abertura com sucesso. Desde 20261210430000 NAO devolve rascunho, campos obrigatorios, nome completo, email, NIF, NISS nem conta: isso vem da rpc_hr_convite_admissao_portal_ler, com sessao.';

-- ==============================================================================
-- 5. Leituras do RH (so authenticated, com o JWT)
-- ==============================================================================

-- 5.1 O pipeline das admissoes da organizacao activa.
CREATE FUNCTION public.rpc_hr_admissao_listar(
  p_organization_id uuid,
  p_estados         text[]      DEFAULT NULL,
  p_limite          integer     DEFAULT 50,
  p_apos_criado_em  timestamptz DEFAULT NULL,
  p_apos_id         uuid        DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  c_estados constant text[] := ARRAY['convidada', 'em_preenchimento', 'submetida', 'devolvida', 'aprovada',
                                     'a_aguardar_assinaturas', 'assinaturas_concluidas', 'a_aguardar_ativacao',
                                     'concluida', 'rejeitada', 'cancelada'];
  c_teto    constant integer := 100;
  v_uid        uuid := auth.uid();
  v_restrito   boolean;
  v_limite     integer;
  v_estados    text[];
  v_ids        uuid[];
  v_mais       boolean;
  v_itens      jsonb;
  v_contadores jsonb;
  v_seguinte   jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
  END IF;

  IF p_organization_id IS NULL
     OR NOT (public.has_anew_permission_in_org(v_uid, 'hr.pessoas.convite.enviar', p_organization_id)
             OR public.has_anew_permission_in_org(v_uid, 'hr.onboarding.approve', p_organization_id)) THEN
    RAISE EXCEPTION 'nao_encontrado' USING ERRCODE = 'HRA31';
  END IF;

  IF NOT public.hr_organizacao_empregadora(p_organization_id) THEN
    RAISE EXCEPTION 'organizacao_nao_empregadora' USING ERRCODE = 'HRA33';
  END IF;

  -- 'terminado' (o par cancelada + rejeitada) tambem e aceite no filtro.
  IF p_estados IS NOT NULL
     AND EXISTS (SELECT 1 FROM unnest(p_estados) AS u(e)
                  WHERE u.e IS NULL OR NOT (u.e = ANY (c_estados) OR u.e = 'terminado')) THEN
    RAISE EXCEPTION 'pedido_invalido' USING ERRCODE = 'HRA10';
  END IF;
  IF (p_apos_criado_em IS NULL) <> (p_apos_id IS NULL) THEN
    RAISE EXCEPTION 'pedido_invalido' USING ERRCODE = 'HRA10';
  END IF;

  v_limite   := least(greatest(coalesce(p_limite, 50), 1), c_teto);
  v_restrito := public.has_anew_permission_in_org(v_uid, 'hr.onboarding.restrito', p_organization_id);

  -- Sem oraculo da mascara: sem restrito, pedir cancelada, rejeitada ou
  -- terminado devolve SEMPRE as duas, para nao se distinguir uma da outra pelo
  -- filtro. Com restrito, terminado tambem vale pelas duas. A ordem e o cursor
  -- (created_at, id) nao dependem do estado; os itens e os contadores mascaram.
  IF p_estados IS NOT NULL THEN
    SELECT array_agg(DISTINCT x.e) INTO v_estados
      FROM (
        SELECT u.e FROM unnest(p_estados) AS u(e) WHERE u.e = ANY (c_estados)
           AND (v_restrito OR u.e NOT IN ('cancelada', 'rejeitada'))
        UNION ALL
        SELECT t.e FROM unnest(ARRAY['cancelada', 'rejeitada']) AS t(e)
         WHERE 'terminado' = ANY (p_estados)
            OR (NOT v_restrito AND (p_estados && ARRAY['cancelada', 'rejeitada']))
      ) x;
  END IF;

  -- Uma pagina a mais diz se ha seguinte. Ordem do indice: created_at DESC, id.
  SELECT array_agg(q.id ORDER BY q.created_at DESC, q.id) INTO v_ids
    FROM (
      SELECT c.id, c.created_at
        FROM public.pessoas_convites_admissao c
        JOIN public.pessoas p
          ON p.id = c.pessoa_id AND p.organization_id = c.organization_id AND p.deleted_at IS NULL
       WHERE c.organization_id = p_organization_id
         AND (p_estados IS NULL OR c.estado = ANY (v_estados))
         AND (p_apos_criado_em IS NULL
              OR c.created_at < p_apos_criado_em
              OR (c.created_at = p_apos_criado_em AND c.id > p_apos_id))
       ORDER BY c.created_at DESC, c.id
       LIMIT v_limite + 1
    ) q;

  v_mais := coalesce(cardinality(v_ids), 0) > v_limite;
  IF v_mais THEN
    v_ids := v_ids[1:v_limite];
  END IF;

  SELECT coalesce(jsonb_agg(
           CASE
             WHEN c.estado IN ('cancelada', 'rejeitada') AND NOT v_restrito THEN
               jsonb_build_object(
                 'convite_id',    c.id,
                 'pessoa_id',     c.pessoa_id,
                 'nome',          p.nome_completo,
                 'cargo',         hc.nome,
                 'estado',        'terminado',
                 'estado_portal', 'revogado')
             ELSE
               jsonb_build_object(
                 'convite_id',    c.id,
                 'pessoa_id',     c.pessoa_id,
                 'nome',          p.nome_completo,
                 'cargo',         hc.nome,
                 'estado',        c.estado,
                 'estado_portal', CASE
                                    WHEN c.portal_encerrado_em IS NOT NULL THEN 'encerrado'
                                    WHEN c.revoked_at IS NOT NULL          THEN 'revogado'
                                    WHEN c.valid_until <= now()            THEN 'expirado'
                                    ELSE 'ativo'
                                  END,
                 'valid_until',   c.valid_until,
                 'submetido_em',  c.submetido_em,
                 'devolvida_em',  (SELECT max(e.criado_em) FROM public.pessoas_convites_admissao_eventos e
                                    WHERE e.convite_id = c.id AND e.acao = 'devolvido'),
                 'atualizado_em', coalesce((SELECT max(e.criado_em) FROM public.pessoas_convites_admissao_eventos e
                                             WHERE e.convite_id = c.id), c.created_at))
           END
           ORDER BY array_position(v_ids, c.id)), '[]'::jsonb)
    INTO v_itens
    FROM public.pessoas_convites_admissao c
    JOIN public.pessoas p ON p.id = c.pessoa_id
    LEFT JOIN public.hr_cargos hc ON hc.id = p.cargo_id AND hc.organization_id = c.organization_id
   WHERE c.organization_id = p_organization_id
     AND c.id = ANY (coalesce(v_ids, ARRAY[]::uuid[]));

  -- Os contadores nao dependem do filtro nem do cursor; os terminados fundem-se
  -- em "terminado" para quem nao tem restrito.
  SELECT coalesce(jsonb_object_agg(t.chave, t.n), '{}'::jsonb) INTO v_contadores
    FROM (
      SELECT CASE WHEN c.estado IN ('cancelada', 'rejeitada') AND NOT v_restrito
                  THEN 'terminado' ELSE c.estado END AS chave,
             count(*) AS n
        FROM public.pessoas_convites_admissao c
        JOIN public.pessoas p
          ON p.id = c.pessoa_id AND p.organization_id = c.organization_id AND p.deleted_at IS NULL
       WHERE c.organization_id = p_organization_id
       GROUP BY 1
    ) t;

  IF v_mais THEN
    SELECT jsonb_build_object('apos_criado_em', c.created_at, 'apos_id', c.id) INTO v_seguinte
      FROM public.pessoas_convites_admissao c
     WHERE c.id = v_ids[v_limite];
  END IF;

  RETURN jsonb_build_object('itens', v_itens, 'contadores', v_contadores, 'seguinte', v_seguinte);
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_hr_admissao_listar(uuid, text[], integer, timestamptz, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_hr_admissao_listar(uuid, text[], integer, timestamptz, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.rpc_hr_admissao_listar(uuid, text[], integer, timestamptz, uuid) FROM service_role;
GRANT EXECUTE ON FUNCTION public.rpc_hr_admissao_listar(uuid, text[], integer, timestamptz, uuid) TO authenticated;

COMMENT ON FUNCTION public.rpc_hr_admissao_listar(uuid, text[], integer, timestamptz, uuid) IS
'Pipeline das admissoes da organizacao activa (so authenticated, JWT). Exige hr.pessoas.convite.enviar OU hr.onboarding.approve nela (senao nao_encontrado, HRA31) e work organization (HRA33). Devolve {itens [{convite_id, pessoa_id, nome, cargo (hr_cargos.nome por pessoas.cargo_id, da mesma organizacao), estado, estado_portal, valid_until, submetido_em, devolvida_em, atualizado_em}], contadores {estado: n}, seguinte {apos_criado_em, apos_id} ou null}. Cancelados e rejeitados saem como terminado, sem datas, a quem nao tem hr.onboarding.restrito (tambem nos contadores); sem restrito, pedir cancelada, rejeitada ou terminado em p_estados devolve SEMPRE as duas (sem oraculo da mascara); terminado e aceite no filtro. Cursor por (created_at DESC, id), ate 100 por pagina (50 por omissao); filtro e cursor invalidos: pedido_invalido (HRA10). Exclui fichas apagadas. Sem limite por actor. Desde 20261210430000.';

-- 5.2 Rever o processo, so com campos nao sensiveis e so dos dominios da ficha
--     que o utilizador pode ver.
CREATE FUNCTION public.rpc_hr_admissao_rever_ler(p_organization_id uuid, p_convite_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  -- O dominio de cada chave e a regra de visibilidade estao em
  -- hr_admissao_revisao_visivel (testada no bloco de conferir).
  v_uid       uuid := auth.uid();
  v_org       uuid;
  v_c         record;
  v_terminado boolean;
  v_perm      jsonb;
  v_p_pes     boolean;
  v_p_dp      boolean;
  v_p_id      boolean;
  v_p_mor     boolean;
  v_p_far     boolean;
  v_p_ban     boolean;
  v_ficha     jsonb;
  v_campos    jsonb;
  v_anexos    jsonb;
  v_devolucao jsonb;
  v_pend      jsonb;
  v_eventos   jsonb;
  v_resumo    jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
  END IF;

  -- Ficha apagada: o processo "nao existe" (como na listar).
  SELECT c.organization_id INTO v_org
    FROM public.pessoas_convites_admissao c
    JOIN public.pessoas p
      ON p.id = c.pessoa_id AND p.organization_id = c.organization_id AND p.deleted_at IS NULL
   WHERE c.id = p_convite_id;
  IF v_org IS NULL
     OR p_organization_id IS NULL
     OR v_org <> p_organization_id
     OR NOT public.has_anew_permission_in_org(v_uid, 'hr.onboarding.approve', v_org) THEN
    RAISE EXCEPTION 'nao_encontrado' USING ERRCODE = 'HRA31';
  END IF;

  IF NOT public.hr_organizacao_empregadora(v_org) THEN
    RAISE EXCEPTION 'organizacao_nao_empregadora' USING ERRCODE = 'HRA33';
  END IF;

  SELECT c.id, c.pessoa_id, c.estado, c.rascunho, c.devolucao, c.niss_segredo_id, c.iban_segredo_id,
         c.valid_until, c.revoked_at, c.portal_encerrado_em, c.submetido_em,
         c.cancelada_em, c.rejeitada_em
    INTO v_c
    FROM public.pessoas_convites_admissao c
   WHERE c.id = p_convite_id AND c.organization_id = v_org;

  -- Cancelado ou rejeitado: so com acesso restrito; sem ele "nao existe".
  v_terminado := v_c.estado IN ('cancelada', 'rejeitada');
  IF v_terminado
     AND NOT public.has_anew_permission_in_org(v_uid, 'hr.onboarding.restrito', v_org) THEN
    RAISE EXCEPTION 'nao_encontrado' USING ERRCODE = 'HRA31';
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object('acao', e.acao, 'ator_tipo', e.ator_tipo,
                                               'estado_anterior', e.estado_anterior,
                                               'estado_posterior', e.estado_posterior,
                                               'criado_em', e.criado_em)
                            ORDER BY e.criado_em, e.id), '[]'::jsonb)
    INTO v_eventos
    FROM public.pessoas_convites_admissao_eventos e
   WHERE e.convite_id = v_c.id;

  v_resumo := jsonb_build_object(
    'convite_id',    v_c.id,
    'pessoa_id',     v_c.pessoa_id,
    'estado',        v_c.estado,
    'estado_portal', CASE
                       WHEN v_c.portal_encerrado_em IS NOT NULL THEN 'encerrado'
                       WHEN v_c.revoked_at IS NOT NULL          THEN 'revogado'
                       WHEN v_c.valid_until <= now()            THEN 'expirado'
                       ELSE 'ativo'
                     END,
    'valid_until',   v_c.valid_until,
    'submetido_em',  v_c.submetido_em,
    'cancelada_em',  v_c.cancelada_em,
    'rejeitada_em',  v_c.rejeitada_em,
    'niss',          jsonb_build_object('preenchido', v_c.niss_segredo_id IS NOT NULL),
    'iban',          jsonb_build_object('preenchido', v_c.iban_segredo_id IS NOT NULL),
    'eventos',       v_eventos);

  -- Processo terminado: NUNCA campos, anexos, devolucao nem pendencias, mesmo
  -- com restrito; so o resumo. O NISS e o IBAN abrem-se pela rever_sensivel
  -- (restrito e sensitive, registado).
  IF v_terminado THEN
    RETURN v_resumo || jsonb_build_object('campos', '[]'::jsonb, 'anexos', '[]'::jsonb,
                                          'devolucao', NULL, 'pendencias', '[]'::jsonb);
  END IF;

  -- A permissao de cada dominio da ficha, na organizacao da linha.
  SELECT coalesce(jsonb_object_agg(d.tabela, d.pode), '{}'::jsonb) INTO v_perm
    FROM (
      SELECT cp.tabela, bool_or(public.has_anew_permission_in_org(v_uid, cp.permissao, v_org)) AS pode
        FROM public.hr_admissao_campo_permissao() AS cp
       WHERE cp.tabela IN ('pessoas', 'pessoas_dados_pessoais', 'pessoas_identificacao',
                           'pessoas_moradas', 'pessoas_fardamento', 'pessoas_dados_bancarios')
       GROUP BY cp.tabela
    ) d;
  v_p_pes := coalesce((v_perm ->> 'pessoas')::boolean, false);
  v_p_dp  := coalesce((v_perm ->> 'pessoas_dados_pessoais')::boolean, false);
  v_p_id  := coalesce((v_perm ->> 'pessoas_identificacao')::boolean, false);
  v_p_mor := coalesce((v_perm ->> 'pessoas_moradas')::boolean, false);
  v_p_far := coalesce((v_perm ->> 'pessoas_fardamento')::boolean, false);
  v_p_ban := coalesce((v_perm ->> 'pessoas_dados_bancarios')::boolean, false);

  -- O valor actual da ficha (mesma organizacao: H7), so dos dominios visiveis.
  SELECT CASE WHEN v_p_pes THEN jsonb_build_object('email_pessoal', p.email_pessoal) ELSE '{}'::jsonb END
      || CASE WHEN v_p_dp THEN jsonb_build_object(
           'data_nascimento',               dp.data_nascimento,
           'genero',                        dp.genero,
           'nacionalidade',                 dp.nacionalidade,
           'estado_civil',                  dp.estado_civil,
           'dependentes',                   dp.dependentes,
           'dependentes_deficientes',       dp.dependentes_deficientes,
           'telefone_pessoal',              dp.telefone_pessoal,
           'naturalidade_freguesia',        dp.naturalidade_freguesia,
           'naturalidade_concelho',         dp.naturalidade_concelho,
           'naturalidade_pais',             dp.naturalidade_pais,
           'conjuge_situacao_profissional', dp.conjuge_situacao_profissional,
           'habilitacao_academica',         dp.habilitacao_academica,
           'habilitacao_data_conclusao',    dp.habilitacao_data_conclusao) ELSE '{}'::jsonb END
      || CASE WHEN v_p_id THEN jsonb_build_object(
           'tipo_documento',                i.tipo_documento,
           'numero_documento',              i.numero_documento,
           'validade_documento',            i.validade_documento,
           'nif',                           i.nif,
           'carta_conducao_numero',         i.carta_conducao_numero,
           'carta_conducao_categorias',     i.carta_conducao_categorias,
           'carta_conducao_validade',       i.carta_conducao_validade) ELSE '{}'::jsonb END
      || CASE WHEN v_p_mor THEN jsonb_build_object(
           'morada_linha1',                 m.linha1,
           'morada_linha2',                 m.linha2,
           'morada_codigo_postal',          m.codigo_postal,
           'morada_localidade',             m.localidade,
           'morada_distrito',               m.distrito,
           'morada_pais',                   m.pais) ELSE '{}'::jsonb END
      || CASE WHEN v_p_far THEN jsonb_build_object(
           'tamanho_cima',                  f.tamanho_cima,
           'tamanho_cima_detalhe',          f.tamanho_cima_detalhe,
           'tamanho_baixo',                 f.tamanho_baixo,
           'tamanho_baixo_detalhe',         f.tamanho_baixo_detalhe,
           'tamanho_calcado',               f.tamanho_calcado,
           'tamanho_calcado_detalhe',       f.tamanho_calcado_detalhe) ELSE '{}'::jsonb END
      || CASE WHEN v_p_ban THEN jsonb_build_object(
           'conta_titular',                 b.titular,
           'conta_banco',                   b.banco,
           'conta_bic',                     b.swift,
           'conta_swift',                   b.swift,
           'conta_formato',                 b.formato_conta) ELSE '{}'::jsonb END
    INTO v_ficha
    FROM public.pessoas p
    LEFT JOIN public.pessoas_dados_pessoais dp
           ON dp.pessoa_id = p.id AND dp.organization_id = p.organization_id
    LEFT JOIN public.pessoas_identificacao i
           ON i.pessoa_id = p.id AND i.organization_id = p.organization_id
    LEFT JOIN LATERAL (
           SELECT pm.linha1, pm.linha2, pm.codigo_postal, pm.localidade, pm.distrito, pm.pais
             FROM public.pessoas_moradas pm
            WHERE pm.pessoa_id = p.id AND pm.organization_id = p.organization_id AND pm.tipo = 'residencia'
            ORDER BY pm.is_principal DESC, pm.updated_at DESC
            LIMIT 1) m ON true
    LEFT JOIN public.pessoas_fardamento f
           ON f.pessoa_id = p.id AND f.organization_id = p.organization_id
    LEFT JOIN public.pessoas_dados_bancarios b
           ON b.pessoa_id = p.id AND b.organization_id = p.organization_id
   WHERE p.id = v_c.pessoa_id AND p.organization_id = v_org AND p.deleted_at IS NULL;
  v_ficha := coalesce(v_ficha, '{}'::jsonb);

  -- O rascunho nunca tem niss, iban nem conta_numero (CHECK da V2). Uma chave de
  -- um dominio que o utilizador nao ve sai com visivel false, submetido e ficha
  -- null e difere false.
  SELECT coalesce(jsonb_agg(
           CASE WHEN r.visivel THEN
             jsonb_build_object(
               'chave',     r.key,
               'visivel',   true,
               'submetido', r.value,
               'ficha',     v_ficha -> r.key,
               'difere',    coalesce(
                              (v_ficha -> r.key) IS NOT NULL
                              AND jsonb_typeof(v_ficha -> r.key) <> 'null'
                              AND jsonb_typeof(r.value) <> 'null'
                              AND lower(btrim(v_ficha ->> r.key)) IS DISTINCT FROM lower(btrim(r.value #>> '{}')),
                              false))
           ELSE
             jsonb_build_object('chave', r.key, 'visivel', false, 'submetido', NULL, 'ficha', NULL, 'difere', false)
           END
           ORDER BY r.key), '[]'::jsonb)
    INTO v_campos
    FROM (
      SELECT j.key, j.value,
             public.hr_admissao_revisao_visivel(j.key, v_perm) AS visivel
        FROM jsonb_each(coalesce(v_c.rascunho, '{}'::jsonb)) AS j
    ) r;

  -- Anexos pela mesma regra: sem a permissao do dominio do tipo
  -- (comprovativo_iban -> bancarios, cartao_cidadao -> identificacao,
  -- fotografia -> pessoais) o anexo sai oculto, sem id.
  SELECT coalesce(jsonb_agg(
           CASE WHEN public.hr_admissao_revisao_visivel(a.tipo, v_perm)
                THEN jsonb_build_object('id', a.id, 'tipo', a.tipo, 'criado_em', a.criado_em, 'visivel', true)
                ELSE jsonb_build_object('id', NULL, 'tipo', a.tipo, 'criado_em', a.criado_em, 'visivel', false)
           END
           ORDER BY a.criado_em, a.id), '[]'::jsonb)
    INTO v_anexos
    FROM public.pessoas_anexos a
   WHERE a.convite_id = v_c.id AND a.organization_id = v_org AND a.estado = 'ligado';

  -- A devolucao pela mesma regra: o comentario de uma chave de um dominio que o
  -- utilizador nao ve sai null (a chave fica, oculta). A lista de documentos
  -- (tipos) e a observacao do RH (texto livre, escrito pelo proprio RH) ficam
  -- visiveis a quem tem hr.onboarding.approve.
  IF v_c.devolucao IS NOT NULL THEN
    SELECT jsonb_build_object(
             'campos', coalesce(jsonb_object_agg(k.key,
                         CASE WHEN public.hr_admissao_revisao_visivel(k.key, v_perm)
                              THEN k.value ELSE 'null'::jsonb END), '{}'::jsonb),
             'documentos', CASE WHEN jsonb_typeof(v_c.devolucao -> 'documentos') = 'array'
                                THEN v_c.devolucao -> 'documentos' ELSE '[]'::jsonb END,
             'observacao', v_c.devolucao -> 'observacao')
      INTO v_devolucao
      FROM jsonb_each(CASE WHEN jsonb_typeof(v_c.devolucao -> 'campos') = 'object'
                           THEN v_c.devolucao -> 'campos' ELSE '{}'::jsonb END) AS k;
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object('codigo', pd.codigo, 'origem', pd.origem, 'posicao', pd.posicao)
                            ORDER BY pd.codigo), '[]'::jsonb)
    INTO v_pend
    FROM public.hr_admissao_pendencias(v_c.pessoa_id) AS pd;

  -- Nunca os valores de NISS e IBAN, o token, a sessao, o OTP nem o email.
  RETURN v_resumo || jsonb_build_object(
    'campos',     v_campos,
    'anexos',     v_anexos,
    'devolucao',  v_devolucao,
    'pendencias', v_pend);
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_hr_admissao_rever_ler(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_hr_admissao_rever_ler(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.rpc_hr_admissao_rever_ler(uuid, uuid) FROM service_role;
GRANT EXECUTE ON FUNCTION public.rpc_hr_admissao_rever_ler(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.rpc_hr_admissao_rever_ler(uuid, uuid) IS
'Revisao so de leitura de um processo (so authenticated, JWT). Exige hr.onboarding.approve na organizacao do processo, igual a p_organization_id, e a ficha nao apagada (senao nao_encontrado, HRA31), work organization (HRA33) e, num processo cancelado ou rejeitado, tambem hr.onboarding.restrito (HRA31). Devolve sempre o resumo {convite_id, pessoa_id, estado, estado_portal, valid_until, submetido_em, cancelada_em, rejeitada_em, niss e iban so como {preenchido}, eventos}. Num processo cancelado ou rejeitado NUNCA devolve campos, anexos, devolucao nem pendencias (vem vazios), mesmo com restrito. Nos outros: campos [{chave, visivel, submetido, ficha, difere}] so com chaves nao sensiveis, e cada chave (hr_admissao_revisao_visivel) so e visivel se o utilizador tiver, na organizacao da linha, a permissao do dominio da ficha a que pertence (hr_admissao_campo_permissao: hr.pessoas.view, pessoais.view -- dependentes_deficientes incluido --, identificacao.view, morada.view, laborais.view, bancarios.view); senao visivel false, submetido e ficha null, difere false. Mais anexos ligados [{id, tipo, criado_em, visivel}] (sem a permissao do dominio do tipo o id vem null), a ultima devolucao {campos, documentos, observacao} (comentario null nas chaves de dominios que nao ve; a observacao do RH fica visivel) e pendencias (hr_admissao_pendencias, uma vez, com o gate dela). Nunca valores de NISS ou IBAN, token, sessao, OTP nem email. Sem limite e sem registo. Desde 20261210430000.';

-- 5.3 Revelar o NISS ou o IBAN de staging, com registo.
CREATE FUNCTION public.rpc_hr_admissao_rever_sensivel(p_organization_id uuid, p_convite_id uuid, p_campo text)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  c_limite_hora constant integer := 120;
  v_uid     uuid := auth.uid();
  v_org     uuid;
  v_c       record;
  v_segredo uuid;
  v_valor   text;
  v_n       integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
  END IF;

  IF p_campo IS NULL OR p_campo NOT IN ('niss', 'iban') THEN
    RAISE EXCEPTION 'pedido_invalido' USING ERRCODE = 'HRA10';
  END IF;

  SELECT c.organization_id INTO v_org
    FROM public.pessoas_convites_admissao c
   WHERE c.id = p_convite_id;
  IF v_org IS NULL
     OR p_organization_id IS NULL
     OR v_org <> p_organization_id
     OR NOT public.has_anew_permission_in_org(v_uid, 'hr.onboarding.sensitive', v_org) THEN
    RAISE EXCEPTION 'nao_encontrado' USING ERRCODE = 'HRA31';
  END IF;

  IF NOT public.hr_organizacao_empregadora(v_org) THEN
    RAISE EXCEPTION 'organizacao_nao_empregadora' USING ERRCODE = 'HRA33';
  END IF;

  SELECT c.id, c.pessoa_id, c.estado, c.niss_segredo_id, c.iban_segredo_id INTO v_c
    FROM public.pessoas_convites_admissao c
   WHERE c.id = p_convite_id AND c.organization_id = v_org;

  IF v_c.estado IN ('cancelada', 'rejeitada')
     AND NOT public.has_anew_permission_in_org(v_uid, 'hr.onboarding.restrito', v_org) THEN
    RAISE EXCEPTION 'nao_encontrado' USING ERRCODE = 'HRA31';
  END IF;

  -- 120 leituras sensiveis por hora por actor, contadas no proprio registo
  -- (indice idx_pessoas_acessos_sensiveis_auth_data). O lock por actor serializa
  -- as chamadas concorrentes dele ate ao fim da transaccao: a contagem e a
  -- insercao nao se cruzam.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_uid::text, 0));
  SELECT count(*) INTO v_n
    FROM public.pessoas_acessos_sensiveis a
   WHERE a.auth_user_id = v_uid AND a.created_at > now() - interval '1 hour';
  IF v_n >= c_limite_hora THEN
    RAISE EXCEPTION 'limite_excedido' USING ERRCODE = 'HRA41';
  END IF;

  v_segredo := CASE p_campo WHEN 'niss' THEN v_c.niss_segredo_id ELSE v_c.iban_segredo_id END;
  IF v_segredo IS NOT NULL THEN
    SELECT s.decrypted_secret INTO v_valor FROM vault.decrypted_secrets s WHERE s.id = v_segredo;
  END IF;

  -- Cada leitura que revela um valor fica registada, na mesma transaccao, com o
  -- auth.uid() do pedido (origem utilizador).
  IF v_valor IS NOT NULL THEN
    PERFORM public.hr_registar_acesso_sensivel(v_c.pessoa_id, v_org, p_campo, 'revelar');
  END IF;

  RETURN jsonb_build_object('valor', v_valor);
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_hr_admissao_rever_sensivel(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_hr_admissao_rever_sensivel(uuid, uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.rpc_hr_admissao_rever_sensivel(uuid, uuid, text) FROM service_role;
GRANT EXECUTE ON FUNCTION public.rpc_hr_admissao_rever_sensivel(uuid, uuid, text) TO authenticated;

COMMENT ON FUNCTION public.rpc_hr_admissao_rever_sensivel(uuid, uuid, text) IS
'Revela o NISS ou o IBAN que a pessoa deu no portal (staging no Vault), para o RH rever (so authenticated, JWT). Exige hr.onboarding.sensitive na organizacao do processo, igual a p_organization_id (senao nao_encontrado, HRA31), work organization (HRA33) e, num processo cancelado ou rejeitado, tambem hr.onboarding.restrito (HRA31). p_campo so niss ou iban (pedido_invalido, HRA10). 120 por hora por actor, contados em pessoas_acessos_sensiveis (indice idx_pessoas_acessos_sensiveis_auth_data) depois de um pg_advisory_xact_lock por actor que serializa as chamadas concorrentes (limite_excedido, HRA41). Cada leitura que devolve valor regista uma linha revelar (campo niss ou iban, origem utilizador) na mesma transaccao. Devolve {valor}. Desde 20261210430000.';

-- ==============================================================================
-- Conferir
-- ==============================================================================
DO $conferir$
DECLARE
  v_internas_fechadas text[] := ARRAY['public.hr_convite_sessao_exigir(uuid, text)',
                                      'public.hr_convite_link_token(uuid)',
                                      'public.hr_admissao_revisao_visivel(text, jsonb)'];
  v_todas jsonb := '{"pessoas": true, "pessoas_dados_pessoais": true, "pessoas_identificacao": true,
                     "pessoas_moradas": true, "pessoas_fardamento": true, "pessoas_dados_bancarios": true}'::jsonb;
  v_so_service text[] := ARRAY['public.rpc_hr_convite_link_guardar(uuid, text)',
                               'public.rpc_hr_convite_admissao_otp_pedir(text, text)',
                               'public.rpc_hr_convite_admissao_otp_verificar(text, text, text)',
                               'public.rpc_hr_convite_admissao_sessao_terminar(text, text)',
                               'public.rpc_hr_convite_admissao_portal_ler(text, text)',
                               'public.rpc_hr_convite_admissao_sensiveis_gravar(text, text, text, text)',
                               'public.rpc_hr_convite_admissao_reenviar(uuid, uuid, uuid)',
                               'public.rpc_hr_convite_admissao_estado(text)'];
  v_so_authenticated text[] := ARRAY['public.rpc_hr_admissao_listar(uuid, text[], integer, timestamptz, uuid)',
                                     'public.rpc_hr_admissao_rever_ler(uuid, uuid)',
                                     'public.rpc_hr_admissao_rever_sensivel(uuid, uuid, text)'];
  v_acoes_usadas text[] := ARRAY['otp_pedido', 'otp_falhado', 'otp_validado', 'sessao_iniciada',
                                 'sessao_substituida', 'portal_aberto', 'reenviado'];
  v_lista_branca text[] := ARRAY[
    'assinatura_nome', 'carta_conducao_categorias', 'carta_conducao_numero',
    'carta_conducao_validade', 'codigo_postal', 'conjuge_situacao_profissional',
    'conta_banco', 'conta_bic', 'conta_formato', 'conta_swift', 'conta_titular',
    'data_nascimento', 'dependentes', 'dependentes_deficientes', 'distrito',
    'email_pessoal', 'estado_civil', 'genero', 'habilitacao_academica',
    'habilitacao_data_conclusao', 'linha1', 'linha2', 'localidade',
    'morada_codigo_postal', 'morada_distrito', 'morada_linha1', 'morada_linha2',
    'morada_localidade', 'morada_pais', 'nacionalidade', 'naturalidade_concelho',
    'naturalidade_freguesia', 'naturalidade_pais', 'nif', 'numero_documento',
    'pais', 'tamanho_baixo', 'tamanho_baixo_detalhe', 'tamanho_calcado',
    'tamanho_calcado_detalhe', 'tamanho_cima', 'tamanho_cima_detalhe',
    'telefone_pessoal', 'tipo_documento', 'validade_documento'];
  v_tudo    jsonb := '{}'::jsonb;
  v_lidos   text[];
  v_col     text;
  v_fn      text;
  v_papel   text;
  v_chave   text;
  v_n       integer;
  v_t0      timestamptz := '2026-01-01 10:00:00+00';
BEGIN
  -- 1. As 5 colunas novas existem e NENHUMA coluna e legivel por anon ou
  --    authenticated (o bloco da V2, repetido com as colunas novas).
  SELECT count(*) INTO v_n FROM pg_attribute
   WHERE attrelid = to_regclass('public.pessoas_convites_admissao')
     AND attname IN ('niss_segredo_id', 'iban_segredo_id', 'link_segredo_id', 'submetido_em', 'submetido_sha256')
     AND NOT attisdropped;
  IF v_n <> 5 THEN
    RAISE EXCEPTION 'Esperavam-se as 5 colunas novas; ha %.', v_n;
  END IF;

  FOR v_col IN
    SELECT a.attname::text FROM pg_attribute a
     WHERE a.attrelid = to_regclass('public.pessoas_convites_admissao')
       AND a.attnum > 0 AND NOT a.attisdropped
  LOOP
    FOREACH v_papel IN ARRAY ARRAY['anon', 'authenticated'] LOOP
      IF has_column_privilege(v_papel, 'public.pessoas_convites_admissao', v_col, 'SELECT') THEN
        RAISE EXCEPTION '% consegue ler pessoas_convites_admissao.%.', v_papel, v_col;
      END IF;
    END LOOP;
  END LOOP;
  FOREACH v_papel IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF has_any_column_privilege(v_papel, 'public.pessoas_convites_admissao', 'SELECT') THEN
      RAISE EXCEPTION '% ainda tem SELECT em alguma coluna de pessoas_convites_admissao.', v_papel;
    END IF;
    IF has_table_privilege(v_papel, 'public.pessoas_convites_admissao', 'INSERT')
       OR has_table_privilege(v_papel, 'public.pessoas_convites_admissao', 'UPDATE')
       OR has_table_privilege(v_papel, 'public.pessoas_convites_admissao', 'DELETE')
       OR has_table_privilege(v_papel, 'public.pessoas_convites_admissao', 'TRUNCATE') THEN
      RAISE EXCEPTION '% tem escrita de tabela em pessoas_convites_admissao.', v_papel;
    END IF;
  END LOOP;

  -- 2. O indice do pipeline, com as 4 colunas na ordem do desenho.
  SELECT array_agg(a.attname::text ORDER BY k.ord) INTO v_lidos
    FROM pg_index i
    CROSS JOIN LATERAL unnest(i.indkey::int2[]) WITH ORDINALITY AS k(attnum, ord)
    JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = k.attnum
   WHERE i.indexrelid = to_regclass('public.idx_pessoas_convites_admissao_pipeline');
  IF v_lidos IS DISTINCT FROM ARRAY['organization_id', 'estado', 'created_at', 'id'] THEN
    RAISE EXCEPTION 'O indice do pipeline nao tem (organization_id, estado, created_at, id): %.', v_lidos;
  END IF;

  SELECT array_agg(a.attname::text ORDER BY k.ord) INTO v_lidos
    FROM pg_index i
    CROSS JOIN LATERAL unnest(i.indkey::int2[]) WITH ORDINALITY AS k(attnum, ord)
    JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = k.attnum
   WHERE i.indexrelid = to_regclass('public.idx_pessoas_convites_admissao_org_criado');
  IF v_lidos IS DISTINCT FROM ARRAY['organization_id', 'created_at', 'id'] THEN
    RAISE EXCEPTION 'O indice sem estado do pipeline nao tem (organization_id, created_at, id): %.', v_lidos;
  END IF;

  -- O limite da rever_sensivel tem um indice que comeca por auth_user_id.
  IF NOT EXISTS (
    SELECT 1
      FROM pg_index i
      JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = i.indkey[0]
     WHERE i.indrelid = to_regclass('public.pessoas_acessos_sensiveis')
       AND a.attname = 'auth_user_id') THEN
    RAISE EXCEPTION 'pessoas_acessos_sensiveis nao tem um indice a comecar por auth_user_id.';
  END IF;

  -- O Vault so e legivel pelo servico: anon e authenticated sem USAGE nem SELECT.
  FOREACH v_papel IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF has_schema_privilege(v_papel, 'vault', 'USAGE')
       OR has_table_privilege(v_papel, 'vault.decrypted_secrets', 'SELECT')
       OR has_table_privilege(v_papel, 'vault.secrets', 'SELECT') THEN
      RAISE EXCEPTION '% tem acesso ao Vault.', v_papel;
    END IF;
  END LOOP;

  -- 2b. Os 3 indices novos existem (e sao 3).
  SELECT count(*) INTO v_n FROM pg_class
   WHERE oid IN (to_regclass('public.idx_pessoas_convites_admissao_pipeline'),
                 to_regclass('public.idx_pessoas_convites_admissao_org_criado'),
                 to_regclass('public.idx_pessoas_acessos_sensiveis_auth_data'));
  IF v_n <> 3 THEN
    RAISE EXCEPTION 'Esperavam-se os 3 indices novos (pipeline, org_criado, acessos auth_data); ha %.', v_n;
  END IF;

  -- 2c. A visibilidade da revisao, por comportamento: com todas as permissoes,
  --     as 45 chaves, niss, iban e os 3 tipos de anexo sao visiveis; uma chave
  --     fora do mapa nunca; cada anexo e cada chave so com o seu dominio.
  FOREACH v_chave IN ARRAY (v_lista_branca || ARRAY['niss', 'iban', 'cartao_cidadao', 'comprovativo_iban', 'fotografia']) LOOP
    IF NOT public.hr_admissao_revisao_visivel(v_chave, v_todas) THEN
      RAISE EXCEPTION 'A chave % devia ser visivel com todas as permissoes.', v_chave;
    END IF;
    IF public.hr_admissao_revisao_visivel(v_chave, '{}'::jsonb) THEN
      RAISE EXCEPTION 'A chave % devia estar oculta sem permissoes.', v_chave;
    END IF;
  END LOOP;
  IF public.hr_admissao_revisao_visivel('chave_fora_do_mapa', v_todas)
     OR public.hr_admissao_revisao_visivel(NULL, v_todas)
     -- anexos (e a devolucao, que usa as mesmas chaves e tipos)
     OR NOT public.hr_admissao_revisao_visivel('comprovativo_iban', '{"pessoas_dados_bancarios": true}'::jsonb)
     OR public.hr_admissao_revisao_visivel('comprovativo_iban', v_todas - 'pessoas_dados_bancarios')
     OR NOT public.hr_admissao_revisao_visivel('cartao_cidadao', '{"pessoas_identificacao": true}'::jsonb)
     OR public.hr_admissao_revisao_visivel('cartao_cidadao', v_todas - 'pessoas_identificacao')
     OR NOT public.hr_admissao_revisao_visivel('fotografia', '{"pessoas_dados_pessoais": true}'::jsonb)
     OR public.hr_admissao_revisao_visivel('fotografia', v_todas - 'pessoas_dados_pessoais')
     OR public.hr_admissao_revisao_visivel('iban', v_todas - 'pessoas_dados_bancarios')
     OR public.hr_admissao_revisao_visivel('niss', v_todas - 'pessoas_identificacao')
     -- dado de saude
     OR public.hr_admissao_revisao_visivel('dependentes_deficientes', v_todas - 'pessoas_dados_pessoais')
     OR public.hr_admissao_revisao_visivel('nif', '{"pessoas_identificacao": false}'::jsonb)
     OR public.hr_admissao_revisao_visivel('morada_linha1', v_todas - 'pessoas_moradas') THEN
    RAISE EXCEPTION 'hr_admissao_revisao_visivel nao aplica a regra por dominio como esperado.';
  END IF;

  -- 3. As accoes que esta migration grava existem no CHECK dos eventos, e os
  --    valores que a rever_sensivel regista existem nos CHECKs do registo
  --    sensivel (por conjunto de literais).
  SELECT array_agg(DISTINCT m[1]) INTO v_lidos
    FROM pg_constraint c,
         regexp_matches(pg_get_constraintdef(c.oid), '''([a-z_]+)''', 'g') AS m
   WHERE c.conrelid = to_regclass('public.pessoas_convites_admissao_eventos')
     AND c.conname = 'pessoas_convites_admissao_eventos_acao_valida'
     AND c.contype::text = 'c';
  IF NOT (v_lidos @> v_acoes_usadas) THEN
    RAISE EXCEPTION 'O CHECK das accoes dos eventos nao aceita todas as accoes usadas pela V3a.';
  END IF;

  SELECT array_agg(DISTINCT m[1]) INTO v_lidos
    FROM pg_constraint c,
         regexp_matches(pg_get_constraintdef(c.oid), '''([a-z_0-9]+)''', 'g') AS m
   WHERE c.conrelid = to_regclass('public.pessoas_acessos_sensiveis')
     AND c.conname IN ('pessoas_acessos_sensiveis_campo_valido', 'pessoas_acessos_sensiveis_accao_valida',
                       'pessoas_acessos_sensiveis_origem_valida')
     AND c.contype::text = 'c';
  IF NOT (v_lidos @> ARRAY['niss', 'iban', 'revelar', 'utilizador']) THEN
    RAISE EXCEPTION 'Os CHECKs de pessoas_acessos_sensiveis nao aceitam niss, iban, revelar e utilizador.';
  END IF;

  -- 4. Os metadados que esta migration grava passam no validador da V2.
  IF NOT public.hr_convite_evento_metadados_validos('{"tipo": "portal"}'::jsonb)
     OR NOT public.hr_convite_evento_metadados_validos('{"tipo": "portal", "tentativas": 3}'::jsonb)
     OR NOT public.hr_convite_evento_metadados_validos('{"tentativas": 1000, "erro_codigo": "otp_bloqueado"}'::jsonb)
     OR NOT public.hr_convite_evento_metadados_validos('{}'::jsonb) THEN
    RAISE EXCEPTION 'hr_convite_evento_metadados_validos recusa metadados que a V3a grava.';
  END IF;

  -- 5. A janela da sessao, com datas fixas.
  IF NOT public.hr_convite_sessao_valida(v_t0, v_t0 + interval '10 minutes', v_t0 + interval '40 minutes')
     OR public.hr_convite_sessao_valida(v_t0, v_t0, v_t0 + interval '31 minutes')
     OR NOT public.hr_convite_sessao_valida(v_t0, v_t0 + interval '3 hours 50 minutes', v_t0 + interval '4 hours')
     OR public.hr_convite_sessao_valida(v_t0, v_t0 + interval '3 hours 55 minutes', v_t0 + interval '4 hours 1 minute')
     OR public.hr_convite_sessao_valida(NULL, v_t0, v_t0)
     OR public.hr_convite_sessao_valida(v_t0, v_t0, v_t0 - interval '1 minute') THEN
    RAISE EXCEPTION 'hr_convite_sessao_valida nao aplica 30 min de inactividade e 4 h no total.';
  END IF;

  -- 6. A lista branca copiada na portal_ler e a da V2, por comportamento.
  IF cardinality(v_lista_branca) <> 45 THEN
    RAISE EXCEPTION 'A lista branca esperada devia ter 45 chaves; tem %.', cardinality(v_lista_branca);
  END IF;
  FOREACH v_chave IN ARRAY v_lista_branca LOOP
    v_tudo := v_tudo || jsonb_build_object(v_chave, 'x');
  END LOOP;
  IF NOT public.hr_convite_rascunho_valido(v_tudo)
     OR public.hr_convite_rascunho_valido(v_tudo || '{"chave_46_inventada": "x"}'::jsonb) THEN
    RAISE EXCEPTION 'A lista branca de hr_convite_rascunho_valido mudou: rever a copia em rpc_hr_convite_admissao_portal_ler.';
  END IF;

  -- 7. Uma so versao de cada funcao nova e da _estado; retorno da _estado igual.
  SELECT count(*) INTO v_n
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public'
     AND p.proname IN ('hr_convite_sessao_valida', 'hr_convite_sessao_exigir', 'hr_convite_link_token',
                       'rpc_hr_convite_link_guardar', 'rpc_hr_convite_admissao_otp_pedir',
                       'rpc_hr_convite_admissao_otp_verificar', 'rpc_hr_convite_admissao_sessao_terminar',
                       'rpc_hr_convite_admissao_portal_ler', 'rpc_hr_convite_admissao_sensiveis_gravar',
                       'rpc_hr_convite_admissao_reenviar', 'rpc_hr_admissao_listar',
                       'rpc_hr_admissao_rever_ler', 'rpc_hr_admissao_rever_sensivel',
                       'rpc_hr_convite_admissao_estado', 'hr_admissao_revisao_visivel');
  IF v_n <> 15 THEN
    RAISE EXCEPTION 'Esperava-se uma so versao de cada uma das 15 funcoes; ha %.', v_n;
  END IF;
  IF pg_get_function_result(to_regprocedure('public.rpc_hr_convite_admissao_estado(text)')) IS DISTINCT FROM 'jsonb' THEN
    RAISE EXCEPTION 'O retorno da _estado mudou.';
  END IF;

  -- 8. Grants por papel.
  FOREACH v_fn IN ARRAY v_internas_fechadas LOOP
    FOREACH v_papel IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
      IF has_function_privilege(v_papel, v_fn, 'EXECUTE') THEN
        RAISE EXCEPTION '% pode executar a funcao interna %; nenhum papel devia.', v_papel, v_fn;
      END IF;
    END LOOP;
  END LOOP;

  IF NOT has_function_privilege('authenticated', 'public.hr_convite_sessao_valida(timestamptz, timestamptz, timestamptz)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.hr_convite_sessao_valida(timestamptz, timestamptz, timestamptz)', 'EXECUTE')
     OR has_function_privilege('service_role', 'public.hr_convite_sessao_valida(timestamptz, timestamptz, timestamptz)', 'EXECUTE') THEN
    RAISE EXCEPTION 'hr_convite_sessao_valida tem de ser executavel so por authenticated.';
  END IF;

  FOREACH v_fn IN ARRAY v_so_service LOOP
    IF NOT has_function_privilege('service_role', v_fn, 'EXECUTE')
       OR has_function_privilege('anon', v_fn, 'EXECUTE')
       OR has_function_privilege('authenticated', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION '% tem de ser so service_role.', v_fn;
    END IF;
  END LOOP;

  FOREACH v_fn IN ARRAY v_so_authenticated LOOP
    IF NOT has_function_privilege('authenticated', v_fn, 'EXECUTE')
       OR has_function_privilege('anon', v_fn, 'EXECUTE')
       OR has_function_privilege('service_role', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION '% tem de ser so authenticated.', v_fn;
    END IF;
  END LOOP;

  -- 9. As RPCs sao SECURITY DEFINER com search_path fixo; as internas tem
  --    search_path fixo e NAO sao SECURITY DEFINER.
  FOREACH v_fn IN ARRAY (v_so_service || v_so_authenticated) LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_proc p
                    WHERE p.oid = to_regprocedure(v_fn)
                      AND p.prosecdef
                      AND array_to_string(p.proconfig, ';') LIKE '%search_path=public, pg_temp%') THEN
      RAISE EXCEPTION '% tem de ser SECURITY DEFINER com search_path fixo.', v_fn;
    END IF;
  END LOOP;
  FOREACH v_fn IN ARRAY (v_internas_fechadas || ARRAY['public.hr_convite_sessao_valida(timestamptz, timestamptz, timestamptz)']) LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_proc p
                    WHERE p.oid = to_regprocedure(v_fn)
                      AND NOT p.prosecdef
                      AND array_to_string(p.proconfig, ';') LIKE '%search_path=public, pg_temp%') THEN
      RAISE EXCEPTION '% tem de ter search_path fixo e nao ser SECURITY DEFINER.', v_fn;
    END IF;
  END LOOP;

  -- 10. O trigger transitorio da V2 continua (nao muda nesta vaga).
  IF NOT EXISTS (SELECT 1 FROM pg_trigger
                  WHERE tgrelid = to_regclass('public.pessoas_convites_admissao')
                    AND tgname = 'trg_pessoas_convites_admissao_used_at_transitorio'
                    AND tgenabled::text <> 'D') THEN
    RAISE EXCEPTION 'O trigger transitorio da V2 devia continuar activo.';
  END IF;

  RAISE NOTICE 'OK: 5 colunas novas sem SELECT para anon/authenticated, indice do pipeline, sessao_exigir e link_token sem EXECUTE para nenhum papel, sessao_valida so authenticated, 7 RPCs do portal/link so service_role, 3 leituras do RH so authenticated, _estado com a mesma assinatura e so o minimo publico.';
END;
$conferir$;
