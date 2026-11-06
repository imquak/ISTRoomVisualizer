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
