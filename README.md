# Confoederatio Dataview

<img src = "https://i.postimg.cc/J4RnLc9Y/81-dataview-1820-ottoman.jpg" width = "100%">
<div align = "center">Confoederatio Dataview with GDP (PPP) and 3D Elevation enabled, 1820AD.</div>
<br>

<img src = "https://i.postimg.cc/3ND2B1zL/crd-coat-of-arms-logo.png" height = "64"/> <img src = "https://i.postimg.cc/HxNQXRvc/ctd-coat-of-arms-logo.png" height = "64"/>

[![Join our community (Element Matrix)!](https://img.shields.io/badge/chat-on%20matrix-51bb9c?style=for-the-badge)](https://matrix.to/#/#confoederatio:matrix.confoederatio.org) [![Join our community (Discord)!](https://img.shields.io/discord/548994743925997570?label=Discord&style=for-the-badge)](https://discord.gg/89kQY2KFQz) ![](https://img.shields.io/github/languages/code-size/Confoederatio/Naissance?style=for-the-badge)

> [!NOTE]
> **Confoederatio Dataview** can be visited via https://dataview.confoederatio.org/.

## Abstract.

Dataview is the main repository for online data portals and visualisers at Confoederatio. Although open-source, code here is directly deployed and so may change frequently with new updates, without explicit versioning. By default, ports are bound to https://localhost:15000. In addition to installing [Node.js](https://nodejs.org/en/download), you will also have to change individual filepaths to point at core rasters in `common/layers/filepath_defines.json5`. 

Links to fetching the latest raster and vector datasets (as well as information on how to edit datasets) can be found over at [Collation](https://github.com/ConfoederatioVF/Collation).

## AI Policy/Contributing.

As a form of auto-complete, we believe AI works best when the user can't see it. Anything facing the end client should be human written and configured.

Agents are inherently misaligned, as vendors have a tendency to fuzz requests using magic numbers, incomplete execution, and heuristics to save on cost. Contributing programmers are responsible for both steering them and reading the code they propose to ensure they follow overarching architectural decisions and contract guidelines. Guidelines are to be placed in the `./agents/` folder.

## Technical Notes.

For the purposes of rapid iteration, Confoederatio Dataview utilises a Deck.gl + Echarts stack. The frontend is what you would expect: React, shadcn/ui, and Tailwind CSS. The backend is primarily Node.js/C, since it is determined by file I/O and raster calculation speeds.

## Roadmap.

We tend not to post roadmaps on Git repositories in order to centralise them and remain agile. More information can be found over the CRD channel: [CRD Element](https://matrix.to/#/!bpzKRyzInDZbyDhiKq:matrix.confoederatio.org?via=matrix.confoederatio.org) | [CRD Discord](https://discord.gg/ksD66WhjU9). CTD is in charge of developer operations and technical systems for Dataview.

We are currently working on long-term arrangements to merge Dataview with [Naissance](https://github.com/ConfoederatioVF/Naissance) to provide a more open, crowd-sourced model, particularly for borders and point-based information (i.e. cities). Live datafeeds (<ins>Livemap</ins>) will also be integrated into Dataview over time.
