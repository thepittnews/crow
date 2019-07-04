const { app, BrowserWindow, ipcMain } = require('electron');
const { existsSync } = require('fs');
const { execSync } = require('child_process');
const request = require('request');
const Client = require('ftp');

const config = require('./config');

let win;

const createWindow = () => {
  win = new BrowserWindow({ width: 800, height: 800 });
  win.loadFile('index.html');
  win.webContents.openDevTools();

  // Emitted when the window is closed.
  win.on('closed', () => {
    // Dereference the window object, usually you would store windows
    // in an array if your app supports multi windows, this is the time
    // when you should delete the corresponding element.
    win = null;
  });
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', createWindow);

// Quit when all windows are closed.
app.on('window-all-closed', () => {
  // On macOS it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  // On macOS it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (win === null) createWindow();
});

const getPdfPath = (selectedFile, pageNumber) => {
  return selectedFile.replace('PN_A.pdf', `PN_A.${pageNumber}.pdf`);
};

const pdftk = (command) => {
  return new Promise((resolve, reject) => {
    try {
      let output = execSync(`pdftk ${command}`, { env: { PATH: '/usr/local/bin/:/usr/bin/' } }).toString();
      resolve(output);
    } catch (e) {
      reject(e);
    }
  });
};

const forEachPage = (pageNumbers, cb) => {
  return Promise.all(Array.from(Array(pageNumbers)).map((x, i) => { return cb(i + 1); }));
};

ipcMain.on('send-pages', (event, args) => {
  const sendClientAlert = (cbArg) => { event.sender.send('send-pages-alert', cbArg); };
  const fn = args.confirmed ? sendPages : checkPages;
  return fn(args, sendClientAlert);
});

const checkPages = (args, sendClientAlert) => {
  const { selectedFile } = args;
  const slashSplit = selectedFile.split('/');
  const dotSplit = slashSplit[slashSplit.length - 1].split('.');
  const dateSerialized = dotSplit[0];

  if (selectedFile.endsWith('.PN_A.pdf')) {
    sendClientAlert({ dateSerialized, needsConfirmation: true, selectedFile, taskName: `${dateSerialized}: PDF exists, ready to send pages?` });
  } else {
    sendClientAlert({ taskName: `Invalid file: ${selectedFile}`, status: 'fail' });
  }
};

class Sender {
  constructor(dateSerialized, selectedFile, sendClientAlert) {
    this.dateSerialized = dateSerialized;
    this.selectedFile = selectedFile;
    this.sendClientAlert = sendClientAlert;
    this.pageNumbers = 0;
  }

  send() {
    return this._getPageNumbers()
      .then(this._splitPages.bind(this))
      .then(this._transferPages.bind(this))
      .then(this._sendSuccessNotification.bind(this));
  }

  _getPageNumbers() {
    this.sendClientAlert({ taskName: `Preparing to read PDF`, status: 'pending' });
    return pdftk(`${this.selectedFile} dump_data`).then((lines) => {
      var pageNumbers = lines.split("\n").filter((line) => { return line.includes('NumberOfPages'); });
      pageNumbers = Number(pageNumbers[0].split('NumberOfPages: ')[1]);
      this.sendClientAlert({ taskName: `Preparing to read PDF`, status: 'success' });
      this.pageNumbers = pageNumbers;

      return Promise.resolve();
    }).catch((e) => {
      this.sendClientAlert({ taskName: `Preparing to read PDF`, status: 'fail' });
      this.sendClientAlert({ taskName: `ERROR: ${e}`, status: 'fail' });
      return Promise.reject();
    });
  };

  _splitPages() {
    this.sendClientAlert({ taskName: `Preparing ${this.pageNumbers} pages`, status: 'pending' });

    return forEachPage(this.pageNumbers, (pageNumber) => {
      return pdftk(`${this.selectedFile} cat ${pageNumber}-${pageNumber} output ${getPdfPath(this.selectedFile, pageNumber)}`)
      .catch((e) => {
        this.sendClientAlert({ taskName: `Preparing ${this.pageNumbers} pages`, status: 'fail' });
        this.sendClientAlert({ taskName: `ERROR: ${e}`, status: 'fail' });
        return Promise.reject();
      });
    }).then(() => {
      this.sendClientAlert({ taskName: `Preparing ${this.pageNumbers} pages`, status: 'success' });
      return Promise.resolve();
    });
  };

  _transferPages() {
    const conn = new Client();

    return new Promise((resolve, reject) => {
      conn.on('error', reject);
      conn.on('close', reject);
      conn.on('ready', () => {
        resolve(conn);
      });
      conn.connect(config.ftp_settings);
    }).then((conn) => {
      return forEachPage(this.pageNumbers, (pageNumber) => {
        return new Promise((resolve, reject) => {
          const originFilename = getPdfPath(this.selectedFile, pageNumber);
          var destFilename = originFilename.split("/");
          destFilename = destFilename[destFilename.length - 1];
          conn.put(originFilename, destFilename, (err) => {
            if (err) {
              reject(err);
            } else {
              resolve();
            }
          });
        });
      });
    }).then(() => {
      return new Promise((resolve, reject) => {
        conn.removeAllListeners('close');
        conn.on('close', resolve);
        conn.end();
      });
    }).catch((e) => {
      this.sendClientAlert({ taskName: `ERROR: ${e}`, status: 'fail' });
      this.sendClientAlert({ taskName: `Sending ${this.pageNumbers} pages to the printer`, status: 'fail' });
      return Promise.reject();
    });
  };

  _sendSuccessNotification() {
    this.sendClientAlert({ taskName: `Sending ${this.pageNumbers} pages to the printer`, status: 'success' });

    request.post({
      uri: config.slack_settings.webhook_url,
      form: {
        payload: JSON.stringify(Object.assign({}, { text: `Pages sent for ${this.dateSerialized}` }, config.slack_settings))
      }
    }, (error, response, body) => {
      debugger;
      console.log(response.statusCode);
      console.log(body);

      this.sendClientAlert({ taskName: 'SUCCESS', status: 'success' });
      return Promise.resolve();
    });
  };
}

const sendPages = (args, sendClientAlert) => {
  const sender = new Sender(args.dateSerialized, args.selectedFile, sendClientAlert);
  return sender.send().catch(console.log);
};
