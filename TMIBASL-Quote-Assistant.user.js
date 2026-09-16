// ==UserScript==
// @name         TMIBASL Quote Assistant
// @namespace    tmibasl-insurance-automation
// @version      1.0.0
// @updateURL    https://raw.githubusercontent.com/tcmotorsindia/tmibasl-quote-tampermonkey/main/TMIBASL-Quote-Assistant.user.js
// @downloadURL  https://raw.githubusercontent.com/tcmotorsindia/tmibasl-quote-tampermonkey/main/TMIBASL-Quote-Assistant.user.js
// @description  TMIBASL quote detection, Google Sheet lookup and background PDF upload
// @match        *://lifekaplan.tmibasl.in/*
// @run-at       document-start
// @grant        GM_xmlhttpRequest
// @connect      script.google.com
// @connect      script.googleusercontent.com
// ==/UserScript==

(function () {

    'use strict';

    // ============================================================
    // CONFIG
    // ============================================================

    const PANEL_ID =
        'tmibasl-quote-assistant-panel';

    const API_URL =
        'https://script.google.com/macros/s/AKfycbyQEowYB387cQ7ntUdNkxpWiSdyTytPodu5sTJxW3OFe5vHFu77ctb7ZaZPesgdoPja/exec';

    const API_KEY =
        'TMIBASL-Rollover-Tamper-2026';


    // ============================================================
    // HELPERS
    // ============================================================

    function clean(value) {

        return value
            ? String(value)
                .replace(/\s+/g, ' ')
                .trim()
            : '';

    }


    function quoteKey(q) {

        return (
            (q.chassis || '') +
            '|' +
            (q.quotationNo || '')
        );

    }


    // ============================================================
    // EXTRACT QUOTE FROM TMIBASL PAGE
    // ============================================================

    function extractQuote() {

        const candidates =
            [...document.querySelectorAll('div')]
                .filter(el => {

                    const style =
                        window.getComputedStyle(el);

                    return (
                        style.display !== 'none' &&
                        style.visibility !== 'hidden' &&
                        el.innerText &&
                        el.innerText.includes(
                            'Compare Quotes'
                        ) &&
                        el.innerText.includes(
                            'Chassis No'
                        ) &&
                        el.offsetWidth > 500
                    );

                });


        candidates.sort(
            (a, b) =>
                a.innerText.length -
                b.innerText.length
        );


        const container =
            candidates[0];


        if (!container) {

            return {
                chassis: '',
                quotationNo: '',
                customerName: ''
            };

        }


        const text =
            container.innerText
                .replace(/\u00a0/g, ' ')
                .replace(/\r/g, '');


        const chassisMatch =
            text.match(
                /Chassis\s*No\s*-\s*([A-Z0-9]{10,25})/i
            );


        const quotationMatch =
            text.match(
                /Quotation\s*No\s*-\s*([A-Z0-9]{5,30})/i
            );


        const customerMatch =
            text.match(
                /Customer\s*Name\s*-\s*([^\n]+)/i
            );


        return {

            chassis:
                chassisMatch
                    ? clean(
                        chassisMatch[1]
                    ).toUpperCase()
                    : '',

            quotationNo:
                quotationMatch
                    ? clean(
                        quotationMatch[1]
                    )
                    : '',

            customerName:
                customerMatch
                    ? clean(
                        customerMatch[1]
                    )
                    : ''

        };

    }


    // ============================================================
    // GOOGLE SHEET LOOKUP
    // ============================================================

   function lookupChassis(chassis) {
    return new Promise((resolve, reject) => {

        if (!chassis) {
            reject(new Error('Chassis number missing'));
            return;
        }

        const cleanChassis = String(chassis)
            .trim()
            .toUpperCase()
            .replace(/\s+/g, '');

        const url =
            API_URL +
            '?chassis=' +
            encodeURIComponent(cleanChassis) +
            '&key=' +
            encodeURIComponent(API_KEY);

        console.log('====================================');
        console.log('TMIBASL SHEET LOOKUP STARTED');
        console.log('Chassis:', cleanChassis);
        console.log('URL:', url);
        console.log('====================================');

        let completed = false;

        const request = GM_xmlhttpRequest({
    method: 'GET',
    url: url,

    timeout: 15000,

    responseType: 'text',

    onload: function(response) {

        if (completed) return;
        completed = true;

        console.log('TMIBASL SHEET RESPONSE');
        console.log('Status:', response.status);
        console.log('Final URL:', response.finalUrl || '');
        console.log('Response:', response.responseText);

        if (response.status !== 200) {
            reject(
                new Error(
                    'Google Sheet HTTP error: ' +
                    response.status
                )
            );
            return;
        }

        try {

            const result =
                JSON.parse(response.responseText);

            console.log(
                'Parsed Sheet Result:',
                result
            );

            resolve(result);

        } catch (err) {

            console.error(
                'Google Sheet JSON parse error:',
                err
            );

            reject(
                new Error(
                    'Invalid Google Sheet response'
                )
            );
        }
    },

    onerror: function(error) {

        if (completed) return;
        completed = true;

        console.error(
            'Google Sheet request error:',
            error
        );

        reject(
            new Error(
                'Google Sheet request failed'
            )
        );
    },

    ontimeout: function() {

        if (completed) return;
        completed = true;

        console.error(
            'Google Sheet request timed out after 15 seconds'
        );

        reject(
            new Error(
                'Google Sheet lookup timed out after 15 seconds'
            )
        );
    },

    onabort: function() {

        if (completed) return;
        completed = true;

        console.error(
            'Google Sheet request aborted'
        );

        reject(
            new Error(
                'Google Sheet lookup aborted'
            )
        );
    }
});

    });
}


    // ============================================================
    // UPLOAD PDF TO GOOGLE DRIVE
    // ============================================================

function uploadPDF(quote, base64) {
    return new Promise(resolve => {

        console.log(
            'Uploading PDF to Google Drive in background...'
        );

        const payload = {
            key: API_KEY,
            chassis: quote.chassis,
            customerName: quote.customerName,
            quotationNo: quote.quotationNo,
            phoneNumber:
            lastSheetResult &&
            lastSheetResult.success &&
            lastSheetResult.found
            ? lastSheetResult.data['Phone Number']
            : '',
            base64: base64
        };

        GM_xmlhttpRequest({
            method: 'POST',

            url: API_URL,

            headers: {
                'Content-Type': 'application/json'
            },

            data: JSON.stringify(payload),

            timeout: 60000,

            onload: function (response) {

                console.log(
                    'Background upload response:',
                    response.status,
                    response.responseText
                );

                /*
                 * Google Apps Script can successfully execute
                 * doPost() but return a 404 HTML response after
                 * its redirect.
                 *
                 * Therefore:
                 *
                 * 200 + JSON = confirmed success
                 *
                 * 404 + HTML = ambiguous response.
                 * Do NOT perform another Sheet lookup here.
                 *
                 * The server-side operation may already have
                 * completed successfully.
                 */

                if (
                    response.status >= 200 &&
                    response.status < 300
                ) {
                    try {

                        const result =
                            JSON.parse(
                                response.responseText
                            );

                        resolve(result);

                    } catch (error) {

                        console.warn(
                            'Upload completed but response was not JSON.'
                        );

                        resolve({
                            success: true,
                            responseAmbiguous: true
                        });
                    }

                    return;
                }

                if (response.status === 404) {

                    console.warn(
                        'Google returned 404 after POST. ' +
                        'The upload may already have completed server-side.'
                    );

                    resolve({
                        success: true,
                        responseAmbiguous: true,
                        googleResponseStatus: 404
                    });

                    return;
                }

                resolve({
                    success: false,
                    error:
                        'Google upload returned HTTP ' +
                        response.status
                });
            },

            onerror: function () {

                resolve({
                    success: false,
                    error:
                        'Could not connect to Google upload service'
                });
            },

            ontimeout: function () {

                resolve({
                    success: false,
                    error:
                        'PDF upload timed out'
                });
            }
        });

    });
}


    // ============================================================
    // PANEL
    // ============================================================

    function createPanel() {

        let panel =
            document.getElementById(
                PANEL_ID
            );


        if (panel)
            return panel;


        panel =
            document.createElement(
                'div'
            );


        panel.id =
            PANEL_ID;


        Object.assign(
            panel.style,
            {

                position:
                    'fixed',

                right:
                    '20px',

                bottom:
                    '20px',

                zIndex:
                    '2147483647',

                width:
                    '300px',

                padding:
                    '16px',

                background:
    'rgba(255,255,255,0.72)',

color:
    '#222',

border:
    '1px solid rgba(80,80,80,0.25)',

borderRadius:
    '10px',

boxShadow:
    '0 2px 12px rgba(0,0,0,0.12)',

backdropFilter:
    'blur(8px)',

WebkitBackdropFilter:
    'blur(8px)',

                fontFamily:
                    'Arial, sans-serif',

                fontSize:
                    '14px',

                lineHeight:
                    '1.5'

            }
        );


        if (document.body) {

            document.body.appendChild(
                panel
            );

        }


        return panel;

    }


    // ============================================================
    // RENDER PANEL
    // ============================================================

    function renderQuote(
        q,
        sheetResult = null,
        uploadStatus = ''
    ) {

        const panel =
            createPanel();


        let sheetSection = `

            <div style="
                margin-top:12px;
                border-top:1px solid #ddd;
                padding-top:10px;
            ">

                <strong>
                    Google Sheet
                </strong>

                <br>

                Looking up chassis...

            </div>

        `;


        if (sheetResult) {

            if (
                sheetResult.success &&
                sheetResult.found
            ) {

                const data =
                    sheetResult.data || {};


                sheetSection = `

                    <div style="
                        margin-top:12px;
                        border-top:1px solid #ddd;
                        padding-top:10px;
                    ">

                        <strong style="color:green;">
                            ✓ Customer found in Rollover Sheet
                        </strong>


                        <div style="margin-top:8px;">

                            <strong>
                                Phone Number
                            </strong>

                            <br>

                            ${data['Phone Number'] || 'Not available'}

                        </div>


                        <div style="margin-top:8px;">

                            <strong>
                                Sheet Customer
                            </strong>

                            <br>

                            ${data['Customer Name'] || 'Not available'}

                        </div>


                        <div style="margin-top:8px;">

                            <strong>
                                Status
                            </strong>

                            <br>

                            ${data['Status'] || 'Not available'}

                        </div>

                    </div>

                `;

            }


            else if (
                sheetResult.success &&
                !sheetResult.found
            ) {

                sheetSection = `

                    <div style="
                        margin-top:12px;
                        border-top:1px solid #ddd;
                        padding-top:10px;
                        color:#b36b00;
                    ">

                        ⚠ Chassis not found in Rollover Sheet

                    </div>

                `;

            }


            else {

                sheetSection = `

                    <div style="
                        margin-top:12px;
                        border-top:1px solid #ddd;
                        padding-top:10px;
                        color:red;
                    ">

                        ✕ Lookup error:

                        ${sheetResult.error || 'Unknown error'}

                    </div>

                `;

            }

        }


        let uploadSection = '';


        if (uploadStatus) {

            uploadSection = `

                <div style="
                    margin-top:12px;
                    border-top:1px solid #ddd;
                    padding-top:10px;
                ">

                    ${uploadStatus}

                </div>

            `;

        }


        panel.innerHTML = `

            <div style="
                font-size:17px;
                font-weight:bold;
                margin-bottom:12px;
            ">

                TMIBASL Quote Assistant

            </div>


            <div style="margin-bottom:8px;">

                <strong>
                    Customer
                </strong>

                <br>

                ${q.customerName || 'Waiting...'}

            </div>


            <div style="margin-bottom:8px;">

                <strong>
                    Chassis No
                </strong>

                <br>

                <span style="font-family:monospace;">

                    ${q.chassis || 'Waiting...'}

                </span>

            </div>


            <div style="margin-bottom:8px;">

                <strong>
                    Quotation No
                </strong>

                <br>

                ${q.quotationNo || 'Waiting...'}

            </div>


            ${sheetSection}

            ${uploadSection}

        `;

    }


    // ============================================================
    // STATE
    // ============================================================

    let lastQuoteKey = '';

    let lastSheetResult = null;


    // ============================================================
    // UPDATE QUOTE
    // ============================================================

    async function update() {

        const q =
            extractQuote();


        if (!q.chassis) {

            return;

        }


        const currentKey =
            quoteKey(q);


        // Same quotation already loaded
        if (
            currentKey ===
            lastQuoteKey
        ) {

            return;

        }


        lastQuoteKey =
            currentKey;


        lastSheetResult =
            null;


        renderQuote(
            q,
            null
        );


        const result =
            await lookupChassis(
                q.chassis
            );


        // Only update panel if
        // executive is still on same quote
        if (
            quoteKey(extractQuote()) ===
            currentKey
        ) {

            lastSheetResult =
                result;


            renderQuote(
                q,
                result
            );

        }

    }


    // ============================================================
    // ============================================================
// INTERCEPT TMIBASL PDF REQUEST
// ============================================================

const originalOpen =
    XMLHttpRequest.prototype.open;

const originalSend =
    XMLHttpRequest.prototype.send;


// ------------------------------------------------------------
// CAPTURE REQUEST URL
// ------------------------------------------------------------

XMLHttpRequest.prototype.open =
    function (
        method,
        url,
        async,
        user,
        password
    ) {

        this.__tmibaslURL = url;

        return originalOpen.call(
            this,
            method,
            url,
            async,
            user,
            password
        );

    };


// ------------------------------------------------------------
// INTERCEPT PDF RESPONSE
// ------------------------------------------------------------

XMLHttpRequest.prototype.send =
    function (body) {

        const xhr = this;


        if (
            xhr.__tmibaslURL &&
            xhr.__tmibaslURL.includes(
                'GenerateQuoteComparisonPDF'
            )
        ) {

            xhr.addEventListener(
                'load',
                function () {

                    try {

                        const response =
                            JSON.parse(
                                xhr.responseText
                            );


                        // ------------------------------------------------
                        // CHECK PDF
                        // ------------------------------------------------

                        if (
                            !response ||
                            !response.PdfInBase64
                        ) {

                            console.warn(
                                'TMIBASL PDF response received but no PdfInBase64 found'
                            );

                            return;

                        }


                        // ------------------------------------------------
                        // IDENTIFY QUOTE
                        // ------------------------------------------------

                        const q =
                            extractQuote();


                        if (!q.chassis) {

                            console.error(
                                'Could not determine chassis for PDF'
                            );

                            return;

                        }


                        const capturedQuote = {

                            chassis:
                                q.chassis,

                            quotationNo:
                                q.quotationNo,

                            customerName:
                                q.customerName

                        };


                        const capturedKey =
                            quoteKey(
                                capturedQuote
                            );


                        console.log(
                            '================================'
                        );

                        console.log(
                            'TMIBASL PDF CAPTURED'
                        );

                        console.log(
                            capturedQuote
                        );

                        console.log(
                            'PDF Base64 length:',
                            response.PdfInBase64.length
                        );

                        console.log(
                            '================================'
                        );


                        // ====================================================
                        // IMPORTANT
                        // ====================================================
                        //
                        // From this point onwards, NOTHING waits for Drive.
                        //
                        // The executive is told immediately that the PDF
                        // has been captured and can continue.
                        //
                        // ====================================================


                        renderQuote(

                            capturedQuote,

                            lastSheetResult,

                            `
                                <div style="
                                    color:green;
                                    font-weight:bold;
                                ">
                                    ✓ PDF captured
                                </div>

                                <div style="
                                    margin-top:6px;
                                    color:#555;
                                ">
                                    You can continue to the next quote.
                                </div>
                            `

                        );


                        // ====================================================
                        // BACKGROUND DRIVE UPLOAD
                        // ====================================================
                        //
                        // DO NOT await this.
                        //
                        // DO NOT block the executive.
                        //
                        // DO NOT make the panel wait for this.
                        //
                        // ====================================================


                        console.log(
                            'Starting background PDF upload...'
                        );


                        uploadPDF(

                            capturedQuote,

                            response.PdfInBase64

                        )

                        .then(
                            function (uploadResult) {

                                console.log(
                                    '================================'
                                );

                                console.log(
                                    'BACKGROUND PDF UPLOAD COMPLETED'
                                );

                                console.log(
                                    uploadResult
                                );

                                console.log(
                                    '================================'
                                );


                                if (
                                    uploadResult &&
                                    uploadResult.success
                                ) {

                                    console.log(
                                        '✓ PDF successfully saved to Google Drive'
                                    );

                                    console.log(
                                        'File URL:',
                                        uploadResult.fileUrl || ''
                                    );

                                }

                                else {

                                    console.error(
                                        '✕ Background PDF upload failed:',
                                        uploadResult
                                    );

                                }

                            }

                        )

                        .catch(
                            function (error) {

                                console.error(
                                    '✕ Background PDF upload error:',
                                    error
                                );

                            }
                        );


                        // ====================================================
                        // IMPORTANT:
                        //
                        // NO await
                        // NO UI update after upload
                        // NO waiting for Drive
                        //
                        // Executive is completely free to continue.
                        // ====================================================


                    }

                    catch (error) {

                        console.error(
                            'TMIBASL PDF interception error:',
                            error
                        );

                    }

                }
            );

        }


        return originalSend.call(
            this,
            body
        );

    };


    // ============================================================
    // WATCH PAGE
    // ============================================================

    let timer;


    const observer =
        new MutationObserver(
            function () {

                clearTimeout(timer);


                timer =
                    setTimeout(
                        update,
                        300
                    );

            }
        );


    function startObserver() {

        if (!document.body)
            return;


        observer.observe(
            document.body,
            {

                childList:
                    true,

                subtree:
                    true,

                characterData:
                    true

            }
        );


        setTimeout(
            update,
            500
        );


        setTimeout(
            update,
            1500
        );


        setTimeout(
            update,
            3000
        );

    }


    if (
        document.readyState ===
        'loading'
    ) {

        document.addEventListener(
            'DOMContentLoaded',
            startObserver
        );

    }


    else {

        startObserver();

    }

})();
