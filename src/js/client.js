import { io } from 'socket.io-client';

class CrawlerUI {
    constructor(crawlerId, url) {
        this.crawlerId = crawlerId;
        this.url = url;
        this.element = this.createCrawlerElement();
        document.getElementById('crawlersContainer').prepend(this.element);
    }

    createCrawlerElement() {
        const template = document.getElementById('crawlerTemplate');
        const element = template.content.cloneNode(true).firstElementChild;
        
        element.id = this.crawlerId;
        element.querySelector('.crawler-url').textContent = this.url;
        
        return element;
    }

    updateStatus(status, error = null) {
        const statusElement = this.element.querySelector('.crawler-status');
        statusElement.textContent = status.charAt(0).toUpperCase() + status.slice(1);
        statusElement.className = `crawler-status ${status}`;

        const errorContainer = this.element.querySelector('.error-container');
        if (error) {
            errorContainer.textContent = `Erreur: ${error}`;
            errorContainer.classList.add('visible');
        } else {
            errorContainer.classList.remove('visible');
        }
    }

    addUrl(url) {
        this.addItemToList('crawled-urls', url);
    }

    addExternalSite(data) {
        const html = `${data.domain} (${data.url})
            <div class="source-url">Source: ${data.sourceUrl}</div>`;
        this.addItemToList('external-sites', html, true);
    }

    addExpiredDomain(data) {
        const html = `${data.domain}
            <div class="source-url">${data.reason}</div>`;
        this.addItemToList('expired-domains', html, true);
    }

    addError(error) {
        const html = `${error.url}: ${error.error}`;
        const div = document.createElement('div');
        div.className = 'url-item error';
        div.textContent = html;
        this.element.querySelector('.error-container').appendChild(div);
    }

    updateStats(stats) {
        this.element.querySelector('.crawled-count').textContent = stats.crawledCount;
        this.element.querySelector('.external-count').textContent = stats.externalCount;
        this.element.querySelector('.error-count').textContent = stats.errorCount;
    }

    addItemToList(className, content, isHTML = false) {
        const div = document.createElement('div');
        div.className = 'url-item';
        if (isHTML) {
            div.innerHTML = content;
        } else {
            div.textContent = content;
        }
        this.element.querySelector(`.${className}`).appendChild(div);
        div.scrollIntoView({ behavior: 'smooth' });
    }
}

const socket = io(window.location.origin);
const crawlers = new Map();

window.startNewCrawl = function() {
    const url = document.getElementById('urlInput').value;
    if (!url) {
        alert('Veuillez entrer une URL valide');
        return;
    }
    
    socket.emit('start-crawl', url);
    document.getElementById('urlInput').value = '';
};

socket.on('crawl-created', ({ crawlerId, url }) => {
    const crawler = new CrawlerUI(crawlerId, url);
    crawlers.set(crawlerId, crawler);
});

socket.on('url-crawled', ({ crawlerId, url }) => {
    const crawler = crawlers.get(crawlerId);
    if (crawler) crawler.addUrl(url);
});

socket.on('external-site', ({ crawlerId, ...data }) => {
    const crawler = crawlers.get(crawlerId);
    if (crawler) crawler.addExternalSite(data);
});

socket.on('expired-domain', ({ crawlerId, ...data }) => {
    const crawler = crawlers.get(crawlerId);
    if (crawler) crawler.addExpiredDomain(data);
});

socket.on('crawl-error', ({ crawlerId, ...error }) => {
    const crawler = crawlers.get(crawlerId);
    if (crawler) crawler.addError(error);
});

socket.on('crawl-stats', ({ crawlerId, ...stats }) => {
    const crawler = crawlers.get(crawlerId);
    if (crawler) crawler.updateStats(stats);
});

socket.on('crawl-status', ({ crawlerId, status, error }) => {
    const crawler = crawlers.get(crawlerId);
    if (crawler) crawler.updateStatus(status, error);
});

socket.on('error', (message) => {
    alert(`Erreur: ${message}`);
});