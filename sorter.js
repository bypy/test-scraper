const fs = require('fs');
const path = require('path');

const targetPath = path.resolve(__dirname, 'data');

const parseSize = (sizeInfo) => {
    const sizeInfoTokens = sizeInfo.split(' ');
    const value = Number(sizeInfoTokens[0]);
    const units = sizeInfoTokens[1];
    switch (units.toLowerCase()) {
        case 'mb':
            return value * 1024 * 1024;
        case 'gb':
            return value * 1024 * 1024 * 1024;
    }
}

const parseDescription = (descriptionAssocArr) => {
    return descriptionAssocArr.map(hashMap => {
        let key = Object.keys(hashMap)[0];
        let value = hashMap[key];
        value = typeof value === 'string' ? value : value.join(',');
        return value.split('\n').join(' ');
    }).join('.')
}

const getSizeAndDescription = (data) => {
    let info = data['info'];
    if (!info)
        return console.log('Info not found in' + JSON.stringify((data)));

    let sizeInBytes, description;
    if (data.category.includes('Books')) {
        if (info['Size']) {
            sizeInBytes = parseSize(info['Size']);
            description = parseDescription(data['description']);
        }
    } else if (data.category.includes('Courses')) {
        if (info['video']) {
            sizeInBytes = parseSize(info['video'].pop());
            description = parseDescription(data['description']);
        }
    }
    return {
        size: sizeInBytes,
        desc: description
    }

}

const fileList = fs.readdirSync(targetPath);
const outFile = fs.createWriteStream('result.csv', {flags: 'w'});

fileList.forEach(fileName => {
    let currFilePath = path.join(__dirname, 'data', fileName);
    let data = fs.readFileSync(currFilePath, {encoding: 'utf8'});
    const jsonData = JSON.parse(data);
    const essData = getSizeAndDescription(jsonData);
    outFile.write(fileName + '\t' + (essData.size/1024/1024).toFixed(0) + '\t' + essData.desc + '\n');
})

outFile.close();




