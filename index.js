// Set options as a parameter, environment variable, or rc file.
// eslint-disable-next-line no-global-assign
//require = require("esm")(module/* , options */)
import esm from 'esm';

import get from 'axios';
import { load } from 'cheerio';
import fs from 'fs';
import { promises as fsp } from 'fs';
import { createWriteStream } from 'fs';


const nabavaUrl= "https://www.nabava.net";

//variables for tabulator formatted JSON
const outputPath = "C:/Users/zpectral/Documents/dev/nabava-popusti/data/";

//category name has to be the same as on nabava.net
// const dataCategories = ["monitori", "misevi", "procesori", "graficke-kartice", "gaming-slusalice", "tipkovnice", "ssd-disk", "cvrsti-diskovi", "sisaci-i-trimeri"];
const dataCategories = ["procesori", "gaming-misevi", "graficke-kartice", "gaming-slusalice", "tipkovnice", "monitori"];
// const dataCategories = ["procesori"];
var dataCollection = {};

//variables for scraper JSON files
const dataCollectionPath = "C:/Users/zpectral/Documents/dev/nabava-scraper/";

//cl to file
const logFile = createWriteStream("scraper.log", {flags:'a'});
function cl(txt) {
    logFile.write(txt + '\n');
}


//get and format date
var runDate = new Date();
var date = runDate.getDate();
var month = runDate.getMonth();
var year = runDate.getFullYear();

function pad(n) {
	return n<10 ? '0'+n : n;
}

var ddmmyyyy = pad(date) + "-" + pad(month + 1) + "-" + year;

cl(" =========================================== \n" + runDate + "\n ===========================================\n");


//load the collectedData JSON file
async function loadDataCollection() {
    await fsp.readFile(dataCollectionPath+"dataCollection.json")
    .then(data => {
        dataCollection = JSON.parse(data);
        cl('Data loaded.\n');
    })
    .catch(err => {
        cl('Data loading failed.\n')
    })
    .finally(function() {
        processCategories(dataCategories);
    })
    
}

loadDataCollection();

//keep track
//var pageNum = 1;
var morePages = false;
var updatedItemsCount = 0;
var newItemsCount = 0;
var basePriceUpdated = 0;


// const params = "?tpkp=1&kPostavke.pregledSortKategorije=2&kPostavke.pregledBrojProizvoda=300"
let params = new URLSearchParams();
params.append('s', 1);
params.append('tpkp', 1);
params.append('kPostavke.pregledSortKategorije', 2);
params.append('kPostavke.pregledBrojProizvoda', 300);
params.append('r', 1);
params.append('r', 2);
params.append('r', 3);

async function getPage(url, page) {
    params.set('s', page)
    try {
        const response = await get(url, {
            params: params,
        })
        // cl("success");
        return response;
    } catch (error) {
        cl(`No response from ${url} at page ${page}]`)
        console.error(error);
    }
}


// process response with cheerio and work on the data 
function processResponse(response, category) {
    const currentTime = runDate.getTime();
    const html = response.data;
    const $ = load(html);
    const reID = /\d+$/;
    // var  nextpagetest = $('.pagination > [data-event-label="next page click"]');
    // check if next page exists
    if($('.pagination > [data-event-label="next page click"]').length) {
        morePages = true;
    } else {
        morePages = false;
    }
    let scrapedPage = $('.product');
    // cl(html);
    // cl(scrapedPage);
    scrapedPage.each((index, element) => {
        let scrapedUrl = $(element).find('.product__link').attr('href');
        let itemLink = nabavaUrl + scrapedUrl;
        let itemID = reID.exec(scrapedUrl)[0];
        let itemInfo = $(element).find('.product__link').attr('title');
        let scrapedPrice = $(element).find('.product__price > div > div:first-child').text().trim();
        let itemPrice = parseFloat(scrapedPrice.replace(/[^\d,]/g, '').replace(',', '.'));
        //if itemID not found in collection
        // let testdatacategory = Object.hasOwn(dataCollection[category], itemID); 
        if (itemID in dataCollection[category] && dataCollection[category][itemID]["itemInfo"] == itemInfo) {
        // if (Object.hasOwn(dataCollection[category], itemID) && dataCollection[category][itemID]["itemInfo"] == itemInfo) {
            //confirm that description is same
            updatedItemsCount++
            let currentObject = dataCollection[category][itemID];
            let prevPrice = currentObject["itemPrice"];
            let basePrice = currentObject["itemBasePrice"];
            // let priceDiff = Math.abs(currentObject["itemPrice"] - itemPrice);
            //update price, pricechange and changedate if price is different
            if (prevPrice != itemPrice) {
                currentObject["itemPrice"] = itemPrice;
                let totalPriceDiff = itemPrice - basePrice; 
                let lastPriceDiff = itemPrice - prevPrice;
                let totalPercentChange = (totalPriceDiff / basePrice) * 100;
                let lastPercentChange = (lastPriceDiff / prevPrice) * 100;
                if (Math.sign(totalPercentChange) == -1) {
                    currentObject["percentChange"] = Math.floor(totalPercentChange); 
                } else {
                    currentObject["percentChange"] = Math.ceil(totalPercentChange); 
                }
                if (Math.abs(lastPercentChange) >= 5) {
                    currentObject["timeUpdated"] = currentTime;
                }
                currentObject["priceChange"] = totalPriceDiff;
                currentObject["dateUpdated"] = ddmmyyyy;
            }

            //calculate and set itemAvgPrice
            let timesScraped = currentObject["timesScraped"];
            let avgPrice = currentObject["itemAvgPrice"];
            let newAvgPrice = (avgPrice * timesScraped + itemPrice) / (timesScraped + 1);
            newAvgPrice = parseFloat(newAvgPrice.toFixed(2));
            currentObject["itemAvgPrice"] = newAvgPrice;

            //set base price (itemBasePrice) to current price (itemPrice) if the price didn't change significantly in the last 30 days
            let tempTime = currentObject["timeUpdated"];
            let timeSinceUpdate = (currentTime - tempTime) / (1000 * 3600 * 24);
            if ( itemPrice > basePrice || timeSinceUpdate >= 30 ) {
                // currentObject["percentChange"] = 0;
                // currentObject["priceChange"] = 0;
                if (itemPrice > (1.5 * avgPrice)) {
                    currentObject["itemBasePrice"] = 1.25 * avgPrice;
                } else {
                    currentObject["itemBasePrice"] = itemPrice;
                }
                basePriceUpdated++;
            }

            //update utility props
            currentObject["timesScraped"] += 1;
            currentObject["timeLastSeen"] = currentTime;
        } else {
            //make new object with that and store it under that itemID 
            let newItem = {
                "itemID": itemID,
                "itemInfo": itemInfo,
                "itemPrice": itemPrice,
                "itemBasePrice": itemPrice,
                "itemAvgPrice": itemPrice,
                "timesScraped": 1,
                "percentChange": 0,
                "priceChange": 0,
                "timeAdded": currentTime,
                "timeUpdated": currentTime,
                "timeLastSeen": currentTime,
                "dateAdded": ddmmyyyy,
                "dateUpdated": ddmmyyyy,
                "itemLink": itemLink,
            }
            dataCollection[category][itemID] = newItem;
            newItemsCount++;
        }

        // console.log('URL:', itemLink);
        // console.log('ID:', itemID);
        // console.log('Title:', itemInfo);
        // console.log('Price:', itemPrice);
        // console.log('---');
    });
}

//init function
async function processCategories(categoriesArray) {
    const startTime = new Date();
    var page = 1;
    for (let i = 0; i<categoriesArray.length; i++) {
        let url = nabavaUrl + "/" + categoriesArray[i];
        if (!(categoriesArray[i] in dataCollection)) {
            dataCollection[categoriesArray[i]] = {}
        }
        var startItemTime = new Date();
        do {
            await getPage(url, page).then(response => processResponse(response, categoriesArray[i])).catch(err => console.error(err));
            page++
        } while (morePages);
        page = 1;
        var endItemTime = new Date();
        cl(`All pages from ${categoriesArray[i]} completed in ` + (endItemTime.getTime() - startItemTime.getTime()) + `ms \n ${updatedItemsCount} updated items \n ${newItemsCount} new items added \n ${basePriceUpdated} base prices changed`);
        updatedItemsCount = 0, 
        newItemsCount = 0,
        basePriceUpdated = 0;
        formatForTabulator(dataCollection[categoriesArray[i]], categoriesArray[i])
    }
    const endTime = new Date();
    cl("All jobs completed in " + (endTime.getTime() - startTime.getTime()) + "ms. \n");
    let dataCollectionjson = JSON.stringify(dataCollection);
    fsp.writeFile(dataCollectionPath+"dataCollection.json", dataCollectionjson).then(cl("dataCollection file written. \n\n")).catch(err => (console.error(err)));
}


    //formatTabJSON(dataCollection[ele], ele); 

function formatForTabulator(obj, ele) {
    let temparr = [];
    for (const prop in obj) {
        temparr.push(obj[prop]);
    }

    let outputJSON = JSON.stringify(temparr);
    fsp.writeFile(outputPath+ele+".json", outputJSON).then(cl(ele + " tabulator file written. \n")).catch(err => (cl(err)));
}

// getPage(URL, 1).then(response => processResponse(response, "misevi")).catch(err => console.error(err));