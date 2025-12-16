import { Actor, log } from 'apify';
import { gotScraping } from 'got-scraping';
import { CheerioCrawler, Dataset } from 'crawlee';
import { load as cheerioLoad } from 'cheerio';

await Actor.init();

const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6098.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.5993.117 Safari/537.36',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
];

const API_HEADERS = {
    Accept: 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
};

const HTML_HEADERS = {
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
};

const pickRandomUserAgent = () => USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];

const cleanText = (html) => {
    if (!html) return null;
    const $ = cheerioLoad(html);
    $('script, style, noscript, iframe').remove();
    const text = $.root().text().replace(/\s+/g, ' ').trim();
    return text || null;
};

const normalizeTitle = (rawTitle) => {
    if (!rawTitle) return null;
    let title = rawTitle.replace(/\s+/g, ' ').trim();
    title = title.replace(/\s*\|\s*Robert Half$/i, '').trim();
    title = title.replace(/\bJob in [^|]+/i, '').trim();
    return title || null;
};

const resolveUrl = (href) => {
    if (!href) return null;
    try {
        return href.startsWith('http') ? href : new URL(href, 'https://www.roberthalf.com').href;
    } catch (err) {
        return null;
    }
};

const toNumber = (value) => {
    if (value === undefined || value === null) return null;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    const cleaned = String(value).replace(/[^0-9.\-]+/g, '');
    if (!cleaned) return null;
    const num = Number(cleaned);
    return Number.isFinite(num) ? num : null;
};

const buildSalaryString = (minValue, maxValue, currency = '$', period = '') => {
    const min = toNumber(minValue);
    const max = toNumber(maxValue);
    const symbol = currency || '$';
    const formatNumber = (val) => `${symbol}${val.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

    if (min !== null && max !== null && min !== max) {
        return `${formatNumber(min)} - ${formatNumber(max)}${period ? ` / ${period}` : ''}`;
    }

    const single = min !== null ? min : max;
    if (single !== null) {
        return `${formatNumber(single)}${period ? ` / ${period}` : ''}`;
    }

    return null;
};

const formatSalary = (job) => {
    if (!job) return null;

    if (job.payrate_min || job.payrate_max) {
        return buildSalaryString(job.payrate_min, job.payrate_max, job.payrate_currency || job.currency || '$', job.payrate_period || '');
    }

    if (job.salary_min || job.salary_max) {
        return buildSalaryString(job.salary_min, job.salary_max, job.salary_currency || job.currency || '$', job.salary_period || job.payrate_period || '');
    }

    if (job.baseSalary) {
        const base = job.baseSalary;
        const baseValue = base.value || base;
        const currency = base.currency || baseValue?.currency || job.currency || '$';
        const period = base.unitText || baseValue?.unitText || '';
        const min = baseValue?.minValue ?? baseValue?.value ?? baseValue?.maxValue;
        const max = baseValue?.maxValue ?? baseValue?.value ?? min;
        return buildSalaryString(min, max, currency, period);
    }

    if (typeof job.salary === 'string' && job.salary.trim()) {
        return job.salary.trim();
    }

    return null;
};

const formatLocationFromJob = (job) => {
    if (!job) return null;
    const address = job.jobLocation?.address || job.address || {};
    const city = job.city || address.addressLocality || address.city;
    const region = job.stateprovince || address.addressRegion || address.state;
    const country = address.addressCountry || address.country;
    const parts = [city, region].filter(Boolean);
    let formatted = parts.join(', ');

    if (!formatted && (job.location || job.locationDisplay || job.location_name)) {
        formatted = job.location || job.locationDisplay || job.location_name;
    }

    if (formatted && country && !formatted.toLowerCase().includes(String(country).toLowerCase())) {
        formatted = `${formatted}, ${country}`;
    }

    return formatted || null;
};

const formatLocationFromJobPosting = (posting) => {
    if (!posting) return null;
    const jobLocation = posting.jobLocation;
    const address = jobLocation?.address || {};
    const city = address.addressLocality || address.city || jobLocation?.addressLocality;
    const region = address.addressRegion || address.state || jobLocation?.addressRegion;
    const country = address.addressCountry || address.country;
    const parts = [city, region].filter(Boolean);
    let formatted = parts.join(', ');

    if (!formatted && jobLocation?.name) {
        formatted = jobLocation.name;
    }

    if (formatted && country && !formatted.toLowerCase().includes(String(country).toLowerCase())) {
        formatted = `${formatted}, ${country}`;
    }

    return formatted || null;
};

const formatSalaryFromJobPosting = (posting) => {
    if (!posting) return null;
    const baseSalary = posting.baseSalary || posting.salary;
    if (!baseSalary) return null;
    if (typeof baseSalary === 'string') return baseSalary;
    const value = baseSalary.value || baseSalary;
    const period = baseSalary.unitText || value?.unitText || posting.salaryPeriod || '';
    const currency = baseSalary.currency || value?.currency || posting.currency || '$';
    const min = value?.minValue ?? value?.value ?? value?.maxValue;
    const max = value?.maxValue ?? value?.value ?? min;
    return buildSalaryString(min, max, currency, period);
};

const deriveJobId = (job, url) => {
    const candidate = job?.unique_job_number || job?.sf_jo_number || job?.job_id || job?.id || job?.positionId || job?.job_id_number;
    if (candidate) return String(candidate);
    if (url) {
        try {
            const parsed = new URL(url);
            return parsed.pathname + parsed.search;
        } catch (err) {
            return url;
        }
    }
    return null;
};

const collectJobPostingsFromJsonLd = (node) => {
    if (!node) return [];
    if (Array.isArray(node)) return node.flatMap(collectJobPostingsFromJsonLd);
    if (typeof node === 'string') {
        try {
            const json = JSON.parse(node);
            return collectJobPostingsFromJsonLd(json);
        } catch (err) {
            return [];
        }
    }
    if (typeof node === 'object') {
        const types = Array.isArray(node['@type']) ? node['@type'] : [node['@type']];
        if (types.some((type) => type && /JobPosting/i.test(type))) {
            return [node];
        }
        return Object.values(node).flatMap(collectJobPostingsFromJsonLd);
    }
    return [];
};

const parseJobPostingsFromScripts = ($) => {
    const postings = [];
    $('script[type="application/ld+json"]').each((_, el) => {
        const raw = $(el).html();
        if (!raw) return;
        const trimmed = raw.trim();
        try {
            postings.push(...collectJobPostingsFromJsonLd(JSON.parse(trimmed)));
        } catch (err) {
            try {
                const unescaped = trimmed.replace(/&quot;/g, '\"');
                postings.push(...collectJobPostingsFromJsonLd(JSON.parse(unescaped)));
            } catch (innerErr) {
                // ignore unparsable script
            }
        }
    });
    return postings;
};

const parseJobPostingDetail = (posting) => {
    if (!posting) return null;
    const title = normalizeTitle(posting.title);
    const description = typeof posting.description === 'string' ? posting.description : null;
    const descriptionHtml = description || null;
    const descriptionText = descriptionHtml ? cleanText(descriptionHtml) : null;
    const location = formatLocationFromJobPosting(posting);
    const salary = formatSalaryFromJobPosting(posting);
    const jobType = Array.isArray(posting.employmentType) ? posting.employmentType.join(', ') : posting.employmentType || null;
    const datePosted = posting.datePosted || posting.date || posting.publishedDate || posting.dateposted || null;
    const skills = Array.isArray(posting.skills)
        ? posting.skills.map((skill) => (typeof skill === 'string' ? skill : skill.name || '')).filter(Boolean).join(', ')
        : posting.skills || null;

    return {
        title,
        description_html: descriptionHtml,
        description_text: descriptionText,
        location,
        salary,
        job_type: jobType,
        date_posted: datePosted,
        skills,
    };
};

const parseJobPostingFromPage = ($) => {
    const scripts = $('script[type="application/ld+json"]').map((_, el) => $(el).html()).get();
    for (const script of scripts) {
        if (!script) continue;
        try {
            const parsed = JSON.parse(script);
            const postings = collectJobPostingsFromJsonLd(parsed);
            if (postings.length) return postings[0];
        } catch (err) {
            try {
                const trimmed = script.trim();
                if (trimmed) {
                    const parsed = JSON.parse(trimmed);
                    const postings = collectJobPostingsFromJsonLd(parsed);
                    if (postings.length) return postings[0];
                }
            } catch (innerErr) {
                // ignore broken JSON-LD
            }
        }
    }
    return null;
};

const extractDetailFallback = ($) => {
    const titleSelector = $('h1').first().text().trim() || $('[class*="job-title"]').first().text().trim();
    const descSection = $('[class*="description"], [id*="description"], .job-description').first();
    const description_html = descSection.length ? descSection.html() : null;
    const description_text = description_html ? cleanText(description_html) : null;
    const salaryText = $('[class*="salary"], [class*="pay"], [class*="compensation"]').first().text().trim() || null;
    const locationText = $('[class*="location"]').first().text().trim() || null;
    const jobTypeText = $('[class*="employment"], [class*="job-type"]').first().text().trim() || null;
    const dateMeta = $('meta[name="datePosted"]').attr('content');
    const dateText = dateMeta || $('[class*="date"], [class*="posted"], [class*="publish"]').first().text().trim() || null;

    return {
        title: normalizeTitle(titleSelector),
        description_html,
        description_text,
        salary: salaryText,
        location: locationText,
        job_type: jobTypeText,
        date_posted: dateText,
    };
};

const mergeDetailData = (jobMeta, structured, fallback, url) => {
    const base = {
        ...jobMeta,
        url,
        company: jobMeta.company || 'Robert Half',
        source: jobMeta.source || 'roberthalf.com',
    };

    const titleCandidate = jobMeta.title || structured?.title || fallback?.title;
    const descriptionHtml = structured?.description_html || fallback?.description_html || base.description_html || null;
    const detailItem = {
        ...base,
        title: normalizeTitle(titleCandidate) || titleCandidate || null,
        location: base.location || structured?.location || fallback?.location || null,
        salary: base.salary || structured?.salary || fallback?.salary || null,
        job_type: base.job_type || structured?.job_type || fallback?.job_type || null,
        date_posted: base.date_posted || structured?.date_posted || fallback?.date_posted || null,
        description_html: descriptionHtml,
        description_text:
            structured?.description_text ||
            fallback?.description_text ||
            (descriptionHtml ? cleanText(descriptionHtml) : null) ||
            base.description_text ||
            null,
        skills: base.skills || structured?.skills || null,
    };

    return detailItem;
};

const buildJobMetaFromListing = (job) => {
    const url = resolveUrl(job.job_detail_url || job.jobDetailUrl || job.url || job.link || job.job_url);
    const title = normalizeTitle(job.jobtitle || job.title || job.job_title || job.PositionTitle || job.positionTitle);
    const descriptionHtml = job.description || job.description_html || job.summary || job.JobDescription || null;
    const descriptionText = descriptionHtml ? cleanText(descriptionHtml) : null;
    const meta = {
        title,
        company: 'Robert Half',
        location: formatLocationFromJob(job),
        salary: formatSalary(job),
        job_type: job.emptype || job.job_type || job.jobtype || job.employmentType || null,
        date_posted: job.date_posted || job.datePosted || job.postedDate || job.publishedDate || null,
        description_html: descriptionHtml,
        description_text: descriptionText,
        url,
        source: 'roberthalf.com',
        skills: job.skills ? cleanText(job.skills) : null,
        specialization: job.functional_role || job.specialization || job.field || null,
        remote: job.remote === 'yes' ? 'Remote' : job.remote === 'No' ? 'On-site' : job.remote || null,
    };
    meta.job_id = deriveJobId(job, url);
    return meta;
};

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
                log.info(`Fetching page ${pageNumber} from API with keywords: \"${keyword}\" and location: \"${location}\"`);
                const response = await gotScraping({
                    url: apiUrl,
                    method: 'POST',
                    json: payload,
                    responseType: 'json',
                    proxyUrl: proxyConf ? await proxyConf.newUrl() : undefined,
                    headers: {
                        ...API_HEADERS,
                        'User-Agent': pickRandomUserAgent(),
                        Referer: 'https://www.roberthalf.com/',
                    },
                    throwHttpErrors: false,
                });

                if (
                    response &&
                    response.body &&
                    typeof response.body === 'object' &&
                    /Missing Authentication Token/i.test(String(response.body.message || ''))
                ) {
                    log.warning('API requires authentication token - switching to HTML fallback');
                    return { jobs: [], totalCount: 0, requiresAuth: true };
                }

                if (response && (response.statusCode === 401 || response.statusCode === 403)) {
                    log.warning(`API responded with ${response.statusCode} - switching to HTML fallback`);
                    return { jobs: [], totalCount: 0, requiresAuth: true };
                }

                if (response && response.body && Array.isArray(response.body.jobs) && response.body.jobs.length) {
                    return {
                        jobs: response.body.jobs,
                        totalCount: response.body.totalCount || 0,
                        requiresAuth: false,
                    };
                }

                log.info(`API returned no jobs for page ${pageNumber}`);
                return { jobs: [], totalCount: 0, requiresAuth: false };
            } catch (error) {
                log.error(`API fetch failed for page ${pageNumber}: ${error.message}`);
                return { jobs: [], totalCount: 0, requiresAuth: false };
            }
        }

        async function fetchJobsFromHTML(pageNumber) {
            const searchUrl = `https://www.roberthalf.com/us/en/jobs?keywords=${encodeURIComponent(keyword || '')}&location=${encodeURIComponent(location || '')}&pagenumber=${pageNumber}`;
            try {
                log.info(`Fetching page ${pageNumber} from HTML fallback: ${searchUrl}`);
                const res = await gotScraping({
                    url: searchUrl,
                    responseType: 'text',
                    proxyUrl: proxyConf ? await proxyConf.newUrl() : undefined,
                    headers: {
                        ...HTML_HEADERS,
                        'User-Agent': pickRandomUserAgent(),
                    },
                });
                const html = typeof res.body === 'string' ? res.body : String(res);
                const $ = cheerioLoad(html);
                const jobsMap = new Map();

                const addJobToMap = (raw) => {
                    const normalized = { ...raw };
                    const jobUrl = resolveUrl(normalized.job_detail_url || normalized.jobDetailUrl || normalized.url || normalized.link || normalized.job_url);
                    if (!jobUrl) return;
                    const existing = jobsMap.get(jobUrl) || {};
                    jobsMap.set(jobUrl, { ...existing, ...normalized, job_detail_url: jobUrl });
                };

                const scriptHtml = $('script')
                    .map((i, script) => $(script).html())
                    .get()
                    .join('\n');
                const match = scriptHtml.match(/aemSettings\.rh_job_search\.[\w_]+\s*=\s*JSON\.parse\('([\s\S]*?)'\);/);
                if (match && match[1]) {
                    try {
                        const unescaped = JSON.parse('"' + match[1].replace(/"/g, '\\"') + '"');
                        const payload = JSON.parse(unescaped);
                        if (payload && Array.isArray(payload.jobs) && payload.jobs.length) {
                            payload.jobs.forEach((job) => addJobToMap(job));
                        }
                    } catch (err) {
                        log.debug('Embedded AEM JSON parse failed, falling back to DOM scraping');
                    }
                }

                const structuredJobs = parseJobPostingsFromScripts($);
                structuredJobs.forEach((posting) => {
                    addJobToMap({
                        jobtitle: posting.title,
                        job_detail_url: posting.url || posting.positionURL,
                        jobLocation: posting.jobLocation,
                        description: posting.description,
                        date_posted: posting.datePosted || posting.dateposted,
                        job_type: posting.employmentType,
                        baseSalary: posting.baseSalary,
                    });
                });

                $('a[href]').each((_, element) => {
                    const href = $(element).attr('href');
                    if (!href || !/\/job\//i.test(href)) return;
                    const abs = resolveUrl(href);
                    if (!abs) return;
                    const title = $(element).text().trim();
                    if (!title) return;
                    addJobToMap({ jobtitle: title, job_detail_url: abs });
                });

                const jobs = Array.from(jobsMap.values());
                log.info(`Found ${jobs.length} job links on HTML page ${pageNumber}`);
                return { jobs, totalCount: jobs.length };
            } catch (err) {
                log.error(`HTML fetch failed for page ${pageNumber}: ${err.message}`);
                return { jobs: [], totalCount: 0 };
            }
        }

        const crawler = new CheerioCrawler({
            proxyConfiguration: proxyConf,
            maxRequestRetries: 3,
            useSessionPool: true,
            maxConcurrency: 5,
            requestHandlerTimeoutSecs: 60,
            async requestHandler({ request, $, log: crawlerLog }) {
                if (saved >= RESULTS_WANTED) return;
                const jobMeta = request.userData?.jobMeta || {};
                try {
                    const posting = parseJobPostingFromPage($);
                    const structured = posting ? parseJobPostingDetail(posting) : null;
                    const fallback = extractDetailFallback($);
                    const detailRecord = mergeDetailData(jobMeta, structured, fallback, request.url);
                    await Dataset.pushData(detailRecord);
                    saved++;
                    crawlerLog.info(`Scraped job ${saved}/${RESULTS_WANTED}: ${detailRecord.title || jobMeta.title || 'unknown title'}`);
                } catch (err) {
                    crawlerLog.error(`Failed to scrape detail ${request.url}: ${err.message}`);
                }
            },
        });

        log.info('Starting Roberthalf Jobs Scraper (API-first mode)');

        for (let pageNum = 1; pageNum <= MAX_PAGES && saved < RESULTS_WANTED; pageNum++) {
            let { jobs, totalCount, requiresAuth } = await fetchJobsFromAPI(pageNum);

            if (requiresAuth || !jobs || jobs.length === 0) {
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

                const jobMeta = buildJobMetaFromListing(job);
                if (!jobMeta.title && !jobMeta.description_html) {
                    log.debug('Skipping job without title or description', { job });
                    continue;
                }

                if (jobMeta.job_id && seenJobIds.has(jobMeta.job_id)) continue;
                if (jobMeta.job_id) seenJobIds.add(jobMeta.job_id);

                if (collectDetails && jobMeta.url) {
                    try {
                        await crawler.run([{ url: jobMeta.url, userData: { label: 'DETAIL', jobMeta } }]);
                    } catch (error) {
                        log.warning(`Detail page failed, saving API/HTML data instead for ${jobMeta.url}: ${error.message}`);
                        await Dataset.pushData(jobMeta);
                        saved++;
                    }
                } else {
                    await Dataset.pushData(jobMeta);
                    saved++;
                    log.info(`Saved job ${saved}/${RESULTS_WANTED}: ${jobMeta.title || 'untitled job'}`);
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
