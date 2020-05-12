Export pdf pour monprojet.sgdf.fr
=================================


Prérequis
---------

- Nodejs doit être installé
- Les fonts Sarabun, "Caveat Brush" et Raleway doivent être installée (optionel)

Configuration
-------------

- Créer un fichier config.json en copiant le fichier config.in.json
- Y rentrer son numéro d'adherent, mot de passe et dossier de sortie
- installer les dependance ```> npm i ```

Lancer l'export
---------------

```> node --max-http-header-size 15000 index.js ```
