# dsh-fal-imagegen

**Langues :** [English](README.md) · [中文](README.zh.md) · [Español](README.es.md) · [العربية](README.ar.md) · **Français** · [日本語](README.ja.md) · [한국어](README.ko.md)

Génération d'images native [fal.ai](https://fal.ai) pour DeepSeek Harness (DSH) : une carte de configuration bilingue pour votre FAL_KEY et vos réglages par défaut, plus des outils d'agent qui parlent le protocole fal de bout en bout — sans passerelle compatible OpenAI entre les deux.

## Fonctionnalités

- **Protocole fal natif** — `POST https://queue.fal.run/<slug>` avec `Authorization: Key <key_id>:<key_secret>`, interrogation du ticket de file (`status_url` → `response_url`), consommation de `{ images: [{ url, width, height }] }`.
- **Génération asynchrone par défaut** — `fal_generate_image` soumet le travail à la file fal et renvoie immédiatement un `task_id` ; un collecteur en arrière-plan le termine, et `fal_get_image_task` interroge la progression et fournit les images finies (en attendant au besoin jusqu'à 120 s par requête). Passez `wait=true` si vous préférez l'ancien comportement bloquant.
- **Carte de configuration bilingue** — « fal 生图 » / « fal imagegen » dans Réglages → Plugins : interrupteur principal, FAL_KEY, points de terminaison texte-vers-image / image-vers-image par défaut, taille, qualité, format de sortie, délai d'attente, dossier de sortie, et un interrupteur d'annonce dans l'invite système. La carte reprend l'apparence des cartes de plugin intégrées (repliable, étiquette « non enregistré », réinitialisation par champ, enregistrer/ignorer) et détecte automatiquement la langue de l'interface — avec un sélecteur 中文 / English dans la carte, mémorisé entre deux rechargements.
- **Outils d'agent** :

  | outil | rôle |
  | --- | --- |
  | `fal_generate_image` | texte-vers-image, asynchrone par défaut : `prompt` / `model` / `size` / `quality` / `count` / `wait` → renvoie un `task_id` |
  | `fal_get_image_task` | requête de tâche en arrière-plan : progression, attente, images finies (par `task_id` ou `request_id` fal ; omettez les deux pour lister les tâches récentes) |
  | `fal_edit_image` | image-vers-image, synchrone : `prompt` + une source (référence de pièce jointe ou `image_path` sur disque) |
  | `fal_list_image_models` | liste les alias intégrés, les réglages par défaut actuels et le dossier de sortie |

- **Résultats réutilisables** — chaque image est jointe à la conversation (affichée à côté de l'appel d'outil) **et** écrite sur disque sous `<DSH_HOME>/fal-imagegen` ; le `path` renvoyé se repasse directement à `image_path` de `fal_edit_image`.
- **Alias de modèles vérifiés** — chaque alias intégré a été vérifié contre le schéma des points de terminaison fal ; les slugs inconnus contenant « / » sont transmis tels quels, et un slug texte-vers-image évident est refusé pour une édition au lieu d'envoyer une requête cassée.

## Génération asynchrone

`fal_generate_image` ne bloque plus un tour d'agent sur la file fal :

1. L'outil soumet le travail et répond `{ status: "queued", task_id, request_id, message, next_action, images: [] }` dès que fal l'accepte.
2. Un collecteur détaché interroge la file, télécharge les images, les enregistre comme pièces jointes et les copie dans le dossier de sortie — le tout en arrière-plan.
3. `fal_get_image_task` (`task_id` requis, ou le `request_id` fal) rapporte `queued / running / completed / failed`. Avec `wait_seconds` (0–120) il bloque jusqu'à cette durée ; une fois `completed`, le résultat porte le `images[]` complet avec `attachment_id` + `path` local et affiche les images à côté de l'appel.
4. Sans identifiant, l'outil liste les tâches récentes (`task_id`, statut, modèle, nombre d'images).

Notes : les enregistrements de tâches vivent dans le processus hôte actuel (conservés ~6 h, les 64 plus récents) ; une tâche dont l'attente en arrière-plan a expiré est réessayée automatiquement à sa prochaine requête ; `fal_edit_image` reste synchrone car son résultat sert généralement d'entrée à l'étape suivante.

## Alias de modèles

| alias | point de terminaison texte-vers-image | point de terminaison image-vers-image | paramètre de taille | niveau de qualité |
| --- | --- | --- | --- | --- |
| `gpt-image-2.5-flare` (défaut ; accepte aussi `gpt-image-2.5` / `gpt-image-2.5-flash`) | `openai/gpt-image-2.5/flare/text-to-image` | `openai/gpt-image-2.5/flare/edit` | `image_size` | pris en charge |
| `gpt-image-2.5-sunburst` | `openai/gpt-image-2.5/sunburst/text-to-image` | `openai/gpt-image-2.5/sunburst/edit` | `image_size` | pris en charge |
| `gpt-image-2` | `openai/gpt-image-2` | `openai/gpt-image-2/edit` | `image_size` | pris en charge |
| `gpt-image-1.5` | `fal-ai/gpt-image-1.5` | `fal-ai/gpt-image-1.5/edit` | `image_size` | pris en charge |
| `nano-banana-2` | `fal-ai/nano-banana-2` | `fal-ai/nano-banana-2/edit` | `aspect_ratio` | omis |
| `gemini-25-flash-image` | `fal-ai/gemini-25-flash-image` | `fal-ai/gemini-25-flash-image/edit` | `aspect_ratio` | omis |
| `flux-2-flash` | `fal-ai/flux-2/flash` | `fal-ai/flux-2/flash/edit` | `image_size` | omis |

## Configuration

| champ | défaut | signification |
| --- | --- | --- |
| `enabled` | `true` | interrupteur principal (outils + annonce dans l'invite) |
| `falKey` | vide | FAL_KEY, `key_id:key_secret` (copiez la chaîne complète depuis fal.ai → Keys) |
| `defaultTextToImageModel` | `openai/gpt-image-2.5/flare/text-to-image` | point de terminaison texte-vers-image |
| `defaultImageToImageModel` | `openai/gpt-image-2.5/flare/edit` | point de terminaison image-vers-image |
| `defaultImageSize` | `1:1` | `1:1 / 4:3 / 3:4 / 3:2 / 2:3 / 16:9 / 9:16 / 21:9`, une paire de pixels `WxH`, ou `auto` |
| `quality` | `high` | `auto / low / medium / high / xhigh / max` (omise automatiquement pour les points sans niveau documenté) |
| `outputFormat` | `png` | `png / jpeg / webp` |
| `timeoutSeconds` | `300` | budget total d'une requête (soumission + file + récupération) |
| `saveDir` | vide | dossier de sortie ; vide = `<DSH_HOME>/fal-imagegen` |
| `announceToAgent` | `true` | annoncer le plugin dans chaque invite système de l'agent |

La carte modifie les mêmes réglages que la section `dsh-fal-imagegen:` de `~/.dsh/settings.yaml`. FAL_KEY est un champ mot de passe : le laisser vide conserve la clé actuelle (la clé est masquée dans toutes les vues réseau).

## Installation

### npm (recommandé)

`dsh-fal-imagegen@0.2.0` est publié :

```sh
# Profils gérés par CLI (web / headless / personnalisé) :
dsh plugin --profile web add dsh-fal-imagegen
# redémarrez ensuite le processus correspondant
```

Le **profil desktop** appartient à l'application DSH Desktop (`dsh plugin --profile desktop` est refusé) : installez via Réglages → Plugins → marché, ou enregistrez manuellement dans `~/.dsh/profiles/desktop/package.json` (dépendance + `dsh-fal-imagegen` dans `dsh.profile.bundles`), puis redémarrez entièrement DSH Desktop.

Après installation, remplissez FAL_KEY dans Réglages → Plugins → 插件配置 → la carte « fal 生图 », ou écrivez la section `dsh-fal-imagegen:` de `~/.dsh/settings.yaml`.

### depuis git (solution de repli)

```sh
dsh plugin --profile web add github:Enchanted0911/dsh-fal-imagegen
```

### depuis le code source

```sh
git clone https://github.com/Enchanted0911/dsh-fal-imagegen
# liez-le dans un profil — dépendance + entrée dsh.profile.bundles — puis redémarrez DSH Desktop
```

Les paquets d'exécution (`@deepseek-ai/dsh-tools`, `dsh-attachment`, `dsh-settings`, `schemastery`) viennent du harness ; le `node_modules/` de cet arbre source n'existe que pour que les tests hors ligne puissent charger hors du harness.

## Développement

Tests hors ligne (sans clé, sans réseau) :

```sh
node tests/fal-manifest-test.mjs             # contrat du manifeste : ligne du patch, exports, dsh.client, id du wrapper
node tests/fal-client-test.mjs               # moitié navigateur : enregistrement des slots, états de la carte, opérations de sauvegarde, sélecteur bilingue
node tests/fal-settings-roundtrip-test.mjs   # les deux moitiés : écritures de la carte → lecture hôte, réinitialisation, interrupteurs
node tests/fal-schema-test.mjs               # schémas des paramètres et sorties des outils
node tests/fal-tasks-test.mjs                # chemin asynchrone : soumission → fin en arrière-plan → requête, avec une file fal factice
```

Tests en direct (consomment des crédits fal) :

```sh
FAL_KEY='<key_id>:<key_secret>' node tests/fal-host-test.mjs   # simulation hôte : générer + éditer + pièces jointes + chemins d'échec
FAL_KEY='<key_id>:<key_secret>' node tests/fal-smoke.mjs       # client fal seul (une génération)
```

Effet des modifications dans une installation liée : les changements de la moitié navigateur (`lib/client.js`) s'appliquent au rechargement de la page ; les changements de la moitié hôte et du manifeste `package.json` exigent un redémarrage de DSH Desktop.

## Source du catalogue du marché

Le marché communautaire DSH n'a pas de source par défaut ; ce dépôt fournit une source de catalogue conforme au contrat v1 sous `catalog/` (voir `catalog/entry.mjs`). Déployez la forme Cloudflare Pages et enregistrez l'URL du manifeste dans Réglages → Plugins → marché → Sources :

```sh
npx wrangler pages deploy catalog/pages --project-name dsh-fal-imagegen-catalog
# puis ajoutez https://dsh-fal-imagegen-catalog.pages.dev/catalog-source.json comme source
```

## Limites

- Les points qui documentent `aspect_ratio` (nano-banana / gemini) ramènent les tailles en pixels explicites à `auto`.
- La génération consomme des crédits fal, et le contenu des images est produit par le modèle hébergé chez fal.