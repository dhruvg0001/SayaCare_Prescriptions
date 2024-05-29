function extractPdf() {
    const navbarDiv = document.getElementById('navbar').cloneNode(true);
    const mainDiv = document.getElementById('main').cloneNode(true);
    const footerDiv = document.getElementById('footer').cloneNode(true);

    const realContainerDiv = document.querySelector('.container');

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