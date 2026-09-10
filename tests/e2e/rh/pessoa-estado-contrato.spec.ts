import { test, expect } from '@playwright/test'

// O defeito que originou isto: uma ficha SEM contrato nenhum mostrava
// "Estado do contrato: Em curso" nos Detalhes laborais, enquanto o separador
// Contratos dizia "Novo contrato". Eram duas verdades sobre o mesmo facto --
// uma coluna na ficha, escrita por omissao, e a tabela dos contratos.
//
// O estado passou a ser derivado do contrato. Estes testes provam ao vivo
// que os dois separadores deixaram de se contradizer.
//
// Nao escreve nada: navega e le.

const NIKE = 'b6ffce4f-f630-4933-833a-008649757a33'
test.setTimeout(180_000)

async function abrirPrimeiraFicha(page: import('@playwright/test').Page) {
  await page.addInitScript(id => localStorage.setItem('activeCompanyId', id), NIKE)
  await page.goto('/rh/pessoas', { waitUntil: 'domcontentloaded' })
  const primeira = page.locator('table tbody tr').first()
  await expect(primeira).toBeVisible({ timeout: 60000 })
  await primeira.click()
  await page.waitForURL(/\/rh\/pessoas\/[0-9a-f-]{36}/, { timeout: 30000 })
}

test.describe('RH — o estado do contrato', () => {
  test('os dois separadores dizem a mesma coisa sobre a mesma pessoa', async ({ page }) => {
    await abrirPrimeiraFicha(page)
    const url = page.url()

    // O que o separador dos contratos diz.
    await page.getByRole('tab', { name: /contratos|contracts/i }).click()
    const temContrato = await page
      .getByText(/contrato em vigor|current contract/i)
      .first()
      .isVisible()
      .catch(() => false)

    // O que os detalhes laborais dizem.
    await page.goto(url + '?tab=laborais', { waitUntil: 'domcontentloaded' })
    const campo = page.getByLabel(/estado do contrato|contract status/i).first()
    await expect(campo).toBeVisible({ timeout: 30000 })
    const estado = (await campo.inputValue()).trim()
    console.log(`ESTADO :: "${estado}" | separador de contratos mostra contrato em vigor: ${temContrato}`)

    if (!temContrato) {
      // Sem contrato, o estado NAO pode dizer que ha um em curso.
      expect(
        estado,
        'nao ha contrato nenhum e os detalhes laborais dizem "Em curso"',
      ).not.toMatch(/em curso|ongoing/i)
      expect(estado, 'sem contrato, o estado devia dizer "Sem contrato"').toMatch(
        /sem contrato|no contract/i,
      )
    } else {
      expect(estado, 'ha contrato em vigor e o estado nao o reflecte').toMatch(
        /em curso|ongoing|suspens/i,
      )
    }
  })

  test('o estado deixou de se poder escrever a mao nos detalhes laborais', async ({ page }) => {
    await abrirPrimeiraFicha(page)
    await page.getByRole('tab', { name: /detalhes laborais|job details/i }).click()

    const campo = page.getByLabel(/estado do contrato|contract status/i).first()
    await expect(campo).toBeVisible({ timeout: 30000 })

    // Passou a ser um campo de leitura, e nao um selector: quem quer mudar o
    // estado muda o contrato.
    await expect(campo, 'o estado ainda se edita na ficha').toBeDisabled()
  })

  test('o estado do contrato edita-se no separador dos contratos', async ({ page }) => {
    await abrirPrimeiraFicha(page)
    await page.getByRole('tab', { name: /contratos|contracts/i }).click()

    const selector = page.getByLabel(/^estado$|^status$|estado do v/i).first()
    await expect(selector, 'nao ha onde mudar o estado no separador dos contratos').toBeVisible({
      timeout: 30000,
    })
  })
})
