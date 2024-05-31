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

    // const realContainerDiv = document.querySelector('.container');

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
    let { name, phone_number, TOC, TOP, transcriber, conversions, generic_order } = data;
    if (!name) {
        name = 'N/A';
    }
    const namePhoneDiv = document.querySelector('.namePhone');
    namePhoneDiv.querySelector('.name').querySelector('.data').innerText = name;
    namePhoneDiv.querySelector('.phone').querySelector('.data').innerText = phone_number;

    // Add the date of upload
    const dateUpload = formatDateFromTimestamp(TOC);
    const uploadDateDiv = document.querySelector('.uploadDate');
    uploadDateDiv.querySelector('.data').innerText = dateUpload;

    // Add pharmacist name, date of transcribing
    const pharmacistNameSpan = document.getElementById('pharmacistName');
    pharmacistNameSpan.innerText = transcriber.split('@')[0];

    const dateTranscribe = formatDateFromTimestamp(TOP);
    const dateOfTranscriptionDiv = document.querySelector('.dateOfTranscription');
    dateOfTranscriptionDiv.innerText = dateTranscribe;

    // Clear any skeleton loaded/dummy medlist html scripts
    document.querySelectorAll('.medList main').forEach(mainDiv => {
        mainDiv.remove();
    });

    if (conversions) handleConversionMeds(conversions);

    if (generic_order) handleGenericMeds(generic_order);
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
    console.log("____________")
    console.log("GENERIC MEDS");
    console.log(generic_order)

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
        obj['dosageText'] = convertDosageToText({
            advice: origObj['advice'],
            frequency: origObj['frequency'],
            dosage: origObj['dosage']
        })

        genericMeds.push(obj);
    })
    console.log(genericMeds)

    // ADD THE GENERIC ITEMS TO THE DOM

    // CREATE SOMETHING LIST THIS
    // <main class="row">
    //     <div class="col1">
    //     </div>

    //     <div class="col23">
    //         <div class="col2">

    //             <div class="convGenericItem">
    //                 <div class="comp">Atorvastatin 20mg</div>
    //                 <div class="price">Price: ₹<span id="rate">80</span> for <span id="unitMethod">3 tablets</span></div>
    //                 <div class="freqAdvice"><span id="advice">2</span> times in a day * <span id="freq">7</span> days</div>
    //             </div>

    //             <div class="convGenericItem">
    //                 <div class="comp">Atorvastatin 20mg</div>
    //                 <div class="price">Price: ₹<span id="rate">80</span> for <span id="unitMethod">3 tablets</span></div>
    //                 <div class="freqAdvice"><span id="advice">2</span> times in a day * <span id="freq">7</span> days</div>
    //             </div>
    //         </div>

    //         <div class="col3">
    //             <div class="drugCode">72</div>
    //             <div class="drugCode">72</div>
    //         </div>
    //     </div>

    // </main>
    let mainDivs = "";
    genericMeds.forEach((genMed) => {
        const mainDiv = `
                <main class="row">
                    <div class="col1 empty">
                    </div>
        
                    <div class="col23">
                        <div class="col2">
                            <div class="convGenericItem">
                                <div class="comp">${genMed.composition}</div>
                                <div class="price">Price: ₹<span id="rate">${genMed.rate}</span> for <span id="unitMethod">${genMed.packet}</span></div>
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
        convObj['MRP'] = conversions[brandName].Price ? '₹' + Math.ceil(Number(conversions[brandName].Price)) : 'N/A';
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
                const rate = Math.ceil(Number(genericConvItems[dc].price) * Number(genericConvItems[dc].packet_digit));
                obj['rate'] = '₹' + rate;
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
        convObj['dosageText'] = convertDosageToText(conversions[brandName].Dosage);

        convertedMeds.push(convObj);
    })

    // ADD THE BRANDED ITEMS TO THE DOM

    // CREATE SOMETHING LIST THIS
    // <main class="row">
    //     <div class="col1">
    //         <div class="brandName">1. Atrovakind 20mg <span class="mrp">(MRP 43)</span></div>
    //     </div>

    //     <div class="col23">
    //         <div class="col2">
    //             <div class="totalSavings">Total Savings <div>80%</div></div>

    //             <div class="convGenericItem">
    //                 <div class="comp">Atorvastatin 20mg</div>
    //                 <div class="price">Price: ₹<span id="rate">80</span> for <span id="unitMethod">3 tablets</span></div>
    //                 <div class="freqAdvice"><span id="advice">2</span> times in a day * <span id="freq">7</span> days</div>
    //             </div>

    //             <div class="convGenericItem">
    //                 <div class="comp">Atorvastatin 20mg</div>
    //                 <div class="price">Price: ₹<span id="rate">80</span> for <span id="unitMethod">3 tablets</span></div>
    //                 <div class="freqAdvice"><span id="advice">2</span> times in a day * <span id="freq">7</span> days</div>
    //             </div>
    //         </div>

    //         <div class="col3">
    //             <div class="drugCode">72</div>
    //             <div class="drugCode">72</div>
    //         </div>
    //     </div>

    // </main>
    let mainDivs = "";
    convertedMeds.forEach((convMed, idx) => {
        let convGenericItemDivs = "";

        convMed.convItems.forEach((genericItem, idx) => {
            convGenericItemDivs += `
                <div class="convGenericItem">
                    <div class="comp">${genericItem.composition}</div>
                    <div class="price">Price: <span id="rate">${genericItem.rate}</span> for <span id="unitMethod">${genericItem.packet}</span></div>
                </div>
                ${idx === convMed.convItems.length - 1 && convMed.dosageText ? `<div class="freqAdvice">${convMed['dosageText']}</div>` : ''}
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
                    <div class="brandName">${idx + 1}. ${convMed.composition} <span class="mrp">(MRP ${convMed.MRP})</span></div>
                </div>

                <div class="col23">
                    <div class="col2">
                        <div class="totalSavings">Total Savings <div>${convMed.totalSavings}</div></div>
                        
                        ${convGenericItemDivs}
                    </div>

                    <div class="col3">
                        ${convGenericDrugCodeDivs}
                    </div>
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
    const month = dateObj.getMonth();
    const year = dateObj.getFullYear();

    const months = [
        "Jan", "Feb", "Mar", "Apr", "May", "Jun",
        "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
    ];

    return `${date < 10 ? '0' + date : date}-${months[month]}-${year}`;
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

function convertDosageToText(dosage) {
    if (!dosage) return '';
    if (typeof dosage === 'string') {
        // For branded items, in the form of "OD", "TDS", "BD", "1-0-0"
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
    } else {
        // For generic items, in the form of
        // {
        //     frequency: 1,
        //     advice: 1, 
        //     dosage: 1,
        // }
        const strs = [];
        if (dosage.dosage) {
            strs.push(`${dosage.dosage} ${dosage.dosage == '1' ? 'tablet' : 'tablets'}`);
        }
        if (dosage.frequency) {
            strs.push(`every ${dosage.frequency} ${dosage.frequency == '1' ? 'day' : 'days'}`);
        }
        if (dosage.advice) {
            strs.push(`for ${dosage.advice} ${dosage.advice == '1' ? 'day' : 'days'}`);
        }
        return strs.length > 0 ? 'Take ' + strs.join(', ') : undefined;
    }
}