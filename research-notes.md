# REVRSE EDITOR Research Notes

## Movie discovery source

The Movie Dialogue Workspace uses the [Apple iTunes Search API](https://developer.apple.com/library/archive/documentation/AudioVideo/Conceptual/iTuneSearchAPI/Searching.html) only for factual movie discovery. Apple documents a `search` endpoint with a URL-encoded `term`, `country`, and `media=movie`, returning JSON metadata and store links. The service is rate-limited to approximately 20 requests per minute, so the server procedure limits results and the interface does not download, proxy, re-host, or extract movie files or dialogue.
