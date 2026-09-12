-- ==============================================================================
-- Invariante "horario exige afectacao", LADO A: um bloco de horario planeado
-- com local X e validade [a,b] exige uma afectacao a X que cubra [a,b]. O lado
-- B (fechar/encolher uma afectacao com horario a frente falha, ver
-- afectacao_tem_horario_a_frente) ja ficou em 20261130060000, porque so
-- precisava de pessoas_horario_planeado existir, nao de dados nela.
--
-- POR APLICAR. Aplica-se DEPOIS de 20261130090000 (a semente): so entao todo
-- o horario planeado existente ja tem uma afectacao correspondente, e este
-- trigger passa a proteger so escritas NOVAS -- nunca reavalia, sozinho, uma
-- linha antiga que ninguem voltou a tocar.
--
--
-- -- O QUE O TRIGGER VERIFICA, E O QUE DELIBERADAMENTE NAO VERIFICA -----------
--
-- So actua quando o bloco tem local_id EXPLICITO (NEW.local_id IS NOT NULL).
-- Quando local_id e NULL, o bloco usa o local PREDEFINIDO da pessoa
-- (pessoas.local_id) -- e esse valor e ele proprio derivado da afectacao em
-- aberto (20261130060000): so existe se ja houver uma afectacao a sustenta-lo.
-- Validar de novo aqui seria verificar a mesma coisa duas vezes por caminhos
-- diferentes; e se pessoas.local_id for NULL (pessoa sem local predefinido), o
-- bloco tambem nao esta a reivindicar centro nenhum -- nada para validar.
--
-- Uma linha de folga (nao_trabalha = true) nunca tem local_id (CHECK
-- pessoas_horario_planeado_folga_sem_horas ja obriga a NULL) -- cai no mesmo
-- caso acima, sem verificacao adicional aqui.
--
-- A janela do bloco:
--   excepcao por data (h.data preenchida)         -> [data, data]
--   regra recorrente (h.dia_semana preenchido)     -> [valido_de, valido_ate]
--     (NULL num dos lados = sem limite desse lado; ver o comentario abaixo
--      sobre o que isso implica para uma regra "desde sempre")
--
--
-- -- SECURITY DEFINER, E O MESMO MOTIVO DE SEMPRE -------------------------------
--
-- Quem edita horario com hr.pessoas.horario.edit pode nao ter
-- hr.pessoas.afectacoes.view -- sob RLS de invocador nao veria as afectacoes
-- existentes e a verificacao passaria por nao encontrar nada, bloqueando
-- escritas legitimas. SECURITY DEFINER com SET search_path fixo.
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- Sem ficheiro de reversao nesta pasta, de proposito. A mao:
--   DROP TRIGGER IF EXISTS trg_pessoas_horario_planeado_exige_afectacao ON public.pessoas_horario_planeado;
--   DROP FUNCTION IF EXISTS public.hr_horario_planeado_exige_afectacao();
--
--
-- Prerequisitos:
--   20261120150000  pessoas_horario_planeado
--   20261130060000  pessoas_afectacoes
--   20261130090000  semente das afectacoes a partir do horario existente
-- ==============================================================================

DO $guardas$
BEGIN
  IF to_regclass('public.pessoas_horario_planeado') IS NULL THEN
    RAISE EXCEPTION 'public.pessoas_horario_planeado nao existe.';
  END IF;

  IF to_regclass('public.pessoas_afectacoes') IS NULL THEN
    RAISE EXCEPTION 'public.pessoas_afectacoes nao existe. Aplicar 20261130060000 primeiro.';
  END IF;

  -- A ordem importa: sem a semente, o primeiro UPDATE (ou reinsercao) de um
  -- bloco de horario com local_id explicito rebentaria contra dados que a
  -- propria aplicacao produziu antes deste invariante existir. So bloqueia
  -- quando ha de facto horario com local_id explicito e nenhuma afectacao --
  -- uma base vazia (sem pessoas nem horario) nao tem nada a proteger e nao
  -- deve ficar impedida de aplicar este invariante.
  IF EXISTS (
       SELECT 1 FROM public.pessoas_horario_planeado
        WHERE deleted_at IS NULL AND local_id IS NOT NULL
     )
     AND NOT EXISTS (SELECT 1 FROM public.pessoas_afectacoes) THEN
    RAISE EXCEPTION
      'Ha horario planeado com local_id explicito e pessoas_afectacoes esta vazia. Aplicar 20261130090000 (a semente) antes desta migracao -- caso contrario esse horario passaria a falhar no primeiro UPDATE.';
  END IF;
END;
$guardas$;

CREATE OR REPLACE FUNCTION public.hr_horario_planeado_exige_afectacao()
RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_janela  daterange;
  v_coberto boolean;
BEGIN
  -- Soft delete e folga nao reivindicam centro nenhum agora.
  IF NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Sem local_id explicito: usa o predefinido da pessoa, que ja e ele proprio
  -- derivado de uma afectacao em aberto (ou e NULL, e entao nao ha centro
  -- nenhum a validar). Ver o cabecalho.
  IF NEW.local_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.data IS NOT NULL THEN
    v_janela := daterange(NEW.data, NEW.data, '[]');
  ELSE
    v_janela := daterange(NEW.valido_de, NEW.valido_ate, '[]');
  END IF;

  SELECT EXISTS (
    SELECT 1
      FROM public.pessoas_afectacoes a
     WHERE a.pessoa_id = NEW.pessoa_id
       AND a.organization_id = NEW.organization_id
       AND a.local_id = NEW.local_id
       AND a.deleted_at IS NULL
       AND daterange(a.valido_de, a.valido_ate, '[]') @> v_janela
  ) INTO v_coberto;

  IF NOT v_coberto THEN
    RAISE EXCEPTION
      'horario_sem_afectacao: nao existe afectacao desta pessoa ao local % que cubra o periodo %. Criar ou alargar a afectacao antes de gravar este horario.',
      NEW.local_id, v_janela;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.hr_horario_planeado_exige_afectacao() IS
'Lado A do invariante horario<->afectacao: um bloco de horario planeado com local_id EXPLICITO exige uma afectacao viva (pessoas_afectacoes) da mesma pessoa ao mesmo local que contenha [valido_de,valido_ate] (regra recorrente) ou [data,data] (excepcao). So actua quando local_id nao e NULL -- ver o cabecalho de 20261130100000 sobre o caso do local predefinido. SECURITY DEFINER: quem tem horario.edit pode nao ter afectacoes.view.';

DROP TRIGGER IF EXISTS trg_pessoas_horario_planeado_exige_afectacao ON public.pessoas_horario_planeado;
CREATE TRIGGER trg_pessoas_horario_planeado_exige_afectacao
  BEFORE INSERT OR UPDATE ON public.pessoas_horario_planeado
  FOR EACH ROW EXECUTE FUNCTION public.hr_horario_planeado_exige_afectacao();

-- ---- Conferir ----------------------------------------------------------------
DO $conferir$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'trg_pessoas_horario_planeado_exige_afectacao'
       AND tgrelid = to_regclass('public.pessoas_horario_planeado')
  ) THEN
    RAISE EXCEPTION 'O trigger do invariante horario<->afectacao nao ficou criado.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname = 'hr_horario_planeado_exige_afectacao'
       AND p.prosecdef
       AND array_to_string(coalesce(p.proconfig, ARRAY[]::text[]), ',') LIKE '%search_path%'
  ) THEN
    RAISE EXCEPTION
      'hr_horario_planeado_exige_afectacao nao e SECURITY DEFINER com search_path fixo -- vector de escalada.';
  END IF;

  RAISE NOTICE
    'OK: trigger trg_pessoas_horario_planeado_exige_afectacao activo em pessoas_horario_planeado -- um bloco com local_id explicito exige afectacao que o cubra, daqui para a frente.';
END;
$conferir$;
