
// run with: node --max-http-header-size 15000 index.js

const Handlebars = require("handlebars");
const moment = require("moment");
const fs = require('fs');
const https = require('https');
const pdf = require('html-pdf');
const path = require('path');
const stringify = require('csv-stringify/lib/sync');
moment.locale('fr');

// const example = require('./example.json');

const config = require('./config.json');
const camps = require('./camps.json');
const source = './dossier.html.mustache';

const template = Handlebars.compile(fs.readFileSync(source, 'utf8'));
Handlebars.registerHelper('date', function (datestr) {
    return moment(datestr).format("D MMMM");
});
Handlebars.registerHelper('nameddate', function (datestr) {
    return moment(datestr).format("dd D");
});
Handlebars.registerHelper('fulldate', function (datestr) {
    return moment(datestr).format("dddd D MMMM YYYY");
});
Handlebars.registerHelper('datetime', function (datestr) {
    return moment(datestr).format("dddd D MMMM YYYY HH:mm:ss");
});
Handlebars.registerHelper('shortdate', function (datestr) {
    return moment(datestr).format("DD/MM");
});
Handlebars.registerHelper('lower', function (str) {
    return str && str.toLowerCase();
});
Handlebars.registerHelper('trim', function (str) {
    return str && str.trim();
});
Handlebars.registerHelper('ifEquals', function (arg1, arg2, options) {
    return (arg1 == arg2) ? options.fn(this) : options.inverse(this);
});
Handlebars.registerHelper("contains", function (value, array, options) {
    array = (array instanceof Array) ? array : [array];
    return (array.indexOf(value) > -1) ? options.fn(this) : "";
});

function render(view, outputPath) {
    try {
        // Render the template
        const html = template(view);

        // write file on hard drive
        // fs.writeFileSync(outputPath + ".html", html)

        // create pdf
        const options = {
            base: 'file://' + path.resolve(source),
            border: {
                top: "1cm",
                bottom: "1cm",
                left: "0",
                right: "0",
            }
        };
        pdf.create(html, options).toFile(outputPath + ".pdf", function (err, res) {
            if (err) {
                throw err;
            }
        });
    } catch (err) {
        console.error(err)
    }
}

async function httpRequest(options, content) {
    try {
        return doHttpRequest(options, content);
    } catch (error) {
        console.log("Error on http request. Retrying in 5 seconds", error);
        await sleep(5000);
        return doHttpRequest(options, content);
    }
}

async function doHttpRequest(options, content) {
    return new Promise((resolve, reject) => {
        options.hostname = 'monprojet.sgdf.fr';
        options.port = 443;

        let data = null;
        if (content != null) {
            data = JSON.stringify(content)
            options.headers = {
                'Content-Type': 'application/json',
                'Content-Length': data.length
            };
        }

        console.log(options.method + " " + options.path);

        const req = https.request(options, res => {
            let result = '';
            res.on('data', d => {
                result += d
            });
            res.on('end', () => {
                const r = JSON.parse(result);
                if (r != null) {
                    resolve(r);
                } else {
                    reject("result is null");
                }
            });
        })

        req.on('error', error => {
            console.error(error);
            reject("error");
        })

        if (data != null) {
            req.write(data)
        }
        req.end()
    });
}

async function httpDownload(options, filename) {
    return new Promise((resolve, reject) => {
        const f = fs.createWriteStream(filename);
        options.hostname = 'monprojet.sgdf.fr';
        options.port = 443;

        console.log(options.method + " " + options.path);

        const req = https.request(options, res => {
            res.pipe(f);
            res.on('end', function () {
                f.close();
                resolve(f);
            });
        })

        req.on('error', error => {
            console.error(error);
            reject();
        })
        req.end()
    });
}


async function login(id, password) {
    return httpRequest({
        path: '/api/login',
        method: 'POST',
    }, {
        "numero": "" + id,
        "password": "" + password,
    });
}

async function getModule(url, token) {
    return httpRequest({
        path: url,
        method: 'GET',
        headers: {
            'Authorization': 'Bearer ' + token,
        }
    });
}


function sleep(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

const includePersonalData = false;
const forceCreation = true;


async function main() {
    const credentials = await login(config.login, config.password);
    if (credentials.token == null) {
        console.log(credentials);
        throw new Error("Cannot find the token");
    }

    const campCsvData = []
    const chefCsvData = []
    for (const camp of camps) {

        //
        // Create output dir for the camp
        //
        const outputDir = config.output + camp.name;
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir);
        }


        //
        // read the metadata.
        //
        let metadata = null;
        const metadataFile = outputDir + '/metadata.json'
        try {
            if (fs.existsSync(metadataFile)) {
                metadata = JSON.parse(fs.readFileSync(outputDir + '/metadata.json', 'utf8'));
            }
            if (metadata == null) {
                metadata = {};
            }
        } catch (error) {
            // ignore error when reading metadata
            console.log(error);
        }

        const view = {
            outputDir,
            includePersonalData,
            outputName: camp.name,
        };

        // 
        // Populate the view.
        //

        const result = await getModule('/api/camps/' + camp.id + "?module=ENTETE", credentials.token);
        view.entete = result;

        // Make sure there was some modifications
        if (result.histoDerniereModification != null && result.histoDerniereModification.dateHeureModification != null) {
            const lastModif = moment(result.histoDerniereModification.dateHeureModification);
            camp.lastModif = lastModif.format();
            if (metadata.creationDate != null) {
                if (lastModif < moment(metadata.creationDate) && !forceCreation) {
                    continue;
                }
            }
        }

        fs.writeFileSync(metadataFile, JSON.stringify({
            creationDate: moment().format(),
        }));

        const modules = [
            { name: 'INFO_GENERALE', url: '/api/camps/' + camp.id + "?module=INFO_GENERALE" },
            { name: 'LIEUX', url: '/api/camps/' + camp.id + "?module=LIEUX" },
            { name: 'STAFF', url: '/api/camps/' + camp.id + "?module=STAFF" },
            { name: 'PARTICIPANT', url: '/api/camps/' + camp.id + "?module=PARTICIPANT" },
            { name: 'PROJET_PEDA', url: '/api/camps/' + camp.id + "?module=PROJET_PEDA" },
            { name: 'JOURNEE_TYPE', url: '/api/camps/' + camp.id + "?module=JOURNEE_TYPE" },
            { name: 'GRILLE_ACTIVITE', url: '/api/camps/' + camp.id + "?module=GRILLE_ACTIVITE" },
            { name: 'MENU', url: '/api/camps/' + camp.id + "?module=MENU" },
            { name: 'BUDGET', url: '/api/camps/' + camp.id + "?module=BUDGET" },
            { name: 'NUMERO_UTILE', url: '/api/camps/' + camp.id + "?module=NUMERO_UTILE" }
        ];
        for (const module of result.campModules) {
            if (module.actif) {
                modules.push({
                    name: module.module.code,
                    url: '/api/camp-modules/' + module.id
                });
            }
        }

        //
        // Get all the modules
        //
        for (const code of modules) {
            const m = await getModule(code.url, credentials.token);
            m.camp = m.camp817;
            view[code.name.toLowerCase().replace('/', '-')] = m;
        }

        //
        // Format the view
        //
        if (view.entete.typeCamp.code === '8-11') {
            view.branche = {
                id: 'lj',
                name: 'peuplade',
            };
        }
        if (view.entete.typeCamp.code === '11-14') {
            view.branche = {
                id: 'sg',
                name: 'tribue',
            };
        }
        if (view.entete.typeCamp.code === '14-17') {
            view.branche = {
                id: 'pk',
                name: 'caravanne',
            };
        }
        if (view['appel-age-sup'] != null && view['appel-age-sup'].surveyjsReponsesJson) {
            for (const key in view['appel-age-sup'].surveyjsReponsesJson) {
                if (view['appel-age-sup'].surveyjsReponsesJson.hasOwnProperty(key)) {
                    view['appel-age-sup'].appel = view['appel-age-sup'].surveyjsReponsesJson[key];
                }
            }
        }

        // formation
        if (view.staff.campAdherentStaffsInformations != null && view.staff.campAdherentStaffsInformations.length > 0) {
            for (const info of view.staff.campAdherentStaffsInformations) {
                const staff = view.staff.campAdherentStaffs.find(s => s.adherent.numero === info.numero);
                // TODO: finish me !
            }
        }

        //
        // Download the files in the view.
        //
        view.files = {};
        if (view.info_generale.campFichiers && view.info_generale.campFichiers.length > 0) {
            const files = view.info_generale.campFichiers;
            for (const file of files) {
                if (file.id === 6) {
                    continue;
                }
                const fileOutput = outputDir + '/' + file.categorie.toLowerCase();
                if (!fs.existsSync(fileOutput)) {
                    fs.mkdirSync(fileOutput);
                }
                await httpDownload({
                    path: "/api/camp-fichiers/" + file.id,
                    method: 'GET',
                    headers: {
                        'Authorization': 'Bearer ' + credentials.token,
                    }
                }, fileOutput + "/" + file.nom)

                if (view.files[file.categorie.toLowerCase()] == null) {
                    view.files[file.categorie.toLowerCase()] = [{
                        name: file.nom,
                        url: file.categorie.toLowerCase() + '/' + file.nom,
                    }];
                }
                view.files[file.categorie.toLowerCase()].push()
            }
        }

        //
        // The actual render of the pdf file.
        //
        render(view, view.outputDir + '/' + view.outputName);

        // generate the camps.csv
        campCsvData.push({
            id: camp.id,
            name: camp.name,
            modif: moment(camp.lastModif).format("YYYY-MM-DD"),
            structures: view.info_generale.campStructures
                .filter(s => s.organisatrice)
                .map(s => s.structure),
            structuresOrganisatrice: view.info_generale.campStructures
                .filter(s => s.organisatrice === true)
                .map(s => s.structure),
            etat: view.entete.statut,
            dateDebut: moment(view.entete.dateDebut).format("YYYY-MM-DD"),
            dateFin: moment(view.entete.dateFin).format("YYYY-MM-DD"),

            nbAnimateurs: view.info_generale.camp.previsionNbreAnimateurs,
            nbJeunes: view.info_generale.camp.previsionNbreParticipants,
            nbFilles: view.info_generale.camp.previsionNbreFilles,
            nbGarcons: view.info_generale.camp.previsionNbreGarcons,
            nb613: view.info_generale.camp.previsionNbre613,
            nb1417: view.info_generale.camp.previsionNbre1417,
            ageMini: view.info_generale.camp.ageMini,
            ageMaxi: view.info_generale.camp.ageMaxi,
            tel: view.staff.telephoneContactStaff || "",
            lieux: (view.lieux.campLieuPrincipal.codePostal || "") + " " + (view.lieux.campLieuPrincipal.ville || "" ) + " " + (view.lieux.campLieuPrincipal.pays || ""),
            address: (view.lieux.campLieuPrincipal.libelle || "") + "\n" + (view.lieux.campLieuPrincipal.adresseLigne1 || "") + "\n" + (view.lieux.campLieuPrincipal.adresseLigne2 || ""),
        });

        for (const chef of view.staff.campAdherentStaffs) {
            const infos = view.staff.campAdherentStaffsInformations.find(i => i.numero === chef.adherent.numero) || [];
            const resp = [];
            if (chef.responsabiliteIntendant) {
                resp.push('Intendant');
            }
            if (chef.responsabiliteTresorier) {
                resp.push('Trésorier');
            }
            if (chef.responsabiliteAS) {
                resp.push('Sanitaire');
            }
            if (chef.responsabiliteMateriel) {
                resp.push('Materiel');
            }
            if (chef.responsabiliteAutre) {
                resp.push('Autre');
            }
            if (chef.responsabiliteAutreDetail) {
                resp.push(chef.responsabiliteAutreDetail);
            }
            chefCsvData.push({
                id: camp.id,
                numero: chef.adherent.numero,
                nom: chef.adherent.nom,
                prenom: chef.adherent.prenom,
                role: chef.roleStaff === 'D' ? 'Directeur' : (chef.roleStaff === 'C' ? 'Chef' : 'Autre'),
                dateDebutPresence: moment(chef.dateDebutPresence).format("YYYY-MM-DD"),
                dateFinPresence: moment(chef.dateFinPresence).format("YYYY-MM-DD"),
                stage: chef.validationStagePratiqueBafa ? 'BAFA' : (chef.validationStagePratiqueBafd ? 'BAFD' : ''),
                qualification: (infos.adherentQualifications || []).map(q => q.type).join(" | "),
                resp: resp.join(' | '),
            });
        }

        // Qualification,
        // responsabilités

        // do not overcharge the servers ...
        await sleep(2000);
    }

    {
        // create CampCSV
        const campCsv = [];
        campCsv.push([
            "Camp",
            "Nom",
            "Modifié le",
            "Structure Organisatrice",
            "Structure",
            "État",
            "Début",
            "Fin",
            "Animateurs",
            "Jeunes",
            "Filles",
            "Garçons",
            "6-13 ans",
            "14-17 ans",
            "age Min",
            "age Max",
            "Tel",
            "Lieu",
            "Adresse",
        ]);
        for (const c of campCsvData) {
            campCsv.push([
                c.id,
                c.name,
                c.modif,
                c.structuresOrganisatrice.map(s => s.libelle +" (" +s.code + ")").join(" | "),
                c.structures.map(s => s.libelle +" (" +s.code + ")").join(" | "),
                c.etat,
                c.dateDebut,
                c.dateFin,
                c.nbAnimateurs,
                c.nbJeunes,
                c.nbFilles,
                c.nbGarcons,
                c.nb613,
                c.nb1417,
                c.ageMini,
                c.ageMaxi,
                c.tel,
                c.lieux,
                c.address,
            ]);
        }
        const data = stringify(campCsv);
        fs.writeFileSync(config.output + '/camps.csv', data);   
    }
    {




        // create chefCSV
        const chefCSV = [];
        chefCSV.push([
            "Camp",
            "Numéro adhérent",
            "Nom",
            "Prénom",
            "Role",
            "Date début",
            "Date de fin",
            "En stage",
            "Qualifications",
            "Responsabilités",
        ]);
        for (const c of chefCsvData) {
            chefCSV.push([
                c.id,
                c.numero,
                c.nom,
                c.prenom,
                c.role,
                c.dateDebutPresence,
                c.dateFinPresence,
                c.stage,
                c.qualification,
                c.resp,
            ]);
        }
        const data = stringify(chefCSV);
        fs.writeFileSync(config.output + '/chefs.csv', data);   
    }

    // // create a report
    // const records = [];
    // for (const camp of camps) {
    //     records.push([
    //         camp.name,
    //         camp.lastModif,
    //         'https://monprojet.sgdf.fr/camp/' + camp.id
    //     ]);
    // }
    // const data = stringify(records);
    // fs.writeFileSync(config.output + '/dateModifications.csv', data);
}

main();


// render(example, 'example.pdf');