export const addMarketplaceCommand = (repoSlug: string): string => `/plugin marketplace add ${repoSlug}`;

export const installCommand = (plugin: string, marketplaceName: string): string => `/plugin install ${plugin}@${marketplaceName}`;
