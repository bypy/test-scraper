const request = require('request');
const jsdom = require("jsdom");
const { JSDOM } = jsdom;

let urls = [
    'https://www.domikmod.by/blog/263.html',
    'https://www.domikmod.by/blog/259.html'
];
let jar = request.jar();

const next = function(newCookies) {
    if (urls.length > 0) {
        request.get(urls.pop(), {
            timeout: 10000,
            followRedirect: true,
            jar:(newCookies||jar),
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; …) Gecko/20100101 Firefox/72.0"
        }, function(error, response, body){
            if (response.statusCode === 200) {
                const htmlDom = new JSDOM(body);
                let title = htmlDom.window.document.title;
            }
            console.log(body.match(/<h1>(.*?)<\/h1>/)[1]);

            if (!response.headers["set-cookie"])
                setTimeout( () => {
                    next(request.jar());
                }, (4000 + 4000*Math.random()) );
            else
                setTimeout( () => {
                    next(response.headers["set-cookie"]);
                } , (4000 + 4000*Math.random()) );
        });
    }
};

next();

