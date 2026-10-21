# Journal des modifications

Les changements notables de LightCutVidz sont listés ici, du plus récent au plus ancien.
La version anglaise est dans [CHANGELOG.md](CHANGELOG.md) — gardez les deux synchronisées.

Le format suit [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/).

## [1.0.5] - 2026-10-21

### Corrigé
- L'option Stabilisation pouvait être masquée à tort : la vérification qui décide si elle fonctionne n'était pas fiable et répondait parfois non. Elle est maintenant testée sur un clip qui bouge vraiment, et répond juste à chaque fois.

## [1.0.4] - 2026-10-21

### Ajouté
- **Formats réseaux sociaux** : l'outil de recadrage propose des formats — 9:16 (TikTok, Reels, Shorts), 4:5 (Instagram), 1:1 et 16:9 — et garde la sélection à ce format quand vous la redimensionnez.
- **Adapter à un format à l'export** : choisissez les proportions dans la fenêtre d'export, avec un **fond flouté** (l'image reste entière, centrée sur une copie floutée d'elle-même — le rendu habituel d'une vidéo horizontale publiée en vertical) ou en **rognant au centre**. Fonctionne aussi pour les GIF.
- **Préréglages** : TikTok · Reels · Shorts, Post Instagram, Carré et YouTube règlent en un clic le format, les proportions, la résolution (1080 sur le petit côté) et la qualité.

### Corrigé
- La stabilisation vidéo n'est plus proposée que si elle fonctionne vraiment avec le FFmpeg utilisé ; sur certains Mac elle échouait à l'export (« Cannot parse localmotion »).

## [1.0.3] - 2026-10-21

### Ajouté
- **Qualité d'export** : choisissez Haute, Équilibrée ou Petit fichier, et plafonnez la résolution (de la 4K à 360p — une vidéo plus petite n'est jamais agrandie). Vos choix sont mémorisés.
- **File d'export** : *Ajouter à la file* dans la fenêtre d'export, puis continuez à éditer. Les exports s'enchaînent ; un bouton affiche leur progression, permet d'en annuler un et d'ouvrir le résultat dans son dossier.
- **Fichiers récents** : l'écran d'accueil et *Fichier → Ouvrir récent* listent vos dernières vidéos et vos derniers projets.
- **Thème clair** : *Affichage → Thème* propose Suivre le système, Clair et Sombre ; le choix est mémorisé.
- **Stabilisation vidéo** (Légère, Normale, Forte) dans le panneau latéral. Elle analyse d'abord les images, puis les lisse à l'export.
- **Accélération matérielle** de l'export H.264 quand l'ordinateur la prend en charge (Apple VideoToolbox sur Mac). Elle n'est proposée que si elle fonctionne vraiment, et repasse en logiciel en cas d'échec. Sous Linux, le FFmpeg embarqué n'a pas d'encodeur GPU : définissez `LIGHTCUTVIDZ_FFMPEG` avec le chemin d'un FFmpeg système pour utiliser NVENC, VAAPI ou Quick Sync.
- **GIF optimisé** : choisissez la largeur et le nombre d'images par seconde ; une palette plus fine et le codage des seules zones modifiées réduisent nettement la taille des fichiers.

### Modifié
- Fermer la fenêtre pendant des exports demande maintenant confirmation.
- La carte du format GIF n'affiche plus de largeur fixe.

## [1.0.2] - 2026-10-21

### Ajouté
- **Projets** : enregistrez vos modifications dans un fichier `.lcvproj` (Ctrl/Cmd+S) et rouvrez-les plus tard (Ctrl/Cmd+Maj+O).
- **Modifications non enregistrées** : fermer la fenêtre ou ouvrir une autre vidéo demande maintenant confirmation avant de perdre votre travail.
- Fenêtre **Nouveautés** (menu Aide), affichée automatiquement après une mise à jour ; la liste des changements s'affiche aussi quand vous vérifiez les mises à jour.
- **Bouton d'arrêt** pour les exports, et bouton **Annuler** pendant la préparation d'une vidéo.
- **Clavier** : Espace/K lecture-pause, ←/→ saut de 1 s (Maj : 5 s), J/L saut de 5 s, `,` et `.` image par image, Suppr supprime la coupe sélectionnée.
- **Ouvrir avec…** : ouvrez une vidéo depuis le gestionnaire de fichiers ou la ligne de commande.
- Les mises à jour sont maintenant vérifiées automatiquement quelques secondes après le lancement.

### Modifié
- **Ouverture bien plus rapide** : les vidéos H.264/AAC (téléphones, appareils photo) s'ouvrent instantanément au lieu d'être converties d'abord.
- **Export bien plus rapide** : une seule passe d'encodage au lieu d'une par segment (le WebM est environ 5 fois plus rapide), sans perte de qualité due à un ré-encodage.
- Le recadrage est appliqué avant la rotation et la perspective ; l'image s'affiche sans transformation pendant que vous le tracez.
- Les aperçus de filtres correspondent maintenant à l'export : perspective, tons froid/chaud/ancien, poster, vignette et flou.
- Les sous-titres sont placés sur l'image recadrée, avec la taille réelle du contour ; les répliques qui se chevauchent sont toutes affichées.
- La boîte d'enregistrement ne propose que le format choisi et ajoute l'extension si vous l'oubliez.
- L'application suit la langue de votre système au premier lancement.
- Téléchargement plus léger : le binaire ffprobe séparé a disparu.

### Corrigé
- **Le déplacement** dans la timeline et la barre de lecture revenait à 0:00 : les coupes ne pouvaient pas être sautées et les vignettes étaient toutes identiques.
- La lecture se figeait en sautant une coupe qui ne laissait qu'un court bout de vidéo.
- L'export avec **rotation et recadrage** échouait (ou découpait la mauvaise zone).
- Les **sous-titres** se décalaient quand la vitesse n'était pas 1×, et la couleur et l'opacité du fond étaient ignorées.
- Déposer un fichier sur l'éditeur remplaçait toute la fenêtre et faisait perdre votre travail.
- L'export vers un nom de fichier sans la bonne extension échouait.
- Annuler/Rétablir restaient grisés après un changement de langue.
- Ouvrir une vidéo pendant le chargement d'une autre pouvait mélanger les deux.
- De nombreux défauts plus petits : timeline, recadrage, éditeur de coupe, notifications, barre de progression.

### Sécurité
- L'interface ne peut lire que les fichiers de l'application et les vidéos que vous ouvrez, et une Content-Security-Policy stricte est appliquée.
- Les mises à jour sont téléchargées avec une vérification SHA-256 obligatoire, installées sans shell, depuis un dossier temporaire privé.
- Electron 45 et dépendances à jour (aucune vulnérabilité connue dans l'application livrée).
- Les fichiers de release sont maintenant accompagnés d'une attestation de build signée.

## [1.0.1] - 2026-08-20

### Corrigé
- Linux : le FFmpeg embarqué ne pouvait pas démarrer dans les paquets (erreur de permission).

## [1.0.0] - 2026-08-19

### Ajouté
- Première version : découpe, recadrage, géométrie, filtres, vitesse, sous-titres incrustés et export en MP4, MOV, WebM, AVI et GIF.
