const request = require('request');
let jar = request.jar();

let urls = [
    'https://www.domikmod.by/blog/263.html',
    'https://www.domikmod.by/blog/259.html'
];

const next = function(newCookies) {
    if (urls.length > 0) {
        request.get(urls.pop(), {
            timeout: 10000,
            followRedirect: true,
            jar:(newCookies||jar),
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; …) Gecko/20100101 Firefox/72.0"
        }, function(error, response, body){
            console.log(body.match(/<h1>(.*?)<\/h1>/)[1]);
            if (!response.headers["set-cookie"])
                setTimeout( () => {
                    next(request.jar());
                }, 2200 );
            else
                setTimeout( () => {
                    next(response.headers["set-cookie"]);
                } , 2200 );
        });
    }
};

next();

