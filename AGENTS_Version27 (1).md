## What are Apify Actors?

- Actors are serverless cloud programs that can perform anything from a simple action, like filling out a web form, to a complex operation, like crawling an entire website or removing duplicates from a large dataset.
- Actors are programs packaged as Docker images, which accept a well-defined JSON input, perform an action, and optionally produce a well-defined JSON output.

Product Hunt scraper notes
- Product Hunt is JS-heavy and can change its DOM often. Use `useBrowser=true` for better reliability (Playwright).
- For production-scale / stable metadata use, prefer the official Product Hunt API (requires token). Provide token in input if you want an API-based implementation.
- Respect Product Hunt Terms of Service and rate limits. Use proxies, throttle concurrency and avoid overloading Product Hunt.
- Don't harvest private user data; only collect public post metadata.

Next steps I can implement now
- Add Product Hunt API integration (token-based) instead of HTML scraping.
- Improve Playwright flow with robust wait selectors and anti-bot handling (login/captcha fallback).
- Add scheduled runs and diffing (track votes/comments over time).
- Normalize numeric fields (votes/comments → integers) and add deduplication/ID canonicalization.

Which next step would you like me to implement?