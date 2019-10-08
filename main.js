const { app, BrowserWindow, ipcMain } = require('electron');
const { existsSync } = require('fs');
const { execSync } = require('child_process');
const request = require('request-promise');
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

const forEachPage = (pageNumbers, cb) => Promise.all(pageNumbers.map(cb));
const getPdfPath = (selectedFile, pageNumber) =>  selectedFile.replace('PN_A.pdf', `PN_A.${pageNumber}.pdf`);
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

class Checker {
  constructor({ selectedFile }, sendClientAlert) {
    this.selectedFile = selectedFile;
    this.sendClientAlert = sendClientAlert;
  }

  execute() {
    return this._checkFile().then(this._getPageNumbers.bind(this));
  }

  _checkFile() {
    if (this.selectedFile.endsWith('.PN_A.pdf')) {
      return Promise.resolve();
    } else {
      this.sendClientAlert({ taskName: `Invalid file: ${this.selectedFile}`, status: 'fail' });
      return Promise.reject();
    }
  }

  _getPageNumbers() {
    return pdftk(`${this.selectedFile} dump_data`).then((lines) => {
      var pageNumbers = lines.split("\n").filter((line) => { return line.includes('NumberOfPages'); });
      pageNumbers = Number(pageNumbers[0].split('NumberOfPages: ')[1]);

      const slashSplit = this.selectedFile.split('/');
      const dotSplit = slashSplit[slashSplit.length - 1].split('.');
      const dateSerialized = dotSplit[0];

      this.sendClientAlert({ dateSerialized, needsConfirmation: true, pageNumbers, selectedFile: this.selectedFile, taskName: 'Ready to send page(s)' });

      return Promise.resolve();
    }).catch((e) => {
      this.sendClientAlert({ taskName: `Preparing to read PDF`, status: 'fail' });
      this.sendClientAlert({ taskName: `ERROR: ${e}`, status: 'fail' });
      return Promise.reject();
    });
  };
}

class Sender {
  constructor({ dateSerialized, selectedFile, pageNumbersToSend }, sendClientAlert) {
    this.dateSerialized = dateSerialized;
    this.selectedFile = selectedFile;
    this.sendClientAlert = sendClientAlert;

    if (Array.isArray(pageNumbersToSend)) {
      this.pageNumbers = pageNumbersToSend;
    } else {
      this.pageNumbers = Array.from({ length: pageNumbersToSend }, (v, k) => { return k + 1; });
    }
  }

  execute() {
    return this._splitPages()
      .then(this._transferPages.bind(this))
      .then(this._sendSuccessNotification.bind(this));
  }

  _splitPages() {
    this.sendClientAlert({ taskName: `Preparing ${this.pageNumbers.length} page(s)`, status: 'pending' });

    return forEachPage(this.pageNumbers, (pageNumber) => {
      return pdftk(`${this.selectedFile} cat ${pageNumber}-${pageNumber} output ${getPdfPath(this.selectedFile, pageNumber)}`)
      .catch((e) => {
        this.sendClientAlert({ taskName: `Preparing ${this.pageNumbers.length} page(s)`, status: 'fail' });
        this.sendClientAlert({ taskName: `ERROR: ${e}`, status: 'fail' });
        return Promise.reject();
      });
    }).then(() => {
      this.sendClientAlert({ taskName: `Preparing ${this.pageNumbers.length} page(s)`, status: 'success' });
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
          conn.put(originFilename, destFilename, (err) => { err ? reject(err) : resolve(); });
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
      this.sendClientAlert({ taskName: `Sending ${this.pageNumbers.length} page(s) to the printer`, status: 'fail' });
      return Promise.reject();
    });
  };

  _sendSuccessNotification() {
    this.sendClientAlert({ taskName: `Sending ${this.pageNumbers.length} page(s) to the printer`, status: 'success' });

    return request({
      method: 'POST',
      uri: config.slack_settings.webhook_url,
      form: {
        payload: JSON.stringify(Object.assign({}, { text: `Sent ${this.pageNumbers.length } page(s) for ${this.dateSerialized}` }, config.slack_settings))
      }
    })
    .then(() => {
      this.sendClientAlert({ taskName: `Success: Sent page(s) ${this.pageNumbers.join(', ')}`, status: 'success' });
      return Promise.resolve();
    });
  };
}

ipcMain.on('send-pages', (event, args) => {
  const execute = (klass, sendClientAlert) => ((args) => (new klass(args, sendClientAlert)).execute().catch(console.log));
  const sendClientAlert = (cbArg) => { event.sender.send('send-pages-alert', cbArg); };

  const executor = args.confirmed ? Sender : Checker;
  return execute(executor, sendClientAlert)(args, sendClientAlert);
});
