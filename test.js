var lineReader = require('line-reader');

lineReader.eachLine('scanlib-missed.txt', function(line, last, cb) {
  console.log(line);
  if (last) {
    cb(false); // stop reading
  }
if (line.trim() === '')
    cb();
else {
setTimeout(() => {
    cb();
}, 1000);
  }
});