/**
 * Constantes de filtro que a TELA precisa enxergar.
 *
 * ⚠️ Este arquivo não importa NADA, e é de propósito.
 *
 *    `config.ts` importa o `prisma`. Quando a página da Máquina de Vendas — que
 *    é `'use client'` — importou a constante de lá, o Turbopack seguiu a cadeia
 *    `page.tsx → config.ts → prisma.ts → pg` e tentou levar o driver de Postgres
 *    para o bundle do navegador. O build quebrou com sete erros de `Can't
 *    resolve 'dns' / 'fs'`, que são módulos do Node inexistentes no browser.
 *
 *    Por isso o sentinela mora aqui, sozinho: é a única peça do recorte que os
 *    dois lados precisam conhecer. A LISTA de status que ele representa
 *    (`STATUS_DA_REGUA`) fica em `config.ts`, junto de `MENSAGEM_STATUS`, porque
 *    só o servidor monta a query — e assim não há literal duplicado dos dois
 *    lados da fronteira.
 */

/** Valor sentinela do filtro padrão da tabela. Ver `STATUS_DA_REGUA` em config.ts. */
export const FILTRO_MSG_REGUA = '__regua'
