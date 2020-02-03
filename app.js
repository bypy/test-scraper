const request = require('request');
const jsdom = require("jsdom");
const fs = require('fs');
const path = require('path');
const { JSDOM } = jsdom;

let urls = [
    'https://scanlibs.com/learning-svg/',
    'https://scanlibs.com/jump-start-sass/'
];

const rawNext = () => {
    setTimeout( () => {
        next();
    }, (4000 + 4000*Math.random()) );
}

const next = cookies => {
    if (!urls || urls.length === 0) {
        console.log('All urls crawled');
        return;
    }

    let currUrl = urls.pop();
    let fileName = currUrl.replace('https://scanlibs.com/', '').split('/')[0];

    let reqOpts = {
        timeout: 10000,
        followRedirect: true,
        jar:(cookies||request.jar()),
        "User-Agent": "Mozilla/5.0 (Windows NT 6.1; Win64; x64; rv:72.0) Gecko/20100101 Firefox/72.0"
    };

    request.get(currUrl, reqOpts, (error, response, body) => {
        if (error) {
            rawNext();
        } else if (response.statusCode === 200) {
            fs.writeFile(path.join(__dirname,'pages',fileName), body, (err) => {
                if (err) {
                    console.log(err);
                    rawNext();
                }
            });
            const htmlDom = new JSDOM(body);
            let title = htmlDom.window.document.title;
            console.log(title);
            
            if (!response.headers["set-cookie"])
                rawNext();
            else
                setTimeout( () => {
                    next(response.headers["set-cookie"]);
                } , (4000 + 4000*Math.random()) );
        }
    });
};

next();

