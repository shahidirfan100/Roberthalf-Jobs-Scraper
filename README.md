# Robert Half Jobs Scraper

Extract comprehensive job listings from Robert Half, one of the world's largest specialized staffing and recruitment firms. This high-performance scraper delivers accurate, structured job data across all specializations including finance, accounting, technology, legal, marketing, and administrative roles.

## Why Use Robert Half Jobs Scraper?

<ul>
  <li><strong>Efficient API-First Architecture</strong> – Primary data extraction via JSON API ensures fast, reliable results with minimal resource usage</li>
  <li><strong>Comprehensive Coverage</strong> – Access thousands of jobs across all US locations and specializations</li>
  <li><strong>Advanced Filtering</strong> – Search by keyword, location, specialization, employment type, and remote work preferences</li>
  <li><strong>Structured Data</strong> – Clean, consistent output with salary ranges, job descriptions, skills, and metadata</li>
  <li><strong>Production-Ready</strong> – Built with Apify SDK and Crawlee for enterprise reliability and scalability</li>
</ul>

## Key Features

<ul>
  <li>⚡ <strong>JSON API primary method</strong> with HTML parsing fallback for maximum reliability</li>
  <li>🎯 <strong>Precise filtering</strong> by keyword, location, specialization, job type, and remote options</li>
  <li>📊 <strong>Rich data extraction</strong> including job titles, salaries, descriptions, skills, locations, and posting dates</li>
  <li>🔄 <strong>Smart pagination</strong> with configurable result limits and page caps</li>
  <li>🛡️ <strong>Built-in deduplication</strong> prevents duplicate job listings</li>
  <li>⚙️ <strong>Flexible configuration</strong> for detail scraping and proxy support</li>
</ul>

## Input Configuration

Configure the scraper with these input parameters:

<table>
  <thead>
    <tr>
      <th>Parameter</th>
      <th>Type</th>
      <th>Description</th>
      <th>Default</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td><code>keyword</code></td>
      <td>String</td>
      <td>Job title or search term (e.g., "Accountant", "Software Engineer", "Marketing Manager")</td>
      <td><code>"accountant"</code></td>
    </tr>
    <tr>
      <td><code>location</code></td>
      <td>String</td>
      <td>City, state, or region (e.g., "New York", "Los Angeles, CA", "Texas")</td>
      <td><code>"New York"</code></td>
    </tr>
    <tr>
      <td><code>specialization</code></td>
      <td>String</td>
      <td>Filter by practice area: Finance & Accounting, Technology, Marketing & Creative, Legal, Administrative</td>
      <td><code>""</code> (all)</td>
    </tr>
    <tr>
      <td><code>jobType</code></td>
      <td>String</td>
      <td>Employment type: "Perm", "Temp", "Temp to Perm"</td>
      <td><code>""</code> (all)</td>
    </tr>
    <tr>
      <td><code>remote</code></td>
      <td>String</td>
      <td>Remote work filter: "Any", "yes" (remote only), "No" (on-site only)</td>
      <td><code>"Any"</code></td>
    </tr>
    <tr>
      <td><code>results_wanted</code></td>
      <td>Integer</td>
      <td>Maximum number of jobs to collect (1-1000)</td>
      <td><code>100</code></td>
    </tr>
    <tr>
      <td><code>max_pages</code></td>
      <td>Integer</td>
      <td>Maximum result pages to process (25 jobs per page)</td>
      <td><code>20</code></td>
    </tr>
    <tr>
      <td><code>collectDetails</code></td>
      <td>Boolean</td>
      <td>Visit individual job pages for full descriptions (slower but more complete)</td>
      <td><code>false</code></td>
    </tr>
    <tr>
      <td><code>proxyConfiguration</code></td>
      <td>Object</td>
      <td>Proxy settings for request routing. Apify Proxy recommended.</td>
      <td>Residential proxies</td>
    </tr>
  </tbody>
</table>

## Usage Examples

### Example 1: Finance Jobs in New York

```json
{
  "keyword": "Financial Analyst",
  "location": "New York, NY",
  "specialization": "Finance & Accounting",
  "jobType": "Perm",
  "results_wanted": 50,
  "collectDetails": false
}
```

### Example 2: Remote Technology Positions

```json
{
  "keyword": "Software Developer",
  "location": "",
  "specialization": "Technology",
  "remote": "yes",
  "results_wanted": 100,
  "max_pages": 10
}
```

### Example 3: Temporary Administrative Roles

```json
{
  "keyword": "Administrative Assistant",
  "location": "California",
  "specialization": "Administrative & Customer Support",
  "jobType": "Temp",
  "results_wanted": 75
}
```

## Output Schema

Each job listing includes the following structured data:

```json
{
  "title": "Senior Accountant",
  "company": "Robert Half",
  "location": "New York, NY",
  "salary": "$75,000 - $95,000 / Yearly",
  "job_type": "Perm",
  "remote": "On-site",
  "specialization": "Finance & Accounting",
  "date_posted": "2025-12-15T10:30:00Z",
  "description_html": "<p>Full job description with HTML formatting...</p>",
  "description_text": "Plain text version of job description...",
  "skills": "Accounting, Financial Reporting, Excel, QuickBooks, GAAP",
  "job_id": "03220-0013333752-usen",
  "url": "https://www.roberthalf.com/us/en/job/...",
  "source": "roberthalf.com"
}
```

### Field Descriptions

<dl>
  <dt><strong>title</strong></dt>
  <dd>Job position title</dd>
  
  <dt><strong>company</strong></dt>
  <dd>Always "Robert Half"</dd>
  
  <dt><strong>location</strong></dt>
  <dd>City and state of the job</dd>
  
  <dt><strong>salary</strong></dt>
  <dd>Salary range with pay period (hourly/yearly)</dd>
  
  <dt><strong>job_type</strong></dt>
  <dd>Employment type (Permanent, Temporary, Temp to Permanent)</dd>
  
  <dt><strong>remote</strong></dt>
  <dd>Work arrangement (Remote, On-site, or null)</dd>
  
  <dt><strong>specialization</strong></dt>
  <dd>Job category or functional role</dd>
  
  <dt><strong>date_posted</strong></dt>
  <dd>ISO 8601 formatted posting date</dd>
  
  <dt><strong>description_html</strong></dt>
  <dd>Full job description with HTML formatting</dd>
  
  <dt><strong>description_text</strong></dt>
  <dd>Plain text version of description</dd>
  
  <dt><strong>skills</strong></dt>
  <dd>Required skills and qualifications</dd>
  
  <dt><strong>job_id</strong></dt>
  <dd>Unique Robert Half job identifier</dd>
  
  <dt><strong>url</strong></dt>
  <dd>Direct link to job posting</dd>
</dl>

## Performance & Best Practices

### Optimization Tips

<ol>
  <li><strong>Set collectDetails to false</strong> for faster scraping when basic job info is sufficient</li>
  <li><strong>Use specific locations</strong> instead of broad regions to reduce result volume</li>
  <li><strong>Apply specialization filters</strong> to narrow results and improve relevance</li>
  <li><strong>Configure appropriate page limits</strong> based on your needs (25 jobs per page)</li>
  <li><strong>Enable Apify Proxy</strong> for consistent access and rate limit management</li>
</ol>

### Expected Performance

<ul>
  <li>API-only mode: ~500-1000 jobs per minute</li>
  <li>With detail scraping: ~50-150 jobs per minute</li>
  <li>Memory usage: 512MB - 1GB typical</li>
  <li>Compute units: 0.01-0.05 per 100 jobs (API-only)</li>
</ul>

## Use Cases

<ul>
  <li><strong>Recruitment & Talent Acquisition</strong> – Monitor job market trends and identify candidate opportunities</li>
  <li><strong>Competitive Intelligence</strong> – Track hiring patterns and salary ranges in your industry</li>
  <li><strong>Job Aggregation Platforms</strong> – Integrate Robert Half listings into job boards and career sites</li>
  <li><strong>Market Research</strong> – Analyze employment trends, skill demands, and regional variations</li>
  <li><strong>Salary Benchmarking</strong> – Collect compensation data for HR and finance planning</li>
  <li><strong>Job Alert Services</strong> – Build notification systems for new postings matching criteria</li>
</ul>

## Technical Details

### Architecture

<ul>
  <li><strong>Primary Method:</strong> Direct JSON API calls to Robert Half's job search endpoint</li>
  <li><strong>Fallback Method:</strong> HTML parsing with Cheerio when detail scraping is enabled</li>
  <li><strong>Framework:</strong> Built on Apify SDK and Crawlee for production reliability</li>
  <li><strong>Concurrency:</strong> Configurable parallel processing with rate limiting</li>
  <li><strong>Deduplication:</strong> In-memory job ID tracking prevents duplicates</li>
</ul>

### Data Quality

<ul>
  <li>✅ All data sourced directly from Robert Half's official systems</li>
  <li>✅ Structured JSON output with consistent schema</li>
  <li>✅ HTML and plain text descriptions for flexibility</li>
  <li>✅ Complete salary information when available</li>
  <li>✅ Accurate location and remote work metadata</li>
</ul>

## Integration & Export

Results can be exported in multiple formats:

<ul>
  <li><strong>JSON</strong> – Native format with full data structure</li>
  <li><strong>CSV</strong> – Compatible with Excel and data analysis tools</li>
  <li><strong>XML</strong> – For legacy system integration</li>
  <li><strong>RSS Feed</strong> – For automated monitoring and alerts</li>
</ul>

Access data via:
<ul>
  <li>Apify API</li>
  <li>Direct dataset download</li>
  <li>Webhook notifications</li>
  <li>Scheduled exports to cloud storage</li>
</ul>

## Troubleshooting

### Common Issues

<details>
  <summary><strong>No results returned</strong></summary>
  <ul>
    <li>Verify your search criteria aren't too restrictive</li>
    <li>Check that location spelling matches US city/state names</li>
    <li>Try broader keywords or remove filters</li>
    <li>Ensure max_pages is set appropriately</li>
  </ul>
</details>

<details>
  <summary><strong>Slow performance</strong></summary>
  <ul>
    <li>Disable collectDetails for API-only mode</li>
    <li>Reduce results_wanted to focus on most relevant jobs</li>
    <li>Use residential proxies for better connection speeds</li>
    <li>Increase memory allocation if processing large result sets</li>
  </ul>
</details>

<details>
  <summary><strong>Incomplete job descriptions</strong></summary>
  <ul>
    <li>Enable collectDetails to scrape full detail pages</li>
    <li>Some jobs may have limited descriptions in source data</li>
    <li>Check description_text field if description_html is empty</li>
  </ul>
</details>

## Compliance & Legal

<ul>
  <li>This scraper respects robots.txt and rate limiting</li>
  <li>Data is publicly available on roberthalf.com</li>
  <li>Users are responsible for compliance with local data protection laws</li>
  <li>Commercial use should comply with Robert Half's terms of service</li>
</ul>

## Support & Feedback

For questions, issues, or feature requests:

<ul>
  <li>📧 Contact through Apify platform</li>
  <li>💬 Community support in Apify Discord</li>
  <li>📖 Apify documentation at docs.apify.com</li>
</ul>

---

<p align="center">
  Built with ❤️ using <a href="https://apify.com">Apify SDK</a> | Last updated: December 2025
</p>
