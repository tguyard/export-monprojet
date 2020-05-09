
const Handlebars = require("handlebars");
const moment = require("moment");
const fs = require('fs')
const https = require('https')
const pdf = require('html-pdf');
const path = require('path')

moment.locale('fr');

const example = require('./example.json')
const config = require('./config.json')
const camps = require('./camps.json')
const source = './dossier.html.mustache';

const template = Handlebars.compile(fs.readFileSync(source, 'utf8'));
Handlebars.registerHelper('date', function (datestr) {
    return moment(datestr).format("D MMMM");
});
Handlebars.registerHelper('nameddate', function (datestr) {
    return moment(datestr).format("dddd D");
});
Handlebars.registerHelper('fulldate', function (datestr) {
    return moment(datestr).format("dddd D MMMM YYYY");
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
        fs.writeFileSync(outputPath + ".html", html)

        // create pdf
        const options = {
            base: 'file://' + path.resolve(source),
            border: {
                top: "2cm",
                bottom: "2cm",
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


async function main() {

    const credentials = await login(config.login, config.password);
    if (credentials.token == null) {
        console.log(credentials);
        throw new Error("Cannot find the token");
    }

    for (const camp of camps) {

        //
        // Create output dir for the camp
        //
        const outputDir = config.output + camp.name;
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir);
        }
        
        const view = {
            outputDir,
            outputName: camp.name,
        };

        // 
        // Populate the view.
        //

        const result = await getModule('/api/camps/' + camp.id + "?module=ENTETE", credentials.token);
        view.entete = result;

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

        // do not overcharge the servers ...
        await sleep(2000);
    }
}

main();
