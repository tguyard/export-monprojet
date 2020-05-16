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


Developpement 
-------------

- Tout le code javascript est dans le fichier ```index.js```
- On utilise un template handlebare pour générer un fichier html avec le contenu du dossier
- Puis on utilise la lib node-html-pdf pour faire une conversion vers un fichier pdf.

