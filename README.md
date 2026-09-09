# IST Room Visualizer

O IST Room Visualizer é uma aplicação web que facilita a localização das salas do Instituto Superior Técnico (por agora apenas o campus de Alameda). Pode aceder a uma versão já hosted na vercel com todas as funcionalidades disponíveis.

**[Aceder à versão live aqui](https://ist-room-visualizer.vercel.app/)**

## Funcionalidades
* **Mapa Interativo do Campus:** Edifícios destacados com base na sala ou aula selecionada.
* **Integração com o Fenix:** Entra com a tua conta do Fenix e vê as salas das tuas próximas aulas.
* **Pesquisa de salas:** Pode também pesquisar por sala na barra de pesquisa.

## Pré-requisitos para self-hosting
* Node.js (v18 ou superior)
* `npm`, `yarn` ou `pnpm`
* Uma Aplicação de Desenvolvedor no Fénix (para as credenciais OAuth)

## Como Correr Localmente no PC

**1. Instalar dependências**
```bash
npm install -g pnpm
git clone https://github.com/imquak/ISTRoomVisualizer
cd ISTRoomVisualizer
pnpm install
```

**2. Configurar Variáveis de Ambiente**
* Para ativar o login do Fénix, registe uma nova aplicação no Portal do Fénix (Pessoal > Aplicações > Gerir Aplicações). Garante que o Redirect Url está definido exatamente como http://localhost:3000/api/auth/callback.

Crie um ficheiro .env.local na raiz do projeto:
```bash
NEXT_PUBLIC_FENIX_CLIENT_ID="<O_TEU_CLIENT_ID>"
FENIX_CLIENT_SECRET="<O_TEU_CLIENT_SECRET>"
NEXT_PUBLIC_FENIX_REDIRECT_URI="http://localhost:3000/api/auth/callback"
```
**3. Iniciar o servidor**
```bash
pnpm dev
```
Abra http://localhost:3000 no seu browser para ver o resultado.

** Scripts de Dados (Opcional) **

O repositório já inclui um data.json pré-preenchido e plantas das salas na pasta public. Caso precise de atualizar os dados do campus a partir da API do Fenix no futuro, pode correr os scripts incluídos:

```bash
# Atualiza a lista principal de salas e plantas dos edifícios
npx tsx scripts/fetchbuildings.ts

# Descarrega as plantas individuais que estejam em falta
npx tsx scripts/fetchRoomBlueprints.ts
```