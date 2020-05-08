
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

function httpRequest(options, content) {
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

function httpDownload(options, filename) {
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


function login(id, password) {
    return httpRequest({
        path: '/api/login',
        method: 'POST',
    }, {
        "numero": "" + id,
        "password": "" + password,
    });
}

function getModule(url, token) {
    return httpRequest({
        path: url,
        method: 'GET',
        headers: {
            'Authorization': 'Bearer ' + token,
        }
    });
}

login(config.login, config.password).then((credentials) => {
    const modules = [];
    for (const camp of camps) {
        const campId = camp.id;

        let view = {};
        const m = getModule('/api/camps/' + campId + "?module=ENTETE", credentials.token).then(result => {
            view.entete = result;
            const promises = [];
            const moduleCodes = [
                { name: 'INFO_GENERALE', url: '/api/camps/' + campId + "?module=INFO_GENERALE" },
                { name: 'LIEUX', url: '/api/camps/' + campId + "?module=LIEUX" },
                { name: 'STAFF', url: '/api/camps/' + campId + "?module=STAFF" },
                { name: 'PARTICIPANT', url: '/api/camps/' + campId + "?module=PARTICIPANT" },
                { name: 'PROJET_PEDA', url: '/api/camps/' + campId + "?module=PROJET_PEDA" },
                { name: 'JOURNEE_TYPE', url: '/api/camps/' + campId + "?module=JOURNEE_TYPE" },
                { name: 'GRILLE_ACTIVITE', url: '/api/camps/' + campId + "?module=GRILLE_ACTIVITE" },
                { name: 'MENU', url: '/api/camps/' + campId + "?module=MENU" },
                { name: 'BUDGET', url: '/api/camps/' + campId + "?module=BUDGET" },
                { name: 'NUMERO_UTILE', url: '/api/camps/' + campId + "?module=NUMERO_UTILE" }
            ];
            // '/api/camps/' + campId + "?module=" + moduleName
            // api/camp-modules/1659
            for (const module of result.campModules) {
                if (module.actif) {
                    moduleCodes.push({
                        name: module.module.code,
                        url: '/api/camp-modules/' + module.id
                    });
                }
            }
            for (const code of moduleCodes) {
                promises.push(getModule(code.url, credentials.token));
            }
            return Promise.all(promises).then(modules => {
                for (let i = 0; i < moduleCodes.length; ++i) {
                    const m = modules[i];
                    m.camp = m.camp817;
                    view[moduleCodes[i].name.toLowerCase().replace('/', '-')] = m;
                }
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
                const outputDir = config.output + camp.name;
                view.outputDir = outputDir;
                view.outputName = camp.name;
                if (!fs.existsSync(outputDir)) {
                    fs.mkdirSync(outputDir);
                }

                view.files = {};
                if (view.info_generale.campFichiers && view.info_generale.campFichiers.length > 0) {
                    const files = view.info_generale.campFichiers;
                    const downloads = [];
                    for (const file of files) {
                        if (file.id === 6) {
                            continue;
                        }
                        const fileOutput = outputDir + '/' + file.categorie.toLowerCase();
                        if (!fs.existsSync(fileOutput)) {
                            fs.mkdirSync(fileOutput);
                        }
                        const d = httpDownload({
                            path: "/api/camp-fichiers/" + file.id,
                            method: 'GET',
                            headers: {
                                'Authorization': 'Bearer ' + credentials.token,
                            }
                        }, fileOutput + "/" + file.nom)
                        downloads.push(d);

                        if (view.files[file.categorie.toLowerCase()] == null) {
                            view.files[file.categorie.toLowerCase()] = [{
                                name: file.nom,
                                url: file.categorie.toLowerCase() + '/' + file.nom,
                            }];
                        }
                        view.files[file.categorie.toLowerCase()].push()
                    }
                    return Promise.all(downloads).then(() => view)
                }
                return view;
            });
        }).then(view => {
            // console.log(JSON.stringify(view));
            render(view, view.outputDir + '/' + view.outputName);
        });

        modules.push(m)
    }

    return Promise.all(modules);

}).catch(err => {
    console.log(err);
});
