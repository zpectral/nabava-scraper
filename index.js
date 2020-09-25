// Set options as a parameter, environment variable, or rc file.
// eslint-disable-next-line no-global-assign
require = require("esm")(module/* , options */)

const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const fsp = require('fs').promises;


const nabavaUrl= "https://www.nabava.net";

//variables for tabulator formatted JSON
const outputPath = "C:/Users/zpectral/Documents/dev/nabava-popusti/data/";

//category name has to be the same as on nabava.net
const dataCategories = ["monitori", "misevi", "procesori", "graficke-kartice", "gaming-slusalice", "tipkovnice", "ssd-disk", "cvrsti-diskovi", "sisaci-i-trimeri"];
var dataCollection = {};

//variables for scraper JSON files
const dataCollectionPath = "C:/Users/zpectral/Documents/dev/nabava-scraper/";

//cl to file
const logFile = fs.createWriteStream("scraper.log", {flags:'a'});
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
        processArray(dataCategories);
    })
    
}

loadDataCollection();

//keep track
//var pageNum = 1;
var updatedItemsCount = 0;
var newItemsCount = 0;
var basePriceUpdated = 0;

// async axios
async function getPage(url, page) {
    const params = "?tpkp=1&kPostavke.pregledSortKategorije=0&kPostavke.pregledBrojProizvoda=300"
    try {
        const response = await axios.get(url+params, {
            params: {
                s: page,
            },
        })
        //cl("success");
        return response;
    } catch (error) {
        console.error(error);
    }
}
// process response with cheerio and work on the obj
function processResponse(response, ele) {
    const currentTime = runDate.getTime();
    const reID = /\d+$/;
    const $ = cheerio.load(response.data);
    if($('.next').length) {
        morePages = true;
    } else {
        morePages = false;
    }
    let scrapedPage = $('.product');
    scrapedPage.each(function(i, el) {
        //check if there is a next page
        let scrapedUrl = $(this).find('.productnamecontainer a').attr('href');
        let itemLink= nabavaUrl + scrapedUrl;
        let itemID = reID.exec(scrapedUrl)[0];
        let itemInfo = $(this).find('.productnamecontainer a').attr('title');
        let scrapedPrice = $(this).find('.low').text();
        let itemPrice = parseInt(scrapedPrice.replace(/\D/g, '')); 
        //if itemID not found in collection
        if (itemID in dataCollection[ele] && dataCollection[ele][itemID]["itemInfo"] == itemInfo) {
            //confirm that description is same
            updatedItemsCount++
            let currentObject = dataCollection[ele][itemID];
            let priceDiff = Math.abs(currentObject["itemPrice"]-itemPrice);
            currentObject["timeLastSeen"] = currentTime;
            //update price, pricechange and changedate if price is different
            if (priceDiff >= 1) {
                let startPrice = currentObject["itemStartPrice"];
                let prevPrice = currentObject["itemPrice"];
                currentObject["itemPrice"] = itemPrice;
                let totalPriceDiff = itemPrice - startPrice; 
                let lastPriceDiff = itemPrice - prevPrice;
                let totalPercentChange = (totalPriceDiff / startPrice) * 100;
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
            //set base price (itemStartPrice) to current price (itemPrice) if the price didn't change significantly in the last 30 days
            let tempTime = currentObject["timeUpdated"];
            let timeSinceUpdate = (currentTime-tempTime)/(1000*3600*24);
            if ( timeSinceUpdate >= 30) {
                currentObject["percentChange"] = 0;
                currentObject["priceChange"] = 0;
                currentObject["itemStartPrice"] = itemPrice;
                basePriceUpdated++;
            }
        } else {
            //make new object with that itemID and store in collection
            newItemsCount++
            dataCollection[ele][itemID] = {};
            dataCollection[ele][itemID]["itemID"] = itemID;
            dataCollection[ele][itemID]["itemInfo"] = itemInfo;
            dataCollection[ele][itemID]["itemPrice"] = itemPrice;
            dataCollection[ele][itemID]["itemStartPrice"] = itemPrice;
            dataCollection[ele][itemID]["percentChange"] = 0;
            dataCollection[ele][itemID]["priceChange"] = 0;
            dataCollection[ele][itemID]["timeAdded"] = currentTime;
            dataCollection[ele][itemID]["timeUpdated"] = currentTime;
            dataCollection[ele][itemID]["timeLastSeen"] = currentTime;
            dataCollection[ele][itemID]["dateAdded"] = ddmmyyyy;
            dataCollection[ele][itemID]["dateUpdated"] = ddmmyyyy;
            dataCollection[ele][itemID]["itemLink"] = itemLink;
        }

    })
}


//init function
async function processArray(arr) {
    const startTime = new Date();
    var page = 0;
    for (let i = 0; i<arr.length; i++) {
        let url = nabavaUrl + "/" + arr[i];
        if (!(arr[i] in dataCollection)) {
            dataCollection[arr[i]] = {}
        }
        var startItemTime = new Date();
        do {
            page++
            await getPage(url, page).then(response => processResponse(response, arr[i])).catch(err => console.error(err));
        } while (morePages);
        page = 0;
        var endItemTime = new Date();
        cl(`All pages from ${arr[i]} completed in ` + (endItemTime.getTime() - startItemTime.getTime()) + `ms \n ${updatedItemsCount} updated items \n ${newItemsCount} new items added \n ${basePriceUpdated} base prices changed`);
        updatedItemsCount = 0, 
        newItemsCount = 0,
        basePriceUpdated = 0;
        formatForTabulator(dataCollection[arr[i]], arr[i])
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