const { ipcRenderer } = require("electron");

const statusCssMap = {
  'pending': 'warning',
  'fail': 'danger',
  'success': 'success'
};

const enableSendButton = () => {
  Array.from(document.getElementsByClassName("sendButton"))
    .filter((el) => { return el.disabled; })[0]
    .disabled = false;
};

const getConfirmation =(arg) => {
  const { dateText, taskName } = arg;

  const confirmed = confirm(taskName);
  if (confirmed) {
    document.getElementById('sendStatus').insertAdjacentHTML(
      'afterbegin',
      `<h3 style="text-align: center">Run Log for ${dateText}:</h3>`
    );

    ipcRenderer.send('send-pages', Object.assign({}, { confirmed: true }, arg));
  } else {
    enableSendButton();
  }
};

ipcRenderer.on('send-pages-alert', (event, arg) => {
  const { dateSerialized, needsConfirmation, status, taskName } = arg;

  if (needsConfirmation) return getConfirmation(arg);

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
  // set production dates
  const now = new Date();
  const dates = [];

  if (now.getHours() < 6) {
    // We're already in publication day already.
    dates.push(new Date((new Date()).setDate(now.getDate() - 1)));
    dates.push(now);
  } else {
    dates.push(now);
    dates.push(new Date((new Date()).setDate(now.getDate() + 1)));
  }

  const container = document.getElementsByClassName('list-group')[0];
  dates.forEach((date) => {
    const dateText = date.toLocaleString().split(",")[0];
    const dateSerialized = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
    const dateHTML = `<li class="list-group-item">${dateText}
    <button style="float: right" type="button" class="btn btn-danger sendButton" data-date-serialized="${dateSerialized}" data-date-text=${dateText}>SEND!!!</button></li>`;

    container.insertAdjacentHTML('beforeend', dateHTML);
  });

  // add event listeners
  Array.from(document.getElementsByClassName("sendButton")).forEach((el) => {
    el.addEventListener("click", (e) => {
      const el = e.toElement;
      const { dateSerialized, dateText } = el.dataset;

      el.disabled = true;
      document.getElementById("sendStatus").innerHTML = '';
      ipcRenderer.send('send-pages', { confirmed: false, dateSerialized, dateText });
    });
  });
};

initializePage();
