const request = require('request');
const jsdom = require("jsdom");
const fs = require('fs');
const path = require('path');
const lineReader = require('line-reader');
const shortid = require('shortid');
const { JSDOM } = jsdom;

const pagesPath = path.join(__dirname, 'pages');
const imgPath = path.join(__dirname, 'images');
const dataPath = path.join(__dirname, 'data');

[pagesPath, imgPath, dataPath].forEach(pth => {
    if (!fs.existsSync(pth)) {
        fs.mkdirSync(pth);
    }
})

const siteAddr = 'https://scanlibs.com/'
const timeout = 4000 + 4000 * Math.random();

// let urls = [
// 'https://scanlibs.com/learning-svg/',
// 'https://scanlibs.com/jump-start-sass/'
// ];


const scrapePage = (htmlBody) => {
    let data = {};

    // Extracting data
    const heading = htmlBody.querySelector('h1').textContent;
    const categoryItems = htmlBody.querySelector('span.cat-links').children;
    let categories = Array.prototype.slice.call(categoryItems);
    categories = categories
        .filter(item => item.nodeName === 'A')
        .map(item => item.textContent)
        .filter(item => (item));

    let imgSrc = htmlBody.querySelector('.entry-content > img').getAttribute('src');
    let contImgExt = ""; // изначально расширение изображения нам неизвестно

    if (/\.jpe?g$/.test(imgSrc))
        contImgExt = '.jpg';
    else if (/\.png$/.test(imgSrc))
        contImgExt = '.png';
    else if (/\.webp$/.test(imgSrc))
        contImgExt = '.webp';

    const container = htmlBody.querySelector('.entry-content');
    if (!container) throw new Error('Data containin element is missing');
    const info = {};
    const description = [];
    const descriptionEl = container.querySelector('p');


    const chldNodes = container.childNodes;
    let counter = 0;
    while (counter < chldNodes.length) {
        let curr = chldNodes[counter];
        if (curr === descriptionEl)
            break;
        if (curr.nodeType === 3 && curr.textContent.trim() !== '') {
            let key = '';
            let value = '';
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

    let imgSaveName = shortid.generate();

    data.heading = heading;
    data.cat = categories;
    data.imgPath = path.join(__dirname, 'images', imgSaveName.concat(contImgExt));
    data.info = info;
    data.description = description;
    data.tags = tags;

    // сохраним картинку
    request
        .get(siteAddr.concat(imgSrc))
        .on('error', (err) => {
            throw err;
        })
        .pipe(fs.createWriteStream(data.imgPath));

    return data;

};


// const planNextReq = async (url, cb, cookies, delay) => {
// delay = delay||timeout;
// setTimeout(() => {
// let resCookies = await nextReq(url, cookies);
// cb();
// }, delay);
// };



const nextReq = (currUrl, cookieJar) => {

    return new Promise((resolve, reject) => {

        if (!currUrl)
            reject('Не передан адрес страницы для парсинга');
        let pageId = currUrl.replace(siteAddr, '').split('/')[0];

        let headers = {
            "Host": "scanlibs.com",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:72.0) Gecko/20100101 Firefox/72.0",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
            "Accept-Language": "ru,en-US;q=0.7,en;q=0.3",
            "Accept-Encoding": "gzip, deflate, br",
            "DNT": 1,
            "Connection": "keep-alive",
            "Upgrade-Insecure-Requests": 1,
            "Pragma": "no-cache",
            "Cache-Control": "no-cache",
            "TE": "Trailers"
        };

        // let reqOpts = {
        //     timeout: 10000,
        //     followRedirect: true,
        //     jar: (cookieJar || request.jar()),
        //     headers: headers
        // };

        let jar = cookieJar ? cookieJar : request.jar();

        //request.get(currUrl, reqOpts, (error, response, body) => {
        request({
            url: currUrl,
            method: 'GET',
            jar: jar,
            timeout: 10000,
            followRedirect: true,
            headers: headers
        }, (error, response, body) => {
            try {
                if (error) {
                    console.log('Ошибка! Нет ответа по адресу ' + currUrl);
                    throw error;
                }
                if (response.statusCode !== 200)
                    throw new Error('error getting resource ' + currUrl);



                let savePath = path.join(__dirname, 'pages', pageId.concat('.html'));

                fs.writeFile(savePath, body, (err) => {
                    if (err) console.log(error);
                });
                const html = body.match(/<body.*?>.+<\/body>/s)[0].replace(/<script.*?>[\s\S]*?<\/script>/gs, "");
                const htmlDom = new JSDOM(html);
                const htmlBody = htmlDom.window.document.body;

                const pageData = scrapePage(htmlBody);
                //pageData.origName = pageId;

                savePath = path.join(__dirname, 'data', pageId.concat('.json'));
                fs.writeFile(savePath, JSON.stringify(pageData), (err) => {
                    if (err) throw error;
                });
            } catch (err) {
                console.log(err);
            } finally {
                resolve(jar);
            }

        }); //request.get
    }); //Promise

}; //nextReq

const requestor = () => {
    let cookieJar;
    lineReader.eachLine('scanlib-missed.txt', function(line, last, cb) {
        console.log(line);
        if (last) {
            cb(false); // stop reading
        }
        if (line.trim() === '')
            cb();
        else {
            let nextUrl = line.trim();
            setTimeout(async () => {
                try {
                    cookieJar = await nextReq(nextUrl, cookieJar);
                } catch (err) {
                    console.log(err);
                } finally {
                    cb();
                }
            }, timeout);
        }
    });
};

// старт
requestor();