# PDF Referencement

Application web pour extraire des references produits depuis des images et generer des catalogues PDF.

## Fonctionnalites

- **Extraction OCR** - Uploadez une image contenant des references produits (ART1234), l'application les detecte automatiquement via OCR
- **Recherche produits** - Les references extraites sont recherchees dans l'API Skyper pour recuperer les infos produit (nom, prix, stock, image)
- **Generation PDF** - Generez un catalogue PDF avec la liste des produits trouves, pret a telecharger
- **Multi-images** - Ajoutez plusieurs images pour combiner les references dans un seul PDF

## Stack technique

| Composant | Technologie |
|-----------|-------------|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS |
| API | Deno (serveur HTTP natif) |
| Base de donnees | PostgreSQL 15 |
| OCR | OCR.space API |
| PDF | jsPDF |
| Deploiement | Docker Compose |

## Lancement

```bash
# Configurer les variables d'environnement
cp .env.example .env

# Demarrer l'application
docker-compose up -d
```

L'application est accessible sur `http://localhost:5173` et l'API sur `http://localhost:3001`.

### Variables d'environnement requises

```env
OCR_API_KEY=           # Cle API OCR.space
SKYPER_LOGIN_URL=      # URL de connexion Skyper
SKYPER_PRODUCTS_URL=   # URL API produits Skyper
SKYPER_USERNAME=       # Identifiant Skyper
SKYPER_PASSWORD=       # Mot de passe Skyper
```
