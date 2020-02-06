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
const siteAddr = 'https://scanlibs.com/'
const reqTimeout = 4000 + 4000 * Math.random();

[pagesPath, imgPath, dataPath].forEach(pth => {
    if (!fs.existsSync(pth)) {
        fs.mkdirSync(pth);
    }
})


const extractBodyTag = resBody => {
    const html = resBody.match(/<body.*?>.+<\/body>/s)[0].replace(/<script.*?>[\s\S]*?<\/script>/gs, "");
    const htmlDom = new JSDOM(html);
    return htmlDom.window.document.body;
};


const scrapePage = (htmlBody) => {
    let data = {};

    const procVideoInfo = pipedInfoString => {
        const cleanInfo = [];
        const infoArr = pipedInfoString.replace(/\n/g,'').replace(/\n/g,'').replace(/<br\/?>/gm,' | ').split('|');
        infoArr.forEach(item => {
            if (/Skill level/i.test(item)) {
                data.skill = item.split(':')[1].trim();
                let indexToRemove = infoArr.indexOf(item);
                infoArr.splice(indexToRemove, 1);
            } else {
                cleanInfo.push(item.trim());
            }
        })
        return cleanInfo;
    };

    // Extracting data
    const heading = htmlBody.querySelector('h1').textContent;
    const categoryItems = htmlBody.querySelector('span.cat-links').children;
    let categories = Array.prototype.slice.call(categoryItems);
    categories = categories
        .filter(item => item.nodeName === 'A')
        .map(item => item.textContent)
        .filter(item => (item));

    let imgSrc = htmlBody.querySelector('.entry-content > img').getAttribute('src');
    let imgExt = ""; // изначально расширение изображения нам неизвестно

    if (/\.jpe?g$/.test(imgSrc))
        imgExt = '.jpg';
    else if (/\.png$/.test(imgSrc))
        imgExt = '.png';
    else if (/\.webp$/.test(imgSrc))
        imgExt = '.webp';

    const container = htmlBody.querySelector('.entry-content');
    if (!container) throw new Error('Data containin element is missing');
    const info = {};
    const description = [];

    const dlBtnDiv = container.querySelector('a[href="#download"]').parentElement;
    const descrPars = container.querySelectorAll('p');
    const descrLists = container.querySelectorAll('ul');
    const stopperElem = container.querySelector('#download');

    const chldNodes = container.childNodes;
    let counter = 0;
    let aboveDlBtn = true;
    while (counter < chldNodes.length) {
        let curr = chldNodes[counter];
        if (curr === stopperElem)
            break;
        if (curr === dlBtnDiv)
            aboveDlBtn = false;
        if (curr.nodeType === 3 && curr.textContent.trim() !== '' && aboveDlBtn) {
            let key = '';
            let value = '';
            let properties = curr.textContent.trim().split(':');
            key = properties[0];
            if (properties.length > 1) {
                value = properties.slice(1).join(':').trim(); // если значение в свою очередь само имело знак :
            }
            info[key] = value;
        } else if (descrPars.indexOf(curr) !== -1) {
            if (!aboveDlBtn) {
                description.push({p: curr});
            } else {
                info.video = procVideoInfo(curr.innerHTML);
            } 
        } else if (descrLists.indexOf(curr) !== -1) {
            description.push({ul: curr});
        }
        counter++;
    }

    

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
    data.imgPath = path.join(__dirname, 'images', imgSaveName.concat(imgExt));
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

        let jar = cookieJar ? cookieJar : request.jar();

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

                let htmlBody = extractBodyTag(body)
                let pageData = scrapePage(htmlBody);

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
    }); // Promise

}; // nextReq


const isExists = targPath => {
    fs.access(targPath, fs.F_OK, (err) => {
        if (err) {
            console.log(err)
            return Promise.reject();
        } else {
            return Promise.resolve();
        }
    })
};


const readLocal = path => {
    return new Promise(async (resolve, reject) => {
        try {
            // проверка на наличие файла
            await isExists(path);
            fs.readFile(path, 'utf8', (err, data) => {
                if (err) {
                    throw err;
                } else {
                    let htmlBody = extractBodyTag(data)
                    let pageData = scrapePage(htmlBody);
                    resolve(pageData);
                }
            })
        } catch(err) {
            console.log(err);
            reject();
        }
    }); // Promise
}; // readLocal


const requestor = () => {
    let cookieJar;
    lineReader.eachLine('scanlib-missed.txt', function (line, last, cb) {
        console.log(line);
        if (last) {
            cb(false); // stop reading
        }
        if (line.trim() === '')
            cb();
        else {
            let nextTarget = line.trim();
            setTimeout(async () => {
                try {
                    //cookieJar = await nextReq(nextTarget, cookieJar);
                    let parsedData = await readLocal(nextTarget);
                    console.log(parsedData);
                } catch (err) {
                    console.log(err);
                } finally {
                    cb();
                }
            }, reqTimeout);
        }
    });
};

// старт
requestor();