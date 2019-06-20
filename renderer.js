const { ipcRenderer } = require("electron");
const { dialog } = require('electron').remote;

const statusCssMap = {
  'pending': 'warning',
  'fail': 'danger',
  'success': 'success'
};

const enableSendButton = () => {
  document.getElementById("sendButton").disabled = false;
};

const getConfirmation = (arg) => {
  const { dateSerialized, taskName } = arg;

  const confirmed = confirm(taskName);
  if (confirmed) {
    document.getElementById('sendStatus').insertAdjacentHTML(
      'afterbegin',
      `<h3 style="text-align: center">Run Log for ${dateSerialized}:</h3>`
    );

    ipcRenderer.send('send-pages', Object.assign({}, { confirmed: true }, arg));
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
    document.getElementById('sendStatus').insertAdjacentHTML(
      'beforeend',
      `<div class="${cssClass}" role="alert" id="${taskId}">${taskName}</div>`
    );
  }

  if ((taskName === 'SUCCESS' && status === 'success') || (status === 'fail')) enableSendButton();
});

const initializePage = () => {
  document.getElementById("sendButton").addEventListener("click", (e) => {
    document.getElementById("sendStatus").innerHTML = '';

    dialog.showOpenDialog({ properties: ['openFile'] }, (selectedFiles) => {
      e.toElement.disabled = true;
      ipcRenderer.send('send-pages', { confirmed: false, selectedFile: selectedFiles[0] });
    });
  });
};

initializePage();
