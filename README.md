# IST Room Visualizer

O **IST Room Visualizer** é uma aplicação desenhada para ajudar os estudantes e docentes do **Instituto Superior Técnico (Campus Alameda)** a localizarem salas, consultarem plantas de edifícios e descobrirem **salas de aula vazias em tempo real**.

**Versão em produção:** [ist-room-visualizer.vercel.app](https://ist-room-visualizer.vercel.app/)

---

## Funcionalidades

* **Mapa Interativo do Campus Alameda:** Mapa interativo com todos os edifícios do campus. Clica num edifício para ver imediatamente as salas e a sua disponibilidade.
* **Procurador de Salas Livres**
* **Integração com o FénixEdu (OAuth2):** Autentica-te com a tua conta do Técnico para consultar o teu horário de aulas e localizar as salas diretamente no mapa.
## **Arquitetura**
* **Frontend:** Next.js 16 (App Router, React 19, Tailwind CSS) hosted na **Vercel** com CI/CD automático.
* **Backend:** Microserviço em **Go 1.22** com rate limiter para a API do Fénix e base de dados SQLite.

---

## Licença

Distribuído sob a licença MIT. Consulta `LICENSE` para mais detalhes.
