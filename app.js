const request = require('request');
const jsdom = require("jsdom");
const fs = require('fs');
const path = require('path');
const { JSDOM } = jsdom;

const pagesPath = path.join(__dirname, 'pages');
const imgPath = path.join(__dirname, 'images');
const dataPath = path.join(__dirname, 'data');

[pagesPath, imgPath, dataPath].forEach( pth => {
    if (!fs.existsSync(pth)){
        fs.mkdirSync(pth);
    }  
})

const siteAddr = 'https://scanlibs.com/'
const timeout = 4000 + 4000*Math.random();

let urls = [
    'https://scanlibs.com/learning-svg/',
    'https://scanlibs.com/jump-start-sass/'
];


const scrapePage = (htmlBody, pageName) => {
    let data = {};

    // Extracting data
    const name = htmlBody.querySelector('h1').textContent;
    const categoryItems = htmlBody.querySelector('span.cat-links').children;
    let categories = Array.prototype.slice.call(categoryItems);
    categories = categories
        .filter(item => item.nodeName === 'A')
        .map(item => item.textContent)
        .filter(item => (item));

    let contImgSrc = htmlBody.querySelector('.entry-content > img').getAttribute('src');
    let contImgExt = ""; // изначально расширение изображения нам неизвестно

    if (/\.jpe?g$/.test(contImgSrc))
        contImgExt = '.jpg';
    else if (/\.png$/.test(contImgSrc))
        contImgExt = '.png';
    else if (/\.webp$/.test(contImgSrc))
        contImgExt = '.webp';
        
    const container = htmlBody.querySelector('.entry-content');
    if (!container) throw new Error('Data containin element is missing');
    const info = {};
    const description = [];
    const descriptionEl = container.querySelector('p');
    
   
    const chldNodes = container.childNodes;
    let counter=0;
    while(counter < chldNodes.length) {
        let curr = chldNodes[counter];
        if (curr === descriptionEl)
            break;
        if (curr.nodeType === 3 && curr.textContent.trim() !== '') {
            let key = '';
            let value='';
            let properties = curr.textContent.trim().split(':');
            key = properties[0];
            if (properties.length > 1) {
                value = properties.slice(1).join(':').trim(); // если значение в свою очередь само имело знак :
            }
            info[key] = value;
        }
        counter++;
    }

    const download = container.querySelector('#download');

    if (descriptionEl) {
        description.push(descriptionEl.innerHTML);
        let startEl = descriptionEl;
        while (true) {
            let nextSibl = startEl.nextElementSibling;
            if (!nextSibl || nextSibl === download)
                break;
            else {
                description.push(nextSibl.innerHTML);
                startEl = nextSibl;
            }
        }
    }

    // TODO:  sanitize description -- leave only p, ul, li

    const tagListEl = htmlBody.querySelectorAll('.entry-meta > .tagcloud > a');
    const tags = Array.prototype.map.call(tagListEl, item => item.textContent);
    
    data.name = name;
    data.cat = categories;
    data.img = path.join(__dirname, 'images', pageName.concat(contImgExt));
    data.info = info;
    data.description = description;
    data.tags = tags;

    // сохраним картинку
    request
        .get(siteAddr.concat(contImgSrc))
        .on('error', (err) => {
            throw err;
        })
        .pipe(fs.createWriteStream(data.img));
    
    return data;

};


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
        
        try {
            if (error)
                throw error;
            if (response.statusCode !== 200)
                throw new Error('error getting resource ' + currUrl);
            
            let savePath = path.join(__dirname, 'pages', fileName.concat('.html'));
            fs.writeFile(savePath, body, (err) => {
                if (err) console.log(error);
            });
            const html = body.match(/<body.*?>.+<\/body>/s)[0].replace(/<script.*?>[\s\S]*?<\/script>/gs, "");
            const htmlDom = new JSDOM(html);
            const htmlBody = htmlDom.window.document.body;

            const pageData = scrapePage(htmlBody, fileName);

            savePath = path.join(__dirname, 'data', fileName.concat('.json'));
            fs.writeFile(savePath, JSON.stringify(pageData), (err) => {
                if (err) throw error;
            });

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

    });
};

next();

