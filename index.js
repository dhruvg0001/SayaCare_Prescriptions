// import { checkCache } from './localStorageUtils.js';

/**
 * REQUIED HTML ELEMENTS
 */
const dataReadySection = document.getElementById('data-ready')
const dataNotReadySection = document.getElementById('data-not-ready')
const medListDiv = dataReadySection.querySelector('.medList');
const mainSection= document.getElementById('main');
const noDataSection= document.getElementById('noData');

// Check if inventory cache is available
let inventoryByDC = {};
let overAllSavings=0;
let numberOfItems = 0

// Prescription advice lookup map (fetched from API)
let adviceLookup = { Dosage: {}, Frequency: {}, Meals: {}, Route: {} };

function extractPdf() {
    const navbarDiv = dataReadySection.querySelector('#navbar').cloneNode(true);
    const mainDiv = dataReadySection.querySelector('#main').cloneNode(true);
    const footerDiv = dataReadySection.querySelector('#footer').cloneNode(true);
    
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

    // Get screen dimensions
    const screenWidth = window.innerWidth;

    // Convert screen dimensions to jsPDF units (pixels)
    const pdfWidth = screenWidth;

    const pdfSizeFormat = pdfWidth <= 640 ? 'c5' : 'b3';

    var options = {
        margin: [20, 20, 20, 20],
        filename: "prescription.pdf",
        image: { type: 'jpeg', quality: 1 },
        jsPDF: { unit: 'px', format: pdfSizeFormat, orientation: 'portrait', hotfixes: ['px_scaling'] },
        pagebreak: { mode: ['avoid-all', 'css', 'legacy'] },
    };

    html2pdf(tempContainerDiv, options)
}

async function fetchAdviceLookup() {
    try {
        const response = await fetch(`https://samasya.tech/api/prescription-advice/grouped`);
        const result = await response.json();
        if (result.success && result.data) {
            // Build lookup maps: { "od": "Once daily", "bd": "Twice daily", ... }
            for (const category of ['Dosage', 'Frequency', 'Meals', 'Route']) {
                if (result.data[category]) {
                    result.data[category].forEach(entry => {
                        adviceLookup[category][entry.item.toLowerCase()] = entry.interpretation;
                    });
                }
            }
        }
    } catch (err) {
        console.error('Failed to fetch prescription advice lookup:', err);
    }
}

async function getPrescription() {
    // get phone number and id from url params
    const queryString = decodeURIComponent(window.location.search);

    // Remove the leading "?" and split the string by "&"
    const pairs = queryString.substring(1).split("&");

    // Initialize an empty object to store the key-value pairs
    const queryParams = {};

    // Loop through each pair and split by "=" to get the key and value
    pairs.forEach(pair => {
        const [key, value] = pair.split("=");
        // Assign the key and value to the result object
        queryParams[key] = isNaN(value) ? value : Number(value); // Convert to number if possible
    });

    // Get the prescription data and advice lookup in parallel
    const body = {
        id: Number(queryParams.id),
        phone_number: "+" + queryParams.phone,
    }
    const [response] = await Promise.all([
        fetch(`https://samasya.tech/api/prescription_system/detail`, {
            method: "POST",
            body: JSON.stringify(body),
            headers: {
                "Content-Type": "application/json",
            },
        }),
        fetchAdviceLookup()
    ]);
    const data = await response.json();

    if (data['data']) {
        // After Data is finished fetching - hide the NOT READY section and show the READY section
        dataNotReadySection.style.display = 'none';
        dataReadySection.style.display = 'block';
        noDataSection.style.display = 'none'

        // Add a click listener to the Download PDF button
        const exportButton = document.querySelector(".exportBtn");
        exportButton.addEventListener('click', () => {
            extractPdf();
        })

        populateView(data['data']);
    }
    else{
        dataNotReadySection.style.display = 'block';
        dataReadySection.style.display = 'none';
        mainSection.style.display = 'none'
        noDataSection.style.display = 'block'
    }
}

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
    const dateSpan = document.getElementById('TOC');
    dateSpan.innerHTML = dateUpload;


    // Add pharmacist name, parchi ID, date of transcribing
    const parchiIdSpan = document.getElementById('parchiId');
    parchiIdSpan.innerText = id;

    const parchiNumberSpan = document.getElementById('parchiPhoneNumber');
    parchiNumberSpan.innerText = phone_number;

    const pharmacistNameSpan = document.getElementById('pharmacistName');
    if(!transcriber) {
        pharmacistNameSpan.innerHTML = `<span class='unavailable'>N/A</span>`
    } else {
        getTranscriber(transcriber, pharmacistNameSpan);
    }
    
    

    const dateTranscribe = formatDateFromTimestamp(TOP);
    const dateOfTranscriptionDiv = document.querySelector('.dateOfTranscription');
    dateOfTranscriptionDiv.innerHTML = `On <span>${dateTranscribe}</span>`;
    if (data.overall_discount < 0) {
        document.querySelector('.savingDiv').style.display = 'none';
    } else {
        document.getElementById('saving').innerText = `(${Math.ceil(data.overall_discount)}%)`
    }

    // Calculate saved amount
    let totalBrandPrice = 0;
    let totalGenericPrice = 0;
    if (conversions) {
        Object.keys(conversions).forEach(brandName => {
            const conv = conversions[brandName];
            const brandP = parseFloat(conv.Price);
            if (!isNaN(brandP)) totalBrandPrice += brandP;
            const genericItems = conv.Conversions;
            if (genericItems) {
                Object.keys(genericItems).forEach(dc => {
                    if (!genericItems[dc]) return;
                    const rate = parseFloat(genericItems[dc]?.drugInfo?.rate);
                    if (!isNaN(rate)) totalGenericPrice += rate;
                });
            }
        });
    }
    const savedAmt = Math.round(totalBrandPrice - totalGenericPrice);
    if (savedAmt > 0) {
        document.getElementById('savedAmount').innerText = `₹ ${savedAmt}/-`;
    }

    // Clear any skeleton loaded/dummy medlist html scripts
    document.querySelectorAll('.medList main').forEach(mainDiv => {
        mainDiv.remove();
    });

    if (conversions) handleConversionMeds(conversions);

    if (generic_order) handleGenericMeds(generic_order);

    if(conversions || generic_order) { // something is present in med orders
        // add the PLACE ORDER button as well
        const placeOrderBtn = document.getElementById('placeOrderBtn');
        placeOrderBtn.href = `https://saya.net.in/deeplink?param1=myprescriptions&param2=${id}`;
        // placeOrderBtn.addEventListener('click', () => {
        //     // this will redirect to the deeplink
        //     alert("PLACED ORDER");
        // })
        
    }
}

function handleGenericMeds(generic_order) {
    // From the product list fetch DC info and put it in the generic order
    Object.keys(generic_order).forEach(dc => {
        const origObj = generic_order[dc];
        const invObj = inventoryByDC[dc];
        if (invObj) {
            generic_order[dc] = { ...origObj};
        }
    })

    const genericMeds = []; // Array after processing and extracting requiured information
    Object.keys(generic_order).forEach(dc => {
        const origObj = generic_order[dc];
        const obj = {};
        obj['drugCode'] = dc;
        obj['composition'] = capitaliseComposition(origObj['generic_name']);
        obj['rate'] = origObj['rate']
        // if (origObj['method'].toLowerCase().includes('tablet')) {
        //     obj['rate'] = Number(origObj['price']) * Number(origObj['trade']['packet_digit']) * origObj['quantity'];
        // } else {
        //     obj['rate'] = Number(origObj['price']) * origObj['quantity'];
        // }
        obj['packet'] = origObj['packet'];
        obj['TI'] = origObj['TI'];
        obj['dosageDetails'] = formatDosageDetails({
            dosage: origObj['dosage'],
            frequency: origObj['frequency'],
            advice: origObj['advice'],
            meals: origObj['meals'] || origObj['Meals'],
            quantity: origObj['quantity'] || origObj['Quantity'],
            route: origObj['route'] || origObj['Route'],
        });

        genericMeds.push(obj);
    })

    // ADD THE GENERIC ITEMS TO THE DOM

    let mainDivs = "";
    genericMeds.forEach((genMed) => {
        let dosageDetailsHtml = genMed.dosageDetails ? `<div class="dosage-details">${genMed.dosageDetails}</div>` : '';

        const mainDiv = `
                <main class="row">
                    <div class="col1"><div class="brandName unavailable">N/A</div></div>

                    <div class="col23">
                        <div class="col2">
                            <div class="convGenericItem">
                                <div class="compUnit"><span id="comp">${genMed.composition}</span> | <span id="unitMethod">${genMed.packet}</span></div>
                                <div class="price">₹&nbsp;<span id="rate">${genMed.rate}</span>/-</div>
                            </div>
                            ${dosageDetailsHtml}
                        </div>

                        <div class="col3">
                            <div class="drugCode">
                                ${genMed.drugCode}
                                ${genMed.TI === "0" ? '<div class="out-of-stock">OUT OF STOCK</div>' : ''}
                            </div>
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
    console.log('conversionssssssssssssssss',conversions)

    // From the product list fetch DC info and put it in the branded order
    Object.keys(conversions).forEach(brandName => {
        const changedConversions = {}, origConversions = conversions[brandName].Conversions;

        if (origConversions) {
            // Object.keys(origConversions).forEach(dc => {
            //     changedConversions[dc] = inventoryByDC[dc];
            //     changedConversions[dc]['ratio'] = origConversions[dc]
            // })
            conversions[brandName].Conversions = origConversions
        }
    })

    // let brand_arr = []
    // let gener_arr = []


    // Traverse on each conversion item and extract required info
    Object.keys(conversions).forEach(brandName => {
        const convObj = {};
        const tempBrandName=brandName.split('_')
        convObj.brandName = tempBrandName[0]
        const comp = capitaliseComposition(conversions[brandName].Comp);
        convObj['composition'] = comp;

        let brandedPrice = parseFloat(Number(conversions[brandName].Price)/Number(conversions[brandName].Digit_Packet))
        convObj['MRP'] = conversions[brandName].Price ? Math.ceil(Number(conversions[brandName].Price)) : 'N/A';
        if (convObj['MRP'] === 'N/A') {
            brandedPrice = 'N/A';
        }
        // brand_arr.push(brandedPrice)

        // Extract info for each converted generic item
        convObj['convItems'] = [];
        const genericConvItems = conversions[brandName].Conversions;
        if (genericConvItems) {
            let totalGenericRate = 0;


            Object.keys(genericConvItems).forEach(dc => {
                if(!genericConvItems[dc]) return;
                let perPacketRate=0
                const obj = {};
                obj['drugCode'] = dc;
                obj['composition'] = capitaliseComposition(genericConvItems[dc]?.drugInfo.generic_name);
                obj['rate'] = Number(genericConvItems[dc].drugInfo?.rate);
                // if(genericConvItems[dc].method === 'Tablet/Capsule') {
                //     rate *= Number(genericConvItems[dc]?.packet_digit);
                //     obj['rate'] = parseFloat(rate);
                //     perPacketRate = Number(genericConvItems[dc]?.price)*genericConvItems[dc].ratio;
                // } else {
                //     obj['rate'] = parseFloat(rate);
                //     perPacketRate = Number(genericConvItems[dc]?.price)/Number(genericConvItems[dc]?.packet_digit)**genericConvItems[dc].ratio 
                // }

                // totalGenericRate += perPacketRate;
                // gener_arr.push(perPacketRate)
                obj['packet'] = genericConvItems[dc]?.drugInfo.packet_digit + " " + genericConvItems[dc]?.drugInfo.packet_size;
                obj['TI'] = genericConvItems[dc]?.TI;

                convObj['convItems'].push(obj);
                // console.log('rate we are checking',rate);
            })

            // if (brandedPrice !== 'N/A') {
            //     const savedAmount = brandedPrice - totalGenericRate;
            //     const savePerc = Math.floor(savedAmount / brandedPrice * 100);
            //     convObj['totalSavings'] = savePerc + "%";
            //     numberOfItems+=1
                
            // } else {
            //     convObj['totalSavings'] = 'N/A';
            // }

            if (conversions[brandName].discount) {
                convObj['totalSavings']  = `${conversions[brandName].discount}%`
                
            } else {
                convObj['totalSavings'] = 'N/A';
            }

            
        }
        // let brand_sum =0
        // brand_arr.forEach(num => brand_sum += num);
        // let gen_sum = 0 
        // gener_arr.forEach(num => gen_sum += num);

        // overAllSavings = Math.floor((brand_sum - gen_sum)/brand_sum *100)


        // Build dosage details from all 6 fields
        convObj['dosageDetails'] = formatDosageDetails({
            dosage: conversions[brandName].Dosage,
            frequency: conversions[brandName].Frequency,
            advice: conversions[brandName].Advice,
            meals: conversions[brandName].Meals,
            quantity: conversions[brandName].Quantity,
            route: conversions[brandName].Route,
        });

        convertedMeds.push(convObj);
    })

    
    console.log('overAllSavings',overAllSavings)

    // ADD THE BRANDED ITEMS TO THE DOM

    // Create and push the HTML script to our index.html
    let mainDivs = "";
    convertedMeds.forEach((convMed) => {
        let convGenericItemDivs = "";

        convMed.convItems.forEach((genericItem) => {
            convGenericItemDivs += `
                <div class="convGenericItem">
                    <div class="compUnit"><span id="comp">${genericItem.composition}</span> | <span id="unitMethod">${genericItem.packet}</span></div>
                    <div class="price">₹&nbsp;<span id="rate">${genericItem.rate}</span>/-</div>
                </div>
            `
        })

        let dosageDetailsHtml = convMed.dosageDetails ? `<div class="dosage-details">${convMed.dosageDetails}</div>` : '';

        let convGenericDrugCodeDivs = "";
        convMed.convItems.forEach(genericItem => {
            convGenericDrugCodeDivs += `
                <div class="drugCode">
                    ${genericItem.drugCode}
                    ${genericItem.TI === "0" ? '<div class="out-of-stock">OUT OF STOCK</div>' : ''}
                </div>
            `
        })

        const mainDiv = `
            <main class="row">
                <div class="col1">
                    <div class="brandName">${convMed.brandName} <span class="mrp ${convMed.MRP === 'N/A' ? 'unavailable' : '' }">(${convMed.MRP !== 'N/A' ? '₹&nbsp;' + convMed.MRP + '/-' : 'N/A'})</span></div>
                </div>

                <div class="col23">
                    ${
                        !convGenericItemDivs
                        ? '<div class="unavailable">Conversion not available/Schedule X- not for sale</div>'
                        : `
                            <div class="col2">
                                ${!convMed.totalSavings || convMed.totalSavings === 'N/A' ? 'Conversion not available/Schedule X- not for sale' : `<div class="totalSavings"><span class="savings-percent">${convMed.totalSavings}</span><span class="savings-label">Saved</span></div>`}

                                ${convGenericItemDivs}
                                ${dosageDetailsHtml}
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
    if(!timestamp) return `<span class='unavailable'>N/A</span>`
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

function formatDosageDetails(infoObj) {
    if(!infoObj) return "";

    const { dosage, frequency, advice, meals, quantity, route } = infoObj;
    const parts = [];

    // Dosage
    if (dosage) {
        const key = dosage.toLowerCase();
        const interpretation = adviceLookup.Dosage[key];
        if (interpretation) {
            parts.push(interpretation);
        } else if (!isNaN(Number(key[0]))) {
            // Handle numeric pattern like 1-0-1
            const splitByHyphen = key.split('-');
            let daysForIdx = [];
            if (splitByHyphen.length === 4) daysForIdx = ['morning', 'afternoon', 'evening', 'night'];
            else if (splitByHyphen.length === 3) daysForIdx = ['morning', 'afternoon', 'evening'];
            else if (splitByHyphen.length === 2) daysForIdx = ['morning', 'evening'];

            const strs = [];
            for (let i = 0; i < splitByHyphen.length; i++) {
                if (splitByHyphen[i] !== '0') {
                    const tablet = splitByHyphen[i] === '1' ? 'tablet' : 'tablets';
                    strs.push(`${splitByHyphen[i]} ${tablet} in the ${daysForIdx[i]}`);
                }
            }
            if (strs.length > 0) parts.push('Take ' + strs.join(', '));
        }
    }

    // Frequency
    if (frequency) {
        const interpretation = adviceLookup.Frequency[frequency.toLowerCase()];
        parts.push(interpretation || frequency);
    }

    // Days (Advice)
    if (advice) {
        parts.push(`For ${advice} ${advice == 1 ? 'day' : 'days'}`);
    }

    // Meals
    if (meals) {
        const interpretation = adviceLookup.Meals[meals.toLowerCase()];
        parts.push(interpretation || meals);
    }

    // Quantity
    if (quantity) {
        parts.push(`Qty: ${quantity}`);
    }

    // Route (skip if null/empty)
    if (route) {
        const interpretation = adviceLookup.Route[route.toLowerCase()];
        parts.push(interpretation || route);
    }

    return parts.length > 0 ? parts.join(' &nbsp;|&nbsp; ') : "";
}

async function getTranscriber(transcriber, pharmacistNameSpan) {
    // get via API
    const url = `https://samasya.tech/api/staff/info/${transcriber}`;
    const apiRes = await fetch(url);
    const res = await apiRes.json();
    if(!res['success']) {
        pharmacistNameSpan.innerHTML = `<span class='unavailable'>N/A</span>`
    } else {
        if(!res['data'] || res['data'].length === 0) {
            pharmacistNameSpan.innerHTML = `<span class='unavailable'>N/A</span>`   
        } else {
            pharmacistNameSpan.innerHTML = res['data'][0]['name']
        }
    }
}

// MAIN DRIVER FUNCTION
function main() {
    // Initially show loader/data not ready screen and hide the data ready screen
    dataNotReadySection.style.display = 'block';
    dataReadySection.style.display = 'none';
    getPrescription();

    // Validate the product list cache and the get details from the backend

    // checkCache().then(inv => {
    //     inventoryByDC = inv;
        
    // });

}
main();