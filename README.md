# Pirate Battle

## Playable prototype

This repository contains a local single-player naval combat game. The arena and combat run in PixiJS; React renders menus, options, HUD, pause, results, ranking, and match history. Axios and TanStack Query call REST-shaped endpoints intercepted by MSW in development and production builds.

### Run locally

```bash
npm ci
npm run dev -- --host 127.0.0.1
```

Open `http://127.0.0.1:5173/`. Production validation uses `npm run build`; run the built app locally with `npm run preview -- --host 127.0.0.1 --port 5174 --strictPort`.

Quality commands: `npm run lint`, `npm run typecheck`, `npm run atlas:build`, `npm run build`, `npm run test:e2e`, `npm run test:e2e:desktop`, and `npm run test:e2e:mobile`. `npm run profile:game` runs the optimized 180-second match and five lifecycle cycles; a four-minute wall-time cap can produce an explicitly incomplete report. `npm run profile:game:minimal` captures a short diagnostic sample. Both write `artifacts/performance-profile.md` and `.json`, so save the full report before running the minimal command. The completed full run is recorded in those files; the earlier short diagnostic is preserved with a `-minimal-2026-10-02` suffix. No environment variables or private services are required; ranking/history uses the local MSW worker. Install Chromium once with `npx playwright install chromium`. Playwright runs against the production preview on port 5174 and writes its HTML report, traces, screenshots, and videos under `artifacts/`. Versioned screenshot baselines live beside the E2E specs.

### Controls

- **W / Up:** move forward; **S / Down:** reverse.
- **A / Left** and **D / Right:** turn.
- **Space:** fire forward; **Q** and **E:** fire the left and right parallel broadsides.
- **P** or **Escape:** pause/resume. The game also pauses when the tab is hidden or the window loses focus.
- On touch screens, hold the on-screen movement and attack buttons. Movement and attacks can be held together.

The main menu lets the captain enter the name used in the ranking and select any of the 30 supplied ship sprites. The selected profile persists locally. Ship selections share the same gameplay stats and collision radius. Set active match duration (60–180 seconds) and enemy spawn interval (1–15 seconds) in **Options before pressing Play**; Options is also available while paused, and changes there apply to the next match because each match uses a settings snapshot. Settings are saved locally. Completed match score, active duration, and end reason are saved locally as the latest result. Paused time does not count toward match duration.

The 16:9 arena scales into both portrait and landscape viewports without changing its simulation coordinates. Touch controls are available in either orientation; landscape is recommended to keep more of the arena visible.

Every 10 player kills advance the voyage to the next phase, up to phase 3. Each phase swaps in logical island grids rendered with the project's 8-neighbor atlas autotiling. The runtime atlas is generated losslessly from the numbered 64×64 source tiles; its JSON records the exact ID-to-frame mapping. The same template grids drive rendering and collision. Press **F3** during a voyage to inspect each land cell's coordinates, mask, and selected tile ID. Completed match records include score, phase reached, active duration, end reason, and the settings snapshot used by that match.

Islands are compact rectangular blocks or L-shaped landmasses with straight legs and multiple square turns. Desert right-facing vertical edges use tile 19; ground edge rules never substitute wreck/rock props. Each island has at most two connected wall formations, with at least one empty grid cell (including diagonals) between different formations. Island decor includes a horizontal wall (`46-[16|47|48|76]-62`) and, where space permits, either a vertical wall with bottom-to-top order `61-[15|31|32]-45` or two stacked courses `77-16-78` over `93-16-94`. Standalone towers 13/14 are isolated decorations and never connect wall formations. Wall variants are deterministic per island and position. On phase changes, all surviving enemies explode and the player moves to a safe point clear of the new islands. Run `npm run atlas:build` after changing numbered source tiles to regenerate `public/island-atlas.png` and its PixiJS frame JSON.

ESLint flat config is available through `npm run lint`. No separate unit-test runner is configured; Playwright covers browser flows. Remaining evidence and delivery work is listed in [DELIVERY_CATALOG.md](DELIVERY_CATALOG.md).

See [ARCHITECTURE.md](ARCHITECTURE.md) for the React/PixiJS boundary, simulation, input, collision, persistence, and records API decisions. The full challenge specification is retained below for reference.

See [ASSET_CATALOG.md](ASSET_CATALOG.md), [WALL_SPRITE_CATALOG.md](WALL_SPRITE_CATALOG.md), and [DELIVERY_CATALOG.md](DELIVERY_CATALOG.md) for asset usage, wall tile mapping, and the remaining delivery checklist. [DEPLOYMENT.md](DEPLOYMENT.md) documents isolated VM preparation; no deploy is performed by the local E2E commands.

See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for the supplied-art attribution status. Audio is out of scope for this release; WAV assets are retained but not loaded by the game.

### Ranking, history, and network scenarios

Ranking and history data use the local MSW worker and need no external service. Results are paginated; ranking rows are filtered to matches with the same session duration and enemy spawn interval. Ranking ties are ordered by score, then earlier completion time, then match ID. Completed records use an idempotent match ID. A pending queue is stored in `localStorage`, survives refresh, and does not block a new voyage.

Open either records tab to select a demo scenario: normal, slow, seeded variable latency, out-of-order pages, empty ranking, connection failure, HTTP 400, ranking error, history error, failed submission, or a save that times out after the mock has accepted it. The variable delay is derived from the saved test seed and request URL. Use **Reset local records** to clear confirmed and pending records and restore the normal scenario. The scenario itself is persisted in `localStorage`.

Desenvolva um **shooter naval 2D com visão superior** usando React, TypeScript e PixiJS. O jogador deve navegar entre ilhas, enfrentar navios inimigos e acumular pontos até o fim da partida.

O desafio avalia gameplay, domínio de PixiJS, arquitetura, integração de dados, experiência de uso e qualidade da entrega. Informe sua estimativa de prazo antes de iniciar.

## 1. Stack obrigatória

| Responsabilidade | Tecnologia |
| --- | --- |
| Interface e menus | React |
| Linguagem | TypeScript em modo estrito |
| Renderização do jogo | PixiJS |
| Estado remoto do ranking e do histórico | TanStack Query |
| Cliente HTTP do ranking e do histórico | Axios |
| Mocking das APIs de ranking e histórico | MSW |
| Testes E2E e regressão visual | Playwright |

Todas as tecnologias devem participar efetivamente da solução. A ferramenta de build, a estilização e as bibliotecas complementares ficam a critério do candidato.

O jogo é single-player e deve funcionar integralmente no navegador. Gameplay e configurações são locais. Ranking e histórico de partidas usam APIs REST simuladas com MSW, consumidas por Axios e TanStack Query.

## 2. Gameplay

### Jogador

- Movimentação para a frente e rotação para os dois lados.
- Disparo frontal com um projétil.
- Disparo lateral com três projéteis paralelos, com comandos para o lado esquerdo e o direito do navio.
- Vida limitada, reduzida por projéteis inimigos e pelo impacto de um Chaser.
- Movimentação restrita à arena visível, sem atravessar ilhas.

Defina controles de teclado e controles de toque para movimento, rotação e ataques. Permita movimentar e disparar simultaneamente. Apresente os comandos na interface.

### Inimigos

| Tipo | Comportamento |
| --- | --- |
| **Chaser** | Persegue o jogador, causa dano ao colidir com seu navio e explode no impacto |
| **Shooter** | Aproxima-se do jogador e dispara quando estiver dentro do alcance de ataque |

Ambos devem avançar, rotacionar, receber dano e respeitar as colisões com ilhas. Os dois tipos precisam aparecer durante uma partida padrão.

Inimigos surgem a cada intervalo configurado até o encerramento da partida. Os pontos de spawn devem estar livres de obstáculos e suficientemente afastados do jogador para evitar dano imediato inevitável.

### Arena, colisões e combate

- A arena deve conter água e pelo menos uma ilha que bloqueie navios e projéteis.
- Projéteis devem respeitar direção, velocidade, dano e alcance ou tempo de vida.
- Disparos do jogador atingem inimigos; disparos inimigos atingem o jogador.
- Cada projétil deve aplicar dano uma única vez e ser removido ao atingir um alvo ou obstáculo, expirar ou sair da arena.
- Cada arma deve respeitar seu intervalo entre disparos.
- Inimigos destruídos deixam de causar dano, disparar e participar das colisões.

### Regras da partida

- Duração configurável entre **60 e 180 segundos** de jogo ativo.
- Cada inimigo destruído pelos ataques do jogador vale **1 ponto**. A autodestruição de um Chaser contra o jogador não pontua.
- A partida termina quando o tempo acaba ou a vida do jogador chega a zero.
- O encerramento interrompe movimento, ataques, dano, spawns e contagem de pontos.
- Reiniciar deve criar uma nova partida, com vida, pontuação, cronômetro e entidades restaurados.

Exiba vida acima do navio do jogador e de cada inimigo. O HUD deve apresentar também pontuação e tempo restante.

Implemente pausa manual e automática ao perder o foco ou ocultar a aba. Durante a pausa, cronômetro, cooldowns e simulação ficam suspensos. A retomada exige uma ação do jogador e não pode acumular movimento ou disparos do período pausado.

### Animações e feedback

Implemente efeitos de disparo, explosão de destruição e deterioração visual dos navios conforme a vida restante. Ataques, impactos e dano devem ter feedback perceptível, mantendo a leitura da arena.

## 3. Telas e configurações

| Tela | Requisitos |
| --- | --- |
| Menu principal | Ações **Play** e **Options**, instruções de controle e abas **Ranking** e **Match History** |
| Options | **Game session time** e **Enemy spawn time**, com validação, salvamento e persistência após refresh |
| Partida | Arena PixiJS, HUD, controles e pausa |
| Resultado | Pontuação total, tempo jogado, motivo do encerramento, situação do registro da partida e ações **Play Again** e **Main Menu** |
| Ranking | Classificação, identificação dos jogadores, pontuação e paginação |
| Match History | Histórico do jogador, com data, pontuação, duração, motivo do encerramento e paginação |

Centralize os parâmetros de gameplay em uma configuração tipada e ajustável: duração, intervalo e distribuição dos spawns, vida, velocidades de movimento e rotação, dano, alcance, velocidade e duração dos projéteis, cooldowns e alcance do Shooter. Mudanças de balanceamento não devem exigir alterações na lógica dos sistemas.

A tela Options deve expor os dois parâmetros indicados. O intervalo de spawn deve ser positivo e ter limites documentados. Cada partida utiliza um snapshot da configuração vigente ao iniciar; alterações posteriores valem para novas partidas.

Recarregar a página ou sair da tela de combate encerra a partida em andamento. Persista localmente as opções do jogador e o resultado da última partida concluída. Uma partida abandonada não é registrada no ranking nem no histórico.

Interface, identificadores de código e documentação da solução devem estar em inglês. A identidade visual dos menus fica a seu critério e deve ser coerente com os assets do jogo.

## 4. PixiJS e arquitetura

Use PixiJS para arena, navios, projéteis, efeitos e indicadores sobre os navios. Use React nos menus, formulários, painéis e diálogos.

A solução deve demonstrar:

- separação entre regras do jogo, renderização, input e estado da interface;
- simulação baseada em tempo, com movimento, dano e spawns independentes da taxa de quadros;
- sincronização da interface com o jogo sem renderizações React a cada frame;
- carregamento e reutilização de texturas, com tratamento de falhas antes de iniciar o combate;
- ajuste do canvas à tela e à densidade de pixels, preservando proporções, coordenadas de input e limites da arena;
- liberação de listeners, ticker, timers, entidades e recursos ao sair ou reiniciar;
- inicialização e desmontagem corretas também com React Strict Mode.

O estado contínuo do combate deve permanecer na simulação. A estratégia de gerenciamento de estado e de sincronização com a interface fica a critério do candidato.

As regras de movimentação, combate, colisões e comportamento dos inimigos devem ser implementadas pelo candidato. A organização interna é livre; descreva as principais decisões em `ARCHITECTURE.md`.

## 5. Ranking e histórico de partidas

Implemente as abas **Ranking** e **Match History** no menu principal, com contratos tipados para os seguintes recursos:

| Recurso | Operações mínimas |
| --- | --- |
| Ranking | Consultar classificação paginada, ordenada por pontuação |
| Histórico | Registrar uma partida concluída e consultar o histórico paginado do jogador |

Cada registro deve conter identificação da partida e do jogador, data, pontuação, duração efetiva, motivo do encerramento e configuração usada. Compare no ranking partidas com a mesma configuração e adote um critério determinístico de desempate. Outros jogadores são representados por fixtures.

Use **Axios** nas chamadas HTTP e **TanStack Query** nas consultas e no registro de partidas. Gerencie carregamento, vazio, erro, atualização em segundo plano, cache, invalidação e retries. Atualize as duas abas após registrar uma partida e ao voltar a exibi-las. Respostas atrasadas não devem sobrescrever dados mais recentes.

Uma partida concluída deve gerar um único registro no histórico e uma única entrada no ranking. Reenvios e cliques repetidos devem recuperar o registro existente, sem duplicação. Preserve registros pendentes após falhas ou refresh e permita tentar novamente. O jogador deve conseguir iniciar outra partida enquanto houver um registro pendente.

Falhas nessas APIs não devem bloquear o acesso ao jogo, às configurações ou interromper o combate. Essas integrações se limitam ao ranking e ao histórico de partidas.

## 6. Mocking com MSW

Implemente os mocks das APIs de ranking e histórico na camada de rede, compartilhando contratos, fixtures e handlers entre desenvolvimento, testes e demonstração. Registros confirmados devem aparecer nas consultas seguintes, com estado consistente entre as duas abas.

### Simulating Network Conditions and Failures

Disponibilize cenários configuráveis e reproduzíveis para:

- sucesso, listas vazias e múltiplas páginas;
- lentidão, latência variável e respostas fora de ordem;
- timeout, falhas de conexão e respostas HTTP 4xx/5xx;
- falha ao consultar ranking ou histórico;
- timeout depois de registrar uma partida, com recuperação sem duplicação;
- indisponibilidade no encerramento da partida e registro após recuperação.

Inclua uma forma de selecionar os cenários e restaurar o estado inicial. Controle aleatoriedade e latência nos testes. Os mocks devem funcionar no build publicado. Use persistência local para manter os registros confirmados e os envios pendentes após refresh.

## 7. Interface, assets e acessibilidade

Os arquivos estão disponíveis em [assets/](assets/): navios, partes de navios, projéteis, efeitos, tiles, sprites de HUD e menus, spritesheets e imagens de referência. Os atlas de interface estão em [ui_sheet.json](assets/spritesheet/ui_sheet.json) e [ui_sheet_retina.json](assets/spritesheet/ui_sheet_retina.json), com recortes, alinhamento e caminhos dos PNGs individuais. Os campos `ui` contêm metadados complementares; suas medidas e as bordas usam unidades lógicas (1×), relativas ao canto superior esquerdo do sprite. Os efeitos sonoros e loops de ambiente estão em [assets/sounds/](assets/sounds/), no formato WAV.

Utilize os assets fornecidos como base visual. Conversão de atlas, otimização de imagens e recursos complementares são permitidos; inclua as fontes e licenças correspondentes na entrega.

A interface e o jogo devem funcionar em desktop e mobile, com controles de toque utilizáveis e sem cortes na arena ou no HUD. Defina a orientação suportada no mobile e adapte o layout à mudança de tamanho sem alterar as regras da partida.

O carregamento dos assets da partida deve ter progresso ou estado de carregamento visível.

Garanta navegação por teclado nos menus, foco visível, controle de foco em diálogos, labels, contraste adequado e mensagens de erro acessíveis. Disponibilize pontuação, tempo e estado da partida também em uma interface semântica; evite anúncios a cada frame. As teclas do jogo só devem ser capturadas enquanto o contexto de gameplay estiver ativo.

## 8. Testes com Playwright

Entregue testes E2E cobrindo:

1. Navegação, validação e persistência das opções.
2. Carregamento dos assets, falhas e nova tentativa.
3. Início de partida, movimento, rotação, limites da arena e colisão com ilhas.
4. Disparos frontal e lateral, dano, cooldown e pontuação sem duplicação.
5. Comportamentos de Chaser e Shooter e intervalo de spawn.
6. Encerramento por tempo e por morte, interrupção da simulação e reinício limpo.
7. Pausa, perda de foco e retomada sem avanço indevido do cronômetro.
8. Exibição do resultado e sua persistência após refresh.
9. Abandono da partida, navegação repetida entre telas e controles de toque.
10. Consulta e paginação das abas Ranking e Match History, incluindo carregamento, vazio e erro.
11. Registro da partida, atualização das duas abas e recuperação de envio pendente após refresh.
12. Reenvio após timeout sem duplicação e respostas atrasadas sem sobrescrever dados recentes.

Execute os fluxos principais em Chromium, em desktop e mobile. Inclua regressão visual do menu, da arena em um estado estável e da tela de resultado, com baselines versionadas.

Use cenários com seed e controle do tempo da simulação para tornar os testes reproduzíveis. A instrumentação de teste pode observar o estado e controlar o relógio, preservando a execução real das regras, inputs, colisões e renderização. Os testes de combate devem acionar controles do jogo e verificar seus efeitos.

Cada teste deve partir de um estado isolado. Entregue relatório HTML e traces das falhas.

## 9. Performance do jogo

Avalie a performance do combate em build otimizado, com **60 FPS como alvo** no ambiente de referência documentado. Registre taxa de quadros, percentil 95 do tempo entre frames e quantidade de entidades em uma partida de três minutos.

Verifique o uso de memória após cinco ciclos de iniciar, jogar e sair, investigando crescimento contínuo de recursos. Entregue evidências de profiling com hardware, navegador, resolução, configuração da partida e limitações observadas.

## 10. Critérios de avaliação

| Critério | Pontos |
| --- | ---: |
| Gameplay, regras, colisões e comportamento dos inimigos | 35 |
| PixiJS, arquitetura e ciclo de vida dos recursos | 20 |
| Interface, feedback, responsividade e acessibilidade | 15 |
| TanStack Query, Axios e consistência do ranking e histórico | 10 |
| MSW e cenários de falha | 5 |
| Testes com Playwright | 10 |
| Performance e documentação | 5 |
| **Total** | **100** |

Serão considerados o funcionamento completo da partida, a clareza das responsabilidades, a qualidade do código e a execução reproduzível. O console deve permanecer sem erros não tratados durante os fluxos previstos.

## 11. Entrega

Entregue o repositório com código-fonte, lockfile, assets, mocks, fixtures e testes.

O **deploy é obrigatório**. Envie uma URL pública e funcional do jogo. Recomenda-se [Vercel](https://vercel.com/); [Netlify](https://www.netlify.com/) e [Cloudflare Pages](https://pages.cloudflare.com/) também são aceitos.

A versão publicada deve corresponder ao código entregue, permanecer funcional e acessível durante a avaliação e executar os mocks de ranking e histórico. O jogo deve funcionar ao abrir ou recarregar a URL publicada.

O `README.md` da solução deve incluir setup, variáveis de ambiente, controles, configuração de gameplay, seleção e reset dos cenários de rede, comandos e instruções para reproduzir falhas. Disponibilize comandos para desenvolvimento, build, preview, lint, verificação de tipos e Playwright.

Documente em `ARCHITECTURE.md` a integração React/PixiJS, o ciclo da simulação, colisões, gerenciamento de recursos, persistência local e integração do ranking e histórico, incluindo contratos, cache e recuperação de registros pendentes. Registre limitações e decisões de balanceamento.

Inclua os relatórios de testes e profiling. A solução deve executar a partir de um checkout limpo, sem depender de serviços privados.
### Build para hospedagem estática

Execute `npm ci`, `npm run atlas:build`, `npm run typecheck` e `npm run build`. O arquivo `artifacts/pirate-battle-cloud.zip` contém o conteúdo completo de `dist/` para upload estático, incluindo o service worker do MSW e os assets do jogo. Consulte [DEPLOYMENT.md](DEPLOYMENT.md) para o procedimento e [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) para as licenças e proveniência conhecidas. Demo publicada e validada: [https://nucleusdigital.online:5173/](https://nucleusdigital.online:5173/).
