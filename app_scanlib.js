// noinspection DuplicatedCode,JSIgnoredPromiseFromCall

const request = require("request");
const jsdom = require("jsdom");
const fs = require("fs");
const path = require("path");
const lineReader = require("line-reader");
const shortid = require("shortid");
const {JSDOM} = jsdom;
const {logLineAsync} = require("./utils");

const logFN = path.join(__dirname, "_server.log");
const pagesPath = path.join(__dirname, "pages");
const imgPath = path.join(__dirname, "images");
const dataPath = path.join(__dirname, "data");
const siteAddr = "https://scanlibs.com/";
const reqTimeout = 4000 + 4000 * Math.random();
const srcFile = "src\\urls.txt";

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

const scrapePage = (htmlBody) => {
  let data = {};

  const procVideoInfo = (pipedInfoString) => {
    const cleanInfo = [];
    const infoArr = pipedInfoString
      .replace(/\n/g, "")
      .replace(/\n/g, "")
      .replace(/<br\/?>/gm, " | ")
      .split("|");
    infoArr.forEach((item) => {
      if (/Skill level/i.test(item)) {
        data.skill = item.split(":")[1].trim();
        let indexToRemove = infoArr.indexOf(item);
        infoArr.splice(indexToRemove, 1);
      } else {
        cleanInfo.push(item.trim());
      }
    });
    return cleanInfo;
  };

  const getDescendantListByTag = (nodeTree, searchTagName) => {
    let queryResult = nodeTree.querySelectorAll(searchTagName);
    if (queryResult.length > 0) return Array.prototype.slice.call(queryResult);
    else return null;
  };

  const stripTags = (HTMLMarkup) => {
    let dividerRES = "[ \n\r]";
    let tagNameRES = "[a-zA-Z0-9]+";
    let attrNameRES = "[a-zA-Z]+";
    let attrValueRES = "(?:\".+?\"|'.+?'|[^ >]+)";
    let attrRES =
      "(" +
      attrNameRES +
      ")(?:" +
      dividerRES +
      "*=" +
      dividerRES +
      "*(" +
      attrValueRES +
      "))?";
    let openingTagRES =
      "<(" +
      tagNameRES +
      ")((?:" +
      dividerRES +
      "+" +
      attrRES +
      ")*)" +
      dividerRES +
      "*/?>"; // включает и самозакрытый вариант
    let closingTagRES = "</(" + tagNameRES + ")" + dividerRES + "*>";

    let openingTagRE = new RegExp(openingTagRES, "g");
    let closingTagRE = new RegExp(closingTagRES, "g");

    // удаляет из строки все теги
    function removeTags(str, replaceStr = "") {
      if (typeof str == "string" && str.indexOf("<") !== -1) {
        str = str.replace(openingTagRE, replaceStr);
        str = str.replace(closingTagRE, replaceStr);
      }
      return str;
    }

    return removeTags(HTMLMarkup, "");
  };

  const prepareList = (HTMLMarkup) => {
    return stripTags(HTMLMarkup.trim()).split("\n");
  };

  // Extracting data
  const info = {};
  const description = [];
  const heading = htmlBody.querySelector("h1").textContent;
  const categoryItems = htmlBody.querySelector("span.thecategory").children;
  let categories = Array.prototype.slice.call(categoryItems);

  const filteredCategories = [];
  for (let i = 0; i < categories.length; i++) {
    let categTag = categories[i];
    if (categTag.tagName === "A") {
      let categ = categTag.textContent;
      if (categ.trim() === "") continue;
      try {
        categ.split(",").forEach((ct) => {
          filteredCategories.push(ct.trim());
        });
      } catch {
        filteredCategories.push(categ.trim());
      }
    }
  }

  let imgSrc = htmlBody
    .querySelector(".thecontent > img")
    .getAttribute("src");
  let imgExt = ""; // изначально расширение изображения нам неизвестно

  if (/\.jpe?g$/.test(imgSrc)) imgExt = ".jpg";
  else if (/\.png$/.test(imgSrc)) imgExt = ".png";
  else if (/\.webp$/.test(imgSrc)) imgExt = ".webp";

  const container = htmlBody.querySelector(".thecontent");
  if (!container) {
    logLineAsync(logFN, "Не найден элемент .thecontent на странице ");
    return null;
  }

  const descrPars = getDescendantListByTag(container, "p");
  // const firstParWrapper = descrPars[0].parentNode;
  const underPicDataTag = descrPars[0];
  const descrLists = getDescendantListByTag(container, "ul");

  if (!descrPars && !descrLists) {
    logLineAsync(logFN, "парсить нечего");
    return null; //
  }

  //const dlBtnDiv = container.querySelector('a[href="#download"]').parentElement;
  const stopperElem = container.querySelector("#download");

  const childNodes = container.childNodes;
  let counter = 0;
  while (counter < childNodes.length) {
    let curr = childNodes[counter];
    if (curr === stopperElem) break;
    // заполняю info
    let tmpBookInfo;
    if (curr === underPicDataTag) {
      if (filteredCategories.includes("Courses")) {
        // это описание видео
        info.video = procVideoInfo(underPicDataTag.innerHTML);
      } else {
        tmpBookInfo = procVideoInfo(curr.innerHTML);
        let items = ["Language", "Pub Date", "ISBN", "Pages", "Format", "Size"]
        tmpBookInfo.forEach((item, index) => {
          let key = items[index];
          let outputItem;
          switch (key) {
            case "Pages":
              outputItem = parseInt(item).toString();
              break;
            case "Format":
              outputItem = item.replace(/,\s*/, "/");
              break;
            case "ISBN":
              outputItem = item.replace(/ISBN:\s?/i, "");
              break;
            default:
              outputItem = item;
          }
          info[key] = outputItem;
        })
      }
    } else if (descrPars && descrPars.indexOf(curr) !== -1) {
      description.push({p: stripTags(curr.innerHTML)});
    } else if (descrLists && descrLists.indexOf(curr) !== -1) {
      description.push({ul: prepareList(curr.innerHTML)});
    }

    counter++;
  }

  const tagListEl = htmlBody.querySelectorAll(".entry-meta > .tagcloud > a");
  const tags = Array.prototype.map.call(tagListEl, (item) => item.textContent);

  let imgSaveName = shortid.generate();

  data.heading = heading;
  data.category = filteredCategories;
  data.imgPath = path.join(__dirname, "images", imgSaveName.concat(imgExt));
  data.info = info;
  data.description = description;
  data.tags = tags;

  // сохраним картинку
  request
    .get(siteAddr.concat(imgSrc))
    .on("error", () => {
      logLineAsync(logFN, "Ошибка загрузки изображения: " + imgSrc);
    })
    .pipe(fs.createWriteStream(data.imgPath));

  return data;
};

const nextReq = (currUrl, cookieJar) => {
  return new Promise((resolve, reject) => {
    if (!currUrl) {
      logLineAsync(logFN, "Не передан адрес страницы для парсинга!");
      reject();
    }

    let pageId = currUrl.replace(siteAddr, "").split("/")[0];

    let headers = {
      Host: "scanlibs.com",
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

          let savePath = path.join(__dirname, "pages", pageId.concat(".html"));

          fs.writeFile(savePath, body, (err) => {
            if (err) logLineAsync(logFN, err);
          });

          let htmlBody = extractBodyTag(body);
          let pageData = scrapePage(htmlBody);

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
          let pageData = scrapePage(htmlBody);
          resolve(pageData);
        }
      });
    } catch (err) {
      console.log(err);
      reject();
    }
  }); // Promise
}; // readLocal

const requester = () => {
  let cookieJar;
  lineReader.eachLine(path.resolve(srcFile), function (line, last, cb) {
    if (last) {
      cb(false); // stop reading
    }
    if (line.trim() === "") cb();
    else {
      let nextTarget = line.trim();
      logLineAsync(logFN, "Запрашиваю страницу " + nextTarget);
      setTimeout(async () => {
        try {
          cookieJar = await nextReq(nextTarget, cookieJar); // боевой парсинг по ссылкам
          // await readLocal(nextTarget); // тестовый парсинг локального файла
        } catch (err) {
          await logLineAsync(logFN, err);
        } finally {
          cb();
        }
      }, reqTimeout);
    }
  });
};

// старт
requester();
