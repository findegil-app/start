import { describe, expect, it } from 'vitest'
import { openToken, sealToken } from './vault'

describe('vault', () => {
  it('solo abre con el mismo sub + email', async () => {
    const sealed = await sealToken('github_pat_de_prueba', '1234567890', 'a@nfq.es')
    expect(JSON.stringify(sealed)).not.toContain('github_pat')
    expect(await openToken(sealed, '1234567890', 'a@nfq.es')).toBe('github_pat_de_prueba')
    expect(await openToken(sealed, '1234567891', 'a@nfq.es')).toBeNull()
    expect(await openToken(sealed, '1234567890', 'b@nfq.es')).toBeNull()
  })
})
