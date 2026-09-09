/**
 * Tabela de referência DDD → UF/Região/cidade-polo, usada pelo módulo Radar
 * para posicionar e agrupar contatos geograficamente a partir do telefone.
 *
 * Fonte: divisão oficial de códigos de área (ANATEL) e macrorregiões (IBGE).
 * As coordenadas de cada DDD apontam para a cidade-polo da área (normalmente
 * a maior cidade coberta), usadas apenas para posicionar o "bubble" do DDD
 * dentro do estado no mapa — não representam uma fronteira real da área.
 */

export type Regiao = 'Norte' | 'Nordeste' | 'Centro-Oeste' | 'Sudeste' | 'Sul'

export interface DddInfo {
  ddd: string
  uf: string
  estado: string
  regiao: Regiao
  cidadeRef: string
  lat: number
  lng: number
}

export const ESTADOS: Record<string, { nome: string; regiao: Regiao }> = {
  AC: { nome: 'Acre', regiao: 'Norte' },
  AL: { nome: 'Alagoas', regiao: 'Nordeste' },
  AP: { nome: 'Amapá', regiao: 'Norte' },
  AM: { nome: 'Amazonas', regiao: 'Norte' },
  BA: { nome: 'Bahia', regiao: 'Nordeste' },
  CE: { nome: 'Ceará', regiao: 'Nordeste' },
  DF: { nome: 'Distrito Federal', regiao: 'Centro-Oeste' },
  ES: { nome: 'Espírito Santo', regiao: 'Sudeste' },
  GO: { nome: 'Goiás', regiao: 'Centro-Oeste' },
  MA: { nome: 'Maranhão', regiao: 'Nordeste' },
  MT: { nome: 'Mato Grosso', regiao: 'Centro-Oeste' },
  MS: { nome: 'Mato Grosso do Sul', regiao: 'Centro-Oeste' },
  MG: { nome: 'Minas Gerais', regiao: 'Sudeste' },
  PA: { nome: 'Pará', regiao: 'Norte' },
  PB: { nome: 'Paraíba', regiao: 'Nordeste' },
  PR: { nome: 'Paraná', regiao: 'Sul' },
  PE: { nome: 'Pernambuco', regiao: 'Nordeste' },
  PI: { nome: 'Piauí', regiao: 'Nordeste' },
  RJ: { nome: 'Rio de Janeiro', regiao: 'Sudeste' },
  RN: { nome: 'Rio Grande do Norte', regiao: 'Nordeste' },
  RS: { nome: 'Rio Grande do Sul', regiao: 'Sul' },
  RO: { nome: 'Rondônia', regiao: 'Norte' },
  RR: { nome: 'Roraima', regiao: 'Norte' },
  SC: { nome: 'Santa Catarina', regiao: 'Sul' },
  SP: { nome: 'São Paulo', regiao: 'Sudeste' },
  SE: { nome: 'Sergipe', regiao: 'Nordeste' },
  TO: { nome: 'Tocantins', regiao: 'Norte' },
}

const RAW_DDD: [string, string, string, number, number][] = [
  ['68', 'AC', 'Rio Branco', -9.975, -67.8243],
  ['82', 'AL', 'Maceió', -9.6658, -35.735],
  ['96', 'AP', 'Macapá', 0.0349, -51.0694],
  ['92', 'AM', 'Manaus', -3.119, -60.0217],
  ['97', 'AM', 'Tefé', -3.3542, -64.7112],
  ['71', 'BA', 'Salvador', -12.9718, -38.5011],
  ['73', 'BA', 'Ilhéus/Itabuna', -14.7935, -39.0453],
  ['74', 'BA', 'Juazeiro', -9.4111, -40.4986],
  ['75', 'BA', 'Feira de Santana', -12.2664, -38.9663],
  ['77', 'BA', 'Vitória da Conquista', -14.8619, -40.8444],
  ['85', 'CE', 'Fortaleza', -3.7172, -38.5433],
  ['88', 'CE', 'Sobral', -3.688, -40.3497],
  ['61', 'DF', 'Brasília', -15.7942, -47.8825],
  ['27', 'ES', 'Vitória', -20.3155, -40.3128],
  ['28', 'ES', 'Cachoeiro de Itapemirim', -20.848, -41.1128],
  ['62', 'GO', 'Goiânia', -16.6869, -49.2648],
  ['64', 'GO', 'Rio Verde', -17.7943, -50.9187],
  ['98', 'MA', 'São Luís', -2.5307, -44.3068],
  ['99', 'MA', 'Imperatriz', -5.5264, -47.4917],
  ['65', 'MT', 'Cuiabá', -15.6014, -56.0979],
  ['66', 'MT', 'Rondonópolis', -16.4673, -54.6371],
  ['67', 'MS', 'Campo Grande', -20.4697, -54.6201],
  ['31', 'MG', 'Belo Horizonte', -19.9167, -43.9345],
  ['32', 'MG', 'Juiz de Fora', -21.7642, -43.3496],
  ['33', 'MG', 'Governador Valadares', -18.8511, -41.9494],
  ['34', 'MG', 'Uberlândia', -18.9186, -48.2772],
  ['35', 'MG', 'Poços de Caldas', -21.7877, -46.5619],
  ['37', 'MG', 'Divinópolis', -20.1389, -44.8839],
  ['38', 'MG', 'Montes Claros', -16.735, -43.8617],
  ['91', 'PA', 'Belém', -1.4558, -48.4902],
  ['93', 'PA', 'Santarém', -2.4431, -54.7083],
  ['94', 'PA', 'Marabá', -5.3686, -49.1178],
  ['83', 'PB', 'João Pessoa', -7.1195, -34.845],
  ['41', 'PR', 'Curitiba', -25.4284, -49.2733],
  ['42', 'PR', 'Ponta Grossa', -25.095, -50.1619],
  ['43', 'PR', 'Londrina', -23.3045, -51.1696],
  ['44', 'PR', 'Maringá', -23.4205, -51.9331],
  ['45', 'PR', 'Cascavel/Foz do Iguaçu', -24.9555, -53.4552],
  ['46', 'PR', 'Pato Branco', -26.2287, -52.6706],
  ['81', 'PE', 'Recife', -8.0476, -34.877],
  ['87', 'PE', 'Petrolina', -9.3891, -40.503],
  ['86', 'PI', 'Teresina', -5.0892, -42.8019],
  ['89', 'PI', 'Picos', -7.0769, -41.4669],
  ['21', 'RJ', 'Rio de Janeiro', -22.9068, -43.1729],
  ['22', 'RJ', 'Campos dos Goytacazes', -21.7622, -41.3181],
  ['24', 'RJ', 'Volta Redonda', -22.5231, -44.1044],
  ['84', 'RN', 'Natal', -5.7945, -35.211],
  ['51', 'RS', 'Porto Alegre', -30.0346, -51.2177],
  ['53', 'RS', 'Pelotas', -31.7654, -52.3376],
  ['54', 'RS', 'Caxias do Sul', -29.1634, -51.1797],
  ['55', 'RS', 'Santa Maria', -29.6842, -53.8069],
  ['69', 'RO', 'Porto Velho', -8.7619, -63.9039],
  ['95', 'RR', 'Boa Vista', 2.8235, -60.6758],
  ['47', 'SC', 'Joinville/Blumenau', -26.3045, -48.8487],
  ['48', 'SC', 'Florianópolis', -27.5954, -48.548],
  ['49', 'SC', 'Chapecó', -27.1, -52.6152],
  ['11', 'SP', 'São Paulo', -23.5505, -46.6333],
  ['12', 'SP', 'São José dos Campos', -23.2237, -45.9009],
  ['13', 'SP', 'Santos', -23.9608, -46.3339],
  ['14', 'SP', 'Bauru', -22.3147, -49.0606],
  ['15', 'SP', 'Sorocaba', -23.5015, -47.4526],
  ['16', 'SP', 'Ribeirão Preto', -21.1775, -47.8103],
  ['17', 'SP', 'São José do Rio Preto', -20.8113, -49.3758],
  ['18', 'SP', 'Presidente Prudente', -22.1256, -51.3889],
  ['19', 'SP', 'Campinas', -22.9099, -47.0626],
  ['79', 'SE', 'Aracaju', -10.9472, -37.0731],
  ['63', 'TO', 'Palmas', -10.1689, -48.3317],
]

export const DDD_INFO: Record<string, DddInfo> = Object.fromEntries(
  RAW_DDD.map(([ddd, uf, cidadeRef, lat, lng]) => [
    ddd,
    { ddd, uf, estado: ESTADOS[uf].nome, regiao: ESTADOS[uf].regiao, cidadeRef, lat, lng },
  ])
)

export const DDDS_POR_UF: Record<string, string[]> = {}
for (const info of Object.values(DDD_INFO)) {
  ;(DDDS_POR_UF[info.uf] ||= []).push(info.ddd)
}

/**
 * Extrai o DDD de um telefone já normalizado pelo backend (padrão deste
 * projeto: sempre prefixado com "55", ver `normalizeTelefone` em crm.ts).
 * Aceita local de 8 dígitos (fixo) ou 9 dígitos (celular com o nono dígito),
 * então o formato com/sem o 9 na frente não altera a extração do DDD.
 * Retorna null quando o telefone é inválido/estrangeiro/DDD desconhecido.
 */
export function extractDDD(telefoneRaw: string | null | undefined): string | null {
  if (!telefoneRaw) return null
  let digits = telefoneRaw.replace(/\D/g, '')
  if (digits.startsWith('55')) digits = digits.substring(2)
  // Local: 8 dígitos (fixo) ou 9 dígitos (celular, com ou sem o 9º dígito já tratado acima)
  if (digits.length !== 10 && digits.length !== 11) return null
  const ddd = digits.substring(0, 2)
  return DDD_INFO[ddd] ? ddd : null
}

export const REGIOES: Regiao[] = ['Norte', 'Nordeste', 'Centro-Oeste', 'Sudeste', 'Sul']
