const packager = require('electron-packager');
const package = require('./package.json');

packager({
  appVersion: package.version,
  dir: process.cwd(),
  name: `Crow ${package.version}`
});