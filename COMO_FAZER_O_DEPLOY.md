# Guia Passo a Passo: Colocando o Doce Lilium no Ar com Easypanel

Olá! Este é um guia simplificado para ajudá-lo a colocar o sistema Doce Lilium online usando o Easypanel.

O código do seu projeto já está **100% preparado** para rodar no Easypanel através do arquivo `Dockerfile` na raiz do projeto.

---

## Passo 1: Salve o código na sua conta do GitHub

O Easypanel busca o código diretamente do seu repositório no GitHub.

1. Abra o **Terminal** do seu projeto.
2. Digite os comandos abaixo, um por vez, apertando **Enter**:
   ```bash
   git add .
   git commit -m "Preparando o projeto para deploy no Easypanel"
   git push origin main
   ```
   *(Se a sua branch principal for `master`, troque `main` por `master`)*.

---

## Passo 2: Criando o projeto no Easypanel

1. Acesse o painel do seu Easypanel.
2. Clique em **"Create Project"** (Criar Projeto) e dê o nome `doce-lilium`.
3. Entre no projeto e clique em **"Create App"** ou **"Add Service"**.
4. Na configuração "App", o campo **Name** deve ser `doce-lilium-app`.

---

## Passo 3: Conectando com o Banco de Dados PostgreSQL

Antes de configurar o aplicativo, crie um banco de dados no Easypanel para o sistema salvar as informações (pastas, vídeos, usuários, etc.).

1. No seu projeto `doce-lilium` no Easypanel, adicione um novo serviço clicando em **"Add Service"**.
2. Escolha **PostgreSQL**.
3. Dê um nome a ele (ex: `doce-lilium-db`) e crie.
4. Anote a url de conexão que o Easypanel irá te fornecer (geralmente fica na aba Credentials ou Environment do banco criado). Ela se parecerá com:
`postgresql://postgres:password@nome-do-db:5432/doce-lilium`

---

## Passo 4: Configurando o Aplicativo na aba Source

1. Acesse a página do seu app `doce-lilium-app`.
2. Vá na aba **"Source"** e escolha **GitHub**.
3. Selecione o repositório do projeto onde o código do Doce Lilium está hospedado e defina a branch (`main` ou `master`).

---

## Passo 5: As Variáveis de Ambiente ⚠️ MUITO IMPORTANTE!

O banco de dados e as chaves de segurança são conectadas aqui.

1. No Easypanel, vá na aba **"Environment"** do seu app `doce-lilium-app`.
2. Cole as seguintes variáveis (substituindo os valores adequadamente):

```env
DATABASE_URL="sua-url-do-banco-de-dados-criado-no-passo-3"
NEXTAUTH_SECRET="uma-senha-secreta-qualquer-para-seguranca"
NEXTAUTH_URL="https://seu-dominio-ou-url-do-easypanel"
NANO_BANANA_API_KEY="sua_chave_aqui"
```

3. Clique em **"Save"**.

---

## Passo 6: Executando o Deploy

1. Vá para a aba **"Build"**.
2. Confirme que a opção de build selecionada seja **"Dockerfile"**.
3. No painel principal do app, clique em **"Deploy"**.

Aguarde alguns minutos. O Easypanel irá ler o `Dockerfile`, fazer o build seguro e executar a aplicação. Quando o status mudar para "Running", o sistema está de pé!

---

## Passo 7: Domínio e Banco de Dados (Finalização)

1. Para acessar via URL personalizada: Vá em **"Domains"** e coloque o seu domínio (`app.docelilium.com.br`) ativando o **HTTPS / Let's Encrypt**.
2. **Sincronizando o banco de dados**: Após a aplicação estar online (ou no processo de Continuous Integration), é necessário que as tabelas sejam criadas. Se usou as credenciais corretas, você pode configurar o terminal de dentro do Easypanel para rodar `npx prisma db push` e pronto!

🚀 Aproveite o seu novo sistema!
