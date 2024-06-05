import { checkCache } from './localStorageUtils.js';

/**
 * REQUIED HTML ELEMENTS
 */
const medListDiv = document.querySelector('.medList');


// Check if inventory cache is available
let inventoryByDC = {};
checkCache().then(inv => {
    inventoryByDC = inv;
});

// Add a click listener to the Download PDF button
const exportButton = document.querySelector(".exportBtn");
exportButton.addEventListener('click', () => {
    extractPdf();
})

function extractPdf() {
    const navbarDiv = document.getElementById('navbar').cloneNode(true);
    const mainDiv = document.getElementById('main').cloneNode(true);
    const footerDiv = document.getElementById('footer').cloneNode(true);
    
    // The place order button is NOT NEEDED in the extracted pdf
    const placeOrderDiv = mainDiv.querySelector(".placeOrder");
    if(placeOrderDiv) {
        mainDiv.removeChild(placeOrderDiv);
    }

    // Add the following divs to our temporary container div
    const tempContainerDiv = document.createElement('div');

    tempContainerDiv.appendChild(navbarDiv);
    tempContainerDiv.appendChild(mainDiv);
    tempContainerDiv.appendChild(footerDiv);

    var options = {
        margin: [20, 20, 20, 20],
        filename: "prescription.pdf",
        image: { type: 'jpeg', quality: 1 },
        jsPDF: { unit: 'px', format: 'b3', orientation: 'portrait', hotfixes: ['px_scaling'] },
        pagebreak: { mode: ['avoid-all', 'css', 'legacy'] },
    };

    html2pdf(tempContainerDiv, options)
}

async function getPrescription() {
    // get phone number and id from url params
    const queryString = decodeURIComponent(window.location.search);

    const idFromParams = queryString
        .split('/')[0]
        .replace('?', '')

    // Get the prescription data from backend
    const body = {
        id: Number(idFromParams)
    }
    const response = await fetch(`https://samasya.tech/api/prescription_system/object`, {
        method: "POST",
        body: JSON.stringify(body),
        headers: {
            "Content-Type": "application/json",
        },
    });
    const data = await response.json();

    console.log("API DATA: ", data);

    if (data['data'] && data['data'].length > 0) {
        populateView(data['data'][0]);
    }
}
getPrescription()

function populateView(data) {
    // Add name, phone number
    let { name, phone_number, TOC, TOP, transcriber, conversions, generic_order, id } = data;
    if (!name) {
        name = 'N/A';
    }
    const namePhoneDiv = document.querySelector('.namePhone');

    const nameDiv = namePhoneDiv.querySelector('.name').querySelector('.data');
    nameDiv.innerText = name;
    if(name === 'N/A') {
        nameDiv.classList.add('unavailable');
    }

    if(phone_number.startsWith('+91')) {
        namePhoneDiv.querySelector('.phone').querySelector('.data').innerText = `+91 ${phone_number.substring(3)}`;
    } else {
        namePhoneDiv.querySelector('.phone').querySelector('.data').innerText = `+91 ${phone_number}`;
    }

    // Add the date of upload
    const dateUpload = formatDateFromTimestamp(TOC);
    const uploadDateDiv = document.querySelector('.uploadDate');
    uploadDateDiv.querySelector('.data').innerText = dateUpload;

    // Add pharmacist name, parchi ID, date of transcribing
    const pharmacistNameSpan = document.getElementById('pharmacistName');
    pharmacistNameSpan.innerText = transcriber.split('@')[0]; 
    
    const parchiIdSpan = document.getElementById('parchiId');
    parchiIdSpan.innerText = id;

    const dateTranscribe = formatDateFromTimestamp(TOP);
    const dateOfTranscriptionDiv = document.querySelector('.dateOfTranscription');
    dateOfTranscriptionDiv.innerHTML = `On <span>${dateTranscribe}</span>`;

    // Clear any skeleton loaded/dummy medlist html scripts
    document.querySelectorAll('.medList main').forEach(mainDiv => {
        mainDiv.remove();
    });

    if (conversions) handleConversionMeds(conversions);

    if (generic_order) handleGenericMeds(generic_order);

    if(conversions || generic_order) { // something is present in med orders
        // add the PLACE ORDER button as well
        const placeOrderBtn = document.getElementById('placeOrderBtn');
        placeOrderBtn.addEventListener('click', () => {
            // this will redirect to the deeplink
            alert("PLACED ORDER");
        })
    }
}

function handleGenericMeds(generic_order) {

    // From the product list fetch DC info and put it in the generic order
    Object.keys(generic_order).forEach(dc => {
        const origObj = generic_order[dc];
        const invObj = inventoryByDC[dc];
        if (invObj) {
            generic_order[dc] = { ...origObj, ...invObj };
        }
    })

    const genericMeds = []; // Array after processing and extracting requiured information
    Object.keys(generic_order).forEach(dc => {
        const origObj = generic_order[dc];
        const obj = {};
        obj['drugCode'] = origObj['drugCode'];
        obj['composition'] = capitaliseComposition(origObj['f_comp']);
        if (origObj['method'].toLowerCase().includes('tablet')) {
            obj['rate'] = Number(origObj['price']) * Number(origObj['packet_digit']) * origObj['quantity'];
        } else {
            obj['rate'] = Number(origObj['price']) * origObj['quantity'];
        }
        obj['packet'] = origObj['packet_digit'] + ' ' + origObj['packet_size'];
        obj['dosageText'] = formatDosageFreqAdviceText({
            advice: origObj['advice'],
            frequency: origObj['frequency'],
            dosage: origObj['dosage']
        })

        genericMeds.push(obj);
    })

    // ADD THE GENERIC ITEMS TO THE DOM
    
    let mainDivs = "";
    genericMeds.forEach((genMed) => {
        const mainDiv = `
                <main class="row">
                    <div class="col1"><div class="brandName unavailable">N/A</div></div>
        
                    <div class="col23">
                        <div class="col2">
                            <div class="convGenericItem">
                                <div class="compUnit"><span id="comp">${genMed.composition}</span> | <span id="unitMethod">${genMed.packet}</span></div>
                                <div class="price">₹&nbsp;<span id="rate">${genMed.rate}</span>/-</div>
                                ${genMed.dosageText ? `<div class="freqAdvice">${genMed['dosageText']}</div>` : ''}
                            </div>
                        </div>
        
                        <div class="col3">
                            <div class="drugCode">${genMed.drugCode}</div>
                        </div>
                    </div>
        
                </main>
            `

        mainDivs += mainDiv;
    })
    medListDiv.insertAdjacentHTML('beforeend', mainDivs);
}

function handleConversionMeds(conversions) {
    const convertedMeds = []; // Array after processing and extracting requiured information

    // From the product list fetch DC info and put it in the branded order
    Object.keys(conversions).forEach(brandName => {
        const changedConversions = {}, origConversions = conversions[brandName].Conversions;

        if (origConversions) {
            Object.keys(origConversions).forEach(dc => {
                changedConversions[dc] = inventoryByDC[dc];
            })
            conversions[brandName].Conversions = changedConversions
        }
    })

    // Traverse on each conversion item and extract required info
    Object.keys(conversions).forEach(brandName => {
        const convObj = {};
        const comp = capitaliseComposition(conversions[brandName].Comp);
        convObj['composition'] = comp;

        let brandedPrice = Math.ceil(Number(conversions[brandName].Price))
        convObj['MRP'] = conversions[brandName].Price ? Math.ceil(Number(conversions[brandName].Price)) : 'N/A';
        if (convObj['MRP'] === 'N/A') {
            brandedPrice = 'N/A';
        }

        // Extract info for each converted generic item
        convObj['convItems'] = [];
        const genericConvItems = conversions[brandName].Conversions;
        if (genericConvItems) {
            let totalGenericRate = 0;
            Object.keys(genericConvItems).forEach(dc => {
                const obj = {};
                obj['drugCode'] = dc;
                obj['composition'] = capitaliseComposition(genericConvItems[dc].f_comp);
                let rate = Math.ceil(Number(genericConvItems[dc].price));
                if(genericConvItems[dc].method === 'Tablet/Capsule') {
                    rate *= Number(genericConvItems[dc].packet_digit);
                }
                obj['rate'] = rate;
                totalGenericRate += rate;
                obj['packet'] = genericConvItems[dc].packet_digit + " " + genericConvItems[dc].packet_size;

                convObj['convItems'].push(obj);
            })

            if (brandedPrice !== 'N/A') {
                const savedAmount = brandedPrice - totalGenericRate;
                const savePerc = Math.round(savedAmount / brandedPrice * 100);
                convObj['totalSavings'] = savePerc + "%";
            } else {
                convObj['totalSavings'] = 'N/A';
            }
        }


        // CONVERT DOSAGES TO HUMAN UNDERSTABLE TEXT LIKE: BD ---> 1 tablet 2 times a day.
        convObj['dosageText'] = formatDosageFreqAdviceText({
            // Add frequency, advice -- NEED TO CONFIRM THE KEY NAMES FOR THESE
            dosage: conversions[brandName].Dosage
        });

        convertedMeds.push(convObj);
    })

    // ADD THE BRANDED ITEMS TO THE DOM

    // Create and push the HTML script to our index.html
    let mainDivs = "";
    convertedMeds.forEach((convMed, idx) => {
        let convGenericItemDivs = "";

        convMed.convItems.forEach((genericItem, idx) => {
            convGenericItemDivs += `
                <div class="convGenericItem">
                    <div class="compUnit"><span id="comp">${genericItem.composition}</span> | <span id="unitMethod">${genericItem.packet}</span></div>
                    <div class="price">₹&nbsp;<span id="rate">${genericItem.rate}</span>/-</div>
                    ${idx === convMed.convItems.length - 1 && convMed.dosageText ? `<div class="freqAdvice">${convMed['dosageText']}</div>` : ''}
                </div>
            `
        })

        let convGenericDrugCodeDivs = "";
        convMed.convItems.forEach(genericItem => {
            convGenericDrugCodeDivs += `
                <div class="drugCode">${genericItem.drugCode}</div>
            `
        })

        const mainDiv = `
            <main class="row">
                <div class="col1">
                    <div class="brandName">${convMed.composition} <span class="mrp ${convMed.MRP === 'N/A' ? 'unavailable' : '' }">(${convMed.MRP !== 'N/A' ? '₹&nbsp;' + convMed.MRP + '/-' : 'N/A'})</span></div>
                </div>

                <div class="col23">
                    ${
                        !convGenericItemDivs 
                        ? '<div class="unavailable">Conversion not available/Schedule X- not for sale</div>'
                        : `
                            <div class="col2">
                                ${!convMed.totalSavings || convMed.totalSavings === 'N/A' ? 'Conversion not available/Schedule X- not for sale' : `<div class="totalSavings"><div>${convMed.totalSavings}</div> Saved</div>`}
                                
                                ${convGenericItemDivs}
                            </div>

                            <div class="col3">
                                ${convGenericDrugCodeDivs}
                            </div>
                        `
                    }
                    
                </div>

            </main>
        `

        mainDivs += mainDiv
    })
    medListDiv.insertAdjacentHTML('beforeend', mainDivs);
}


/** Bunch of Utility Functions */

function formatDateFromTimestamp(timestamp) {
    if (timestamp.length === 10) {
        timestamp += '000';
    }
    timestamp = Number(timestamp);
    const dateObj = new Date(timestamp);
    const date = dateObj.getDate();
    const month = dateObj.getMonth() + 1; // be default 0-indexed
    const year = dateObj.getFullYear();

    return `${date < 10 ? '0' + date : date}/${month < 10 ? '0' + month : month}/${year}`;
}

function capitaliseComposition(composition) {
    if (!composition) return "";

    let words = composition.split("+");

    words = words.map(word => {
        word = word.trim();

        if (isNaN(Number(word)) && word.length > 2) {
            word = word[0].toUpperCase() + word.substring(1);
        }

        return word;
    })

    return words.join(" + ");
}

function formatDosageFreqAdviceText(infoObj) {
    if(!infoObj) return "";

    let {dosage, advice, frequency} = infoObj;
    
    const strs = [];
    if (dosage) {
        dosage = dosage.toLowerCase();
        if (!isNaN(Number(dosage[0]))) {
            // 1-0-0, 1-0-1-2 form
            const splitByHyphen = dosage.split('-');

            let daysForIdx = [];
            if (splitByHyphen.length === 4) {
                daysForIdx = ['morning', 'afternoon', 'evening', 'night'];
            } else if (splitByHyphen.length === 3) {
                daysForIdx = ['morning', 'afternoon', 'evening'];
            } else if (splitByHyphen.length === 2) {
                daysForIdx = ['morning', 'evening']
            }

            let strs = [];
            for (let i = 0; i < splitByHyphen.length; i++) {
                if (splitByHyphen[i] !== '0') {
                    const tablet = splitByHyphen[i] === '1' ? 'tablet' : 'tablets';
                    strs.push(`${splitByHyphen[i]} ${tablet} in the ${daysForIdx[i]}`);
                }
            }

            return strs.length > 0 ? 'Take ' + strs.join(', ') : undefined;
        } else {
            // od, tds, bd
            const dosageToText = {
                od: "Take 1 tablet once a day",
                bd: "Take 1 tablet 2 times in a day",
                tds: "Take 1 tablet 3 times in a day",
            }
            return dosageToText[dosage];
        }
    }

    if (frequency) {
        strs.push(`every ${frequency} ${frequency == '1' ? 'day' : 'days'}`);
    }

    if (advice) {
        strs.push(`for ${advice} ${advice == '1' ? 'day' : 'days'}`);
    }

    return strs.length > 0 ? 'Take ' + strs.join(', ') : undefined;
}