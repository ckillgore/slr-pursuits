/**
 * Browser download helper shared by the report exports. Kept in its own module
 * (no exceljs / react-pdf imports) so callers can load it without pulling in a
 * heavy export library.
 */

/**
 * Triggers a download of `blob` as `fileName`. The object URL is revoked after a
 * delay: revoking it synchronously after click() (or even on the next tick, in
 * Safari) can cancel the download before the browser has read the blob.
 */
export function downloadBlob(blob: Blob, fileName: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
