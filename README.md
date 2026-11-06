# IST Room Visualizer

O **IST Room Visualizer** é uma aplicação web moderna desenhada para ajudar os estudantes e docentes do **Instituto Superior Técnico (Campus Alameda)** a localizarem salas, consultarem plantas de edifícios e descobrirem **salas de aula vazias em tempo real**.

🌐 **Versão em produção:** [ist-room-visualizer.vercel.app](https://ist-room-visualizer.vercel.app/)

---

## 🚀 Funcionalidades

* 🗺️ **Mapa Interativo do Campus Alameda:** Mapa interativo em SVG com todos os edifícios do campus. Clica num edifício para ver imediatamente as salas e a sua disponibilidade.
* 🟢 **Procurador de Salas Livres:**
  * Descobre salas vazias para estudar ou trabalhar em grupo.
  * Seletor de horário com barra visual verde de duração integrada na timeline.
  * Filtro rápido por duração (`30m`, `45m`, `1h`, `1.5h`, `2h`, `3h`).
  * Filtro estrito que apenas apresenta salas com plantas e identificação validada.
  * Visualização imediata da planta da sala através do botão **Planta**.
* 📅 **Integração com o FénixEdu (OAuth2):** Autentica-te com a tua conta do Técnico para consultar o teu horário de aulas e localizar as salas diretamente no mapa.
* ⚡ **Arquitetura Híbrida de Alta Performance:**
  * **Frontend:** Next.js 16 (App Router, React 19, Tailwind CSS) alojado na **Vercel** com CI/CD automático.
  * **Backend:** Microserviço em **Go 1.22** com rate limiter para a API do Fénix, base de dados SQLite (WAL mode) e índice em memória com `sync.RWMutex` para respostas instantâneas (< 2ms).

---

## 🏗️ Estrutura do Repositório

```text
ist-room-visualizer/
├── app/                     # Frontend Next.js (App Router)
│   ├── api/auth/            # Handlers OAuth do Fénix (login & calendário)
│   └── page.tsx             # Interface principal (Normal & Salas Livres)
├── components/
│   └── ISTMap.tsx           # Mapa interativo em SVG com suporte a cliques e tooltips
├── lib/
│   ├── goBackendClient.ts   # Cliente tipado para comunicação com a API em Go
│   └── data/                # Metadados e catálogo base de salas e edifícios
├── public/
│   └── blueprints/          # Cache local de plantas SVG/JPEG das salas
├── backend/                 # Motor autónomo de estado e disponibilidade em Go
│   ├── cmd/api/main.go      # Ponto de entrada, injeção de dependências e graceful shutdown
│   ├── internal/
│   │   ├── api/             # Router Chi, CORS e endpoints REST
│   │   ├── config/          # Variáveis de ambiente
│   │   ├── domain/          # Modelos de dados
│   │   ├── fenix/           # Cliente HTTP com rate limiter (8 req/s) e crawler BFS
│   │   ├── service/         # Cálculo de intervalos livres e interseção de horários
│   │   └── store/           # Cache em memória e persistência SQLite WAL
│   ├── Dockerfile           # Imagem multi-stage ultra-leve (Alpine)
│   └── go.mod
└── README.md
```

---

## 🌐 Como Fazer Host do Backend em Go

Como o teu frontend está na **Vercel** e atualiza automaticamente em cada `git push` para a branch `main`, podes configurar o backend para ter exatamente o mesmo comportamento de **Continuous Deployment**.

A melhor opção gratuita / low-cost com suporte para Docker e SQLite é a **Railway** ou o **Render**.

---

### Opção 1: Railway (Recomendado — 5 minutos)

A Railway deteta automaticamente o Dockerfile e cria um deploy sempre que fazes `git push main`.

1. Cria conta em [railway.app](https://railway.app/) com o teu GitHub.
2. Clica em **"New Project"** → **"Deploy from GitHub repo"** e seleciona o repositório `ISTRoomVisualizer`.
3. Vai às **Settings** do serviço criado na Railway:
   * **Root Directory:** Define como `/backend` (ou deixa vazio se selecionares o Dockerfile).
   * **Dockerfile Path:** `backend/Dockerfile`
4. No separador **Variables**, adiciona:
   * `PORT` = `8080` (a Railway pode definir automaticamente)
   * `CORS_ORIGINS` = `https://ist-room-visualizer.vercel.app,http://localhost:3000`
   * `DB_PATH` = `/app/campus.db`
5. No separador **Networking**, clica em **"Generate Domain"** (ex: `https://ist-room-backend.up.railway.app`).
6. *(Opcional)* Para o SQLite não perder dados entre redeploys, adiciona um **Volume** montado em `/app`.

---

### Opção 2: Render (Free Tier)

1. Cria conta em [render.com](https://render.com/).
2. Clica em **"New +"** → **"Web Service"** e liga o repositório do GitHub.
3. Configura:
   * **Root Directory:** `backend`
   * **Environment:** `Docker`
   * **Dockerfile Path:** `./Dockerfile`
4. Em **Environment Variables**:
   * `CORS_ORIGINS` = `https://ist-room-visualizer.vercel.app,http://localhost:3000`
   * `DB_PATH` = `campus.db`
5. O Render gera um domínio HTTPS (ex: `https://ist-room-visualizer-backend.onrender.com`).

---

### Opção 3: Fly.io (CLI)

1. Instala o CLI do Fly.io (`curl -L https://fly.io/install.sh | sh` ou via Scoop/Brew).
2. Entra na pasta do backend:
   ```bash
   cd backend
   fly launch
   ```
3. Cria um volume persistente para a base de dados SQLite:
   ```bash
   fly volumes create campus_data --size 1
   ```
4. Faz o deploy:
   ```bash
   fly deploy
   ```

---

### 🔗 Ligar o Frontend da Vercel ao Backend Hosted

Depois de obteres o URL público do teu backend (ex: `https://ist-room-backend.up.railway.app`):

1. Vai ao painel do teu projeto na **Vercel** (`Settings` → `Environment Variables`).
2. Adiciona a variável:
   * **Key:** `NEXT_PUBLIC_GO_BACKEND_URL`
   * **Value:** `https://o-teu-backend.up.railway.app` (sem barra no final)
   * **Environments:** Production, Preview, Development
3. Vai a **Deployments** na Vercel e clica em **"Redeploy"** no último commit para aplicar a variável.
4. **Pronto!** Em cada novo `git push main`:
   * A **Vercel** atualiza o frontend automaticamente.
   * A **Railway / Render** reconstrói o backend via Dockerfile automaticamente.

---

## 💻 Como Correr Localmente

### 1. Clonar o Repositório

```bash
git clone https://github.com/imquak/ISTRoomVisualizer.git
cd ISTRoomVisualizer
```

### 2. Frontend (Next.js)

Instala as dependências e cria o ficheiro `.env.local`:

```bash
pnpm install
```

Ficheiro `.env.local`:
```env
NEXT_PUBLIC_FENIX_CLIENT_ID="<O_TEU_CLIENT_ID>"
FENIX_CLIENT_SECRET="<O_TEU_CLIENT_SECRET>"
NEXT_PUBLIC_FENIX_REDIRECT_URI="http://localhost:3000/api/auth/callback"
NEXT_PUBLIC_GO_BACKEND_URL="http://localhost:8080"
```

Inicia o servidor de desenvolvimento:
```bash
pnpm dev
```
Acede a `http://localhost:3000`.

---

### 3. Backend (Go)

> Requisitos: Go 1.22+ e GCC (ex: TDM-GCC ou MinGW no Windows para CGO do SQLite).

```bash
cd backend
go mod tidy
go run ./cmd/api
```

O backend arranca em `http://localhost:8080`, restaura o snapshot SQLite e sincroniza a topologia e horários em segundo plano com a API do Fénix.

Em alternativa com Docker:
```bash
cd backend
docker build -t ist-room-backend .
docker run -p 8080:8080 ist-room-backend
```

---

## 📡 Endpoints da API REST (Go)

| Método | Endpoint | Descrição |
|---|---|---|
| `GET` | `/api/v1/campuses` | Árvore completa do campus, edifícios e pisos |
| `GET` | `/api/v1/floors/{floorId}/state?at=` | Estado de ocupação e plantas de todas as salas de um piso |
| `GET` | `/api/v1/rooms/free?buildingId=&minDuration=&at=` | Lista de salas livres filtradas por edifício, duração e horário |
| `POST` | `/api/v1/schedules/intersect` | Interseção de horários de alunos e localização de salas vagas comuns |
| `GET` | `/api/v1/blueprints/{spaceId}` | Proxy e cache de plantas em alta resolução |
| `GET` | `/api/v1/health` | Verificação de estado do serviço |

---

## 📄 Licença

Distribuído sob a licença MIT. Consulta `LICENSE` para mais detalhes.
