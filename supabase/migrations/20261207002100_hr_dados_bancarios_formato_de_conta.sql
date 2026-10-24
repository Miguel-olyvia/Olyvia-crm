-- ==============================================================================
-- Dados bancarios: formato de conta (seis hipoteses) sem abrir um segundo
-- caminho de dados ao lado do Vault.
--
-- POR APLICAR.
--
--
-- -- O PEDIDO -----------------------------------------------------------------
--
-- Bloco "Informacoes bancarias" nos detalhes pessoais, com "Formato da conta
-- bancaria" a escolher entre: IBAN; Numero de conta + Codigo de ordenacao;
-- Numero de conta + Codigo de roteamento; CLABE; Nome do banco + numero da
-- conta; Outros. E um campo "Numero de conta".
--
--
-- -- O QUE JA EXISTE E NAO PODE SER QUEBRADO ----------------------------------
--
-- 20261120070000 poe o IBAN em claro no Vault e guarda na linha SO a referencia
-- ao segredo, os quatro ultimos caracteres e o pais. A escrita da tabela esta
-- REVOKE mais tres politicas RESTRICTIVE a false: so a RPC escreve. NAO existe
-- RPC de leitura em claro -- por decisao escrita la, nao por esquecimento.
--
-- O CHECK ..._segredo_e_mascara_juntos garante que nunca ha mascara sem segredo
-- por tras.
--
--
-- -- O DESENHO: o formato NAO abre um segundo caminho de dados ---------------
--
-- 1. "Numero de conta" NAO e coluna. E o parametro de entrada da RPC,
--    exactamente como o IBAN e hoje. Uma CLABE ou um numero de conta britanico
--    sao tao sensiveis quanto um IBAN; criar "numero_conta text" em claro ao
--    lado de um IBAN cifrado seria contornar a decisao da ronda 1 pela porta do
--    lado, e a linha passaria a revelar por leitura aquilo que o desenho todo
--    existe para nao revelar. O valor vai para o Vault pelo mesmo mecanismo,
--    qualquer que seja o formato. Ler a linha continua a devolver so: formato,
--    pais (quando aplicavel), ultimos 4, titular, banco, swift.
--
-- 2. As tres colunas mudam de NOME e nao de natureza: iban_secret_id,
--    iban_ultimos4 e iban_pais passam a conta_secret_id, conta_ultimos4 e
--    conta_pais. Com o formato a poder ser CLABE ou "banco + conta", o prefixo
--    iban_ passa a ser mentira em cinco dos seis casos -- e este projecto ja
--    paga o preco de nomes que mentem (ver horas_semanais em 20261120190000).
--    Tabela vazia: o rename e gratis agora e caro depois.
--
--    Nota tecnica: um RENAME COLUMN reescreve automaticamente as expressoes dos
--    CHECK que referem a coluna. Por isso ..._ultimos4_formato, ..._pais_iso e
--    ..._segredo_e_mascara_juntos NAO precisam de ser largados e recriados --
--    passam a falar de conta_* sozinhos. Confere-se isso no fim, em vez de se
--    assumir.
--
-- 3. conta_pais passa a CONDICIONAL. Hoje e left(iban,2), o que so faz sentido
--    para IBAN: para os outros formatos nao ha pais derivavel do numero, e
--    inventa-lo era pior do que nao o ter.
--
-- 4. A validacao mod-97 passa a ser condicional ao formato, e e aqui que esta o
--    unico risco real. hr_iban_valido fica INTOCADA e continua a ser chamada
--    quando o formato e 'iban' -- nao se enfraquece a validacao do IBAN para
--    acomodar os outros, acrescenta-se um ramo. Para os restantes formatos, o
--    valor e normalizado (maiusculas, sem espacos) e tem de casar
--    ^[0-9A-Z]{4,34}$; a mascara continua a ser right(valor, 4).
--
-- 5. UMA RPC, nao duas, e sem sobrecarga. Larga-se
--    rpc_hr_definir_iban(uuid,text,text,text,text) e cria-se
--    rpc_hr_definir_conta(uuid,text,text,text,text,text). Manter a antiga viva
--    ao lado de uma nova com mais um argumento e exactamente o cenario que ja
--    parou o botao de resolver submissoes neste projecto: dois candidatos e o
--    PostgREST sem saber qual escolher. O unico chamador e
--    PessoaIbanField.tsx, que muda na mesma ronda.
--
-- 6. Nada de permissao nova, nada de RPC de revelacao.
--    hr.pessoas.bancarios.view continua a dar acesso a mascara; ninguem na
--    aplicacao ve a conta completa, em nenhum formato. As 34 permissoes ficam
--    34.
--
-- 7. A coerencia entre formato e conteudo NAO e garantivel por CHECK -- o
--    numero esta no Vault e o CHECK ve so a mascara. E a RPC que a garante, tal
--    como ja garantia a correspondencia entre segredo e mascara.
--
--
-- -- UM DEFEITO ENCONTRADO POR LEITURA, E CORRIGIDO AQUI ----------------------
--
-- O plano desta ronda mandava passar o campo de auditoria de 'iban' para
-- 'conta_bancaria'. Ia rebentar em execucao: pessoas_acessos_sensiveis tem
-- CHECK (campo IN ('niss','iban','incapacidade','retribuicao'))
-- -- 20261120040000, linha 181. Com 'conta_bancaria', TODA a gravacao de dados
-- bancarios falharia na ultima linha da RPC, depois de o segredo ja estar
-- escrito no Vault: segredo criado, linha nao gravada, transaccao revertida, e
-- um segredo orfao a cada tentativa.
--
-- Alarga-se o dominio do campo de auditoria para incluir 'conta_bancaria', e
-- mantem-se 'iban' -- que continua legal e pode ter registos historicos. E um
-- alargamento: nenhuma linha existente passa a ilegal.
-- ==============================================================================


-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
DECLARE
  v_linhas    bigint;
  v_tem_iban  boolean;
  v_tem_conta boolean;
BEGIN
  IF to_regclass('public.pessoas_dados_bancarios') IS NULL THEN
    RAISE EXCEPTION
      'public.pessoas_dados_bancarios nao existe -- 20261120070000 tem de ir a frente na fila.';
  END IF;

  IF to_regclass('public.pessoas_acessos_sensiveis') IS NULL THEN
    RAISE EXCEPTION
      'public.pessoas_acessos_sensiveis nao existe -- 20261120040000 tem de ir a frente na fila.';
  END IF;

  -- A funcao de validacao de IBAN tem de existir: o ramo 'iban' da RPC nova
  -- chama-a e nao ha substituto. Se faltar, mais vale abortar aqui do que
  -- criar uma RPC que rebenta ao primeiro IBAN.
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'hr_iban_valido'
  ) THEN
    RAISE EXCEPTION
      'public.hr_iban_valido nao existe. A RPC nova depende dela para o formato iban -- 20261120070000 tem de ir a frente na fila.';
  END IF;

  -- A extensao do Vault e o alicerce e nao ha caminho alternativo em claro.
  IF NOT EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'supabase_vault'
  ) THEN
    RAISE EXCEPTION
      'A extensao supabase_vault nao esta activa. Sem ela a RPC nova nao consegue guardar a conta cifrada, e nao existe caminho alternativo em claro -- por decisao de 20261120070000.';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'pessoas_dados_bancarios'
       AND column_name = 'iban_secret_id'
  ) INTO v_tem_iban;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'pessoas_dados_bancarios'
       AND column_name = 'conta_secret_id'
  ) INTO v_tem_conta;

  IF NOT v_tem_iban AND NOT v_tem_conta THEN
    RAISE EXCEPTION
      'pessoas_dados_bancarios nao tem iban_secret_id nem conta_secret_id. O estado nao e o esperado -- investigar antes de aplicar.';
  END IF;

  IF v_tem_iban AND v_tem_conta THEN
    RAISE EXCEPTION
      'pessoas_dados_bancarios tem iban_secret_id E conta_secret_id ao mesmo tempo. Um rename a meio ficou por acabar e nao se sabe qual delas aponta para o segredo verdadeiro. Resolver a mao antes de aplicar -- um erro aqui perde a referencia a segredos do Vault.';
  END IF;

  -- Se houver linhas, cada uma tem um segredo no Vault por tras. O rename e
  -- seguro (nao toca no Vault), mas o formato de todas elas passa a 'iban' por
  -- DEFAULT, e isso e uma afirmacao sobre dados existentes que convem ser dita.
  EXECUTE 'SELECT count(*) FROM public.pessoas_dados_bancarios' INTO v_linhas;

  IF v_linhas > 0 THEN
    RAISE WARNING
      'pessoas_dados_bancarios tem % linhas. Todas vao ficar com formato_conta = ''iban'' pelo DEFAULT -- o que e correcto, porque ate agora so IBANs podiam ter sido gravados (a RPC antiga validava mod-97). Nenhum segredo do Vault e tocado por esta migracao.',
      v_linhas;
  ELSE
    RAISE NOTICE 'Guardas passadas: pessoas_dados_bancarios vazia, Vault activo, hr_iban_valido presente.';
  END IF;
END;
$guardas$;


-- ---- 1. Os tres renames ----------------------------------------------------
-- Um a um, cada um guardado. As expressoes dos CHECK que referem estas colunas
-- sao reescritas pelo Postgres automaticamente -- conferido no fim.
DO $renames$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'pessoas_dados_bancarios'
       AND column_name = 'iban_secret_id'
  ) THEN
    ALTER TABLE public.pessoas_dados_bancarios
      RENAME COLUMN iban_secret_id TO conta_secret_id;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'pessoas_dados_bancarios'
       AND column_name = 'iban_ultimos4'
  ) THEN
    ALTER TABLE public.pessoas_dados_bancarios
      RENAME COLUMN iban_ultimos4 TO conta_ultimos4;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'pessoas_dados_bancarios'
       AND column_name = 'iban_pais'
  ) THEN
    ALTER TABLE public.pessoas_dados_bancarios
      RENAME COLUMN iban_pais TO conta_pais;
  END IF;
END;
$renames$;


-- ---- 2. formato_conta ------------------------------------------------------
-- DEFAULT 'iban': e o unico formato que a RPC antiga permitia gravar, por isso
-- para qualquer linha existente o default afirma a verdade.
ALTER TABLE public.pessoas_dados_bancarios
  ADD COLUMN IF NOT EXISTS formato_conta text NOT NULL DEFAULT 'iban';

DO $checks$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'pessoas_dados_bancarios_formato_valido'
       AND conrelid = to_regclass('public.pessoas_dados_bancarios')
  ) THEN
    ALTER TABLE public.pessoas_dados_bancarios
      ADD CONSTRAINT pessoas_dados_bancarios_formato_valido CHECK (
        formato_conta IN (
          'iban',
          'conta_mais_sort_code',
          'conta_mais_routing',
          'clabe',
          'banco_mais_conta',
          'outro'
        )
      );
  END IF;

  -- O pais so e derivavel do numero quando o numero e um IBAN. Para os outros
  -- formatos nao ha pais no numero, e guardar la um valor seria inventa-lo.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'pessoas_dados_bancarios_pais_so_para_iban'
       AND conrelid = to_regclass('public.pessoas_dados_bancarios')
  ) THEN
    ALTER TABLE public.pessoas_dados_bancarios
      ADD CONSTRAINT pessoas_dados_bancarios_pais_so_para_iban CHECK (
        formato_conta = 'iban' OR conta_pais IS NULL
      );
  END IF;
END;
$checks$;


-- ---- 3. O dominio do campo de auditoria ------------------------------------
-- Ver "UM DEFEITO ENCONTRADO POR LEITURA" no cabecalho: sem isto, toda a
-- gravacao de dados bancarios falhava na ultima linha da RPC. 'iban' mantem-se
-- legal -- pode haver registos historicos, e um registo append-only nao se
-- reescreve.
ALTER TABLE public.pessoas_acessos_sensiveis
  DROP CONSTRAINT IF EXISTS pessoas_acessos_sensiveis_campo_valido;

ALTER TABLE public.pessoas_acessos_sensiveis
  ADD CONSTRAINT pessoas_acessos_sensiveis_campo_valido CHECK (
    campo IN ('niss','iban','conta_bancaria','incapacidade','retribuicao')
  );


-- ---- 4. A RPC: uma so, com o formato -------------------------------------
-- Larga-se a antiga pela assinatura EXACTA. Deixa-la viva ao lado da nova daria
-- dois candidatos ao PostgREST -- o erro que ja parou o botao de submissoes.
DROP FUNCTION IF EXISTS public.rpc_hr_definir_iban(uuid, text, text, text, text);

CREATE OR REPLACE FUNCTION public.rpc_hr_definir_conta(
  p_pessoa_id uuid,
  p_formato   text,
  p_conta     text,
  p_titular   text DEFAULT NULL,
  p_banco     text DEFAULT NULL,
  p_swift     text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_org       uuid;
  v_conta     text;
  v_formato   text;
  v_pais      text;
  v_linha     record;
  v_secret_id uuid;
  v_anew      uuid;
BEGIN
  SELECT p.organization_id INTO v_org
  FROM public.pessoas p
  WHERE p.id = p_pessoa_id AND p.deleted_at IS NULL;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'pessoa_nao_encontrada';
  END IF;

  IF NOT public.has_anew_permission_in_org(auth.uid(), 'hr.pessoas.bancarios.edit', v_org) THEN
    RAISE EXCEPTION 'insufficient_privilege';
  END IF;

  v_formato := coalesce(p_formato, 'iban');

  IF v_formato NOT IN ('iban','conta_mais_sort_code','conta_mais_routing',
                       'clabe','banco_mais_conta','outro') THEN
    RAISE EXCEPTION 'formato_invalido';
  END IF;

  -- Normalizacao unica para todos os formatos: maiusculas, sem espacos.
  v_conta := upper(regexp_replace(coalesce(p_conta, ''), '[[:space:]]', '', 'g'));

  IF v_formato = 'iban' THEN
    -- O ramo do IBAN NAO foi enfraquecido: continua o mod-97 completo, pela
    -- mesma funcao de 20261120070000.
    IF NOT public.hr_iban_valido(v_conta) THEN
      RAISE EXCEPTION 'iban_invalido';
    END IF;
    v_pais := left(v_conta, 2);
  ELSE
    -- Para os outros formatos nao existe digito de controlo universal que se
    -- possa verificar. Valida-se o que se pode: alfanumerico maiusculo, entre
    -- 4 e 34 caracteres (34 e o maximo de um IBAN, e serve de tecto razoavel).
    -- O minimo de 4 nao e decorativo: a mascara sao os ultimos 4, e um valor
    -- mais curto daria uma mascara que E o numero inteiro.
    IF v_conta !~ '^[0-9A-Z]{4,34}$' THEN
      RAISE EXCEPTION 'conta_invalida';
    END IF;
    -- Sem pais: nao ha nenhum derivavel do numero, e o CHECK
    -- pessoas_dados_bancarios_pais_so_para_iban obriga a NULL.
    v_pais := NULL;
  END IF;

  SELECT au.id INTO v_anew FROM public.anew_users au WHERE au.auth_user_id = auth.uid() LIMIT 1;

  SELECT b.id, b.conta_secret_id INTO v_linha
  FROM public.pessoas_dados_bancarios b
  WHERE b.pessoa_id = p_pessoa_id;

  IF v_linha.id IS NOT NULL AND v_linha.conta_secret_id IS NOT NULL THEN
    -- Ja ha segredo: actualiza-se o mesmo, para nao deixar o antigo orfao no
    -- Vault. Vale igualmente quando o FORMATO muda -- o segredo e o mesmo
    -- registo, so o conteudo e outro.
    PERFORM vault.update_secret(v_linha.conta_secret_id, v_conta);
    v_secret_id := v_linha.conta_secret_id;
  ELSE
    -- Nome unico por criacao: se uma linha ja tivesse sido apagada e recriada,
    -- um nome fixo por pessoa colidiria com o segredo orfao antigo.
    v_secret_id := vault.create_secret(
      v_conta,
      'hr_conta:' || p_pessoa_id::text || ':' || gen_random_uuid()::text,
      'Conta bancaria de RH da pessoa ' || p_pessoa_id::text || ' (formato ' || v_formato || ')'
    );
  END IF;

  INSERT INTO public.pessoas_dados_bancarios
    (pessoa_id, organization_id, titular, banco, formato_conta,
     conta_secret_id, conta_ultimos4, conta_pais, swift,
     is_principal, created_by, updated_by)
  VALUES
    (p_pessoa_id, v_org, p_titular, p_banco, v_formato,
     v_secret_id, right(v_conta, 4), v_pais, p_swift,
     true, v_anew, v_anew)
  ON CONFLICT (pessoa_id) DO UPDATE SET
    titular         = EXCLUDED.titular,
    banco           = EXCLUDED.banco,
    formato_conta   = EXCLUDED.formato_conta,
    conta_secret_id = EXCLUDED.conta_secret_id,
    conta_ultimos4  = EXCLUDED.conta_ultimos4,
    conta_pais      = EXCLUDED.conta_pais,
    swift           = EXCLUDED.swift,
    updated_by      = EXCLUDED.updated_by,
    updated_at      = now();

  -- 'conta_bancaria' e nao 'iban': o registo passa a dizer a verdade para os
  -- seis formatos. O dominio do campo foi alargado mais acima nesta migracao --
  -- sem isso, esta linha rebentava e revertia a transaccao toda.
  PERFORM public.hr_registar_acesso_sensivel(p_pessoa_id, v_org, 'conta_bancaria', 'alterar');
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_hr_definir_conta(uuid, text, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_hr_definir_conta(uuid, text, text, text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_hr_definir_conta(uuid, text, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_definir_conta(uuid, text, text, text, text, text) TO service_role;


-- ---- COMMENTs --------------------------------------------------------------
COMMENT ON FUNCTION public.rpc_hr_definir_conta(uuid, text, text, text, text, text) IS
'Unico caminho para escrever dados bancarios de RH, em qualquer dos seis formatos. Substituiu rpc_hr_definir_iban em 20261120220000, que foi LARGADA e nao mantida ao lado -- duas funcoes candidatas deixariam o PostgREST sem saber qual escolher. Exige hr.pessoas.bancarios.edit na organizacao da pessoa. Valida conforme o formato: mod-97 completo por hr_iban_valido quando formato = ''iban'' (essa validacao NAO foi enfraquecida), e ^[0-9A-Z]{4,34}$ nos restantes, onde nao existe digito de controlo universal. Guarda o numero cifrado no Vault (actualizando o segredo existente em vez de criar outro, mesmo quando o formato muda) e grava na linha apenas a referencia, os ultimos quatro caracteres e -- so no caso IBAN -- o pais. Registra em pessoas_acessos_sensiveis com campo = ''conta_bancaria''. NAO existe funcao inversa: o numero em claro nao volta a sair para a aplicacao, em nenhum formato. A coerencia entre formato_conta e o conteudo do segredo e garantida AQUI e nao por CHECK -- o numero esta no Vault e um CHECK ve so a mascara.';

COMMENT ON COLUMN public.pessoas_dados_bancarios.formato_conta IS
'O formato do numero guardado no Vault: iban, conta_mais_sort_code, conta_mais_routing, clabe, banco_mais_conta ou outro. Determina como a RPC valida a entrada e como a interface rotula o campo e mostra a mascara. DEFAULT ''iban'' porque, ate 20261120220000, era o unico formato que a RPC deixava gravar -- para qualquer linha anterior o default afirma a verdade. NAO e verificavel por CHECK contra o conteudo real: o numero esta cifrado e o CHECK ve so os ultimos 4.';

COMMENT ON COLUMN public.pessoas_dados_bancarios.conta_secret_id IS
'Referencia a vault.secrets(id). Chamava-se iban_secret_id ate 20261120220000, nome que passou a mentir quando o formato deixou de ser sempre IBAN. Sem chave estrangeira porque e outro schema. Apagar esta linha NAO apaga o segredo: quem apagar tem de o apagar tambem, ou fica orfao no Vault.';

COMMENT ON COLUMN public.pessoas_dados_bancarios.conta_ultimos4 IS
'Os quatro ultimos caracteres do numero de conta, qualquer que seja o formato. E tudo o que a interface mostra, e nao ha caminho para ver mais. E por isso que a RPC exige pelo menos 4 caracteres: com menos, a mascara seria o numero inteiro.';

COMMENT ON COLUMN public.pessoas_dados_bancarios.conta_pais IS
'ISO-2 derivado das duas primeiras letras, e SO quando formato_conta = ''iban'' -- e o unico formato onde o pais esta no proprio numero. Garantido por pessoas_dados_bancarios_pais_so_para_iban: nos outros formatos e NULL, porque inventar um pais era pior do que nao o ter.';

COMMENT ON TABLE public.pessoas_dados_bancarios IS
'Dados bancarios da pessoa. O numero de conta em claro NAO esta aqui: vive cifrado no Vault e a linha guarda so conta_secret_id, os ultimos quatro caracteres, o formato e (so para IBAN) o pais -- o mesmo padrao das palavras-passe de SMTP (20261110750000). Desde 20261120220000 suporta seis formatos, e "numero de conta" continua deliberadamente a NAO ser coluna: uma CLABE ou um numero britanico sao tao sensiveis quanto um IBAN, e uma coluna em claro ao lado de um IBAN cifrado contornaria o desenho todo pela porta do lado. Escrita fechada a authenticated: so rpc_hr_definir_conta escreve. NAO existe RPC de leitura em claro, de proposito; quem processa salarios le vault.decrypted_secrets por service_role, fora da aplicacao.';

COMMENT ON CONSTRAINT pessoas_acessos_sensiveis_campo_valido ON public.pessoas_acessos_sensiveis IS
'Alargado em 20261120220000 com ''conta_bancaria''. ''iban'' mantem-se legal: o registo e append-only e pode ter linhas historicas escritas pela RPC antiga, que nao se reescrevem. Alargar e nao substituir -- encolher este dominio tornaria ilegais registos de auditoria ja gravados, que e o oposto do que um registo de auditoria serve.';


-- ---- Conferir --------------------------------------------------------------
DO $conferir$
DECLARE
  v_politicas integer;
  v_n_conta   integer;
  v_n_iban    integer;
  v_mascara   text;
  v_campo_def text;
  v_formato   text;
BEGIN
  -- Os nomes antigos nao podem ter sobrevivido, e os novos tem de existir.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'pessoas_dados_bancarios'
       AND column_name IN ('iban_secret_id','iban_ultimos4','iban_pais')
  ) THEN
    RAISE EXCEPTION
      'Ainda ha colunas iban_* em pessoas_dados_bancarios depois dos renames. Nao aplicar neste estado: a RPC nova escreve em conta_* e ficariam colunas orfas a apontar para segredos do Vault.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'pessoas_dados_bancarios'
       AND column_name = 'conta_secret_id'
  ) THEN
    RAISE EXCEPTION 'conta_secret_id nao existe depois do rename.';
  END IF;

  -- O ponto central de 20261120070000, reconferido: NAO pode existir coluna
  -- com o numero em claro. Acrescentam-se aos nomes de la os que este pedido
  -- podia ter feito nascer.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'pessoas_dados_bancarios'
       AND column_name IN ('iban','iban_completo','iban_claro',
                           'numero_conta','conta','conta_completa','clabe')
  ) THEN
    RAISE EXCEPTION
      'pessoas_dados_bancarios tem uma coluna com o numero de conta em claro. O numero vive no Vault, qualquer que seja o formato -- nao aplicar neste estado.';
  END IF;

  -- O rename tem de ter reescrito a expressao do CHECK de coerencia. Se ele
  -- ainda falar de iban_*, alguma coisa muito estranha aconteceu.
  SELECT pg_get_constraintdef(oid) INTO v_mascara
    FROM pg_constraint
   WHERE conname = 'pessoas_dados_bancarios_segredo_e_mascara_juntos'
     AND conrelid = to_regclass('public.pessoas_dados_bancarios');

  IF v_mascara IS NULL THEN
    RAISE EXCEPTION
      'pessoas_dados_bancarios_segredo_e_mascara_juntos desapareceu. Era a garantia de que nunca ha mascara sem segredo por tras -- nao aplicar neste estado.';
  END IF;

  IF v_mascara LIKE '%iban_%' THEN
    RAISE EXCEPTION
      'O CHECK de coerencia ainda refere colunas iban_*: %. O rename nao reescreveu a expressao como se esperava.',
      v_mascara;
  END IF;

  -- O dominio do formato, com os seis.
  SELECT pg_get_constraintdef(oid) INTO v_formato
    FROM pg_constraint
   WHERE conname = 'pessoas_dados_bancarios_formato_valido'
     AND conrelid = to_regclass('public.pessoas_dados_bancarios');

  IF v_formato IS NULL
     OR v_formato NOT LIKE '%conta_mais_sort_code%'
     OR v_formato NOT LIKE '%conta_mais_routing%'
     OR v_formato NOT LIKE '%clabe%'
     OR v_formato NOT LIKE '%banco_mais_conta%'
     OR v_formato NOT LIKE '%outro%' THEN
    RAISE EXCEPTION
      'pessoas_dados_bancarios_formato_valido nao tem os seis formatos pedidos: %',
      coalesce(v_formato, '(constraint ausente)');
  END IF;

  -- O dominio da auditoria TEM de aceitar conta_bancaria, senao toda a
  -- gravacao bancaria falha na ultima linha da RPC. E este o defeito que o
  -- cabecalho descreve.
  SELECT pg_get_constraintdef(oid) INTO v_campo_def
    FROM pg_constraint
   WHERE conname = 'pessoas_acessos_sensiveis_campo_valido'
     AND conrelid = to_regclass('public.pessoas_acessos_sensiveis');

  IF v_campo_def IS NULL OR v_campo_def NOT LIKE '%conta_bancaria%' THEN
    RAISE EXCEPTION
      'pessoas_acessos_sensiveis_campo_valido nao aceita conta_bancaria: %. Sem isto, rpc_hr_definir_conta rebenta na ultima linha e reverte tudo -- deixando um segredo orfao no Vault a cada tentativa.',
      coalesce(v_campo_def, '(constraint ausente)');
  END IF;

  IF v_campo_def NOT LIKE '%''iban''%' THEN
    RAISE EXCEPTION
      'pessoas_acessos_sensiveis_campo_valido deixou de aceitar iban: %. Ha registos de auditoria historicos com esse valor, e um registo append-only nao se pode tornar ilegal.',
      v_campo_def;
  END IF;

  -- Uma funcao e uma so. Zero sobrecargas, e a antiga tem de ter desaparecido.
  SELECT count(*) INTO v_n_conta
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'rpc_hr_definir_conta';

  IF v_n_conta <> 1 THEN
    RAISE EXCEPTION
      'Existem % funcoes rpc_hr_definir_conta e devia existir 1. Com mais do que uma, o PostgREST nao sabe qual escolher -- foi assim que o botao de resolver submissoes parou.',
      v_n_conta;
  END IF;

  SELECT count(*) INTO v_n_iban
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'rpc_hr_definir_iban';

  IF v_n_iban <> 0 THEN
    RAISE EXCEPTION
      'rpc_hr_definir_iban ainda existe (% versoes). Devia ter sido largada: mante-la ao lado da nova e o cenario dos dois candidatos.',
      v_n_iban;
  END IF;

  -- hr_iban_valido NAO foi tocada, e continua a recusar um digito de controlo
  -- errado. Se este ramo se tivesse enfraquecido para acomodar os outros
  -- formatos, era aqui que se sabia.
  IF NOT public.hr_iban_valido('PT50000201231234567890154') THEN
    RAISE EXCEPTION 'hr_iban_valido rejeitou um IBAN de teste valido; a validacao do ramo iban foi danificada.';
  END IF;
  IF public.hr_iban_valido('PT50000201231234567890155') THEN
    RAISE EXCEPTION 'hr_iban_valido aceitou um IBAN com digito de controlo errado; a validacao do ramo iban foi enfraquecida.';
  END IF;

  -- A escrita continua fechada. E o alicerce todo: se authenticated ganhar
  -- INSERT ou UPDATE, o formato e a mascara passam a poder mentir sobre o
  -- segredo.
  IF has_table_privilege('authenticated', 'public.pessoas_dados_bancarios', 'INSERT')
     OR has_table_privilege('authenticated', 'public.pessoas_dados_bancarios', 'UPDATE') THEN
    RAISE EXCEPTION
      'authenticated tem INSERT ou UPDATE em pessoas_dados_bancarios. A escrita tem de passar so por rpc_hr_definir_conta -- nao aplicar neste estado.';
  END IF;

  IF NOT has_table_privilege('authenticated', 'public.pessoas_dados_bancarios', 'SELECT') THEN
    RAISE EXCEPTION 'authenticated nao consegue ler pessoas_dados_bancarios; a ficha ficaria sem a mascara para mostrar.';
  END IF;

  SELECT count(*) INTO v_politicas FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'pessoas_dados_bancarios';

  IF v_politicas <> 4 THEN
    RAISE EXCEPTION
      'Esperavam-se 4 politicas em pessoas_dados_bancarios e encontraram-se %. Esta migracao nao devia ter tocado em politica nenhuma.',
      v_politicas;
  END IF;

  RAISE NOTICE
    'OK: iban_* renomeadas para conta_*, formato_conta com 6 hipoteses, pais so para IBAN, auditoria a aceitar conta_bancaria, rpc_hr_definir_conta unica e rpc_hr_definir_iban largada. Escrita continua fechada e nao ha coluna em claro. NENHUMA permissao nova: continuam 34.';
END;
$conferir$;


-- ==============================================================================
-- ANTES DO db push
--
-- 1. E a ULTIMA das quatro de proposito: e a unica que mexe numa RPC com
--    chamador vivo. Aplica-la deixa PessoaIbanField.tsx a chamar uma funcao que
--    ja nao existe. A migracao e a alteracao de src TEM de ir NO MESMO COMMIT
--    -- PessoaIbanField.tsx (que passa a PessoaContaBancariaField.tsx),
--    PessoaPessoaisTab.tsx, src/types/hr.ts, usePessoa.ts, hrDb.ts e
--    novaPessoa.ts. Esta e uma janela real e nao uma precaucao teorica.
--
-- 2. novaPessoa.ts faz insert directo nas tabelas, e a escrita de
--    pessoas_dados_bancarios esta revogada: os campos bancarios do formulario
--    de nova pessoa NAO podem ir num insert. Tem de ser uma chamada a
--    rpc_hr_definir_conta DEPOIS de a pessoa existir, com tratamento de erro
--    proprio -- a pessoa fica criada mesmo que a conta falhe, e a mensagem tem
--    de o dizer. E o unico sitio onde o desenho da ronda 1 impoe um segundo
--    passo.
--
-- 3. Nenhum segredo do Vault e tocado, criado ou apagado por esta migracao. Os
--    renames sao de colunas da linha, nao da referencia.
--
-- 4. Nao ha momento em que a base fique defeituosa: os dois ALTER de dominio
--    so ALARGAM, e o DROP/CREATE da funcao corre dentro da mesma transaccao.
--
-- 5. Correr os testes ANTES do push, contra o remoto ainda por corrigir.
-- ==============================================================================
