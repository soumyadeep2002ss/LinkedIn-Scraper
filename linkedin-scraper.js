const puppeteer = require('puppeteer');
const cheerio = require('cheerio');
const fs = require('fs');
require("dotenv").config();

// Log in to LinkedIn
async function login(page) {
    await page.goto('https://www.linkedin.com/login');
    await page.waitForSelector('#username');

    // Enter the user's email address and password
    await page.type('#username', process.env.EMAIL);
    await page.type('#password', process.env.PASSWORD);

    // Click the login button
    await page.click('button[type="submit"]');

    // Wait for the login process to complete
    await page.waitForNavigation();

    // Pause execution and wait for manual security checks
    console.log('Please complete any necessary security checks manually.');
    await new Promise((resolve) => setTimeout(resolve, 15000)); // Wait for 15 seconds
}

async function scrapeLinkedInProfile(html, urlToScrape) {
    try {
        // Use Cheerio to parse the HTML and extract the desired data
        const $ = cheerio.load(html);

        const linkedInUrl = urlToScrape;

        // Extract name, connections count, description, location, experience, education, skills, and recent posts from the profile
        const name = $('.text-heading-xlarge').text().trim();
        const description = $('.text-body-medium').text().trim();


        // Extract connections count
        const connectionsElement = $('li.text-body-small').last();
        let connections = connectionsElement.text().trim();

        //remove connections from the string
        connections = connections.replace('connections', '').trim();


        // Extract Location
        const locationElement = $('span.text-body-small.inline.t-black--light.break-words');
        const location = locationElement.text().trim();


        // Extract the professional experiences
        const experience = [];
        const experienceSection = $('section').find('div#experience').parent();
        experienceSection.find('.pvs-entity--padded').each((index, element) => {
            const jobTitle = $(element).find('.t-bold').find('[aria-hidden="true"]').first().text().trim();

            // Extract company and job type from the combined string
            const combinedText = $(element).find('.t-14.t-normal').find('[aria-hidden="true"]').first().text().trim();
            const regex = /^(.+) · (.+)$/; // Regular expression to separate company and job type
            //if . not present in the regex then it set company as whole string

            if (combinedText.includes('·')) {
                var match = combinedText.match(regex);
                var company = match ? match[1] : '';
                var jobType = match ? match[2] : '';
            }

            else {
                var company = combinedText;
                var jobType = '';
            }


            // Extract the job description
            const jobDescriptionElement = $(element).find('.pv-shared-text-with-see-more');
            let jobDescription = jobDescriptionElement.find('.inline-show-more-text').find('span.visually-hidden').first().text().trim();
            //if jobDescription starts with Skills then it is not a jobDescription
            if (jobDescription.startsWith('Skills')) {
                jobDescription = '';
            }
            // Remove the "see more" button text
            const seeMoreText = jobDescriptionElement.find('.inline-show-more-text__button').text().trim();
            jobDescription = jobDescription.replace(seeMoreText, '');
            // Remove unnecessary newlines and extra whitespaces with new lines
            jobDescription = jobDescription.replace(/\n/g, ', ');


            // Extract the skills
            const skills = [];
            const skillElement = $(element).find('.pv-shared-text-with-see-more');
            let skill = skillElement.find('.inline-show-more-text').find('span.visually-hidden').last().text().trim();

            if (skill.startsWith('Skills:')) {
                skill = skill.replace('Skills:', '').trim();
                skill = skill.split('·');
                skill.forEach(element => {
                    skills.push(element.trim());
                }
                );
            }


            // Extract the duration
            const durationString = $(element).find('.t-14.t-normal.t-black--light').find('[aria-hidden="true"]').first().text().trim();
            const [startDateString, endDateAndDuration] = durationString.split(" - ");
            // Check if endDateAndDuration exists and is not undefined
            let [endDateString, durationText] = endDateAndDuration ? endDateAndDuration.split(" · ") : ['', ''];

            // Check if the end date is "Present"
            const isPresent = endDateString && endDateString.includes("Present");
            if (isPresent) {
                // Replace "Present" with the current date in the format "Month Year"
                const currentDate = new Date();
                const currentMonth = currentDate.toLocaleString("default", { month: "short" });
                const currentYear = currentDate.getFullYear();
                endDateString = `${currentMonth} ${currentYear}`;
            }

            // Convert start and end dates to date strings in the format day/month/year
            const startDateParts = startDateString.trim().split(" ");
            const startMonth = startDateParts[0];
            const startYear = parseInt(startDateParts[1], 10);
            let startDate = new Date(startYear, new Date(Date.parse(`${startMonth} 1, ${startYear}`)).getMonth(), 1);

            const endDateParts = endDateString && endDateString.trim().split(" ");
            const endMonth = endDateParts ? endDateParts[0] : '';
            const endYear = endDateParts ? parseInt(endDateParts[1], 10) : '';
            const lastDayOfMonth = new Date(endYear, new Date(Date.parse(`${endMonth} 1, ${endYear}`)).getMonth() + 1, 0).getDate();
            let endDate = endMonth && endYear ? new Date(endYear, new Date(Date.parse(`${endMonth} 1, ${endYear}`)).getMonth(), lastDayOfMonth) : '';

            if (startDate) {
                startDate = startDate.toLocaleString().split(',')[0];
            }

            if (endDate) {
                endDate = endDate.toLocaleString().split(',')[0];
            }

            const durationRegex = /(\d+)\s*mos/i;
            const durationInMonths = durationText.match(durationRegex) ? parseInt(durationText.match(durationRegex)[1]) : 0;
            const location = $(element).find('.t-14.t-normal.t-black--light').eq(1).find('[aria-hidden="true"]').first().text().trim();
            const companyUrl = $(element).find('a.optional-action-target-wrapper').first().attr('href');

            if (isPresent) {
                endDate = 'Present';
            }

            experience.push({ jobTitle, company, jobType, jobDescription, skills, startDate, endDate, durationInMonths, location, companyUrl });
        });


        // Extract the education details
        const education = [];
        // Find the section with id="education"
        const educationSection = $('section').find('div#education').parent();
        educationSection.find('.pvs-entity--padded').each((index, element) => {
            const institutionElement = $(element).find('.t-14.t-normal').find('[aria-hidden="true"]').first();
            const institution = $(element).find('.t-bold').find('[aria-hidden="true"]').first().text().trim();
            const institutionLink = institutionElement.closest('a').attr('href');

            const degreeElement = $(element).find('.t-14.t-normal').find('[aria-hidden="true"]').first();
            const degree = degreeElement.text().trim();
            const duration = $(element).find('.t-14.t-normal.t-black--light').find('[aria-hidden="true"]').first().text().trim();
            const [startYear, endYear] = duration.split(" - ");

            education.push({ institution, institutionLink, degree, startYear, endYear });
        });


        // Extract the skills
        const skillsSection = $('section').find('div#skills').parent();
        const skills = [];

        skillsSection.find('.pvs-list__item--one-column').each((index, element) => {
            const skillTopic = $(element).find('.t-bold').find('[aria-hidden="true"]').text().trim();
            if (skillTopic.length > 0) {
                skills.push(skillTopic);
            }
        });


        // Extract the about 
        const aboutSection = $('section').find('div#about').parent();
        const aboutElement = aboutSection.find('.pv-shared-text-with-see-more');
        let about = aboutElement.text().trim();
        // Remove the "see more" button text
        const seeMoreText = aboutElement.find('.inline-show-more-text__button').text().trim();
        about = about.replace(seeMoreText, '');

        // Remove unnecessary newlines and extra whitespaces with new lines
        about = about.replace(/\n\s+/g, ' ');


        // Extract the recent posts
        const content_collectionsSection = $('section').find('div#content_collections').parent();
        const recentPosts = [];

        content_collectionsSection.find('.profile-creator-shared-feed-update__mini-container').each((index, element) => {
            const postLink = $(element).find('a[aria-label^="View full post."]').attr('href');
            let postContent = $(element).find('.inline-show-more-text').text().trim().replace(/\n\s+/g, ' ').trim();
            postContent = postContent.replace('…show more', ''); // Remove the "…show more" part

            recentPosts.push({
                link: postLink,
                content: postContent,
            });
        });

        // Format the data into an object
        const profileData = {
            name,
            linkedInUrl,
            description,
            connections,
            location,
            about,
            professionalExperience: experience,
            education,
            skills,
            recentPosts,
        };
        return profileData;
    } catch (error) {
        console.error('Error occurred while scraping the page:', error);
        return null;
    }
}

async function performLinkedInScraping(page, urlToScrape) {

    //Uncomment the below line if you want to login to LinkedIn without using cookies and comment the above code
    // await login(page);

    // Navigate to the URL
    await page.goto(urlToScrape, { waitUntil: 'domcontentloaded' });

    // Wait for any lazy-loaded content to load (if applicable)
    await page.waitForTimeout(2000);

    // Get the whole HTML data of the page
    const html = await page.content();
    try {
        const profileData = await scrapeLinkedInProfile(html, urlToScrape);
        // Save as JSON file
        if (!fs.existsSync('Output')) {
            fs.mkdirSync('Output');
        }
        // fs.writeFile('Output/profileData.json', JSON.stringify(profileData, null, 2), (err) => {
        //     if (err) {
        //         console.error('Error saving data to profileData.json:', err);
        //     } else {
        //         console.log('Data saved to profileData.json!');
        //     }
        // });
        return profileData;
    } catch (error) {
        console.error(error.message);
    }
}

module.exports = {
    performLinkedInScraping
}


