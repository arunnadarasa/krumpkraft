/**
 * Story Protocol v4 REST API client for IP asset listing.
 * @see https://docs.story.foundation/api-reference/protocol-v4/list-ip-assets.md
 * Base URL: https://api.storyapis.com/api/v4
 */

const STORY_API_BASE = process.env.STORY_API_BASE ?? 'https://api.storyapis.com/api/v4';

export interface StoryApiConfig {
  apiKey?: string;
  baseUrl?: string;
}

export interface IPAssetSummary {
  ipId: string;
  ownerAddress: string;
  name?: string;
  title?: string;
  tokenContract?: string;
  tokenId?: string;
}

export interface ListIPAssetsResult {
  data: IPAssetSummary[];
  total: number;
  hasMore: boolean;
}

/**
 * Fetch IP assets owned by an address via Story Protocol v4 API.
 * Requires X-Api-Key if the API enforces it.
 */
export async function listIPAssetsByOwner(
  ownerAddress: string,
  config: StoryApiConfig = {}
): Promise<ListIPAssetsResult> {
  const base = config.baseUrl ?? STORY_API_BASE;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (config.apiKey) headers['X-Api-Key'] = config.apiKey;

  const res = await fetch(`${base}/assets`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      where: { ownerAddress },
      pagination: { limit: 100, offset: 0 },
      orderBy: 'blockNumber',
      orderDirection: 'desc',
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Story API error ${res.status}: ${err}`);
  }

  const json = (await res.json()) as {
    data?: Array<{
      ipId?: string;
      ownerAddress?: string;
      name?: string;
      title?: string;
      tokenContract?: string;
      tokenId?: string;
    }>;
    pagination?: { total?: number; hasMore?: boolean };
  };

  const data = (json.data ?? []).map((a) => ({
    ipId: a.ipId ?? '',
    ownerAddress: a.ownerAddress ?? ownerAddress,
    name: a.name,
    title: a.title,
    tokenContract: a.tokenContract,
    tokenId: a.tokenId,
  }));

  return {
    data,
    total: json.pagination?.total ?? data.length,
    hasMore: json.pagination?.hasMore ?? false,
  };
}
