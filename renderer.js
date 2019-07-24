const { ipcRenderer, shell, remote: { dialog } } = require("electron");
const { printerPagesLink } = require('./config');

const statusCssMap = {
  'pending': 'warning',
  'fail': 'danger',
  'success': 'success'
};

const enableSelectPDFButton = () => document.getElementById("selectPDFButton").disabled = false;
const addSendStatus = (location, text) => document.getElementById('sendStatus').insertAdjacentHTML(location, text);

const getConfirmation = (args) => {
  const { dateSerialized, pageNumbers, taskName } = args;

  const confirmHTML = `
    <div id="sendFormInner">
      <hr><div class="card-text"><h5>Select pages for ${dateSerialized}:</h5></div>

      <div class="row">
        <div class="col-md-6">
          <div class="form-check">
            <label class="form-check-label">
              <input type="radio" class="form-check-input" id="sendAllPages">All pages (1 thru ${pageNumbers})
            </label>
          </div>
          <div class="form-check">
            <label class="form-check-label">
              <input type="radio" class="form-check-input" id="sendSpecificPages">Specific pages
            </label>
          </div>
          <div id="sendSpecificPagesSelectContainer"></div>
        </div>

        <div class="col-md-6">
          <button type="button" class="btn btn-danger" id="sendButton" disabled>SEND</button>
        </div>
      </div>

      <hr><div id="sendStatus"></div>
    </div>
  `;

  const sendPages = (args, type) => {
    const { dateSerialized, pageNumbers, taskName } = args;

    let specificPageNumbers;
    if (document.getElementById('sendSpecificPages').checked) {
      specificPageNumbers = $("select#sendSpecificPagesSelect").val().map(Number);
    }
    const pageNumbersToSend = specificPageNumbers || pageNumbers;

    let task;
    if (type === 'full') {
      task = `${taskName} 1 thru ${pageNumbers} for ${dateSerialized}?`;
    } else {
      task = `${taskName} ${specificPageNumbers.join(', ')} for ${dateSerialized}?`;
    }

    if (confirm(task)) {
      addSendStatus('afterbegin', `<h5 class="center">Run Log for ${dateSerialized}:</h5>`);
      ipcRenderer.send('send-pages', Object.assign({}, { confirmed: true, pageNumbersToSend }, args));

      document.getElementById('sendAllPages').disabled = true;
      document.getElementById('sendSpecificPages').disabled = true;
      document.getElementById('sendButton').disabled = true;
    } else {
      enableSelectPDFButton();
    }
  };

  document.getElementById('sendForm').insertAdjacentHTML('beforeend', confirmHTML);

  let editionType;
  document.getElementById('sendButton').addEventListener('click', (e) => {
    e.preventDefault();
    sendPages(args, editionType);
  });

  document.getElementById('sendAllPages').addEventListener('click', (e) => {
    if (e.target.checked) {
      document.getElementById('sendButton').disabled = false;
      editionType = 'full';
    }
  });

  document.getElementById('sendSpecificPages').addEventListener('click', (e) => {
    if (e.target.checked) {
      document.getElementById('sendSpecificPagesSelectContainer').insertAdjacentHTML(
        'afterbegin',
        `<br><select id="sendSpecificPagesSelect" multiple="multiple" style="width: 100%"></select>`
      );

      const pageNumbersOptions = Array.from(Array(pageNumbers)).map((x, i) => { return { id: (i + 1), text: (i + 1) }; });
      $('select#sendSpecificPagesSelect').select2({ data: pageNumbersOptions });

      document.getElementById('sendButton').disabled = false;
      editionType = 'specific';
    }
  });
};

const initializeListener = () => {
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

    if (taskName.includes('Success:') && status === 'success') {
      enableSelectPDFButton();
      addSendStatus('beforeend', `<div class="alert alert-info" role="alert"><a class="alert-link" href="${printerPagesLink}">Check printer pages</a></div>`);
    }
  });
};

const initializePage = () => {
  document.getElementById("selectPDFButton").addEventListener("click", (e) => {
    dialog.showOpenDialog({ properties: ['openFile'] }, (selectedFiles) => {
      if (selectedFiles) {
        e.toElement.disabled = true;
        if ($('div#sendFormInner')) $('div#sendFormInner').html('');
        ipcRenderer.send('send-pages', { confirmed: false, selectedFile: selectedFiles[0] });
      }
    });
  });

  document.addEventListener('click', function(e) {
    if (e.target.href) {
      e.preventDefault();
      shell.openExternal(e.target.href);
    }
  });
};

$(document).ready(() => {
  initializeListener();
  initializePage();
});
