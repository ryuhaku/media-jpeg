/**
 * Media JPEG Auto-Convert — ST拡張 (client)
 *
 * /api/images/upload へPOSTされる画像を、アップロード直前にブラウザ側でJPEG再符号化します。
 * ・ピクセル寸法は変えない（長辺8192px超過時のみ安全上の縮小 occurし得る）
 * ・ファイル名/拡張子はそのまま（.png名にJPEGバイトを格納。Strata側の受理は実測済み）
 * ・PNG≥900KB と JPEG≥2.2MB のみが対象（小さな画像やGIF/WebPは素通し）
 * ・変換失敗時は無変換でアップロードを妨げない（fail-open）
 * 目的: Strata HTTP body limit(≈12MiB)に対し、チャット添付画像が毎リクエストで再送されるため、
 *       投入の瞬間に自動で縮小し、手動運用を不要にする。
 */
(function () {
    'use strict';

    const THRESHOLD_PNG_BYTES = 900 * 1024;
    const THRESHOLD_JPEG_BYTES = 2200 * 1024;
    const JPEG_QUALITY = 0.78;
    const MAX_EDGE = 8192; // canvas safety guard; normally never triggered

    if (window.__mediaJpegInstalled) { return; }
    window.__mediaJpegInstalled = true;

    const nativeFetch = window.fetch.bind(window);

    function b64ToBytes(b64) {
        const bin = atob(b64);
        const len = bin.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) { bytes[i] = bin.charCodeAt(i); }
        return bytes;
    }

    function bytesToB64(bytes) {
        let binary = '';
        const chunk = 0x8000;
        for (let i = 0; i < bytes.length; i += chunk) {
            binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
        }
        return btoa(binary);
    }

    async function convertToJpegBytes(bytes) {
        const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
        let w = bitmap.width, h = bitmap.height;
        const scale = Math.min(1, MAX_EDGE / Math.max(w, h));
        if (scale < 1) { w = Math.round(w * scale); h = Math.round(h * scale); }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(bitmap, 0, 0, w, h);
        bitmap.close();
        const blob = await new Promise((resolve, reject) => canvas.toBlob(
            b => (b ? resolve(b) : reject(new Error('toBlob returned null'))),
            'image/jpeg',
            JPEG_QUALITY,
        ));
        return new Uint8Array(await blob.arrayBuffer());
    }

    window.fetch = async function (input, init) {
        try {
            const url = typeof input === 'string' ? input : (input && input.url) || '';
            if (url.includes('/api/images/upload') && init && typeof init.body === 'string') {
                const body = JSON.parse(init.body);
                const format = String(body.format || '').toLowerCase();
                if (body && typeof body.image === 'string' && (format === 'png' || format === 'jpg' || format === 'jpeg')) {
                    const rawBytes = b64ToBytes(body.image);
                    const overThreshold = format === 'png'
                        ? rawBytes.length >= THRESHOLD_PNG_BYTES
                        : rawBytes.length >= THRESHOLD_JPEG_BYTES;
                    if (overThreshold) {
                        const jpeg = await convertToJpegBytes(rawBytes);
                        if (jpeg.length < rawBytes.length) {
                            console.info(`[media-jpeg] ${body.filename || ''}.${format}: ${(rawBytes.length / 1024).toFixed(0)}KB -> ${(jpeg.length / 1024).toFixed(0)}KB (pixels kept, name kept)`);
                            // 拡張子は維持（.pngのままJPEGバイト）＝既存のURL・チャット参照を不変にする
                            init = Object.assign({}, init, { body: JSON.stringify(Object.assign({}, body, { image: bytesToB64(jpeg) })) });
                        }
                    }
                }
            }
        } catch (err) {
            console.warn('[media-jpeg] passthrough (upload not blocked):', err);
        }
        return nativeFetch(input, init);
    };

    console.info('[media-jpeg] auto-convert installed (png>=900KB, jpeg>=2.2MB -> jpeg q0.78, pixels kept)');
})();
