# Buzun Create — Editor viário local (protótipo)

## Acesso
Clique no botão **⚙ Admin** no topo. Usuário de demonstração: `admin`. Senha de demonstração: `7334`.

**Importante:** o projeto usa GitHub Pages estático. A verificação de credenciais fica no JavaScript público, portanto **não é uma autenticação segura nem controla acesso real aos arquivos**. Não usar esse login para dados privados, cobrança ou escrita em servidor.

## Mapa e ferramentas
- Planta vetorial de cima das ruas OSM, com norte para cima. Zoom por roda do mouse ou +/−; arrastar no modo **Navegar**.
- **Selecionar:** clique próximo de qualquer via para identificar nome, ID, classe e largura.
- **Editar pontos:** aproxime o zoom e arraste um vértice amarelo. Nós compartilhados entre duas vias recebem a mesma posição, preservando a conectividade OSM entre elas.
- **Medidas:** edite largura do asfalto (2–45 m) e calçada por lado (0,6–5 m) e clique em **Salvar medidas**. Não modifica `width` do OSM original.
- **Desfazer / reverter rua / limpar:** reversão de correções.
- **Exportar JSON / Importar JSON:** salvar e transferir os ajustes entre computadores.
- **Aplicar no jogo:** recarrega o Buzun, que reconstrói ruas, calçadas, terreno e minimapa com as correções locais.

## Arquitetura
- `src/road-editor-model.js`: patch local sparse de larguras por `way.id` e vértices por `nodeId` compartilhado. Arquivo versionado `{version:1,widths:{},nodes:{},localNodes:{}}`.
- `src/road-admin.js`: mapa 2D desenhado sobre as coordenadas 1:1 do jogo, seleção, arrastar pontos, pan, zoom, importação e histórico.
- `src/main.js`: mantém `sourceRoads` original imutável e passa o resultado de `applyRoadEdits` ao worldgen.
- Persistência: `localStorage`, key `buzun-world-editor-v1`. Sem gravação em GitHub e sem alteração OSM.

## Limitações desta entrega
É um **primeiro editor viário**: não cria ruas novas, não implementa desenho de rotatórias, não calcula relações avançadas de tráfego nem sincroniza alterações entre navegadores. Movimentos de nós podem provocar auto-interseções — editar com moderação e usar Desfazer. O topo é um mapa 2D ortográfico, não uma câmera aérea sobre os modelos Three.js.

## Validação
1. Aguardar carregar o mapa e entrar no editor; o login errado deve ser rejeitado.
2. Clicar numa via e mudar largura/calçada; usar Aplicar no jogo e conferir o resultado.
3. Mover um vértice compartilhado; conferir ambas as vias conectadas e o minimapa após recarga.
4. Exportar arquivo, limpar alterações, importar e aplicar novamente.
5. Reabrir editor e verificar persistência; testar no Chrome e no celular.
