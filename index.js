const axios = require('axios');
const cheerio = require('cheerio');
const { performLinkedInScraping } = require('./linkedin-scraper');
const express = require('express');
// const puppeteer = require('puppeteer');
const csv = require('csv-parser');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const puppeteer = require('puppeteer-extra');
const fs = require('fs');
const app = express();
const PORT = 4000;

app.use(express.json());
const StealthPlugin = require('puppeteer-extra-plugin-stealth')
puppeteer.use(StealthPlugin())

function readCSVFile(csvFilePath) {
    return new Promise((resolve, reject) => {
        const jsonData = [];
        fs.createReadStream(csvFilePath)
            .pipe(csv())
            .on('data', (row) => {
                const name = row['Name'];
                const linkedInUrl = row['LinkedIn URL'];
                jsonData.push({ name, linkedInUrl });
            })
            .on('end', () => {
                resolve(jsonData);
                console.log('CSV file successfully processed');
            })
            .on('error', (error) => {
                reject(error);
            });
    });
}


//Save the data in a CSV file as Name , LinkedIn URL and JSON data
function writeCSVFile(csvFilePath, jsonData) {
    return new Promise((resolve, reject) => {
        // Check if the CSV file already exists
        const fileExists = fs.existsSync(csvFilePath);

        // If the file exists, use 'append' option while creating the CSV writer
        const csvWriter = createCsvWriter({
            path: csvFilePath,
            header: [
                { id: 'name', title: 'Name' },
                { id: 'linkedInUrl', title: 'LinkedIn URL' },
                { id: 'jsonData', title: 'JSON Data' },
            ],
            // Set 'append' to true if the file exists, so that data is appended, not overwritten
            append: fileExists,
        });

        csvWriter
            .writeRecords(jsonData)
            .then(() => {
                console.log('...Done');
                resolve();
            })
            .catch((error) => {
                console.error('Error while writing to CSV:', error);
                reject(error);
            });
    });
}

async function performFuzzyNameSearchWithUrl(name, university, company, tags) {
    const googleSearchUrl = `https://www.google.com/search?q=${encodeURIComponent(name + ' ' + university + ' ' + company + ' ' + tags)}`;

    try {
        const response = await axios.get(googleSearchUrl);
        const htmlContent = response.data;
        const $ = cheerio.load(htmlContent);

        // Extract the search results from the HTML
        const searchResult = $('h3').first().text().trim();
        // Grab Url from the search result
        let url = $('h3').first().closest('a').attr('href');
        //remove the /url?q= from the url
        url = url.replace('/url?q=', '');
        //remove the &sa= from the url
        url = url.split('&sa=')[0];

        const modifiedUrl = url.replace(/\/\/(.*?)\.linkedin\.com/, '//www.linkedin.com');

        console.log('Search result: ');
        console.log(searchResult);
        console.log('Decoded URL: ' + modifiedUrl); // Log the decoded URL
        // Split if - or , or | or :


        return modifiedUrl;
    } catch (error) {
        console.error(error);
        throw new Error('Error performing fuzzy name search.', error);
    }
}

let searchPage;

async function startPuppeteer() {
    const browser = await puppeteer.launch({ headless: true }); // Change to true for headless mode
    const page = await browser.newPage();
    //Open DevTools then open Application tab and copy the cookie from the cookie section. Find the cookie named li_at and copy the value.
    await page.setCookie({
        name: 'li_at',
        value: process.env.COOKIE,
        domain: '.www.linkedin.com', // Change the domain if needed (use .linkedin.com for all subdomains)
        secure: true,
        httpOnly: true,
        sameSite: 'Lax',
    });
    return page;
}

app.post('/search-linkedin', async (req, res) => {
    const { name, company, university, tags, lUrl } = req.body;
    const startTime = Date.now();
    try {
        let url;
        if (!lUrl) {
            url = await performFuzzyNameSearchWithUrl(name, university, company, tags);
        }
        else {
            url = lUrl;
        }

        const linkedInData = await performLinkedInScraping(searchPage, url);
        if (linkedInData) {
            const endTime = Date.now();
            const responseTime = endTime - startTime;
            linkedInData.responseTime = responseTime;
            res.status(200).json(linkedInData);
        }
        else {
            res.status(404).json({ message: 'No LinkedIn profile found.' });
        }

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});


app.listen(PORT, () => {
    console.log(`Server started on http://localhost:${PORT}`);
});

// (async () => {
//     searchPage = await startPuppeteer();
// })();




//Uncomment the below code to Bulk scrape the data from CSV file
// /*


// Function to read the checkpoint from a file, or create a new one if it doesn't exist
function readCheckpoint() {
    try {
        const checkpoint = fs.readFileSync('checkpoint.txt', 'utf8');
        return parseInt(checkpoint);
    } catch (err) {
        return 0;
    }
}

// Function to write the checkpoint to a file
function writeCheckpoint(index) {
    fs.writeFileSync('checkpoint.txt', index.toString(), 'utf8');
}

(async () => {
    searchPage = await startPuppeteer();
    const jsonData = await readCSVFile('user.csv');
    let linkedInData = [];
    const startIndex = readCheckpoint();
    const batchSize = 50; // Set the batch size to 50 users

    for (let i = startIndex; i < Math.min(startIndex + batchSize, jsonData.length); i++) {
        const data = jsonData[i];

        console.log('User No: ' + i + ' ' + data.name + ' Remaining Users: ' + (jsonData.length - i));

        if (data.linkedInUrl !== 'n/a' && data.linkedInUrl.length > 0) {
            console.log('Searching for ' + data.name + ' ' + data.linkedInUrl);

            if ((!data.linkedInUrl.startsWith('https://') && (!data.linkedInUrl.startsWith('http://')))) {
                data.linkedInUrl = 'https://' + data.linkedInUrl;
            }

            const linkedInProfileData = await performLinkedInScraping(searchPage, data.linkedInUrl);
            if (linkedInProfileData) {
                linkedInData.push({
                    name: data.name,
                    linkedInUrl: data.linkedInUrl,
                    jsonData: JSON.stringify(linkedInProfileData)
                });
            }
        } else {
            console.log('Search skipped for ' + data.name + ' as no LinkedIn URL was provided in the CSV file.')
            linkedInData.push({
                name: data.name,
                linkedInUrl: data.linkedInUrl,
                jsonData: 'n/a'
            });
        }

        // Write to CSV file after scraping each profile
        await writeCSVFile('output.csv', linkedInData);
        //Make Linked In Data empty

        linkedInData = [];

        // Update the checkpoint after each iteration
        writeCheckpoint(i + 1);
        // If there are more users to process, run the script again
        if (startIndex + batchSize < jsonData.length) {
            console.log('Script will run again for the next batch of users.');
        }
    }
})();


// */