const { app, BrowserWindow, ipcMain } = require('electron');
const { existsSync } = require('fs');
const { execSync } = require('child_process');
const request = require('request');
const { Client } = require('ssh2');

const config = require('./config');

let win;

function createWindow() {
  win = new BrowserWindow({ width: 800, height: 600 });
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

function pdftk(command) {
  return new Promise((resolve, reject) => {
    try {
      let output = execSync(`pdftk ${command}`, { env: { PATH: '/usr/local/bin/:/usr/bin/' } }).toString();
      resolve(output);
    } catch (e) {
      reject(e);
    }
  });
};

function getPdfPath(dateSerialized, pageNumber) {
  const [year, month, day] = dateSerialized.split('-');
  const page = pageNumber ? `.${pageNumber}` : '';

  return `${config.path}/${month}-${day}-${year.substr(-2)}.PN_A${page}.pdf`;
};

function checkPages(args, sendClientAlert) {
  const { dateSerialized, dateText } = args;

  const pdfPath = getPdfPath(dateSerialized);
  if (existsSync(pdfPath)) {
    sendClientAlert({ needsConfirmation: true, dateSerialized, dateText, pdfPath, taskName: `Date: ${dateText}\nExported PDF exists -- are you ready to SEND?` });
  } else {
    sendClientAlert({ taskName: `Exported PDF exists at ${pdfPath}`, status: 'fail' });
  }
};

function sendPages(args, sendClientAlert) {
  // ready to get started!
  sendClientAlert({ taskName: 'Exported PDF exists', status: 'success' });

  const getPageNumbers = (args) => {
    sendClientAlert({ taskName: `Preparing to read PDF`, status: 'pending' });
    return pdftk(`${args.pdfPath} dump_data`).then((lines) => {
      pageNumbers = lines.split("\n").filter((line) => { return line.includes('NumberOfPages'); });
      pageNumbers = Number(pageNumbers[0].split('NumberOfPages: ')[1]);
      sendClientAlert({ taskName: `Preparing to read PDF`, status: 'success' });
      return Promise.resolve(pageNumbers);
    }).catch((e) => {
      sendClientAlert({ taskName: `Preparing to read PDF`, status: 'fail' });
      sendClientAlert({ taskName: `ERROR: ${e}`, status: 'fail' });
      return Promise.reject();
    });
  };

  const forEachPage = (pageNumbers, cb) => {
    return Promise.all(Array.from(Array(pageNumbers)).map((x, i) => { return cb(i + 1); }));
  };

  const splitPages = (pageNumbers) => {
    // split up PDFs up into individual PDFs
    sendClientAlert({ taskName: `Preparing ${pageNumbers} pages`, status: 'pending' });

    return forEachPage(pageNumbers, (pageNumber) => {
      return pdftk(`${args.pdfPath} cat ${pageNumber}-${pageNumber} output ${getPdfPath(args.dateSerialized, pageNumber)}`)
      .catch((e) => {
        sendClientAlert({ taskName: `ERROR: ${e}`, status: 'fail' });
        sendClientAlert({ taskName: `Preparing ${pageNumbers} pages`, status: 'fail' });
        return Promise.reject();
      });
    }).then(() => {
      sendClientAlert({ taskName: `Preparing ${pageNumbers} pages`, status: 'success' });
      return Promise.resolve(pageNumbers);
    });
  };

  const transferPages = (pageNumbers) => {
    const conn = new Client();
    const ftpSettings = Object.assign({}, { port: 22 }, config.ftp_settings);

    return new Promise((resolve, reject) => {
      conn.on('error', reject);
      conn.on('close', reject);
      conn.on('ready', () => {
        conn.sftp((err, sftp) => {
          if (err) return reject(err);
          resolve(sftp);
        });
      });
      conn.connect(ftpSettings);
    }).then((sftp) => {
      return forEachPage(pageNumbers, (pageNumber) => {
        return new Promise((resolve, reject) => {
          try {
            const originFilename = getPdfPath(args.dateSerialized, pageNumber);
            var destFilename = originFilename.split("/");
            destFilename = `uploads/${destFilename[destFilename.length - 1]}`;
            sftp.fastPut(originFilename, destFilename, resolve);
          } catch (e) {
            return reject(e);
          }
        });
      });
    }).then(() => {
      return new Promise((resolve, reject) => {
        conn.removeAllListeners('close');
        conn.on('close', resolve.bind(null, pageNumbers));
        conn.end();
      });
    }).catch((e) => {
      sendClientAlert({ taskName: `ERROR: ${e}`, status: 'fail' });
      sendClientAlert({ taskName: `Sending ${pageNumbers} pages to printer`, status: 'fail' });
      return Promise.reject();
    });
  };

  const sendSuccessNotification = (pageNumbers) => {
    sendClientAlert({ taskName: `Sending ${pageNumbers} pages to printer`, status: 'success' });

    request.post({
      uri: config.slack_url,
      form: {
        payload: JSON.stringify({
          channel: config.slack_channel,
          icon_emoji: ':bird:',
          text: `Pages sent for ${args.dateText}`,
          username: 'crow'
        })
      }
    }, (error, response, body) => {
      console.log(response.statusCode);
      console.log(body);

      sendClientAlert({ taskName: 'SUCCESS', status: 'success' });
      return Promise.resolve();
    });
  };

  getPageNumbers(args).then(splitPages).then(transferPages).then(sendSuccessNotification).catch(console.log);
};

ipcMain.on('send-pages', (event, args) => {
  const sendClientAlert = (cbArg) => { event.sender.send('send-pages-alert', cbArg); };

  return args.confirmed ? sendPages(args, sendClientAlert) : checkPages(args, sendClientAlert);
});
