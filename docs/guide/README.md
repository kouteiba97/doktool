# Arabic guide (دليل DokTool الشامل)

`guide-ar.html` is the source of the Arabic walkthrough of every feature of the app and Admin Web, written for the Product Owner. Screenshots are in `img/`: app screens captured on the Android emulator, and Admin Web pages captured with headless Chrome. Both come from a development database, so names ending in codes (`3e83e0`) are test data.

Rebuild the PDF after editing (Chrome or Edge):

```bash
"C:/Program Files/Google/Chrome/Application/chrome.exe" --headless=new --no-pdf-header-footer --virtual-time-budget=15000 --print-to-pdf="DokTool-Guide-AR.pdf" "file:///D:/DokTool/doktool-design-handoff-v2.2/docs/guide/guide-ar.html"
```
