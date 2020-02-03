const request = require('request');
const jsdom = require("jsdom");
const fs = require('fs');
const path = require('path');
const { JSDOM } = jsdom;

const siteAddr = 'https://scanlibs.com/'
let urls = [
    'https://scanlibs.com/learning-svg/',
    'https://scanlibs.com/jump-start-sass/'
];
const timeout = 4000 + 4000*Math.random();

const noCookiesNext = (delay) => {
    setTimeout(() => {
        next();
    }, delay);
};

const next = cookies => {
    if (!urls || urls.length === 0) {
        console.log('All urls crawled');
        return;
    }

    let currUrl = urls.pop();
    let fileName = currUrl.replace(siteAddr, '').split('/')[0];

    let reqOpts = {
        timeout: 10000,
        followRedirect: true,
        jar: (cookies || request.jar()),
        "User-Agent": "Mozilla/5.0 (Windows NT 6.1; Win64; x64; rv:72.0) Gecko/20100101 Firefox/72.0"
    };

    request.get(currUrl, reqOpts, (error, response, body) => {
        let data = {};
        try {
            if (error) throw error;
            if (response.statusCode !== 200) throw new Error('error getting resource ' + currUrl);
            let savePath = path.join(__dirname, 'pages', fileName.concat('.html'));
            fs.writeFile(savePath, body, (err) => {
                if (err) throw error;
            });
            const htmlDom = new JSDOM(body);
            const document = htmlDom.window.document;
            const categoryItems = document.querySelector('span.cat-links').children;
            let categories = Array.prototype.slice.call(categoryItems);
            categories = categories
                .filter(item => item.nodeName === 'A')
                .map(item => item.textContent)
                .filter(item => (item));
            const contImg = document.querySelector('.entry-content > img').getAttribute('src');
                        
            data.cat = categories;
            data.imgSrc = contImg;
            data.imgDst = path.join(__dirname, 'images', fileName.concat('.jpg'));

            if (!response.headers["set-cookie"])
                noCookiesNext(timeout);
            else
                setTimeout(() => {
                    next(response.headers["set-cookie"]);
                }, timeout);

        } catch (err) {
            console.log(err);
            noCookiesNext(timeout);
        }

        let contImgExt = null;
        
        request
            .get(siteAddr.concat(data.imgSrc))
            .on('error', (err) =>
                console.log(err)
            )
            .on('response', (response) => {
                contImgExt = response.headers['content-type'].split('/')[1];
                data.img = path.join(__dirname, 'images', fileName.concat('.', contImgExt));
            })
            .pipe(fs.createWriteStream(data.imgDst));
        
    });
};

next();

