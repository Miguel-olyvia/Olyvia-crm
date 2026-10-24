-- ==============================================================================
-- hr_locais_trabalho: contacto do centro (nome + telefone).
--
-- POR APLICAR.
--
--
-- -- O PROBLEMA ----------------------------------------------------------------
--
-- A gestao de centros (ecra novo) precisa de dizer PARA QUEM SE LIGA quando
-- alguem falta e devia estar naquele centro. Hoje `hr_locais_trabalho` tem
-- morada (20261120130000) mas nao tem nenhum contacto -- nem nome nem
-- telefone. Confirmado por leitura de 20261120130000_hr_locais_trabalho.sql
-- e de todas as migrations que lhe tocam depois (20261130080000 so acrescenta
-- `organograma_node_id`): nao existe coluna nenhuma de contacto nesta tabela.
--
--
-- -- A REGRA NOVA --------------------------------------------------------------
--
-- Duas colunas simples, nao um satelite: um centro tem UM contacto (nao um
-- historico de contactos), no mesmo espirito de `morada`/`cidade` que ja
-- existem na mesma tabela. Ambas opcionais -- um local recem-criado pode nao
-- ter contacto ainda -- mas nao vazias-com-espacos quando preenchidas, no
-- mesmo padrao de `hr_locais_trabalho_codigo_nao_vazio`.
--
-- Sem validacao de formato do telefone: os locais desta tabela cobrem varios
-- paises (a coluna `pais` ja existe) e um formato unico rejeitaria numeros
-- legitimos. Fica para o ecra, se um dia for pedido.
--
-- Editam-se pela permissao ja existente `hr.locais.edit` -- nenhuma
-- permissao nova, nenhuma atribuicao nova a papel nenhum: `hr.locais.edit` ja
-- foi dada ao super_admin em 20261120180000 e continua a cobrir qualquer
-- coluna nova desta tabela (a RLS desta migracao e por LINHA, nao por
-- coluna -- ver a nota em REVOKE/GRANT abaixo).
--
--
-- -- GRANTS: A TABELA JA E GRANT SELECT/INSERT/UPDATE por INTEIRO -------------
--
-- 20261120130000 fez `GRANT SELECT, INSERT, UPDATE ON TABLE ... TO
-- authenticated` (grant de TABELA, nao por coluna) e nenhuma migration
-- posterior revogou coluna nenhuma desta tabela (confirmado:
-- 20261121260000_hr_grants_revogar_escrita_em_excesso.sql nao lhe toca). As
-- duas colunas novas ficam legiveis/escreviveis por quem ja tem acesso a
-- tabela, sem GRANT novo -- ao contrario do caso de coluna sensivel (saude,
-- niss) que exige REVOKE+GRANT por coluna, este dado nao e sensivel.
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- Sem ficheiro de reversao nesta pasta, de proposito. A mao:
--   ALTER TABLE public.hr_locais_trabalho DROP CONSTRAINT IF EXISTS hr_locais_trabalho_contacto_nome_nao_vazio;
--   ALTER TABLE public.hr_locais_trabalho DROP CONSTRAINT IF EXISTS hr_locais_trabalho_contacto_telefone_nao_vazio;
--   ALTER TABLE public.hr_locais_trabalho DROP COLUMN IF EXISTS contacto_nome;
--   ALTER TABLE public.hr_locais_trabalho DROP COLUMN IF EXISTS contacto_telefone;
--
--
-- Prerequisitos:
--   20261120130000  hr_locais_trabalho
-- ==============================================================================

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
BEGIN
  IF to_regclass('public.hr_locais_trabalho') IS NULL THEN
    RAISE EXCEPTION 'public.hr_locais_trabalho nao existe. Aplicar 20261120130000 primeiro.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'hr_locais_trabalho_id_org_key'
       AND conrelid = to_regclass('public.hr_locais_trabalho')
  ) THEN
    RAISE EXCEPTION
      'public.hr_locais_trabalho existe mas sem hr_locais_trabalho_id_org_key -- nao e a tabela desta migracao. Investigar antes de aplicar.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.anew_permissions WHERE code = 'hr.locais.edit') THEN
    RAISE EXCEPTION 'hr.locais.edit nao esta no catalogo. Estado da base inesperado.';
  END IF;
END;
$guardas$;

-- ---- As colunas -------------------------------------------------------------
ALTER TABLE public.hr_locais_trabalho
  ADD COLUMN IF NOT EXISTS contacto_nome     text,
  ADD COLUMN IF NOT EXISTS contacto_telefone text;

DO $constraints$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'hr_locais_trabalho_contacto_nome_nao_vazio'
       AND conrelid = to_regclass('public.hr_locais_trabalho')
  ) THEN
    ALTER TABLE public.hr_locais_trabalho
      ADD CONSTRAINT hr_locais_trabalho_contacto_nome_nao_vazio
      CHECK (contacto_nome IS NULL OR btrim(contacto_nome) <> '');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'hr_locais_trabalho_contacto_telefone_nao_vazio'
       AND conrelid = to_regclass('public.hr_locais_trabalho')
  ) THEN
    ALTER TABLE public.hr_locais_trabalho
      ADD CONSTRAINT hr_locais_trabalho_contacto_telefone_nao_vazio
      CHECK (contacto_telefone IS NULL OR btrim(contacto_telefone) <> '');
  END IF;
END;
$constraints$;

COMMENT ON COLUMN public.hr_locais_trabalho.contacto_nome IS
'Quem se contacta neste centro quando alguem falta e devia la estar. Opcional; nao vazio-com-espacos quando preenchido. Sem satelite/historico: um centro tem UM contacto actual, nao uma lista.';

COMMENT ON COLUMN public.hr_locais_trabalho.contacto_telefone IS
'Telefone do contacto do centro (ver contacto_nome). Texto livre e sem validacao de formato de proposito -- os locais desta tabela cobrem varios paises (coluna `pais` ja existente) e um formato unico rejeitaria numeros legitimos.';

-- ---- Conferir --------------------------------------------------------------
-- Mesmo padrao de 20261130130000: exercita os dois CHECK novos dentro de uma
-- subtransaccao que termina SEMPRE por excepcao propria (nunca P0001, nunca
-- WHEN OTHERS a engolir), para que o ROLLBACK desfaca a organizacao e o
-- centro descartaveis que este bloco cria -- uma organizacao nao se apaga a
-- direito nesta base (FK RESTRICT dos tipos de ausencia semeados na criacao,
-- 20261122010000, e uma linha permanente em anew_entities).
DO $conferir$
DECLARE
  v_org_id     uuid;
  v_local_id   uuid;
  v_bloqueado  boolean := false;
BEGIN
  BEGIN
    INSERT INTO public.anew_organizations (name)
    VALUES ('__conferir_20261130165000__')
    RETURNING id INTO v_org_id;

    -- Caso 1: contacto_telefone so-de-espacos tem de FALHAR com o SQLSTATE
    -- proprio de um CHECK (23514).
    BEGIN
      INSERT INTO public.hr_locais_trabalho (organization_id, nome, tipo, contacto_telefone)
      VALUES (v_org_id, 'Conferir Contacto', 'outro', '   ');

      RAISE EXCEPTION 'hr_locais_trabalho aceitou contacto_telefone so-de-espacos -- o CHECK novo nao ficou activo.';
    EXCEPTION
      WHEN SQLSTATE '23514' THEN
        v_bloqueado := true;
    END;

    IF NOT v_bloqueado THEN
      RAISE EXCEPTION 'O CHECK de contacto_telefone nao disparou como esperado.';
    END IF;

    v_bloqueado := false;

    -- Caso 2: o mesmo para contacto_nome.
    BEGIN
      INSERT INTO public.hr_locais_trabalho (organization_id, nome, tipo, contacto_nome)
      VALUES (v_org_id, 'Conferir Contacto 2', 'outro', '   ');

      RAISE EXCEPTION 'hr_locais_trabalho aceitou contacto_nome so-de-espacos -- o CHECK novo nao ficou activo.';
    EXCEPTION
      WHEN SQLSTATE '23514' THEN
        v_bloqueado := true;
    END;

    IF NOT v_bloqueado THEN
      RAISE EXCEPTION 'O CHECK de contacto_nome nao disparou como esperado.';
    END IF;

    -- Caso 3: o caminho normal -- os dois preenchidos com texto real, e NULL
    -- nos dois -- continuam a funcionar.
    INSERT INTO public.hr_locais_trabalho
      (organization_id, nome, tipo, contacto_nome, contacto_telefone)
    VALUES
      (v_org_id, 'Conferir Contacto 3', 'outro', 'Ana Ferreira', '+351 912 345 678')
    RETURNING id INTO v_local_id;

    IF v_local_id IS NULL THEN
      RAISE EXCEPTION 'INSERT com contacto valido deixou de funcionar -- regressao no CHECK novo.';
    END IF;

    INSERT INTO public.hr_locais_trabalho (organization_id, nome, tipo)
    VALUES (v_org_id, 'Conferir Contacto 4', 'outro');

    -- Sucesso: levanta sempre, com ERRCODE proprio, para reverter tudo por
    -- ROLLBACK e nao por DELETE manual.
    RAISE EXCEPTION 'conferir_20261130165000_ok' USING ERRCODE = 'CF001';
  EXCEPTION
    WHEN SQLSTATE 'CF001' THEN
      RAISE NOTICE 'OK: contacto_nome e contacto_telefone criados em hr_locais_trabalho, os dois CHECK de nao-vazio activos, caminho normal (preenchido ou NULL) continua a funcionar; exercitado com organizacao e centros descartaveis, revertidos por ROLLBACK.';
    WHEN OTHERS THEN
      RAISE;
  END;
END;
$conferir$;
