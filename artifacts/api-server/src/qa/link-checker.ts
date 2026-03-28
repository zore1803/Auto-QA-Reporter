import type { BrokenLink } from './types.js';

function classifyStatus(statusCode: number, error?: string): string {
  if (error) return 'Timeout/Error';
  if (statusCode >= 200 && statusCode < 300) return 'OK';
  if (statusCode === 301 || statusCode === 302 || statusCode === 307 || statusCode === 308) return 'Redirect';
  if (statusCode === 404) return 'Not Found';
  if (statusCode >= 400 && statusCode < 500) return 'Client Error';
  if (statusCode >= 500) return 'Server Error';
  return 'Unknown';
}

function buildImpactAndRecommendation(
  statusCode: number,
  statusType: string,
  linkUrl: string,
  error?: string
): { impact: string; recommendation: string } {
  if (statusType === 'Not Found') {
    return {
      impact:
        'Users who follow this link land on a 404 error page — a dead end that breaks their journey through the site. Search engines that crawl this link waste their crawl budget and may reduce their trust in the site, lowering SEO rankings for pages that link to it.',
      recommendation:
        `Remove or update the hyperlink pointing to "${linkUrl}". If the target page has moved, replace the URL with the correct destination or set up a 301 redirect from the old URL. Regularly audit outbound links with a link checker.`,
    };
  }

  if (statusType === 'Timeout/Error') {
    const errDetail = error ? ` (${error})` : '';
    return {
      impact:
        `The link "${linkUrl}" could not be reached${errDetail}. Users who click it will see a browser error message, destroying trust and potentially losing them as visitors. If this is an internal link, it may signal a downed server or misconfigured DNS.`,
      recommendation:
        'Verify the URL is correct and the target server is online. Check for DNS resolution failures, firewall rules blocking the destination, or SSL certificate errors. If the resource is permanently gone, remove the link.',
    };
  }

  if (statusCode >= 500) {
    return {
      impact:
        `The server at "${linkUrl}" returned a ${statusCode} (server error). This indicates the target server is experiencing an internal failure. Users are unable to access this resource and may lose confidence in the site.`,
      recommendation:
        'If this is an internal link, investigate the server-side logs for the failing endpoint and fix the underlying error. If it is an external link, check whether the third-party site is experiencing downtime and consider removing or replacing the link until it recovers.',
    };
  }

  if (statusCode >= 400 && statusCode < 500) {
    return {
      impact:
        `The server returned HTTP ${statusCode} for "${linkUrl}". This is a client-side error — the request was understood but refused. Possible causes: authentication required (401), forbidden resource (403), or method not allowed (405).`,
      recommendation:
        `Inspect why the server is rejecting the request. If the link requires authentication, ensure it is only shown to authenticated users. If the resource is forbidden, update the link to an accessible alternative. HTTP ${statusCode} responses from crawled links can also waste crawl budget.`,
    };
  }

  return {
    impact: `Link "${linkUrl}" returned an unexpected status (${statusCode}).`,
    recommendation: 'Manually verify the URL is correct and the server is responding as expected.',
  };
}

export async function checkLinks(
  links: Array<{ sourcePage: string; linkUrl: string }>
): Promise<BrokenLink[]> {
  const brokenLinks: BrokenLink[] = [];
  const checked = new Set<string>();
  const linksByUrl = new Map<string, { sourcePage: string; linkUrl: string }>();

  for (const link of links) {
    if (!checked.has(link.linkUrl)) {
      checked.add(link.linkUrl);
      linksByUrl.set(link.linkUrl, link);
    }
  }

  const uniqueLinks = Array.from(linksByUrl.values()).slice(0, 150); // cap at 150 links max
  const batchSize = 25; // run 25 concurrent checks

  for (let i = 0; i < uniqueLinks.length; i += batchSize) {
    const batch = uniqueLinks.slice(i, i + batchSize);
    await Promise.all(
      batch.map(async ({ sourcePage, linkUrl }) => {
        let statusCode = 0;
        let error: string | undefined;

        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 4000); // reduced from 8s to 4s

          const res = await fetch(linkUrl, {
            method: 'GET',
            signal: controller.signal,
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AutonomousQAInspector/1.0)' },
            redirect: 'follow',
          });

          clearTimeout(timeoutId);
          statusCode = res.status;
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          if (msg.includes('abort')) {
            error = 'Timeout after 8 seconds';
          } else {
            error = msg.substring(0, 200);
          }
          statusCode = 0;
        }

        const statusType = classifyStatus(statusCode, error);

        if (statusCode === 0 || statusCode === 404 || statusCode >= 400) {
          const { impact, recommendation } = buildImpactAndRecommendation(
            statusCode,
            statusType,
            linkUrl,
            error
          );

          brokenLinks.push({
            sourcePage,
            linkUrl,
            statusCode,
            statusType,
            error,
            impact,
            recommendation,
          });
        }
      })
    );
  }

  return brokenLinks;
}
