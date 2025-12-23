import { nanoid } from 'nanoid';

// 1x1 transparent GIF in base64
export const TRANSPARENT_GIF_BASE64 = 'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
export const TRANSPARENT_GIF = Buffer.from(TRANSPARENT_GIF_BASE64, 'base64');

/**
 * Generate a unique tracking ID
 */
export function generateTrackingId(): string {
  return nanoid(24);
}

/**
 * Build tracking URL for click tracking
 */
export function buildClickTrackingUrl(baseUrl: string, trackingId: string): string {
  return `${baseUrl}/t/c/${trackingId}`;
}

/**
 * Build tracking URL for open tracking (1x1 pixel)
 */
export function buildOpenTrackingUrl(baseUrl: string, trackingId: string): string {
  return `${baseUrl}/t/o/${trackingId}`;
}

/**
 * Regex to find all links in HTML content
 * Matches: <a ... href="..." ...>
 */
const LINK_REGEX = /<a\s+([^>]*?)href=["']([^"']+)["']([^>]*)>/gi;

/**
 * Domains to exclude from tracking (e.g., unsubscribe links)
 */
const EXCLUDED_DOMAINS = [
  'unsubscribe',
  'optout',
  'mailto:',
  'tel:',
  '#', // anchor links
];

/**
 * Check if a URL should be excluded from tracking
 */
function shouldExcludeUrl(url: string): boolean {
  const lowerUrl = url.toLowerCase();
  return EXCLUDED_DOMAINS.some(domain => lowerUrl.includes(domain));
}

/**
 * Extract all links from HTML and prepare them for tracking
 * Returns an array of { originalUrl, position } for each link found
 */
export function extractLinksFromHtml(html: string): { originalUrl: string; position: number }[] {
  const links: { originalUrl: string; position: number }[] = [];
  let match;
  
  // Reset regex lastIndex
  LINK_REGEX.lastIndex = 0;
  
  while ((match = LINK_REGEX.exec(html)) !== null) {
    const originalUrl = match[2];
    
    // Skip excluded URLs
    if (shouldExcludeUrl(originalUrl)) {
      continue;
    }
    
    links.push({
      originalUrl,
      position: match.index
    });
  }
  
  return links;
}

/**
 * Interface for link tracking data
 */
export interface LinkTrackingData {
  trackingId: string;
  originalUrl: string;
  trackingUrl: string;
}

/**
 * Replace all links in HTML with tracking URLs
 * 
 * @param html - Original HTML content
 * @param linkMap - Map of original URL to tracking URL
 * @returns Modified HTML with tracking URLs
 */
export function wrapLinksForTracking(
  html: string, 
  linkMap: Map<string, string>
): string {
  return html.replace(LINK_REGEX, (match, before, url, after) => {
    // Skip excluded URLs
    if (shouldExcludeUrl(url)) {
      return match;
    }
    
    const trackingUrl = linkMap.get(url);
    if (trackingUrl) {
      return `<a ${before}href="${trackingUrl}"${after}>`;
    }
    
    return match;
  });
}

/**
 * Inject open tracking pixel before </body> tag
 * 
 * @param html - Original HTML content
 * @param pixelUrl - URL for the tracking pixel
 * @returns Modified HTML with tracking pixel
 */
export function injectOpenTracker(html: string, pixelUrl: string): string {
  // Create tracking pixel HTML
  const trackingPixel = `<img src="${pixelUrl}" width="1" height="1" alt="" style="display:none;width:1px;height:1px;border:0;" />`;
  
  // Try to insert before </body>
  if (html.toLowerCase().includes('</body>')) {
    return html.replace(/<\/body>/i, `${trackingPixel}</body>`);
  }
  
  // If no </body>, append at the end
  return html + trackingPixel;
}

/**
 * Generate tracking data for an email
 * Creates tracking IDs for open tracking and all links
 */
export function generateTrackingData(
  baseUrl: string,
  html: string
): {
  openTrackingId: string;
  openTrackingUrl: string;
  links: LinkTrackingData[];
  linkMap: Map<string, string>;
} {
  // Generate open tracking
  const openTrackingId = generateTrackingId();
  const openTrackingUrl = buildOpenTrackingUrl(baseUrl, openTrackingId);
  
  // Extract and process links
  const extractedLinks = extractLinksFromHtml(html);
  const links: LinkTrackingData[] = [];
  const linkMap = new Map<string, string>();
  
  // Create unique tracking for each unique URL
  const processedUrls = new Set<string>();
  
  for (const link of extractedLinks) {
    if (!processedUrls.has(link.originalUrl)) {
      const trackingId = generateTrackingId();
      const trackingUrl = buildClickTrackingUrl(baseUrl, trackingId);
      
      links.push({
        trackingId,
        originalUrl: link.originalUrl,
        trackingUrl
      });
      
      linkMap.set(link.originalUrl, trackingUrl);
      processedUrls.add(link.originalUrl);
    }
  }
  
  return {
    openTrackingId,
    openTrackingUrl,
    links,
    linkMap
  };
}

/**
 * Apply all tracking to HTML content
 * Returns modified HTML and tracking data for database storage
 */
export function applyEmailTracking(
  baseUrl: string,
  html: string
): {
  modifiedHtml: string;
  openTrackingId: string;
  links: LinkTrackingData[];
} {
  const trackingData = generateTrackingData(baseUrl, html);
  
  // Apply link tracking
  let modifiedHtml = wrapLinksForTracking(html, trackingData.linkMap);
  
  // Apply open tracking
  modifiedHtml = injectOpenTracker(modifiedHtml, trackingData.openTrackingUrl);
  
  return {
    modifiedHtml,
    openTrackingId: trackingData.openTrackingId,
    links: trackingData.links
  };
}
