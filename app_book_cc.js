const request = require("request");
const jsdom = require("jsdom");
const fs = require("fs");
const path = require("path");
const lineReader = require("line-reader");
const shortid = require("shortid");
const { JSDOM } = jsdom;
const { logLineAsync } = require("./utils");
const cyrillicToTranslit = require('cyrillic-to-translit-js');

const logFN = path.join(__dirname, "_server.log");
const pagesPath = path.join(__dirname, "pages");
const imgPath = path.join(__dirname, "images");
const dataPath = path.join(__dirname, "data");
const siteAddr = "https://by1lib.org/";
const host = "by1lib.org";
const urlDivider = "https://by1lib.org/book/";

const workMode = {
  isLocal: false,
  localPath: path.join(__dirname, "src", "response.html"),
};
const parseURLSource = path.join(__dirname, "src", "urls-cc.txt");
const reqTimeout = 4000 + 4000 * Math.random();

[pagesPath, imgPath, dataPath].forEach((pth) => {
  if (!fs.existsSync(pth)) {
    fs.mkdirSync(pth);
  }
});

const extractBodyTag = (resBody) => {
  const html = resBody
    .match(/<body.*?>.+<\/body>/s)[0]
    .replace(/<script.*?>[\s\S]*?<\/script>/gs, "");
  const htmlDom = new JSDOM(html);
  return htmlDom.window.document.body;
};

const scrapeB_OK_CC_Page = (htmlBody, url) => {
  let data = {}; // собранная со страницы информация

  var headingNode = htmlBody.querySelector("h1");
  // Название
  var heading = headingNode ? headingNode.textContent.trim() : null;
  let clearedHeading = heading.replace(/[:,;\._'"&!\?\/#]/g,"")
  let pageId = cyrillicToTranslit().transform(clearedHeading, "-").toLowerCase();

  // Категория
  var category = ["Books"];

  if (!heading) {
    logLineAsync(logFN, "Не найден ключевой элемент (h1) на странице ");
    return null;
  }

  // Container
  var main = headingNode.parentNode;

  var authorNodes = main.querySelectorAll("a[itemprop='author']");
  // Автор
  var author = (authorNodes && authorNodes.length > 0)
    ? Array.prototype.map.call( authorNodes, a => a.textContent.trim())
    : null;

  var descrNode = main.querySelector("#bookDescriptionBox");
  var descrElems = descrNode ? descrNode.childNodes : null;
  // Описание
  var descrDataSet = null;

  if (descrElems && descrElems.length) {
    descrDataSet = [];
    Array.prototype.forEach.call(descrElems, (ds) => {
      let dH = {};
      if (ds.nodeType == 3) {
        var nodeText = ds.textContent.trim();
        if (nodeText.length > 0) {
          dH["span"] = nodeText;
        }
      } else if (ds.nodeType == 1) {
        var tn = ds.tagName.toLowerCase();
        if (tn === "p") {
          dH[tn] = ds.textContent;
        } else if (tn === "ul") {
          var liNodes = ds.children;
          var iiValues = Array.prototype.map.call(liNodes, (i) =>
            i.textContent.trim()
          );
          dH[tn] = iiValues;
        }
      }
      if (Object.keys(dH).length > 0) {
        descrDataSet.push(dH);
      }
    });
  }

  // Свойства
  var props = null;
  var propsElem = htmlBody.querySelector(".bookDetailsBox");

  if (propsElem) {
    props = {};

    Array.prototype.forEach.call(propsElem.children, (d) => {
      let prop = null;
      try {
        prop = d.textContent.split(":").map((v) => v.trim());
        if (prop && prop.length === 2) {
          props[prop[0].toLowerCase()] = prop[1];
        }
      } catch (e) {
        logLineAsync(logFN, JSON.stringify(e));
      }
    });

    if ("file" in props) {
      let fileData = props.file.split(",");
      props.format = [];
      props.format.push(fileData[0].trim());
      let sizeData = fileData.length === 2 ? fileData[1].trim().split(" ") : null;
      let sizeValue = sizeData ? sizeData[0].trim() : null;
      let sizeUnits = sizeData && sizeData.length === 2 ? sizeData[1].trim() : null;
      if (sizeValue && sizeUnits) {
        props.size = {};
        props.size.value = sizeValue;
        props.size.units = sizeUnits;
      }
    }
  }

  var imgExt = ""; // изначально расширение изображения нам неизвестно
  var coverNode = htmlBody.querySelector(".z-book-cover > img");
  // Обложка
  var coverSrc = coverNode ? coverNode.getAttribute("src") : "no-cover";

  if (/\.jpe?g$/.test(coverSrc)) imgExt = ".jpg";
  else if (/\.png$/.test(coverSrc)) imgExt = ".png";
  else if (/\.webp$/.test(coverSrc)) imgExt = ".webp";

  let imgSaveName = shortid.generate();
  let imgPath = path.join(__dirname, "images", imgSaveName.concat(imgExt));

  data.heading = heading;
  data.author = author;
  data.category = category;
  
  data.props = {};
  data.props.size = (props && "size" in props) ? props.size : {};
  data.props.format = (props && "size" in props) ? props.format : [];
  data.props.pages = props.pages;
  data.props.language = props.language;
  data.props.publisher = props.publisher;

  data.description = descrDataSet;
  data.origName = pageId;
  data.pubDate = props.year || 'unknown';
  data.cover = imgSaveName;
  data.isbn = props["isbn 13"] || 'unknown';
  data.isbn10 = props["isbn 10"] || 'unknown';
  data.url = url;

  // сохраним картинку
  try {
    request
      .get(coverSrc)
      .on("error", (err) => {
        logLineAsync(logFN, "Ошибка загрузки изображения: " + coverSrc);
      })
      .pipe(fs.createWriteStream(imgPath));
  } catch(e) {
    logLineAsync(logFN, "Ошибка загрузки изображения: " + coverSrc);
    data.cover = null;
  } finally {
    return data;
  }

};

const nextReq = (currUrl, cookieJar) => {
  return new Promise((resolve, reject) => {
    if (!currUrl) {
      logLineAsync(logFN, "Не передан адрес страницы для парсинга!");
      reject();
    }

    
    let headers = {
      Host: host,
      "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:72.0) Gecko/20100101 Firefox/72.0",
      Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
      "Accept-Language": "ru,en-US;q=0.7,en;q=0.3",
      DNT: 1,
      Connection: "keep-alive",
      "Upgrade-Insecure-Requests": 1,
      Pragma: "no-cache",
      "Cache-Control": "no-cache",
      TE: "Trailers",
    };

    // "Accept-Encoding": "gzip, deflate, br",
    
    let jar = cookieJar ? cookieJar : request.jar();
    
    request(
      {
        url: currUrl,
        method: "GET",
        jar: jar,
        timeout: 10000,
        followRedirect: true,
        headers: headers,
      },
      (error, response, body) => {
        try {
          if (error) {
            logLineAsync(
              logFN,
              "Ошибка! Не удалось отправить запрос " + currUrl
            );
            throw error;
          }
          if (response.statusCode !== 200) {
            logLineAsync(
              logFN,
              "Сервер ответил с кодом, отличным от 200 " + currUrl
              );
          }
          
          let htmlBody = extractBodyTag(body);
          let pageData = scrapeB_OK_CC_Page(htmlBody, currUrl);

          let pageURI = currUrl.split(urlDivider);
          let pageId = (pageURI.length === 2) ?
            pageData.origName + "__".concat(currUrl.split(urlDivider)[1].replace("/", "-"))
            :
            pageData.origName;

          let savePath = path.join(__dirname, "pages", pageId.concat(".html"));

          fs.writeFile(savePath, body, (err) => {
            if (err) logLineAsync(logFN, err);
          });


          savePath = path.join(__dirname, "data", pageId.concat(".json"));
          fs.writeFile(savePath, JSON.stringify(pageData), (err) => {
            if (err) {
              logLineAsync(
                logFN,
                "ОШИБКА! Не удалось сохранить в json данные со страницы " +
                  pageId
              );
              throw err;
            }
          });
        } catch (err) {
          logLineAsync(logFN, err);
        } finally {
          resolve(jar);
        }
      }
    ); //request.get
  }); // Promise
}; // nextReq

const isExists = (targPath) => {
  fs.access(targPath, fs.F_OK, (err) => {
    if (err) {
      logLineAsync(logFN, err);
      return Promise.reject();
    } else {
      return Promise.resolve();
    }
  });
};

const readLocal = (path) => {
  return new Promise(async (resolve, reject) => {
    try {
      // проверка на наличие файла
      await isExists(path);
      fs.readFile(path, "utf8", (err, data) => {
        if (err) {
          throw err;
        } else {
          let htmlBody = extractBodyTag(data);
          let pageData = scrapeB_OK_CC_Page(htmlBody);
          resolve(pageData);
        }
      });
    } catch (err) {
      console.log(err);
      reject();
    }
  }); // Promise
}; // readLocal

const requestor = () => {
  if (workMode.isLocal) {
    (async () => {
      let parsedData = await readLocal(workMode.localPath); // тестовый парсинг локального файла
      logLineAsync(logFN, JSON.stringify(parsedData));
    })();
    return;
  }

  let cookieJar;
  lineReader.eachLine(parseURLSource, function (line, last, cb) {
    if (last) {
      cb(false); // stop reading
    }
    if (line.trim() === "" || !/^https/.test(line)) cb();
    else {
      let nextTarget = line.trim();
      logLineAsync(logFN, "Запрашиваю страницу " + nextTarget);
      setTimeout(async () => {
        try {
          cookieJar = await nextReq(nextTarget, cookieJar); // боевой парсинг по ссылкам
        } catch (err) {
          logLineAsync(logFN, err);
        } finally {
          cb();
        }
      }, reqTimeout);
    }
  });
};

// старт
requestor();
