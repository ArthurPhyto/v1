import axios from 'axios';
import * as cheerio from 'cheerio';
import chalk from 'chalk';
import { lookupDomain } from './domainChecker.js';
import { extractDomain, isValidUrl, isSameDomain, normalizeUrl } from '../utils/urlUtils.js';
import { CrawlQueue } from '../utils/queue.js';

class Crawler {
  constructor(startUrl, callbacks) {
    this.startUrl = startUrl;
    this.callbacks = callbacks;
    this.crawledUrls = new Set();
    this.foundDomains = new Set();
    this.externalSites = new Set();
    this.errors = new Map();
    this.status = 'pending';
    this.queue = new CrawlQueue();
  }

  async start() {
    try {
      if (!isValidUrl(this.startUrl)) {
        throw new Error('URL invalide');
      }

      this.status = 'running';
      this.callbacks.onStatusChange(this.status);
      
      this.baseDomain = extractDomain(this.startUrl);
      this.queue.add(this.startUrl);

      while (!this.queue.isEmpty()) {
        const url = this.queue.next();
        if (!url) continue;

        try {
          const newUrls = await this.crawlUrl(url);
          newUrls.forEach(newUrl => this.queue.add(newUrl));
        } catch (error) {
          const errorMessage = `Erreur sur ${url}: ${error.message}`;
          this.errors.set(url, errorMessage);
          this.callbacks.onError({ url, error: errorMessage });
        }
      }

      this.status = 'completed';
      this.callbacks.onStatusChange(this.status);
    } catch (error) {
      this.status = 'error';
      this.callbacks.onStatusChange(this.status, error.message);
      throw error;
    }
  }

  async crawlUrl(url) {
    const newUrls = new Set();
    
    if (this.crawledUrls.has(url)) return newUrls;
    this.crawledUrls.add(url);

    this.callbacks.onStats({
      crawledCount: this.crawledUrls.size,
      externalCount: this.externalSites.size,
      errorCount: this.errors.size,
      status: this.status
    });

    try {
      console.log(chalk.blue(`Crawling: ${url}`));
      this.callbacks.onUrlCrawled(url);

      const response = await axios.get(url, {
        timeout: 30000,
        maxRedirects: 5,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept': 'text/html',
          'Accept-Language': 'en-US,en;q=0.5'
        },
        validateStatus: status => status < 400
      });

      const contentType = response.headers['content-type'] || '';
      if (!contentType.includes('text/html')) {
        return newUrls;
      }

      const $ = cheerio.load(response.data);
      
      // Ne récupérer que les liens des balises <a>
      $('a[href]').each((_, element) => {
        const href = $(element).attr('href');
        if (!href) return;

        try {
          const absoluteUrl = normalizeUrl(href, url);
          if (!absoluteUrl || !isValidUrl(absoluteUrl)) return;

          const domain = extractDomain(absoluteUrl);
          if (!domain) return;

          if (!isSameDomain(domain, this.baseDomain)) {
            if (!this.externalSites.has(domain)) {
              this.externalSites.add(domain);
              this.callbacks.onExternalSite({
                domain,
                url: absoluteUrl,
                sourceUrl: url
              });

              lookupDomain(domain).then(result => {
                if (result.isExpired) {
                  console.log(chalk.green(`Domaine expiré trouvé: ${domain}`));
                  this.callbacks.onExpiredDomain({
                    domain,
                    reason: result.reason
                  });
                }
              }).catch(error => {
                this.callbacks.onError({ 
                  url: domain, 
                  error: `Erreur DNS/WHOIS: ${error.message}` 
                });
              });
            }
          } else {
            newUrls.add(absoluteUrl);
          }
        } catch (error) {
          this.callbacks.onError({ 
            url: href, 
            error: `URL invalide: ${error.message}` 
          });
        }
      });

      return newUrls;
    } catch (error) {
      let errorMessage = `Erreur lors du crawl: ${error.message}`;
      if (error.response) {
        errorMessage += ` (Status: ${error.response.status})`;
      }
      throw new Error(errorMessage);
    }
  }
}

export function createCrawler(startUrl, callbacks) {
  return new Crawler(startUrl, callbacks);
}