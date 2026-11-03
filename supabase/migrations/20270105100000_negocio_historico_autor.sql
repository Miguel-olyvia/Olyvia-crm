-- Negócio (3/11/2026, Rúben: «no histórico da lead meter o nome de quem fez as alterações»): quem fez cada entrada do histórico.
--
-- negocio_historico.autor já existia, mas ficava sempre a NULL: o neg_guardar_negocio apaga e volta a escrever o histórico todo em cada
-- gravação. Em vez de mexer nessa função (centenas de linhas), um gatilho guarda o autor de cada entrada da primeira vez que ela chega à
-- base e repõe-no em todas as gravações seguintes.
--
-- O que muda (a base só cresce; nada se apaga):
--   · negocio_historico_autor: o autor de cada entrada, pela chave (negócio, dia e hora ao minuto sem o ano, texto). A chave não leva o
--     ano porque o ecrã relê as datas como «dd/mm hh:mm» (negocioReal.ts, deIso/paraIso).
--   · as entradas que já existem entram aqui sem autor: não se dão a quem gravar a seguir.
--   · gatilho BEFORE INSERT em negocio_historico: com chave conhecida, repõe o autor; com chave nova, é quem está a gravar
--     (current_business_user_id()). O que o cliente fez no portal («O cliente …», «… pelo cliente …») fica sem autor.
--   · neg_historico_autores(p_org): o nome de quem fez cada entrada dos negócios da organização, com a permissão de ler os negócios.
-- O que muda para quem usa: nada se perde; o ecrã mostra «hoje 15:21 · Nome» onde houver autor.
SET lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.negocio_historico_autor (
  negocio_id uuid NOT NULL REFERENCES public.negocios(id) ON DELETE CASCADE,
  chave      text NOT NULL,
  autor      uuid REFERENCES public.anew_users(id) ON DELETE SET NULL,
  criado_em  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (negocio_id, chave)
);
COMMENT ON TABLE public.negocio_historico_autor IS 'Quem fez cada entrada do histórico do negócio (20270105100000). Escreve-a só o gatilho de negocio_historico.';
ALTER TABLE public.negocio_historico_autor ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.negocio_historico_autor FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.negocio_historico_autor TO service_role;

CREATE OR REPLACE FUNCTION public.fn_neg_historico_chave(p_ocorrido timestamptz, p_texto text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT to_char(p_ocorrido AT TIME ZONE 'Europe/Lisbon', 'MM-DD HH24:MI') || '|' || coalesce(p_texto, '')
$$;
REVOKE ALL ON FUNCTION public.fn_neg_historico_chave(timestamptz, text) FROM PUBLIC, anon, authenticated;

-- as entradas de antes ficam sem autor (não se dão a quem gravar a seguir)
INSERT INTO public.negocio_historico_autor (negocio_id, chave, autor)
SELECT h.negocio_id, public.fn_neg_historico_chave(h.ocorrido_em, h.texto), h.autor
  FROM public.negocio_historico h
ON CONFLICT (negocio_id, chave) DO NOTHING;

CREATE OR REPLACE FUNCTION public.fn_neg_historico_autor() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_chave text := public.fn_neg_historico_chave(NEW.ocorrido_em, NEW.texto); v_autor uuid; v_achou boolean;
BEGIN
  SELECT a.autor, true INTO v_autor, v_achou FROM public.negocio_historico_autor a WHERE a.negocio_id = NEW.negocio_id AND a.chave = v_chave;
  IF v_achou THEN
    NEW.autor := v_autor;
    RETURN NEW;
  END IF;
  -- o que o cliente fez no portal (vistaCliente.ts, motor.ts: «O cliente avisou…», «Adenda … assinada pelo cliente») não é de quem grava
  v_autor := CASE WHEN NEW.texto ~* '(^O cliente |pel[oa] cliente)' THEN NULL ELSE public.current_business_user_id() END;
  INSERT INTO public.negocio_historico_autor (negocio_id, chave, autor) VALUES (NEW.negocio_id, v_chave, v_autor)
  ON CONFLICT (negocio_id, chave) DO NOTHING;
  NEW.autor := v_autor;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.fn_neg_historico_autor() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_negocio_historico_autor ON public.negocio_historico;
CREATE TRIGGER trg_negocio_historico_autor BEFORE INSERT ON public.negocio_historico
  FOR EACH ROW EXECUTE FUNCTION public.fn_neg_historico_autor();

-- o nome de quem fez cada entrada, para o ecrã (a mesma permissão de neg_ler_negocios)
CREATE OR REPLACE FUNCTION public.neg_historico_autores(p_org uuid)
RETURNS TABLE (negocio_id uuid, ordem integer, quem text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.fn_cat_exigir(p_org, 'pessoas.view');
  RETURN QUERY
    SELECT h.negocio_id, h.ordem, u.name
      FROM public.negocio_historico h
      JOIN public.anew_users u ON u.id = h.autor
     WHERE h.organization_id = p_org;
END $$;
REVOKE ALL ON FUNCTION public.neg_historico_autores(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.neg_historico_autores(uuid) TO authenticated, service_role;
