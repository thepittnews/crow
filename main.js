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
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // On macOS it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (win === null) {
    createWindow();
  }
});

function pdftk(command) {
  return execSync(`pdftk ${command}`, { env: { PATH: '/usr/local/bin/:/usr/bin/' } }).toString();
};

function getPdfPath(dateSerialized, pageNumber) {
  const [year, month, day] = dateSerialized.split('-');
  const page = pageNumber ? `.${pageNumber}` : '';

  return `${config.path}/${month}-${day}-${year.substr(-2)}.PN_A${page}.pdf`;
};

function checkPages(args, sendClientAlert) {
  const { dateSerialized, dateText } = args;

  const pdfPath = getPdfPath(dateSerialized);
  const pdfExists = existsSync(pdfPath);

  if (pdfExists) {
    sendClientAlert({ needsConfirmation: true, dateSerialized, dateText, pdfPath, taskName: `Date: ${dateText}\nExported PDF exists -- are you ready to SEND?` });
  } else {
    sendClientAlert({ taskName: `Exported PDF exists at ${pdfPath}`, status: 'fail' });
  }
};

function sendPages(args, sendClientAlert) {
  // ready to get started!
  sendClientAlert({ taskName: 'Exported PDF exists', status: 'success' });

  // get number of pages
  sendClientAlert({ taskName: `Preparing to read PDF`, status: 'pending' });
  try {
    var pageNumbers = pdftk(`${args.pdfPath} dump_data`).split("\n").filter((line) => { return line.includes('NumberOfPages'); });
    pageNumbers = Number(pageNumbers[0].split('NumberOfPages: ')[1]);
    sendClientAlert({ taskName: `Preparing to read PDF`, status: 'success' });
  } catch (e) {
    sendClientAlert({ taskName: `Preparing to read PDF`, status: 'fail' });
    sendClientAlert({ taskName: `ERROR: ${e}`, status: 'fail' });
    return;
  }

  // split up PDFs up into individual PDFs
  sendClientAlert({ taskName: `Preparing ${pageNumbers} pages`, status: 'pending' });

  for(var i = 1; i <= pageNumbers; i++) {
    try {
      sendClientAlert({ taskName: `> Preparing page ${i}`, status: 'pending' });
      pdftk(`${args.pdfPath} cat ${i}-${i} output ${getPdfPath(args.dateSerialized, i)}`);
      sendClientAlert({ taskName: `> Preparing page ${i}`, status: 'success' });
    } catch (e) {
      sendClientAlert({ taskName: `> Preparing page ${i}`, status: 'fail' });
      sendClientAlert({ taskName: `ERROR: ${e}`, status: 'fail' });
      sendClientAlert({ taskName: `Preparing ${pageNumbers} pages`, status: 'fail' });
      return;
    }
  }

  sendClientAlert({ taskName: `Preparing ${pageNumbers} pages`, status: 'success' });

  // send to printer servers
  sendClientAlert({ taskName: `Sending ${pageNumbers} pages to printer`, status: 'pending' });

  const conn = new Client();
  const ftpSettings = {
    host: config.ftp_host,
    port: 22,
    username: config.ftp_username,
    password: config.ftp_password
  };
  const errorHandler = (e) => {
    sendClientAlert({ taskName: `ERROR: ${e}`, status: 'fail' });
    sendClientAlert({ taskName: `Sending ${pageNumbers} pages to printer`, status: 'fail' });
  };
  var currentPageNumber = 0;

  conn.on('error', errorHandler);

  conn.on('ready', () => {
    conn.sftp((err, sftp) => {
      if (err) return errorHandler(err);

      try {
        for(var i = 1; i <= pageNumbers; i++) {
          var originFilename = getPdfPath(args.dateSerialized, i);
          destFilename = originFilename.split("/");
          destFilename = `uploads/${destFilename[destFilename.length - 1]}`;
          sftp.fastPut(originFilename, destFilename, () => {
            if (i >= pageNumbers) {
              conn.end();
            }
          });
        }
      } catch (e) {
        return errorHandler(e);
      }
    });
  });

  conn.on('close', () => {
    sendClientAlert({ taskName: `Sending ${pageNumbers} pages to printer`, status: 'success' });

    // send notification to slack
    request({
      method: 'POST',
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

      // all done
      sendClientAlert({ taskName: 'SUCCESS', status: 'success' });
    });
  });

  conn.connect(ftpSettings);
};

ipcMain.on('send-pages', (event, args) => {
  const sendClientAlert = (cbArg) => {
    event.sender.send('send-pages-alert', cbArg);
  };

  if (args.confirmed === true) {
    sendPages(args, sendClientAlert);
  } else {
    checkPages(args, sendClientAlert);
  }
});
