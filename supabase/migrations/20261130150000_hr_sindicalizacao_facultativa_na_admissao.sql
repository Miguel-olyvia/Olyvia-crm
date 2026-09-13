-- ==============================================================================
-- A sindicalizacao passa a FACULTATIVA na admissao -- decisao tomada, esta
-- migracao cumpre-a.
--
-- POR APLICAR.
--
--
-- -- O ESTADO ACTUAL, medido ao vivo ------------------------------------------
--
-- hr_admissao_campos_obrigatorios() (20261128010000, aplicada) devolve 31
-- campos. Dois deles sao sobre filiacao sindical:
--   'sindicalizado' -- origem 'pessoa', NAO condicional. TRAVA a submissao:
--                       quem nao responder ao interruptor nao consegue
--                       submeter o convite.
--   'sindicato'     -- origem 'pessoa', condicional a sindicalizado=true.
--
--
-- -- A DECISAO ------------------------------------------------------------------
--
-- Filiacao sindical e categoria especial do artigo 9.o do RGPD. Obrigar toda a
-- gente a declara-la para poder ser admitida exige da empresa um fundamento
-- legal que tem de conseguir justificar -- e "recolhemos de todos porque o
-- formulario tinha o campo" nao chega. Perguntar e uma coisa; impedir a
-- admissao de quem nao responde e outra.
--
-- 'sindicalizado' e 'sindicato' passam a viver ao lado da carta de conducao,
-- ja hoje de fora dos obrigatorios pela mesma razao estrutural (nem toda a
-- gente tem carta, torna-la obrigatoria impedia a admissao de quem nao tem):
-- recolhidos QUANDO existem, NUNCA a impedir uma admissao.
--
-- Os dois codigos SAEM de hr_admissao_campos_obrigatorios(). 31 campos passam
-- a 29, e os 30 de origem 'pessoa' passam a 28.
--
--
-- -- O QUE NAO MUDA ---------------------------------------------------------
--
-- O ecra continua a perguntar sindicalizado/sindicato (pagina 2 da folha), a
-- Edge Function continua a reencaminha-los, e a RPC de submissao continua a
-- grava-los em pessoas_sindicalizacao -- nada disto e um campo obrigatorio do
-- CONTRATO de chaves do convite, e o contrato nao muda aqui: so a lista do que
-- BLOQUEIA a submissao. Uma pessoa que nao responda ao interruptor passa a
-- submeter na mesma; uma que responda continua a ser gravada como sempre.
--
-- hr_admissao_pendencias(uuid) (20261129020000) nao precisa de ser recriada:
-- ela faz CROSS JOIN com hr_admissao_campos_obrigatorios() e so reporta
-- pendencia para os codigos que essa funcao devolve. Sem 'sindicalizado' nem
-- 'sindicato' na lista, ela deixa de os reportar como pendencia -- sem
-- precisar de tocar no corpo da funcao. O mesmo vale para
-- hr_admissao_campo_permissao() (mapa codigo -> permissao): as duas linhas
-- que la ficam para esses codigos ficam simplesmente sem par do lado dos
-- obrigatorios, inofensivas.
--
--
-- -- ESPELHO EM src/ ----------------------------------------------------------
--
-- src/lib/hr/admissaoObrigatorios.ts e o espelho TypeScript, comparado com
-- esta funcao por src/lib/hr/__tests__/conviteAdmissaoContrato.test.ts. Os
-- dois ficheiros sao actualizados na mesma alteracao que esta migracao (fora
-- do SQL, no mesmo commit): os dois codigos saem de
-- CAMPOS_OBRIGATORIOS_ADMISSAO, mas os campos `sindicalizado`/`sindicato`
-- continuam na interface RascunhoConviteObrigatorios e no formulario -- so
-- deixam de ser exigidos.
--
--
-- -- PARA REVERTER ------------------------------------------------------------
--   Recriar hr_admissao_campos_obrigatorios() com o corpo de 20261128010000
--   (repor as duas linhas de sindicalizado/sindicato na posicao "Pagina 2 da
--   folha") e repor as duas entradas correspondentes em
--   src/lib/hr/admissaoObrigatorios.ts.
--
--
-- -- DEPENDE DE -----------------------------------------------------------------
--   20261128010000  hr_admissao_campos_obrigatorios()
-- ==============================================================================


-- ---- Guardas ------------------------------------------------------------
DO $guardas$
DECLARE
  v_n integer;
BEGIN
  SELECT count(*) INTO v_n
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'hr_admissao_campos_obrigatorios';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'Esperava exactamente 1 hr_admissao_campos_obrigatorios, encontrei %.', v_n;
  END IF;

  IF (SELECT count(*) FROM public.hr_admissao_campos_obrigatorios()) <> 31 THEN
    RAISE EXCEPTION
      'hr_admissao_campos_obrigatorios() nao devolve os 31 campos esperados de 20261128010000 -- confirmar qual e a versao aplicada antes de recriar.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.hr_admissao_campos_obrigatorios() WHERE codigo = 'sindicalizado'
  ) OR NOT EXISTS (
    SELECT 1 FROM public.hr_admissao_campos_obrigatorios() WHERE codigo = 'sindicato'
  ) THEN
    RAISE EXCEPTION
      'sindicalizado ou sindicato ja nao estao em hr_admissao_campos_obrigatorios() -- alguma outra migracao ja os removeu.';
  END IF;
END;
$guardas$;


-- ==============================================================================
-- A lista de campos obrigatorios da admissao, sem sindicalizado/sindicato
-- ==============================================================================
-- Espelhada em `src/lib/hr/admissaoObrigatorios.ts` (so os de origem 'pessoa')
-- e comparada com ela por `conviteAdmissaoContrato.test.ts`.
DROP FUNCTION IF EXISTS public.hr_admissao_campos_obrigatorios();

CREATE FUNCTION public.hr_admissao_campos_obrigatorios()
RETURNS TABLE (codigo text, origem text, condicional boolean)
LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$
  SELECT *
  FROM (VALUES
    -- Pagina 1 da folha: dados pessoais
    ('data_nascimento',               'pessoa', false),
    ('genero',                        'pessoa', false),
    ('nacionalidade',                 'pessoa', false),
    ('telefone_pessoal',              'pessoa', false),
    ('email_pessoal',                 'pessoa', false),
    ('estado_civil',                  'pessoa', false),
    ('dependentes',                   'pessoa', false),
    ('dependentes_deficientes',       'pessoa', false),
    ('conjuge_situacao_profissional', 'pessoa', true),
    ('naturalidade_freguesia',        'pessoa', false),
    ('naturalidade_concelho',         'pessoa', false),
    ('naturalidade_pais',             'pessoa', false),
    ('habilitacao_academica',         'pessoa', false),
    ('habilitacao_data_conclusao',    'pessoa', false),
    -- Pagina 1 da folha: documento e identificacao
    ('nif',                           'pessoa', false),
    ('niss',                          'pessoa', false),
    ('tipo_documento',                'pessoa', false),
    ('numero_documento',              'pessoa', false),
    ('validade_documento',            'pessoa', true),
    -- Pagina 1 da folha: morada
    ('linha1',                        'pessoa', false),
    ('codigo_postal',                 'pessoa', false),
    ('localidade',                    'pessoa', false),
    -- Pagina 2 da folha: fardamento e conta bancaria. A sindicalizacao
    -- (sindicalizado, sindicato) FICA DE FORA de proposito -- ver
    -- carta_conducao_* mais abaixo, mesma razao: categoria especial do
    -- artigo 9.o do RGPD, recolhida quando existe, nunca a impedir a
    -- admissao de quem nao responde.
    ('tamanho_cima',                  'pessoa', false),
    ('tamanho_baixo',                 'pessoa', false),
    ('tamanho_blazer',                'pessoa', false),
    ('conta_numero',                  'pessoa', false),
    ('conta_titular',                 'pessoa', false),
    ('conta_banco',                   'pessoa', false),
    -- O que o RH preenche na retaguarda: nunca trava o convite
    ('data_admissao',                 'rh',     false)
  ) AS t(codigo, origem, condicional);
$$;

REVOKE ALL ON FUNCTION public.hr_admissao_campos_obrigatorios() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_admissao_campos_obrigatorios() FROM anon;
GRANT EXECUTE ON FUNCTION public.hr_admissao_campos_obrigatorios() TO authenticated;
GRANT EXECUTE ON FUNCTION public.hr_admissao_campos_obrigatorios() TO service_role;

COMMENT ON FUNCTION public.hr_admissao_campos_obrigatorios() IS
'A lista dos campos sem os quais uma ficha de admissao nao fica utilizavel -- as DUAS paginas da folha de cadastro em papel. origem "pessoa" e o que o convite publico pede e o que trava a submissao; origem "rh" e o que a retaguarda preenche e nunca trava o convite. condicional=true marca os campos cuja obrigatoriedade depende de outro: validade_documento (nao se pede a um cartao de cidadao) e conjuge_situacao_profissional (so a quem e casado ou vive em uniao de facto). A carta de conducao e a sindicalizacao (sindicalizado, sindicato) ficam DE FORA de proposito: nem toda a gente tem carta, e filiacao sindical e categoria especial do artigo 9.o do RGPD -- exigi-las impedia a admissao de quem nao tem carta ou nao quer declarar-se. As duas continuam a ser capturadas e gravadas quando existem. Espelhada em src/lib/hr/admissaoObrigatorios.ts e comparada com ela por teste. Desde 20261130150000: sindicalizado e sindicato deixaram de ser obrigatorios (eram 31 campos, 30 de origem pessoa; passam a 29 e 28).';


-- ---- Conferir -----------------------------------------------------------
-- hr_admissao_campos_obrigatorios() e IMMUTABLE e sem efeitos secundarios --
-- nao ha nada para escrever nem para reverter aqui, so chamar a funcao e
-- confirmar as contagens novas e a ausencia dos dois codigos.
DO $conferir$
DECLARE
  v_total       integer;
  v_pessoa      integer;
  v_condicional integer;
BEGIN
  SELECT count(*) INTO v_total FROM public.hr_admissao_campos_obrigatorios();
  IF v_total <> 29 THEN
    RAISE EXCEPTION 'hr_admissao_campos_obrigatorios() devolve % campos, esperavam-se 29.', v_total;
  END IF;

  SELECT count(*) INTO v_pessoa
    FROM public.hr_admissao_campos_obrigatorios() WHERE origem = 'pessoa';
  IF v_pessoa <> 28 THEN
    RAISE EXCEPTION 'hr_admissao_campos_obrigatorios() tem % campos de origem "pessoa", esperavam-se 28.', v_pessoa;
  END IF;

  SELECT count(*) INTO v_condicional
    FROM public.hr_admissao_campos_obrigatorios() WHERE condicional;
  IF v_condicional <> 2 THEN
    RAISE EXCEPTION 'Os condicionais deixaram de ser dois (validade_documento, conjuge_situacao_profissional): %.', v_condicional;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.hr_admissao_campos_obrigatorios() WHERE codigo IN ('sindicalizado', 'sindicato')
  ) THEN
    RAISE EXCEPTION 'sindicalizado ou sindicato continuam em hr_admissao_campos_obrigatorios() -- a sindicalizacao nao ficou facultativa.';
  END IF;

  -- A carta de conducao continua de fora, como ja estava -- esta migracao
  -- nao lhe toca, so confirma que continua assim.
  IF EXISTS (
    SELECT 1 FROM public.hr_admissao_campos_obrigatorios() WHERE codigo LIKE 'carta_conducao%'
  ) THEN
    RAISE EXCEPTION 'A carta de conducao entrou nos obrigatorios -- nao era suposto esta migracao mexer nisso.';
  END IF;

  RAISE NOTICE 'OK: hr_admissao_campos_obrigatorios() devolve 29 campos (28 de origem pessoa, 2 condicionais); sindicalizado e sindicato deixaram de travar a submissao, continuam de fora tal como a carta de conducao.';
END;
$conferir$;
