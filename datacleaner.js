const fs = require('fs');
const fsp = require('fs').promises;

const dataCollectionPath = "C:/Users/zpectral/Documents/dev/nabava-scraper/";
var dataCollection = {};


//cl to file
const logFile = fs.createWriteStream("scraper.log", {flags:'a'});
function cl(txt) {
    logFile.write(txt + '\n');
}

cl( "          CLEANER STARTED \n------------------------------------\n");


//load the collectedData JSON file
async function loadDataCollection() {
    await fsp.readFile(dataCollectionPath+"dataCollection.json")
    .then(data => {
        dataCollection = JSON.parse(data);
        cl('Data loaded.');
    })
    .catch(err => {
        cl('Data loading failed.')
    })
    .finally(function() {
        cleanCollection(dataCollection);
    })
    
}

loadDataCollection();


var removedItemsCount = 0;
var doesntHaveProp = 0;
var numOfItems = 0;


//clean collection
function cleanCollection(obj) {
    let runDate = new Date();

    const startTime = new Date();
    for (const cat in obj) {
        for (const catid in obj[cat]) {
            numOfItems++
            if (obj[cat][catid].hasOwnProperty("timeLastSeen")) {
                let tempTime = obj[cat][catid]["timeLastSeen"];
                let timeSinceLastSeen = (runDate.getTime()-tempTime)/(1000*3600*24);
                if ( timeSinceLastSeen >= 3) {
                    removedItemsCount++
                    delete obj[cat][catid];
                }
            } else {
                doesntHaveProp++;
                if(process.argv[2] === "del") {
                    delete obj[cat][catid];
                }
            }
        }
    }
    const endTime = new Date();

    if(process.argv[2] === "del") {
        cl(`All jobs completed in ` + (endTime.getTime() - startTime.getTime()) + `ms. \n${removedItemsCount} items were last seen 3 days ago and were deleted. \n${doesntHaveProp} items don't have timeLastSeen property and were deleted. \nTotal number of items is ${numOfItems}`);
    } else {
        cl(`All jobs completed in ` + (endTime.getTime() - startTime.getTime()) + `ms. \n${removedItemsCount} items were last seen 3 days ago and were deleted. \n${doesntHaveProp} items don't have timeLastSeen property. \nTotal number of items is ${numOfItems}`);
    }
    let dataCollectionjson = JSON.stringify(dataCollection);
    fsp.writeFile(dataCollectionPath+"dataCollection.json", dataCollectionjson).then(cl("dataCollection file written.\n\n")).catch(err => (console.error(err)));
}

