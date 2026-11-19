// The v0.1 archive ships without offline support: v0.1's cache name ("vesper-v5")
// is shared with the live build, and the two workers would evict each other.
// This worker exists so the live site's service worker does not answer /v1/
// navigations offline with the v0.2 shell. It does nothing else.
