# Audit technique — LightCutVidz

| | |
|---|---|
| **Date** | 21 octobre 2026 |
| **Révision auditée** | `a98de64` (branche `main`, version `1.0.1`) |
| **Périmètre** | 100 % des fichiers suivis par git (126 fichiers) : process main Electron, preload, renderer React, scripts d'installation, workflows CI/CD, site vitrine, configuration de build et de tests |
| **Environnement de vérification** | Linux x86_64 (Ubuntu 26.04), 8 threads, Node 20.20.2, Electron 41.8.0, ffmpeg 7.0.2 statique (`ffmpeg-static` 5.3.0) |

## État des corrections

*Mise à jour après les correctifs.* Légende : ✅ corrigé et testé · 🟡 corrigé en partie (la limite est indiquée) · ⛔ non corrigé (la raison est indiquée).

**Vérifications après correction** (Node 20.20, Linux) : ESLint 0 erreur / 0 avertissement ; `tsc` propre sur le renderer **et** sur le main/preload ; **1124 tests au vert** (contre 750), dont des tests d'intégration contre le **vrai ffmpeg** et la vérification de la géométrie de perspective sur des rendus réels ; `npm run test:e2e` : **21/21** contrôles sur l'application réelle (Electron 41.10.7 sous `xvfb`, vrai preload, vrai protocole, seek, CSP, navigation bloquée, export complet) ; `npm audit --omit=dev` : **0 vulnérabilité** (35 au total avant, 7 modérées dev-only maintenant) ; le paquet Linux se construit, démarre, et ne contient plus les tests.

| ID | État | Ce qui a été fait / la limite |
|---|---|---|
| BUG-01 | ✅ | `lib/mediaProtocol.js` : vrais `206` + `Content-Range`. Vérifié en vrai : la vidéo est seekable sur toute sa durée |
| BUG-02 | ✅ | Recadrage appliqué **en premier** dans la chaîne ; overlays calculés sur la boîte de mise en page (insensible à la rotation) ; la vidéo s'affiche sans transformation pendant le recadrage |
| BUG-03 | ✅ | Temps des sous-titres divisés par la vitesse ; vérifié image par image |
| BUG-04 | ✅ | `BorderStyle=4`. Vérifié avec le libass **Linux** ; à confirmer avec le ffmpeg macOS (job CI macOS ajouté, informatif) |
| BUG-05 | ✅ | Format passé au dialogue (un seul filtre), extension ajoutée si absente, muxer forcé (`-f`), confirmation avant d'écraser un fichier renommé |
| BUG-06 | ✅ | `will-navigate` bloqué, `setWindowOpenHandler` refuse, drop global (ouvre la vidéo ou affiche un message) |
| BUG-07 | ✅ | Bouton désactivé + message ; le main rejette aussi une liste vide |
| BUG-08 | ✅ | Progression calculée sur la durée de sortie, monotone, répartie sur les deux passes |
| BUG-09 | ✅ | État Annuler/Rétablir mémorisé dans le main et réappliqué après chaque reconstruction du menu |
| BUG-10 | ✅ | Ouvrir le panneau n'enregistre plus de recadrage |
| BUG-11 | ✅ | `useVideoRect` (ResizeObserver sur la vidéo et son parent) pour recadrage, cadre, sous-titres et grille ; la grille épouse l'image |
| BUG-12 | ✅ | Le recadrage stocké est l'unique source de vérité : Annuler le déplace |
| BUG-13 | ✅ | Identifiant de chargement (le plus récent gagne), preview précédent tué et supprimé, désabonnement ciblé, bouton Annuler |
| BUG-14 | ✅ | Plus de validation si le champ n'a pas été modifié ; Entrée ne valide plus deux fois |
| BUG-15 | ✅ | Fusion après saisie clavier |
| BUG-16 | ✅ | Durée affichée = parties conservées ÷ vitesse |
| BUG-17 | ✅ | Relance depuis le début dès le premier clic |
| BUG-18 | ✅ | Le listener global ne fait plus que journaliser |
| BUG-19 | ✅ | Nom de filtre traduit ; badge géométrie tient compte du redressement |
| BUG-20 | ✅ | Drapeau d'annulation local, `removeAttribute('src')`, recadrage de l'aspect (plus de déformation) |
| BUG-21 | ✅ | `key` sur le toast + minuteurs nettoyés |
| BUG-22 | ✅ | Rôles `cut/copy/paste/selectAll` sur macOS ; dans un champ texte, Annuler/Rétablir du menu agissent sur le champ (`execCommand`) et non sur la timeline. Non testé sur Mac |
| SEC-01 | ✅ | Liste blanche (bundle de l'app + vidéos ouvertes + preview) et CSP stricte ; `bypassCSP` retiré. Vérifié en vrai : `/etc/hostname` → 403 |
| SEC-02 | ✅ | Electron 41.10.7, electron-updater 6.8.9, electron-builder 26.18, `fluent-ffmpeg` et `ffprobe` retirés, `overrides` pour `brace-expansion`. Reste **7 avis modérés dev-only** (`sprintf-js` via `electron-builder`, sans correctif publié) : rien n'est livré dans l'application |
| SEC-03 | ✅ | `SHA256SUMS` **obligatoire** pour l'updater, plus une **attestation de provenance** signée (`actions/attest-build-provenance`, vérifiable avec `gh attestation verify`) qui ne vit pas à côté des fichiers. Notarisation macOS activée dès que les identifiants Apple sont fournis |
| SEC-04 | ✅ | `execFile` sans shell, arguments positionnels pour le script macOS, tag et nom d'asset validés |
| SEC-05 | ✅ | `mkdtemp` (0700) pour chaque export et chaque mise à jour, `flags: 'wx'` |
| SEC-06 | ✅ | Voir BUG-06 |
| SEC-07 | ✅ | Validation stricte des options, entrées/sorties limitées aux fichiers choisis par dialogue, origine de l'appelant IPC vérifiée, canal `probe` supprimé |
| SEC-08 | ✅ | `THIRD_PARTY_NOTICES.md` (livré dans le paquet) avec **offre écrite de sources**, mention dans « À propos » et le README |
| SEC-09 | ✅ | `allow-dyld-environment-variables` retiré ; notarisation (`-c.mac.notarize`) lancée quand un certificat et `APPLE_ID` existent. Non testé sur Mac |
| SEC-10 | ✅ | Double échappement du chemin dans le filtre (testé avec espace, apostrophe, virgule, crochets) ; plus de liste de concaténation |
| FUN-01 | ✅ | Toasts : vidéo illisible, fichier non vidéo (jugé sur l'extension), SRT vide ou illisible |
| FUN-02 | ✅ | `ffmpeg:cancel` (export et preview), bouton « Arrêter l'export » / « Annuler » au chargement, processus tués et fichiers nettoyés à la fermeture |
| FUN-03 | ✅ | Perspective rendue avec **la même homographie que l'export**, vérifiée contre des rendus ffmpeg réels (écart < 1,5 px) ; « Froid », « Chaud », « Ancien » avec les gains **mesurés** sur ffmpeg ; « Poster » (4 niveaux identiques) ; « Vignette » par superposition ; flou proportionnel à la taille ; sous-titres placés sur l'image **recadrée**, contour à l'échelle réelle. Limite : l'aperçu ne rogne pas ce qui dépasse du cadre (perspective forte) |
| FUN-04 | ✅ | Balises `<i>`, `<b>`, `<font>`, `{\an8}` retirées ; décodage UTF-8 / UTF-16 / Windows-1252 |
| FUN-05 | ✅ | Chemin du bundle déduit, copie **avant** suppression, détection `.deb` via `dpkg-query`, et pour les autres installations Linux : message + ouverture de la page de téléchargement |
| FUN-06 | ✅ | Espace/K, ←/→ (±1 s, Maj ±5 s), J/L, `,`/`.` image par image, Suppr, anneau de focus, messages sélectionnables |
| FUN-07 | ✅ | Pas d'étape si rien ne change, curseurs/couleurs des sous-titres en un seul pas, `pointercancel` géré |
| FUN-08 | ✅ | Saut des coupes et horloge des sous-titres à l'image (`requestAnimationFrame`) |
| FUN-09 | ✅ | Confirmation avant d'ouvrir une autre vidéo **et à la fermeture** avec des modifications (contournée pour le redémarrage de mise à jour) ; **projets** `.lcvproj` : Enregistrer (`Ctrl/Cmd+S`) / Ouvrir (`Ctrl/Cmd+Maj+O`), fichier validé à la lecture |
| FUN-10 | ✅ | Chaînes du main traduites, raccourcis adaptés à macOS, langue du système à la première ouverture, polices proposées limitées à celles qui existent partout |
| FUN-11 | ✅ | Ligne de commande, `open-file`, instance unique, types MIME Linux, associations macOS (macOS non testé) |
| FUN-12 | ✅ | Vérification 5 s après le démarrage ; message explicite en mode dev depuis le menu |
| FUN-13 | ✅ | Liste de polices réduite aux familles portables, événements < 10 ms écartés, animations d'entrée **non rejouées** après une coupe, répliques qui se chevauchent toutes affichées |
| FUN-14 | ✅ | Règle lisible quelle que soit la durée, zone visible pendant le tracé, coupes étroites déplaçables |
| FUN-15 | ✅ | Export en un seul passage : plus de jonctions AAC |
| PERF-01 | ✅ | Lecture directe du H.264/AAC (0 s) ; sinon VP9 avec `-row-mt`. **Pas de plafond 720p** : les coordonnées de recadrage sont celles de la preview |
| PERF-02 | ✅ | Un seul `filter_complex`, encodage direct au format cible, VP9 avec `-row-mt 1 -cpu-used 4` |
| PERF-03 | ✅ | 1 commande ffmpeg par export au lieu de N+2, plus aucun processus ffprobe : le progrès vient de `-progress pipe:1` et les infos de flux de `ffmpeg -i` |
| PERF-04 | ✅ | Image de référence réduite à 320 px |
| PERF-05 | ✅ | Les vignettes ne se régénèrent que si leur nombre change |
| PERF-06 | ✅ | `load()` redondant retiré |
| PERF-07 | ✅ | Tests exclus de l'asar et **ffprobe supprimé** : 77 Mo dépaquetés au lieu de ~157 Mo |
| PERF-08 | ✅ | Les E/S du main sont asynchrones ; ne restent synchrones que celles qui doivent l'être (arrêt de l'app, `showMessageBoxSync` de la fermeture, détection `dpkg` au démarrage) |
| PERF-09 | ✅ | Historique borné à 200 étapes |
| QUAL-01 | ✅ | `fluent-ffmpeg` (déprécié) retiré : `lib/ffmpeg.js` lance ffmpeg via `spawn` avec des tableaux d'arguments, gère progression, annulation et erreurs ; testé sur le vrai binaire |
| QUAL-02 | ✅ | Modules partagés `src/shared/filters.json` et `constants.json` (filtres, palette, extensions) importés par le main et le renderer ; un test de parité garde le découpage des sous-titres |
| QUAL-03 | ✅ | Types IPC alignés et `tsconfig.main.json` (`checkJs`) : le main et le preload sont maintenant vérifiés dans `npm run typecheck` — ce qui a révélé un vrai bug (événement `before-quit-for-update` mal branché) |
| QUAL-04 | ✅ | `removeListener(channel, handler)` |
| QUAL-05 | ✅ | Effet de bord de `captureFrame` sorti de l'updater, double `useT` supprimé, `probeVideo`, `setLang` et `update_no_config_msg` supprimés, rejets par `Error` |
| QUAL-06 | ✅ | `mkdtemp` |
| QUAL-07 | ✅ | `eslint.config.mjs` |
| TEST-01 | ✅ | `ffmpeg.integration.test.js` (30 tests, vrai ffmpeg) + `e2e/smoke.js` (21 contrôles, vrai Electron), tous deux en CI |
| TEST-02 | ✅ | Test remplacé : 206, `Content-Range`, 403, CSP |
| TEST-03 | ✅ | `isolate: false` et le thread unique supprimés : chaque fichier de test a son registre de modules (1124 tests verts) |
| TEST-04 | ✅ | Bruit jsdom supprimé ; job macOS ajouté (informatif tant qu'il n'a pas été vu au vert) |
| CI-01 | ✅ | Node 22 partout, `engines` ajouté |
| CI-02 | ✅ | Job `verify` avant la release ; `npm pkg set version` à la place de `npm version … \|\| true` |
| CI-03 | ✅ | `SHA256SUMS` + attestation de provenance publiés ; notarisation macOS quand les identifiants sont fournis |
| CI-04 | ✅ | Actions **épinglées par SHA**, Dependabot (actions + npm), secrets par `env:`, permissions minimales par job |
| CI-05 | ✅ | Architecture vérifiée, somme vérifiée si publiée (avertissement sinon, pour rester compatible avec les anciennes releases), libfuse2 signalée, dossier temporaire nettoyé |
| CI-06 | ✅ | `ELECTRON_SKIP_BINARY_DOWNLOAD` sauf pour le job e2e |
| CI-07 | ✅ | README aligné sur le workflow |
| DOC-01 | ✅ | URLs `releases/latest/download/…` (HTTP 200 vérifié) |
| DOC-02 | ✅ | Chaque ligne du tableau corrigée |

**À savoir avant de publier.** (1) Aucune modification n'a pu être testée sur **macOS** (mise à jour, associations de fichiers, entitlements, notarisation, libass). (2) Le nouvel updater exige `SHA256SUMS` : il ne fonctionnera qu'à partir d'une release produite par le workflow modifié ; les installations existantes (≤ 1.0.1) gardent leur ancien updater. (3) `HOMEBREW_TAP_SSH_KEY` reste requis pour la mise à jour du tap.

---

## Méthode

1. Lecture intégrale du code source, des configurations, des workflows et des scripts shell.
2. Exécution des outils du projet : `npm ci`, `npm run lint`, `npm run typecheck`, `npm test`, `vitest --coverage` et `npm audit`.
3. Reproduction empirique des bugs suspectés, sur les vrais binaires et non sur des mocks :
   - **ffmpeg embarqué** : chaînes de filtres exactement telles que l'app les construit, rendu `.ass` produit par `buildAssContent()`, mesures de temps d'encodage.
   - **Electron 41.8.0 sous `xvfb`** : handler `lcv-file://` recopié à l'identique de `src/main/index.js`, avec le module `localProtocol.js` du projet.

Chaque constat porte un statut :

- ✅ **Vérifié** : reproduit par exécution ; la preuve figure dans le constat ou en annexe.
- 🔍 **Analyse statique** : déduit de la lecture du code, avec la ligne fautive citée.

Échelle de sévérité : **Critique** (fonctionnalité centrale cassée), **Haute**, **Moyenne**, **Basse**, **Info**.

**Limites.** Rien n'a été testé sur macOS : le binaire ffmpeg, la version de libass et le comportement Electron peuvent y différer. L'app packagée complète n'a pas été lancée ; seuls ses composants l'ont été, isolément.

---

## Synthèse

### État général

| Contrôle | Résultat |
|---|---|
| ESLint | ✅ 0 erreur (un avertissement Node `MODULE_TYPELESS_PACKAGE_JSON`) |
| TypeScript (`tsc --noEmit`) | ✅ 0 erreur (renderer uniquement : main et preload ne sont pas typés) |
| Tests | ✅ 750/750 au vert, 40 fichiers |
| Couverture | 96 % des instructions, 98,9 % des lignes, 85 % des branches |
| `npm audit` (total) | ❌ 35 vulnérabilités : 3 critiques, 23 hautes, 8 modérées, 1 basse |
| `npm audit --omit=dev` (livré) | ❌ 3 hautes (`electron-updater` / `builder-util-runtime`, `js-yaml`), auxquelles s'ajoutent celles d'**Electron 41.8.0**, qui est le runtime embarqué |

La couverture élevée donne une fausse impression de sécurité. **ffmpeg et Electron sont entièrement mockés** : aucun des deux bugs critiques ci-dessous ne peut être détecté par la suite actuelle (voir TEST-01).

### Les 12 problèmes à traiter en priorité

| ID | Sévérité | Problème | Statut |
|---|---|---|---|
| BUG-01 | **Critique** | La vidéo n'est pas seekable : timeline, barre de lecture, saut des coupes et filmstrip retombent à 0 s | ✅ |
| BUG-02 | **Critique** | Rotation 90°/270° + recadrage → l'export échoue ; redressement + recadrage → mauvaise zone exportée | ✅ |
| BUG-03 | Haute | Sous-titres désynchronisés dès que la vitesse ≠ 1× | 🔍 |
| BUG-04 | Haute | Couleur et opacité du fond des sous-titres ignorées à l'export (le fond prend la couleur du contour) | ✅ |
| BUG-05 | Haute | Format choisi et extension tapée non réconciliés → export en échec | ✅ |
| BUG-06 | Haute | Déposer un fichier sur l'éditeur fait naviguer la fenêtre → perte de tout le travail | 🔍 |
| SEC-01 | Haute | Le renderer peut lire **n'importe quel fichier du disque** via `lcv-file://` | ✅ |
| SEC-02 | Haute | Electron 41.8.0 et electron-updater livrés avec des vulnérabilités publiées | ✅ |
| PERF-01 | Haute | Transcodage VP9 intégral à chaque ouverture, inutile pour le H.264 (lu nativement par Electron) | ✅ |
| PERF-02 | Haute | Export WebM 5× trop lent (VP9 sans multithreading) et double encodage systématique | ✅ |
| TEST-01 | Haute | Tests 100 % mockés : aucun test d'intégration ffmpeg ni Electron | ✅ |
| DOC-01 | Haute | Commandes d'installation manuelle du site public cassées | ✅ |

### Points positifs

- **Configuration Electron saine.** `contextIsolation: true` et `nodeIntegration: false`, sandbox actif par défaut. `webSecurity` est conservé grâce au schéma dédié plutôt qu'à `file://`.
- **Pas de filtre ffmpeg arbitraire.** Le main traduit l'identifiant de filtre via sa propre liste blanche (`src/main/filters.js`) : le renderer ne fournit jamais la chaîne ffmpeg.
- **Export robuste sur plusieurs points.** Les fichiers temporaires sont nettoyés dans un `finally`, même en cas d'échec. Le garde « dimensions paires » et `-pix_fmt yuv420p` évitent le piège du profil `yuv444p`.
- **Historique bien conçu.** Les gestes continus sont regroupés en une seule étape (sauf exceptions, voir FUN-07).
- **i18n en place** côté renderer, avec deux langues complètes.
- **CI propre dans l'ensemble.** Lint, typecheck, tests et build y tournent. Le workflow Homebrew audite et installe le cask avant de le publier.

---

## 1. Bugs fonctionnels

### BUG-01 — Critique ✅ — La vidéo n'est pas seekable via `lcv-file://`

**Où.** `src/main/index.js:98-105`

```js
protocol.handle(LOCAL_SCHEME, async (request) => {
  return await net.fetch(pathToFileURL(localUrlToPath(request.url)).toString())
})
```

**Cause.** L'élément `<video>` envoie des requêtes `Range: bytes=…`. Le handler ne transmet aucun en-tête à `net.fetch`. Et même quand on lui transmet `Range`, `net.fetch('file://…')` répond **200** sans `Content-Range` ni `Accept-Ranges`. Chromium en déduit que la ressource n'est pas seekable.

**Preuve** (Electron 41.8.0, voir annexe A.1) :

| Source servie | `seekable` | Seek vers 90 % de la durée → `currentTime` |
|---|---|---|
| `file://` (référence) | `[0, 60]` | 54 s ✅ |
| `lcv-file://`, handler de l'app | `[0, 0]` | **0 s ❌** |
| `lcv-file://`, Range transmis à `net.fetch` | `[0, 0]` | **0 s ❌** |
| `lcv-file://`, handler qui répond 206 (correctif ci-dessous) | `[0, 60]` | 54 s ✅ |

Le résultat est le même pour le WebM de preview généré comme dans l'app et pour un MP4. Une requête `Range: bytes=0-99` renvoie **les 225 Mo complets** du fichier.

**Conséquences pour l'utilisateur :**

- Clic ou glisser sur la timeline et sur la barre de lecture : retour à 0 s.
- Saut des zones coupées pendant la lecture (`App.tsx:247`, `video.currentTime = cut.end`) : retour à 0, donc **lecture en boucle** jusqu'à la première coupe.
- Filmstrip (`FilmStrip.tsx:45`) : toutes les vignettes montrent la même image.
- Boutons « Aller à » de l'éditeur de coupe : sans effet.

Le test `src/main/__tests__/index.test.js:203-215` verrouille ce comportement : il exige que les en-têtes ne soient pas transmis (voir TEST-02).

**Correctif (validé empiriquement).** Servir les médias en gérant soi-même les plages d'octets, et garder `net.fetch` pour les assets de l'app :

```js
const { Readable } = require('stream')
const MEDIA_TYPES = { '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm', '.mkv': 'video/x-matroska' }

protocol.handle(LOCAL_SCHEME, async (request) => {
  const filePath = localUrlToPath(request.url)
  // + contrôle de liste blanche, cf. SEC-01
  const type = MEDIA_TYPES[path.extname(filePath).toLowerCase()]
  if (!type) return net.fetch(pathToFileURL(filePath).toString()) // HTML/JS/CSS de l'app
  let size
  try { ({ size } = await fs.promises.stat(filePath)) } catch { return new Response('Not found', { status: 404 }) }
  const m = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get('range') || '')
  if (!m) {
    return new Response(Readable.toWeb(fs.createReadStream(filePath)), {
      headers: { 'Content-Type': type, 'Content-Length': String(size), 'Accept-Ranges': 'bytes' },
    })
  }
  const start = m[1] === '' ? Math.max(0, size - Number(m[2])) : Number(m[1])
  const end = m[1] !== '' && m[2] !== '' ? Math.min(Number(m[2]), size - 1) : size - 1
  if (start > end) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } })
  return new Response(Readable.toWeb(fs.createReadStream(filePath, { start, end })), {
    status: 206,
    headers: {
      'Content-Type': type, 'Accept-Ranges': 'bytes',
      'Content-Length': String(end - start + 1), 'Content-Range': `bytes ${start}-${end}/${size}`,
    },
  })
})
```

---

### BUG-02 — Critique ✅ — Recadrage combiné à une rotation : export en échec ou mauvaise zone

**Où.**

- `src/main/lib/videoFilters.js:52-61` : la chaîne applique la rotation, **puis** le recadrage.
- `src/renderer/src/components/CropOverlay.tsx:41-60` : le recadrage est calculé dans le repère **non tourné** (`videoWidth × videoHeight`).
- `CropOverlay.tsx:53-60` : un recadrage plein cadre est créé **dès l'ouverture** du panneau.

**Scénario 1 — échec.** Vidéo 1920×1080, rotation 90°, puis clic sur « Recadrer ». Le recadrage `1920×1080` est créé automatiquement, puis appliqué après `transpose=1` sur une image 1080×1920 :

```
[Parsed_crop_1] Invalid too big or non positive size for width '1920' or height '1080'
exit=234
```

**Scénario 2 — résultat faux sans erreur.** Redressement de 10° + recadrage. `rotate=…:ow=rotw():oh=roth()` agrandit le canevas (environ 2078×1397 px). Le recadrage `1920×1080:0:0` découpe alors le **coin haut-gauche** de ce canevas agrandi : coins noirs en haut à gauche, bas-droite de l'image perdu. Ce n'est pas ce que montrait l'aperçu.

S'y ajoute l'aperçu lui-même. `CropOverlay` et `CropFrame` calculent l'échelle avec `video.getBoundingClientRect()`. Sur un élément transformé en CSS (`rotateZ`, `rotateX/Y`), ce rectangle est la **boîte englobante** de la forme tournée : la mise à l'échelle est fausse dès qu'une rotation est active.

**Correctif.**

- Choisir **un seul repère** pour le recadrage. Le plus simple : recadrer **en premier** dans la chaîne ffmpeg (repère source, cohérent avec le calcul actuel de l'overlay), puis afficher l'overlay dans le même conteneur transformé que la vidéo.
- Ne plus créer de recadrage à l'ouverture du panneau, seulement au premier glisser (voir aussi BUG-10).

---

### BUG-03 — Haute 🔍 — Sous-titres désynchronisés quand la vitesse ≠ 1×

**Où.** `src/main/index.js:281`, `:302` et `:344`, ainsi que `src/main/lib/subtitles.js:159-177`.

La vidéo intermédiaire est déjà accélérée par `setpts=1/speed*PTS` (`videoFilters.js:42-45`). Mais `remapEventsToKeptSegments()` produit des temps **non divisés par la vitesse**, et la vitesse n'est jamais passée à `buildExportSubtitlesFilter()`.

**Conséquence.** En 2×, un sous-titre prévu à 10 s de la source s'affiche à 10 s de la sortie au lieu de 5 s, et dure deux fois trop longtemps. Les sous-titres de la seconde moitié n'apparaissent jamais. En 0,5×, c'est l'inverse.

**Correctif.**

```js
const remapped = remapEventsToKeptSegments(events, keptSegments)
  .map(ev => ({ ...ev, start: ev.start / speed, end: ev.end / speed }))
```

Ajouter le test correspondant (vitesse 2×, une coupe, un sous-titre qui chevauche la coupe).

---

### BUG-04 — Haute ✅ — Couleur et opacité du fond des sous-titres ignorées à l'export

**Où.** `src/main/lib/subtitles.js:201-205` et `:215`.

En ASS, `BorderStyle=3` (« opaque box ») dessine la boîte avec **`OutlineColour`**, pas avec `BackColour`. `BackColour` ne sert qu'à l'ombre de la boîte.

**Preuve.** J'ai généré un `.ass` avec la vraie fonction `buildAssContent()` : texte blanc, contour **rouge**, fond **bleu** à 100 %. Le rendu ffmpeg donne une **boîte rouge** (10 991 px rouges, 0 px bleu). Le texte perd aussi son contour. La couleur de fond et le curseur d'opacité n'ont donc aucun effet à l'export, alors que l'aperçu CSS les affiche.

**Correctif (validé avec le libass du ffmpeg Linux embarqué).** Utiliser `BorderStyle=4`, extension libass : boîte peinte en `BackColour` avec son alpha, contour du texte conservé.

```js
const borderStyle = backgroundOpacity > 0 ? 4 : 1
```

Rendu obtenu : boîte bleue à 50 % d'opacité et contour rouge présent. À vérifier avec le binaire ffmpeg macOS (libass ≥ 0.17 requis). Sinon, repli possible : deux calques `Dialogue`, un pour la boîte, un pour le texte.

---

### BUG-05 — Haute ✅ — Format choisi et extension du fichier non réconciliés

**Où.** `ExportModal.tsx:48`, `src/main/index.js:215-227` et `:352-384`.

Le format vient de la modale ; le nom de fichier vient du dialogue, qui propose **tous** les formats en filtre. ffmpeg choisit le conteneur d'après l'extension du nom. Cas reproduits :

| Cas | Résultat |
|---|---|
| Format MP4 (`-c copy`), nom tapé `video.webm` | `Only VP8 or VP9 or AV1 video … are supported for WebM` → échec |
| Nom tapé **sans extension** (fréquent avec les dialogues GTK) | `Unable to choose an output format for 'c_noext'` → échec |
| Format GIF, nom `x.mp4` | Pipeline palettegen/paletteuse envoyé dans un MP4 → échec ou fichier incohérent |

**Correctif.**

- Passer le format à `dialog:saveVideo` et restreindre `filters` à ce seul format.
- Dans le main, forcer le muxer avec `cmd.format(...)` (`mp4`, `mov`, `webm`, `avi`, `gif`), ou ajouter l'extension manquante. Attention : un fichier existant portant le nom final serait alors écrasé sans confirmation (`-y`).

---

### BUG-06 — Haute 🔍 — Un fichier déposé sur l'éditeur remplace l'application

**Où.** `src/renderer/src/components/DropZone.tsx` (seul composant qui intercepte le drop) et `src/main/index.js:53-86`.

Le drop n'est géré que sur l'écran d'accueil. Une fois une vidéo ouverte, rien n'appelle `preventDefault()` sur `dragover`/`drop`. Le main n'a ni handler `will-navigate` ni `setWindowOpenHandler`.

**Conséquence.** Comportement par défaut de Chromium : la fenêtre **navigue vers le fichier déposé**. L'interface disparaît, et toutes les modifications et l'historique, uniquement en mémoire, sont perdus.

**Correctif.**

```js
win.webContents.on('will-navigate', (e) => e.preventDefault())
win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
```

Côté renderer, ajouter des écouteurs `dragover`/`drop` globaux sur `window`. Ils peuvent aussi servir à ouvrir la vidéo déposée, après confirmation.

---

### BUG-07 — Moyenne 🔍 — Export lancé alors qu'il ne reste aucun segment

**Où.** `ExportModal.tsx:31` et `:175-181`, `src/main/index.js:252` et `:284-288`.

Si toute la vidéo est coupée, ou si la durée vaut encore 0 (métadonnées non chargées, source illisible), `segments` est vide. Le main passe alors dans la branche « concat » avec une liste vide, et ffmpeg échoue avec un message incompréhensible pour l'utilisateur.

**Correctif.** Désactiver « Exporter » quand la durée conservée est nulle, et rejeter `segments.length === 0` côté main avec un message traduit.

---

### BUG-08 — Moyenne ✅ — Barre de progression d'export fausse et non monotone

**Où.** `src/main/index.js:269-272` et `:379`, ainsi que `node_modules/fluent-ffmpeg/lib/utils.js:339-342`.

- fluent-ffmpeg calcule `percent = timemark / durée totale de l'entrée`, la durée venant d'un ffprobe du fichier source. Avec `-ss/-t`, un segment n'atteint jamais 100 % de sa part. Avec un changement de vitesse, l'écart augmente encore.
- Après les segments, `convertToFormat` renvoie des pourcentages qui **repartent de 0** : la barre recule.
- L'étape de concaténation n'émet aucune progression.

**Correctif.** Calculer la durée de sortie attendue (`Σ segments conservés / vitesse`) et lire `out_time_us` via `-progress pipe:1`, avec un seul passage ffmpeg (voir PERF-02).

---

### BUG-09 — Moyenne 🔍 — Annuler/Rétablir grisés après un changement de langue

**Où.** `src/main/lib/menu.js:50` et `:57` (`enabled: false`), `src/main/index.js:136-142`, `App.tsx:213-215`.

Changer de langue reconstruit le menu, et Annuler/Rétablir repartent à `enabled: false`. Le renderer ne renvoie l'état que lorsque `canUndo`/`canRedo` **change**, ce qui n'arrive pas ici. Les items restent donc grisés.

**Conséquence.** Les accélérateurs Ctrl/Cmd+Z et Ctrl+Y sont inopérants jusqu'à la prochaine modification : le renderer n'a pas de gestionnaire clavier de secours.

**Correctif.** Mémoriser le dernier état dans le main et le réappliquer après chaque `buildMenu()`.

---

### BUG-10 — Moyenne 🔍 — Ouvrir le panneau Recadrer applique déjà un recadrage

**Où.** `CropOverlay.tsx:53-60`

Ouvrir le panneau appelle `onChange(full)`, un `set` qui crée une entrée d'historique. Effets :

- Le récapitulatif d'export affiche un recadrage que l'utilisateur n'a jamais fait.
- Un filtre `crop` est ajouté à l'export, ce qui déclenche BUG-02 avec une rotation.
- Le bouton « Appliquer » ne fait que fermer le panneau : chaque glisser est appliqué en direct, et il n'existe aucun moyen d'annuler hormis Ctrl+Z.

---

### BUG-11 — Moyenne 🔍 — Overlays désalignés de la vidéo

**Où.** `CropFrame.tsx:29-33`, `CropOverlay.tsx:46-50`, `CompositionGrid.tsx` et `CompositionGrid.css`.

- **Panneaux latéraux.** Ils font 280 à 300 px et partagent la même rangée flex que la vidéo (`App.css` `.main-area`). En ouvrir un réduit la vidéo **sans événement `resize` de fenêtre** : le cadre rouge du recadrage et l'overlay restent à l'ancienne position. `SubtitleOverlay` utilise un `ResizeObserver` ; les deux autres non.
- **Grille des tiers.** Elle couvre tout le conteneur noir et non l'image : ses lignes ne tombent pas sur les tiers de la vidéo.
- **Rotation CSS.** Voir BUG-02 : la boîte englobante fausse les calculs.

---

### BUG-12 — Moyenne 🔍 — L'overlay de recadrage ignore Annuler/Rétablir

**Où.** `CropOverlay.tsx:24-26`

`rect` est un état local initialisé une seule fois. Un Ctrl+Z pendant que le panneau est ouvert modifie `crop` sans que l'overlay suive. Le glisser suivant repart de l'ancien rectangle et écrase l'annulation.

---

### BUG-13 — Moyenne 🔍 — Ouvrir une vidéo pendant le transcodage d'une autre

**Où.** `App.tsx:172-195`, `src/preload/index.js:9-12`, `src/main/index.js:175-199`.

Le menu Fichier → Ouvrir reste actif pendant l'écran de chargement. Si deux previews tournent en parallèle :

- `currentPreviewPath` n'est renseigné qu'à la fin d'un transcodage : le premier fichier de preview n'est jamais supprimé (fuite de plusieurs centaines de Mo dans `/tmp`).
- Le `off()` du premier chargement appelle `removeAllListeners`, ce qui supprime aussi l'écouteur de progression du second.
- Selon l'ordre de fin, `videoPath` et `videoUrl` peuvent désigner deux fichiers différents : l'export porterait alors sur une autre vidéo que celle affichée.

Les processus ffmpeg de preview ne sont jamais tués. Ni le changement de vidéo ni la fermeture de l'app ne les interrompent.

---

### BUG-14 — Basse 🔍 — Éditeur de coupe : arrondi silencieux et entrées d'historique parasites

**Où.** `CutEditor.tsx:40-43` et `:56-59`, `Timeline.tsx:157-172`.

- **Focus puis blur sans rien modifier.** `onBlur` valide la valeur affichée, arrondie au dixième (`formatTimePrecise`). La borne est **modifiée en silence** (12,3456 s devient 12,3 s) et une entrée d'historique est créée.
- **Touche Entrée.** Elle valide une première fois, puis `blur()` valide une seconde fois : deux entrées d'historique.

---

### BUG-15 — Basse 🔍 — Coupes saisies au clavier qui se chevauchent

**Où.** `Timeline.tsx:157-172`

`handleTimeInput` n'appelle pas `mergeSegments`, contrairement au glisser. Deux zones peuvent donc se superposer à l'écran et dans le compteur de coupes. L'export reste correct, car `getKeptSegments` gère le chevauchement.

---

### BUG-16 — Basse 🔍 — Durée du récapitulatif d'export fausse avec une vitesse ≠ 1

**Où.** `ExportModal.tsx:33` et `:95`

La durée affichée est `Σ segments conservés`, qui ne tient pas compte de la vitesse. La durée réelle de sortie est cette somme divisée par la vitesse.

---

### BUG-17 — Basse 🔍 — Deux clics sur Lecture pour relancer en fin de vidéo

**Où.** `App.tsx:251-267`

Quand la dernière zone conservée se termine avant une coupe finale, la lecture se met en pause à `lastKept.end`. Au clic suivant, la vidéo repart dans la coupe, saute à la fin et s'arrête (`ended`). Il faut un second clic pour revenir au début.

---

### BUG-18 — Basse ✅ — Erreurs de mise à jour affichées deux fois

**Où.** `src/main/lib/updater.js:37-46` et `:97-105`, ainsi que `node_modules/electron-updater/out/AppUpdater.js:271` et `:477`.

electron-updater émet l'événement `error` **et** rejette la promesse, aussi bien dans `checkForUpdates` que dans `downloadUpdate`. L'écouteur global et le `catch` ouvrent donc chacun un dialogue d'erreur.

---

### BUG-19 — Basse 🔍 — Libellés de la barre d'outils incorrects

**Où.** `Toolbar.tsx:53` et `:35`

- **Filtre actif.** Il est affiché par son identifiant brut capitalisé (« Upside_down », « Bright »…) au lieu de son nom traduit. L'interface française affiche donc de l'anglais.
- **Badge « géométrie active ».** Il ignore `straighten` : un redressement seul n'allume pas le badge.

---

### BUG-20 — Basse 🔍 — Défauts du FilmStrip

**Où.** `FilmStrip.tsx:15-58`

- `abortRef` est partagé entre exécutions de l'effet. Il est remis à `false` au début de la nouvelle exécution, si bien qu'un `seeked` tardif de l'ancienne vidéo peut écraser les nouvelles vignettes.
- `video.src = ''` fait charger l'URL de la page comme média (requête et erreur inutiles). Préférer `removeAttribute('src'); load()`.
- Les vignettes sont forcées en 80×45 : une vidéo verticale est déformée.

---

### BUG-21 — Basse 🔍 — Un toast remplacé ne relance pas son minuteur

**Où.** `Toast.tsx`

Le composant n'a pas de `key` : un second message remplace le premier sans relancer le minuteur, et disparaît donc trop tôt.

---

### BUG-22 — Basse 🔍 — macOS : copier, coller et annuler dans les champs texte

**Où.** `src/main/lib/menu.js:43-61`

Le menu Édition ne contient pas les rôles `cut`, `copy`, `paste` et `selectAll`. Sur macOS, Cmd+C, Cmd+V et Cmd+A ne fonctionnent donc pas dans les champs de saisie (temps de coupe). Par ailleurs, Cmd+Z est capturé par l'annulation de l'éditeur, même dans un champ texte.

---

## 2. Sécurité

### SEC-01 — Haute ✅ — Le renderer peut lire tout le système de fichiers

**Où.** `src/main/index.js:90-105` et `src/main/lib/localProtocol.js`.

Le handler `lcv-file://` sert **n'importe quel chemin**, sans restriction. Le schéma est privilégié (`bypassCSP`, `corsEnabled`, `supportFetchAPI`) et la page de l'app est servie depuis ce même schéma : tout JavaScript exécuté dans le renderer peut lire tout fichier accessible à l'utilisateur.

**Preuve.** Depuis la page, `fetch('lcv-file://local/etc/os-release')` renvoie **200** avec le contenu du fichier. Il en irait de même pour `~/.ssh/id_rsa`.

Aujourd'hui, aucun vecteur XSS n'a été identifié : React échappe le texte des SRT, et la fenêtre « À propos » échappe le HTML. Mais la moindre injection deviendrait une exfiltration complète. La page n'a **aucune CSP** (`src/renderer/index.html`), et `bypassCSP` la rendrait de toute façon inopérante pour ce schéma.

**Correctif.**

- Ajouter une liste blanche : dossier `dist/` de l'app, fichier de preview courant, fichiers ouverts via le dialogue ou le drop. À défaut, restreindre au minimum aux extensions vidéo.
- Ajouter une CSP stricte dans `index.html` et retirer `bypassCSP` s'il n'est pas nécessaire.

---

### SEC-02 — Haute ✅ — Dépendances livrées vulnérables

| Paquet (version) | Avis | Version corrigée |
|---|---|---|
| `electron` 41.8.0, runtime embarqué | 7 avis, dont 5 hauts. Notamment **« File and HTTP protocol handlers allow cross-origin reads without corsEnabled »** (GHSA-j84w-jfhq-vhvj), directement lié à l'architecture `lcv-file`. Aussi : `ProtocolResponse.url` qui réutilise le cache de session, contournements de sandbox de popups, `<webview>` | ≥ 41.10.6 |
| `electron-updater` 6.8.3 → `builder-util-runtime` | Fuite d'en-têtes d'authentification lors de redirections cross-origin (GHSA-p2f4-r6v6-j797) | `builder-util-runtime` ≥ 9.7.0 |
| `js-yaml` 4.x (lit `latest-linux.yml`) | 4 avis de DoS CPU quadratique | ≥ 4.3.2 |

---

### SEC-03 — Moyenne 🔍 — Mises à jour installées sans vérification d'intégrité

**Où.** `src/main/lib/updater.js:125-278`

Le `.zip` macOS et le `.deb` sont téléchargés puis installés sans contrôle de somme ni de signature :

- **macOS.** Le script **re-signe ad hoc** (`codesign --force --deep --sign -`) et **supprime la quarantaine** (`xattr -dr com.apple.quarantine`), ce qui contourne Gatekeeper.
- **Linux.** Le `.deb` est installé **en root** via `pkexec apt-get install -y`.

Une compromission du compte GitHub ou de la release suffirait donc à exécuter du code, en root sous Linux, chez tous les utilisateurs qui acceptent la mise à jour.

**Correctif.** Publier un `SHA256SUMS`, idéalement signé (minisign ou GPG), dans le workflow de release, et vérifier le fichier téléchargé avant installation. Sur macOS, signer et notariser l'application (voir CI-03).

---

### SEC-04 — Moyenne 🔍 — Injection de commandes shell depuis des données distantes

**Où.** `src/main/lib/updater.js:191-205` (`sh -c`) et `:269` (`exec` + `pkexec`).

`tag_name` et `asset.name`, issus de l'API GitHub, sont interpolés dans une chaîne shell entre guillemets doubles. `$(…)` y est donc évalué, et `$`, `(` et `)` sont autorisés dans un nom de tag git.

Côté `.deb`, la commande s'exécute **en root**. Le risque suppose de contrôler les releases : même modèle de menace que SEC-03.

**Correctif.**

- Utiliser `spawn('pkexec', ['apt-get', 'install', '-y', tmpPath])` plutôt qu'`exec`.
- Pour le script macOS, passer les valeurs en arguments positionnels (`sh -c '…"$1"…' sh "$stage"`).
- Valider `latest` avec `/^\d+\.\d+\.\d+$/` et `asset.name` avec `/^[\w.-]+$/`.

---

### SEC-05 — Moyenne 🔍 — Fichiers temporaires prédictibles dans un `/tmp` partagé

**Où.**

- `updater.js:253` : `/tmp/LightCutVidz-linux.deb`, ensuite installé en root.
- `updater.js:191` : `/tmp/lcv-update-<version>` sur macOS.
- `index.js:177`, `:254`, `:285`, `:289` et `subtitles` : fichiers `lc_*_${Date.now()}`.

Sur une machine multi-utilisateurs, un autre compte peut pré-créer le `.deb` (fichier world-writable) et en remplacer le contenu entre la fin du téléchargement et l'installation par `pkexec`. C'est une élévation de privilèges, atténuée si `fs.protected_regular` est actif.

**Correctif.** Utiliser `fs.mkdtemp()` (dossier en 0700) pour chaque export et chaque mise à jour, et ouvrir les fichiers avec `flags: 'wx'`.

---

### SEC-06 — Moyenne 🔍 — Aucune garde de navigation ni de fenêtres

**Où.** `src/main/index.js:53-86`

Ni `will-navigate`, ni `setWindowOpenHandler`, ni `will-attach-webview`. Voir BUG-06 pour l'impact fonctionnel. C'est aussi un point de la checklist de sécurité Electron (« limiter la navigation et la création de fenêtres »).

---

### SEC-07 — Basse 🔍 — IPC sans validation des entrées

**Où.** `src/main/index.js:155-318` et `videoFilters.js:9`.

Le main suppose un renderer fiable. Si le renderer était compromis :

- `ffmpeg:export` lit `inputPath` et écrit `outputPath` **n'importe où**.
- `rotation` et `straighten` sont interpolés **tels quels** dans le filtergraph (`rotate=${totalRotate}*PI/180`). Une chaîne permet d'injecter des filtres ffmpeg, par exemple `movie=` pour lire un fichier ou `sendcmd`.
- `ffmpeg:probe` est exposé par le preload (`preload/index.js:15`) **sans être utilisé** par le renderer : c'est de la surface d'attaque inutile.

**Correctif.**

- Valider les types avec `Number.isFinite` et des bornes.
- N'accepter que des chemins issus des dialogues (liste mémorisée côté main).
- Supprimer `probeVideo`.
- Vérifier `event.senderFrame.url`.

---

### SEC-08 — Moyenne (conformité) ✅ — ffmpeg sous GPLv3 embarqué dans une app MIT

Le binaire embarqué est compilé avec `--enable-gpl --enable-version3`, `libx264` et `libx265`. Le distribuer impose de fournir la licence GPLv3 et l'accès au code source correspondant (ou une offre écrite). Ni le dépôt ni l'app n'en font mention : le `LICENSE` est MIT et aucune notice n'existe dans « À propos ».

Les codecs H.264 et H.265 sont en outre soumis à brevets dans certains pays.

**Correctif.** Ajouter une page « Licences tierces » dans l'app et le dépôt (ffmpeg GPLv3, liens vers les sources des builds utilisés), ou passer à un build LGPL avec un encodeur adapté.

---

### SEC-09 — Basse 🔍 — Distribution macOS

**Où.** `build/entitlements.mac.plist` et `.github/workflows/release.yml:71`.

- **Entitlements trop larges.** `allow-dyld-environment-variables` permet l'injection de bibliothèques via `DYLD_INSERT_LIBRARIES` ; `allow-unsigned-executable-memory` n'est plus nécessaire avec un Electron récent.
- **Pas de garanties de distribution.** L'app est signée ad hoc et **non notarisée** : le Hardened Runtime n'apporte donc aucune garantie.

---

### SEC-10 — Basse 🔍 — Échappements fragiles dans les commandes ffmpeg

**Où.** `subtitles.js:228-234` et `index.js:287`.

- **Filtre `subtitles`.** À l'intérieur de `'…'`, une barre oblique inverse n'échappe pas une apostrophe : `\'` ferme la chaîne. Le test `subtitles.test.js:208` valide pourtant cette sortie erronée.
- **Liste de concaténation.** `file '${f}'` n'échappe pas les apostrophes (il faudrait `'\''`).

Ces chemins proviennent du dossier temporaire, et l'impact se limite à un échec d'export si `TMPDIR` contient une apostrophe.

---

## 3. Problèmes fonctionnels et ergonomie

### FUN-01 — Moyenne 🔍 — Aucune erreur n'est remontée à l'utilisateur

**Où.** `App.tsx:185-188`, `VideoPlayer.tsx:67-81`, `DropZone.tsx:26`, `SubtitlesPanel.tsx:34-40`.

- **Preview impossible.** Si le transcodage échoue, l'app se rabat sur le fichier source. S'il n'est pas lisible non plus (HEVC sous Linux, AVI, FLV), l'utilisateur obtient un **écran noir** : `<video>` n'a pas de `onError`, aucun toast, et la durée reste à 0.
- **Fichier déposé refusé en silence.** Le tri se fait sur `file.type.startsWith('video/')`. Le type MIME dépend de la plateforme et peut être vide pour MKV ou FLV : le fichier est alors ignoré sans message. Vérifier plutôt l'extension, avec la même liste que le dialogue (`VIDEO_EXTENSIONS`).
- **SRT invalide.** Un fichier qui ne donne aucune réplique est importé sans avertissement. Une erreur de lecture (droits, encodage) n'est pas interceptée : la promesse est rejetée sans gestionnaire.

---

### FUN-02 — Moyenne 🔍 — Ni l'export ni la preview ne peuvent être annulés

**Où.** `ExportModal.tsx:84` et `:174`, `src/main/index.js:175-318`.

- « Annuler » et le clic sur le fond **ferment la modale, mais l'export continue** en arrière-plan. Aucune notification n'arrive à la fin, et rien n'empêche de lancer un second export en parallèle.
- Le transcodage de preview, qui peut durer plusieurs minutes (voir PERF-01), bloque l'interface sans bouton d'annulation.
- Quitter pendant un export laisse les fichiers temporaires : le `finally` ne s'exécute pas.

**Correctif.** Garder une référence au processus ffmpeg (`command.kill('SIGKILL')`), exposer un canal `ffmpeg:cancel`, et nettoyer le dossier temporaire de l'export.

---

### FUN-03 — Moyenne 🔍 — L'aperçu ne correspond pas à l'export

| Élément | Aperçu (CSS) | Export (ffmpeg) |
|---|---|---|
| Perspective | `perspective(1000px) rotateX/Y`, qui dépend de la taille affichée | Heuristique `sin(angle) × 0,2` dans `perspective=` |
| Redressement | Rotation dans un cadre inchangé | Canevas **agrandi** (`rotw/roth`) : la définition de sortie change et des coins noirs apparaissent |
| Filtre « Froid » | `hue-rotate(180deg)`, teintes inversées (vert/violet) | `colortemperature=10000`, dominante bleue |
| « Vignette » | `brightness(1.1)` | Vrai vignettage |
| « Poster » | Contraste | `unsharp`, `eq`, `hqdn3d` (ce n'est pas un postérisé) |
| « Flou » | `blur(5px)` à l'écran | `boxblur=5` sur la pleine définition, donc bien plus faible en 4K |
| Sous-titres + recadrage | Taille et position relatives à l'image entière | Relatives à l'image **recadrée** |
| Contour des sous-titres | `-webkit-text-stroke` en pixels d'écran | `Outline` en pixels de la vidéo (PlayRes) |

---

### FUN-04 — Moyenne 🔍 — Import SRT : balises affichées et encodage forcé

**Où.** `src/renderer/src/utils/srt.ts` et `src/main/index.js:211`.

- **Balises HTML.** `<i>`, `<b>` et `<font color>`, très courantes dans les SRT, s'affichent **en clair** dans l'aperçu comme dans la vidéo exportée.
- **Encodage.** La lecture est forcée en UTF-8. Les SRT en Windows-1252 ou ISO-8859-1, très répandus pour les sous-titres français, ou en UTF-16, donnent des caractères corrompus (`�`).

**Correctif.** Retirer ou convertir les balises (`<i>` → `{\i1}`). Décoder avec `TextDecoder('utf-8', { fatal: true })` et se rabattre sur `windows-1252` en cas d'échec ; reconnaître la BOM UTF-16.

---

### FUN-05 — Moyenne 🔍 — Mise à jour : chemins et méthode d'installation supposés

**Où.** `updater.js:129` et `:197-198`, `index.js:27-28`.

- **macOS, chemin codé en dur.** `/Applications/LightCutVidz.app` est supposé. Une app installée ailleurs (`brew --appdir`, `~/Applications`) est réinstallée dans `/Applications`.
- **macOS, ordre des opérations.** `rm -rf` s'exécute **avant** `cp -R` : si la copie échoue (droits, disque plein), **l'app est supprimée**. La mise à jour contourne aussi la comptabilité de Homebrew.
- **Linux.** Tout ce qui n'est pas une AppImage est traité comme un `.deb` (`isDeb`). Sur Fedora, Arch ou un build décompressé, l'app lance `pkexec apt-get`, qui échoue.

---

### FUN-06 — Basse 🔍 — Clavier et accessibilité

- **Espace** ne lit ni ne met en pause, contrairement à ce qu'indique le README. Il active le dernier bouton qui a gardé le focus : cliquer sur « Muet » puis appuyer sur Espace coupe le son et crée une entrée d'historique.
- Aucun raccourci n'existe pour supprimer la coupe sélectionnée, avancer image par image ou naviguer en J/K/L.
- `button { outline: none }` (`global.css:40`) supprime **tout indicateur de focus** : la navigation au clavier devient impossible.
- `user-select: none` global empêche de copier un message d'erreur d'export.

---

### FUN-07 — Basse 🔍 — Historique : entrées inutiles et gestes non regroupés

- **Entrées sans changement.** `set()` (`useHistory.ts:45-48`) en crée une même si rien ne change : même vitesse, même filtre, réinitialisation d'un recadrage déjà vide.
- **Curseurs et sélecteurs de couleur des sous-titres.** Ils créent **une entrée par événement** (`SubtitlesPanel.tsx:91-137`, `set` au lieu de `setLive`), contrairement au README : « a slider scrub counts as one step ».
- **Geste non terminé.** `pointercancel` n'est géré nulle part : un geste interrompu reste ouvert, et la modification suivante d'un autre contrôle lui est rattachée.

---

### FUN-08 — Basse 🔍 — Saut des coupes et sous-titres animés trop imprécis

**Où.** `App.tsx:240-256` et `:342`.

Les zones coupées sont détectées sur `timeupdate`, environ toutes les 250 ms : l'aperçu joue jusqu'à un quart de seconde de contenu supprimé. Les sous-titres animés (mot par mot, machine à écrire, karaoké) suivent le même rythme de 4 Hz, d'où des animations saccadées et en retard.

**Correctif.** Utiliser `requestVideoFrameCallback`, ou une boucle `requestAnimationFrame` pendant la lecture.

---

### FUN-09 — Basse 🔍 — Aucune protection contre la perte de travail

Il n'existe ni sauvegarde de projet, ni demande de confirmation. Quitter, ouvrir une autre vidéo ou redémarrer pour une mise à jour efface toutes les modifications sans prévenir.

---

### FUN-10 — Basse 🔍 — Internationalisation incomplète

- **Main process.** Chaînes en dur : `'No macOS archive found in this release.'` et `'No .deb package found in this release.'` (`updater.js:153` et `:232`), noms de filtres de dialogue `'Videos'` et `'Subtitles'` (`index.js:157` et `:207`, `menu.js:33`).
- **Bulles d'aide.** Elles annoncent « Ctrl+Z » et « Ctrl+Y » même sur macOS (`messages/en.ts:73-74`).
- **Langue par défaut.** C'est toujours l'anglais, quelle que soit la locale système (`app.getLocale()` n'est pas utilisé).

---

### FUN-11 — Basse 🔍 — Impossible d'ouvrir une vidéo depuis le gestionnaire de fichiers

Ni `argv`, ni l'événement `open-file` (macOS), ni `requestSingleInstanceLock` ne sont gérés. Le `.desktop` n'a pas de `MimeType` et sa ligne `Exec` ne contient pas `%F`. « Ouvrir avec LightCutVidz » ne fonctionne donc pas.

---

### FUN-12 — Basse 🔍 — Pas de vérification automatique des mises à jour

`checkUpdates()` n'est appelé que depuis le menu. Les clés `update_no_config_msg` et `dev_mode_*` sont définies mais jamais utilisées. En mode dev, « Vérifier les mises à jour » ne fait rien, sans aucun message.

---

### FUN-13 — Basse 🔍 — Sous-titres : cas limites

- **Polices.** Calibri, Segoe UI, Futura, Century Gothic et Palatino sont proposées mais absentes de la plupart des systèmes Linux. Le navigateur et libass les remplacent par des polices différentes.
- **Arrondi au centième.** `toAssTime` arrondit au centième de seconde. En mode machine à écrire, les événements de moins de 10 ms disparaissent.
- **Coupe au milieu d'un sous-titre.** L'événement est scindé en deux, et `\fad`, `\move` et `\t` se rejouent après la coupe.
- **Répliques qui se chevauchent.** L'aperçu n'en affiche qu'une (`find`), alors que l'export les affiche toutes.

---

### FUN-14 — Basse 🔍 — Timeline : défauts d'affichage et de manipulation

- **Règle.** Au-delà de 10 min, un repère étiqueté apparaît toutes les 60 s : 180 étiquettes superposées pour une vidéo de 3 h.
- **Tracé d'une nouvelle coupe.** Aucun retour visuel pendant le glisser : la zone n'apparaît qu'au relâchement.
- **Coupes étroites.** Une coupe de moins de 16 px n'a pas de zone de déplacement : on ne peut que la redimensionner.

---

### FUN-15 — Basse 🔍 — Micro-coupures audio aux jonctions

Chaque segment est encodé en AAC séparément puis assemblé avec le démultiplexeur `concat` en copie. Le délai d'amorçage AAC (≈ 21 ms) crée de petits trous ou clics à chaque jonction, et un décalage audio/vidéo qui s'accumule avec le nombre de coupes. Le passage unique de PERF-02 règle ce problème.

---

## 4. Performance et optimisation

### PERF-01 — Haute ✅ — Transcodage VP9 complet à chaque ouverture de vidéo

**Où.** `src/main/index.js:175-199`

La justification du README (« Electron ne fournit pas les codecs H.264/AAC ») est **fausse** pour Electron 41 : `canPlayType('video/mp4; codecs="avc1.42E01E, mp4a.40.2"')` renvoie `"probably"`, et le MP4 de test se lit directement. Seul HEVC renvoie `""` sous Linux.

**Mesures sur cette machine (8 threads) :**

| Preview | 10 s de 1080p | Extrapolation à 1 h de 1080p |
|---|---|---|
| Réglages actuels (VP9 realtime, pleine définition) | 3,2 s | ≈ 20 min d'attente, ≈ 3,6 Go dans `/tmp` |
| Plafonnée en 720p + `-row-mt 1` | 1,8 s (−44 %) | ≈ 11 min |
| Lecture directe (H.264/AAC, MP4 et MOV des téléphones et appareils photo) | **0 s** | **0 s** |

La 4K est environ 4× plus lente.

**Correctif.**

1. Tenter la lecture directe, via `canPlayType` avec le codec renvoyé par ffprobe, ou en écoutant l'événement `error`.
2. Ne transcoder que les formats non lisibles (HEVC, AVI, FLV…), en 720p maximum, avec `-row-mt 1`.
3. Afficher la vidéo dès que possible ; par exemple, une preview fragmentée permettrait de commencer avant la fin du transcodage.

---

### PERF-02 — Haute ✅ — Export : double encodage et VP9 non parallélisé

**Où.** `src/main/index.js:251-305` et `:352-384`.

**Pipeline actuel :**

1. Chaque segment conservé est encodé en x264, l'un après l'autre.
2. Concaténation en copie.
3. Pour WebM, GIF, ou dès qu'il y a des sous-titres : **ré-encodage complet** de l'intermédiaire. C'est une perte de qualité (deux générations) et une perte de temps.

Le VP9 est lancé avec les réglages par défaut de libvpx (`-crf 30 -b:v 0`), sans `-row-mt`, avec `deadline=good` et `cpu-used=0`.

**Mesure, export WebM de 5 s de 1080p :**

| Réglage | Temps | Taille |
|---|---|---|
| Actuel | **39,7 s** (≈ 0,13× le temps réel, soit environ 8 min par minute de vidéo) | 4,58 Mo |
| `-row-mt 1 -deadline good -cpu-used 4` | **7,9 s (×5)** | 4,95 Mo (+8 %) |

Ces chiffres s'ajoutent au premier passage x264.

**Correctif.** Construire **un seul** `filter_complex` : `trim`/`atrim` par segment, puis `concat`, filtres géométriques et colorimétriques, `setpts`/`atempo` et sous-titres. L'encodage se fait alors une seule fois, directement dans le format cible. Ajouter `-row-mt 1 -cpu-used 4` pour VP9.

---

### PERF-03 — Moyenne ✅ — Processus ffprobe superflus

fluent-ffmpeg lance un **ffprobe supplémentaire** pour chaque commande qui a un écouteur `progress` (`fluent-ffmpeg/lib/processor.js:369-371`), soit un par segment, un pour la conversion finale et un pour la preview. `buildExportSubtitlesFilter` en ajoute un sur l'intermédiaire. Le passage unique de PERF-02 et `-progress pipe:1` suppriment ces appels.

---

### PERF-04 — Basse 🔍 — Image de référence des filtres en pleine définition

**Où.** `App.tsx:116-126`

L'image de référence des filtres est capturée en **pleine définition** avec `canvas.toDataURL('image/jpeg')`, une opération synchrone. En 4K, cela produit plusieurs Mo de data URL, affichés 20 fois. Réduire la capture à environ 320 px de large.

---

### PERF-05 — Basse 🔍 — FilmStrip régénéré à chaque redimensionnement

**Où.** `FilmStrip.tsx:17-58` et `Timeline.tsx:40-46`.

Le `ResizeObserver` déclenche une **ré-extraction complète** des vignettes à chaque pixel de redimensionnement de la fenêtre : nouvel élément `<video>`, puis N seeks. Ajouter un délai d'attente (debounce), et ne relancer l'extraction que si le **nombre** de vignettes change.

---

### PERF-06 — Basse 🔍 — Chargement en double et second décodeur

**Où.** `VideoPlayer.tsx:46-51`

`load()` est rappelé alors que React a déjà changé `src`, d'où une double requête. Le FilmStrip ouvre en plus un second décodeur sur la même vidéo, ce qui reste acceptable.

---

### PERF-07 — Basse ✅ — Taille du paquet

- **Deux binaires de 80 Mo.** ffmpeg (≈ 80 Mo) et ffprobe (≈ 79 Mo) sont deux binaires statiques distincts, issus de builds différents : ffmpeg 7.0.2 et ffprobe `N-66595`, de 2023.
- **Tests embarqués dans l'app.** `package.json` → `build.files` inclut `src/main/**/*`, donc `src/main/__tests__/` et ses doublures sont livrés dans l'asar. Ajouter `"!src/main/__tests__"`.

---

### PERF-08 — Basse 🔍 — Opérations bloquantes dans le main

`readFileSync`, `writeFileSync` et `unlinkSync` (`index.js:170`, `:211`, `:287`, `:315` et `:347`) bloquent la boucle du main. C'est sans gravité pour de petits fichiers, mais la version `fs.promises` est préférable.

---

### PERF-09 — Info 🔍 — Historique non borné

La pile d'annulation n'a pas de limite. Le partage structurel entre états limite l'impact mémoire ; une borne (par exemple 200 entrées) reste prudente.

---

## 5. Qualité de code et maintenabilité

### QUAL-01 — Moyenne ✅ — `fluent-ffmpeg` déprécié

npm le signale à l'installation : « Package no longer supported ». Il est au cœur de la preview et de l'export. Migrer vers `child_process.spawn(ffmpegPath, args)` : la liste d'arguments évite tout problème d'échappement, et `-progress pipe:1` donne une progression exacte. La migration rend aussi plus simples BUG-08, PERF-02 et PERF-03, ainsi que l'annulation (FUN-02).

---

### QUAL-02 — Moyenne 🔍 — Logique dupliquée entre main et renderer

Plusieurs éléments existent en double, avec des commentaires « keep in sync » :

- La liste des filtres : `src/main/filters.js` et `utils/filters.ts`.
- Le découpage proportionnel des mots et des caractères.
- La palette « arc-en-ciel ».

Les mettre dans un module `src/shared/` en CommonJS, importable par Vite comme par `require`.

---

### QUAL-03 — Basse 🔍 — Types d'IPC désynchronisés

- `electron.d.ts:19` déclare que `probeVideo` renvoie `{ duration, width, height }`, alors que le main renvoie l'objet ffprobe brut.
- `duration` est envoyé dans les options d'export mais ignoré par le main.
- Le main et le preload ne sont pas vérifiés par TypeScript : `tsconfig.json` n'inclut que le renderer. Activer `checkJs` sur `src/main` et `src/preload`, avec du JSDoc.

---

### QUAL-04 — Basse 🔍 — Désabonnement trop large dans le preload

**Où.** `src/preload/index.js`

Les fonctions de désabonnement appellent `removeAllListeners(channel)` et retirent donc **tous** les écouteurs du canal, pas seulement celui qui a été ajouté. C'est la cause de BUG-13. Retourner plutôt `() => ipcRenderer.removeListener(channel, handler)`.

---

### QUAL-05 — Basse 🔍 — Divers

- **Rejets avec des chaînes.** Des promesses sont rejetées avec une chaîne plutôt qu'une `Error` : `reject(err.message)` (`index.js:196` et `:232`).
- **Effet de bord dans une mise à jour d'état.** `captureFrame()` appelle `setState` depuis l'updater de `setActivePanel` (`App.tsx:161-167`), qui devrait rester pur. Il est exécuté deux fois en StrictMode.
- **Hook appelé deux fois.** `useT()` est appelé deux fois dans `ExportModal` (lignes 16 et 81).
- **Code mort :**
  - `setLang` (`i18n.tsx`) ;
  - `probeVideo` ;
  - les clés `dev_mode_*` et `update_no_config_msg` ;
  - `chmodBinaries` placé dans `src/main/lib` alors qu'il ne sert qu'au build.

---

### QUAL-06 — Basse 🔍 — Noms de fichiers temporaires

Les noms `lc_*_${Date.now()}` peuvent entrer en collision entre deux exports lancés dans la même milliseconde ou depuis deux instances. Utiliser `fs.mkdtemp()` par opération (voir aussi SEC-05).

---

### QUAL-07 — Info ✅ — Avertissement ESLint au lancement

`eslint.config.js` utilise la syntaxe ESM alors que `package.json` n'a pas de `"type"`, d'où l'avertissement `MODULE_TYPELESS_PACKAGE_JSON` à chaque lint. Renommer le fichier en `eslint.config.mjs`.

---

## 6. Tests

### TEST-01 — Haute ✅ — Couverture élevée mais trompeuse

Les 750 tests passent et couvrent 98,9 % des lignes. Mais `fluent-ffmpeg`, `electron`, `net.fetch` et `protocol` sont **mockés**. Les deux bugs critiques et BUG-03, -04 et -05 ne peuvent pas être détectés.

**À ajouter :**

1. **Tests d'intégration ffmpeg**, sans mock, avec le binaire embarqué et une mire générée à la volée (`-f lavfi -i testsrc2`). Cas à couvrir :
   - rotation + recadrage ;
   - vitesse 2× + sous-titres (vérifier les horodatages du `.ass`) ;
   - chaque format de sortie, avec et sans extension ;
   - zéro segment conservé ;
   - durée du résultat (ffprobe) égale à `Σ segments / vitesse`.
2. **Smoke test Electron** (Playwright `_electron` sous `xvfb-run` en CI) : ouvrir une vidéo, vérifier que `seekable.end(0) === duration`, faire un seek, exporter.

---

### TEST-02 — Moyenne ✅ — Un test verrouille le bug de seek

`src/main/__tests__/index.test.js:203-215` impose que le handler n'envoie **aucune option** à `net.fetch`, ce qui verrouille BUG-01. Ce test est à réécrire avec le correctif : attendre un 206, `Content-Range` et `Accept-Ranges`.

---

### TEST-03 — Basse 🔍 — Tests non isolés

`vitest.config.ts` utilise `isolate: false` avec un seul thread : l'état des modules (mocks, singletons) est partagé entre fichiers de test. Le résultat peut donc dépendre de l'ordre d'exécution. À réserver aux cas mesurés.

---

### TEST-04 — Basse ✅ — Sortie de test bruitée et CI mono-plateforme

- La sortie est polluée par des dizaines de lignes `Not implemented: HTMLMediaElement's load()` (jsdom). Les mocker dans `setup.ts`.
- La CI ne teste que sous Linux, alors qu'une partie du code est spécifique à macOS (updater, menu).

---

## 7. Build, CI/CD et distribution

### CI-01 — Moyenne ✅ — Version de Node incohérente

`npm ci` signale `EBADENGINE` : `electron@41.8.0`, `@electron/rebuild` et `node-abi` exigent **Node ≥ 22.12**, alors que la CI (`ci.yml`, `release.yml:36` et `:95`) et le README (« Node.js 20+ ») utilisent Node 20. Passer à Node 22 LTS partout.

---

### CI-02 — Moyenne ✅ — La release ne revalide rien

**Où.** `release.yml`

- La release ne relance **ni lint ni tests** : un tag peut publier du code jamais validé. Ajouter un job préalable de tests, en dépendance des jobs de build.
- `npm version … || true` (lignes 42 et 101) masque un échec de synchronisation de version.

---

### CI-03 — Moyenne 🔍 — Artefacts non vérifiables

- Aucune somme de contrôle n'est publiée pour le `.deb` et l'AppImage : ni l'updater, ni `install.sh`, ni l'utilisateur ne peuvent vérifier ce qu'ils installent.
- macOS est signé ad hoc et non notarisé.

---

### CI-04 — Basse 🔍 — Hygiène du workflow de release

- **Secrets interpolés.** Ils passent par `${{ secrets.* }}` dans des scripts shell qui écrivent `GITHUB_ENV` (`release.yml:58-62`). Ce n'est pas recommandé, et cela casse avec des valeurs sur plusieurs lignes. Les passer plutôt via `env:` directement à l'étape de build.
- **Actions épinglées par tag.** `@v4` plutôt que par SHA.
- **Permissions trop larges.** `contents: write` est accordé à tout le workflow plutôt qu'aux seuls jobs qui en ont besoin.

---

### CI-05 — Basse 🔍 — `install.sh` fragile

- **Architecture non vérifiée.** `install.sh` ne lit pas `uname -m` : sur Linux ARM64, il installe un `.deb` ou une AppImage x86_64, et l'installation échoue.
- **Aucune somme de contrôle vérifiée.**
- **libfuse2 non vérifiée.** L'AppImage en a besoin, et elle est absente par défaut sur Ubuntu ≥ 22.04 et de nombreuses autres distributions. `RUNTIME_DEPS` est vide.
- **Dossier temporaire conservé.** `install_deb` ne le supprime pas si `apt-get` échoue (`set -e`).

---

### CI-06 — Basse 🔍 — CI : Electron téléchargé quatre fois

Les 4 jobs de `ci.yml` exécutent chacun `npm ci`, qui télécharge Electron (≈ 300 Mo décompressés). Définir `ELECTRON_SKIP_BINARY_DOWNLOAD=1` pour lint, typecheck et build Vite, ou mutualiser l'installation.

---

### CI-07 — Basse ✅ — README et workflow Homebrew incohérents

Le README (ligne 287) affirme que l'étape Homebrew est ignorée quand `HOMEBREW_TAP_TOKEN` est absent. Or le workflow utilise `HOMEBREW_TAP_SSH_KEY` et **échoue** sans ce secret, au lieu de s'ignorer.

---

## 8. Documentation et site vitrine

### DOC-01 — Haute ✅ — Commandes d'installation manuelle du site cassées

**Où.** `html/index.html:221` et `:226`.

Les commandes cherchent `'https://[^"]*_amd64\.deb'` et `'…_amd64\.AppImage'`. Les fichiers réellement publiés (release `v1.0.1`, vérifiée via `gh release view`) s'appellent `LightCutVidz-linux.deb` et `LightCutVidz-linux.AppImage`, sans `_amd64`. Le `grep` ne trouve rien, `curl` reçoit une URL vide, et la commande copiée par l'utilisateur **échoue**.

**Correctif.** Pointer vers `https://github.com/light-cut-vidz/light-cut-vidz/releases/latest/download/LightCutVidz-linux.deb`, une URL stable qui rend l'appel à l'API inutile.

---

### DOC-02 — Moyenne ✅ — Affirmations du README démenties par le code ou les tests

| README | Réalité |
|---|---|
| l.357 : « Electron ships without patented codecs (H.264, AAC) » | Faux : `canPlayType` H.264/AAC renvoie `"probably"` (PERF-01) |
| l.366 : « streaming enabled, so `<video>` can issue range requests and seek » | Faux en pratique : `Range` est ignoré et la vidéo n'est pas seekable (BUG-01) |
| l.95 : « Play / Pause … or press `Space` » | Non implémenté (FUN-06) |
| l.160 : « scrubbing a slider … single history entry » | Faux pour les curseurs des sous-titres (FUN-07) |
| l.19 : « fine-grained slider » | Le curseur ne fait que parcourir les 9 préréglages |
| l.50 : lien vers la release `v1.1.0` (dernière compatible Intel) | La release n'existe pas : seules `v1.0.0` et `v1.0.1` existent |
| l.218 : « Node.js 20+ » | Node ≥ 22.12 requis (CI-01) |
| l.257 : « `npm run lint` — ESLint on renderer source » | Lint de tout `src/` |
| l.287 : `HOMEBREW_TAP_TOKEN` | Le workflow utilise `HOMEBREW_TAP_SSH_KEY` (CI-07) |

---

## 9. Dépendances (`npm audit`, 21/10/2026)

**Livrées dans l'application :** `electron`, `electron-updater` (→ `builder-util-runtime`, `js-yaml`). Voir SEC-02.

**Outillage de développement et de build :**

| Sévérité | Paquets |
|---|---|
| Critique | `shell-quote` (via `concurrently`), `tar` (via `electron-builder`) |
| Haute | `electron-builder`, `app-builder-lib`, `dmg-builder`, `electron-publish`, `vite` 8.0.x, `axios`, `follow-redirects`, `form-data`, `undici`, `postcss`, `nanoid`, `tmp`, `brace-expansion`, `browserslist`, `http-cache-semantics`, `joi`, `source-map-js`, `@xmldom/xmldom` |
| Modérée | `vitest` et `@vitest/mocker`, `@vitest/coverage-v8`, `@electron/get`, `global-agent`, `roarr`, `sprintf-js`, `baseline-browser-mapping` |

Paquets dépréciés signalés à l'installation : `fluent-ffmpeg` (voir QUAL-01), `glob@7`, `inflight` (fuite mémoire connue), `boolean`, `lodash.isequal`.

`npm audit fix` couvre la majorité des avis. Electron doit être monté en version **séparément** (≥ 41.10.6), puis toute l'app retestée.

---

## 10. Plan d'action recommandé

### Étape 1 — Bloquants (correctifs courts, fort impact)

1. **BUG-01** : handler `lcv-file` avec plages d'octets (206), et réécriture de TEST-02.
2. **SEC-01** : liste blanche dans ce même handler, plus une CSP.
3. **SEC-02** : Electron ≥ 41.10.6, `npm audit fix`.
4. **BUG-02** et **BUG-10** : recadrage d'abord dans la chaîne, pas de recadrage implicite à l'ouverture du panneau.
5. **BUG-03** : diviser les temps des sous-titres par la vitesse.
6. **BUG-04** : `BorderStyle=4`.
7. **BUG-05** : format imposé au dialogue et au muxer.
8. **BUG-06** et **SEC-06** : `will-navigate`, `setWindowOpenHandler`, drop global.
9. **DOC-01** : URLs `releases/latest/download/…`.

### Étape 2 — Fiabilité et performance

1. **PERF-01** : lecture directe du H.264, transcodage plafonné en 720p sinon.
2. **PERF-02**, **PERF-03** et **QUAL-01** : export en un seul passage via `spawn` et `-progress`. Ce chantier règle aussi BUG-08 et FUN-15, et permet l'annulation (FUN-02).
3. **BUG-07**, **BUG-09**, **BUG-11** à **BUG-13**, **FUN-01**, **FUN-04**.
4. **TEST-01** : tests d'intégration ffmpeg et smoke test Electron en CI.
5. **CI-01** et **CI-02** : Node 22, tests avant release.

### Étape 3 — Durcissement et finitions

- **Chaîne de mise à jour** (SEC-03 à SEC-05, FUN-05) : sommes de contrôle, `spawn` sans shell, `mkdtemp`, emplacements d'installation.
- **Conformité** (SEC-08) : licence GPL de ffmpeg.
- **Reste de la liste :** constats BUG, FUN, QUAL, CI et DOC de sévérité basse.

---

## Annexe A — Reproductions

### A.1 — Seek via `lcv-file://` (BUG-01, SEC-01, PERF-01)

Script Electron (fenêtre sur l'écran virtuel xvfb), qui reprend `protocol.registerSchemesAsPrivileged` et `protocol.handle` **à l'identique** de `src/main/index.js`, avec `src/main/lib/localProtocol.js`. La page est chargée en `lcv-file://` ; on y crée un `<video>`, on attend 3 s, puis on fait un seek à 90 %.

```
xvfb-run -a node_modules/electron/dist/electron --no-sandbox --disable-gpu seek.js
MODE=file  {"file":"big.mp4","bufferedEnd":60,"seekTo":54,"currentTimeAfter":54,"seekable":[[0,60]]}
MODE=app   {"file":"big.mp4","bufferedEnd":2.23,"seekTo":54,"currentTimeAfter":0,"seekable":[[0,0]]}
MODE=range {"file":"big.mp4","bufferedEnd":2.23,"seekTo":54,"currentTimeAfter":0,"seekable":[[0,0]]}
MODE=fix   {"file":"big.mp4","bufferedEnd":12.7,"seekTo":54,"currentTimeAfter":54,"seekable":[[0,60]]}
(même résultat pour preview.webm généré avec les réglages exacts de ffmpeg:preview)

net.fetch('file://…', { headers: { Range: 'bytes=100-199' } })
  → status=200 len=100 accept-ranges=null content-range=null

fetch('lcv-file://local/<big.mp4>', { headers: { Range: 'bytes=0-99' } })
  → status 200, 225 476 020 octets renvoyés
fetch('lcv-file://local/etc/os-release')
  → 200, "PRETTY_NAME=\"Ubuntu 26.04.1 LTS\""
canPlayType('video/mp4; codecs="avc1.42E01E, mp4a.40.2"') → "probably"
canPlayType('video/mp4; codecs="hvc1.1.6.L93.B0"')        → ""
```

### A.2 — Rotation + recadrage (BUG-02)

```sh
ffmpeg -ss 0 -t 1 -i in_1920x1080.mp4 \
  -vf "transpose=1,crop=1920:1080:0:0,scale=trunc(iw/2)*2:trunc(ih/2)*2" -c:v libx264 out.mp4
# [Parsed_crop_1] Invalid too big or non positive size for width '1920' or height '1080'
# exit=234
```

### A.3 — Fond des sous-titres (BUG-04)

`.ass` produit par `buildAssContent()` avec `outlineColor: '#ff0000'`, `backgroundColor: '#0000ff'` et `backgroundOpacity: 1` :

```
Style: Default,DejaVu Sans,43,&H00FFFFFF,&H00FFFFFF,&H000000FF,&H00FF0000,-1,0,0,0,100,100,0,0,3,4,1,5,20,20,22,1
Rendu (subtitles=box.ass sur fond gris) → { red_pixels: 10991, blue_pixels: 0 }   ← boîte ROUGE
Même style avec BorderStyle=4 et BackColour &H80FF0000 → boîte bleue à 50 % et contour rouge conservé
```

### A.4 — Format ou extension (BUG-05)

```sh
ffmpeg -i in.mp4 -c copy out.webm  # Only VP8 or VP9 or AV1 video … are supported for WebM. exit=234
ffmpeg -i in.mp4 -c copy out       # Unable to choose an output format for 'out'. exit=234
```

### A.5 — Mesures d'encodage (PERF-01, PERF-02)

```
Preview 10 s 1080p, réglages de l'app                 : 3,2 s
Preview 10 s, plafonnée en 720p + -row-mt 1           : 1,8 s
Export WebM 5 s 1080p, réglages de l'app              : 39,7 s  (4 577 081 octets)
Export WebM 5 s 1080p, -row-mt 1 -cpu-used 4          :  7,9 s  (4 954 140 octets)
```

### A.6 — Points vérifiés et écartés

- `webContents.send()` après destruction de la fenêtre **ne lève pas d'exception** dans Electron 41 : pas de plantage du main si la fenêtre est fermée pendant un export.
- Un segment conservé très court (10 ms) s'encode correctement (1 image, pistes vidéo et audio présentes).
- `atempo` sur une source **sans piste audio** ne provoque pas d'erreur avec ffmpeg 7.0.2.
- Tous les filtres utilisés (`subtitles`/libass, `colortemperature`, `perspective`, `curves`, `vignette`, `edgedetect`, `rotate`, `atempo`) sont disponibles dans le ffmpeg Linux embarqué. Le binaire macOS n'a pas pu être vérifié.
