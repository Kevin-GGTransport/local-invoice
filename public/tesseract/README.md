# Tesseract runtime assets

These files are same-origin runtime assets used by browser-side SOC recognition.
They are copied from the locked `tesseract.js@7.0.0` and `tesseract.js-core@7.0.0`
packages; `eng.traineddata` is the Apache-2.0 English model distributed with Tesseract.
Keeping them local avoids runtime requests to a third-party CDN.
