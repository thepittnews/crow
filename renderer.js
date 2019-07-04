const { ipcRenderer, shell, remote: { dialog } } = require("electron");
const { printerPagesLink } = require('./config');

const statusCssMap = {
  'pending': 'warning',
  'fail': 'danger',
  'success': 'success'
};

const enableSendButton = () => document.getElementById("sendButton").disabled = false;
const addSendStatus = (location, text) => document.getElementById('sendStatus').insertAdjacentHTML(location, text);

const getConfirmation = (args) => {
  const { dateSerialized, taskName } = args;

  const confirmed = confirm(taskName);
  if (confirmed) {
    addSendStatus('afterbegin', `<h4 class="center">Run Log for ${dateSerialized}:</h4>`);
    ipcRenderer.send('send-pages', Object.assign({}, { confirmed: true }, args));
  } else {
    enableSendButton();
  }
};

ipcRenderer.on('send-pages-alert', (event, args) => {
  if (args.needsConfirmation) return getConfirmation(args);

  const { status, taskName } = args;
  const taskId = taskName.split(/[^A-Za-z0-9]/).join("_");
  const element = document.querySelector(`#sendStatus > #${taskId}`);
  const cssClass = `alert alert-${statusCssMap[status]}`;

  if (element) {
    element.className = cssClass;
  } else {
    addSendStatus('beforeend', `<div class="${cssClass}" role="alert" id="${taskId}">${taskName}</div>`);
  }

  if ((taskName === 'SUCCESS' && status === 'success') || (status === 'fail')) {
    enableSendButton();
    addSendStatus('beforeend', `<div class="alert alert-info" role="alert"><a class="alert-link" href="${printerPagesLink}">Check printer pages</a></div>`);
  }
});

const initializePage = () => {
  document.getElementById("sendButton").addEventListener("click", (e) => {
    document.getElementById("sendStatus").innerHTML = '';

    dialog.showOpenDialog({ properties: ['openFile'] }, (selectedFiles) => {
      e.toElement.disabled = true;
      ipcRenderer.send('send-pages', { confirmed: false, selectedFile: selectedFiles[0] });
    });
  });

  document.addEventListener('click', function(e) {
    if (e.target.href) {
      e.preventDefault();
      shell.openExternal(e.target.href);
    }
  });
};

initializePage();
