-- ==============================================================================
-- Dados bancarios da pessoa. O IBAN NUNCA fica em claro numa coluna: vai para
-- o Vault e a linha guarda so a referencia ao segredo e os ultimos 4 digitos.
--
-- POR APLICAR. Ler o bloco "ANTES DO db push" no fim do ficheiro.
--
--
-- -- O PROBLEMA ----------------------------------------------------------------
--
-- O IBAN de um trabalhador e a instrucao de pagamento dele. Uma coluna text
-- com o IBAN em claro fica visivel em qualquer select da tabela, em qualquer
-- backup, em qualquer log de consulta lenta, e a quem tenha acesso de leitura
-- a base por outra via. O mascaramento por grant de coluna (o truque usado
-- para o NISS em 20261120040000) protege o cliente PostgREST, mas o valor
-- continua la, em claro, na linha.
--
-- Para uma instrucao de pagamento isso nao chega.
--
--
-- -- A REGRA NOVA --------------------------------------------------------------
--
-- pessoas_dados_bancarios guarda:
--
--   iban_secret_id   uuid  referencia a vault.secrets(id) -- sem FK, e outro schema
--   iban_ultimos4    text  os quatro ultimos caracteres, que e o que a interface mostra
--   iban_pais        text  os dois primeiros, para saber que banco/pais e
--   titular, banco, swift, is_principal
--
-- O IBAN completo vive cifrado no Vault, exactamente como as palavras-passe de
-- SMTP desde 20261110750000 (que guarda so smtp_password_secret_id na linha).
-- O padrao ja existe neste projecto; nao se inventa nada aqui.
--
-- CHECK ((iban_secret_id IS NULL) = (iban_ultimos4 IS NULL)): ou ha segredo e
-- ultimos quatro, ou nao ha nem um nem outro. Nunca uma mascara sem valor por
-- tras, que enganaria quem olha para a ficha.
--
--
-- -- ESCRITA SO POR RPC ---------------------------------------------------------
--
-- A tabela e de escrita fechada, no molde de anew_entity_org_links (baseline
-- 23128-23152): REVOKE INSERT/UPDATE a authenticated e politicas restritivas
-- WITH CHECK (false) / USING (false). As quatro operacoes ficam cobertas, tres
-- delas fechadas. So rpc_hr_definir_iban escreve.
--
-- Tem de ser assim porque a coerencia entre as tres colunas (segredo no Vault,
-- ultimos4, pais) nao e algo que um CHECK consiga garantir a partir de um
-- INSERT do cliente: o cliente teria de criar o segredo ele proprio.
--
--
-- -- NAO HA LEITURA DO IBAN EM CLARO -------------------------------------------
--
-- Decisao explicita, nao esquecimento: NAO existe RPC que devolva o IBAN em
-- claro, e por isso tambem nao existe permissao hr.pessoas.bancarios.reveal.
-- A aplicacao nunca ve o IBAN completo -- nem o ecra de RH, nem a ficha, nem
-- um export.
--
-- Quem processa salarios le vault.decrypted_secrets por service_role, fora da
-- aplicacao (Edge Function ou consola), que e o caminho auditado. Se algum dia
-- fizer falta um ecra que mostre o IBAN, isso e uma ronda propria: acrescenta
-- a permissao de revelar, a RPC com auditoria, e a decisao de quem a recebe.
--
-- Validacao: formato ISO 13616 mais o resto 97 do mod-97 (a mesma verificacao
-- que um banco faz). Implementada em plpgsql sem extensoes, por blocos de sete
-- digitos para nao exceder bigint.
--
--
-- -- AUDITORIA -----------------------------------------------------------------
--
-- Cada escrita de IBAN escreve uma linha em pessoas_acessos_sensiveis
-- (campo='iban', accao='alterar'). Nao ha registo de leitura porque nao ha
-- leitura em claro para registar.
--
--
-- -- O QUE FICA DE FORA --------------------------------------------------------
--
-- - Uma so conta por pessoa nesta ronda (UNIQUE (pessoa_id)). Contas
--   secundarias, reparticao de salario por varias contas: outra ronda.
-- - Sem clausula de ficha-propria em 20261120090000: o trabalhador nao ve, na
--   aplicacao, nem os ultimos quatro digitos da sua propria conta. Decisao de
--   produto por tomar, escrita aqui como pergunta em aberto.
-- - Nao se atribui permissao nenhuma a papel nenhum.
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- Sem ficheiro de reversao nesta pasta, de proposito: um .sql de reversao
-- guardado ao lado e aplicado pelo db push seguinte. A mao:
--   DROP FUNCTION IF EXISTS public.rpc_hr_definir_iban(uuid, text, text, text, text);
--   DROP TABLE IF EXISTS public.pessoas_dados_bancarios;
--   DROP FUNCTION IF EXISTS public.hr_iban_valido(text);
-- ATENCAO: apagar a tabela deixa os segredos orfaos no Vault. Antes de a
-- apagar, recolher os iban_secret_id e apaga-los com vault.delete_secret, ou
-- ficam la para sempre sem ninguem saber a que pertencem.
--
--
-- Prerequisitos:
--   20261110750000  precedente de uso do Vault (create_secret / update_secret)
--   20261120010000  has_anew_permission_in_org
--   20261120020000  catalogo hr.*
--   20261120030000  pessoas (e a unique pessoas_id_org_key)
--   20261120040000  hr_satelite_ancora_imutavel(), hr_registar_acesso_sensivel()
-- ==============================================================================

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
BEGIN
  IF to_regclass('public.pessoas') IS NULL THEN
    RAISE EXCEPTION 'public.pessoas nao existe. Aplicar 20261120030000 primeiro.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'pessoas_id_org_key' AND conrelid = 'public.pessoas'::regclass
  ) THEN
    RAISE EXCEPTION 'A unique pessoas_id_org_key nao existe; a FK composta desta tabela depende dela.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'hr_registar_acesso_sensivel' AND p.pronargs = 4
  ) THEN
    RAISE EXCEPTION 'public.hr_registar_acesso_sensivel(uuid,uuid,text,text) nao existe. Aplicar 20261120040000 primeiro.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.anew_permissions WHERE code = 'hr.pessoas.bancarios.edit') THEN
    RAISE EXCEPTION 'A permissao hr.pessoas.bancarios.edit nao esta no catalogo. Aplicar 20261120020000 primeiro.';
  END IF;

  -- O Vault e o alicerce desta migracao. Sem ele nao ha onde por o IBAN, e
  -- guardar-lhe uma coluna em claro "por agora" e como isto nunca se faz.
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'vault') THEN
    RAISE EXCEPTION
      'O schema vault nao existe. Confirmar a extensao supabase_vault no remoto antes de aplicar esta migracao -- ela guarda o IBAN cifrado no Vault e nao tem alternativa em claro.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'vault' AND p.proname = 'create_secret'
  ) THEN
    RAISE EXCEPTION 'vault.create_secret nao esta disponivel. Confirmar a extensao supabase_vault no remoto.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'vault' AND p.proname = 'update_secret'
  ) THEN
    RAISE EXCEPTION 'vault.update_secret nao esta disponivel. Confirmar a extensao supabase_vault no remoto.';
  END IF;
END;
$guardas$;

-- ---- Validacao de IBAN (ISO 13616 + mod-97) --------------------------------
-- Sem extensoes. O mod-97 faz-se por blocos de sete digitos porque o numero
-- inteiro de um IBAN de 34 caracteres nao cabe em bigint.
CREATE OR REPLACE FUNCTION public.hr_iban_valido(p_iban text)
RETURNS boolean
LANGUAGE plpgsql IMMUTABLE
-- search_path vazio: esta funcao so usa operadores e funcoes internas
-- (pg_catalog esta sempre implicito), nao toca em tabela nenhuma, e assim
-- ninguem lhe pode passar por baixo um objecto com o mesmo nome.
SET search_path TO ''
AS $$
DECLARE
  v_iban      text;
  v_rearranjo text;
  v_digitos   text := '';
  v_char      text;
  v_resto     integer := 0;
  v_bloco     text;
  i           integer;
BEGIN
  IF p_iban IS NULL THEN
    RETURN false;
  END IF;

  v_iban := upper(regexp_replace(p_iban, '[[:space:]]', '', 'g'));

  IF v_iban !~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$' THEN
    RETURN false;
  END IF;

  -- Os quatro primeiros caracteres passam para o fim.
  v_rearranjo := substr(v_iban, 5) || substr(v_iban, 1, 4);

  -- Cada letra vale a sua posicao no alfabeto mais 9 (A=10 ... Z=35).
  FOR i IN 1 .. length(v_rearranjo) LOOP
    v_char := substr(v_rearranjo, i, 1);
    IF v_char ~ '^[0-9]$' THEN
      v_digitos := v_digitos || v_char;
    ELSE
      v_digitos := v_digitos || (ascii(v_char) - 55)::text;
    END IF;
  END LOOP;

  -- mod 97 por blocos: o resto (no maximo 96, dois digitos) mais sete digitos
  -- da nove digitos, que cabem folgadamente em bigint.
  i := 1;
  WHILE i <= length(v_digitos) LOOP
    v_bloco := substr(v_digitos, i, 7);
    v_resto := (v_resto::text || v_bloco)::bigint % 97;
    i := i + 7;
  END LOOP;

  RETURN v_resto = 1;
END;
$$;

REVOKE ALL ON FUNCTION public.hr_iban_valido(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_iban_valido(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.hr_iban_valido(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hr_iban_valido(text) TO service_role;

COMMENT ON FUNCTION public.hr_iban_valido(text) IS
'Valida um IBAN: formato ISO 13616 e resto 97 do mod-97, a mesma verificacao que um banco faz. Ignora espacos. Sem extensoes; o mod-97 e feito por blocos de sete digitos porque o numero inteiro de um IBAN nao cabe em bigint. E chamavel por authenticated para a interface poder validar antes de submeter.';

-- ==============================================================================
-- pessoas_dados_bancarios
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.pessoas_dados_bancarios (
  id               uuid NOT NULL DEFAULT gen_random_uuid(),
  pessoa_id        uuid NOT NULL,
  organization_id  uuid NOT NULL,

  titular          text,
  banco            text,
  iban_secret_id   uuid,
  iban_ultimos4    text,
  iban_pais        text,
  swift            text,
  is_principal     boolean NOT NULL DEFAULT false,

  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  created_by       uuid,
  updated_by       uuid,

  CONSTRAINT pessoas_dados_bancarios_pkey PRIMARY KEY (id),
  CONSTRAINT pessoas_dados_bancarios_pessoa_unica UNIQUE (pessoa_id),
  CONSTRAINT pessoas_dados_bancarios_pessoa_fkey
    FOREIGN KEY (pessoa_id, organization_id)
    REFERENCES public.pessoas (id, organization_id) ON DELETE CASCADE,
  CONSTRAINT pessoas_dados_bancarios_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES public.anew_users (id) ON DELETE SET NULL,
  CONSTRAINT pessoas_dados_bancarios_updated_by_fkey
    FOREIGN KEY (updated_by) REFERENCES public.anew_users (id) ON DELETE SET NULL,

  CONSTRAINT pessoas_dados_bancarios_ultimos4_formato
    CHECK (iban_ultimos4 IS NULL OR iban_ultimos4 ~ '^[0-9A-Z]{4}$'),
  CONSTRAINT pessoas_dados_bancarios_pais_iso
    CHECK (iban_pais IS NULL OR iban_pais ~ '^[A-Z]{2}$'),
  CONSTRAINT pessoas_dados_bancarios_swift_formato
    CHECK (swift IS NULL OR swift ~ '^[A-Z0-9]{8}([A-Z0-9]{3})?$'),
  -- Ou ha segredo e mascara, ou nao ha nem um nem outro. Nunca uma mascara sem
  -- valor por tras.
  CONSTRAINT pessoas_dados_bancarios_segredo_e_mascara_juntos
    CHECK ((iban_secret_id IS NULL) = (iban_ultimos4 IS NULL))
);

COMMENT ON TABLE public.pessoas_dados_bancarios IS
'Dados bancarios da pessoa. O IBAN em claro NAO esta aqui: vive cifrado no Vault e a linha guarda so iban_secret_id, os ultimos quatro caracteres e o pais -- o mesmo padrao das palavras-passe de SMTP (20261110750000). Escrita fechada a authenticated: so rpc_hr_definir_iban escreve. NAO existe RPC de leitura do IBAN em claro, de proposito; quem processa salarios le vault.decrypted_secrets por service_role, fora da aplicacao.';
COMMENT ON COLUMN public.pessoas_dados_bancarios.iban_secret_id IS
'Referencia a vault.secrets(id). Sem chave estrangeira porque e outro schema. Apagar esta linha NAO apaga o segredo: quem apagar tem de o apagar tambem, ou fica orfao no Vault.';
COMMENT ON COLUMN public.pessoas_dados_bancarios.iban_ultimos4 IS
'Os quatro ultimos caracteres do IBAN. E tudo o que a interface mostra, e nao ha caminho para ver mais.';

CREATE INDEX IF NOT EXISTS idx_pessoas_dados_bancarios_pessoa_id
  ON public.pessoas_dados_bancarios (pessoa_id);
CREATE INDEX IF NOT EXISTS idx_pessoas_dados_bancarios_organization_id
  ON public.pessoas_dados_bancarios (organization_id);

DROP TRIGGER IF EXISTS trg_pessoas_dados_bancarios_updated_at ON public.pessoas_dados_bancarios;
CREATE TRIGGER trg_pessoas_dados_bancarios_updated_at
  BEFORE UPDATE ON public.pessoas_dados_bancarios
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_pessoas_dados_bancarios_ancora ON public.pessoas_dados_bancarios;
CREATE TRIGGER trg_pessoas_dados_bancarios_ancora
  BEFORE UPDATE ON public.pessoas_dados_bancarios
  FOR EACH ROW EXECUTE FUNCTION public.hr_satelite_ancora_imutavel();

-- ---- Grants: leitura sim, escrita nao --------------------------------------
REVOKE ALL ON TABLE public.pessoas_dados_bancarios FROM anon;
REVOKE ALL ON TABLE public.pessoas_dados_bancarios FROM authenticated;
GRANT SELECT ON TABLE public.pessoas_dados_bancarios TO authenticated;
GRANT ALL ON TABLE public.pessoas_dados_bancarios TO service_role;

ALTER TABLE public.pessoas_dados_bancarios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pessoas_dados_bancarios_select ON public.pessoas_dados_bancarios;
CREATE POLICY pessoas_dados_bancarios_select ON public.pessoas_dados_bancarios
  FOR SELECT TO authenticated
  USING ((SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.pessoas.bancarios.view', organization_id)));

DROP POLICY IF EXISTS pessoas_dados_bancarios_block_insert ON public.pessoas_dados_bancarios;
CREATE POLICY pessoas_dados_bancarios_block_insert ON public.pessoas_dados_bancarios
  AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (false);

DROP POLICY IF EXISTS pessoas_dados_bancarios_block_update ON public.pessoas_dados_bancarios;
CREATE POLICY pessoas_dados_bancarios_block_update ON public.pessoas_dados_bancarios
  AS RESTRICTIVE FOR UPDATE TO authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS pessoas_dados_bancarios_block_delete ON public.pessoas_dados_bancarios;
CREATE POLICY pessoas_dados_bancarios_block_delete ON public.pessoas_dados_bancarios
  AS RESTRICTIVE FOR DELETE TO authenticated USING (false);

COMMENT ON POLICY pessoas_dados_bancarios_select ON public.pessoas_dados_bancarios IS
'Ve titular, banco, pais e os ultimos quatro caracteres quem tem hr.pessoas.bancarios.view NAQUELA organizacao. O IBAN completo nao esta na linha, logo nao ha o que ver.';
COMMENT ON POLICY pessoas_dados_bancarios_block_insert ON public.pessoas_dados_bancarios IS
'Escrita fechada, no molde de anew_entity_org_links: a coerencia entre o segredo no Vault e a mascara na linha nao e algo que um cliente consiga garantir. So rpc_hr_definir_iban escreve.';

-- ---- RPC: definir o IBAN ---------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_hr_definir_iban(
  p_pessoa_id uuid,
  p_iban      text,
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
  v_iban      text;
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

  v_iban := upper(regexp_replace(coalesce(p_iban, ''), '[[:space:]]', '', 'g'));

  IF NOT public.hr_iban_valido(v_iban) THEN
    RAISE EXCEPTION 'iban_invalido';
  END IF;

  SELECT au.id INTO v_anew FROM public.anew_users au WHERE au.auth_user_id = auth.uid() LIMIT 1;

  SELECT b.id, b.iban_secret_id INTO v_linha
  FROM public.pessoas_dados_bancarios b
  WHERE b.pessoa_id = p_pessoa_id;

  IF v_linha.id IS NOT NULL AND v_linha.iban_secret_id IS NOT NULL THEN
    -- Ja ha segredo: actualiza-se o mesmo, para nao deixar o antigo orfao no
    -- Vault (foi o erro que 20261110750000 evitou da mesma maneira).
    PERFORM vault.update_secret(v_linha.iban_secret_id, v_iban);
    v_secret_id := v_linha.iban_secret_id;
  ELSE
    -- Nome unico por criacao: se uma linha ja tivesse sido apagada e recriada,
    -- um nome fixo por pessoa colidiria com o segredo orfao antigo.
    v_secret_id := vault.create_secret(
      v_iban,
      'hr_iban:' || p_pessoa_id::text || ':' || gen_random_uuid()::text,
      'IBAN de RH da pessoa ' || p_pessoa_id::text
    );
  END IF;

  INSERT INTO public.pessoas_dados_bancarios
    (pessoa_id, organization_id, titular, banco, iban_secret_id, iban_ultimos4, iban_pais, swift,
     is_principal, created_by, updated_by)
  VALUES
    (p_pessoa_id, v_org, p_titular, p_banco, v_secret_id, right(v_iban, 4), left(v_iban, 2), p_swift,
     true, v_anew, v_anew)
  ON CONFLICT (pessoa_id) DO UPDATE SET
    titular        = EXCLUDED.titular,
    banco          = EXCLUDED.banco,
    iban_secret_id = EXCLUDED.iban_secret_id,
    iban_ultimos4  = EXCLUDED.iban_ultimos4,
    iban_pais      = EXCLUDED.iban_pais,
    swift          = EXCLUDED.swift,
    updated_by     = EXCLUDED.updated_by,
    updated_at     = now();

  PERFORM public.hr_registar_acesso_sensivel(p_pessoa_id, v_org, 'iban', 'alterar');
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_hr_definir_iban(uuid, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_hr_definir_iban(uuid, text, text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_hr_definir_iban(uuid, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_definir_iban(uuid, text, text, text, text) TO service_role;

COMMENT ON FUNCTION public.rpc_hr_definir_iban(uuid, text, text, text, text) IS
'Unico caminho para escrever dados bancarios de RH. Exige hr.pessoas.bancarios.edit na organizacao da pessoa, valida o IBAN pelo mod-97, guarda-o cifrado no Vault (actualizando o segredo existente em vez de criar outro) e grava na linha apenas a referencia, os ultimos quatro caracteres e o pais. Registra a alteracao em pessoas_acessos_sensiveis. NAO existe funcao inversa: o IBAN em claro nao volta a sair para a aplicacao.';

-- ---- Conferir --------------------------------------------------------------
DO $conferir$
DECLARE
  v_rls boolean;
  v_politicas integer;
BEGIN
  SELECT c.relrowsecurity INTO v_rls
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'pessoas_dados_bancarios';

  IF v_rls IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'public.pessoas_dados_bancarios ficou sem RLS activo.';
  END IF;

  SELECT count(*) INTO v_politicas FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'pessoas_dados_bancarios';

  IF v_politicas <> 4 THEN
    RAISE EXCEPTION 'Esperavam-se 4 politicas em pessoas_dados_bancarios, encontraram-se %.', v_politicas;
  END IF;

  -- O ponto central: authenticated nao escreve nesta tabela por via directa.
  IF has_table_privilege('authenticated', 'public.pessoas_dados_bancarios', 'INSERT')
     OR has_table_privilege('authenticated', 'public.pessoas_dados_bancarios', 'UPDATE') THEN
    RAISE EXCEPTION
      'authenticated tem INSERT ou UPDATE em pessoas_dados_bancarios. A escrita tem de passar so por rpc_hr_definir_iban -- nao aplicar neste estado.';
  END IF;

  IF NOT has_table_privilege('authenticated', 'public.pessoas_dados_bancarios', 'SELECT') THEN
    RAISE EXCEPTION 'authenticated nao consegue ler pessoas_dados_bancarios; a ficha ficaria sem a mascara para mostrar.';
  END IF;

  -- Nao pode existir coluna com o IBAN em claro. Se aparecer uma, alguem
  -- desfez o desenho todo desta migracao.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'pessoas_dados_bancarios'
      AND column_name IN ('iban', 'iban_completo', 'iban_claro')
  ) THEN
    RAISE EXCEPTION 'pessoas_dados_bancarios tem uma coluna de IBAN em claro. O IBAN vive no Vault; nao aplicar neste estado.';
  END IF;

  -- Sanidade da validacao, com IBANs de teste publicos (nao sao contas reais).
  IF NOT public.hr_iban_valido('PT50000201231234567890154') THEN
    RAISE EXCEPTION 'hr_iban_valido rejeitou um IBAN de teste valido; a validacao esta errada.';
  END IF;
  IF NOT public.hr_iban_valido('GB82 WEST 1234 5698 7654 32') THEN
    RAISE EXCEPTION 'hr_iban_valido rejeitou um IBAN de teste valido com espacos e letras; a validacao esta errada.';
  END IF;
  IF public.hr_iban_valido('PT50000201231234567890155') THEN
    RAISE EXCEPTION 'hr_iban_valido aceitou um IBAN com digito de controlo errado; a validacao esta errada.';
  END IF;

  RAISE NOTICE 'OK: pessoas_dados_bancarios criada, RLS activo, 4 politicas (3 fechadas), sem coluna de IBAN em claro, validacao mod-97 conferida.';
END;
$conferir$;

-- ==============================================================================
-- ANTES DO db push
--
-- 1. Correr "supabase migration list" e confirmar que nao ha nenhum timestamp
--    20261120* ja aplicado no remoto sem ficheiro local. Se colidir, renumerar
--    o bloco inteiro mantendo a ordem relativa.
--
-- 2. Confirmar que 20261120010000 a 20261120060000 vao a frente desta na fila.
--
-- 3. Confirmar que a extensao supabase_vault esta activa no remoto. A guarda
--    do topo aborta se nao estiver, mas mais vale ver antes -- e o alicerce
--    desta migracao e nao ha caminho alternativo em claro.
--
-- 4. So cria objectos novos. Nao altera tabela, politica nem funcao existente,
--    por isso nao ha janela em que a base partilhada fique defeituosa.
--
-- 5. Fica em aberto, para decisao de produto: um trabalhador deve poder ver, na
--    aplicacao, os ultimos quatro digitos da sua propria conta? Hoje nao ve.
-- ==============================================================================
