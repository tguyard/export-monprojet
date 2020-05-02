
const mustache = require('mustache');
const fs = require('fs')

const view = {
    title: "Joe",
    calc: function () {
        return 2 + 4;
    }
};

try {
    const data = fs.readFileSync('/Users/joe/test.txt', 'utf8')
    console.log(data)


    var template = "{{title}} spends {{calc}}";
    var html = mustache.render(template, view);
    console.log(html);

    fs.writeFileSync('/Users/joe/test.txt')

} catch (err) {
    console.error(err)
}
