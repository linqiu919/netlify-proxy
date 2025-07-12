// netlify/edge-functions/proxy-handler.ts
import type { Context } from "@netlify/edge-functions";

// --- New Proxy Configuration ---
// Dynamically create the PROXY_CONFIG from the desired proxy list.
const augmentCodeProxies: Record<string, string> = {
    d1: "d1.api.augmentcode.com",
    d2: "d2.api.augmentcode.com",
    d3: "d3.api.augmentcode.com",
    d4: "d4.api.augmentcode.com",
    d5: "d5.api.augmentcode.com",
    d6: "d6.api.augmentcode.com",
    d7: "d7.api.augmentcode.com",
    d8: "d8.api.augmentcode.com",
    d9: "d9.api.augmentcode.com",
    d10: "d10.api.augmentcode.com",
    d11: "d11.api.augmentcode.com",
    d12: "d12.api.augmentcode.com",
    d13: "d13.api.augmentcode.com",
    d14: "d14.api.augmentcode.com",
    d15: "d15.api.augmentcode.com",
    d16: "d16.api.augmentcode.com",
    d17: "d17.api.augmentcode.com",
    d18: "d18.api.augmentcode.com",
    d19: "d19.api.augmentcode.com",
    d20: "d20.api.augmentcode.com",
    i1: "i1.api.augmentcode.com",
    i2: "i2.api.augmentcode.com",
    i3: "i3.api.augmentcode.com",
    i4: "i4.api.augmentcode.com",
    i5: "i5.api.augmentcode.com",
    i6: "i6.api.augmentcode.com",
    i7: "i7.api.augmentcode.com",
    i8: "i8.api.augmentcode.com",
    i9: "i9.api.augmentcode.com",
    i10: "i10.api.augmentcode.com",
};

const PROXY_CONFIG: Record<string, string> = {};
for (const key in augmentCodeProxies) {
    // The key will be `/d1`, `/i1`, etc.
    // The value will be `https://d1.api.augmentcode.com`, etc.
    PROXY_CONFIG[`/${key}`] = `https://${augmentCodeProxies[key]}`;
}

// The complex content-type arrays and SPECIAL_REPLACEMENTS are no longer needed for this simple API proxy.

export default async (request: Request, context: Context) => {
  // Handle CORS pre-flight requests (OPTIONS) - This is good practice to keep.
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, PATCH, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With, Accept, Origin, Range",
        "Access-Control-Max-Age": "86400", // 24 hours
      }
    });
  }

  const url = new URL(request.url);
  const path = url.pathname;

  // Find the matching proxy configuration.
  let targetBaseUrl: string | null = null;
  let matchedPrefix: string | null = null;

  // Sorting keys by length descending ensures that more specific paths are matched first.
  const prefixes = Object.keys(PROXY_CONFIG).sort((a, b) => b.length - a.length);

  for (const prefix of prefixes) {
    if (path === prefix || path.startsWith(prefix + '/')) {
      targetBaseUrl = PROXY_CONFIG[prefix];
      matchedPrefix = prefix;
      break; // Found the most specific match
    }
  }

  // If a matching rule was found
  if (targetBaseUrl && matchedPrefix) {
    // Construct the target URL
    const remainingPath = path.substring(matchedPrefix.length);
    const targetUrlString = targetBaseUrl.replace(/\/$/, '') + remainingPath;
    const targetUrl = new URL(targetUrlString);

    // Append original query parameters
    targetUrl.search = url.search;

    context.log(`Proxying "${path}" to "${targetUrl.toString()}"`);

    try {
      // Create a new request object to forward to the target.
      const proxyRequest = new Request(targetUrl.toString(), {
        method: request.method,
        headers: request.headers,
        body: request.body,
        redirect: 'manual', // We will handle redirects manually.
      });

      // Set the Host header to match the target, which is crucial for many APIs.
      proxyRequest.headers.set("Host", targetUrl.host);

      // Forward client IP information, which is good practice for proxies.
      const clientIp = context.ip || request.headers.get('x-nf-client-connection-ip') || "";
      proxyRequest.headers.set('X-Forwarded-For', clientIp);
      proxyRequest.headers.set('X-Forwarded-Host', url.host);
      proxyRequest.headers.set('X-Forwarded-Proto', url.protocol.replace(':', ''));

      // Make the actual request to the target server.
      const response = await fetch(proxyRequest);

      // Create a new response to send back to the client.
      // This allows us to modify headers (like adding CORS).
      const newResponse = new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers
      });

      // Add universal CORS headers to the response.
      newResponse.headers.set('Access-Control-Allow-Origin', '*');
      newResponse.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
      newResponse.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin, Range');

      // Remove security headers that might block the response in a browser.
      newResponse.headers.delete('Content-Security-Policy');
      newResponse.headers.delete('X-Frame-Options');

      // If the target server returned a redirect, we need to rewrite the Location header.
      if (response.status >= 300 && response.status < 400 && response.headers.has('location')) {
          const location = response.headers.get('location')!;
          const redirectedUrl = new URL(location, targetUrl); // Resolve relative or absolute Location

          // If the redirect is to the same target domain, rewrite it to use our proxy.
          if (redirectedUrl.origin === targetUrl.origin) {
              const newLocation = url.origin + matchedPrefix + redirectedUrl.pathname + redirectedUrl.search;
              context.log(`Rewriting redirect from "${location}" to "${newLocation}"`);
              newResponse.headers.set('Location', newLocation);
          } else {
              // If redirecting to an entirely different domain, let it pass through.
              context.log(`Passing through external redirect to "${location}"`);
              newResponse.headers.set('Location', location);
          }
      }
      
      return newResponse;

    } catch (error) {
      context.log("Error fetching target URL:", error);
      return new Response("Proxy request failed.", {
        status: 502, // Bad Gateway
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'text/plain;charset=UTF-8'
        }
      });
    }
  }

  // If no matching proxy rule is found, return a default welcome or error message.
  if (path === "/") {
     return new Response("Welcome to the AI Proxy service.");
  }
  
  return new Response("Proxy target not configured for this path.", { 
      status: 404,
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' }
  });
};
