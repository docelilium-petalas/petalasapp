/**
 * AS REGRAS DA IMPORTAÇÃO, contra planilhas esquisitas de verdade.
 *
 *   npx tsx scripts/importar-conferir.ts
 *
 * Não toca em banco e não escreve nada: `julgar()` é função pura, e é ela que
 * decide tudo o que a importação faz.
 */
import { julgar, type LinhaImportada, type ContatoExistente } from '../src/lib/importar-contatos'
import { chaveTelefone, paraE164 } from '../src/lib/maquina-vendas/telefone'

const chaveDe = (t: string) => { const e = paraE164(t); return e ? chaveTelefone(e) : '' }

// O contato que já existe SEM o 9º dígito — o caso medido em produção.
const existentes: ContatoExistente[] = [
  { id: 'c1', telefone: '556299630120', email: 'marina@ja.com', cidade: null, estado: null, documento: null, sobrenome: null },
]

const linhas: LinhaImportada[] = [
  { nome: 'Marina', telefone: '(62) 99963-0120', email: 'outro@x.com', cidade: 'Goiânia' }, // mesma pessoa, com o 9
  { nome: 'Bruna', telefone: '62998887777' },                                                // nova
  { nome: 'Bruna de novo', telefone: '(62) 99888-7777' },                                    // repetida no arquivo
  { nome: 'X', telefone: '62997776666' },                                                    // nome de 1 letra
  { nome: 'Carla', telefone: '123' },                                                        // telefone invalido
  { nome: '', telefone: '' },                                                                // linha vazia
  { nome: 'Marina', telefone: '556299630120' },                                              // ja existe, nada novo
]

const r = julgar(linhas, existentes, chaveDe)
console.log(`\ncriar ${r.criar} · atualizar ${r.atualizar} · ignorar ${r.ignorar}\n`)
for (const v of r.vereditos) {
  console.log(`  linha ${v.linha}  ${v.acao.padEnd(10)} ${(v.nome ?? '—').padEnd(16)} ${v.motivo ?? (v.camposAtualizados?.join(', ') ?? '')}`)
}

const esperado = ['atualizar', 'criar', 'ignorar', 'ignorar', 'ignorar', 'ignorar', 'ignorar']
const bateu = r.vereditos.every((v, i) => v.acao === esperado[i])
const naoApagouEmail = !r.vereditos[0].camposAtualizados?.includes('e-mail')
console.log(`\n  ${bateu ? '✓' : '✗'} cada linha foi para o destino certo`)
console.log(`  ${naoApagouEmail ? '✓' : '✗'} o e-mail que já existia NÃO foi sobrescrito pelo da planilha`)
console.log(`  ${r.vereditos[0].contatoId === 'c1' ? '✓' : '✗'} casou com o contato de 12 dígitos, sem criar duplicata\n`)
