-- Exploração (só leitura): que tipos de documento de venda há, quanto está pago/pendente,
-- e se o fltValorPendente do cabeçalho bate com as liquidações (recibos).
SELECT c.strAbrevTpDoc, COUNT(*) AS docs, MIN(c.dtmData) AS desde, MAX(c.dtmData) AS ate,
       SUM(CASE WHEN c.fltValorPendente = 0 THEN 1 ELSE 0 END) AS sem_pendente,
       SUM(CASE WHEN c.fltValorPendente <> 0 THEN 1 ELSE 0 END) AS com_pendente,
       MIN(c.strNumero) AS exemplo_numero
FROM Mov_Venda_Cab c WHERE c.bitAnulado = 0
GROUP BY c.strAbrevTpDoc ORDER BY docs DESC;

-- Faturas "FT" dos últimos tempos: o cabeçalho contra a soma das liquidações
SELECT TOP 30 c.strCodSeccao, c.strAbrevTpDoc, c.strCodExercicio, c.intNumero, c.strNumero, c.strATCUD,
       c.dtmData, c.dtmDataVencimento, c.fltTotal, c.fltValorPago, c.fltValorPendente, c.intSinal,
       (SELECT SUM(l.fltAtribuido) FROM Mov_Liquidacao_Lin l JOIN Mov_Liquidacao_Cab lc
          ON lc.strCodSeccao=l.strCodSeccao AND lc.strCodExercicio=l.strCodExercicio AND lc.strAbrevTpDoc=l.strAbrevTpDoc AND lc.intNumero=l.intNumero
        WHERE lc.bitAnulado=0 AND l.strCodSeccaoPend=c.strCodSeccao AND l.strAbrevTpDocPend=c.strAbrevTpDoc
          AND l.strCodExercicioPend=c.strCodExercicio AND l.intNumeroPend=c.intNumero) AS liquidado
FROM Mov_Venda_Cab c WHERE c.bitAnulado = 0 AND c.strAbrevTpDoc = 'FT'
ORDER BY c.dtmData DESC;

-- Como os recibos aparecem
SELECT strAbrevTpDoc, COUNT(*) docs, MIN(dtmData) desde, MAX(dtmData) ate FROM Mov_Liquidacao_Cab WHERE bitAnulado=0 GROUP BY strAbrevTpDoc;
SELECT TOP 20 * FROM Tbl_Gce_Tipos_MovPag;
