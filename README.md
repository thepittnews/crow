# crow

_cathy crow voice: squawk squawk, bitch. get yinz's pages in by 1 a.m.!_

Crow is responsible for taking a "completed newspaper"—one PDF with
one PDF page per newspaper page—and sending it to the printer.

The steps involved are to:

1. Read in the PDF and make sure it is able to be processed.
2. Split the main PDF into separate PDFs, containing one page each.
3. Send the pages, over FTP, to the printer.
4. Send a Slack notification alerting that pages have been sent.

### Architecture

Crow is built as an Electron app, utilizting HTML, JavaScript, Node.js
and CSS. The only external dependency is `pdftk`, which handles PDF
manipulation. To install on macOS 10.11-10.13, use [this link](https://www.pdflabs.com/tools/pdftk-the-pdf-toolkit/pdftk_server-2.02-mac_osx-10.11-setup.pkg).

### Configuration

Crow contains three configuratio variables:

- `path`: Filesystem path where PDFs can be located. Sample PDF
  filenames are `2-6-19.PN_A.pdf` and `10-31-19.PN_A.pdf`.
- `slack_channel`: Slack channel where notifications should be printed
- `slack_url`: Slack incoming webhook URL where notifications should be
  POST-ed
