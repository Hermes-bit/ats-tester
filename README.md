# ATS Tester

**Teste ton CV et ta lettre de motivation face à une fiche de poste, comme le ferait un logiciel de recrutement (ATS), avant de les envoyer.**

🔗 **Démo en ligne :** https://hermes-bit.github.io/ats-tester/

![Aperçu des résultats](docs/apercu-resultats.png)

## Pourquoi ?

La plupart des entreprises trient les candidatures avec un ATS (*Applicant Tracking System*). Ce logiciel lit le texte du CV, cherche les mots-clés de l'offre et écarte les candidatures qui ne correspondent pas, parfois avant qu'un recruteur les voie. Cette application simule ce filtre pour t'aider à corriger tes documents à temps.

## Fonctionnalités

- **Import de la fiche de poste** : texte collé, PDF, DOCX, TXT, Markdown, HTML ou RTF.
- **Import du CV et de la lettre** : PDF, DOCX, TXT…, ou texte collé.
- **Analyse des mots-clés** : compétences, logiciels, formats de données, méthodes et savoir-être repérés dans l'offre, puis recherchés dans le CV et la lettre. La recherche ignore les accents, les majuscules et les pluriels, et reconnaît les synonymes (ex. *FME Server* = *FME Flow*, *SIG* = *GIS*).
- **Distinction obligatoire / « un plus »** : les compétences marquées « est un plus » ou « serait appréciée » pèsent moins dans le score.
- **Vérifications ATS** : texte lisible (PDF scanné ?), coordonnées, rubriques standards, intitulé du poste, longueur, dates, tableaux et images, **ligatures typographiques** (« Shapeﬁle » lu « Shape fi le »), lettres isolées.
- **Vérifications de la lettre** : nom de l'entreprise, intitulé du poste, longueur, formule d'appel, formule de politesse, objet.
- **Scores** pour le CV, la lettre et un indice global, avec des **recommandations** classées par priorité.
- **« Ce que voit l'ATS »** : le texte brut extrait, dans l'ordre de lecture, avec les mots-clés trouvés surlignés.
- **Prompt pour ton IA générative** : un prompt prêt à copier dans ChatGPT, Claude, Gemini, Le Chat ou Copilot. Il reprend la fiche de poste, tes documents, les scores, les mots-clés manquants et les problèmes détectés. Deux modes :
  - **Retouches, en gardant ma mise en page** (par défaut) : l'IA propose des remplacements de texte précis (emplacement, texte actuel, nouveau texte), de même longueur, à reporter dans ton fichier d'origine. La charte graphique de ton CV et de ta lettre reste intacte.
  - **Réécriture complète** : l'IA réécrit le CV et la lettre en texte structuré.

  Dans les deux cas, l'IA n'invente rien et te pose des questions sur les compétences qui manquent. Une option masque ton e-mail et ton téléphone avant le partage.
- **Suivi des candidatures** : sauvegarde de chaque candidature (entreprise, poste, date, statut, notes, scores, fiche de poste et textes envoyés), recherche, filtres par statut et statistiques.
- **Export / import JSON** pour sauvegarder tes candidatures ou les transférer sur un autre ordinateur.
- **Confidentialité** : tout est traité **dans le navigateur**. Aucun fichier n'est envoyé sur un serveur.
- Interface responsive (ordinateur et mobile), avec un mode sombre automatique.

## Utilisation

1. Renseigne l'entreprise et l'**intitulé exact** du poste.
2. Colle la fiche de poste ou importe-la (PDF, DOCX…).
3. Importe ton CV et, si tu le souhaites, ta lettre de motivation.
4. Clique sur **Analyser ma candidature**.
5. Corrige tes documents d'après les recommandations, ou copie le prompt de la rubrique **Perfectionner avec ton IA** dans ton IA générative, puis relance l'analyse.
6. **Enregistre** la candidature pour la retrouver dans l'onglet *Mes candidatures*.

> Clique sur une ligne du tableau des mots-clés pour ignorer un terme sans rapport avec le poste (ex. le nom de la ville).

## Lancer le projet en local

Aucune installation n'est nécessaire : c'est un site statique (HTML, CSS, JavaScript).

```bash
git clone https://github.com/Hermes-bit/ats-tester.git
cd ats-tester
python3 -m http.server 8000
# puis ouvre http://localhost:8000
```

Tu peux aussi ouvrir directement `index.html` dans ton navigateur.

## Mise en ligne sur GitHub Pages

Le dépôt contient un workflow (`.github/workflows/deploy.yml`) qui publie le site à chaque `push` sur `main`.

1. Crée un dépôt public **`ats-tester`** sur GitHub (sans README).
2. Envoie le code :
   ```bash
   git remote add origin https://github.com/Hermes-bit/ats-tester.git
   git branch -M main
   git push -u origin main
   ```
3. Sur GitHub, va dans **Settings → Pages → Build and deployment → Source** et choisis **GitHub Actions**.
4. Ouvre l'onglet **Actions** et attends la fin du déploiement (environ 1 minute).
5. Le site est en ligne à l'adresse `https://hermes-bit.github.io/ats-tester/`.

## Structure

```
ats-tester/
├── index.html                 # Page unique de l'application
├── assets/
│   ├── css/style.css          # Styles (clair / sombre, responsive)
│   ├── js/keywords.js         # Dictionnaire de compétences et mots vides (FR / EN)
│   ├── js/extract.js          # Extraction du texte : PDF (pdf.js), DOCX (mammoth), TXT…
│   ├── js/analyzer.js         # Moteur d'analyse ATS : mots-clés, vérifications, scores
│   ├── js/prompt.js           # Prompt pour une IA générative à partir des résultats
│   ├── js/storage.js          # Sauvegarde locale des candidatures + export / import
│   ├── js/app.js              # Interface
│   └── vendor/                # pdf.js 3.11.174 et mammoth 1.8.0 (inclus, sans CDN)
├── docs/                      # Captures d'écran
└── .github/workflows/deploy.yml
```

## Comment le score est calculé

| Score | Composition |
|---|---|
| **CV** | 70 % mots-clés (compétences techniques 75 %, termes fréquents 15 %, savoir-être 10 %) + 30 % vérifications de format |
| **Lettre** | 50 % mots-clés (reprendre 50 % des compétences suffit pour le score maximal) + 50 % vérifications de forme |
| **Indice global** | 70 % CV + 30 % lettre |

Le poids d'un mot-clé augmente s'il revient souvent dans l'offre ou s'il figure dans l'intitulé du poste. Il diminue s'il est présenté comme « un plus ».

## Adapter l'outil à un autre métier

Le dictionnaire de compétences se trouve dans `assets/js/keywords.js`. Il couvre surtout la géomatique, les SIG, la donnée et le développement web. Pour l'adapter, ajoute tes propres entrées :

```js
{ label: "Revit", cat: "tools", aliases: ["revit", "autodesk revit"] },
```

Les termes absents du dictionnaire mais répétés dans l'offre sont aussi détectés automatiquement (rubrique « Autres termes fréquents »).

## Limites

- C'est une **simulation** : chaque ATS du marché (Workday, Taleo, SmartRecruiters, Welcome to the Jungle…) a ses propres règles.
- Un PDF scanné (image) n'est pas lu. L'application le signale, comme le ferait un ATS.
- Les fichiers `.doc` (Word 97-2003) et `.odt` ne sont pas lus : convertis-les en `.docx` ou en PDF.
- Les candidatures sont enregistrées dans le navigateur (`localStorage`) : elles ne se synchronisent pas entre appareils. Utilise l'export JSON pour les sauvegarder.
- N'ajoute à ton CV que des compétences que tu maîtrises vraiment : le recruteur vérifiera en entretien.

## Technologies

HTML, CSS et JavaScript sans framework ni étape de compilation · [pdf.js](https://mozilla.github.io/pdf.js/) (Apache 2.0) · [mammoth.js](https://github.com/mwilliamson/mammoth.js) (BSD-2) · GitHub Actions et GitHub Pages.

## Auteur

**Hermès BARRY**, géomaticien. [LinkedIn](https://www.linkedin.com/in/hermes-barry-8727581bb) · [GitHub](https://github.com/Hermes-bit)

## Licence

MIT. Voir [LICENSE](LICENSE).
