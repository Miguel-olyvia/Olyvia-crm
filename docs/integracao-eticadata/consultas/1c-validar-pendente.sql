-- Validação (só leitura): o fltValorPendente da fatura bate com Total - soma dos recibos?
WITH liq AS (
  SELECT l.strCodSeccaoPend s, l.strAbrevTpDocPend t, l.strCodExercicioPend e, l.intNumeroPend n,
         SUM(l.fltAtribuido) atribuido, MAX(lc.dtmData) ultimo, COUNT(DISTINCT lc.strNumero) recibos
  FROM Mov_Liquidacao_Lin l
  JOIN Mov_Liquidacao_Cab lc ON lc.strCodSeccao=l.strCodSeccao AND lc.strCodExercicio=l.strCodExercicio
       AND lc.strAbrevTpDoc=l.strAbrevTpDoc AND lc.intNumero=l.intNumero
  WHERE lc.bitAnulado=0 AND l.bitAnulado=0
  GROUP BY l.strCodSeccaoPend, l.strAbrevTpDocPend, l.strCodExercicioPend, l.intNumeroPend)
SELECT
  COUNT(*) faturas,
  SUM(CASE WHEN ABS(c.fltTotal - ISNULL(q.atribuido,0) - c.fltValorPendente) < 0.01 THEN 1 ELSE 0 END) batem,
  SUM(CASE WHEN ABS(c.fltTotal - ISNULL(q.atribuido,0) - c.fltValorPendente) >= 0.01 THEN 1 ELSE 0 END) nao_batem,
  SUM(CASE WHEN q.n IS NULL AND c.fltValorPendente=0 THEN 1 ELSE 0 END) pagas_sem_recibo
FROM Mov_Venda_Cab c LEFT JOIN liq q ON q.s=c.strCodSeccao AND q.t=c.strAbrevTpDoc AND q.e=c.strCodExercicio AND q.n=c.intNumero
WHERE c.bitAnulado=0 AND c.strAbrevTpDoc='FAT';

-- Exemplos das que não batem (para perceber porquê)
WITH liq AS (
  SELECT l.strCodSeccaoPend s, l.strAbrevTpDocPend t, l.strCodExercicioPend e, l.intNumeroPend n, SUM(l.fltAtribuido) atribuido
  FROM Mov_Liquidacao_Lin l JOIN Mov_Liquidacao_Cab lc ON lc.strCodSeccao=l.strCodSeccao AND lc.strCodExercicio=l.strCodExercicio
       AND lc.strAbrevTpDoc=l.strAbrevTpDoc AND lc.intNumero=l.intNumero
  WHERE lc.bitAnulado=0 AND l.bitAnulado=0 GROUP BY l.strCodSeccaoPend, l.strAbrevTpDocPend, l.strCodExercicioPend, l.intNumeroPend)
SELECT TOP 15 c.strNumero, c.dtmData, c.fltTotal, c.fltValorPago, c.fltValorPendente, q.atribuido, c.strCodCondPag
FROM Mov_Venda_Cab c LEFT JOIN liq q ON q.s=c.strCodSeccao AND q.t=c.strAbrevTpDoc AND q.e=c.strCodExercicio AND q.n=c.intNumero
WHERE c.bitAnulado=0 AND c.strAbrevTpDoc='FAT' AND ABS(c.fltTotal - ISNULL(q.atribuido,0) - c.fltValorPendente) >= 0.01
ORDER BY c.dtmData DESC;

-- Formato dos números e das secções/exercícios das faturas
SELECT strCodSeccao, strCodExercicio, COUNT(*) n, MIN(strNumero) primeiro, MAX(strNumero) ultimo FROM Mov_Venda_Cab
WHERE strAbrevTpDoc='FAT' GROUP BY strCodSeccao, strCodExercicio ORDER BY strCodExercicio;
