// Roberthalf Jobs Scraper - API-first implementation with HTML fallback
import { Actor, log } from 'apify';
import { gotScraping } from 'got-scraping';
import { CheerioCrawler, Dataset } from 'crawlee';
import { load as cheerioLoad } from 'cheerio';

await Actor.init();

async function main() {
    try {
        const input = (await Actor.getInput()) || {};
        const {
            keyword = '',
            location = '',
            specialization = '',
            jobType = '',
            remote = 'Any',
            results_wanted: RESULTS_WANTED_RAW = 100,
            max_pages: MAX_PAGES_RAW = 20,
            collectDetails = true,
            proxyConfiguration,
        } = input;

        const RESULTS_WANTED = Number.isFinite(+RESULTS_WANTED_RAW) ? Math.max(1, +RESULTS_WANTED_RAW) : 100;
        const MAX_PAGES = Number.isFinite(+MAX_PAGES_RAW) ? Math.max(1, +MAX_PAGES_RAW) : 20;
        const PAGE_SIZE = 25;

        const proxyConf = proxyConfiguration ? await Actor.createProxyConfiguration({ ...proxyConfiguration }) : undefined;

        let saved = 0;
        const seenJobIds = new Set();

        // Helper to clean HTML text
        const cleanText = (html) => {
            if (!html) return '';
            const $ = cheerioLoad(html);
            $('script, style, noscript, iframe').remove();
            return $.root().text().replace(/\s+/g, ' ').trim();
        };

        // Helper to format salary
        const formatSalary = (job) => {
            if (!job.payrate_min && !job.payrate_max) return null;
            const min = job.payrate_min ? `$${parseFloat(job.payrate_min).toLocaleString()}` : '';
            const max = job.payrate_max ? `$${parseFloat(job.payrate_max).toLocaleString()}` : '';
            const period = job.payrate_period || '';
            
            if (min && max) return `${min} - ${max} / ${period}`;
            if (min) return `${min} / ${period}`;
            if (max) return `${max} / ${period}`;
            return null;
        };

        // Primary method: JSON API
        async function fetchJobsFromAPI(pageNumber) {
            const apiUrl = 'https://prd-dr.jps.api.roberthalfonline.com/search';
            
            const payload = {
                country: 'us',
                city: null,
                distance: '50',
                emptype: jobType || null,
                includedoe: '',
                jobtype: null,
                keywords: keyword || '',
                languagecodes: [],
                lobid: specialization || null,
                location: location || '',
                mode: '',
                pagenumber: pageNumber,
                pagesize: PAGE_SIZE,
                postedwithin: '',
                remote: remote || 'Any',
                remoteText: '',
                source: ['Salesforce'],
                timetype: '',
            };

            try {
                log.info(`Fetching page ${pageNumber} from API with keywords: "${keyword}", location: "${location}"`);

                const response = await gotScraping({
                    url: apiUrl,
                    method: 'POST',
                    json: payload,
                    responseType: 'json',
                    proxyUrl: proxyConf ? await proxyConf.newUrl() : undefined,
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json',
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                        'Referer': 'https://www.roberthalf.com/',
                    },
                    throwHttpErrors: false,
                });

                // If the API returns an auth error, stop using API and fall back to HTML
                if (response && response.body && typeof response.body === 'object' && /Missing Authentication Token/i.test(String(response.body.message || ''))) {
                    log.warning('API requires authentication token — switching to HTML fallback');
                    return { jobs: [], totalCount: 0, requiresAuth: true };
                }

                // HTTP 401/403 also mean we should fallback
                if (response && (response.statusCode === 401 || response.statusCode === 403)) {
                    log.warning(`API responded with ${response.statusCode} — switching to HTML fallback`);
                    return { jobs: [], totalCount: 0, requiresAuth: true };
                }

                if (response && response.body && Array.isArray(response.body.jobs) && response.body.jobs.length) {
                    return {
                        jobs: response.body.jobs,
                        totalCount: response.body.totalCount || 0,
                    };
                }

                log.info(`API returned no jobs for page ${pageNumber}`);
                return { jobs: [], totalCount: 0 };
            } catch (error) {
                log.error(`API fetch failed for page ${pageNumber}: ${error.message}`);
                return { jobs: [], totalCount: 0 };
            }
        }

        // HTML fallback: parse listing pages and extract job links and minimal metadata
        async function fetchJobsFromHTML(pageNumber) {
            const searchUrl = `https://www.roberthalf.com/us/en/jobs?keywords=${encodeURIComponent(keyword || '')}&location=${encodeURIComponent(location || '')}&pagenumber=${pageNumber}`;
            try {
                log.info(`Fetching page ${pageNumber} from HTML fallback: ${searchUrl}`);
                const res = await gotScraping({ url: searchUrl, responseType: 'text', proxyUrl: proxyConf ? await proxyConf.newUrl() : undefined, headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'text/html,application/xhtml+xml,application/xml' } });
                const html = typeof res.body === 'string' ? res.body : String(res);
                const $ = cheerioLoad(html);

                // Try to extract embedded JSON payload with jobs first
                const scriptHtml = $('script').map((i, s) => $(s).html()).get().join('\n');
                const match = scriptHtml.match(/aemSettings\.rh_job_search\.[\w_]+\s*=\s*JSON\.parse\('([\s\S]*?)'\);/);
                if (match && match[1]) {
                    try {
                        // The matched group is a JS string literal with escapes. Unescape using JSON.parse
                        const unescaped = JSON.parse('"' + match[1].replace(/"/g, '\\"') + '"');
                        const payload = JSON.parse(unescaped);
                        if (payload && Array.isArray(payload.jobs) && payload.jobs.length) {
                            log.info(`Extracted ${payload.jobs.length} jobs from embedded JSON`);
                            // Normalize to API shape
                            return { jobs: payload.jobs.map(j => ({ jobtitle: j.jobtitle || j.title, job_detail_url: j.job_detail_url || j.job_detail_url, city: j.city, stateprovince: j.stateprovince, unique_job_number: j.unique_job_number || j.sf_jo_number, description: j.description || j.summary })), totalCount: payload.totalCount || (payload.jobs && payload.jobs.length) || 0 };
                        }
                    } catch (err) {
                        log.debug('Embedded JSON parse failed, falling back to DOM scraping');
                    }
                }

                // DOM scraping fallback: find links that look like job postings
                const links = new Map();
                $('a[href]').each((_, a) => {
                    const href = $(a).attr('href');
                    if (!href) return;
                    if (/\/job\//i.test(href)) {
                        const abs = href.startsWith('http') ? href : new URL(href, 'https://www.roberthalf.com').href;
                        const title = $(a).text().trim();
                        if (title && abs) links.set(abs, { jobtitle: title, job_detail_url: abs });
                    }
                });

                const jobs = Array.from(links.values());
                log.info(`Found ${jobs.length} job links on HTML page ${pageNumber}`);
                return { jobs, totalCount: jobs.length };
            } catch (err) {
                log.error(`HTML fetch failed for page ${pageNumber}: ${err.message}`);
                return { jobs: [], totalCount: 0 };
            }
        }

        // Secondary method: HTML parsing fallback
        const crawler = new CheerioCrawler({
            proxyConfiguration: proxyConf,
            maxRequestRetries: 3,
            useSessionPool: true,
            maxConcurrency: 5,
            requestHandlerTimeoutSecs: 60,
            async requestHandler({ request, $, log: crawlerLog }) {
                const label = request.userData?.label || 'DETAIL';

                if (label === 'DETAIL') {
                    if (saved >= RESULTS_WANTED) return;

                    try {
                        // Extract job details from HTML
                        const title = $('h1').first().text().trim() || 
                                     $('[class*="job-title"]').first().text().trim() || null;
                        
                        const company = 'Robert Half';
                        
                        const descSection = $('[class*="description"]').first();
                        const description_html = descSection.length ? descSection.html() : null;
                        const description_text = description_html ? cleanText(description_html) : null;

                        // Extract salary info
                        const salaryText = $('[class*="salary"], [class*="pay"]').first().text().trim();
                        
                        // Extract location
                        const locationText = $('[class*="location"]').first().text().trim() || null;

                        // Extract job type
                        const jobTypeText = $('[class*="job-type"], [class*="employment"]').first().text().trim() || null;

                        // Extract date posted
                        const dateText = $('[class*="date"], [class*="posted"]').first().text().trim() || null;

                        const item = {
                            title,
                            company,
                            location: locationText,
                            salary: salaryText || null,
                            job_type: jobTypeText,
                            date_posted: dateText,
                            description_html,
                            description_text,
                            url: request.url,
                            source: 'roberthalf.com',
                        };

                        await Dataset.pushData(item);
                        saved++;
                        crawlerLog.info(`Scraped job ${saved}/${RESULTS_WANTED}: ${title}`);
                    } catch (err) {
                        crawlerLog.error(`Failed to scrape ${request.url}: ${err.message}`);
                    }
                }
            },
        });

        // Main scraping logic - Try API first
        log.info('Starting Roberthalf Jobs Scraper (API-first mode)');
        
        for (let pageNum = 1; pageNum <= MAX_PAGES && saved < RESULTS_WANTED; pageNum++) {
            // Try API first
            let { jobs, totalCount, requiresAuth } = await fetchJobsFromAPI(pageNum);

            // If API requires auth or returned no jobs, try HTML fallback
            if ((requiresAuth || !jobs || jobs.length === 0)) {
                log.info(`API unavailable or returned no jobs for page ${pageNum}, using HTML fallback`);
                const htmlResult = await fetchJobsFromHTML(pageNum);
                jobs = htmlResult.jobs || [];
                totalCount = htmlResult.totalCount || 0;
            }

            if (!jobs || jobs.length === 0) {
                log.info(`No more jobs found on page ${pageNum}`);
                break;
            }

            log.info(`Processing ${jobs.length} jobs from page ${pageNum}`);

            for (const job of jobs) {
                if (saved >= RESULTS_WANTED) break;

                // Normalize job identifier
                const jobId = job.unique_job_number || job.sf_jo_number || job.job_id || job.job_id || job.job_detail_url;
                if (jobId && seenJobIds.has(jobId)) continue;
                if (jobId) seenJobIds.add(jobId);

                // Build minimal item; prefer API-provided fields when present
                const item = {
                    title: job.jobtitle || job.title || job.job_title || null,
                    company: 'Robert Half',
                    location: job.city && job.stateprovince ? `${job.city}, ${job.stateprovince}` : job.location || null,
                    salary: formatSalary(job) || job.salary || null,
                    job_type: job.emptype || job.job_type || null,
                    date_posted: job.date_posted || job.datePosted || null,
                    description_html: job.description || job.description_html || null,
                    description_text: job.description ? cleanText(job.description) : (job.description_html ? cleanText(job.description_html) : null),
                    skills: job.skills ? cleanText(job.skills) : null,
                    specialization: job.functional_role || job.specialization || null,
                    remote: job.remote === 'yes' ? 'Remote' : job.remote === 'No' ? 'On-site' : (job.remote || null),
                    url: job.job_detail_url || job.url || job.job_detail_url || null,
                    job_id: jobId,
                    source: 'roberthalf.com',
                };

                if (collectDetails && item.url) {
                    try {
                        // Enqueue detail scraping which will push full record
                        await crawler.run([{ url: item.url, userData: { label: 'DETAIL' } }]);
                    } catch (error) {
                        log.warning(`Detail page failed, saving API/HTML data instead for ${item.url}: ${error.message}`);
                        await Dataset.pushData(item);
                        saved++;
                    }
                } else {
                    await Dataset.pushData(item);
                    saved++;
                    log.info(`Saved job ${saved}/${RESULTS_WANTED}: ${item.title}`);
                }
            }

            log.info(`Completed page ${pageNum}. Total jobs saved: ${saved}/${RESULTS_WANTED}`);
        }

        log.info(`Scraping completed. Total jobs saved: ${saved}`);
    } finally {
        await Actor.exit();
    }
}

main().catch((err) => {
    log.error(`Fatal error: ${err.message}`);
    console.error(err);
    process.exit(1);
});
