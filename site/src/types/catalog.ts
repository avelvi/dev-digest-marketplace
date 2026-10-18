export const SCHEMA_VERSION = 1 as const;

export type ArtifactType = 'plugin' | 'skill' | 'agent' | 'command' | 'hook' | 'mcp-server';
export type ChildType = Exclude<ArtifactType, 'plugin'>;

export const TYPE_ORDER: readonly ArtifactType[] = ['plugin', 'skill', 'agent', 'command', 'hook', 'mcp-server'];

export const TYPE_LABEL: Record<ArtifactType, string> = {
  plugin: 'Plugin',
  skill: 'Skill',
  agent: 'Agent',
  command: 'Command',
  hook: 'Hook',
  'mcp-server': 'MCP server',
};

export interface MarketplaceInfo {
  name: string;
  description: string;
  ownerName: string;
  /** "owner/repo", used in the `marketplace add` command */
  repoSlug: string;
  /** https://github.com/owner/repo */
  repoUrl: string;
  defaultBranch: string;
}

export interface PluginDetails {
  counts: Partial<Record<ChildType, number>>;
  dependencies: string[];
  /** Printable file tree; absent for external plugins */
  tree?: string;
  /** True when the plugin source is not readable at build time (github, git-subdir, npm, ...) */
  external?: boolean;
  /** Human readable source, only for external plugins, e.g. "github: acme/tool" */
  source?: string;
  /** Link to the source repository, only for external plugins when it can be derived */
  sourceUrl?: string;
}

/** Frontmatter fields of a skill, agent or command, stringified */
export type FrontmatterDetails = Record<string, string>;

export interface HookDetails {
  event: string;
  matcher: string;
  hookType: string;
  command: string;
}

export interface McpServerDetails {
  server: string;
  transport: string;
  command?: string;
  url?: string;
  /** Names only; values are never published */
  env: string[];
}

interface ArtifactBase {
  /** "<plugin>" or "<plugin>/<type>/<name>"; unique */
  id: string;
  name: string;
  /** Owning plugin name */
  plugin: string;
  description: string;
  keywords: string[];
  category?: string;
  version?: string;
  author?: string;
  license?: string;
  /** Repo-relative path for the "View source" link */
  sourcePath: string;
  /** True when sourcePath is a directory (GitHub "tree" link instead of "blob") */
  isDir?: boolean;
  /** Frontmatter stripped, relative links rewritten to absolute GitHub URLs */
  bodyMarkdown: string;
}

export type Artifact =
  | (ArtifactBase & { type: 'plugin'; details: PluginDetails })
  | (ArtifactBase & { type: 'skill'; details: FrontmatterDetails })
  | (ArtifactBase & { type: 'agent'; details: FrontmatterDetails })
  | (ArtifactBase & { type: 'command'; details: FrontmatterDetails })
  | (ArtifactBase & { type: 'hook'; details: HookDetails })
  | (ArtifactBase & { type: 'mcp-server'; details: McpServerDetails });

export interface Catalog {
  schemaVersion: typeof SCHEMA_VERSION;
  /** ISO 8601 */
  generatedAt: string;
  marketplace: MarketplaceInfo;
  /** Shown in the install panel; hidden when empty */
  installNote: string;
  /** Names of the plugins that are in the catalog */
  plugins: string[];
  /** Flat list including one 'plugin' artifact per plugin */
  artifacts: Artifact[];
}
