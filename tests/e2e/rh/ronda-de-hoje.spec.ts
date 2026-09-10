import { test, expect } from '@playwright/test'

// Uma passagem pelo que mudou hoje, ao vivo. Nao substitui os testes de cada
// coisa; responde a pergunta que nenhum deles responde: os ecras abrem, e
// nao ha nenhuma chave de traducao a aparecer em bruto?

const NIKE = 'b6ffce4f-f630-4933-833a-008649757a33'
test.setTimeout(180_000)

// Uma chave por resolver aparece no ecra como o proprio caminho da chave.
const CHAVE_EM_BRUTO = /\b(hr|sidebar|common)\.[a-z]+\.[a-zA-Z.]+\b/

async function abrir(page: import('@playwright/test').Page, rota: string) {
  await page.addInitScript(id => localStorage.setItem('activeCompanyId', id), NIKE)
  const erros: string[] = []
  page.on('pageerror', e => erros.push(e.message))
  await page.goto(rota, { waitUntil: 'domcontentloaded' })
  return erros
}

test('o separador dos contratos abre agrupado e sem chaves em bruto', async ({ page }) => {
  const erros = await abrir(page, '/rh/pessoas')
  const primeira = page.locator('table tbody tr').first()
  await expect(primeira).toBeVisible({ timeout: 60000 })
  await primeira.click()
  await page.waitForURL(/\/rh\/pessoas\/[0-9a-f-]{36}/, { timeout: 30000 })
  await page.getByRole('tab', { name: /contratos|contracts/i }).click()

  // Os tres subtitulos sao cabecalhos a serio, nao texto a negrito.
  for (const grupo of [/contrato/i, /datas|dates|fechas|termine/i, /tempo de trabalho|working time|arbeitszeit|tiempo de trabajo|temps de travail/i]) {
    await expect(
      page.getByRole('heading', { name: grupo }).first(),
      `nao ha cabecalho para o grupo ${grupo}`,
    ).toBeVisible({ timeout: 30000 })
  }

  await expect(page.getByText(CHAVE_EM_BRUTO), 'ha chaves de traducao em bruto no ecra').toHaveCount(0)
  expect(erros, 'rebentou em execucao').toEqual([])
})

test('a agencia bancaria existe nos detalhes pessoais', async ({ page }) => {
  const erros = await abrir(page, '/rh/pessoas')
  const primeira = page.locator('table tbody tr').first()
  await expect(primeira).toBeVisible({ timeout: 60000 })
  await primeira.click()
  await page.waitForURL(/\/rh\/pessoas\/[0-9a-f-]{36}/, { timeout: 30000 })
  await page.getByRole('tab', { name: /detalhes pessoais|personal details/i }).click()

  await expect(
    page.getByLabel(/^ag[eê]ncia$|^branch$|^sucursal$|^agence$|^filiale$/i).first(),
    'o campo da agencia nao aparece',
  ).toBeVisible({ timeout: 30000 })
  expect(erros).toEqual([])
})

test('a fila de desvios esta agrupada por dia e filtra por pessoa', async ({ page }) => {
  const erros = await abrir(page, '/rh/assiduidade/organizacao')
  await page.getByRole('tab', { name: /fila de trabalho|work queue|cola|file|arbeit/i }).click()

  // Cabecalho de dia a serio.
  const cabecalhosDeDia = page.getByRole('heading', { level: 3 })
  await expect(cabecalhosDeDia.first(), 'nao ha cabecalhos de dia').toBeVisible({ timeout: 30000 })

  // O selector de pessoa existe e tem etiqueta associada.
  const filtro = page.getByLabel(/^pessoa$|^person$|^persona$|^personne$/i).first()
  await expect(filtro, 'nao ha filtro por pessoa').toBeVisible()

  await expect(page.getByText(CHAVE_EM_BRUTO), 'chaves em bruto na fila').toHaveCount(0)
  expect(erros).toEqual([])
})

test('o meu ponto abre sem chaves em bruto', async ({ page }) => {
  const erros = await abrir(page, '/rh/assiduidade')
  await page.waitForTimeout(3000)
  await expect(page.getByText(CHAVE_EM_BRUTO), 'chaves em bruto no meu ponto').toHaveCount(0)
  expect(erros).toEqual([])
})
