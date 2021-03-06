# crow

_cathy crow voice: squawk squawk. get yinz's pages in by 1 a.m.!_

Crow is responsible for taking a "completed newspaper," a PDF with
one PDF page per newspaper page, and sending it to the printer.

Crow automates the following steps:

1. Read in the PDF and make sure it is able to be processed
2. Split the combined PDF into separate PDFs, containing one page each
3. Send the pages over FTP to the printer
4. Send a Slack notification alerting that pages have been sent

### Architecture

Crow is built as an Electron app, utilizting HTML, JavaScript, Node.js
and CSS. The only external dependency is `pdftk`, which handles PDF
manipulation. To install on macOS 10.11-10.13, use [this link](https://www.pdflabs.com/tools/pdftk-the-pdf-toolkit/pdftk_server-2.02-mac_osx-10.11-setup.pkg).

To create new versions of the production Crow application, run `node
packager.js`.

### Configuration

Crow contains the following configuration variables, via a `config.json`
file:

- `ftp_settings`: Object containing `host`, `user`, `password`, port`,
  `secure` and `secureOptions` keys
- `printerPagesLink`: String with URL for website to check pages
- `slack_settings`: Object containing `channel`, `icon_emoji`,
  `username` and `webhook_url` keys
